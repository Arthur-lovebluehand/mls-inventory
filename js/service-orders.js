// ══════════════════════════════
// service-orders.js
// ══════════════════════════════

// 依客戶的錢包模式，決定服務單該扣「服務」還是「共用」帳戶
async function getSvcWalletType(custNo) {
  if(!custNo) return '共用';
  const { data:c } = await sb.from('customers').select('wallet_mode').eq('customer_no',custNo).maybeSingle();
  return c?.wallet_mode==='separate' ? '服務' : '共用';
}
window.getSvcWalletType = getSvcWalletType;

var svcOrderSearch = '';
async function svcOrders() {
  let q = sb.from('service_orders').select('*', { count:'exact' });
  if(svcOrderSearch) q = q.or(`order_no.ilike.%${svcOrderSearch}%,customer_name.ilike.%${svcOrderSearch}%`);
  const { data, count } = await q
    .order('order_date', { ascending:false })
    .order('order_no', { ascending:false })
    .range((svcOrderPage-1)*25, svcOrderPage*25-1);

  const tp = Math.max(1, Math.ceil((count||0)/25));
  $('svc-content').innerHTML = `
  <div class="tc">
    <div class="tb"><span class="tt">服務訂單</span>
      <div class="si"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
      <input placeholder="訂單號/客戶名稱…（輸入後按 Enter 搜尋）" value="${svcOrderSearch}" onkeydown="if(event.key==='Enter'){svcOrderSearch=this.value;svcOrderPage=1;svcOrders();}"></div>
    </div>
    <div class="tw"><table style="width:100%">
      <tr><th>訂單號</th><th>日期</th><th>客戶</th><th>金額</th><th>付款</th><th>操作</th></tr>
      ${(data||[]).map(o=>`<tr>
        <td style="font-size:12px;color:var(--ac)">${o.order_no}</td>
        <td>${o.order_date||''}</td>
        <td>${o.customer_name||'—'}</td>
        <td class="num">${fM(o.total)}</td>
        <td><span style="font-size:11px">${o.payment_method||''}</span></td>
        <td><button class="btn btn-s" onclick="svcShowOrder('${o.order_no}')">明細</button></td>
      </tr>`).join('')||`<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--tx3)">${svcOrderSearch?'查無符合的訂單':'尚無記錄'}</td></tr>`}
    </table></div>
  </div>
  <div class="pg"><span class="pi">第 ${svcOrderPage}/${tp} 頁，共 ${count||0} 筆</span>
    ${svcOrderPage>1?`<button class="btn btn-s" onclick="svcOrderPage--;svcOrders()">上一頁</button>`:''}
    ${svcOrderPage<tp?`<button class="btn btn-s" onclick="svcOrderPage++;svcOrders()">下一頁</button>`:''}${pageJump('svcOrderPage',tp,'svcOrders')}
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
  const gifts = (its||[]).filter(i=>i.item_type==='gift_product');
  let curBalance = null, txBalance = null, walletLabel = '';
  if(o.customer_no && o.paid_by_credit>0) {
    const { data:txRec } = await sb.from('store_credit_records').select('balance_after,wallet_type').eq('order_no',no).eq('type','deduct').maybeSingle();
    const walletType = txRec?.wallet_type || await getSvcWalletType(o.customer_no);
    walletLabel = walletType;
    const { data:cr } = await sb.from('store_credits').select('balance').eq('customer_no',o.customer_no).eq('wallet_type',walletType).maybeSingle();
    curBalance = cr?.balance ?? 0;
    txBalance = txRec?.balance_after ?? null;
  }

  OM(`服務單：${no}`,`
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;font-size:13px">
    <div><span style="color:var(--tx3)">日期：</span>${o.order_date||''}</div>
    <div><span style="color:var(--tx3)">客戶：</span>${o.customer_name||'—'}</div>
    <div><span style="color:var(--tx3)">付款：</span>${o.payment_method||''}</div>
    <div><span style="color:var(--tx3)">儲值扣：</span>${fM(o.paid_by_credit)}</div>
    ${txBalance!=null?`<div style="grid-column:1/-1"><span style="color:var(--tx3)">扣款帳戶（${walletLabel}）本筆後餘額：</span><b style="color:${txBalance>0?'var(--ac)':'var(--rd)'}">${fM(txBalance)}</b></div>`:''}
    ${curBalance!=null?`<div style="grid-column:1/-1;font-size:12px;color:var(--tx3)">${walletLabel}帳戶目前（現在）餘額：${fM(curBalance)}</div>`:''}
  </div>
  <div style="font-size:11px;color:var(--tx3);margin-bottom:8px">共 ${its.length} 項品項</div>
  ${services.length?`<div style="font-weight:600;margin-bottom:6px;font-size:13px">服務項目</div>
  <div class="tc" style="margin-bottom:12px"><div class="tw"><table style="width:100%">
    <tr><th>#</th><th>項目</th><th>數量</th><th>單價</th><th>小計</th><th>技師</th></tr>
    ${services.map((i,idx)=>`<tr><td style="color:var(--tx3);font-size:12px">${idx+1}</td><td>${i.item_name}${i.is_gift?' <span class="badge ba" style="font-size:10px">贈</span>':''}</td><td>${i.qty}${i.unit||''}</td>
      <td class="num">${fM(i.unit_price)}</td><td class="num">${fM(i.subtotal)}</td><td style="font-size:12px">${i.technician_name||'—'}</td></tr>`).join('')}
  </table></div></div>`:''}
  ${consumables.length?`<div style="font-weight:600;margin-bottom:6px;font-size:13px">耗材</div>
  <div class="tc" style="margin-bottom:12px"><div class="tw"><table style="width:100%">
    <tr><th>#</th><th>商品</th><th>用量</th><th>服務費</th><th>耗材成本</th></tr>
    ${consumables.map((i,idx)=>`<tr><td style="color:var(--tx3);font-size:12px">${idx+1}</td><td>${i.item_name}</td><td>${i.qty}${i.unit||''}</td>
      <td class="num">${fM(i.unit_price)}</td><td class="num" style="color:var(--rd)">${fM(i.cost)}</td></tr>`).join('')}
  </table></div></div>`:''}
  ${gifts.length?`<div style="font-weight:600;margin-bottom:6px;font-size:13px">贈送商品</div>
  <div class="tc" style="margin-bottom:12px"><div class="tw"><table style="width:100%">
    <tr><th>#</th><th>商品</th><th>數量</th><th>成本</th></tr>
    ${gifts.map((i,idx)=>`<tr><td style="color:var(--tx3);font-size:12px">${idx+1}</td><td>${i.item_name}</td><td>${i.qty}${i.unit||''}</td>
      <td class="num" style="color:var(--rd)">${fM(i.cost)}</td></tr>`).join('')}
  </table></div></div>`:''}
  <div style="text-align:right;font-size:15px;font-weight:700;border-top:1px solid var(--bd);padding-top:10px">
    服務收入：${fM(o.total)}
  </div>
  ${o.note?`<div style="margin-top:10px;padding:8px 10px;background:var(--acl);border-radius:var(--r);font-size:13px">
    <span style="color:var(--tx3);font-weight:600">備註：</span>${o.note}
  </div>`:''}`,
  `<button class="btn" onclick="CM()">關閉</button>
   <button class="btn btn-p" onclick="CM();svcNewOrder('${no}')">修改</button>
   <button class="btn btn-r" onclick="deleteSvcOrder('${no}')">刪除</button>`);
}

window.svcShowOrder    = svcShowOrder;
async function svcNewOrder(editNo) {
  let existingOrder=null, existingItems=[];
  if(editNo) {
    const [{ data:o },{ data:its }] = await Promise.all([
      sb.from('service_orders').select('*').eq('order_no',editNo).single(),
      sb.from('service_order_items').select('*').eq('order_no',editNo),
    ]);
    if(!o){ toast('找不到訂單','e'); return; }
    existingOrder=o; existingItems=its||[];
    // 注意：這裡「不」立即還原庫存/儲值影響——只是把既有品項讀出來放進畫面讓你編輯。
    // 真正的「還原舊的、套用新的」要等使用者按下「儲存修改」才會一起執行，
    // 這樣光是打開編輯畫面、或中途取消，都不會動到任何實際資料。
  }
  // 抓服務項目、服務庫存商品、客戶、完整商品清單（供贈品用）
  const [{ data:sitems },{ data:sinv },{ data:sconsum },{ data:custs },{ data:techs },{ data:allProds },kitsList] = await Promise.all([
    sb.from('service_items').select('*').eq('is_active',true).order('sort_order'),
    sb.from('service_inventory').select('*, products(name,service_unit,default_service_qty,service_units_per_stock,cost)').gt('stock_qty',0).order('product_no'),
    sb.from('service_consumables').select('*').eq('is_active',true).gt('stock_qty',0).order('name'),
    sb.from('customers').select('customer_no,name,phone').order('name'),
    sb.from('technicians').select('*').eq('is_active',true).order('name'),
    sb.from('products').select('product_no,name,spec,stock,cost').eq('is_active',true).order('product_no'),
    window.getSvcKitsList?.() || Promise.resolve([]),
  ]);
  window._svcAllCusts = custs||[];
  window._svcAllProds = allProds||[];
  window._svcKitsList = kitsList||[];
  const techOpts = (techs||[]).map(t=>`<option value="${t.id}" data-rate="${t.commission_rate}" data-mode="${t.commission_mode||'percentage'}" data-fixed="${t.commission_fixed_amount||0}" data-name="${t.name}">${t.name}（${t.role||'技師'}，${t.commission_mode==='fixed'?`固定${fM(t.commission_fixed_amount||0)}/次`:`抽成 ${Math.round(t.commission_rate*100)}%`}）</option>`).join('');

  const today2 = new Date().toISOString().split('T')[0];
  const orderNo = editNo || await genNo('SV','service_orders','order_no');
  window._svcEditNo = editNo || null;

  // 編輯模式：把原本的品項轉回畫面用的格式，讓使用者可以直接看到、增減調整
  window._svcItems = existingItems.map(i=>({
    id: Date.now()+Math.random(), item_type:i.item_type, item_name:i.item_name,
    product_no:i.product_no||null, consumable_id:i.consumable_id||null, deposit_id:i.deposit_id||null,
    qty:i.qty, unit:i.unit, unit_price:i.unit_price, cost:i.cost, subtotal:i.subtotal, is_gift:i.is_gift||false,
    technician_id:i.technician_id||null, technician_name:i.technician_name||null, technician_pay:i.technician_pay||0
  }));

  const catGroups = {};
  (sitems||[]).forEach(s=>{ const c=s.category||'其他項目'; if(!catGroups[c]) catGroups[c]=[]; catGroups[c].push(s); });
  const svcOpts = Object.entries(catGroups).map(([cat,items])=>
    `<optgroup label="${cat}">${items.map(s=>`<option value="${s.id}" data-price="${s.default_price}" data-unit="${s.unit||'次'}">${s.name}（${fM(s.default_price)}/${s.unit||'次'}）</option>`).join('')}</optgroup>`
  ).join('');
  window._svcConsumOptions = [
    ...(sinv||[]).map(p=>{
      const prod = p.products;
      return { type:'product', value:p.product_no, label:prod?.name||p.product_no,
        sub:`商品撥轉耗材・庫存 ${p.stock_qty} ${prod?.service_unit||'次'}`,
        unit:prod?.service_unit||'次', perstock:prod?.service_units_per_stock||1, defqty:prod?.default_service_qty||1, cost:prod?.cost||0 };
    }),
    ...(sconsum||[]).map(c=>({ type:'consumable', value:c.item_no, label:c.name,
      sub:`服務專屬耗材・庫存 ${c.stock_qty} ${c.unit}`,
      unit:c.unit, id:c.id, defqty:1, cost:c.cost||0 })),
  ];

  OM(editNo?`編輯服務單：${editNo}`:'新增服務單', `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
    ${fi('sv-no','服務單號','text',orderNo)}
    <div class="fl"><label>日期</label><input id="f-sv-date" type="date" value="${existingOrder?.order_date||today2}" ${editNo?'':`onchange="regenNoOnDateChange('sv-date','sv-no','SV','service_orders','order_no')"`} style="width:100%;padding:7px 8px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;outline:none"></div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
    <div class="fl"><label>選擇客戶</label>
      <div style="display:flex;gap:6px">
        <div class="ss-wrap" id="ss-svcust" style="flex:1">
          <input class="ss-input" id="ss-inp-svcust" placeholder="輸入姓名搜尋…" autocomplete="off" value="${existingOrder?.customer_name||''}"
            oninput="svcFilterCust(this.value)" onfocus="svcFilterCust(this.value)"
            onblur="setTimeout(()=>$('ss-drop-svcust')?.classList.remove('open'),200)">
          <input type="hidden" id="f-sv-cust" value="${existingOrder?.customer_no||''}">
          <div class="ss-drop" id="ss-drop-svcust"></div>
        </div>
        <button type="button" class="btn btn-s" style="flex-shrink:0" onclick="svcQuickAddCustomer()">＋ 新增客戶</button>
      </div>
    </div>
    ${fi('sv-cname','客戶姓名 *','text',existingOrder?.customer_name||'')}
  </div>
  <div style="margin-bottom:14px;padding:12px;background:var(--sf2);border-radius:var(--r)">
    <div style="font-weight:600;margin-bottom:8px;font-size:13px">加入服務項目（人工）</div>
    <div style="display:grid;grid-template-columns:1fr auto auto auto auto;gap:6px;align-items:end">
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
    <label style="display:flex;align-items:center;gap:5px;margin-top:6px;font-size:12px;cursor:pointer">
      <input type="checkbox" id="sv-sigift" style="width:14px;height:14px">
      <span>贈送這次服務（不收費，這筆金額自動算 $0，單價照樣保留紀錄）</span>
    </label>
    <div style="font-size:11px;color:var(--tx3);margin-top:4px">可在單價欄位覆蓋預設價格</div>
  </div>
  <div style="margin-bottom:14px;padding:12px;background:var(--sf2);border-radius:var(--r)">
    <div style="font-weight:600;margin-bottom:8px;font-size:13px;display:flex;justify-content:space-between;align-items:center">
      <span>加入耗材（服務庫存）</span>
      <select id="sv-kitsel" style="padding:4px 6px;border:1px solid var(--bd);border-radius:var(--r);font-size:11px" onchange="if(this.value)svcApplyKit(this.value);this.selectedIndex=0;">
        <option value="">套用套組…</option>
        ${(window._svcKitsList||[]).map(k=>`<option value="${k.id}">${k.name}</option>`).join('')}
      </select>
    </div>
    <div style="display:grid;grid-template-columns:1fr auto auto auto;gap:6px;align-items:end">
      <div class="ss-wrap" id="ss-svprod">
        <input class="ss-input" id="ss-inp-svprod" placeholder="輸入耗材名稱搜尋…" autocomplete="off"
          oninput="svcFilterProd(this.value)" onfocus="svcFilterProd(this.value)"
          onblur="setTimeout(()=>$('ss-drop-svprod')?.classList.remove('open'),200)">
        <input type="hidden" id="sv-prod">
        <div class="ss-drop" id="ss-drop-svprod"></div>
      </div>
      <input type="number" id="sv-prodqty" value="1" min="0.5" step="0.5" placeholder="用量"
        style="width:60px;padding:6px;border:1px solid var(--bd);border-radius:var(--r);font-size:12px">
      <input type="number" id="sv-prodprice" value="0" placeholder="加收費用"
        style="width:80px;padding:6px;border:1px solid var(--bd);border-radius:var(--r);font-size:12px">
      <button class="btn btn-s" onclick="svcAddConsumable()">＋ 加入</button>
    </div>
    <div style="font-size:11px;color:var(--tx3);margin-top:4px">用量＝這次實際用掉多少（會扣庫存、算成本）。「加收費用」是要另外跟客人收的錢，通常留 0 表示已包含在服務費裡，成本會照樣被記錄。</div>
  </div>
  <div style="margin-bottom:14px;padding:12px;background:var(--sf2);border-radius:var(--r)">
    <div style="font-weight:600;margin-bottom:8px;font-size:13px">贈送商品（會直接扣銷售商品庫存，自動連結這張服務單）</div>
    <div style="display:grid;grid-template-columns:2fr auto;gap:6px;align-items:end">
      <div class="ss-wrap" id="ss-svgift">
        <input class="ss-input" id="ss-inp-svgift" placeholder="輸入商品名稱搜尋…" autocomplete="off"
          oninput="svcFilterGiftProd(this.value)" onfocus="svcFilterGiftProd(this.value)"
          onblur="setTimeout(()=>$('ss-drop-svgift')?.classList.remove('open'),200)">
        <input type="hidden" id="sv-giftpno">
        <div class="ss-drop" id="ss-drop-svgift"></div>
      </div>
      <input type="number" id="sv-giftqty" value="1" min="1" step="1" placeholder="數量"
        style="width:60px;padding:6px;border:1px solid var(--bd);border-radius:var(--r);font-size:12px">
      <button class="btn btn-s" onclick="svcAddGiftProduct()">＋ 加入</button>
    </div>
    <div style="font-size:11px;color:var(--tx3);margin-top:4px">給客戶帶走的贈品（不是服務用掉的耗材），會直接扣「商品列表」的庫存，成本記在這張服務單裡。</div>
  </div>
  <div id="sv-items-area" style="margin-bottom:14px"></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
    ${fs('sv-pay','付款方式',['現金','銀行轉帳','LINE Pay','儲值扣款','現金+儲值'],existingOrder?.payment_method||'現金')}
    ${fi('sv-person','實際服務對象（選填）','text', existingOrder?.note?.match(/服務對象：([^）]*)/)?.[1]||'')}
  </div>
  <div class="fl" style="margin-bottom:10px">
    <label style="font-weight:600">備註</label>
    <textarea id="f-sv-note" rows="2" placeholder="例如：使用王太太儲值金，實際服務對象：王小姐"
      style="width:100%;padding:8px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;outline:none;resize:vertical">${existingOrder?.note?.replace(/（服務對象：[^）]*）/,'').replace(/^服務對象：.*/,'')||''}</textarea>
  </div>`,
  `<button class="btn" onclick="CM()">取消</button>
   <button class="btn btn-p" id="sv-savebtn" onclick="saveSvcOrder()">${editNo?'儲存修改':'建立服務單'}</button>`,true);

  window.svcFilterCust = q=>{
    const fil = q ? window._svcAllCusts.filter(c=>c.name.includes(q)||(c.phone||'').includes(q)) : window._svcAllCusts;
    const drop = $('ss-drop-svcust'); if(!drop) return;
    drop.classList.add('open');
    drop.style.maxHeight = '280px';
    drop.innerHTML = fil.map(c=>`<div class="ss-opt" onmousedown="svcPickCustSearch('${c.customer_no}','${(c.name||'').replace(/'/g,"\\'")}')">${c.name} · ${c.phone||'—'}</div>`).join('')||`<div class="ss-opt no">無結果</div>`;
  };
  window.svcFilterGiftProd = q=>{
    const fil = (q ? window._svcAllProds.filter(p=>p.name.includes(q)) : window._svcAllProds);
    const drop = $('ss-drop-svgift'); if(!drop) return;
    drop.classList.add('open');
    drop.innerHTML = fil.slice(0,30).map(p=>`<div class="ss-opt" onmousedown="svcPickGiftProd('${p.product_no}','${(p.name||'').replace(/'/g,"\\'")}')">${p.name}${p.spec?`（${p.spec}）`:''} [庫${p.stock}]</div>`).join('')||`<div class="ss-opt no">無結果</div>`;
  };
  window.svcPickGiftProd = (pno,name)=>{
    $('ss-inp-svgift').value = name;
    $('sv-giftpno').value = pno;
    $('ss-drop-svgift')?.classList.remove('open');
  };
  window.svcFilterProd = q=>{
    const list = window._svcConsumOptions||[];
    const fil = q ? list.filter(o=>o.label.includes(q)) : list;
    const drop = $('ss-drop-svprod'); if(!drop) return;
    drop.classList.add('open');
    // 依類型分組顯示：商品撥轉耗材／服務專屬耗材／客戶寄放商品
    const groups = {};
    fil.forEach(o=>{ (groups[o.type]=groups[o.type]||[]).push(o); });
    const typeLabel = {product:'商品撥轉耗材', consumable:'服務專屬耗材', deposit:'客戶寄放商品'};
    drop.innerHTML = Object.keys(groups).map(t=>`
      <div style="padding:4px 8px;font-size:10px;color:var(--tx3);background:var(--sf2);font-weight:600">${typeLabel[t]||t}</div>
      ${groups[t].map(o=>`<div class="ss-opt" onmousedown="svcPickProd('${o.type}','${o.value}')">${o.label}<span style="color:var(--tx3);font-size:11px"> ・${o.sub}</span></div>`).join('')}
    `).join('') || `<div class="ss-opt no">無結果</div>`;
  };
  window.svcPickProd = (type,value)=>{
    const o = (window._svcConsumOptions||[]).find(x=>x.type===type && String(x.value)===String(value));
    if(!o) return;
    $('ss-inp-svprod').value = o.label;
    $('sv-prod').value = value;
    $('sv-prod').dataset.type = type;
    $('sv-prod').dataset.id = o.id||'';
    $('sv-prod').dataset.unit = o.unit||'';
    $('sv-prod').dataset.perstock = o.perstock||1;
    $('sv-prod').dataset.cost = o.cost||0;
    $('sv-prodqty').value = o.defqty||1;
    $('ss-drop-svprod')?.classList.remove('open');
  };

  renderSvcItems();
  if(existingOrder?.customer_no) svcPickCust(existingOrder.customer_no, existingOrder.customer_name);
}

window.svcNewOrder     = svcNewOrder;
window.svcPickCust     = svcPickCust;
window.svcQuickAddCustomer = function(){
  OM2('新增客戶（快速）', `
  <div class="fg">
    ${fi('sqc-name','姓名 *')}
    ${fi('sqc-phone','手機')}
    <div class="fl"><label>位階</label><select id="f-sqc-lv">${LEVELS.map(l=>`<option>${l}</option>`).join('')}</select></div>
  </div>`,
  `<button class="btn" onclick="CM2()">取消</button>
   <button class="btn btn-p" onclick="saveSvcQuickCustomer()">新增並帶入</button>`);
};
window.saveSvcQuickCustomer = async function(){
  const nm=v('sqc-name');
  if(!nm){ toast('請填寫姓名','e'); return; }
  const{data:last}=await sb.from('customers').select('customer_no').like('customer_no','C-0____').order('customer_no',{ascending:false}).limit(5);
  let nextNo='C-00001';
  if(last&&last.length){
    const nums=last.map(r=>{const m=r.customer_no?.match(/^C-0(\d{4})$/);return m?parseInt('0'+m[1]):0;}).filter(n=>n>0&&n<10000);
    if(nums.length){const mx=Math.max(...nums);nextNo='C-'+String(mx+1).padStart(5,'0');}
  }
  const obj={customer_no:nextNo,name:nm,agent_level:v('sqc-lv'),phone:v('sqc-phone')};
  const{error}=await sb.from('customers').insert(obj);
  if(error){ toast('新增客戶失敗：'+error.message,'e'); return; }
  toast('✅ 客戶已新增');
  window._svcAllCusts.push({customer_no:nextNo,name:nm,phone:obj.phone});
  CM2();
  svcPickCust(nextNo, nm);
};

async function svcPickCust(custNo, custName) {
  if(custNo) {
    $('f-sv-cust').value = custNo;
    $('ss-inp-svcust').value = custName;
    $('f-sv-cname').value = custName;
    $('ss-drop-svcust')?.classList.remove('open');
    // 查儲值餘額（依客戶模式抓服務或共用帳戶）
    getSvcWalletType(custNo).then(walletType=>{
      sb.from('store_credits').select('balance').eq('customer_no',custNo).eq('wallet_type',walletType).maybeSingle()
        .then(({data})=>{
          const bal = data?.balance||0;
          let hint = document.getElementById('sv-credit-hint');
          if(!hint){ hint=document.createElement('div'); hint.id='sv-credit-hint';
            $('f-sv-cname').parentNode.appendChild(hint); }
          hint.innerHTML=`<div style="font-size:11px;color:${bal>0?'var(--ac)':'var(--tx3)'};margin-top:4px">${walletType}儲值餘額：${fM(bal)}</div>`;
        });
    });
    // 查這位客戶自己的寄放商品，加進耗材搜尋選項
    const deposits = await window.getCustomerDeposits?.(custNo) || [];
    // 先移除舊的寄放選項（換客戶時），再加入這位客戶目前的
    window._svcConsumOptions = (window._svcConsumOptions||[]).filter(o=>o.type!=='deposit');
    deposits.forEach(d=>{
      const remain = (d.total_qty||0)-(d.used_qty||0);
      window._svcConsumOptions.push({
        type:'deposit', value:'DEP:'+d.id, id:d.id, label:d.product_name,
        sub:`客戶寄放商品・她寄放剩 ${remain} ${d.unit}`,
        unit:d.unit, defqty:d.default_service_qty||1, cost:0
      });
    });
  }
}
window.svcPickCustSearch = svcPickCust;
function svcAddServiceItem() {
  const sel = document.getElementById('sv-sitem');
  const opt = sel.options[sel.selectedIndex];
  if(!opt.value){ toast('請選擇服務項目','e'); return; }
  const qty = parseFloat(document.getElementById('sv-siqty').value)||1;
  const price = parseFloat(document.getElementById('sv-siprice').value)||parseFloat(opt.dataset.price)||0;
  const isGift = document.getElementById('sv-sigift')?.checked||false;
  const techSel = document.getElementById('sv-tech');
  const techOpt = techSel?.options[techSel.selectedIndex];
  const techId = techOpt?.value ? parseInt(techOpt.value) : null;
  const techName = techOpt?.dataset?.name || null;
  const techMode = techOpt?.dataset?.mode || 'percentage';
  const techRate = parseFloat(techOpt?.dataset?.rate)||0.5;
  const techFixed = parseFloat(techOpt?.dataset?.fixed)||0;
  const techPay = !techId ? 0
    : techMode==='fixed' ? Math.round(qty * techFixed * 100)/100
    : Math.round(qty * price * techRate * 100)/100;
  window._svcItems.push({
    id: Date.now(), item_type:'service', item_name:opt.text.split('（')[0],
    qty, unit:opt.dataset.unit||'次', unit_price:price, cost:0, subtotal:isGift?0:qty*price,
    is_gift:isGift, technician_id:techId, technician_name:techName, technician_pay:techPay
  });
  const giftCb = document.getElementById('sv-sigift'); if(giftCb) giftCb.checked=false;
  sel.selectedIndex = 0;
  document.getElementById('sv-siqty').value = 1;
  document.getElementById('sv-siprice').value = '';
  renderSvcItems();
}

window.svcAddServiceItem = svcAddServiceItem;
function svcProdChange(sel) {
  const opt = sel.options[sel.selectedIndex];
  const qtyEl = document.getElementById('sv-prodqty');
  if(!qtyEl || !opt.value) return;
  qtyEl.value = opt.dataset.defqty || 1;
}

window.svcProdChange = svcProdChange;
function svcAddConsumable() {
  const hidden = document.getElementById('sv-prod');
  const itemName = document.getElementById('ss-inp-svprod')?.value;
  if(!hidden.value){ toast('請搜尋並選擇耗材','e'); return; }
  const qty = parseFloat(document.getElementById('sv-prodqty').value)||1;
  const svcPrice = parseFloat(document.getElementById('sv-prodprice').value)||0;
  const type = hidden.dataset.type||'product';

  if(type==='deposit') {
    // 客戶自己寄放的商品：不算成本（已經是她的東西），扣的是她自己的寄放庫存，不動店裡庫存
    window._svcItems.push({
      id: Date.now(), item_type:'consumable', source:'deposit',
      item_name: itemName,
      deposit_id: parseInt(hidden.dataset.id),
      qty, unit:hidden.dataset.unit||'組',
      unit_price: svcPrice,
      cost: 0,
      subtotal: svcPrice * qty
    });
  } else if(type==='consumable') {
    // 服務專屬耗材：成本已是「每服務單位」，不用換算
    const costPerSvcUnit = parseFloat(hidden.dataset.cost)||0;
    window._svcItems.push({
      id: Date.now(), item_type:'consumable', source:'consumable',
      item_name: itemName,
      consumable_id: parseInt(hidden.dataset.id),
      qty, unit:hidden.dataset.unit||'個',
      unit_price: svcPrice,
      cost: Math.round(costPerSvcUnit * qty * 100)/100,
      subtotal: svcPrice * qty
    });
  } else {
    // 商品撥轉耗材：成本要用「進貨成本 ÷ 1盒/瓶總容量」換算成每單位成本，再乘以這次用量
    const costPerUnit = parseFloat(hidden.dataset.cost)||0;
    const costPerSvcUnit = costPerUnit / (parseFloat(hidden.dataset.perstock)||1);
    window._svcItems.push({
      id: Date.now(), item_type:'consumable', source:'product',
      item_name: itemName,
      product_no: hidden.value,
      qty, unit:hidden.dataset.unit||'次',
      unit_price: svcPrice,
      cost: Math.round(costPerSvcUnit * qty * 100)/100,
      subtotal: svcPrice * qty
    });
  }
  $('ss-inp-svprod').value = '';
  hidden.value = ''; hidden.dataset.type=''; hidden.dataset.id=''; hidden.dataset.unit=''; hidden.dataset.perstock=''; hidden.dataset.cost='';
  document.getElementById('sv-prodqty').value = 1;
  document.getElementById('sv-prodprice').value = 0;
  renderSvcItems();
}

window.svcAddConsumable  = svcAddConsumable;

function svcAddGiftProduct() {
  const pno = $('sv-giftpno')?.value;
  const name = $('ss-inp-svgift')?.value;
  if(!pno){ toast('請搜尋並選擇商品','e'); return; }
  const qty = parseFloat($('sv-giftqty')?.value)||1;
  const prod = (window._svcAllProds||[]).find(p=>p.product_no===pno);
  window._svcItems.push({
    id: Date.now(), item_type:'gift_product', source:'gift_product',
    item_name: name, product_no: pno,
    qty, unit:'個',
    unit_price: 0,
    cost: Math.round((prod?.cost||0) * qty * 100)/100,
    subtotal: 0
  });
  $('ss-inp-svgift').value=''; $('sv-giftpno').value=''; $('sv-giftqty').value=1;
  renderSvcItems();
}
window.svcAddGiftProduct = svcAddGiftProduct;

async function svcApplyKit(kitId) {
  if(!window.resolveSvcKitItems) { toast('套組功能載入中，請稍後再試','e'); return; }
  const { items, warnings } = await window.resolveSvcKitItems(parseInt(kitId));
  items.forEach(i=>{
    if(i.type==='product') {
      window._svcItems.push({
        id: Date.now()+Math.random(), item_type:'consumable', source:'product',
        item_name: i.item_name, product_no: i.product_no,
        qty: i.qty, unit: i.unit||'次', unit_price: 0,
        cost: Math.round((i.cost||0) * i.qty * 100)/100, subtotal: 0
      });
    } else {
      window._svcItems.push({
        id: Date.now()+Math.random(), item_type:'consumable', source:'consumable',
        item_name: i.item_name, consumable_id: i.consumable_id,
        qty: i.qty, unit: i.unit||'個', unit_price: 0,
        cost: Math.round((i.cost||0) * i.qty * 100)/100, subtotal: 0
      });
    }
  });
  renderSvcItems();
  if(items.length) toast(`✅ 已套用套組，加入 ${items.length} 項`);
  if(warnings.length) toast(`⚠️ 以下品項庫存不足，未加入：${warnings.join('、')}`,'e');
}
window.svcApplyKit = svcApplyKit;

function renderSvcItems() {
  const area = document.getElementById('sv-items-area');
  if(!area) return;
  if(!window._svcItems.length){ area.innerHTML=''; return; }
  const total = window._svcItems.reduce((s,i)=>s+i.subtotal,0);
  const consumableCost = window._svcItems.filter(i=>i.item_type==='consumable'||i.item_type==='gift_product').reduce((s,i)=>s+i.cost,0);
  area.innerHTML = `
  <div class="tc">
    <div class="tb"><span class="tt">訂單品項</span></div>
    <div class="tw"><table style="width:100%">
      <tr><th>#</th><th>類型</th><th>項目</th><th>數量</th><th>單價</th><th>成本</th><th>小計</th><th>技師</th><th></th></tr>
      ${window._svcItems.map((i,idx)=>`<tr>
        <td style="font-size:12px;color:var(--tx3)">${idx+1}</td>
        <td><span class="badge ${i.item_type==='service'?'bg':i.item_type==='gift_product'?'ba':'br2'}" style="font-size:10px">${i.item_type==='service'?'服務':i.item_type==='gift_product'?'贈品':'耗材'}</span></td>
        <td style="font-size:13px">${i.item_name}${i.is_gift?' <span class="badge ba" style="font-size:10px">贈</span>':''}</td>
        <td>${i.qty}${i.unit}</td>
        <td class="num">${fM(i.unit_price)}</td>
        <td class="num" style="color:${(i.item_type==='consumable'||i.item_type==='gift_product')?'var(--rd)':'var(--tx3)'}">${(i.item_type==='consumable'||i.item_type==='gift_product')?fM(i.cost):'—'}</td>
        <td class="num"><b>${fM(i.subtotal)}</b></td>
        <td style="font-size:11px;color:var(--tx3)">${i.technician_name||'—'}</td>
        <td><button onclick="rmSvcItem(${i.id})" style="background:none;border:none;cursor:pointer;color:var(--rd);font-size:16px">×</button></td>
      </tr>`).join('')}
    </table></div>
  </div>
  <div style="text-align:right;margin-top:6px">
    <div style="font-size:12px;color:var(--tx3)">共 ${window._svcItems.length} 項品項</div>
    ${consumableCost>0?`<div style="font-size:12px;color:var(--rd)">耗材成本合計：${fM(consumableCost)}</div>`:''}
    <div style="font-weight:700;font-size:15px">合計：${fM(total)}</div>
  </div>`;
}

function rmSvcItem(id) {
  window._svcItems = window._svcItems.filter(i=>i.id!==id);
  renderSvcItems();
}

window.rmSvcItem       = rmSvcItem;
async function saveSvcOrder() {
  const no = v('sv-no');
  const date = v('sv-date');
  const custSel = document.getElementById('f-sv-cust');
  const custNo = custSel?.value||null;
  const custName = v('sv-cname');
  const payMethod = v('sv-pay');
  const person = v('sv-person');
  const noteRaw = document.getElementById('f-sv-note')?.value?.trim();
  const note = person && noteRaw ? `${noteRaw}（服務對象：${person}）` :
               person ? `服務對象：${person}` : noteRaw || null;
  if(!no||!date||!custName){ toast('請填寫單號、日期、客戶','e'); return; }
  if(!window._svcItems.length){ toast('請加入至少一個品項','e'); return; }
  const btn = $('sv-savebtn');
  if(btn){ btn.disabled=true; btn.dataset.origText=btn.textContent; btn.textContent='儲存中…'; btn.style.opacity='.6'; }

  try {
  // 編輯模式：先還原這張單原本造成的庫存/耗材/寄放/儲值影響，緊接著馬上重新套用畫面上目前的內容——
  // 兩件事在同一次「儲存」裡連續完成，不會再有「打開編輯就先破壞資料、卻沒真的存到新內容」的風險
  if(window._svcEditNo) {
    await reverseSvcOrderEffects(window._svcEditNo);
  }
  const total = window._svcItems.reduce((s,i)=>s+i.subtotal,0);
  const consumableCost = window._svcItems.filter(i=>i.item_type==='consumable'||i.item_type==='gift_product').reduce((s,i)=>s+i.cost,0);

  // 儲值扣款計算
  let paidByCredit = 0, paidByCash = total;
  const svcWallet = custNo ? await getSvcWalletType(custNo) : '共用';
  if(payMethod.includes('儲值') && custNo) {
    const { data:cr } = await sb.from('store_credits').select('balance').eq('customer_no',custNo).eq('wallet_type',svcWallet).maybeSingle();
    const bal = cr?.balance||0;
    if(payMethod==='儲值扣款') {
      // 純儲值扣款：這筆錢就是要從儲值扣，餘額不夠也照扣，允許變成負數（代表客戶已經欠款，之後補儲值時會自動抵掉）
      paidByCredit = total; paidByCash = 0;
    } else if(payMethod==='現金+儲值') {
      // 現金+儲值：儲值有多少先扣多少，不夠的部分才用現金補，這個模式不會讓餘額變負
      paidByCredit=Math.min(bal,total); paidByCash=Math.max(0,total-paidByCredit);
    }
  }

  // 1. 建/更新服務訂單
  const editNo = window._svcEditNo;
  const payload = {
    order_no:no, order_date:date, customer_no:custNo, customer_name:custName,
    total, consumable_cost:consumableCost,
    paid_by_credit:paidByCredit, paid_by_cash:paidByCash,
    payment_method:payMethod, note:note||null
  };
  const { error:e1 } = editNo
    ? await sb.from('service_orders').update(payload).eq('order_no',editNo)
    : await sb.from('service_orders').insert(payload);
  if(e1){ toast((editNo?'更新失敗：':'建立失敗：')+e1.message,'e'); return; }

  // 2. 建品項
  const items = window._svcItems.map(i=>({
    order_no:no, item_type:i.item_type, item_name:i.item_name,
    product_no:i.product_no||null, consumable_id:i.consumable_id||null, deposit_id:i.deposit_id||null, is_gift:i.is_gift||false,
    qty:i.qty, unit:i.unit,
    unit_price:i.unit_price, cost:i.cost, subtotal:i.subtotal,
    technician_id:i.technician_id||null, technician_name:i.technician_name||null,
    technician_pay:i.technician_pay||0
  }));
  await sb.from('service_order_items').insert(items);

  // 3. 扣服務庫存（商品撥轉耗材 → service_inventory；服務專屬耗材 → service_consumables；客戶寄放商品 → customer_deposits，並留使用記錄）— 平行處理加快速度
  await Promise.all(window._svcItems.filter(i=>i.item_type==='consumable'&&i.product_no).map(async item=>{
    const { data:inv } = await sb.from('service_inventory').select('stock_qty').eq('product_no',item.product_no).single();
    if(inv) {
      const newQty = Math.max(0, (inv.stock_qty||0)-item.qty);
      await sb.from('service_inventory').update({stock_qty:newQty,updated_at:new Date().toISOString()}).eq('product_no',item.product_no);
    }
  }));
  await Promise.all(window._svcItems.filter(i=>i.item_type==='consumable'&&i.consumable_id).map(async item=>{
    const { data:sc } = await sb.from('service_consumables').select('stock_qty').eq('id',item.consumable_id).single();
    if(sc) {
      const newQty = Math.max(0, (sc.stock_qty||0)-item.qty);
      await sb.from('service_consumables').update({stock_qty:newQty,updated_at:new Date().toISOString()}).eq('id',item.consumable_id);
    }
  }));
  await Promise.all(window._svcItems.filter(i=>i.item_type==='consumable'&&i.deposit_id).map(async item=>{
    const { data:dep } = await sb.from('customer_deposit_items').select('used_qty').eq('id',item.deposit_id).single();
    if(dep) {
      await Promise.all([
        sb.from('customer_deposit_items').update({used_qty:(dep.used_qty||0)+item.qty}).eq('id',item.deposit_id),
        sb.from('customer_deposit_usages').insert({
          deposit_item_id:item.deposit_id, use_date:date, qty_used:item.qty, use_type:'服務使用', service_order_no:no
        })
      ]);
    }
  }));
  // 贈送商品 → 直接扣「商品列表」的銷售庫存（跟服務庫存分開），已經透過 service_order_items.order_no 連結這張服務單
  await Promise.all(window._svcItems.filter(i=>i.item_type==='gift_product'&&i.product_no).map(async item=>{
    const { data:p } = await sb.from('products').select('stock').eq('product_no',item.product_no).single();
    if(p) {
      const newQty = Math.max(0, (p.stock||0)-item.qty);
      await sb.from('products').update({stock:newQty}).eq('product_no',item.product_no);
    }
  }));

  // 4. 儲值扣款記錄（依客戶模式決定服務或共用帳戶）
  if(paidByCredit>0 && custNo) {
    const { data:cr } = await sb.from('store_credits').select('balance').eq('customer_no',custNo).eq('wallet_type',svcWallet).maybeSingle();
    const newBal = (cr?.balance||0)-paidByCredit;
    if(cr) await sb.from('store_credits').update({balance:newBal,updated_at:new Date().toISOString()}).eq('customer_no',custNo).eq('wallet_type',svcWallet);
    else await sb.from('store_credits').insert({customer_no:custNo,customer_name:custName,wallet_type:svcWallet,balance:newBal});
    await sb.from('store_credit_records').insert({
      customer_no:custNo, wallet_type:svcWallet, record_date:date, type:'deduct',
      amount:-paidByCredit, balance_after:newBal, note:`服務單 ${no}`, order_no:no
    });
  }

  await logAction(editNo?'update':'create','service_orders',no,`${editNo?'修改':'新增'}服務單 ${no}，客戶：${custName}，金額：${fM(total)}`,null,{total});
  toast(editNo?'✅ 服務單已更新':'✅ 服務單建立成功');
  CM();
  window._svcItems=[];
  window._svcEditNo=null;
  svcOrders();
  } finally {
    if(btn){ btn.disabled=false; btn.textContent=btn.dataset.origText||'建立服務單'; btn.style.opacity=''; }
  }
}

window.saveSvcOrder    = saveSvcOrder;
// 還原一張服務單造成的所有影響（庫存/耗材/客戶寄放/儲值），供刪除、編輯共用
async function reverseSvcOrderEffects(no) {
  const [{ data:o },{ data:its }] = await Promise.all([
    sb.from('service_orders').select('*').eq('order_no',no).single(),
    sb.from('service_order_items').select('*').eq('order_no',no),
  ]);
  for(const item of (its||[]).filter(i=>i.item_type==='consumable'&&i.product_no)) {
    const { data:inv } = await sb.from('service_inventory').select('stock_qty').eq('product_no',item.product_no).single();
    if(inv) await sb.from('service_inventory').update({stock_qty:(inv.stock_qty||0)+item.qty,updated_at:new Date().toISOString()}).eq('product_no',item.product_no);
  }
  for(const item of (its||[]).filter(i=>i.item_type==='consumable'&&i.consumable_id)) {
    const { data:sc } = await sb.from('service_consumables').select('stock_qty').eq('id',item.consumable_id).single();
    if(sc) await sb.from('service_consumables').update({stock_qty:(sc.stock_qty||0)+item.qty,updated_at:new Date().toISOString()}).eq('id',item.consumable_id);
  }
  for(const item of (its||[]).filter(i=>i.item_type==='consumable'&&i.deposit_id)) {
    const { data:dep } = await sb.from('customer_deposit_items').select('used_qty').eq('id',item.deposit_id).single();
    if(dep) await sb.from('customer_deposit_items').update({used_qty:Math.max(0,(dep.used_qty||0)-item.qty)}).eq('id',item.deposit_id);
  }
  await sb.from('customer_deposit_usages').delete().eq('service_order_no',no);
  for(const item of (its||[]).filter(i=>i.item_type==='gift_product'&&i.product_no)) {
    const { data:p } = await sb.from('products').select('stock').eq('product_no',item.product_no).single();
    if(p) await sb.from('products').update({stock:(p.stock||0)+item.qty}).eq('product_no',item.product_no);
  }
  if(o?.paid_by_credit>0 && o?.customer_no) {
    const { data:existingRec } = await sb.from('store_credit_records').select('wallet_type').eq('order_no',no).eq('type','deduct').maybeSingle();
    const walletType = existingRec?.wallet_type || await getSvcWalletType(o.customer_no);
    const { data:cr } = await sb.from('store_credits').select('balance').eq('customer_no',o.customer_no).eq('wallet_type',walletType).maybeSingle();
    if(cr) await sb.from('store_credits').update({balance:(cr.balance||0)+o.paid_by_credit,updated_at:new Date().toISOString()}).eq('customer_no',o.customer_no).eq('wallet_type',walletType);
    await sb.from('store_credit_records').delete().eq('order_no',no);
    if(o.customer_no) await window.recomputeCreditChain?.(o.customer_no,walletType);
  }
  await sb.from('service_order_items').delete().eq('order_no',no);
}
window.reverseSvcOrderEffects = reverseSvcOrderEffects;

async function deleteSvcOrder(no) {
  if(!confirm(`確定刪除服務單 ${no}？\n\n會一併還原這張單扣掉的庫存/耗材/客戶寄放數量，以及退回儲值扣款。`)) return;
  await reverseSvcOrderEffects(no);
  await sb.from('service_orders').delete().eq('order_no',no);
  toast('已刪除，相關庫存與儲值已還原');
  CM();
  svcOrders();
}

window.deleteSvcOrder  = deleteSvcOrder;
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
      if(priceEl) priceEl.value = price;
    }
  }
}

window.svcItemChange = svcItemChange;

window.svcOrders = svcOrders;
window.renderSvcItems = renderSvcItems;

// ══════════════════════════════
// 服務贈品總覽（合併：服務單贈送商品 + 儲值贈送商品，方便看庫存去了哪）
// ══════════════════════════════
async function svcGifts() {
  const [{ data:svcGiftItems, error:e1 },{ data:crGiftRecs, error:e2 }] = await Promise.all([
    sb.from('service_order_items').select('order_no,item_name,product_no,qty,unit,cost').eq('item_type','gift_product').order('order_no',{ascending:false}),
    sb.from('store_credit_records').select('id,customer_no,record_date,product_no,product_name,product_qty,note').eq('type','gift').order('record_date',{ascending:false}),
  ]);
  if(e1) console.error('svcGifts service_order_items error', e1);
  if(e2) console.error('svcGifts store_credit_records error', e2);

  // 服務單贈品需要另外查訂單資訊（日期、客戶）
  const orderNos = [...new Set((svcGiftItems||[]).map(i=>i.order_no))];
  let orderMap = {};
  if(orderNos.length) {
    const { data:ords } = await sb.from('service_orders').select('order_no,order_date,customer_name').in('order_no',orderNos);
    (ords||[]).forEach(o=>orderMap[o.order_no]=o);
  }
  // 儲值贈品記錄只有 customer_no，另外查客戶姓名
  const custNos = [...new Set((crGiftRecs||[]).map(r=>r.customer_no).filter(Boolean))];
  let custMap = {};
  if(custNos.length) {
    const { data:custs } = await sb.from('customers').select('customer_no,name').in('customer_no',custNos);
    (custs||[]).forEach(c=>custMap[c.customer_no]=c.name);
  }

  const rows = [
    ...(svcGiftItems||[]).map(i=>({
      date: orderMap[i.order_no]?.order_date||'', customer: orderMap[i.order_no]?.customer_name||'—',
      product: i.item_name, qty: i.qty, unit: i.unit||'個', cost: i.cost,
      source:'服務單', sourceNo: i.order_no
    })),
    ...(crGiftRecs||[]).map(r=>({
      date: r.record_date, customer: custMap[r.customer_no]||r.customer_no,
      product: r.product_name, qty: r.product_qty, unit:'個', cost: null,
      source:'儲值贈品', sourceNo: null
    })),
  ].sort((a,b)=>(b.date||'').localeCompare(a.date||''));

  const totalCost = rows.reduce((s,r)=>s+(r.cost||0),0);

  $('svc-content').innerHTML = `
  <div class="al al-w" style="font-size:12px;margin-bottom:12px">
    這裡彙整所有「送給客戶帶走的商品」——包含服務單裡的贈送商品、儲值時附送的商品，兩邊都會直接扣商品列表的庫存，這裡讓你一次看清楚庫存都去哪了。
  </div>
  <div class="tc"><div class="tb"><span class="tt">服務贈品記錄</span><span class="badge bg" style="font-size:11px;margin-left:8px">共 ${rows.length} 筆</span></div>
  <div class="tw"><table style="width:100%">
    <tr><th>日期</th><th>客戶</th><th>商品</th><th>數量</th><th>成本</th><th>來源</th></tr>
    ${rows.map(r=>`<tr>
      <td style="font-size:12px">${fD(r.date)}</td>
      <td style="font-weight:500">${r.customer}</td>
      <td>${r.product||'—'}</td>
      <td class="num">${r.qty||0} ${r.unit}</td>
      <td class="num" style="color:var(--rd)">${r.cost!=null?fM(r.cost):'—'}</td>
      <td>
        ${r.source==='服務單'
          ? `<a href="#" onclick="event.preventDefault();svcShowOrder('${r.sourceNo}')" style="color:var(--ac);font-size:11px">服務單：${r.sourceNo}</a>`
          : `<span class="badge ba" style="font-size:10px">儲值贈品</span>`}
      </td>
    </tr>`).join('')||'<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--tx3)">尚無服務贈品記錄</td></tr>'}
  </table></div>
  ${totalCost>0?`<div style="padding:10px 16px;text-align:right;font-size:13px;color:var(--tx3)">已知成本合計（不含未計成本的儲值贈品）：<b style="color:var(--rd)">${fM(totalCost)}</b></div>`:''}
  </div>`;
}
window.svcGifts = svcGifts;