// ═══════════════════════════════════════
// orders.js
// ═══════════════════════════════════════

async function orders(){
  try{
    let q=sb.from('sales_orders').select('order_no,order_date,customer_name,agent_level,subtotal,total,payment_done,is_return,status,ship_status',{count:'exact'}).order('order_date',{ascending:false}).order('order_no',{ascending:false});
    if(oS) q=q.or(`order_no.ilike.%${oS}%,customer_name.ilike.%${oS}%`);
    if(oF==='unpaid') q=q.eq('payment_done',false);
    if(oF==='return') q=q.eq('is_return',true);
    const{data,count}=await q.range((oP-1)*30,oP*30-1);
    const tp=Math.ceil((count||0)/30);
    $('main').innerHTML=`
    <div class="ph"><div><div class="pt">銷售訂單</div><div class="ps">${count||0} 張</div></div>
      <div class="ha"><button class="btn btn-p btn-s" onclick="addOrder()">＋ 新增訂單</button></div></div>
    <div class="pc">
      <div class="tab-bar">
        <div class="tab ${oF==='all'?'on':''}" onclick="oF='all';oP=1;orders()">全部</div>
        <div class="tab ${oF==='unpaid'?'on':''}" onclick="oF='unpaid';oP=1;orders()">未收款</div>
        <div class="tab ${oF==='return'?'on':''}" onclick="oF='return';oP=1;orders()">退貨</div>
      </div>
      <div class="tc">
        <div class="tb"><span class="tt">訂單列表</span>
          <div class="si"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input placeholder="訂單號/客戶名稱…" value="${oS}" oninput="oS=this.value;oP=1;orders()"></div>
        </div>
        <div class="tw"><table>
          <tr><th>訂單號</th><th>日期</th><th>客戶</th><th>位階</th><th>小計</th><th>總金額</th><th>收款</th><th>操作</th></tr>
          ${(data||[]).map(o=>`<tr>
            <td style="font-size:11px;font-family:monospace;color:var(--tx2)">${o.order_no}</td>
            <td style="font-size:12px">${fD(o.order_date)}</td>
            <td style="font-weight:500">${o.customer_name||'—'}</td>
            <td>${lvBadge(o.agent_level)}</td>
            <td class="num">${fM(o.subtotal)}</td>
            <td class="num" style="font-weight:600">${fM(o.total)}</td>
            <td><span class="badge ${o.payment_done?'bg':'br2'}">${o.payment_done?'已收':'未收'}</span></td>
            <td><span class="badge ${o.ship_status==='全部出貨'?'bg':o.ship_status==='部分出貨'?'ba':'br2'}">${o.ship_status||'待出貨'}</span></td>
            <td><div style="display:flex;gap:3px">
              <button class="btn btn-s" onclick="showOrder('${o.order_no}')">明細</button>
              <button class="btn btn-s" onclick="editOrder('${o.order_no}')">修改</button>
              <button class="btn btn-s" onclick="recordShipment('${o.order_no}')">出貨記錄</button>
              <button class="btn btn-s" onclick="printOrder('${o.order_no}')">列印</button>
              <button class="btn btn-s" onclick="togglePay('${o.order_no}',${o.payment_done})">${o.payment_done?'取消收款':'標記收款'}</button>
            </div></td>
          </tr>`).join('')}
        </table></div>
        <div class="pg"><span class="pi">第${oP}/${tp}頁</span>
          <div style="display:flex;gap:5px">
            ${oP>1?`<button class="btn btn-s" onclick="oP--;orders()">上一頁</button>`:''}
            ${oP<tp?`<button class="btn btn-s" onclick="oP++;orders()">下一頁</button>`:''}
          </div></div>
      </div>
    </div>`;
  }catch(e){$('main').innerHTML=`<div class="ld" style="color:var(--rd)">載入失敗：${e.message}</div>`;}
}
async function showOrder(no){
  const[{data:o},{data:its}]=await Promise.all([
    sb.from('sales_orders').select('*').eq('order_no',no).single(),
    sb.from('sales_order_items').select('*').eq('order_no',no),
  ]);
  OM(`訂單：${no}`,`
  <div class="dg" style="margin-bottom:13px">
    <div class="dr"><span class="dlb">日期</span><span class="dv">${fD(o?.order_date)}</span></div>
    <div class="dr"><span class="dlb">客戶</span><span class="dv">${o?.customer_name||'—'}</span></div>
    <div class="dr"><span class="dlb">位階</span><span class="dv">${lvBadge(o?.agent_level)}</span></div>
    <div class="dr"><span class="dlb">手機</span><span class="dv">${o?.phone||'—'}</span></div>
    <div class="dr"><span class="dlb">寄送方式</span><span class="dv">${o?.shipping_method||'—'}</span></div>
    <div class="dr"><span class="dlb">付款方式</span><span class="dv">${o?.payment_method||'—'}</span></div>
    <div class="dr"><span class="dlb">收款</span><span class="dv"><span class="badge ${o?.payment_done?'bg':'br2'}">${o?.payment_done?'已收款':'未收款'}</span></span></div>
    <div class="dr"><span class="dlb">促銷</span><span class="dv">${o?.promo_name||'—'}</span></div>
    <div class="dr"><span class="dlb">發票號碼</span><span class="dv" style="font-family:monospace">${o?.invoice_no||'—'}</span></div>
    <div class="dr" style="grid-column:1/-1"><span class="dlb">送貨地址</span><span class="dv">${o?.ship_address||'—'}</span></div>
    <div class="dr" style="grid-column:1/-1"><span class="dlb">備註</span><span class="dv">${o?.note||'—'}</span></div>
  </div>
  <table class="itb"><tr><th>商品</th><th>單價</th><th>銷售數</th><th style="color:var(--am)">贈品數</th><th>實出數</th><th>金額</th></tr>
  ${(its||[]).map(i=>`<tr>
    <td>${i.product_name||'—'}</td>
    <td class="num">${i.unit_price?'$'+Math.round(Number(i.unit_price)).toLocaleString('zh-TW'):'贈品'}</td>
    <td class="num">${fN(i.qty)}</td>
    <td class="num" style="color:var(--am);font-weight:600">${i.gift_qty?fN(i.gift_qty):'—'}</td>
    <td class="num" style="font-weight:600">${fN((i.qty||0)+(i.gift_qty||0))}</td>
    <td class="num">${i.amount?'$'+Math.round(Number(i.amount)).toLocaleString('zh-TW'):'—'}</td>
  </tr>`).join('')||'<tr><td colspan="6" style="text-align:center;color:var(--tx3)">無明細</td></tr>'}
  </table>
  <div style="background:var(--sf2);border-radius:var(--r);padding:10px;margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:7px;font-size:13px">
    <span>小計（稅前參考）</span><span class="num" style="text-align:right">${fM(o?.subtotal)}</span>
    <span>運費</span><span class="num" style="text-align:right">${fM(o?.shipping_fee)}</span>
    <span>稅（已含，拆算參考）</span><span class="num" style="text-align:right">${o?.tax?'$'+Math.round(Number(o.tax)).toLocaleString('zh-TW'):'—'}</span>
    <span style="font-weight:700">總金額</span><span class="num" style="text-align:right;font-weight:700;color:var(--ac)">${o?.total?'$'+Math.round(Number(o.total)).toLocaleString('zh-TW'):'—'}</span>
    <span>淨利</span><span class="num" style="text-align:right">${o?.total_profit?'$'+Math.round(Number(o.total_profit)).toLocaleString('zh-TW'):'—'}</span>
  </div>`,
  `<button class="btn" onclick="CM()">關閉</button>
   <button class="btn" onclick="printOrder('${no}')">🖨 列印出貨單</button>
   ${o?.is_return?'<span class="badge br2" style="padding:8px 12px">已退貨</span>':'<button class="btn btn-r" style="background:var(--am);border-color:var(--am)" onclick="startReturn(this.dataset.no)" data-no="'+no+'">↩ 退貨</button>'}
   <button class="btn btn-r" onclick="dOrder('${no}')">刪除</button>`);
}
async function printOrder(no){
  const[{data:o},{data:its}]=await Promise.all([
    sb.from('sales_orders').select('*').eq('order_no',no).single(),
    sb.from('sales_order_items').select('*').eq('order_no',no),
  ]);
  const win=window.open('','_blank','width=800,height=600');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>出貨單 ${no}</title>
  <style>
  body{font-family:'Noto Sans TC',system-ui,sans-serif;padding:24px;color:#111;font-size:13px;max-width:600px;margin:0 auto}
  h1{font-size:20px;font-weight:700;margin-bottom:4px}
  .sub{color:#666;font-size:12px;margin-bottom:20px}
  .row{display:flex;justify-content:space-between;margin-bottom:6px}
  .lbl{color:#666;font-size:11px;font-weight:600;text-transform:uppercase}
  table{width:100%;border-collapse:collapse;margin:16px 0}
  th{border-bottom:2px solid #111;padding:6px 8px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase}
  td{border-bottom:1px solid #ddd;padding:6px 8px;font-size:13px}
  .tot{border-top:2px solid #111;padding-top:8px;margin-top:4px}
  .footer{margin-top:30px;padding-top:14px;border-top:1px solid #ddd;font-size:11px;color:#888;text-align:center}
  @media print{button{display:none}}
  </style></head><body>
  <button onclick="window.print()" style="float:right;padding:6px 14px;cursor:pointer;margin-bottom:10px">🖨 列印</button>
  <h1>出 貨 單</h1>
  <div class="sub">慢樂仙坊</div>
  <div class="row"><div><div class="lbl">訂單編號</div><div>${no}</div></div><div><div class="lbl">出貨日期</div><div>${fD(o?.actual_ship_date||o?.order_date)}</div></div></div>
  <div class="row"><div><div class="lbl">客戶</div><div>${o?.customer_name||'—'}</div></div><div><div class="lbl">手機</div><div>${o?.phone||'—'}</div></div></div>
  <div class="row"><div class="lbl">送貨地址</div></div><div>${o?.ship_address||'—'}</div>
  <div class="row"><div><div class="lbl">寄送方式</div><div>${o?.shipping_method||'—'}</div></div><div><div class="lbl">付款方式</div><div>${o?.payment_method||'—'}</div></div></div>
  <table>
    <tr><th>商品名稱</th><th style="text-align:right">單價</th><th style="text-align:right">數量</th><th style="text-align:right">金額</th></tr>
    ${(its||[]).map(i=>`<tr><td>${i.product_name||'—'}${i.gift_qty&&i.gift_qty>0?` <span style="background:#fef9e7;color:#b8860b;font-size:10px;padding:1px 5px;border-radius:3px;margin-left:4px">含贈品×${i.gift_qty}</span>`:''}</td><td style="text-align:right">${i.unit_price?'$'+Math.round(Number(i.unit_price)).toLocaleString():''}</td><td style="text-align:right">${(i.qty||0)+(i.gift_qty||0)}${i.gift_qty&&i.gift_qty>0?`<span style="font-size:10px;color:#b8860b;display:block">（贈${i.gift_qty}）</span>`:''}</td><td style="text-align:right">${i.amount?'$'+Math.round(Number(i.amount)).toLocaleString():'贈品'}</td></tr>`).join('')}
  </table>
  <div class="tot">
    <div class="row"><span>小計</span><span>${o?.subtotal?'$'+Number(o.subtotal).toLocaleString():''}</span></div>
    ${o?.shipping_fee?`<div class="row"><span>運費</span><span>$${Number(o.shipping_fee).toLocaleString()}</span></div>`:''}
    ${o?.tax?`<div class="row"><span>營業稅</span><span>$${Number(o.tax).toLocaleString()}</span></div>`:''}
    <div class="row" style="font-weight:700;font-size:16px;margin-top:6px"><span>總金額</span><span>${o?.total?'$'+Number(o.total).toLocaleString():''}</span></div>
  </div>
  ${o?.note?`<div style="margin-top:14px;padding:10px;background:#f9f9f9;border-radius:6px"><div class="lbl">備註</div><div>${o.note}</div></div>`:''}
  <div class="footer">感謝您的訂購・如有問題請聯繫我們</div>
  </body></html>`);
  win.document.close();
}
async function addOrder(){
  const[{data:pr},{data:cu}]=await Promise.all([
    sb.from('products').select('product_no,name,spec,stock,price_founder,price_region,price_city,price_dealer,price_vip,price_retail').not('product_no','is',null).eq('is_active',true).order('name'),
    sb.from('customers').select('customer_no,name,agent_level,phone,ship_full_address').order('name'),
  ]);
  _allProds=pr||[]; _allCusts=cu||[];
  _items=[{id:1,pno:'',qty:1,price:0,giftQty:0,amt:0}];
  const td=today(), no=await genNo('SO','sales_orders','order_no');
  const custOpts=_allCusts.map(c=>({value:c.customer_no,label:`${c.name} (${c.agent_level||'—'})`,data:c}));
  OM('新增銷售訂單',`
  <div class="fg" style="margin-bottom:13px">
    ${fi('ono','訂單編號','text',no)} ${fi('odate','日期','date',td)}
    <div class="fl"><label>選擇客戶</label>
      <div class="ss-wrap" id="ss-cust">
        <input class="ss-input" id="ss-inp-cust" placeholder="輸入姓名搜尋…" autocomplete="off" oninput="ssFilterCust(this.value)" onfocus="ssFilterCust(this.value)" onblur="setTimeout(()=>$('ss-drop-cust')?.classList.remove('open'),200)">
        <input type="hidden" id="ss-val-cust">
        <div class="ss-drop" id="ss-drop-cust"></div>
      </div>
    </div>
    ${fi('oname','客戶名稱 *')} ${fi('ophone','手機')}
    ${fs('oshp','寄送方式',['郵寄','超商取貨','親送','自取'],'郵寄')}
    ${fi('oaddr','送貨地址')}
    ${payMethodSel('opay','')}
    ${fi('ofee','運費','number','0')}
    ${fi('oinv','發票號碼','text')}
    <div class="fl"><label>位階（決定商品自動售價）</label><select id="f-oalv" onchange="updateItemPricesByLevel(this.value)">${LEVELS.map(l=>`<option>${l}</option>`).join('')}</select></div>
  </div>
  <div style="margin-bottom:10px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px">
      <span style="font-size:12px;font-weight:600;color:var(--tx3)">訂購品項</span>
      <div style="display:flex;gap:5px">
        <button class="btn btn-s" style="background:var(--bll);color:var(--bl);border-color:var(--bl)" onclick="openBundlePicker('order')">＋ 加入套組</button>
        <button class="btn btn-s" onclick="addItem()">＋ 單品</button>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:3fr 60px 90px 60px 70px 28px;gap:6px;padding:4px 8px;font-size:10px;font-weight:600;color:var(--tx3);text-transform:uppercase;letter-spacing:.5px">
      <span>商品</span><span>銷售數</span><span>單價</span><span style="color:var(--am)">贈品數</span><span>金額</span><span></span>
    </div>
    <div id="itemsArea"></div>
    <div id="oAmt" style="text-align:right;font-weight:600;padding-top:8px;border-top:1px solid var(--bd);margin-top:6px;font-size:13px"></div>
  </div>
  ${fa('onote','備註','')}`,
  `<button class="btn" onclick="CM()">取消</button><button class="btn btn-p" onclick="saveOrder(false)">建立訂單</button>`,true);
  // init customer search
  window.ssFilterCust=q=>{
    const fil=q?_allCusts.filter(c=>c.name.includes(q)||(c.phone||'').includes(q)):_allCusts;
    const drop=$('ss-drop-cust'); if(!drop)return;
    drop.classList.add('open');
    drop.innerHTML=fil.slice(0,30).map(c=>`<div class="ss-opt" onmousedown="pickCust('${c.customer_no}')">${c.name} · ${c.agent_level||'—'} · ${c.phone||'—'}</div>`).join('')||`<div class="ss-opt no">無結果</div>`;
  };
  window.pickCust=cno=>{
    const c=_allCusts.find(x=>x.customer_no===cno);
    if(!c)return;
    $('ss-inp-cust').value=c.name;
    $('ss-val-cust').value=cno;
    $('f-oname').value=c.name;
    $('f-ophone').value=c.phone||'';
    $('f-oaddr').value=c.ship_full_address||'';
    if(c.agent_level) $('f-oalv').value=c.agent_level;
    $('ss-drop-cust')?.classList.remove('open');
    updateItemPricesByLevel(c.agent_level||'零售');
  };
  renderItems();
}
function updateItemPricesByLevel(lv){
  const col=LEVEL_COLS[lv]||'price_retail';
  _items.forEach(item=>{
    if(item.pno){const p=_allProds.find(x=>x.product_no===item.pno);if(p&&p[col])item.price=p[col];item.amt=item.qty*item.price;}
  });
  renderItems();
}
function getItemProdOpts(selPno){
  return `<option value="">搜尋商品…</option>`+_allProds.map(p=>`<option value="${p.product_no}" ${p.product_no===selPno?'selected':''}>${p.name}${p.spec?` (${p.spec})`:''} [庫${p.stock}]</option>`).join('');
}
function renderItems(){
  const area=$('itemsArea');if(!area)return;
  // 套組分組 header + item rows
  let _html='', _prevBG='';
  _items.forEach(item=>{
    if(item.bundle_group && item.bundle_group!==_prevBG){
      _prevBG=item.bundle_group;
      const bname=item.bundle_name||item.promo_code||'套組';
      const bItems=_items.filter(x=>x.bundle_group===item.bundle_group);
      const bTotal=bItems.reduce((s,x)=>s+(x.amt||0),0);
      _html+='<div style="grid-column:1/-1;background:var(--bll);border-radius:var(--r);padding:5px 10px;font-size:12px;font-weight:600;color:var(--bl);display:flex;justify-content:space-between;margin-bottom:3px">'
        +'<span>📦 '+bname+'</span><span style="font-weight:400;font-size:11px">合計 '+fM(bTotal)+'</span></div>';
    } else if(!item.bundle_group){ _prevBG=''; }
    const borderStyle=item.bundle_group?'border-left:3px solid var(--bl);padding-left:10px':'';
    const giftLabel=item.is_gift?'<div style="grid-column:1/-1;font-size:10px;color:var(--am);font-weight:600;margin-bottom:2px">🎁 贈品（不計費）</div>':'';
    _html+='<div class="ir ir-order" style="'+borderStyle+'">'+giftLabel;
    // 以下繼續加各欄內容（用同樣的 template，但改成字串拼接）
    // 搜尋框
    const pname=item._pname||(item.pno?(_allProds.find(p=>p.product_no===item.pno)?.name||item.pno):'');
    _html+='<div style="position:relative"><input type="text" id="isrch-'+item.id+'" value="'+pname.replace(/"/g,'&quot;')+'" placeholder="輸入關鍵字搜尋商品…" style="font-size:12px;padding:5px 7px;border:1px solid var(--bd);border-radius:var(--r);background:var(--sf);width:100%;outline:none" oninput="filterItemDrop('+item.id+',this.value)" onfocus="filterItemDrop('+item.id+',this.value)" onblur="if(!window._ime)setTimeout(()=>closeItemDrop('+item.id+'),400)" oncompositionstart="window._ime=true" oncompositionend="window._ime=false" autocomplete="off"><div id="idrop-'+item.id+'" style="position:absolute;top:100%;left:0;right:0;background:var(--sf);border:1px solid var(--bd);border-radius:var(--r);max-height:160px;overflow-y:auto;z-index:500;display:none;box-shadow:0 4px 12px rgba(0,0,0,.1)"></div></div>';
    _html+='<input type="number" value="'+item.qty+'" min="0" onchange="setIQ('+item.id+',this.value)" style="font-size:12px;padding:5px 7px;border:1px solid var(--bd);border-radius:var(--r);width:100%;outline:none" title="銷售數量">';
    _html+='<input type="number" value="'+(item.price||'')+'" placeholder="單價" onchange="setIV('+item.id+',this.value)" style="font-size:12px;padding:5px 7px;border:1px solid var(--bd);border-radius:var(--r);width:100%;outline:none">';
    _html+='<input type="number" value="'+(item.giftQty||0)+'" min="0" onchange="setIG('+item.id+',this.value)" style="font-size:12px;padding:5px 7px;border:1px solid var(--bd);border-radius:var(--r);width:100%;outline:none;background:var(--aml);color:var(--am)" title="贈品數量（免費）">';
    _html+='<span style="font-size:13px;font-weight:500">'+fM(item.amt)+'</span>';
    _html+='<button onclick="rmItem('+item.id+')" style="background:none;border:none;cursor:pointer;color:var(--rd);font-size:18px;line-height:1">×</button>';
    _html+='</div>';
  });
  area.innerHTML=_html;
  return; // renderItems 結束，以下舊程式不執行

  // ↓↓ 舊備份（不執行）↓↓
  area.innerHTML=_items.map(item=>`
  <div class="ir ir-order" style="${item.bundle_group?'border-left:3px solid var(--bl)':''}">
    ${item.is_gift?`<div style="grid-column:1/-1;font-size:10px;color:var(--am);font-weight:600;margin-bottom:2px">🎁 贈品（不計費）</div>`:''}
    <div style="position:relative">
      <input type="text" id="isrch-${item.id}" value="${item._pname||(item.pno?(_allProds.find(p=>p.product_no===item.pno)?.name||item.pno):'')}" placeholder="輸入關鍵字搜尋商品…"
        style="font-size:12px;padding:5px 7px;border:1px solid var(--bd);border-radius:var(--r);background:var(--sf);width:100%;outline:none"
        oninput="filterItemDrop(${item.id},this.value)" onfocus="filterItemDrop(${item.id},this.value)"
        oncompositionstart="window._ime=true" oncompositionend="window._ime=false" onblur="if(!window._ime)setTimeout(()=>closeItemDrop(${item.id}),400)" autocomplete="off">
      <div id="idrop-${item.id}" style="position:absolute;top:100%;left:0;right:0;background:var(--sf);border:1px solid var(--bd);border-radius:var(--r);max-height:160px;overflow-y:auto;z-index:500;display:none;box-shadow:0 4px 12px rgba(0,0,0,.1)"></div>
    </div>
    <input type="number" value="${item.qty}" min="0" onchange="setIQ(${item.id},this.value)" style="font-size:12px;padding:5px 7px;border:1px solid var(--bd);border-radius:var(--r);width:100%;outline:none" title="銷售數量">
    <input type="number" value="${item.price||''}" placeholder="單價" onchange="setIV(${item.id},this.value)" style="font-size:12px;padding:5px 7px;border:1px solid var(--bd);border-radius:var(--r);width:100%;outline:none">
    <input type="number" value="${item.giftQty||0}" min="0" onchange="setIG(${item.id},this.value)" style="font-size:12px;padding:5px 7px;border:1px solid var(--bd);border-radius:var(--r);width:100%;outline:none;background:var(--aml);color:var(--am)" title="贈品數量（免費）">
    <span style="font-size:13px;font-weight:500">${fM(item.amt)}</span>
    <button onclick="rmItem(${item.id})" style="background:none;border:none;cursor:pointer;color:var(--rd);font-size:18px;line-height:1">×</button>
  </div>`).join('');
  updAmt();
}
function updAmt(){
  const el=$('oAmt');if(!el)return;
  const sub=_items.reduce((s,i)=>s+i.amt,0);
  const fee=parseFloat($('f-ofee')?.value)||0;
  el.innerHTML=`商品小計 ${fM(sub)} + 運費 ${fM(fee)} = <span style="color:var(--ac)">${fM(sub+fee)}</span>（已含稅）`;
}
async function saveOrder(editNo){
  const no=editNo||v('ono'), nm=v('oname'), dt=v('odate');
  if(!no||!nm){toast('請填寫訂單號和客戶名稱','e');return;}
  const its=_items.filter(i=>i.pno&&((i.qty||0)+(i.giftQty||0))>0);
  if(!its.length){toast('請至少選一項商品','e');return;}
  const sub=its.reduce((s,i)=>s+i.amt,0),fee=n('ofee')||0,tax=0,total=sub+fee;
  const payload={order_date:dt,customer_name:nm,phone:v('ophone'),ship_address:v('oaddr'),payment_method:v('opay'),shipping_method:v('oshp'),shipping_fee:fee,note:v('onote'),agent_level:v('oalv'),invoice_no:v('oinv')||null,subtotal:sub,tax,total,payment_done:editNo?undefined:false,products_summary:its.map(i=>(_allProds.find(p=>p.product_no===i.pno)?.name||i.pno)).join('、')};
  if(editNo){
    await sb.from('sales_order_items').delete().eq('order_no',editNo);
    const{error}=await sb.from('sales_orders').update(payload).eq('order_no',editNo);
    if(error){toast('修改失敗：'+error.message,'e');return;}
  } else {
    payload.order_no=no;payload.payment_done=false;
    const{error}=await sb.from('sales_orders').insert(payload);
    if(error){toast('建立失敗：'+error.message,'e');return;}
  }
  const rows=its.map(i=>{
    const p=_allProds.find(x=>x.product_no===i.pno);
    return {
      order_no:no, product_no:i.pno, product_name:i._pname||p?.name||i.pno,
      unit_price:i.is_gift?0:i.price,
      qty:i.qty||0,
      gift_qty:i.giftQty||0,
      actual_qty:(i.qty||0)+(i.giftQty||0),
      amount:i.amt||0,
      year_month:ym(dt),
      promo_code:i.promo_code||null,
      bundle_group:i.bundle_group||null,
      bundle_name:i.bundle_name||null,
      is_bundle_item:!!(i.promo_code),
      is_gift:i.is_gift||false
    };
  });
  await sb.from('sales_order_items').insert(rows);
  if(!editNo){
    // 扣庫存：銷售數+贈品數 = 實際出貨量
  for(const i of its){
    const actualOut=(i.qty||0)+(i.giftQty||0);
    if(actualOut<=0) continue;
    const{data:p}=await sb.from('products').select('stock').eq('product_no',i.pno).single();
    if(p) await sb.from('products').update({stock:Math.max(0,p.stock-actualOut)}).eq('product_no',i.pno);
  }
  }
  toast(editNo?'訂單已修改！':'訂單建立成功！庫存已自動扣除');CM();orders();
}
async function editOrder(no){
  const[{data:o},{data:its},{data:pr},{data:cu}]=await Promise.all([
    sb.from('sales_orders').select('*').eq('order_no',no).single(),
    sb.from('sales_order_items').select('*').eq('order_no',no),
    sb.from('products').select('product_no,name,spec,stock,price_founder,price_region,price_city,price_dealer,price_vip,price_retail').not('product_no','is',null).eq('is_active',true).order('name'),
    sb.from('customers').select('customer_no,name,agent_level,phone,ship_full_address').order('name'),
  ]);
  _allProds=pr||[]; _allCusts=cu||[];
  _items=(its||[]).map((i,idx)=>({id:idx+1,pno:i.product_no,qty:i.qty,price:i.unit_price,amt:i.amount}));
  const custOpts=_allCusts.map(c=>({value:c.customer_no,label:`${c.name} (${c.agent_level||'—'})`,data:c}));
  OM(`修改訂單：${no}`,`
  <div class="fg" style="margin-bottom:13px">
    ${fi('ono','訂單編號','text',no)} ${fi('odate','日期','date',fD(o?.order_date))}
    ${fi('oname','客戶名稱 *','text',o?.customer_name)} ${fi('ophone','手機','text',o?.phone)}
    ${fs('oshp','寄送方式',['郵寄','超商取貨','親送','自取'],o?.shipping_method)}
    ${fi('oaddr','送貨地址','text',o?.ship_address)}
    ${fs('opay','付款方式',['付款交單 (D/P)','匯款','信用卡','現金'],o?.payment_method)}
    ${fi('ofee','運費','number',o?.shipping_fee||0)}
    ${fi('oinv','發票號碼','text',o?.invoice_no||'')}
    <div class="fl"><label>位階</label><select id="f-oalv" onchange="updateItemPricesByLevel(this.value)">${LEVELS.map(l=>`<option ${l===o?.agent_level?'selected':''}>${l}</option>`).join('')}</select></div>
  </div>
  <div style="margin-bottom:10px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px">
      <span style="font-size:12px;font-weight:600;color:var(--tx3)">訂購品項</span>
      <div style="display:flex;gap:5px">
        <button class="btn btn-s" style="background:var(--bll);color:var(--bl);border-color:var(--bl)" onclick="openBundlePicker('order')">＋ 加入套組</button>
        <button class="btn btn-s" onclick="addItem()">＋ 單品</button>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:3fr 60px 90px 60px 70px 28px;gap:6px;padding:4px 8px;font-size:10px;font-weight:600;color:var(--tx3);text-transform:uppercase;letter-spacing:.5px">
      <span>商品</span><span>銷售數</span><span>單價</span><span style="color:var(--am)">贈品數</span><span>金額</span><span></span>
    </div>
    <div id="itemsArea"></div>
    <div id="oAmt" style="text-align:right;font-weight:600;padding-top:8px;border-top:1px solid var(--bd);margin-top:6px;font-size:13px"></div>
  </div>
  ${fa('onote','備註',o?.note||'')}`,
  `<button class="btn" onclick="CM()">取消</button><button class="btn btn-p" onclick="saveOrder('${no}')">儲存修改</button>`,true);
  renderItems();
}
async function togglePay(no,done){
  await sb.from('sales_orders').update({payment_done:!done,payment_date:!done?today():null}).eq('order_no',no);
  toast(!done?'已標記收款完成':'已取消收款');orders();
}
async function dOrder(no){
  if(!confirm(`確定刪除訂單 ${no}？\n\n此操作會：\n・刪除整張訂單及明細\n・不會回復庫存（請手動調整）\n\n操作記錄將被保留。`))return;
  const{data:o}=await sb.from('sales_orders').select('*').eq('order_no',no).single();
  const{data:its}=await sb.from('sales_order_items').select('*').eq('order_no',no);
  await sb.from('sales_order_items').delete().eq('order_no',no);
  await sb.from('sales_orders').delete().eq('order_no',no);
  await logAction('delete','sales_orders',no,'刪除銷售訂單 '+no,{order:o,items:its});
  toast('訂單已刪除，操作已記錄');CM();orders();
}
async function recordShipment(no){
  const[{data:o},{data:its}]=await Promise.all([
    sb.from('sales_orders').select('ship_status').eq('order_no',no).single(),
    sb.from('sales_order_items').select('*').eq('order_no',no),
  ]);
  const td=today();
  const rows=(its||[]).map(i=>{
    const total=(i.qty||0)+(i.gift_qty||0), shipped=i.shipped_qty||0, pending=total-shipped;
    return '<tr>'
      +'<td style="font-size:12px">'+( i.product_name||'—')+'</td>'
      +'<td class="num">'+fN(i.qty)+'</td>'
      +'<td class="num" style="color:var(--am)">'+(i.gift_qty?fN(i.gift_qty):'—')+'</td>'
      +'<td class="num" style="font-weight:700">'+fN(total)+'</td>'
      +'<td class="num ok">'+fN(shipped)+'</td>'
      +'<td><input type="number" id="f-ship-'+i.id+'" value="'+pending+'" min="0" max="'+pending+'"'
      +(pending<=0?' disabled':'')+' style="width:65px;padding:4px 6px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;outline:none'+(pending<=0?';opacity:.4':'')+'">'+'</td>'
      +'<td class="num '+(pending>0?'cr':'')+'" >'+fN(pending)+'</td>'
      +'</tr>';
  }).join('');
  const itsJson=JSON.stringify(its);
  OM('記錄出貨：'+no,
    '<div class="al al-w" style="font-size:12px">填入本次實際出貨的數量（含贈品），可分批記錄。</div>'
    +'<div class="fl" style="margin-bottom:12px"><label>出貨日期</label><input id="f-sdt" type="date" value="'+td+'" style="width:180px;padding:7px 8px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;outline:none"></div>'
    +'<table class="itb"><tr><th>商品</th><th>訂購</th><th>贈品</th><th>已出</th><th>本次出貨</th><th>未出</th></tr>'
    +rows+'</table>',
    '<button class="btn" onclick="CM()">取消</button>'
    +'<button class="btn btn-p" onclick="doShipment()">確認出貨</button>');
  window._shipNo=no; window._shipIts=its;
}
async function doShipment(no,its){
  no=no||window._shipNo; its=its||window._shipIts;
  const sdt=v('sdt')||today();
  let allShipped=true, anyShipped=false;
  for(const i of its){
    const shipQty=parseFloat($('f-ship-'+i.id)?.value)||0;
    if(shipQty<=0) continue;
    anyShipped=true;
    const newShipped=Math.min((i.qty||0)+(i.gift_qty||0),(i.shipped_qty||0)+shipQty);
    await sb.from('sales_order_items').update({shipped_qty:newShipped}).eq('id',i.id);
    // 再查一次確認是否全部出完
    if(newShipped<(i.qty||0)+(i.gift_qty||0)) allShipped=false;
  }
  // 重新確認所有 items
  const{data:updatedIts}=await sb.from('sales_order_items').select('qty,gift_qty,shipped_qty').eq('order_no',no);
  const allDone=(updatedIts||[]).every(i=>(i.shipped_qty||0)>=(i.qty||0)+(i.gift_qty||0));
  const partDone=(updatedIts||[]).some(i=>(i.shipped_qty||0)>0);
  const status=allDone?'全部出貨':partDone?'部分出貨':'待出貨';
  await sb.from('sales_orders').update({ship_status:status,actual_ship_date:allDone?sdt:null}).eq('order_no',no);
  toast('出貨記錄已更新！');CM();orders();
}
async function applyPromo(code, mode, sets) {
  sets = Math.max(1, parseInt(sets) || 1);
  const [{ data: p }, { data: its }] = await Promise.all([
    sb.from('promotions').select('*').eq('promo_code', code).single(),
    sb.from('promotion_items').select('*').eq('promo_code', code).order('is_gift'),
  ]);
  if (!its || !its.length) { toast('此套組尚無商品設定', 'w'); return; }

  const today_s = today();
  if (p.end_date && p.end_date < today_s) { toast('此套組已過有效期！', 'e'); return; }

  const bundleGroup = 'BG-' + Date.now();

  if (mode === 'order') {
    // 取得客戶位階決定售價
    const lv = $('f-oalv')?.value || '零售';
    const col = LEVEL_COLS[lv] || 'price_retail';

    for (const i of its) {
      const { data: prod } = await sb.from('products').select('product_no,name,spec,stock,' + col).eq('product_no', i.product_no).single();
      const unitPrice = i.is_gift ? 0 : (i.price_override || prod?.[col] || 0);
      const itemQty = (i.qty || 1) * sets;       // 數量 × 組數
      const newItem = {
        id: Date.now() + Math.random(),
        pno: i.product_no,
        qty: i.is_gift ? 0 : itemQty,
        price: unitPrice,
        giftQty: i.is_gift ? itemQty : 0,
        amt: i.is_gift ? 0 : (itemQty * unitPrice),
        is_gift: i.is_gift,
        promo_code: code,
        bundle_name: p.name + (sets > 1 ? ' ×' + sets : ''),
        bundle_group: bundleGroup,
        _pname: i.product_name || prod?.name || i.product_no,
      };
      _items.push(newItem);
    }
    // 套組折扣
    if (p.discount_amount) {
      _items.push({ id: Date.now(), pno: 'DISCOUNT', qty: 1, price: -p.discount_amount, giftQty: 0, amt: -p.discount_amount, _pname: `套組折扣 (${p.name})`, promo_code: code, bundle_group: bundleGroup });
    }
    CM2();
    renderItems();
    toast('套組已展開，請確認品項！');
  } else if (mode === 'po') {
    for (const i of its) {
      const pQty = (i.qty || 1) * sets;
      // 從已載入的商品清單取進貨成本，若套組有設定 price_override 則優先使用
      const prodInfo = _poProds.find(x => x.product_no === i.product_no);
      const price = i.is_gift ? 0 : (i.price_override || prodInfo?.cost || 0);
      _poItems.push({ id: Date.now() + Math.random(), pno: i.product_no, qty: i.is_gift ? 0 : pQty, price, giftQty: i.is_gift ? pQty : 0, amt: i.is_gift ? 0 : pQty * price, _pname: i.product_name || prodInfo?.name || i.product_no, promo_code: code, bundle_name: p.name + (sets > 1 ? ' ×' + sets : ''), bundle_group: bundleGroup });
    }
    CM2();
    renderPOItems();
    toast('套組已展開至進貨品項！');
  } else if (mode === 'loan') {
    for (const i of its) {
      const lQty = (i.qty || 1) * sets;
      _loanItems.push({ id: Date.now() + Math.random(), pno: i.product_no, qty: lQty, _pname: i.product_name || i.product_no, promo_code: code, bundle_group: bundleGroup, is_gift: i.is_gift });
    }
    CM2();
    renderLoanItems();
    toast('套組已展開至借貨品項！');
  }
}
window.applyPromo = applyPromo;

// ══════════════════════════════════════
//  退貨機制
// ══════════════════════════════════════
async function startReturn(btnOrNo) {
  const no = typeof btnOrNo === 'string' ? btnOrNo : btnOrNo?.dataset?.no;
  if (!no) { toast('無法取得訂單號', 'e'); return; }
  const [{ data: o }, { data: its }] = await Promise.all([
    sb.from('sales_orders').select('*').eq('order_no', no).single(),
    sb.from('sales_order_items').select('*').eq('order_no', no),
  ]);
  if (!o) { toast('找不到訂單', 'e'); return; }

  const items = (its || []).filter(i => (i.qty || 0) + (i.gift_qty || 0) > 0);

  const rows = items.map(i => {
    const total = (i.qty || 0) + (i.gift_qty || 0);
    return `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--bd)">
      <input type="checkbox" class="ret-cb" data-no="${i.product_no}" data-name="${(i.product_name||'').replace(/"/g,'&quot;')}"
        data-max="${total}" checked style="width:15px;height:15px;flex-shrink:0">
      <div style="flex:1">
        <div style="font-weight:500">${i.product_name || '—'}</div>
        <div style="font-size:12px;color:var(--tx3)">售出 ${i.qty||0} 件${i.gift_qty?` + 贈品 ${i.gift_qty} 件`:''} · ${fM(i.unit_price)}/件</div>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-size:12px;color:var(--tx3)">退貨數：</span>
        <input type="number" class="ret-qty" data-no="${i.product_no}" value="${total}" min="1" max="${total}"
          style="width:60px;padding:4px 6px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;text-align:center;outline:none">
      </div>
    </div>`;
  }).join('');

  OM(`退貨：${no}`, `
  <div class="al al-w" style="font-size:12px;margin-bottom:12px">
    勾選要退貨的品項，確認退貨數量。退貨後庫存會自動回補。
  </div>
  <div style="margin-bottom:14px">${rows}</div>
  <div class="fl fw">
    <label style="font-size:13px;font-weight:600;margin-bottom:6px;display:block">退貨原因</label>
    <textarea id="ret-reason" rows="2" placeholder="例如：商品有瑕疵、客戶不滿意…"
      style="width:100%;padding:8px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;outline:none;resize:vertical"></textarea>
  </div>
  <div style="margin-top:10px;display:flex;align-items:center;gap:8px">
    <input type="checkbox" id="ret-restore" checked style="width:15px;height:15px">
    <label for="ret-restore" style="font-size:13px;cursor:pointer">退貨後自動回補庫存</label>
  </div>`,
  `<button class="btn" onclick="CM()">取消</button>
   <button class="btn btn-r" style="background:var(--am);border-color:var(--am)" onclick="confirmReturn('${no}')">確認退貨</button>`
  );
}

async function confirmReturn(no) {
  const reason = document.getElementById('ret-reason')?.value?.trim() || '';
  const restoreStock = document.getElementById('ret-restore')?.checked ?? true;

  // 收集勾選的退貨品項
  const retItems = [];
  document.querySelectorAll('.ret-cb:checked').forEach(cb => {
    const pno = cb.dataset.no;
    const name = cb.dataset.name;
    const qty = parseInt(document.querySelector(`.ret-qty[data-no="${pno}"]`)?.value) || 0;
    if (qty > 0) retItems.push({ pno, name, qty });
  });

  if (!retItems.length) { toast('請勾選至少一項退貨品項', 'e'); return; }

  // 1. 標記訂單為退貨
  const { error: e1 } = await sb.from('sales_orders').update({
    is_return: true,
    return_date: new Date().toISOString().split('T')[0],
    return_reason: reason || null,
    status: '已退貨',
  }).eq('order_no', no);
  if (e1) { toast('更新訂單失敗：' + e1.message, 'e'); return; }

  // 2. 回補庫存（若勾選）
  if (restoreStock) {
    for (const item of retItems) {
      const { data: prod } = await sb.from('products').select('stock').eq('product_no', item.pno).single();
      if (prod) {
        const newStock = (prod.stock || 0) + item.qty;
        await sb.from('products').update({ stock: newStock }).eq('product_no', item.pno);
      }
    }
  }

  // 3. 記錄操作
  await logAction('return', 'sales_orders', no,
    `退貨 ${no}：${retItems.map(i => `${i.name}×${i.qty}`).join('、')}${reason ? '，原因：' + reason : ''}${restoreStock ? '（已回補庫存）' : '（未回補庫存）'}`,
    null, { is_return: true, items: retItems }
  );

  toast(`✅ 退貨完成，已退 ${retItems.length} 項商品${restoreStock ? '，庫存已回補' : ''}`);
  CM();
  orders();
}

window.startReturn = startReturn;
window.confirmReturn = confirmReturn;