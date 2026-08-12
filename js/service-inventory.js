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
    <tr><th>商品</th><th>規格</th><th>庫存（服務單位）</th><th>換算（銷售單位）</th></tr>
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
    <tr><th>日期</th><th>商品</th><th>撥轉數量</th><th>換算服務單位</th><th>備註</th></tr>
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
