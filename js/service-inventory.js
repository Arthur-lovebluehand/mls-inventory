// ══════════════════════════════
// service-inventory.js
// ══════════════════════════════

async function svcInventory() {
  const { data } = await sb.from('service_inventory')
    .select('*, products(name,spec,service_unit,service_units_per_stock)')
    .order('product_no');

  $('svc-content').innerHTML = `
  <div style="margin-bottom:12px;display:flex;justify-content:flex-end">
    <button class="btn btn-p btn-s" onclick="svcNewTransfer()">＋ 撥轉商品到服務庫存</button>
  </div>
  <div class="tc"><div class="tb"><span class="tt">服務庫存</span></div>
  <div class="tw"><table style="width:100%">
    <tr><th>商品</th><th>規格</th><th style="text-align:center">庫存（服務單位）</th><th style="text-align:center">換算（銷售單位）</th></tr>
    ${(data||[]).map(i=>{
      const p=i.products;
      const salesQty = i.stock_qty / (p?.service_units_per_stock||1);
      return `<tr>
        <td style="font-weight:500">${p?.name||i.product_no}</td>
        <td>${p?.spec||'—'}</td>
        <td style="text-align:center;font-weight:700;color:${i.stock_qty>0?'var(--ac)':'var(--rd)'}">
          ${i.stock_qty} ${p?.service_unit||'次'}
        </td>
        <td style="text-align:center;font-size:12px;color:var(--tx3)">≈ ${salesQty.toFixed(2)} 盒/瓶</td>
      </tr>`;
    }).join('')||'<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--tx3)">尚無服務庫存，請先撥轉商品</td></tr>'}
  </table></div></div>`;
}

window.svcInventory    = svcInventory;
async function svcTransfers() {
  const { data } = await sb.from('service_transfers')
    .select('*').order('transfer_date',{ascending:false}).limit(50);

  $('svc-content').innerHTML = `
  <div style="margin-bottom:12px;display:flex;justify-content:flex-end">
    <button class="btn btn-p btn-s" onclick="svcNewTransfer()">＋ 新增撥轉</button>
  </div>
  <div class="tc"><div class="tb"><span class="tt">撥轉記錄</span></div>
  <div class="tw"><table style="width:100%">
    <tr><th>日期</th><th>商品</th><th style="text-align:center">撥轉數量</th><th style="text-align:center">換算服務單位</th><th>備註</th></tr>
    ${(data||[]).map(t=>`<tr>
      <td>${t.transfer_date}</td>
      <td style="font-weight:500">${t.product_name||t.product_no}</td>
      <td style="text-align:center">${t.qty_stock} 盒/瓶</td>
      <td style="text-align:center;color:var(--ac)">${t.qty_service} 次/組</td>
      <td style="font-size:12px;color:var(--tx3)">${t.note||''}</td>
    </tr>`).join('')||'<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--tx3)">尚無記錄</td></tr>'}
  </table></div></div>`;
}

window.svcTransfers    = svcTransfers;
async function svcNewTransfer() {
  // 抓有服務設定的銷售庫存商品
  const { data:prods } = await sb.from('products')
    .select('product_no,name,spec,stock,service_unit,service_units_per_stock')
    .eq('is_active',true)
    .not('service_unit','is',null)
    .gt('stock',0);

  const today2 = new Date().toISOString().split('T')[0];
  const opts = (prods||[]).map(p=>
    `<option value="${p.product_no}" data-stock="${p.stock}"
      data-units="${p.service_units_per_stock||1}" data-unit="${p.service_unit||'次'}">
      ${p.name}${p.spec?` (${p.spec})`:''} — 庫存 ${p.stock}</option>`).join('');

  if(!opts){ toast('沒有設定服務單位的商品，請先在商品編輯頁設定服務單位','w'); return; }

  OM('撥轉商品到服務庫存',`
  <div class="al al-w" style="font-size:12px;margin-bottom:12px">
    整盒/瓶撥轉，銷售庫存會減少，服務庫存會增加。
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
    ${fi('tr-date','撥轉日期','date',today2)}
    <div class="fl"><label>商品</label>
      <select id="f-tr-prod" onchange="svcTransferCalc(this)"
        style="width:100%;padding:7px 8px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;background:var(--sf)">
        <option value="">— 選擇商品 —</option>${opts}
      </select>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
    ${fi('tr-qty','撥轉數量（盒/瓶）','number','1')}
    <div class="fl"><label>換算結果</label>
      <div id="tr-calc" style="padding:8px;background:var(--acl);border-radius:var(--r);font-size:13px;min-height:36px">
        請先選擇商品
      </div>
    </div>
  </div>
  ${fi('tr-note','備註')}`,
  `<button class="btn" onclick="CM()">取消</button>
   <button class="btn btn-p" onclick="saveTransfer()">確認撥轉</button>`);
}

window.svcNewTransfer  = svcNewTransfer;
function svcTransferCalc(sel) {
  const opt = sel.options[sel.selectedIndex];
  if(!opt.value) return;
  const units = parseFloat(opt.dataset.units)||1;
  const unit = opt.dataset.unit||'次';
  const qty = parseFloat($('f-tr-qty')?.value||1);
  const result = qty * units;
  $('tr-calc').innerHTML = `${qty} 盒/瓶 × ${units} = <b>${result} ${unit}</b>`;
}

window.svcTransferCalc = svcTransferCalc;
async function saveTransfer() {
  const date = v('tr-date');
  const prodSel = document.getElementById('f-tr-prod');
  const opt = prodSel?.options[prodSel.selectedIndex];
  const pno = opt?.value;
  const qty = parseFloat(v('tr-qty'))||0;
  const note = v('tr-note');

  if(!date||!pno||qty<=0){ toast('請填寫日期、商品和數量','e'); return; }

  const units = parseFloat(opt.dataset.units)||1;
  const unit = opt.dataset.unit||'次';
  const stockQty = parseFloat(opt.dataset.stock)||0;
  if(qty>stockQty){ toast(`庫存不足（現有 ${stockQty} 盒/瓶）`,'e'); return; }

  const svcQty = qty * units;
  const trNo = 'TR-'+date.replace(/-/g,'')+'-'+Date.now().toString().slice(-4);

  // 1. 建撥轉記錄
  // 計算撥轉成本（進貨成本 × 撥轉數量 = 服務支出）
  const { data:costData } = await sb.from('products').select('cost').eq('product_no',pno).single();
  const unitCost = costData?.cost||0;
  const totalCost = unitCost * qty;
  await sb.from('service_transfers').insert({
    transfer_no:trNo, transfer_date:date, product_no:pno,
    product_name:opt.text.split('—')[0].trim(),
    qty_stock:qty, qty_service:svcQty,
    unit_cost:unitCost, total_cost:totalCost,
    note:note||null
  });

  // 2. 減銷售庫存
  const { data:prod } = await sb.from('products').select('stock').eq('product_no',pno).single();
  await sb.from('products').update({stock:(prod?.stock||0)-qty}).eq('product_no',pno);

  // 3. 加服務庫存
  const { data:inv } = await sb.from('service_inventory').select('stock_qty').eq('product_no',pno).single();
  if(inv) {
    await sb.from('service_inventory').update({
      stock_qty:(inv.stock_qty||0)+svcQty, updated_at:new Date().toISOString()
    }).eq('product_no',pno);
  } else {
    await sb.from('service_inventory').insert({product_no:pno, stock_qty:svcQty});
  }

  await logAction('transfer','service_inventory',pno,`撥轉 ${pno} ${qty}盒/瓶 → 服務庫存 ${svcQty}${unit}`,null,null);
  toast(`✅ 撥轉成功：${svcQty} ${unit} 加入服務庫存`);
  CM();
  svcInventory();
}

window.saveTransfer    = saveTransfer;

// ══════════════════════════════
// 服務專屬耗材（不進商品清單，例如刮鬍刀、紙褲、不織布等拋棄式耗材）
// ══════════════════════════════
async function svcConsumables() {
  const { data } = await sb.from('service_consumables')
    .select('*').order('is_active',{ascending:false}).order('name');

  $('svc-content').innerHTML = `
  <div style="margin-bottom:12px;display:flex;justify-content:flex-end;gap:8px">
    <button class="btn btn-p btn-s" onclick="svcNewConsumable()">＋ 新增服務耗材</button>
  </div>
  <div class="al al-w" style="font-size:12px;margin-bottom:12px">
    這裡是「服務專屬」拋棄式耗材（不會出現在商品／銷售清單），例如刮鬍刀、紙褲、不織布。加入服務單時會自動扣庫存、算成本。
  </div>
  <div class="tc"><div class="tb"><span class="tt">服務耗材清單</span></div>
  <div class="tw"><table style="width:100%">
    <tr><th>編號</th><th>名稱</th><th>規格</th><th>單位</th><th>單位成本</th><th style="text-align:center">目前庫存</th><th>備註</th><th>操作</th></tr>
    ${(data||[]).map(c=>`<tr style="${c.is_active===false?'opacity:.5':''}">
      <td style="font-size:12px;color:var(--tx3)">${c.item_no}</td>
      <td style="font-weight:500">${c.name}</td>
      <td>${c.spec||'—'}</td>
      <td>${c.unit}</td>
      <td class="num">${fM(c.cost)}</td>
      <td style="text-align:center;font-weight:700;color:${c.stock_qty>0?'var(--ac)':'var(--rd)'}">${c.stock_qty} ${c.unit}</td>
      <td style="font-size:12px;color:var(--tx3)">${c.note||''}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-s" onclick="svcRestockConsumable(${c.id})">補貨</button>
        <button class="btn btn-s" onclick="svcEditConsumable(${c.id})">編輯</button>
        <button class="btn btn-s" onclick="toggleConsumableActive(${c.id},${c.is_active===false})">${c.is_active===false?'啟用':'停用'}</button>
      </td>
    </tr>`).join('')||'<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--tx3)">尚無服務耗材，請先新增</td></tr>'}
  </table></div></div>`;
}

window.svcConsumables  = svcConsumables;
function svcNewConsumable() {
  OM('新增服務耗材', `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
    ${fi('sc-name','名稱 *','text','')}
    ${fi('sc-spec','規格','text','')}
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px">
    ${fi('sc-unit','單位（如：個、片、包）','text','個')}
    ${fi('sc-cost','單位成本','number','0')}
    ${fi('sc-stock','初始庫存','number','0')}
  </div>
  ${fi('sc-note','備註（選填）')}`,
  `<button class="btn" onclick="CM()">取消</button>
   <button class="btn btn-p" onclick="saveConsumable()">建立</button>`);
}

window.svcNewConsumable = svcNewConsumable;
async function saveConsumable() {
  const name = v('sc-name');
  if(!name){ toast('請填寫名稱','e'); return; }
  const spec = v('sc-spec');
  const unit = v('sc-unit')||'個';
  const cost = parseFloat(v('sc-cost'))||0;
  const stock = parseFloat(v('sc-stock'))||0;
  const note = v('sc-note');
  const itemNo = 'SC-'+new Date().toISOString().split('T')[0].replace(/-/g,'')+'-'+Date.now().toString().slice(-4);

  const { error } = await sb.from('service_consumables').insert({
    item_no:itemNo, name, spec:spec||null, unit, cost, stock_qty:stock, note:note||null
  });
  if(error){ toast('建立失敗：'+error.message,'e'); return; }

  if(stock>0) {
    const { data:sc } = await sb.from('service_consumables').select('id').eq('item_no',itemNo).single();
    await sb.from('service_consumable_restocks').insert({
      restock_no:'SCR-'+itemNo, restock_date:new Date().toISOString().split('T')[0],
      consumable_id:sc?.id, item_name:name, qty:stock, unit_cost:cost, total_cost:cost*stock, note:'初始建檔庫存'
    });
  }
  await logAction('create','service_consumables',itemNo,`新增服務耗材 ${name}`,null,null);
  toast('✅ 服務耗材已建立');
  CM();
  svcConsumables();
}

window.saveConsumable   = saveConsumable;
async function svcEditConsumable(id) {
  const { data:c } = await sb.from('service_consumables').select('*').eq('id',id).single();
  if(!c){ toast('找不到耗材','e'); return; }
  OM('編輯服務耗材', `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
    ${fi('sc-name','名稱 *','text',c.name)}
    ${fi('sc-spec','規格','text',c.spec)}
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
    ${fi('sc-unit','單位','text',c.unit)}
    ${fi('sc-cost','單位成本','number',c.cost)}
  </div>
  <div class="al al-w" style="font-size:12px;margin-bottom:10px">目前庫存 ${c.stock_qty} ${c.unit}，如需增加庫存請用「補貨」功能（會留下成本記錄）。</div>
  ${fi('sc-note','備註（選填）','text',c.note)}`,
  `<button class="btn" onclick="CM()">取消</button>
   <button class="btn btn-p" onclick="updateConsumable(${id})">儲存</button>`);
}

window.svcEditConsumable = svcEditConsumable;
async function updateConsumable(id) {
  const name = v('sc-name');
  if(!name){ toast('請填寫名稱','e'); return; }
  const { error } = await sb.from('service_consumables').update({
    name, spec:v('sc-spec')||null, unit:v('sc-unit')||'個',
    cost:parseFloat(v('sc-cost'))||0, note:v('sc-note')||null,
    updated_at:new Date().toISOString()
  }).eq('id',id);
  if(error){ toast('更新失敗：'+error.message,'e'); return; }
  toast('✅ 已更新');
  CM();
  svcConsumables();
}

window.updateConsumable = updateConsumable;
async function toggleConsumableActive(id, makeActive) {
  await sb.from('service_consumables').update({is_active:makeActive}).eq('id',id);
  toast(makeActive?'✅ 已啟用':'✅ 已停用');
  svcConsumables();
}

window.toggleConsumableActive = toggleConsumableActive;
async function svcRestockConsumable(id) {
  const { data:c } = await sb.from('service_consumables').select('*').eq('id',id).single();
  if(!c){ toast('找不到耗材','e'); return; }
  const today2 = new Date().toISOString().split('T')[0];
  OM(`補貨：${c.name}`, `
  <div class="al al-w" style="font-size:12px;margin-bottom:12px">目前庫存 ${c.stock_qty} ${c.unit}，單位成本 ${fM(c.cost)}</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
    ${fi('scr-date','補貨日期','date',today2)}
    ${fi('scr-qty','補貨數量','number','1')}
  </div>
  <div style="display:grid;grid-template-columns:1fr;gap:10px;margin-bottom:10px">
    ${fi('scr-cost','本次單位成本（會更新為最新成本）','number',c.cost)}
  </div>
  ${fi('scr-note','備註（選填）')}`,
  `<button class="btn" onclick="CM()">取消</button>
   <button class="btn btn-p" onclick="saveConsumableRestock(${id})">確認補貨</button>`);
}

window.svcRestockConsumable = svcRestockConsumable;
async function saveConsumableRestock(id) {
  const date = v('scr-date');
  const qty = parseFloat(v('scr-qty'))||0;
  const unitCost = parseFloat(v('scr-cost'))||0;
  const note = v('scr-note');
  if(!date||qty<=0){ toast('請填寫日期與數量','e'); return; }

  const { data:c } = await sb.from('service_consumables').select('*').eq('id',id).single();
  if(!c){ toast('找不到耗材','e'); return; }

  const restockNo = 'SCR-'+date.replace(/-/g,'')+'-'+Date.now().toString().slice(-4);
  await sb.from('service_consumable_restocks').insert({
    restock_no:restockNo, restock_date:date, consumable_id:id, item_name:c.name,
    qty, unit_cost:unitCost, total_cost:unitCost*qty, note:note||null
  });
  await sb.from('service_consumables').update({
    stock_qty:(c.stock_qty||0)+qty, cost:unitCost, updated_at:new Date().toISOString()
  }).eq('id',id);

  await logAction('restock','service_consumables',c.item_no,`服務耗材 ${c.name} 補貨 ${qty}${c.unit}`,null,null);
  toast('✅ 補貨成功');
  CM();
  svcConsumables();
}

window.saveConsumableRestock = saveConsumableRestock;