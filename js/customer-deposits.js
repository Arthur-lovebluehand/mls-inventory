// ═══════════════════════════════════════
// customer-deposits.js — 客戶寄放庫存
// 客戶已買斷（走過正常銷售訂單）但物理上放在店裡分次使用/取回的商品
// ═══════════════════════════════════════

var cdSearch = '';

async function customerDeposits() {
  let q = sb.from('customer_deposits').select('*').order('is_active',{ascending:false}).order('deposit_date',{ascending:false});
  if(cdSearch) q = q.or(`customer_name.ilike.%${cdSearch}%,product_name.ilike.%${cdSearch}%`);
  const { data } = await q;

  $('main').innerHTML = `
  <div class="ph"><div><div class="pt">客戶寄放庫存</div><div class="ps">${(data||[]).length} 筆</div></div>
    <div class="ha"><button class="btn btn-p btn-s" onclick="addDepositModal()">＋ 新增寄放記錄</button></div></div>
  <div class="pc">
    <div class="al al-w" style="font-size:12px;margin-bottom:12px">
      客戶已經買斷、算過帳的商品，只是放在店裡讓她分次使用或之後取回。這裡的數量增減<b>不會</b>影響店裡自己的商品庫存。
    </div>
    <div class="tc">
      <div class="tb"><span class="tt">寄放清單</span>
        <div class="si"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input placeholder="客戶姓名/商品名稱…（輸入後按 Enter 搜尋）" value="${cdSearch}" onkeydown="if(event.key==='Enter'){cdSearch=this.value;customerDeposits();}"></div>
      </div>
      <div class="tw"><table style="width:100%">
        <tr><th>客戶</th><th>商品</th><th>寄放日</th><th style="text-align:center">總量</th><th style="text-align:center">已用/取回</th><th style="text-align:center">剩餘</th><th>來源訂單</th><th>狀態</th><th>操作</th></tr>
        ${(data||[]).map(d=>{
          const remain = (d.total_qty||0)-(d.used_qty||0);
          return `<tr style="${d.is_active===false?'opacity:.5':''}">
            <td style="font-weight:500">${d.customer_name}</td>
            <td>${d.product_name}</td>
            <td style="font-size:12px">${fD(d.deposit_date)}</td>
            <td style="text-align:center">${d.total_qty} ${d.unit}</td>
            <td style="text-align:center;color:var(--tx3)">${d.used_qty||0} ${d.unit}</td>
            <td style="text-align:center;font-weight:700;color:${remain>0?'var(--ac)':'var(--rd)'}">${remain} ${d.unit}</td>
            <td style="font-size:11px;color:var(--tx3)">${d.source_order_no||'手動登記'}</td>
            <td><span class="badge ${remain>0&&d.is_active!==false?'bg':'br2'}">${remain<=0?'已用完':d.is_active===false?'已關閉':'寄放中'}</span></td>
            <td style="white-space:nowrap">
              ${remain>0?`<button class="btn btn-s" onclick="useDepositModal(${d.id})">登記使用/取回</button>`:''}
              <button class="btn btn-s" onclick="viewDepositHistory(${d.id})">記錄</button>
            </td>
          </tr>`;
        }).join('')||'<tr><td colspan="9" style="text-align:center;padding:20px;color:var(--tx3)">尚無寄放記錄</td></tr>'}
      </table></div>
    </div>
  </div>`;
}
window.customerDeposits = customerDeposits;

// ── 新增寄放記錄（從銷售單建立 / 手動登記）──
function addDepositModal() {
  OM('新增寄放記錄', `
  <div class="tab-bar" style="margin-bottom:14px">
    <div class="tab on" id="cd-tab-order" onclick="cdSwitchMode('order')">從銷售單建立</div>
    <div class="tab" id="cd-tab-manual" onclick="cdSwitchMode('manual')">手動登記</div>
  </div>
  <div id="cd-mode-order">
    <div class="fl" style="margin-bottom:10px"><label>輸入銷售單號或客戶姓名搜尋</label>
      <input id="f-cd-ordersearch" type="text" placeholder="例如 SO-20260813-001 或 王小姐" oninput="cdSearchOrders(this.value)"
        style="width:100%;padding:7px 8px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;outline:none">
    </div>
    <div id="cd-order-results" style="max-height:160px;overflow-y:auto;margin-bottom:10px"></div>
    <div id="cd-order-items"></div>
  </div>
  <div id="cd-mode-manual" style="display:none">
    <div class="fl" style="margin-bottom:10px"><label>客戶</label>
      <div style="position:relative">
        <input type="text" id="cd-cust-inp" placeholder="輸入姓名搜尋…" autocomplete="off"
          style="width:100%;padding:7px 8px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;outline:none"
          oninput="cdFilterCust(this.value)" onfocus="cdFilterCust(this.value)"
          onblur="setTimeout(()=>$('cd-cust-drop')?.classList.remove('open'),300)">
        <input type="hidden" id="cd-cust-no"><input type="hidden" id="cd-cust-name">
        <div id="cd-cust-drop" style="position:absolute;top:100%;left:0;right:0;background:var(--sf);border:1px solid var(--bd);border-radius:var(--r);max-height:160px;overflow-y:auto;z-index:500;display:none;box-shadow:0 4px 12px rgba(0,0,0,.1)"></div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:10px;margin-bottom:10px">
      ${fi('cd-pname','商品名稱 *')}
      ${fi('cd-unit','單位','text','組')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
      ${fi('cd-qty','寄放總量 *','number','1')}
      ${fi('cd-date','寄放日期','date',today())}
    </div>
    ${fi('cd-note','備註（選填，例如：與閃遮舊…）')}
  </div>`,
  `<button class="btn" onclick="CM()">取消</button>
   <button class="btn btn-p" onclick="saveDeposit()">建立</button>`,true);
}
window.addDepositModal = addDepositModal;

function cdSwitchMode(mode) {
  $('cd-tab-order').className = 'tab'+(mode==='order'?' on':'');
  $('cd-tab-manual').className = 'tab'+(mode==='manual'?' on':'');
  $('cd-mode-order').style.display = mode==='order'?'block':'none';
  $('cd-mode-manual').style.display = mode==='manual'?'block':'none';
  window._cdMode = mode;
}
window.cdSwitchMode = cdSwitchMode;

let cdSearchTimer;
function cdSearchOrders(kw) {
  clearTimeout(cdSearchTimer);
  if(!kw || kw.trim().length<2) { $('cd-order-results').innerHTML=''; return; }
  cdSearchTimer = setTimeout(async ()=>{
    const { data } = await sb.from('sales_orders').select('order_no,order_date,customer_no,customer_name')
      .or(`order_no.ilike.%${kw}%,customer_name.ilike.%${kw}%`).order('order_date',{ascending:false}).limit(15);
    $('cd-order-results').innerHTML = (data||[]).map(o=>
      `<div style="padding:7px 8px;border:1px solid var(--bd);border-radius:var(--r);margin-bottom:4px;cursor:pointer;font-size:12px" onclick="cdPickOrder('${o.order_no}')">
        <b>${o.order_no}</b>　${fD(o.order_date)}　${o.customer_name}
      </div>`
    ).join('') || '<div style="font-size:12px;color:var(--tx3)">查無符合的訂單</div>';
  }, 350);
}
window.cdSearchOrders = cdSearchOrders;

async function cdPickOrder(orderNo) {
  const [{ data:o },{ data:its }] = await Promise.all([
    sb.from('sales_orders').select('order_no,customer_no,customer_name').eq('order_no',orderNo).single(),
    sb.from('sales_order_items').select('*').eq('order_no',orderNo),
  ]);
  if(!o) return;
  window._cdOrder = o;

  // 撈這些商品的服務單位換算設定（1庫存單位=幾個服務單位），跟撥轉同一套邏輯
  const productNos = [...new Set((its||[]).map(i=>i.product_no).filter(Boolean))];
  let prodMap = {};
  if(productNos.length) {
    const { data:prods } = await sb.from('products').select('product_no,service_unit,service_units_per_stock').in('product_no',productNos);
    (prods||[]).forEach(p=>prodMap[p.product_no]=p);
  }

  $('cd-order-results').innerHTML = `<div class="al al-w" style="font-size:12px">已選：<b>${o.order_no}</b>（${o.customer_name}）</div>`;
  $('cd-order-items').innerHTML = `
  <div class="fl" style="margin-bottom:6px"><label>這張單裡要寄放的商品</label></div>
  <div class="al al-w" style="font-size:11px;margin-bottom:8px">已依商品的「服務單位換算」設定自動算好寄放數量，可以手動調整。</div>
  <table class="itb"><tr><th>商品</th><th>訂購數量</th><th>寄放數量</th><th>單位</th></tr>
    ${(its||[]).map((i,idx)=>{
      const prod = prodMap[i.product_no];
      const perStock = parseFloat(prod?.service_units_per_stock)||1;
      const svcUnit = prod?.service_unit||'組';
      const defQty = Math.round((i.qty||0)*perStock*100)/100;
      return `<tr>
      <td style="font-size:12px">${i.product_name}${perStock>1?`<div style="font-size:10px;color:var(--tx3)">1${i.unit||'個'}=${perStock}${svcUnit}</div>`:''}</td>
      <td class="num">${i.qty}</td>
      <td><input type="number" id="cd-itqty-${idx}" value="${defQty}" min="0" step="0.5" style="width:70px;padding:4px 6px;border:1px solid var(--bd);border-radius:var(--r);font-size:12px"></td>
      <td><input type="text" id="cd-itunit-${idx}" value="${svcUnit}" style="width:50px;padding:4px 6px;border:1px solid var(--bd);border-radius:var(--r);font-size:12px"></td>
    </tr>`;
    }).join('')}
  </table>`;
  window._cdOrderItems = its||[];
}
window.cdPickOrder = cdPickOrder;

function cdFilterCust(kw) {
  const drop = $('cd-cust-drop');
  if(!kw){ drop.classList.remove('open'); return; }
  clearTimeout(window._cdCustTimer);
  window._cdCustTimer = setTimeout(async ()=>{
    const { data } = await sb.from('customers').select('customer_no,name,phone').ilike('name',`%${kw}%`).limit(15);
    drop.innerHTML = (data||[]).map(c=>
      `<div style="padding:7px 8px;cursor:pointer;font-size:13px" onmousedown="cdPickCust('${c.customer_no}','${c.name.replace(/'/g,"\\'")}')">${c.name}（${c.phone||'—'}）</div>`
    ).join('') || '<div style="padding:7px 8px;font-size:12px;color:var(--tx3)">查無客戶</div>';
    drop.classList.add('open');
  }, 300);
}
window.cdFilterCust = cdFilterCust;
function cdPickCust(no,name) {
  $('cd-cust-no').value = no; $('cd-cust-name').value = name;
  $('cd-cust-inp').value = name;
  $('cd-cust-drop').classList.remove('open');
}
window.cdPickCust = cdPickCust;

async function saveDeposit() {
  const mode = window._cdMode || 'order';
  const rows = [];
  if(mode==='order') {
    if(!window._cdOrder) { toast('請先搜尋並選擇一張銷售單','e'); return; }
    (window._cdOrderItems||[]).forEach((i,idx)=>{
      const qty = parseFloat($('cd-itqty-'+idx)?.value)||0;
      if(qty>0) rows.push({
        customer_no: window._cdOrder.customer_no, customer_name: window._cdOrder.customer_name,
        product_no: i.product_no, product_name: i.product_name,
        unit: $('cd-itunit-'+idx)?.value||'組', total_qty: qty, used_qty:0,
        source_order_no: window._cdOrder.order_no, deposit_date: today(), is_active:true
      });
    });
    if(!rows.length) { toast('請至少填一項寄放數量','e'); return; }
  } else {
    const custNo = v('cd-cust-no'), custName = v('cd-cust-name')||$('cd-cust-inp')?.value;
    const pname = v('cd-pname'), qty = parseFloat(v('cd-qty'))||0;
    if(!custName) { toast('請選擇客戶','e'); return; }
    if(!pname || qty<=0) { toast('請填寫商品名稱與寄放數量','e'); return; }
    rows.push({
      customer_no: custNo||null, customer_name: custName,
      product_no: null, product_name: pname, unit: v('cd-unit')||'組',
      total_qty: qty, used_qty:0, source_order_no: null,
      deposit_date: v('cd-date')||today(), note: v('cd-note')||null, is_active:true
    });
  }

  for(const r of rows) {
    const depositNo = 'CD-'+r.deposit_date.replace(/-/g,'')+'-'+Date.now().toString().slice(-4)+Math.floor(Math.random()*10);
    const { error } = await sb.from('customer_deposits').insert({...r, deposit_no: depositNo});
    if(error) { toast('建立失敗：'+error.message,'e'); return; }
  }
  toast(`✅ 已建立 ${rows.length} 筆寄放記錄`);
  window._cdOrder = null; window._cdOrderItems = null;
  CM();
  customerDeposits();
}
window.saveDeposit = saveDeposit;

// ── 登記使用/取回 ──
async function useDepositModal(id) {
  const { data:d } = await sb.from('customer_deposits').select('*').eq('id',id).single();
  if(!d) return;
  const remain = (d.total_qty||0)-(d.used_qty||0);
  OM(`登記使用／取回：${d.customer_name} - ${d.product_name}`, `
  <div class="al al-w" style="font-size:12px;margin-bottom:12px">目前剩餘 ${remain} ${d.unit}</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
    ${fi('ud-date','日期','date',today())}
    ${fi('ud-qty','數量 *','number','1')}
  </div>
  <div class="fl" style="margin-bottom:10px"><label>類型</label>
    <select id="f-ud-type" style="width:100%;padding:7px 8px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px">
      <option value="服務使用">服務使用（店內幫她用掉）</option>
      <option value="客戶取回">客戶取回（自己拿回家）</option>
      <option value="其他">其他</option>
    </select>
  </div>
  ${fi('ud-note','備註（選填）')}`,
  `<button class="btn" onclick="CM()">取消</button>
   <button class="btn btn-p" onclick="saveDepositUsage(${id})">確認</button>`);
}
window.useDepositModal = useDepositModal;

async function saveDepositUsage(id) {
  const { data:d } = await sb.from('customer_deposits').select('*').eq('id',id).single();
  if(!d) return;
  const qty = parseFloat(v('ud-qty'))||0;
  const remain = (d.total_qty||0)-(d.used_qty||0);
  if(qty<=0){ toast('請填寫數量','e'); return; }
  if(qty>remain){ toast(`超過剩餘數量（剩 ${remain} ${d.unit}）`,'e'); return; }

  await sb.from('customer_deposit_usages').insert({
    deposit_id:id, use_date:v('ud-date')||today(), qty_used:qty,
    use_type:v('ud-type')||'服務使用', note:v('ud-note')||null
  });
  await sb.from('customer_deposits').update({
    used_qty:(d.used_qty||0)+qty, updated_at:new Date().toISOString()
  }).eq('id',id);

  toast('✅ 已登記');
  CM();
  customerDeposits();
}
window.saveDepositUsage = saveDepositUsage;

async function viewDepositHistory(id) {
  const [{ data:d },{ data:uses }] = await Promise.all([
    sb.from('customer_deposits').select('*').eq('id',id).single(),
    sb.from('customer_deposit_usages').select('*').eq('deposit_id',id).order('use_date',{ascending:false}),
  ]);
  if(!d) return;
  const remain = (d.total_qty||0)-(d.used_qty||0);
  OM(`寄放記錄：${d.customer_name} - ${d.product_name}`, `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;font-size:13px">
    <div><span style="color:var(--tx3)">寄放日期：</span>${fD(d.deposit_date)}</div>
    <div><span style="color:var(--tx3)">來源：</span>${d.source_order_no||'手動登記'}</div>
    <div><span style="color:var(--tx3)">總量：</span>${d.total_qty} ${d.unit}</div>
    <div><span style="color:var(--tx3)">剩餘：</span><b style="color:${remain>0?'var(--ac)':'var(--rd)'}">${remain} ${d.unit}</b></div>
  </div>
  ${d.note?`<div class="al al-w" style="font-size:12px;margin-bottom:12px">備註：${d.note}</div>`:''}
  <table class="itb"><tr><th>日期</th><th>類型</th><th>數量</th><th>備註</th></tr>
    ${(uses||[]).map(u=>`<tr>
      <td style="font-size:12px">${fD(u.use_date)}</td>
      <td><span class="badge ${u.use_type==='服務使用'?'bg':'ba'}" style="font-size:10px">${u.use_type}</span></td>
      <td class="num">${u.qty_used} ${d.unit}</td>
      <td style="font-size:12px;color:var(--tx3)">${u.note||u.service_order_no||'—'}</td>
    </tr>`).join('')||'<tr><td colspan="4" style="text-align:center;color:var(--tx3)">尚無使用記錄</td></tr>'}
  </table>`,
  `<button class="btn" onclick="CM()">關閉</button>`);
}
window.viewDepositHistory = viewDepositHistory;

// 供 service-orders.js 呼叫：抓某客戶目前有剩餘的寄放品項
async function getCustomerDeposits(customerNo) {
  if(!customerNo) return [];
  const { data } = await sb.from('customer_deposits').select('*')
    .eq('customer_no',customerNo).eq('is_active',true);
  return (data||[]).filter(d=>(d.total_qty||0)-(d.used_qty||0)>0);
}
window.getCustomerDeposits = getCustomerDeposits;