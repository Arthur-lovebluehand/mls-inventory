// ═══════════════════════════════════════
// purchase.js
// ═══════════════════════════════════════

async function recordReceipt(no){
  const{data:its}=await sb.from('purchase_order_items').select('*').eq('po_no',no);
  const td=today();
  const rows=(its||[]).map(i=>{
    const total=(i.qty||0)+(i.gift_qty||0), recv=i.received_qty||0, pending=total-recv;
    return '<tr>'
      +'<td style="font-size:12px">'+(i.product_name||'—')+'</td>'
      +'<td class="num">'+fN(i.qty)+'</td>'
      +'<td class="num" style="color:var(--am)">'+(i.gift_qty?fN(i.gift_qty):'—')+'</td>'
      +'<td class="num" style="font-weight:700">'+fN(total)+'</td>'
      +'<td class="num ok">'+fN(recv)+'</td>'
      +'<td><input type="number" id="f-recv-'+i.id+'" value="'+pending+'" min="0" max="'+pending+'"'
      +(pending<=0?' disabled':'')+' style="width:65px;padding:4px 6px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;outline:none'+(pending<=0?';opacity:.4':'')+'">'+'</td>'
      +'<td class="num '+(pending>0?'cr':'')+'">'+fN(pending)+'</td>'
      +'</tr>';
  }).join('');
  const itsJson=JSON.stringify(its);
  OM('記錄收貨：'+no,
    '<div class="al al-w" style="font-size:12px">填入本次實際收到的數量（含贈品），可分批記錄。庫存將自動增加。</div>'
    +'<div class="fl" style="margin-bottom:12px"><label>收貨日期</label><input id="f-rdt2" type="date" value="'+td+'" style="width:180px;padding:7px 8px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;outline:none"></div>'
    +'<table class="itb"><tr><th>商品</th><th>訂購</th><th style="color:var(--am)">贈品</th><th style="font-weight:700">應收總計</th><th>已收</th><th>本次收貨</th><th>未收</th></tr>'
    +rows+'</table>',
    '<button class="btn" onclick="CM()">取消</button>'
    +'<button class="btn btn-p" onclick="doReceipt()">確認收貨</button>');
  window._recvNo=no; window._recvIts=its;
}
async function doReceipt(no,its){
  no=no||window._recvNo; its=its||window._recvIts;
  for(const i of its){
    const recvQty=parseFloat($('f-recv-'+i.id)?.value)||0;
    if(recvQty<=0) continue;
    const newRecv=Math.min((i.qty||0)+(i.gift_qty||0),(i.received_qty||0)+recvQty);
    await sb.from('purchase_order_items').update({received_qty:newRecv}).eq('id',i.id);
    // 增加庫存（已收貨部分）
    const{data:p}=await sb.from('products').select('stock').eq('product_no',i.product_no).single();
    if(p) await sb.from('products').update({stock:p.stock+recvQty}).eq('product_no',i.product_no);
  }
  const{data:updIts}=await sb.from('purchase_order_items').select('qty,gift_qty,received_qty').eq('po_no',no);
  const allDone=(updIts||[]).every(i=>(i.received_qty||0)>=(i.qty||0)+(i.gift_qty||0));
  const partDone=(updIts||[]).some(i=>(i.received_qty||0)>0);
  const status=allDone?'全部收貨':partDone?'部分收貨':'待收貨';
  await sb.from('purchase_orders').update({receipt_status:status,done:allDone}).eq('po_no',no);
  toast('收貨記錄已更新！庫存已增加');CM();purchase();
}
async function purchase(){
  try{
    // 廠商列表
    const{data:vendorList}=await sb.from('purchase_orders').select('vendor_name');
    const puVendors=['全部',...new Set((vendorList||[]).map(x=>x.vendor_name).filter(Boolean)).values()].sort((a,b)=>a==='全部'?-1:b==='全部'?1:a.localeCompare(b));
    window._puVendors=puVendors;
    // 套用使用者排序
    let puVendOrd={};
    try{const{data:pvo}=await sb.from('settings').select('value').eq('key','pu_vendor_order').single();if(pvo?.value)puVendOrd=JSON.parse(pvo.value);}catch(e){}
    window._puSortedVendors=['全部',...puVendors.filter(v=>v!=='全部').sort((a,b)=>(puVendOrd[a]||99)-(puVendOrd[b]||99)||a.localeCompare(b))];
    let pq=sb.from('purchase_orders').select('po_no,po_date,vendor_name,products_summary,total,done,receipt_status',{count:'exact'}).order('po_date',{ascending:false}).order('po_no',{ascending:false});
    if(window.puVendor) pq=pq.eq('vendor_name',window.puVendor);
    if(window.puYM) pq=pq.like('po_date',window.puYM+'%');
    const{data,count}=await pq.range((puP-1)*25,puP*25-1);
    const tp=Math.ceil((count||0)/25);
    $('main').innerHTML=`
    <div class="ph"><div><div class="pt">進貨管理</div><div class="ps">${count||0} 張</div></div>
    <div class="ha"><button class="btn btn-p btn-s" onclick="addPO()">＋ 新增進貨單</button></div></div>
  <div style="padding:0 16px 8px;display:flex;flex-wrap:wrap;gap:8px;align-items:center">
    <input type="month" value="${window.puYM||''}" onchange="window.puYM=this.value||'';puP=1;purchase()"
      style="padding:5px 8px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;background:var(--sf);outline:none">
    ${window.puYM?'<button class="btn btn-s" onclick="window.puYM=\'\';puP=1;purchase()">清除</button>':''}
  </div>
  <div style="display:flex;align-items:center;gap:4px;padding:0 16px 10px">
    <div class="tab-bar" style="flex:1;overflow-x:auto">
      ${(window._puSortedVendors||window._puVendors||['全部']).map(v=>{const sel=v===(window.puVendor||'全部');return '<div class="tab'+(sel?' on':'')+'" onclick="window.puVendor=\''+v+'\';if(window.puVendor===\'全部\')window.puVendor=\'\';puP=1;purchase()" style="white-space:nowrap">'+v+'</div>';}).join('')}
    </div>
    <button onclick="showPuVendorSettings()" title="廠商排序設定"
      style="flex-shrink:0;padding:5px 9px;border:1px solid var(--bd);border-radius:var(--r);background:var(--sf2);cursor:pointer;font-size:14px">⚙</button>
  </div>
  <div class="pc">
    
    <div class="tc">
      <div class="tb"><span class="tt">進貨單列表</span></div>
      <div class="tw"><table>
        <tr><th>進貨單號</th><th>日期</th><th>廠商</th><th>商品摘要</th><th>合計</th><th>進貨</th><th>收貨</th><th>操作</th></tr>
        ${(data||[]).map(p=>`<tr>
          <td style="font-size:11px;font-family:monospace;color:var(--tx2)">${p.po_no}</td>
          <td style="font-size:12px">${fD(p.po_date)}</td>
          <td style="font-weight:500">${p.vendor_name||'—'}</td>
          <td style="font-size:12px;color:var(--tx2);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.products_summary||'—'}</td>
          <td class="num" style="font-weight:600">${fM(p.total)}</td>
          <td><span class="badge ${p.done?'bg':'ba'}">${p.done?'完成':'進行中'}</span></td>
          <td><span class="badge ${p.receipt_status==='全部收貨'?'bg':p.receipt_status==='部分收貨'?'ba':'br2'}">${p.receipt_status||'待收貨'}</span></td>
          <td><div style="display:flex;gap:3px">
            <button class="btn btn-s" onclick="showPO('${p.po_no}')">明細</button>
            <button class="btn btn-s" onclick="editPO('${p.po_no}')">修改</button>
            <button class="btn btn-s" onclick="recordReceipt('${p.po_no}')">收貨記錄</button>
            <button class="btn btn-s" style="color:var(--am);border-color:var(--am)" onclick="returnPO('${p.po_no}')">退貨</button>
            <button class="btn btn-s btn-r" onclick="deletePO('${p.po_no}')">刪除</button>
          </div></td>
        </tr>`).join('')}
      </table></div>
      <div class="pg"><span class="pi">第${puP}/${tp}頁</span>
        <div style="display:flex;gap:5px">
          ${puP>1?`<button class="btn btn-s" onclick="puP--;purchase()">上一頁</button>`:''}
          ${puP<tp?`<button class="btn btn-s" onclick="puP++;purchase()">下一頁</button>`:''}
        </div></div>
    </div></div>`;
  }catch(e){$('main').innerHTML=`<div class="ld" style="color:var(--rd)">載入失敗：${e.message}</div>`;}
  if(window._pendingRestockItems?.length){
    setTimeout(async()=>{
      await loadPOForm();
      setTimeout(()=>{_poItems=window._pendingRestockItems;window._pendingRestockItems=null;renderPOItems();toast('✅ 已帶入商品，請選擇廠商後儲存');},350);
    },300);
  }
}
async function showPO(no){
  const[{data:po},{data:its}]=await Promise.all([
    sb.from('purchase_orders').select('po_no,po_date,vendor_name,payment_method,invoice_no,done,receipt_status,note,subtotal,tax,total').eq('po_no',no).single(),
    sb.from('purchase_order_items').select('*').eq('po_no',no),
  ]);
  OM(`進貨單：${no}`,`
  <div class="dg" style="margin-bottom:13px">
    <div class="dr"><span class="dlb">日期</span><span class="dv">${po?.po_date||'—'}</span></div>
    <div class="dr"><span class="dlb">廠商</span><span class="dv">${po?.vendor_name||'—'}</span></div>
    <div class="dr"><span class="dlb">付款方式</span><span class="dv">${po?.payment_method||'—'}</span></div>
    <div class="dr"><span class="dlb">狀態</span><span class="dv"><span class="badge ${po?.done?'bg':'ba'}">${po?.done?'完成':'進行中'}</span></span></div>
    <div class="dr"><span class="dlb">發票號碼</span><span class="dv" style="font-family:monospace">${po?.invoice_no||'—'}</span></div>
    ${po?.note?`<div class="dr" style="grid-column:1/-1"><span class="dlb">備註</span><span class="dv" style="white-space:pre-wrap">${po.note}</span></div>`:''}
  </div>
  <table class="itb"><tr><th>商品</th><th>規格</th><th>單價</th><th>訂購</th><th style="color:var(--am)">贈品</th><th style="font-weight:700">應收總計</th><th>已收</th><th>待收</th><th>金額</th></tr>
  ${(its||[]).map(i=>{
    const total=(i.qty||0)+(i.gift_qty||0);
    const pending=total-(i.received_qty||0);
    return `<tr>
      <td>${i.product_name||'—'}${(i.gift_qty>0&&!i.qty)?'<span class="badge ba" style="margin-left:4px;font-size:10px">贈品</span>':''}</td>
      <td style="font-size:11px">${i.spec||'—'}</td>
      <td class="num">${i.unit_price?fM(i.unit_price):'<span style="color:var(--am)">$0</span>'}</td>
      <td class="num">${i.qty?fN(i.qty):'—'}</td>
      <td class="num" style="color:var(--am)">${i.gift_qty?fN(i.gift_qty):'—'}</td>
      <td class="num" style="font-weight:700">${fN(total)}</td>
      <td class="num ok">${fN(i.received_qty||0)}</td>
      <td class="num ${pending>0?'cr':''}">${fN(pending)}</td>
      <td class="num">${fM(i.amount)}</td>
    </tr>`;
  }).join('')||'<tr><td colspan="9" style="text-align:center;color:var(--tx3)">無明細</td></tr>'}
  </table>
  <div style="background:var(--sf2);border-radius:var(--r);padding:10px;margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:7px;font-size:13px">
    <span>小計（稅前參考）</span><span class="num" style="text-align:right">${fM(po?.subtotal)}</span>
    <span>稅（含稅，拆算參考）</span><span class="num" style="text-align:right">${fM(po?.tax)}</span>
    <span style="font-weight:700">合計</span><span class="num" style="text-align:right;font-weight:700;color:var(--br)">${fM(po?.total)}</span>
  </div>`,
  `<button class="btn" onclick="CM()">關閉</button>
   <button class="btn" onclick="CM();editPO('${no}')">修改</button>
   <button class="btn btn-p" onclick="CM();recordReceipt('${no}')">📦 收貨記錄</button>
   <button class="btn" style="color:var(--am);border-color:var(--am)" onclick="CM();returnPO('${no}')">退貨</button>`);
}
async function loadPOForm(poData,itsData){
  const[{data:pr},{data:vn}]=await Promise.all([
    sb.from('products').select('product_no,name,spec,cost').eq('is_active',true).order('name'),
    sb.from('vendors').select('vendor_no,name').eq('is_active',true).order('sort_order').order('name'),
  ]);
  _poProds=pr||[]; _vends2=vn||[];
  if(itsData) _poItems=itsData.map((i,idx)=>({id:idx+1,pno:i.product_no,_pname:i.product_name||'',qty:i.qty||0,price:i.unit_price||0,giftQty:i.gift_qty||0,amt:i.amount||0}));
  else _poItems=[{id:1,pno:'',qty:1,price:0,amt:0}];
  const vOpts=_vends2.map(v=>`<option value="${v.vendor_no}">${v.name}</option>`).join('');
  const td=today(), no=poData?.po_no||(await genNo('PO','purchase_orders','po_no'));
  return `
  <div class="fg" style="margin-bottom:13px">
    ${fi('pono','進貨單號','text',no)} ${fi('podt','日期','date',poData?.po_date||td)}
    <div class="fl"><label>選擇廠商</label><select id="f-povend" onchange="pickVend(this.value)"><option value="">選擇廠商…</option>${vOpts}</select></div>
    ${fi('povname','廠商名稱 *','text',poData?.vendor_name)} ${payMethodSel('popay',poData?.payment_method||'交貨付現')}
    ${fi('poinv','發票號碼','text',poData?.invoice_no||'')}
  </div>
  <div style="margin-bottom:10px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px">
      <span style="font-size:12px;font-weight:600;color:var(--tx3)">進貨品項</span>
      <div style="display:flex;gap:5px">
        <button class="btn btn-s" style="background:var(--bll);color:var(--bl);border-color:var(--bl)" onclick="openBundlePicker('po')">＋ 加入套組</button>
        <button class="btn btn-s" onclick="addPOItem()">＋ 單品</button>
      </div>
    </div>
    <div id="poArea"></div>
    <div id="poAmt" style="text-align:right;font-weight:600;padding-top:8px;border-top:1px solid var(--bd);margin-top:6px;font-size:13px"></div>
  </div>
  ${fa('ponote','備註',poData?.note||'')}`;
}
async function addPO(){
  const html=await loadPOForm(null,null);
  OM('新增進貨單',html,`<button class="btn" onclick="CM()">取消</button><button class="btn btn-p" onclick="savePO(false)">建立進貨單</button>`,true);
  renderPOItems();
}
async function editPO(no){
  const[{data:po},{data:its}]=await Promise.all([
    sb.from('purchase_orders').select('po_no,po_date,vendor_name,payment_method,invoice_no,done,receipt_status,note,subtotal,tax,total').eq('po_no',no).single(),
    sb.from('purchase_order_items').select('*').eq('po_no',no),
  ]);
  const html=await loadPOForm(po,its);
  OM(`修改進貨單：${no}`,html,`<button class="btn" onclick="CM()">取消</button><button class="btn btn-p" onclick="savePO('${no}')">儲存修改</button>`,true);
  renderPOItems();
}
window.loadPOForm=loadPOForm;
function renderPOItems(){
  const area=$('poArea');if(!area)return;
  // 加欄位標題（使用跟 item row 相同的 ir-po class，確保欄位對齊）
  const _poHeader='<div class="ir ir-po" style="background:transparent!important;padding:4px 8px;margin-bottom:2px;border-bottom:2px solid var(--bd)">'
    +'<span style="font-size:11px;color:var(--tx3);font-weight:700">商品</span>'
    +'<span style="font-size:11px;color:var(--tx3);font-weight:700;text-align:left">訂購</span>'
    +'<span style="font-size:11px;color:var(--tx3);font-weight:700;text-align:left">進貨價</span>'
    +'<span style="font-size:11px;color:var(--am);font-weight:700;text-align:left">贈品</span>'
    +'<span style="font-size:11px;color:var(--tx3);font-weight:700;text-align:right">小計</span>'
    +'<span></span>'
    +'</div>';
  // 跟 renderItems 相同的套組分組邏輯
  let _html=_poHeader, _prevBG='';
  _poItems.forEach(item=>{
    if(item.bundle_group && item.bundle_group!==_prevBG){
      _prevBG=item.bundle_group;
      const bname=item.bundle_name||item.promo_code||'套組';
      const bItems=_poItems.filter(x=>x.bundle_group===item.bundle_group);
      const bTotal=bItems.reduce((s,x)=>s+(x.amt||0),0);
      _html+='<div style="grid-column:1/-1;background:var(--bll);border-radius:var(--r);padding:5px 10px;font-size:12px;font-weight:600;color:var(--bl);display:flex;justify-content:space-between;margin-bottom:3px">'
        +'<span>📦 '+bname+'</span><span style="font-weight:400;font-size:11px">合計 '+fM(bTotal)+'</span></div>';
    } else if(!item.bundle_group){ _prevBG=''; }

    const borderStyle=item.bundle_group?'border-left:3px solid var(--bl);padding-left:10px':'';
    const giftLabel=(item.giftQty>0&&item.qty===0)?'<div style="grid-column:1/-1;font-size:10px;color:var(--am);font-weight:600;margin-bottom:2px">🎁 贈品（不計費）</div>':'';
    _html+='<div class="ir ir-po" style="'+borderStyle+'">'+giftLabel;

    // 商品搜尋框
    const pname=item._pname||(item.pno?(_poProds.find(p=>p.product_no===item.pno)?.name||item.pno):'');
    _html+='<div style="position:relative">'
      +'<input type="text" id="posrch-'+item.id+'" value="'+pname.replace(/"/g,'&quot;')+'" placeholder="輸入關鍵字搜尋商品…"'
      +' style="font-size:12px;padding:5px 7px;border:1px solid var(--bd);border-radius:var(--r);background:var(--sf);width:100%;outline:none"'
      +' oninput="filterPODrop('+item.id+',this.value)" onfocus="filterPODrop('+item.id+',this.value)"'
      +' onblur="if(!window._ime)setTimeout(()=>closePODrop('+item.id+'),400)"'
      +' oncompositionstart="window._ime=true" oncompositionend="window._ime=false" autocomplete="off">'
      +'<div id="podrop-'+item.id+'" style="position:absolute;top:100%;left:0;right:0;background:var(--sf);border:1px solid var(--bd);border-radius:var(--r);max-height:160px;overflow-y:auto;z-index:500;display:none;box-shadow:0 4px 12px rgba(0,0,0,.1)"></div>'
      +'</div>';

    // 數量
    _html+='<input type="number" value="'+(item.qty||0)+'" min="0"'
      +' onchange="setPOIQ('+item.id+',this.value)"'
      +' style="font-size:12px;padding:5px 7px;border:1px solid var(--bd);border-radius:var(--r);width:100%;outline:none" title="進貨數量">';

    // 進貨價（贈品顯示 $0 且可編輯）
    _html+='<input type="number" value="'+(item.price||0)+'" placeholder="進貨價"'
      +' onchange="setPOIV('+item.id+',this.value)"'
      +' style="font-size:12px;padding:5px 7px;border:1px solid var(--bd);border-radius:var(--r);width:100%;outline:none'
      +(item.bundle_group?';background:var(--sf2)':'')+'">';

    // 贈品數
    _html+='<input type="number" value="'+(item.giftQty||0)+'" min="0"'
      +' onchange="setPOIG('+item.id+',this.value)"'
      +' style="font-size:12px;padding:5px 7px;border:1px solid var(--bd);border-radius:var(--r);width:100%;outline:none;background:var(--aml);color:var(--am)" title="贈品數量">';

    // 金額
    _html+='<span style="font-size:13px;font-weight:500;text-align:right;display:block">'+fM(item.amt)+'</span>';

    // 刪除
    _html+='<button onclick="rmPOItem('+item.id+')" style="background:none;border:none;cursor:pointer;color:var(--rd);font-size:18px;line-height:1">×</button>';
    _html+='</div>';
  });
  area.innerHTML=_html;
  updPOAmt();
}
function updPOAmt(){const el=$('poAmt');if(!el)return;const sub=_poItems.reduce((s,i)=>s+i.amt,0);el.innerHTML=`合計（已含稅）：<span style="color:var(--br)">${fM(sub)}</span>`;}
async function savePO(editNo){
  const no=editNo||v('pono'), vn=v('povname'), dt=v('podt');
  if(!no||!vn){toast('請填寫進貨單號和廠商名稱','e');return;}
  const its=_poItems.filter(i=>i.pno&&((i.qty||0)+(i.giftQty||0))>0);
  const sub=its.reduce((s,i)=>s+i.amt,0),tax=0,total=sub;  // 含稅價，不外加
  const payload={po_date:dt,vendor_name:vn,payment_method:v('popay'),invoice_no:v('poinv')||null,note:v('ponote'),subtotal:sub,tax,total,year_month:ym(dt),products_summary:its.map(i=>(_poProds.find(p=>p.product_no===i.pno)?.name||i.pno)).join('、')};
  if(editNo){
    await sb.from('purchase_order_items').delete().eq('po_no',editNo);
    await sb.from('purchase_orders').update(payload).eq('po_no',editNo);
  } else {
    payload.po_no=no;payload.done=false;
    const{error}=await sb.from('purchase_orders').insert(payload);
    if(error){toast('建立失敗：'+error.message,'e');return;}
  }
  if(its.length){
    await sb.from('purchase_order_items').insert(its.map(i=>{
      const p=_poProds.find(x=>x.product_no===i.pno);
      return {
        po_no:no, product_no:i.pno, product_name:p?.name||i._pname||i.pno,
        spec:p?.spec, unit_price:i.price||0,
        qty:i.qty||0,
        gift_qty:i.giftQty||0,
        amount:i.amt||0,
        po_date:dt,
        promo_code:i.promo_code||null,
        bundle_group:i.bundle_group||null
      };
    }));
    // 庫存由「收貨記錄」按鈕更新，建單時不自動增加
  }
  toast(editNo?'進貨單已修改！':'進貨單建立成功！請按「收貨記錄」確認收到貨後再更新庫存');CM();purchase();
}
async function togglePO(no,done){await sb.from('purchase_orders').update({done:!done}).eq('po_no',no);toast(!done?'已標記完成':'已取消完成');purchase();}
async function returnPO(no) {
  const [{ data: po }, { data: its }] = await Promise.all([
    sb.from('purchase_orders').select('*').eq('po_no', no).single(),
    sb.from('purchase_order_items').select('*').eq('po_no', no),
  ]);
  const td = today();
  const rows = (its || []).map(i => {
    const recvd = i.received_qty || 0;
    return '<tr>'
      + '<td style="font-size:12px">' + (i.product_name || '—') + '</td>'
      + '<td class="num">' + fN(i.qty) + '</td>'
      + '<td class="num ok">' + fN(recvd) + '</td>'
      + '<td><input type="number" id="f-ret-' + i.id + '" value="0" min="0" max="' + recvd + '"'
      + (recvd <= 0 ? ' disabled' : '')
      + ' style="width:65px;padding:4px 6px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;outline:none'
      + (recvd <= 0 ? ';opacity:.4' : '') + '"></td>'
      + '</tr>';
  }).join('');
  const itsJson = JSON.stringify(its);
  OM('進貨退回：' + no,
    '<div class="al al-w" style="font-size:12px">退回的數量會從庫存中扣除，並建立退貨記錄。</div>'
    + '<div class="fl" style="margin-bottom:12px"><label>退貨原因 *</label>'
    + '<textarea id="f-preason" rows="2" placeholder="例：品質問題、數量有誤、收到錯誤商品…" style="width:100%;padding:7px 8px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;outline:none"></textarea></div>'
    + '<div class="fl" style="margin-bottom:12px"><label>退貨日期</label>'
    + '<input id="f-prdate" type="date" value="' + td + '" style="width:160px;padding:7px 8px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;outline:none"></div>'
    + '<table class="itb"><tr><th>商品</th><th>進貨數</th><th>已收</th><th>退回數量</th></tr>'
    + rows + '</table>',
    '<button class="btn" onclick="CM()">取消</button>'
    + '<button class="btn btn-r" onclick="doReturnPO(\'' + no + '\',' + itsJson + ')">確認退貨</button>'
  );
  window._retPONo = no;
  window._retPOIts = its;
}
async function doReturnPO(no, its) {
  no = no || window._retPONo;
  its = its || window._retPOIts;
  const reason = $('f-preason')?.value?.trim();
  if (!reason) { toast('請填寫退貨原因', 'e'); return; }
  const rdate = $('f-prdate')?.value || today();

  const retItems = [];
  for (const i of (its || [])) {
    const qty = parseFloat($('f-ret-' + i.id)?.value) || 0;
    if (qty > 0) retItems.push({ ...i, retQty: qty });
  }
  if (!retItems.length) { toast('請至少填入一項退回數量', 'e'); return; }

  // 產生退貨單號
  const rno = await genNo('PR', 'purchase_returns', 'return_no');
  const total = retItems.reduce((s, i) => s + (i.unit_price || 0) * i.retQty, 0);

  // 寫入退貨主檔
  const { data: po } = await sb.from('purchase_orders').select('vendor_name').eq('po_no', no).single();
  await sb.from('purchase_returns').insert({
    return_no: rno, po_no: no, return_date: rdate,
    vendor_name: po?.vendor_name, reason, total
  });

  // 寫入退貨明細
  await sb.from('purchase_return_items').insert(retItems.map(i => ({
    return_no: rno, product_no: i.product_no, product_name: i.product_name,
    spec: i.spec, qty: i.retQty, unit_price: i.unit_price || 0,
    amount: (i.unit_price || 0) * i.retQty
  })));

  // 扣回庫存
  for (const i of retItems) {
    const { data: p } = await sb.from('products').select('stock').eq('product_no', i.product_no).single();
    if (p) await sb.from('products').update({ stock: Math.max(0, p.stock - i.retQty) }).eq('product_no', i.product_no);
  }

  // 記錄日誌
  await logAction('return', 'purchase_orders', no,
    `進貨退回 ${no} → ${rno}，原因：${reason}，退回 ${retItems.length} 項，金額 ${fM(total)}`,
    null, { return_no: rno, items: retItems }
  );

  toast(`退貨記錄 ${rno} 已建立，庫存已扣除`);
  CM();
  purchase();
}
async function deletePO(no) {
  const { data: its } = await sb.from('purchase_order_items').select('*').eq('po_no', no);
  const { data: po } = await sb.from('purchase_orders').select('*').eq('po_no', no).single();

  const hasReceived = (its || []).some(i => (i.received_qty || 0) > 0);
  const confirmMsg = `確定刪除整筆進貨單 ${no}？\n\n`
    + (hasReceived ? '⚠ 此單已有收貨記錄，庫存將自動扣回！\n\n' : '')
    + '此操作無法復原，操作記錄將被保留。';

  if (!confirm(confirmMsg)) return;

  // 若已有收貨，逆轉庫存
  if (hasReceived) {
    for (const i of (its || [])) {
      const recvd = i.received_qty || 0;
      if (recvd > 0) {
        const { data: p } = await sb.from('products').select('stock').eq('product_no', i.product_no).single();
        if (p) await sb.from('products').update({ stock: Math.max(0, p.stock - recvd) }).eq('product_no', i.product_no);
      }
    }
  }

  await sb.from('purchase_order_items').delete().eq('po_no', no);
  await sb.from('purchase_orders').delete().eq('po_no', no);

  await logAction('delete', 'purchase_orders', no,
    '刪除整筆進貨單 ' + no + (hasReceived ? '（含庫存逆轉）' : ''),
    { po, items: its }
  );

  toast('進貨單已刪除' + (hasReceived ? '，庫存已逆轉' : '') + '，操作已記錄');
  purchase();
}
window.returnPO = returnPO;
window.doReturnPO = doReturnPO;
window.deletePO = deletePO;