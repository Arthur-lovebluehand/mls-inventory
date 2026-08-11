// ══════════════════════════════════════════════
//  service.js — 服務模組
//  服務庫存 / 撥轉 / 服務訂單 / 儲值帳戶
// ══════════════════════════════════════════════

// ── 側欄分頁 ──
var svcTab = 'orders'; // orders | inventory | transfer | credits | items

function serviceHub() {
  const tabs = [
    { id:'orders',    label:'服務訂單' },
    { id:'inventory', label:'服務庫存' },
    { id:'transfer',  label:'撥轉記錄' },
    { id:'credits',   label:'儲值管理' },
    { id:'items',     label:'服務項目' },
    { id:'technicians', label:'技師管理' },
  ];
  $('main').innerHTML = `
  <div class="ph">
    <div><div class="pt">服務管理</div></div>
    <div class="ha"><button class="btn btn-p btn-s" onclick="svcNewOrder()">＋ 新增服務單</button></div>
  </div>
  <div class="tab-bar" style="padding:0 16px 10px;overflow-x:auto">
    ${tabs.map(t=>`<div class="tab${svcTab===t.id?' on':''}" onclick="svcTab='${t.id}';serviceHub()"
      style="white-space:nowrap">${t.label}</div>`).join('')}
  </div>
  <div class="pc" id="svc-content">載入中…</div>`;
  if(svcTab==='orders')    svcOrders();
  if(svcTab==='inventory') svcInventory();
  if(svcTab==='transfer')  svcTransfers();
  if(svcTab==='credits')   svcCredits();
  if(svcTab==='items')       svcItems();
  if(svcTab==='technicians') svcTechnicians();
}

// ════════════════════════
//  1. 服務訂單
// ════════════════════════
var svcOrderPage = 1;

async function svcOrders() {
  const { data, count } = await sb.from('service_orders')
    .select('*', { count:'exact' })
    .order('order_date', { ascending:false })
    .order('order_no', { ascending:false })
    .range((svcOrderPage-1)*25, svcOrderPage*25-1);

  const tp = Math.max(1, Math.ceil((count||0)/25));
  $('svc-content').innerHTML = `
  <div class="tc">
    <div class="tw"><table style="width:100%">
      <tr><th>訂單號</th><th>日期</th><th>客戶</th><th>金額</th><th>付款</th><th>操作</th></tr>
      ${(data||[]).map(o=>`<tr>
        <td style="font-size:12px;color:var(--ac)">${o.order_no}</td>
        <td>${o.order_date||''}</td>
        <td>${o.customer_name||'—'}</td>
        <td class="num">${fM(o.total)}</td>
        <td><span style="font-size:11px">${o.payment_method||''}</span></td>
        <td><button class="btn btn-s" onclick="svcShowOrder('${o.order_no}')">明細</button></td>
      </tr>`).join('')||'<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--tx3)">尚無記錄</td></tr>'}
    </table></div>
  </div>
  <div class="pg"><span class="pi">第 ${svcOrderPage}/${tp} 頁，共 ${count||0} 筆</span>
    ${svcOrderPage>1?`<button class="btn btn-s" onclick="svcOrderPage--;svcOrders()">上一頁</button>`:''}
    ${svcOrderPage<tp?`<button class="btn btn-s" onclick="svcOrderPage++;svcOrders()">下一頁</button>`:''}
  </div>`;
}

async function svcShowOrder(no) {
  const [{ data:o },{ data:its }] = await Promise.all([
    sb.from('service_orders').select('*').eq('order_no',no).single(),
    sb.from('service_order_items').select('*').eq('order_no',no),
  ]);
  if(!o){ toast('找不到訂單','e'); return; }
  const services = (its||[]).filter(i=>i.item_type==='service');
  const consumables = (its||[]).filter(i=>i.item_type==='consumable');

  OM(`服務單：${no}`,`
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;font-size:13px">
    <div><span style="color:var(--tx3)">日期：</span>${o.order_date||''}</div>
    <div><span style="color:var(--tx3)">客戶：</span>${o.customer_name||'—'}</div>
    <div><span style="color:var(--tx3)">付款：</span>${o.payment_method||''}</div>
    <div><span style="color:var(--tx3)">儲值扣：</span>${fM(o.paid_by_credit)}</div>
  </div>
  ${services.length?`<div style="font-weight:600;margin-bottom:6px;font-size:13px">服務項目</div>
  <div class="tc" style="margin-bottom:12px"><div class="tw"><table style="width:100%">
    <tr><th>項目</th><th>數量</th><th>單價</th><th>小計</th></tr>
    ${services.map(i=>`<tr><td>${i.item_name}</td><td>${i.qty}${i.unit||''}</td>
      <td class="num">${fM(i.unit_price)}</td><td class="num">${fM(i.subtotal)}</td></tr>`).join('')}
  </table></div></div>`:''}
  ${consumables.length?`<div style="font-weight:600;margin-bottom:6px;font-size:13px">耗材</div>
  <div class="tc" style="margin-bottom:12px"><div class="tw"><table style="width:100%">
    <tr><th>商品</th><th>用量</th><th>服務費</th><th>耗材成本</th></tr>
    ${consumables.map(i=>`<tr><td>${i.item_name}</td><td>${i.qty}${i.unit||''}</td>
      <td class="num">${fM(i.unit_price)}</td><td class="num" style="color:var(--rd)">${fM(i.cost)}</td></tr>`).join('')}
  </table></div></div>`:''}
  <div style="text-align:right;font-size:15px;font-weight:700;border-top:1px solid var(--bd);padding-top:10px">
    服務收入：${fM(o.total)}
  </div>
  ${o.note?`<div style="font-size:12px;color:var(--tx3);margin-top:8px">備註：${o.note}</div>`:''}`,
  `<button class="btn" onclick="CM()">關閉</button>
   <button class="btn btn-r" onclick="deleteSvcOrder('${no}')">刪除</button>`);
}

async function svcNewOrder() {
  // 抓服務項目、服務庫存商品、客戶
  const [{ data:sitems },{ data:sinv },{ data:custs },{ data:techs }] = await Promise.all([
    sb.from('service_items').select('*').eq('is_active',true).order('sort_order'),
    sb.from('service_inventory').select('*, products(name,service_unit,default_service_qty,cost)').gt('stock_qty',0),
    sb.from('customers').select('customer_no,name').order('name').limit(200),
    sb.from('technicians').select('*').eq('is_active',true).order('name'),
  ]);
  const techOpts = (techs||[]).map(t=>`<option value="${t.id}" data-rate="${t.commission_rate}" data-name="${t.name}">${t.name}（抽成 ${Math.round(t.commission_rate*100)}%）</option>`).join('');

  const today2 = new Date().toISOString().split('T')[0];
  const orderNo = 'SV-'+today2.replace(/-/g,'')+'-001';

  window._svcItems = []; // 服務訂單品項暫存

  const custOpts = (custs||[]).map(c=>`<option value="${c.customer_no}">${c.name}</option>`).join('');
  const catGroups = {};
  (sitems||[]).forEach(s=>{ const c=s.category||'其他項目'; if(!catGroups[c]) catGroups[c]=[]; catGroups[c].push(s); });
  const svcOpts = Object.entries(catGroups).map(([cat,items])=>
    `<optgroup label="${cat}">${items.map(s=>`<option value="${s.id}" data-price="${s.default_price}" data-unit="${s.unit||'次'}">${s.name}（${fM(s.default_price)}/${s.unit||'次'}）</option>`).join('')}</optgroup>`
  ).join('');
  const prodOpts = (sinv||[]).map(p=>{
    const prod = p.products;
    return `<option value="${p.product_no}" data-unit="${prod?.service_unit||'次'}" data-qty="${prod?.default_service_qty||1}" data-cost="${prod?.cost||0}">${prod?.name||p.product_no}（庫存 ${p.stock_qty} ${prod?.service_unit||'次'}）</option>`;
  }).join('');

  OM('新增服務單', `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
    ${fi('sv-no','服務單號','text',orderNo)}
    ${fi('sv-date','日期','date',today2)}
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
    <div class="fl"><label>選擇客戶</label>
      <select id="f-sv-cust" onchange="svcPickCust(this)" style="width:100%;padding:7px 8px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;background:var(--sf)">
        <option value="">— 選擇客戶 —</option>${custOpts}
      </select>
    </div>
    ${fi('sv-cname','客戶姓名 *')}
  </div>
  <div style="margin-bottom:14px;padding:12px;background:var(--sf2);border-radius:var(--r)">
    <div style="font-weight:600;margin-bottom:8px;font-size:13px">加入服務項目（人工）</div>
    <div style="display:grid;grid-template-columns:1fr auto auto auto;gap:6px;align-items:end">
      <select id="sv-sitem" onchange="svcItemChange(this)" style="padding:6px 8px;border:1px solid var(--bd);border-radius:var(--r);font-size:12px">
        <option value="">— 選服務項目 —</option>${svcOpts}
      </select>
      <input type="number" id="sv-siqty" value="1" min="1" step="1" placeholder="數量"
        style="width:60px;padding:6px;border:1px solid var(--bd);border-radius:var(--r);font-size:12px">
      <input type="number" id="sv-siprice" value="" placeholder="單價"
        style="width:80px;padding:6px;border:1px solid var(--bd);border-radius:var(--r);font-size:12px">
      <select id="sv-tech" style="padding:6px 8px;border:1px solid var(--bd);border-radius:var(--r);font-size:12px">
        <option value="">— 技師 —</option>${techOpts}
      </select>
      <button class="btn btn-s" onclick="svcAddServiceItem()">＋ 加入</button>
    </div>
    <div style="font-size:11px;color:var(--tx3);margin-top:4px">可在單價欄位覆蓋預設價格</div>
  </div>
  <div style="margin-bottom:14px;padding:12px;background:var(--sf2);border-radius:var(--r)">
    <div style="font-weight:600;margin-bottom:8px;font-size:13px">加入耗材（服務庫存）</div>
    <div style="display:grid;grid-template-columns:1fr auto auto auto;gap:6px;align-items:end">
      <select id="sv-prod" style="padding:6px 8px;border:1px solid var(--bd);border-radius:var(--r);font-size:12px">
        <option value="">— 選耗材 —</option>${prodOpts}
      </select>
      <input type="number" id="sv-prodqty" value="1" min="0.5" step="0.5" placeholder="用量"
        style="width:60px;padding:6px;border:1px solid var(--bd);border-radius:var(--r);font-size:12px">
      <input type="number" id="sv-prodprice" value="0" placeholder="服務費"
        style="width:80px;padding:6px;border:1px solid var(--bd);border-radius:var(--r);font-size:12px">
      <button class="btn btn-s" onclick="svcAddConsumable()">＋ 加入</button>
    </div>
  </div>
  <div id="sv-items-area" style="margin-bottom:14px"></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
    ${fs('sv-pay','付款方式',['現金','銀行轉帳','LINE Pay','儲值扣款','現金+儲值'],'現金')}
    ${fi('sv-note','備註')}
  </div>`,
  `<button class="btn" onclick="CM()">取消</button>
   <button class="btn btn-p" onclick="saveSvcOrder()">建立服務單</button>`,true);
}

function svcPickCust(sel) {
  const opt = sel.options[sel.selectedIndex];
  if(opt.value) {
    $('f-sv-cname').value = opt.text;
    // 查儲值餘額
    sb.from('store_credits').select('balance').eq('customer_no',opt.value).single()
      .then(({data})=>{
        const bal = data?.balance||0;
        let hint = document.getElementById('sv-credit-hint');
        if(!hint){ hint=document.createElement('div'); hint.id='sv-credit-hint';
          $('f-sv-cname').parentNode.appendChild(hint); }
        hint.innerHTML=`<div style="font-size:11px;color:${bal>0?'var(--ac)':'var(--tx3)'};margin-top:4px">儲值餘額：${fM(bal)}</div>`;
      });
  }
}

window._svcItems = [];

function svcItemChange(sel) {
  const opt = sel.options[sel.selectedIndex];
  const unit = opt?.dataset?.unit || '次';
  const qtyEl = document.getElementById('sv-siqty');
  if(qtyEl) {
    // 小時制：步進 0.5；次數制：步進 1
    const isHour = unit === '小時' || unit === 'hr' || unit === 'h';
    qtyEl.step = isHour ? '0.5' : '1';
    qtyEl.min = isHour ? '0.5' : '1';
    // 自動帶入預設單價
    const price = opt?.dataset?.price;
    if(price) {
      const priceEl = document.getElementById('sv-siprice');
      if(priceEl && !priceEl.value) priceEl.value = price;
    }
  }
}

function svcAddServiceItem() {
  const sel = document.getElementById('sv-sitem');
  const opt = sel.options[sel.selectedIndex];
  if(!opt.value){ toast('請選擇服務項目','e'); return; }
  const qty = parseFloat(document.getElementById('sv-siqty').value)||1;
  const price = parseFloat(document.getElementById('sv-siprice').value)||parseFloat(opt.dataset.price)||0;
  const techSel = document.getElementById('sv-tech');
  const techOpt = techSel?.options[techSel.selectedIndex];
  const techId = techOpt?.value ? parseInt(techOpt.value) : null;
  const techName = techOpt?.dataset?.name || null;
  const techRate = parseFloat(techOpt?.dataset?.rate)||0.5;
  const techPay = techId ? Math.round(qty * price * techRate * 100)/100 : 0;
  window._svcItems.push({
    id: Date.now(), item_type:'service', item_name:opt.text.split('（')[0],
    qty, unit:opt.dataset.unit||'次', unit_price:price, cost:0, subtotal:qty*price,
    technician_id:techId, technician_name:techName, technician_pay:techPay
  });
  renderSvcItems();
}

function svcAddConsumable() {
  const sel = document.getElementById('sv-prod');
  const opt = sel.options[sel.selectedIndex];
  if(!opt.value){ toast('請選擇耗材','e'); return; }
  const qty = parseFloat(document.getElementById('sv-prodqty').value)||1;
  const svcPrice = parseFloat(document.getElementById('sv-prodprice').value)||0;
  const costPerUnit = parseFloat(opt.dataset.cost)||0;
  const costPerSvcUnit = costPerUnit / (parseFloat(opt.dataset.qty)||1);
  window._svcItems.push({
    id: Date.now(), item_type:'consumable',
    item_name: opt.text.split('（')[0],
    product_no: opt.value,
    qty, unit:opt.dataset.unit||'次',
    unit_price: svcPrice,
    cost: Math.round(costPerSvcUnit * qty * 100)/100,
    subtotal: svcPrice * qty
  });
  renderSvcItems();
}

function renderSvcItems() {
  const area = document.getElementById('sv-items-area');
  if(!area) return;
  if(!window._svcItems.length){ area.innerHTML=''; return; }
  const total = window._svcItems.reduce((s,i)=>s+i.subtotal,0);
  const consumableCost = window._svcItems.filter(i=>i.item_type==='consumable').reduce((s,i)=>s+i.cost,0);
  area.innerHTML = `
  <div class="tc">
    <div class="tb"><span class="tt">訂單品項</span></div>
    <div class="tw"><table style="width:100%">
      <tr><th>類型</th><th>項目</th><th>數量</th><th>單價</th><th>小計</th><th>技師</th><th></th></tr>
      ${window._svcItems.map(i=>`<tr>
        <td><span class="badge ${i.item_type==='service'?'bg':'br2'}" style="font-size:10px">${i.item_type==='service'?'服務':'耗材'}</span></td>
        <td style="font-size:13px">${i.item_name}</td>
        <td>${i.qty}${i.unit}</td>
        <td class="num">${fM(i.unit_price)}</td>
        <td class="num"><b>${fM(i.subtotal)}</b></td>
        <td><button onclick="rmSvcItem(${i.id})" style="background:none;border:none;cursor:pointer;color:var(--rd);font-size:16px">×</button></td>
      </tr>`).join('')}
    </table></div>
  </div>
  <div style="text-align:right;font-weight:700;font-size:15px;margin-top:6px">合計：${fM(total)}</div>`;
}

function rmSvcItem(id) {
  window._svcItems = window._svcItems.filter(i=>i.id!==id);
  renderSvcItems();
}

async function saveSvcOrder() {
  const no = v('sv-no');
  const date = v('sv-date');
  const custSel = document.getElementById('f-sv-cust');
  const custNo = custSel?.value||null;
  const custName = v('sv-cname');
  const payMethod = v('sv-pay');
  const note = v('sv-note');
  if(!no||!date||!custName){ toast('請填寫單號、日期、客戶','e'); return; }
  if(!window._svcItems.length){ toast('請加入至少一個品項','e'); return; }

  const total = window._svcItems.reduce((s,i)=>s+i.subtotal,0);
  const consumableCost = window._svcItems.filter(i=>i.item_type==='consumable').reduce((s,i)=>s+i.cost,0);

  // 儲值扣款計算
  let paidByCredit = 0, paidByCash = total;
  if(payMethod.includes('儲值') && custNo) {
    const { data:cr } = await sb.from('store_credits').select('balance').eq('customer_no',custNo).single();
    const bal = cr?.balance||0;
    if(payMethod==='儲值扣款') { paidByCredit=Math.min(bal,total); paidByCash=Math.max(0,total-paidByCredit); }
    else if(payMethod==='現金+儲值') { paidByCredit=Math.min(bal,total); paidByCash=Math.max(0,total-paidByCredit); }
  }

  // 1. 建服務訂單
  const { error:e1 } = await sb.from('service_orders').insert({
    order_no:no, order_date:date, customer_no:custNo, customer_name:custName,
    total, consumable_cost:consumableCost,
    paid_by_credit:paidByCredit, paid_by_cash:paidByCash,
    payment_method:payMethod, note:note||null
  });
  if(e1){ toast('建立失敗：'+e1.message,'e'); return; }

  // 2. 建品項
  const items = window._svcItems.map(i=>({
    order_no:no, item_type:i.item_type, item_name:i.item_name,
    product_no:i.product_no||null, qty:i.qty, unit:i.unit,
    unit_price:i.unit_price, cost:i.cost, subtotal:i.subtotal,
    technician_id:i.technician_id||null, technician_name:i.technician_name||null,
    technician_pay:i.technician_pay||0
  }));
  await sb.from('service_order_items').insert(items);

  // 3. 扣服務庫存
  for(const item of window._svcItems.filter(i=>i.item_type==='consumable'&&i.product_no)) {
    const { data:inv } = await sb.from('service_inventory').select('stock_qty').eq('product_no',item.product_no).single();
    if(inv) {
      const newQty = Math.max(0, (inv.stock_qty||0)-item.qty);
      await sb.from('service_inventory').update({stock_qty:newQty,updated_at:new Date().toISOString()}).eq('product_no',item.product_no);
    }
  }

  // 4. 儲值扣款記錄
  if(paidByCredit>0 && custNo) {
    const { data:cr } = await sb.from('store_credits').select('balance').eq('customer_no',custNo).single();
    const newBal = (cr?.balance||0)-paidByCredit;
    await sb.from('store_credits').update({balance:newBal,updated_at:new Date().toISOString()}).eq('customer_no',custNo);
    await sb.from('store_credit_records').insert({
      customer_no:custNo, record_date:date, type:'deduct',
      amount:-paidByCredit, balance_after:newBal, note:`服務單 ${no}`, order_no:no
    });
  }

  await logAction('create','service_orders',no,`新增服務單 ${no}，客戶：${custName}，金額：${fM(total)}`,null,{total});
  toast('✅ 服務單建立成功');
  CM();
  window._svcItems=[];
  svcOrders();
}

async function deleteSvcOrder(no) {
  if(!confirm(`確定刪除服務單 ${no}？`)) return;
  await sb.from('service_orders').delete().eq('order_no',no);
  toast('已刪除');
  CM();
  svcOrders();
}

// ════════════════════════
//  2. 服務庫存
// ════════════════════════
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

// ════════════════════════
//  3. 撥轉（銷售庫存 → 服務庫存）
// ════════════════════════
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

function svcTransferCalc(sel) {
  const opt = sel.options[sel.selectedIndex];
  if(!opt.value) return;
  const units = parseFloat(opt.dataset.units)||1;
  const unit = opt.dataset.unit||'次';
  const qty = parseFloat($('f-tr-qty')?.value||1);
  const result = qty * units;
  $('tr-calc').innerHTML = `${qty} 盒/瓶 × ${units} = <b>${result} ${unit}</b>`;
}

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

// ════════════════════════
//  4. 儲值管理
// ════════════════════════
async function svcCredits() {
  const { data } = await sb.from('store_credits')
    .select('*').order('customer_name');

  $('svc-content').innerHTML = `
  <div style="margin-bottom:12px;display:flex;justify-content:flex-end">
    <button class="btn btn-p btn-s" onclick="svcAddCredit()">＋ 新增儲值</button>
  </div>
  <div class="tc"><div class="tb"><span class="tt">儲值帳戶</span></div>
  <div class="tw"><table style="width:100%">
    <tr><th>客戶</th><th>目前餘額</th><th>操作</th></tr>
    ${(data||[]).map(c=>`<tr>
      <td style="font-weight:500">${c.customer_name||c.customer_no}</td>
      <td class="num" style="font-weight:700;color:${c.balance>0?'var(--ac)':c.balance<0?'var(--rd)':'var(--tx3)'}">
        ${fM(c.balance)}
      </td>
      <td>
        <button class="btn btn-s" onclick="svcCreditHistory('${c.customer_no}')">記錄</button>
        <button class="btn btn-s" onclick="svcAddCredit('${c.customer_no}','${(c.customer_name||'').replace(/'/g,"\\'")}')">儲值</button>
      </td>
    </tr>`).join('')||'<tr><td colspan="3" style="text-align:center;padding:20px;color:var(--tx3)">尚無儲值帳戶</td></tr>'}
  </table></div></div>`;
}

async function svcAddCredit(custNo, custName) {
  const { data:custs } = await sb.from('customers').select('customer_no,name').order('name').limit(200);
  const custOpts = (custs||[]).map(c=>`<option value="${c.customer_no}" ${c.customer_no===custNo?'selected':''}>${c.name}</option>`).join('');

  OM('新增儲值',`
  <div class="al al-w" style="font-size:12px;margin-bottom:12px">
    儲值金額和贈送金額會合計加入餘額，記錄中可區分來源。
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
    <div class="fl"><label>客戶</label>
      <select id="f-cr-cust" style="width:100%;padding:7px 8px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;background:var(--sf)">
        ${custOpts}
      </select>
    </div>
    ${fi('cr-date','日期','date',new Date().toISOString().split('T')[0])}
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
    ${fi('cr-amount','儲值金額 *','number','')}
    ${fi('cr-bonus','贈送金額（選填）','number','0')}
  </div>
  ${fi('cr-note','備註（例如：存5萬送3千）')}`,
  `<button class="btn" onclick="CM()">取消</button>
   <button class="btn btn-p" onclick="saveCredit()">確認儲值</button>`);
}

async function saveCredit() {
  const custSel = document.getElementById('f-cr-cust');
  const custNo = custSel?.value;
  const custName = custSel?.options[custSel?.selectedIndex]?.text;
  const date = v('cr-date');
  const amount = parseFloat(v('cr-amount'))||0;
  const bonus = parseFloat(v('cr-bonus'))||0;
  const note = v('cr-note');
  if(!custNo||!date||amount<=0){ toast('請填寫客戶、日期和儲值金額','e'); return; }

  // 取目前餘額
  const { data:cr } = await sb.from('store_credits').select('balance').eq('customer_no',custNo).single();
  const oldBal = cr?.balance||0;
  const newBal = oldBal + amount + bonus;

  // 更新或建立帳戶
  if(cr) {
    await sb.from('store_credits').update({balance:newBal,customer_name:custName,updated_at:new Date().toISOString()}).eq('customer_no',custNo);
  } else {
    await sb.from('store_credits').insert({customer_no:custNo,customer_name:custName,balance:newBal});
  }

  // 儲值記錄
  await sb.from('store_credit_records').insert({
    customer_no:custNo, record_date:date, type:'deposit',
    amount, balance_after:oldBal+amount, note:note||null
  });
  // 贈送記錄
  if(bonus>0) {
    await sb.from('store_credit_records').insert({
      customer_no:custNo, record_date:date, type:'bonus',
      amount:bonus, balance_after:newBal, note:`贈送 ${fM(bonus)}`
    });
  }

  toast(`✅ 儲值成功，餘額：${fM(newBal)}`);
  CM();
  svcCredits();
}

async function svcCreditHistory(custNo) {
  const [{ data:cr },{ data:recs }] = await Promise.all([
    sb.from('store_credits').select('*').eq('customer_no',custNo).single(),
    sb.from('store_credit_records').select('*').eq('customer_no',custNo)
      .order('created_at',{ascending:false}).limit(50),
  ]);
  const typeLabel = {deposit:'儲值',bonus:'贈送',deduct:'扣款',gift:'贈品'};
  OM(`儲值記錄：${cr?.customer_name||custNo}`,`
  <div style="font-size:16px;font-weight:700;margin-bottom:14px;color:${(cr?.balance||0)>0?'var(--ac)':'var(--rd)'}">
    目前餘額：${fM(cr?.balance||0)}
  </div>
  <div class="tc"><div class="tw"><table style="width:100%">
    <tr><th>日期</th><th>類型</th><th>金額</th><th>餘額</th><th>備註</th></tr>
    ${(recs||[]).map(r=>`<tr>
      <td>${r.record_date}</td>
      <td><span class="badge ${r.type==='deduct'?'br2':'bg'}">${typeLabel[r.type]||r.type}</span></td>
      <td class="num" style="color:${r.amount<0?'var(--rd)':'var(--ac)'}">${fM(r.amount)}</td>
      <td class="num">${fM(r.balance_after)}</td>
      <td style="font-size:12px;color:var(--tx3)">${r.note||''}</td>
    </tr>`).join('')||'<tr><td colspan="5" style="text-align:center;color:var(--tx3)">尚無記錄</td></tr>'}
  </table></div></div>`,
  `<button class="btn" onclick="CM()">關閉</button>
   <button class="btn btn-p" onclick="CM();svcAddCredit('${custNo}','')">新增儲值</button>`);
}

// ════════════════════════
//  5. 服務項目管理
// ════════════════════════
var _svcItemCat = '全部';

async function svcItems() {
  const { data } = await sb.from('service_items').select('*').order('sort_order').order('name');
  const cats = ['全部', ...new Set((data||[]).map(s=>s.category).filter(Boolean))];
  const filtered = _svcItemCat === '全部' ? (data||[]) : (data||[]).filter(s=>s.category===_svcItemCat);

  $('svc-content').innerHTML = `
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
    <div class="tab-bar" style="flex:1;overflow-x:auto">
      ${cats.map(c=>`<div class="tab${_svcItemCat===c?' on':''}" onclick="_svcItemCat='${c}';svcItems()" style="white-space:nowrap">${c}</div>`).join('')}
    </div>
    <button class="btn btn-p btn-s" style="flex-shrink:0;margin-left:8px" onclick="addSvcItem()">＋ 新增</button>
  </div>
  <div class="tc"><div class="tw"><table style="width:100%">
    <tr><th>服務名稱</th><th>分類</th><th>說明</th><th>預設價格</th><th>單位</th><th>狀態</th><th>操作</th></tr>
    ${filtered.map(s=>`<tr>
      <td style="font-weight:500">${s.name}</td>
      <td><span class="badge bg" style="font-size:10px">${s.category||'—'}</span></td>
      <td style="font-size:12px;color:var(--tx3)">${s.description||'—'}</td>
      <td class="num">${fM(s.default_price)}</td>
      <td>${s.unit||'次'}</td>
      <td><span class="badge ${s.is_active?'bg':'br2'}">${s.is_active?'使用中':'停用'}</span></td>
      <td><button class="btn btn-s" onclick="editSvcItem(${s.id})">編輯</button></td>
    </tr>`).join('')||'<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--tx3)">尚無項目</td></tr>'}
  </table></div></div>`;
}

async function addSvcItem() {
  OM('新增服務項目',`
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
    ${fi('si-name','服務名稱 *')}
    ${fi('si-unit','單位','text','次')}
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
    ${fi('si-price','預設價格','number','0')}
    ${fi('si-sort','排序','number','99')}
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
    <div class='fl'><label>分類</label><select id='si-cat' style='width:100%;padding:7px 8px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;background:var(--sf)'><option value="身體療程">身體療程</option>
<option value="臉部療程">臉部療程</option>
<option value="精華液導入">精華液導入</option>
<option value="極緻幼態喚醒">極緻幼態喚醒</option>
<option value="活化加固">活化加固</option>
<option value="其他項目">其他項目</option></select></div>
    ${fi('si-desc','說明（選填）')}
  </div>`,
  `<button class="btn" onclick="CM()">取消</button>
   <button class="btn btn-p" onclick="saveSvcItem()">儲存</button>`);
}

async function editSvcItem(id) {
  const { data:s } = await sb.from('service_items').select('*').eq('id',id).single();
  if(!s) return;
  OM('編輯服務項目',`
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
    ${fi('si-name','服務名稱 *','text',s.name)}
    ${fi('si-unit','單位','text',s.unit||'次')}
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
    ${fi('si-price','預設價格','number',s.default_price||0)}
    ${fi('si-sort','排序','number',s.sort_order||99)}
  </div>
  ${fi('si-desc','說明',s.description||'')}
  <div style="margin-top:10px">
    <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
      <input type="checkbox" id="si-active" ${s.is_active?'checked':''} style="width:14px;height:14px">
      <span style="font-size:13px">啟用此服務項目</span>
    </label>
  </div>`,
  `<button class="btn" onclick="CM()">取消</button>
   <button class="btn btn-p" onclick="saveSvcItem(${id})">儲存</button>`);
}

async function saveSvcItem(id) {
  const name = v('si-name');
  if(!name){ toast('請輸入服務名稱','e'); return; }
  const catEl = document.getElementById('si-cat');
  const payload = {
    name, unit:v('si-unit')||'次',
    default_price:parseFloat(v('si-price'))||0,
    sort_order:parseInt(v('si-sort'))||99,
    description:v('si-desc')||null,
    category:catEl?.value||'其他項目',
    is_active:id ? (document.getElementById('si-active')?.checked??true) : true,
  };
  if(id) { await sb.from('service_items').update(payload).eq('id',id); }
  else { await sb.from('service_items').insert(payload); }
  toast('✅ 已儲存');
  CM();
  svcItems();
}

// ════════════════════════
//  expose
// ════════════════════════
window.serviceHub      = serviceHub;
window.svcNewOrder     = svcNewOrder;
window.svcShowOrder    = svcShowOrder;
window.saveSvcOrder    = saveSvcOrder;
window.deleteSvcOrder  = deleteSvcOrder;
window.svcItemChange = svcItemChange;
window.svcAddServiceItem = svcAddServiceItem;
window.svcAddConsumable  = svcAddConsumable;
window.rmSvcItem       = rmSvcItem;
window.svcPickCust     = svcPickCust;
window.svcInventory    = svcInventory;
window.svcTransfers    = svcTransfers;
window.svcNewTransfer  = svcNewTransfer;
window.svcTransferCalc = svcTransferCalc;
window.saveTransfer    = saveTransfer;
window.svcCredits      = svcCredits;
window.svcAddCredit    = svcAddCredit;
window.saveCredit      = saveCredit;
window.svcCreditHistory= svcCreditHistory;
window.svcItems        = svcItems;
window.addSvcItem      = addSvcItem;
window.editSvcItem     = editSvcItem;
window.saveSvcItem     = saveSvcItem;

// ════════════════════════════════════
//  服務財報
// ════════════════════════════════════
async function svcFinance() {
  // 年度彙整
  const [{ data:orders },{ data:transfers }] = await Promise.all([
    sb.from('service_orders').select('order_date,total,consumable_cost'),
    sb.from('service_transfers').select('transfer_date,total_cost'),
  ]);

  // 按年分組
  const yearMap = {};
  (orders||[]).forEach(o => {
    const yr = (o.order_date||'').slice(0,4);
    if(!yr) return;
    if(!yearMap[yr]) yearMap[yr] = { revenue:0, cost:0, transfer_cost:0 };
    yearMap[yr].revenue += o.total||0;
    yearMap[yr].cost += o.consumable_cost||0;
  });
  (transfers||[]).forEach(t => {
    const yr = (t.transfer_date||'').slice(0,4);
    if(!yr) return;
    if(!yearMap[yr]) yearMap[yr] = { revenue:0, cost:0, transfer_cost:0 };
    yearMap[yr].transfer_cost += t.total_cost||0;
  });

  // 按月分組（近12月）
  const monthMap = {};
  (orders||[]).forEach(o => {
    const ym = (o.order_date||'').slice(0,7);
    if(!ym) return;
    if(!monthMap[ym]) monthMap[ym] = { revenue:0, cost:0, transfer_cost:0 };
    monthMap[ym].revenue += o.total||0;
    monthMap[ym].cost += o.consumable_cost||0;
  });
  (transfers||[]).forEach(t => {
    const ym = (t.transfer_date||'').slice(0,7);
    if(!ym) return;
    if(!monthMap[ym]) monthMap[ym] = { revenue:0, cost:0, transfer_cost:0 };
    monthMap[ym].transfer_cost += t.total_cost||0;
  });

  const years = Object.keys(yearMap).sort().reverse();
  const months = Object.keys(monthMap).sort().reverse().slice(0,24);

  $('svc-content').innerHTML = `
  <div class="tc" style="margin-bottom:16px">
    <div class="tb"><span class="tt">年度服務財報</span></div>
    <div class="tw"><table style="width:100%">
      <tr><th>年份</th><th>服務收入</th><th>耗材成本</th><th>撥轉成本</th><th>服務淨利</th></tr>
      ${years.map(yr=>{
        const d=yearMap[yr];
        const net=d.revenue-d.cost-d.transfer_cost;
        return `<tr>
          <td style="font-weight:700">${yr}</td>
          <td class="num" style="color:var(--ac)">${fM(d.revenue)}</td>
          <td class="num" style="color:var(--rd)">${fM(d.cost)}</td>
          <td class="num" style="color:var(--am)">${fM(d.transfer_cost)}</td>
          <td class="num" style="font-weight:700;color:${net>=0?'var(--ac)':'var(--rd)'}">${fM(net)}</td>
        </tr>`;
      }).join('')||'<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--tx3)">尚無記錄</td></tr>'}
    </table></div>
  </div>
  <div class="tc">
    <div class="tb"><span class="tt">月度服務財報</span>
      <span style="font-size:11px;color:var(--tx3)">點月份看訂單明細</span>
    </div>
    <div class="tw"><table style="width:100%">
      <tr><th>月份</th><th>服務收入</th><th>耗材成本</th><th>撥轉成本</th><th>服務淨利</th></tr>
      ${months.map(ym=>{
        const d=monthMap[ym];
        const net=d.revenue-d.cost-d.transfer_cost;
        return `<tr style="cursor:pointer" onclick="svcMonthDetail('${ym}')"
          onmouseover="this.style.background='var(--acl)'" onmouseout="this.style.background=''">
          <td style="color:var(--ac);font-weight:600">${ym}</td>
          <td class="num" style="color:var(--ac)">${fM(d.revenue)}</td>
          <td class="num" style="color:var(--rd)">${fM(d.cost)}</td>
          <td class="num" style="color:var(--am)">${fM(d.transfer_cost)}</td>
          <td class="num" style="font-weight:700;color:${net>=0?'var(--ac)':'var(--rd)'}">${fM(net)}</td>
        </tr>`;
      }).join('')||'<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--tx3)">尚無記錄</td></tr>'}
    </table></div>
  </div>`;
}

async function svcMonthDetail(ym) {
  const [{ data:orders },{ data:transfers }] = await Promise.all([
    sb.from('service_orders').select('*').like('order_date',ym+'%').order('order_date',{ascending:false}),
    sb.from('service_transfers').select('*').like('transfer_date',ym+'%').order('transfer_date',{ascending:false}),
  ]);
  const revenue = (orders||[]).reduce((s,o)=>s+(o.total||0),0);
  const cost = (orders||[]).reduce((s,o)=>s+(o.consumable_cost||0),0);
  const trCost = (transfers||[]).reduce((s,t)=>s+(t.total_cost||0),0);
  const net = revenue-cost-trCost;

  OM(`${ym} 服務明細`,`
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px">
    ${[['服務收入',revenue,'var(--ac)'],['耗材成本',cost,'var(--rd)'],['撥轉成本',trCost,'var(--am)'],['服務淨利',net,net>=0?'var(--ac)':'var(--rd)']].map(([lbl,val,clr])=>`
    <div style="background:var(--sf2);border-radius:var(--r);padding:10px;text-align:center">
      <div style="font-size:11px;color:var(--tx3)">${lbl}</div>
      <div style="font-weight:700;color:${clr}">${fM(val)}</div>
    </div>`).join('')}
  </div>
  ${orders?.length?`<div style="font-weight:600;margin-bottom:6px">服務訂單</div>
  <div class="tc" style="margin-bottom:12px"><div class="tw"><table style="width:100%">
    <tr><th>訂單號</th><th>日期</th><th>客戶</th><th>服務費</th><th>耗材成本</th></tr>
    ${(orders||[]).map(o=>`<tr>
      <td style="font-size:12px">${o.order_no}</td>
      <td>${o.order_date}</td><td>${o.customer_name||'—'}</td>
      <td class="num" style="color:var(--ac)">${fM(o.total)}</td>
      <td class="num" style="color:var(--rd)">${fM(o.consumable_cost)}</td>
    </tr>`).join('')}
  </table></div></div>`:''}
  ${transfers?.length?`<div style="font-weight:600;margin-bottom:6px">撥轉記錄</div>
  <div class="tc"><div class="tw"><table style="width:100%">
    <tr><th>日期</th><th>商品</th><th>數量</th><th>成本</th></tr>
    ${(transfers||[]).map(t=>`<tr>
      <td>${t.transfer_date}</td><td>${t.product_name||t.product_no}</td>
      <td>${t.qty_stock} 盒/瓶</td>
      <td class="num" style="color:var(--am)">${fM(t.total_cost)}</td>
    </tr>`).join('')}
  </table></div></div>`:''}`,
  `<button class="btn" onclick="CM()">關閉</button>`);
}

// svcFinance/svcMonthDetail 已移至 finance.js

// ════════════════════════
//  技師管理
// ════════════════════════
async function svcTechnicians() {
  const { data } = await sb.from('technicians').select('*').order('name');
  $('svc-content').innerHTML = `
  <div style="margin-bottom:12px;display:flex;justify-content:flex-end">
    <button class="btn btn-p btn-s" onclick="addTechnician()">＋ 新增技師</button>
  </div>
  <div class="tc"><div class="tb"><span class="tt">技師名單</span></div>
  <div class="tw"><table style="width:100%">
    <tr><th>姓名</th><th>抽成比例</th><th>狀態</th><th>操作</th></tr>
    ${(data||[]).map(t=>`<tr>
      <td style="font-weight:500">${t.name}</td>
      <td style="text-align:center">${Math.round(t.commission_rate*100)}%</td>
      <td><span class="badge ${t.is_active?'bg':'br2'}">${t.is_active?'在職':'離職'}</span></td>
      <td><button class="btn btn-s" onclick="editTechnician(${t.id})">編輯</button></td>
    </tr>`).join('')||'<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--tx3)">尚無技師</td></tr>'}
  </table></div></div>`;
}

function addTechnician() {
  OM('新增技師',`
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
    ${fi('tc-name','技師姓名 *')}
    ${fi('tc-rate','抽成比例（%）*','number','50')}
  </div>`,
  `<button class="btn" onclick="CM()">取消</button>
   <button class="btn btn-p" onclick="saveTechnician()">儲存</button>`);
}

async function editTechnician(id) {
  const { data:t } = await sb.from('technicians').select('*').eq('id',id).single();
  if(!t) return;
  OM(`編輯技師：${t.name}`,`
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
    ${fi('tc-name','技師姓名 *','text',t.name)}
    ${fi('tc-rate','抽成比例（%）*','number',Math.round(t.commission_rate*100))}
  </div>
  <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
    <input type="checkbox" id="tc-active" ${t.is_active?'checked':''} style="width:14px;height:14px">
    <span>在職中</span>
  </label>`,
  `<button class="btn" onclick="CM()">取消</button>
   <button class="btn btn-p" onclick="saveTechnician(${id})">儲存</button>`);
}

async function saveTechnician(id) {
  const name = v('tc-name');
  const rate = parseFloat(v('tc-rate'))/100;
  if(!name||isNaN(rate)){ toast('請填寫姓名和抽成比例','e'); return; }
  const payload = { name, commission_rate:rate,
    is_active: id ? (document.getElementById('tc-active')?.checked??true) : true };
  if(id) await sb.from('technicians').update(payload).eq('id',id);
  else await sb.from('technicians').insert(payload);
  toast('✅ 已儲存');
  CM();
  svcTechnicians();
}

window.svcTechnicians  = svcTechnicians;
window.addTechnician   = addTechnician;
window.editTechnician  = editTechnician;
window.saveTechnician  = saveTechnician;