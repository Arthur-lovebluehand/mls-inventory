// ═══════════════════════════════════════
// customer-deposits.js — 客戶寄放庫存
// 客戶已買斷（走過正常銷售訂單）但物理上放在店裡分次使用/取回的商品
// 結構比照訂單：一張寄放單（customer_deposits）可以有多個品項（customer_deposit_items）
// ═══════════════════════════════════════

var cdSearch = '';

async function customerDeposits() {
  let q = sb.from('customer_deposits').select('*').order('is_active',{ascending:false}).order('deposit_date',{ascending:false});
  if(cdSearch) q = q.ilike('customer_name',`%${cdSearch}%`);
  const { data:deposits } = await q;
  const depositNos = (deposits||[]).map(d=>d.deposit_no);
  let itemsByDeposit = {};
  if(depositNos.length) {
    const { data:items } = await sb.from('customer_deposit_items').select('*').in('deposit_no',depositNos);
    (items||[]).forEach(i=>{ (itemsByDeposit[i.deposit_no]=itemsByDeposit[i.deposit_no]||[]).push(i); });
  }
  let list = deposits||[];
  if(cdSearch) {
    list = list.filter(d => d.customer_name.includes(cdSearch) || (itemsByDeposit[d.deposit_no]||[]).some(i=>i.product_name.includes(cdSearch)));
  }

  $('main').innerHTML = `
  <div class="ph"><div><div class="pt">客戶寄放庫存</div><div class="ps">${list.length} 張</div></div>
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
        <tr><th>單號</th><th>客戶</th><th>商品摘要</th><th>寄放日</th><th>來源訂單</th><th>狀態</th><th>操作</th></tr>
        ${list.map(d=>{
          const its = itemsByDeposit[d.deposit_no]||[];
          const totalRemain = its.reduce((s,i)=>s+((i.total_qty||0)-(i.used_qty||0)),0);
          const summary = its.map(i=>i.product_name).join('、')||'—';
          const status = d.is_active===false ? '已關閉' : totalRemain<=0 ? '已用完' : '寄放中';
          return `<tr style="${d.is_active===false?'opacity:.5':''}">
            <td style="font-size:12px;color:var(--tx3)">${d.deposit_no}</td>
            <td style="font-weight:500">${d.customer_name}</td>
            <td style="font-size:13px">${summary}</td>
            <td style="font-size:12px">${fD(d.deposit_date)}</td>
            <td style="font-size:11px;color:var(--tx3)">${d.source_order_no||'手動登記'}</td>
            <td><span class="badge ${status==='寄放中'?'bg':'br2'}">${status}</span></td>
            <td style="white-space:nowrap">
              ${totalRemain>0?`<button class="btn btn-s" onclick="useDepositModal('${d.deposit_no}')">登記使用/取回</button>`:''}
              <button class="btn btn-s" onclick="viewDepositDetail('${d.deposit_no}')">明細</button>
            </td>
          </tr>`;
        }).join('')||'<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--tx3)">尚無寄放記錄</td></tr>'}
      </table></div>
    </div>
  </div>`;
}
window.customerDeposits = customerDeposits;

// ── 新增寄放記錄（從銷售單建立 / 手動登記）──
function addDepositModal() {
  window._cdManualProdNo = null;
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
    <div id="cd-order-results" style="max-height:320px;overflow-y:auto;margin-bottom:10px"></div>
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
    <div class="fl" style="margin-bottom:10px"><label>商品</label>
      <div style="position:relative">
        <input type="text" id="cd-pname" placeholder="輸入商品名稱搜尋，或直接手動輸入自訂名稱…" autocomplete="off"
          style="width:100%;padding:7px 8px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;outline:none"
          oninput="cdFilterManualProd(this.value)" onfocus="cdFilterManualProd(this.value)"
          onblur="setTimeout(()=>$('cd-pname-drop')?.classList.remove('open'),300)">
        <div id="cd-pname-drop" style="position:absolute;top:100%;left:0;right:0;background:var(--sf);border:1px solid var(--bd);border-radius:var(--r);max-height:160px;overflow-y:auto;z-index:500;display:none;box-shadow:0 4px 12px rgba(0,0,0,.1)"></div>
      </div>
      <div style="font-size:11px;color:var(--tx3);margin-top:4px">從清單選商品會自動帶入正確的服務單位；找不到商品也可以直接手動輸入名稱。</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">${fi('cd-unit','單位','text','組')}</div>
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
  $('cd-order-results').innerHTML = '<div style="font-size:12px;color:var(--tx3)">搜尋中…</div>';
  cdSearchTimer = setTimeout(async ()=>{
    const { data } = await sb.from('sales_orders').select('order_no,order_date,customer_no,customer_name')
      .or(`order_no.ilike.%${kw}%,customer_name.ilike.%${kw}%`).order('order_date',{ascending:false}).limit(150);
    $('cd-order-results').innerHTML =
      `<div style="font-size:11px;color:var(--tx3);margin-bottom:4px">共找到 ${(data||[]).length} 筆${(data||[]).length>=150?'（已達顯示上限，可縮小搜尋範圍例如打全名）':''}</div>`
      + ((data||[]).map(o=>
      `<div style="padding:7px 8px;border:1px solid var(--bd);border-radius:var(--r);margin-bottom:4px;cursor:pointer;font-size:12px" onclick="cdPickOrder('${o.order_no}')">
        <b>${o.order_no}</b>　${fD(o.order_date)}　${o.customer_name}
      </div>`
    ).join('') || '<div style="font-size:12px;color:var(--tx3)">查無符合的訂單</div>');
  }, 350);
}
window.cdSearchOrders = cdSearchOrders;

async function cdPickOrder(orderNo) {
  const [{ data:o },{ data:its }] = await Promise.all([
    sb.from('sales_orders').select('order_no,customer_no,customer_name').eq('order_no',orderNo).single(),
    sb.from('sales_order_items').select('*').eq('order_no',orderNo),
  ]);
  if(!o) return;
  if(!o.customer_no && o.customer_name) {
    const { data:cm } = await sb.from('customers').select('customer_no').eq('name',o.customer_name).maybeSingle();
    if(cm?.customer_no) o.customer_no = cm.customer_no;
  }
  window._cdOrder = o;

  const productNos = [...new Set((its||[]).map(i=>i.product_no).filter(Boolean))];
  let prodMap = {};
  if(productNos.length) {
    const { data:prods } = await sb.from('products').select('product_no,service_unit,service_units_per_stock').in('product_no',productNos);
    (prods||[]).forEach(p=>prodMap[p.product_no]=p);
  }

  $('cd-order-results').innerHTML = `<div class="al al-w" style="font-size:12px">已選：<b>${o.order_no}</b>（${o.customer_name}）</div>`;
  window._cdOrderMeta = {};
  $('cd-order-items').innerHTML = `
  <div class="fl" style="margin-bottom:6px"><label>這張單裡要寄放的商品</label></div>
  <div class="al al-w" style="font-size:11px;margin-bottom:8px">已依商品的「服務單位換算」設定自動算好寄放數量（含贈品），可以手動調整。建立後，這張銷售訂單對應的出貨進度也會一併更新，不會再一直卡在「待出貨」。</div>
  <table class="itb"><tr><th>商品</th><th>訂購+贈品</th><th>寄放數量</th><th>單位</th></tr>
    ${(its||[]).map((i,idx)=>{
      const prod = prodMap[i.product_no];
      const perStock = parseFloat(prod?.service_units_per_stock)||1;
      const svcUnit = prod?.service_unit||'組';
      const saleQtyTotal = (i.qty||0)+(i.gift_qty||0);
      const defQty = Math.round(saleQtyTotal*perStock*100)/100;
      window._cdOrderMeta[idx] = { product_no:i.product_no, item_id:i.id, perStock, saleQtyTotal, alreadyShipped:i.shipped_qty||0 };
      return `<tr>
      <td style="font-size:12px">${i.product_name}${i.gift_qty?`<div style="font-size:10px;color:var(--am)">含贈品${i.gift_qty}${i.unit||'個'}</div>`:''}${perStock>1?`<div style="font-size:10px;color:var(--tx3)">1${i.unit||'個'}=${perStock}${svcUnit}</div>`:''}</td>
      <td class="num">${saleQtyTotal}${i.unit||'個'}</td>
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

function cdFilterManualProd(kw) {
  const drop = $('cd-pname-drop');
  if(!kw){ drop.classList.remove('open'); return; }
  clearTimeout(window._cdProdTimer);
  window._cdProdTimer = setTimeout(async ()=>{
    const { data } = await sb.from('products').select('product_no,name,service_unit,default_service_qty').eq('is_active',true).ilike('name',`%${kw}%`).limit(15);
    drop.innerHTML = (data||[]).map(p=>
      `<div style="padding:7px 8px;cursor:pointer;font-size:13px" onmousedown="cdPickManualProd('${p.product_no}','${p.name.replace(/'/g,"\\'")}','${p.service_unit||'組'}',${p.default_service_qty||1})">${p.name}${p.service_unit?`（服務單位：${p.service_unit}）`:''}</div>`
    ).join('') || '<div style="padding:7px 8px;font-size:12px;color:var(--tx3)">查無商品，可直接手動輸入名稱</div>';
    drop.classList.add('open');
  }, 300);
}
window.cdFilterManualProd = cdFilterManualProd;
function cdPickManualProd(pno,name,unit,defQty) {
  $('cd-pname').value = name;
  $('f-cd-unit').value = unit;
  if($('f-cd-qty')) $('f-cd-qty').value = defQty;
  window._cdManualProdNo = pno;
  $('cd-pname-drop')?.classList.remove('open');
}
window.cdPickManualProd = cdPickManualProd;
function cdPickCust(no,name) {
  $('cd-cust-no').value = no; $('cd-cust-name').value = name;
  $('cd-cust-inp').value = name;
  $('cd-cust-drop').classList.remove('open');
}
window.cdPickCust = cdPickCust;

async function saveDeposit() {
  const mode = window._cdMode || 'order';
  const depositDate = mode==='order' ? today() : (v('cd-date')||today());
  const depositNo = 'CD-'+depositDate.replace(/-/g,'')+'-'+Date.now().toString().slice(-4)+Math.floor(Math.random()*10);
  let headerPayload, itemRows = [], shipmentUpdates = [];

  if(mode==='order') {
    if(!window._cdOrder) { toast('請先搜尋並選擇一張銷售單','e'); return; }
    (window._cdOrderItems||[]).forEach((i,idx)=>{
      const qty = parseFloat($('cd-itqty-'+idx)?.value)||0;
      if(qty<=0) return;
      const meta = (window._cdOrderMeta||{})[idx] || {};
      itemRows.push({
        deposit_no: depositNo, product_no: i.product_no, product_name: i.product_name,
        unit: $('cd-itunit-'+idx)?.value||'組', total_qty: qty, used_qty: 0
      });
      const perStock = meta.perStock||1;
      const saleQtyFromDeposit = Math.round((qty/perStock)*100)/100;
      const newShipped = Math.min(meta.saleQtyTotal||0, (meta.alreadyShipped||0)+saleQtyFromDeposit);
      if(meta.item_id) shipmentUpdates.push({ item_id: meta.item_id, newShipped, alreadyShipped: meta.alreadyShipped||0 });
    });
    if(!itemRows.length) { toast('請至少填一項寄放數量','e'); return; }
    headerPayload = {
      deposit_no: depositNo, customer_no: window._cdOrder.customer_no||null, customer_name: window._cdOrder.customer_name,
      source_order_no: window._cdOrder.order_no, deposit_date: depositDate, is_active:true
    };
  } else {
    const custNo = v('cd-cust-no'), custName = v('cd-cust-name')||$('cd-cust-inp')?.value;
    const pname = v('cd-pname'), qty = parseFloat(v('cd-qty'))||0;
    if(!custName) { toast('請選擇客戶','e'); return; }
    if(!pname || qty<=0) { toast('請填寫商品名稱與寄放數量','e'); return; }
    itemRows.push({ deposit_no: depositNo, product_no:window._cdManualProdNo||null, product_name: pname, unit: v('cd-unit')||'組', total_qty: qty, used_qty:0 });
    headerPayload = {
      deposit_no: depositNo, customer_no: custNo||null, customer_name: custName,
      source_order_no: null, deposit_date: depositDate, note: v('cd-note')||null, is_active:true
    };
  }

  const { error:hErr } = await sb.from('customer_deposits').insert(headerPayload);
  if(hErr) { toast('建立失敗：'+hErr.message,'e'); return; }
  const { error:iErr } = await sb.from('customer_deposit_items').insert(itemRows);
  if(iErr) { toast('品項建立失敗：'+iErr.message,'e'); return; }

  if(shipmentUpdates.length && window._cdOrder) {
    for(const u of shipmentUpdates) {
      await sb.from('sales_order_items').update({shipped_qty:u.newShipped}).eq('id',u.item_id);
    }
    const { data:allIts } = await sb.from('sales_order_items').select('qty,gift_qty,shipped_qty').eq('order_no',window._cdOrder.order_no);
    const allDone = (allIts||[]).every(i=>(i.shipped_qty||0)>=(i.qty||0)+(i.gift_qty||0));
    const partDone = (allIts||[]).some(i=>(i.shipped_qty||0)>0);
    const shipStatus = allDone?'全部出貨':partDone?'部分出貨':'待出貨';
    const { data:ord } = await sb.from('sales_orders').select('note,stock_deducted_at_creation').eq('order_no',window._cdOrder.order_no).single();
    const newNote = (ord?.note?ord.note+'\n':'')+`已轉客戶寄放（寄放單：${depositNo}）`;
    await sb.from('sales_orders').update({ ship_status:shipStatus, note:newNote }).eq('order_no',window._cdOrder.order_no);
    if(ord && ord.stock_deducted_at_creation===false) {
      for(const u of shipmentUpdates) {
        const item = (window._cdOrderItems||[]).find(i=>i.id===u.item_id);
        if(item?.product_no) {
          const deductQty = u.newShipped - u.alreadyShipped;
          if(deductQty>0) {
            const { data:p } = await sb.from('products').select('stock').eq('product_no',item.product_no).single();
            if(p) await sb.from('products').update({stock:Math.max(0,(p.stock||0)-deductQty)}).eq('product_no',item.product_no);
          }
        }
      }
    }
  }

  toast(`✅ 已建立寄放單 ${depositNo}`);
  window._cdOrder = null; window._cdOrderItems = null; window._cdOrderMeta = null;
  CM();
  customerDeposits();
}
window.saveDeposit = saveDeposit;

// ── 登記使用/取回（一張寄放單裡的所有品項一次登記，跟出貨記錄同邏輯）──
async function useDepositModal(depositNo) {
  const [{ data:d },{ data:its }] = await Promise.all([
    sb.from('customer_deposits').select('*').eq('deposit_no',depositNo).single(),
    sb.from('customer_deposit_items').select('*').eq('deposit_no',depositNo),
  ]);
  if(!d) return;
  const rows = its.map(i=>{
    const remain = (i.total_qty||0)-(i.used_qty||0);
    return `<tr>
      <td style="font-size:12px">${i.product_name}</td>
      <td class="num">${i.total_qty} ${i.unit}</td>
      <td class="num ok">${i.used_qty||0} ${i.unit}</td>
      <td class="num" style="font-weight:700">${remain} ${i.unit}</td>
      <td><input type="number" id="cd-use-${i.id}" value="0" min="0" max="${remain}" step="0.5" ${remain<=0?'disabled':''}
        style="width:70px;padding:4px 6px;border:1px solid var(--bd);border-radius:var(--r);font-size:12px${remain<=0?';opacity:.4':''}"></td>
    </tr>`;
  }).join('');
  OM(`登記使用／取回：${d.customer_name}（${depositNo}）`, `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
    ${fi('ud-date','日期','date',today())}
    <div class="fl"><label>類型</label>
      <select id="f-ud-type" style="width:100%;padding:7px 8px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px">
        <option value="服務使用">服務使用（店內幫她用掉）</option>
        <option value="客戶取回">客戶取回（自己拿回家）</option>
        <option value="其他">其他</option>
      </select>
    </div>
  </div>
  <table class="itb"><tr><th>商品</th><th>總量</th><th>已用/取回</th><th>剩餘</th><th>本次數量</th></tr>${rows}</table>
  <div style="margin-top:10px">${fi('ud-note','備註（選填）')}</div>`,
  `<button class="btn" onclick="CM()">取消</button>
   <button class="btn btn-p" onclick="saveDepositUsage('${depositNo}')">確認</button>`);
  window._udItems = its;
}
window.useDepositModal = useDepositModal;

async function saveDepositUsage(depositNo) {
  const date = v('ud-date')||today();
  const type = v('ud-type')||'服務使用';
  const note = v('ud-note')||null;
  const items = window._udItems||[];
  let any=false;
  for(const i of items) {
    const qty = parseFloat($('cd-use-'+i.id)?.value)||0;
    if(qty<=0) continue;
    const remain = (i.total_qty||0)-(i.used_qty||0);
    if(qty>remain) { toast(`「${i.product_name}」超過剩餘數量`,'e'); return; }
    any=true;
    await sb.from('customer_deposit_usages').insert({
      deposit_item_id:i.id, use_date:date, qty_used:qty, use_type:type, note
    });
    await sb.from('customer_deposit_items').update({used_qty:(i.used_qty||0)+qty}).eq('id',i.id);
  }
  if(!any){ toast('請至少填一項數量','e'); return; }
  toast('✅ 已登記');
  CM();
  customerDeposits();
}
window.saveDepositUsage = saveDepositUsage;

async function viewDepositDetail(depositNo) {
  const [{ data:d },{ data:its }] = await Promise.all([
    sb.from('customer_deposits').select('*').eq('deposit_no',depositNo).single(),
    sb.from('customer_deposit_items').select('*').eq('deposit_no',depositNo),
  ]);
  if(!d) return;
  const itemIds = its.map(i=>i.id);
  const usesRes = itemIds.length ? await sb.from('customer_deposit_usages').select('*').in('deposit_item_id',itemIds).order('use_date',{ascending:false}) : {data:[]};
  const uses = usesRes.data;
  const itemMap = {}; its.forEach(i=>itemMap[i.id]=i);
  OM(`寄放明細：${d.customer_name}（${depositNo}）`, `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;font-size:13px">
    <div><span style="color:var(--tx3)">寄放日期：</span>${fD(d.deposit_date)}</div>
    <div><span style="color:var(--tx3)">來源：</span>${d.source_order_no||'手動登記'}</div>
  </div>
  ${d.note?`<div class="al al-w" style="font-size:12px;margin-bottom:12px">備註：${d.note}</div>`:''}
  <table class="itb"><tr><th>商品</th><th>總量</th><th>已用/取回</th><th>剩餘</th><th></th></tr>
    ${its.map(i=>`<tr>
      <td style="font-size:12px">${i.product_name}</td>
      <td class="num">${i.total_qty} ${i.unit}</td>
      <td class="num">${i.used_qty||0} ${i.unit}</td>
      <td class="num" style="font-weight:700">${(i.total_qty||0)-(i.used_qty||0)} ${i.unit}</td>
      <td><button class="btn btn-s" onclick="editDepositItemModal(${i.id},'${depositNo}')">編輯</button></td>
    </tr>`).join('')}
  </table>
  <div style="margin-top:14px;font-size:13px;font-weight:600">使用/取回記錄</div>
  <table class="itb"><tr><th>日期</th><th>商品</th><th>類型</th><th>數量</th><th>備註</th></tr>
    ${(uses||[]).map(u=>{ const it=itemMap[u.deposit_item_id]; return `<tr>
      <td style="font-size:12px">${fD(u.use_date)}</td>
      <td style="font-size:12px">${it?.product_name||'—'}</td>
      <td><span class="badge ${u.use_type==='服務使用'?'bg':'ba'}" style="font-size:10px">${u.use_type}</span></td>
      <td class="num">${u.qty_used} ${it?.unit||''}</td>
      <td style="font-size:12px;color:var(--tx3)">${u.note||u.service_order_no||'—'}</td>
    </tr>`;}).join('')||'<tr><td colspan="5" style="text-align:center;color:var(--tx3)">尚無使用記錄</td></tr>'}
  </table>`,
  `<button class="btn" onclick="CM()">關閉</button>`);
}
window.viewDepositDetail = viewDepositDetail;

async function editDepositItemModal(itemId, depositNo) {
  const { data:i } = await sb.from('customer_deposit_items').select('*').eq('id',itemId).single();
  if(!i) return;

  // 如果這個品項有連到真正的商品，改成「幾瓶/幾盒」直接自動換算，不用手動算ml/組數
  let prod = null;
  if(i.product_no) {
    const { data:p } = await sb.from('products').select('service_unit,service_units_per_stock,unit').eq('product_no',i.product_no).maybeSingle();
    prod = p;
  }

  if(prod && prod.service_unit && prod.service_units_per_stock) {
    const perStock = parseFloat(prod.service_units_per_stock)||1;
    const stockQtyGuess = Math.round((i.total_qty/perStock)*100)/100;
    OM(`編輯品項：${i.product_name}`, `
    <div class="al al-w" style="font-size:12px;margin-bottom:10px">
      已使用/取回 ${i.used_qty||0} ${i.unit}。這個商品有設定換算比例（1${prod.unit||'瓶'}＝${perStock}${prod.service_unit}），填「幾${prod.unit||'瓶'}」，系統會自動換算成正確的寄放總量。
    </div>
    ${fi('edi-name','商品名稱','text',i.product_name)}
    <div class="fl" style="margin-top:10px">
      <label>寄放幾${prod.unit||'瓶'}（1${prod.unit||'瓶'}＝${perStock}${prod.service_unit}）</label>
      <input type="number" id="f-edi-stockqty" value="${stockQtyGuess}" min="0.1" step="0.5" oninput="ediCalcFromStock(${perStock},'${prod.service_unit}')"
        style="width:100%;padding:8px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;outline:none">
    </div>
    <div id="edi-calc-result" style="font-size:13px;color:var(--ac);margin-top:8px;font-weight:600">＝ ${i.total_qty} ${i.unit}</div>
    <input type="hidden" id="f-edi-qty" value="${i.total_qty}">
    <input type="hidden" id="f-edi-unit" value="${prod.service_unit}">`,
    `<button class="btn" onclick="CM()">取消</button>
     <button class="btn btn-p" onclick="saveDepositItemEdit(${itemId},'${depositNo}')">儲存</button>`);
    return;
  }

  // 沒有連結商品（純手動輸入的自訂項目）：維持手動輸入數量+單位
  OM(`編輯品項：${i.product_name}`, `
  <div class="al al-w" style="font-size:12px;margin-bottom:10px">已使用/取回 ${i.used_qty||0} ${i.unit}，總量不能改到比已使用的還少。</div>
  ${fi('edi-name','商品名稱','text',i.product_name)}
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">
    ${fi('edi-qty','寄放總量','number',i.total_qty)}
    <div class="fl"><label>單位</label>
      <select id="f-edi-unit" data-orig="${i.unit}" onchange="ediUnitWarn(this)" style="width:100%;padding:7px 8px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px">
        ${['組','ml','片','次','顆','瓶','盒'].map(u=>`<option value="${u}" ${u===i.unit?'selected':''}>${u}</option>`).join('')}
      </select>
    </div>
  </div>
  <div id="edi-unit-warn" style="font-size:11px;color:var(--rd);margin-top:6px;display:none">⚠️ 改單位不會自動換算上面的數量，記得手動把「寄放總量」也一起改成正確的（例如1瓶=30ml，改成ml就要把總量改成30）。</div>`,
  `<button class="btn" onclick="CM()">取消</button>
   <button class="btn btn-p" onclick="saveDepositItemEdit(${itemId},'${depositNo}')">儲存</button>`);
}
window.editDepositItemModal = editDepositItemModal;

function ediCalcFromStock(perStock, unit) {
  const stockQty = parseFloat($('f-edi-stockqty')?.value)||0;
  const total = Math.round(stockQty*perStock*100)/100;
  $('f-edi-qty').value = total;
  $('f-edi-unit').value = unit;
  const r = $('edi-calc-result'); if(r) r.textContent = `＝ ${total} ${unit}`;
}
window.ediCalcFromStock = ediCalcFromStock;

function ediUnitWarn(sel) {
  const warn = $('edi-unit-warn');
  if(warn) warn.style.display = sel.value===sel.dataset.orig ? 'none' : 'block';
}
window.ediUnitWarn = ediUnitWarn;

async function saveDepositItemEdit(itemId, depositNo) {
  const { data:i } = await sb.from('customer_deposit_items').select('used_qty').eq('id',itemId).single();
  const qty = parseFloat(v('edi-qty'))||0;
  if(qty < (i?.used_qty||0)) { toast(`總量不能小於已使用的 ${i.used_qty} ${''}`,'e'); return; }
  await sb.from('customer_deposit_items').update({
    product_name: v('edi-name'), total_qty: qty, unit: v('edi-unit')||'組'
  }).eq('id',itemId);
  toast('✅ 已更新');
  CM();
  viewDepositDetail(depositNo);
}
window.saveDepositItemEdit = saveDepositItemEdit;

// 供 service-orders.js 呼叫：抓某客戶目前有剩餘的寄放品項（回傳的是「品項」，id 是 customer_deposit_items.id）
async function getCustomerDeposits(customerNo) {
  if(!customerNo) return [];
  const { data:deposits } = await sb.from('customer_deposits').select('deposit_no').eq('customer_no',customerNo).eq('is_active',true);
  const depositNos = (deposits||[]).map(d=>d.deposit_no);
  if(!depositNos.length) return [];
  const { data:items } = await sb.from('customer_deposit_items').select('*').in('deposit_no',depositNos);
  const avail = (items||[]).filter(i=>(i.total_qty||0)-(i.used_qty||0)>0);
  // 帶出關聯商品的「每次預設用量」，讓服務單選了之後能自動帶入正確用量
  const prodNos = [...new Set(avail.map(i=>i.product_no).filter(Boolean))];
  if(prodNos.length) {
    const { data:prods } = await sb.from('products').select('product_no,default_service_qty').in('product_no',prodNos);
    const defQtyMap = {}; (prods||[]).forEach(p=>defQtyMap[p.product_no]=p.default_service_qty);
    avail.forEach(i=>{ i.default_service_qty = i.product_no ? (defQtyMap[i.product_no]||1) : 1; });
  }
  return avail;
}
window.getCustomerDeposits = getCustomerDeposits;