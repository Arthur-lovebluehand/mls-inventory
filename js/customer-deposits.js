// ═══════════════════════════════════════
// customer-deposits.js — 客戶寄放庫存
// 客戶已買斷（走過正常銷售訂單）但物理上放在店裡分次使用/取回的商品
// 結構比照訂單：一張寄放單（customer_deposits）可以有多個品項（customer_deposit_items）
// ═══════════════════════════════════════

var cdSearch = '';

var cdStatusFilter = 'active'; // active | used | closed | all
async function customerDeposits() {
  let q = sb.from('customer_deposits').select('*');
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
  // 狀態篩選
  const statusOf = d => {
    const its = itemsByDeposit[d.deposit_no]||[];
    const remain = its.reduce((s,i)=>s+((i.total_qty||0)-(i.used_qty||0))+Math.max(0,(i.opened_qty||0)-(i.opened_used_qty||0)),0);
    return d.is_active===false ? 'closed' : remain<=0 ? 'used' : 'active';
  };
  if(cdStatusFilter!=='all') list = list.filter(d=>statusOf(d)===cdStatusFilter);
  // 依客戶姓名排序，讓同一個人的寄放記錄聚在一起，同一客戶內再依日期新到舊
  list.sort((a,b)=> a.customer_name.localeCompare(b.customer_name,'zh-TW') || (b.deposit_date||'').localeCompare(a.deposit_date||''));

  const statusTabs = [
    {k:'active',label:'寄放中'},{k:'used',label:'已用完'},{k:'closed',label:'已關閉'},{k:'all',label:'全部'}
  ];

  $('main').innerHTML = `
  <div class="ph"><div><div class="pt">客戶寄放庫存</div><div class="ps">${list.length} 張</div></div>
    <div class="ha"><button class="btn btn-p btn-s" onclick="addDepositModal()">＋ 新增寄放記錄</button></div></div>
  <div class="pc">
    <div class="al al-w" style="font-size:12px;margin-bottom:12px">
      客戶已經買斷、算過帳的商品，只是放在店裡讓她分次使用或之後取回。這裡的數量增減<b>不會</b>影響店裡自己的商品庫存。
    </div>
    <div class="tab-bar" style="margin-bottom:12px">
      ${statusTabs.map(t=>`<div class="tab${cdStatusFilter===t.k?' on':''}" onclick="cdStatusFilter='${t.k}';customerDeposits()">${t.label}</div>`).join('')}
    </div>
    <div class="tc">
      <div class="tb"><span class="tt">寄放清單</span>
        <div class="si"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input placeholder="客戶姓名/商品名稱…（輸入後按 Enter 搜尋）" value="${cdSearch}" onkeydown="if(event.key==='Enter'){cdSearch=this.value;customerDeposits();}"></div>
      </div>
      <div class="tw"><table style="width:100%">
        <tr><th>客戶</th><th>單號</th><th>商品摘要</th><th>寄放日</th><th>來源訂單</th><th>狀態</th><th>操作</th></tr>
        ${list.map(d=>{
          const its = itemsByDeposit[d.deposit_no]||[];
          const totalRemain = its.reduce((s,i)=>s+((i.total_qty||0)-(i.used_qty||0))+Math.max(0,(i.opened_qty||0)-(i.opened_used_qty||0)),0);
          const summary = its.map(i=>i.product_name).join('、')||'—';
          const status = d.is_active===false ? '已關閉' : totalRemain<=0 ? '已用完' : '寄放中';
          return `<tr style="${d.is_active===false?'opacity:.5':''}">
            <td style="font-weight:500">${d.customer_name}</td>
            <td style="font-size:11px;color:var(--tx3)">${d.deposit_no}</td>
            <td style="font-size:13px">${summary}</td>
            <td style="font-size:12px">${fD(d.deposit_date)}</td>
            <td style="font-size:11px;color:var(--tx3)">${d.source_order_no||'手動登記'}</td>
            <td><span class="badge ${status==='寄放中'?'bg':'br2'}">${status}</span></td>
            <td style="white-space:nowrap">
              ${totalRemain>0?`<button class="btn btn-s" onclick="useDepositModal('${d.deposit_no}')">登記使用/取回</button>`:''}
              <button class="btn btn-s" onclick="viewDepositDetail('${d.deposit_no}')">明細</button>
              <button class="btn btn-s btn-r" onclick="dDeposit('${d.deposit_no}')">刪除</button>
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
      <input id="f-cd-ordersearch" type="text" placeholder="例如 SO-20260813-001 或 王小姐" autocomplete="off" oninput="cdSearchOrders(this.value)"
        style="width:100%;padding:7px 8px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;outline:none">
    </div>
    <div id="cd-order-results" style="max-height:320px;overflow-y:auto;margin-bottom:10px"></div>
    <div id="cd-order-items"></div>
    <div class="fl" style="margin-bottom:10px;max-width:200px">${fi('cd-order-date','寄放日期','date',today())}</div>
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
  if(!kw || !kw.trim()) { $('cd-order-results').innerHTML=''; return; } // 中文姓氏常常一個字就有意義（吳/楊/廖…），不能要求至少打2個字才開始搜尋
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
      const svcUnit = prod?.service_unit||'';
      const saleQtyTotal = (i.qty||0)+(i.gift_qty||0);
      // 寄放數量預設用「跟訂單一樣的實體單位」（幾瓶/幾條），不要自動換算成 ml——
      // ml 是「服務時用掉多少」才該出現的單位，不該混進「她放了幾瓶在店裡」這個數字。
      window._cdOrderMeta[idx] = { product_no:i.product_no, item_id:i.id, perStock, saleQtyTotal, alreadyShipped:i.shipped_qty||0 };
      return `<tr>
      <td style="font-size:12px">${i.product_name}${i.gift_qty?`<div style="font-size:10px;color:var(--am)">含贈品${i.gift_qty}${i.unit||'個'}</div>`:''}${perStock>1?`<div style="font-size:10px;color:var(--tx3)">開封後每${i.unit||'個'}可服務用掉${perStock}${svcUnit}（服務單登記時才會用到這個換算）</div>`:''}</td>
      <td class="num">${saleQtyTotal}${i.unit||'個'}</td>
      <td><input type="number" id="cd-itqty-${idx}" value="${saleQtyTotal}" min="0" step="1" style="width:70px;padding:4px 6px;border:1px solid var(--bd);border-radius:var(--r);font-size:12px"></td>
      <td><input type="text" id="cd-itunit-${idx}" value="${i.unit||'個'}" style="width:50px;padding:4px 6px;border:1px solid var(--bd);border-radius:var(--r);font-size:12px"></td>
    </tr>`;
    }).join('')}
  </table>`;
  window._cdOrderItems = its||[];
}
window.cdPickOrder = cdPickOrder;

function cdFilterCust(kw) {
  const drop = $('cd-cust-drop');
  clearTimeout(window._cdCustTimer);
  window._cdCustTimer = setTimeout(async ()=>{
    let q = sb.from('customers').select('customer_no,name,phone').order('name').limit(300);
    if(kw) q = q.ilike('name',`%${kw}%`);
    const { data } = await q;
    drop.innerHTML = (data||[]).map(c=>
      `<div style="padding:7px 8px;cursor:pointer;font-size:13px" onmousedown="cdPickCust('${c.customer_no}','${c.name.replace(/'/g,"\\'")}')">${c.name}（${c.phone||'—'}）</div>`
    ).join('') || '<div style="padding:7px 8px;font-size:12px;color:var(--tx3)">查無客戶</div>';
    drop.classList.add('open');
  }, 250);
}
window.cdFilterCust = cdFilterCust;

function cdFilterManualProd(kw) {
  const drop = $('cd-pname-drop');
  clearTimeout(window._cdProdTimer);
  window._cdProdTimer = setTimeout(async ()=>{
    let q = sb.from('products').select('product_no,name,unit').eq('is_active',true).order('product_no').limit(30);
    if(kw) q = q.ilike('name',`%${kw}%`);
    const { data } = await q;
    drop.innerHTML = (data||[]).map(p=>
      `<div style="padding:7px 8px;cursor:pointer;font-size:13px" onmousedown="cdPickManualProd('${p.product_no}','${p.name.replace(/'/g,"\\'")}','${(p.unit||'個').replace(/'/g,"\\'")}')">${p.name}${p.unit?`（單位：${p.unit}）`:''}</div>`
    ).join('') || '<div style="padding:7px 8px;font-size:12px;color:var(--tx3)">查無商品，可直接手動輸入名稱</div>';
    drop.classList.add('open');
  }, 250);
}
window.cdFilterManualProd = cdFilterManualProd;
function cdPickManualProd(pno,name,unit) {
  // 寄放數量用商品本身的實體單位（瓶/條/罐…），不要用服務用的 ml 換算單位——那個是服務時才用到的
  $('cd-pname').value = name;
  $('f-cd-unit').value = unit||'個';
  if($('f-cd-qty')) $('f-cd-qty').value = 1;
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
  const depositDate = mode==='order' ? (v('cd-order-date')||today()) : (v('cd-date')||today());
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
      // 寄放數量現在直接就是訂單的實體單位（瓶/條），跟訂購數量是同一個單位，不用再除換算比例
      const newShipped = Math.min(meta.saleQtyTotal||0, (meta.alreadyShipped||0)+qty);
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
// 總量/剩餘永遠是「整瓶」（跟她寄放時的實體單位一致），這樣清單看起來才直覺。
// ml 只有在「服務使用」而且這個商品有設定換算比例時才會出現——那是店內開瓶後，
// 這次服務實際用掉多少的概念，比照「商品撥轉到服務庫存」的邏輯：
//   ・已開封但還沒用完的量（opened_qty − opened_used_qty）不夠這次用量時，
//     系統會自動幫你「開一瓶新的」（整瓶數 −1，開封額度 +這瓶的ml），不用你自己先手動開瓶。
// 「客戶取回」「其他」這兩種類型，填的都是整瓶數，不會動到開封額度。
async function useDepositModal(depositNo) {
  const [{ data:d },{ data:its }] = await Promise.all([
    sb.from('customer_deposits').select('*').eq('deposit_no',depositNo).single(),
    sb.from('customer_deposit_items').select('*').eq('deposit_no',depositNo),
  ]);
  if(!d) return;
  const productNos = [...new Set((its||[]).map(i=>i.product_no).filter(Boolean))];
  let prodMap = {};
  if(productNos.length) {
    const { data:prods } = await sb.from('products').select('product_no,service_unit,service_units_per_stock').in('product_no',productNos);
    (prods||[]).forEach(p=>prodMap[p.product_no]=p);
  }
  window._udMeta = {};
  const rows = its.map(i=>{
    const bottleRemain = (i.total_qty||0)-(i.used_qty||0);
    const openedRemain = Math.round((((i.opened_qty||0)-(i.opened_used_qty||0)))*100)/100;
    const prod = prodMap[i.product_no];
    const perStock = parseFloat(prod?.service_units_per_stock)||0;
    const hasRatio = perStock>1 && !!prod?.service_unit;
    const svcUnit = prod?.service_unit||'';
    window._udMeta[i.id] = { hasRatio, perStock, svcUnit, itemUnit:i.unit };
    const canUse = bottleRemain>0 || openedRemain>0;
    return `<tr>
      <td style="font-size:12px">${i.product_name}${hasRatio?`<div style="font-size:10px;color:var(--tx3)">已開封剩 ${openedRemain} ${svcUnit} 可服務用${bottleRemain>0?'（不夠會自動開新瓶）':''}</div>`:''}</td>
      <td class="num">${i.total_qty} ${i.unit}</td>
      <td class="num ok">${i.used_qty||0} ${i.unit}</td>
      <td class="num" style="font-weight:700">${bottleRemain} ${i.unit}</td>
      <td>
        <input type="number" id="cd-use-${i.id}" value="0" min="0" step="${hasRatio?'0.5':'1'}" ${canUse?'':'disabled'}
          style="width:80px;padding:4px 6px;border:1px solid var(--bd);border-radius:var(--r);font-size:12px${canUse?'':';opacity:.4'}"
          oninput="cdUseQtyHint(${i.id})">
        <div style="font-size:10px;color:var(--tx3);margin-top:2px" id="cd-usehint-${i.id}">${hasRatio?`目前類型：填 ${svcUnit} 數`:`填${i.unit}數`}</div>
      </td>
      <td>
        <select id="cd-usetype-${i.id}" ${canUse?'':'disabled'} onchange="cdUseQtyHint(${i.id})" style="width:100%;padding:5px 6px;border:1px solid var(--bd);border-radius:var(--r);font-size:12px">
          <option value="服務使用">服務使用（店內用掉）</option>
          <option value="客戶取回">客戶取回（整${i.unit}拿走）</option>
          <option value="其他">其他（整${i.unit}）</option>
        </select>
      </td>
    </tr>`;
  }).join('');
  OM(`登記使用／取回：${d.customer_name}（${depositNo}）`, `
  <div class="al al-w" style="font-size:11px;margin-bottom:10px">同一次可以登記好幾個商品，每個商品自己選「服務使用」還是「客戶取回」，不用分兩次登記。「服務使用」填的是這次用掉多少（有換算比例的商品填 ml 這類服務單位）；「客戶取回／其他」填的是整瓶數。</div>
  <div style="max-width:220px;margin-bottom:10px">${fi('ud-date','日期','date',today())}</div>
  <div style="overflow-x:auto"><table class="itb"><tr><th>商品</th><th>總量</th><th>已用/取回</th><th>剩餘瓶數</th><th>本次數量</th><th>類型</th></tr>${rows}</table></div>
  <div style="margin-top:10px">${fi('ud-note','備註（選填，會套用在這次登記的所有品項）')}</div>`,
  `<button class="btn" onclick="CM()">取消</button>
   <button class="btn btn-p" onclick="saveDepositUsage('${depositNo}')">確認</button>`,true);
  window._udItems = its;
}
window.useDepositModal = useDepositModal;

// 類型切換時，更新旁邊那行小提示字，告訴使用者現在填的數字單位是什麼
function cdUseQtyHint(itemId) {
  const meta = (window._udMeta||{})[itemId]||{};
  const type = $('cd-usetype-'+itemId)?.value||'服務使用';
  const hint = $('cd-usehint-'+itemId);
  const qtyEl = $('cd-use-'+itemId);
  if(!hint) return;
  if(type==='服務使用' && meta.hasRatio) {
    hint.textContent = `目前類型：填 ${meta.svcUnit} 數`;
    if(qtyEl) qtyEl.step = '0.5';
  } else {
    hint.textContent = `填整${meta.itemUnit||'個'}數`;
    if(qtyEl) qtyEl.step = '1';
  }
}
window.cdUseQtyHint = cdUseQtyHint;

async function saveDepositUsage(depositNo) {
  const date = v('ud-date')||today();
  const note = v('ud-note')||null;
  const items = window._udItems||[];
  const meta = window._udMeta||{};
  let any=false;
  for(const i of items) {
    const qty = parseFloat($('cd-use-'+i.id)?.value)||0;
    if(qty<=0) continue;
    const type = $('cd-usetype-'+i.id)?.value||'服務使用';
    const m = meta[i.id]||{};
    any=true;
    if(type==='服務使用' && m.hasRatio) {
      // ml（服務單位）為主的用量：先扣已開封剩餘的，不夠再自動開新瓶
      const openedRemain = (i.opened_qty||0)-(i.opened_used_qty||0);
      const shortfall = qty-openedRemain;
      let bottlesToOpen = 0;
      if(shortfall>0) bottlesToOpen = Math.ceil(shortfall/m.perStock);
      const bottleAvail = (i.total_qty||0)-(i.used_qty||0);
      if(bottlesToOpen>0 && bottlesToOpen>bottleAvail) { toast(`「${i.product_name}」剩餘瓶數不夠開瓶（只剩${bottleAvail}${i.unit}，這次還需要再開${bottlesToOpen}${i.unit}）`,'e'); return; }
      const newOpenedQty = (i.opened_qty||0)+bottlesToOpen*m.perStock;
      const newUsedQty = (i.used_qty||0)+bottlesToOpen;
      const finalNote = [note, bottlesToOpen>0?`（自動開了${bottlesToOpen}${i.unit}）`:''].filter(Boolean).join(' ')||null;
      await sb.from('customer_deposit_items').update({
        used_qty:newUsedQty, opened_qty:newOpenedQty, opened_used_qty:(i.opened_used_qty||0)+qty
      }).eq('id',i.id);
      await sb.from('customer_deposit_usages').insert({
        deposit_item_id:i.id, use_date:date, qty_used:qty, use_type:type, note:finalNote, unit:m.svcUnit
      });
    } else {
      // 整瓶為主的登記（客戶取回／其他／沒有換算比例的商品）
      const bottleRemain = (i.total_qty||0)-(i.used_qty||0);
      if(qty>bottleRemain) { toast(`「${i.product_name}」超過剩餘${i.unit}數`,'e'); return; }
      await sb.from('customer_deposit_items').update({used_qty:(i.used_qty||0)+qty}).eq('id',i.id);
      await sb.from('customer_deposit_usages').insert({
        deposit_item_id:i.id, use_date:date, qty_used:qty, use_type:type, note, unit:i.unit
      });
    }
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
    ${its.map(i=>{
      const openedRemain = Math.round((((i.opened_qty||0)-(i.opened_used_qty||0)))*100)/100;
      return `<tr>
      <td style="font-size:12px">${i.product_name}${openedRemain>0?`<div style="font-size:10px;color:var(--tx3)">已開封剩 ${openedRemain}（服務用）</div>`:''}</td>
      <td class="num">${i.total_qty} ${i.unit}</td>
      <td class="num">${i.used_qty||0} ${i.unit}</td>
      <td class="num" style="font-weight:700">${(i.total_qty||0)-(i.used_qty||0)} ${i.unit}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-s" onclick="editDepositItemModal(${i.id},'${depositNo}')">編輯</button>
        <button class="btn btn-s btn-r" onclick="dDepositItem(${i.id},'${depositNo}')">刪除</button>
      </td>
    </tr>`;}).join('')}
  </table>
  <div style="margin-top:14px;font-size:13px;font-weight:600">使用/取回記錄</div>
  <table class="itb"><tr><th>日期</th><th>商品</th><th>類型</th><th>數量</th><th>備註</th></tr>
    ${(uses||[]).map(u=>{ const it=itemMap[u.deposit_item_id]; return `<tr>
      <td style="font-size:12px">${fD(u.use_date)}</td>
      <td style="font-size:12px">${it?.product_name||'—'}</td>
      <td><span class="badge ${u.use_type==='服務使用'?'bg':'ba'}" style="font-size:10px">${u.use_type}</span></td>
      <td class="num">${u.qty_used} ${u.unit||it?.unit||''}</td>
      <td style="font-size:12px;color:var(--tx3)">${u.note||u.service_order_no||'—'}</td>
    </tr>`;}).join('')||'<tr><td colspan="5" style="text-align:center;color:var(--tx3)">尚無使用記錄</td></tr>'}
  </table>`,
  `<button class="btn" onclick="CM()">關閉</button>
   <button class="btn btn-r" onclick="dDeposit('${depositNo}')">刪除整張寄放單</button>`);
}
window.viewDepositDetail = viewDepositDetail;

// ── 刪除（整張寄放單 / 單一品項）──
// 使用者確認過：就算這筆已經登記過使用/取回記錄，只要按刪除就一併刪掉，不擋。
async function dDeposit(depositNo) {
  const [{ data:dep },{ data:its }] = await Promise.all([
    sb.from('customer_deposits').select('*').eq('deposit_no',depositNo).single(),
    sb.from('customer_deposit_items').select('*').eq('deposit_no',depositNo),
  ]);
  if(!dep) { toast('找不到這張寄放單','e'); return; }
  const hasUsage = (its||[]).some(i=>(i.used_qty||0)>0);
  if(!confirm(`確定刪除整張寄放單 ${depositNo}（${dep.customer_name}）？\n\n此操作會：\n・刪除這張寄放單及底下所有品項${hasUsage?'\n・一併刪除已登記過的使用/取回記錄（如果裡面有些是從服務單自動產生的，對應的服務單本身不會被刪，只是這裡的關聯記錄會一起消失）':''}\n・不會影響店裡自己的商品庫存\n\n此動作無法復原。`)) return;
  const itemIds = (its||[]).map(i=>i.id);
  if(itemIds.length) await sb.from('customer_deposit_usages').delete().in('deposit_item_id',itemIds);
  await sb.from('customer_deposit_items').delete().eq('deposit_no',depositNo);
  await sb.from('customer_deposits').delete().eq('deposit_no',depositNo);
  await logAction('delete','customer_deposits',depositNo,'刪除客戶寄放單 '+depositNo,{deposit:dep,items:its});
  toast('寄放單已刪除，操作已記錄');
  CM();
  customerDeposits();
}
window.dDeposit = dDeposit;

async function dDepositItem(itemId, depositNo) {
  const { data:i } = await sb.from('customer_deposit_items').select('*').eq('id',itemId).single();
  if(!i) { toast('找不到這個品項','e'); return; }
  const hasUsage = (i.used_qty||0)>0;
  if(!confirm(`確定刪除品項「${i.product_name}」？${hasUsage?'\n\n這個品項已經有使用/取回記錄，會一併刪除。':''}\n\n此動作無法復原。`)) return;
  await sb.from('customer_deposit_usages').delete().eq('deposit_item_id',itemId);
  await sb.from('customer_deposit_items').delete().eq('id',itemId);
  await logAction('delete','customer_deposit_items',String(itemId),`刪除客戶寄放品項「${i.product_name}」（${depositNo}）`,i);
  toast('✅ 品項已刪除');
  const { count } = await sb.from('customer_deposit_items').select('id',{count:'exact',head:true}).eq('deposit_no',depositNo);
  if(!count && confirm('這張寄放單已經沒有任何品項了，要一併刪除整張寄放單嗎？')) {
    const { data:dep } = await sb.from('customer_deposits').select('*').eq('deposit_no',depositNo).single();
    await sb.from('customer_deposits').delete().eq('deposit_no',depositNo);
    await logAction('delete','customer_deposits',depositNo,'刪除客戶寄放單 '+depositNo+'（品項刪光後一併清除）',dep);
    CM();
    customerDeposits();
    return;
  }
  viewDepositDetail(depositNo);
}
window.dDepositItem = dDepositItem;

async function editDepositItemModal(itemId, depositNo) {
  const { data:i } = await sb.from('customer_deposit_items').select('*').eq('id',itemId).single();
  if(!i) return;

  // 總量/單位一律是實體單位（瓶/條/罐…），不管有沒有連到真正的商品都一樣直接編輯，
  // 不用再換算 ml——ml 只在「服務使用」記錄時才會出現。
  let prod = null;
  if(i.product_no) {
    const { data:p } = await sb.from('products').select('service_unit,service_units_per_stock,unit').eq('product_no',i.product_no).maybeSingle();
    prod = p;
  }
  const hasRatio = prod && prod.service_unit && parseFloat(prod.service_units_per_stock)>1;

  OM(`編輯品項：${i.product_name}`, `
  <div class="al al-w" style="font-size:12px;margin-bottom:10px">已使用/取回 ${i.used_qty||0} ${i.unit}，總量不能改到比已使用的還少。${hasRatio?`<br>這個商品開封後可服務用掉：1${i.unit}＝${prod.service_units_per_stock}${prod.service_unit}（登記「服務使用」時才會用到）。`:''}</div>
  ${fi('edi-name','商品名稱','text',i.product_name)}
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">
    ${fi('edi-qty','寄放總量','number',i.total_qty)}
    <div class="fl"><label>單位</label>
      <select id="f-edi-unit" data-orig="${i.unit}" onchange="ediUnitWarn(this)" style="width:100%;padding:7px 8px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px">
        ${['個','瓶','條','罐','盒','組','片','次','顆'].map(u=>`<option value="${u}" ${u===i.unit?'selected':''}>${u}</option>`).join('')}
      </select>
    </div>
  </div>
  <div id="edi-unit-warn" style="font-size:11px;color:var(--rd);margin-top:6px;display:none">⚠️ 改單位不會自動換算上面的數量，記得手動確認「寄放總量」還是正確的。</div>`,
  `<button class="btn" onclick="CM()">取消</button>
   <button class="btn btn-p" onclick="saveDepositItemEdit(${itemId},'${depositNo}')">儲存</button>`);
}
window.editDepositItemModal = editDepositItemModal;

function ediUnitWarn(sel) {
  const warn = $('edi-unit-warn');
  if(warn) warn.style.display = sel.value===sel.dataset.orig ? 'none' : 'block';
}
window.ediUnitWarn = ediUnitWarn;

async function saveDepositItemEdit(itemId, depositNo) {
  const { data:i } = await sb.from('customer_deposit_items').select('used_qty,unit').eq('id',itemId).single();
  const qty = parseFloat(v('edi-qty'))||0;
  if(qty < (i?.used_qty||0)) { toast(`總量不能小於已使用的 ${i.used_qty} ${i.unit||''}`,'e'); return; }
  await sb.from('customer_deposit_items').update({
    product_name: v('edi-name'), total_qty: qty, unit: v('edi-unit')||'組'
  }).eq('id',itemId);
  toast('✅ 已更新');
  CM();
  viewDepositDetail(depositNo);
}
window.saveDepositItemEdit = saveDepositItemEdit;

// 供 service-orders.js 呼叫：抓某客戶目前有剩餘的寄放品項（回傳的是「品項」，id 是 customer_deposit_items.id）
// total_qty/used_qty 是整瓶數；opened_qty/opened_used_qty 是這瓶開封後、可供服務用掉的量（ml等）——
// 只要還有整瓶或還有開封剩餘，都算「有剩」，服務單那邊會自動處理開新瓶的邏輯。
async function getCustomerDeposits(customerNo) {
  if(!customerNo) return [];
  const { data:deposits } = await sb.from('customer_deposits').select('deposit_no').eq('customer_no',customerNo).eq('is_active',true);
  const depositNos = (deposits||[]).map(d=>d.deposit_no);
  if(!depositNos.length) return [];
  const { data:items } = await sb.from('customer_deposit_items').select('*').in('deposit_no',depositNos);
  const avail = (items||[]).filter(i=>((i.total_qty||0)-(i.used_qty||0))>0 || ((i.opened_qty||0)-(i.opened_used_qty||0))>0);
  // 帶出關聯商品的「服務單位換算」跟「每次預設用量」，讓服務單知道這瓶開封後要用哪個單位計算、預設用量帶多少
  const prodNos = [...new Set(avail.map(i=>i.product_no).filter(Boolean))];
  let prodMap = {};
  if(prodNos.length) {
    const { data:prods } = await sb.from('products').select('product_no,default_service_qty,service_unit,service_units_per_stock').in('product_no',prodNos);
    (prods||[]).forEach(p=>prodMap[p.product_no]=p);
  }
  avail.forEach(i=>{
    const p = i.product_no ? prodMap[i.product_no] : null;
    i.default_service_qty = p?.default_service_qty||1;
    i.perStock = parseFloat(p?.service_units_per_stock)||1;
    i.service_unit = p?.service_unit||null;
  });
  return avail;
}
window.getCustomerDeposits = getCustomerDeposits;