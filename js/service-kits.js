// ═══════════════════════════════════════
// service-kits.js — 服務耗材套組
// 把常用的固定耗材組合存成套組，建服務單時一鍵套用，不用每次一項一項加
// ═══════════════════════════════════════

async function svcKits() {
  const { data:allKits } = await sb.from('service_kits').select('*').order('sort_order').order('name');
  const hideInactive = window._svcKitsHideInactive!==false; // 預設隱藏
  const kits = hideInactive ? (allKits||[]).filter(k=>k.is_active!==false) : (allKits||[]);
  const inactiveCount = (allKits||[]).filter(k=>k.is_active===false).length;
  const kitIds = (kits||[]).map(k=>k.id);
  let itemsByKit = {};
  if(kitIds.length) {
    const { data:items } = await sb.from('service_kit_items').select('*').in('kit_id',kitIds);
    (items||[]).forEach(i=>{ (itemsByKit[i.kit_id]=itemsByKit[i.kit_id]||[]).push(i); });
  }

  $('svc-content').innerHTML = `
  <div style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;gap:8px">
    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;color:var(--tx3)">
      <input type="checkbox" ${hideInactive?'checked':''} onchange="window._svcKitsHideInactive=this.checked;svcKits()">
      隱藏已停用${inactiveCount>0?`（${inactiveCount}組）`:''}
    </label>
    <button class="btn btn-p btn-s" onclick="svcKitModal()">＋ 新增套組</button>
  </div>
  <div class="al al-w" style="font-size:12px;margin-bottom:12px">
    把固定會一起用到的耗材（例如「做臉基礎組」6項）存成套組，建服務單時在「加入耗材」按「套用套組」一次全部帶入，不用一項一項加。
  </div>
  ${kits.length===0 ? `<div class="tc"><div style="padding:20px;text-align:center;color:var(--tx3)">${hideInactive&&inactiveCount>0?'全部都是已停用的套組，取消勾選「隱藏已停用」即可看到':'尚無套組，請先新增'}</div></div>` :
  kits.map(k=>{
    const its = itemsByKit[k.id]||[];
    return `<div class="tc" style="margin-bottom:14px;${k.is_active===false?'opacity:.5':''}">
      <div class="tb"><span class="tt">${k.name}</span><span class="badge bg" style="font-size:11px;margin-left:8px">${its.length} 項</span>
        <div style="margin-left:auto;display:flex;gap:6px">
          <button class="btn btn-s" onclick="svcKitModal(${k.id})">編輯</button>
          <button class="btn btn-s" onclick="toggleSvcKit(${k.id},${k.is_active!==false})">${k.is_active!==false?'停用':'啟用'}</button>
          <button class="btn btn-s btn-r" onclick="deleteSvcKit(${k.id},'${k.name.replace(/'/g,"\\'")}')">刪除</button>
        </div>
      </div>
      <div style="padding:10px 16px;font-size:13px;color:var(--tx3)">
        ${its.map(i=>`${i.item_name}×${i.qty}${i.unit||''}`).join('、')||'（尚無品項）'}
      </div>
      ${k.note?`<div style="padding:0 16px 10px;font-size:12px;color:var(--tx3)">備註：${k.note}</div>`:''}
    </div>`;
  }).join('')}`;
}
window.svcKits = svcKits;

async function svcKitModal(id) {
  let kit=null, items=[];
  if(id) {
    const [{ data:k },{ data:its }] = await Promise.all([
      sb.from('service_kits').select('*').eq('id',id).single(),
      sb.from('service_kit_items').select('*').eq('kit_id',id),
    ]);
    kit=k; items=its||[];
  }
  window._skEditId = id||null;
  window._skItems = items.map(i=>({...i}));

  const [{ data:sinv },{ data:sconsum }] = await Promise.all([
    sb.from('service_inventory').select('*, products(name,service_unit,default_service_qty)').gt('stock_qty',0).order('product_no'),
    sb.from('service_consumables').select('*').eq('is_active',true).order('name'),
  ]);
  window._skProdOpts = (sinv||[]).map(p=>({value:p.product_no,type:'product',unit:p.products?.service_unit||'次',defQty:p.products?.default_service_qty||1,label:p.products?.name||p.product_no}));
  window._skConsumOpts = (sconsum||[]).map(c=>({value:String(c.id),type:'consumable',unit:c.unit,defQty:1,label:c.name}));

  OM(id?'編輯套組':'新增套組', `
  ${fi('sk-name','套組名稱 *','text',kit?.name||'')}
  ${fi('sk-note','備註（選填）','text',kit?.note||'')}
  <div style="margin-top:12px;padding:12px;background:var(--sf2);border-radius:var(--r)">
    <div style="font-weight:600;margin-bottom:8px;font-size:13px">套組品項</div>
    <div style="display:grid;grid-template-columns:1fr auto auto;gap:6px;align-items:end">
      <div class="ss-wrap" id="ss-skitem">
        <input class="ss-input" id="ss-inp-skitem" placeholder="輸入耗材名稱搜尋…" autocomplete="off"
          oninput="skFilterItem(this.value)" onfocus="skFilterItem(this.value)"
          onblur="setTimeout(()=>$('ss-drop-skitem')?.classList.remove('open'),200)">
        <input type="hidden" id="sk-add-item">
        <div class="ss-drop" id="ss-drop-skitem"></div>
      </div>
      <input type="number" id="sk-add-qty" value="1" min="0.5" step="0.5" style="width:60px;padding:6px;border:1px solid var(--bd);border-radius:var(--r);font-size:12px">
      <button class="btn btn-s" onclick="skAddItem()">＋ 加入</button>
    </div>
    <div id="sk-item-list" style="margin-top:8px"></div>
  </div>`,
  `<button class="btn" onclick="CM()">取消</button>
   <button class="btn btn-p" onclick="saveSvcKit()">${id?'儲存':'建立'}</button>`,true);
  skRenderItems();
}
window.svcKitModal = svcKitModal;

function skFilterItem(q) {
  const all = [
    ...(window._skProdOpts||[]).map(o=>({...o, val:'P:'+o.value, typeLabel:'商品撥轉耗材'})),
    ...(window._skConsumOpts||[]).map(o=>({...o, val:'C:'+o.value, typeLabel:'服務專屬耗材'})),
  ];
  const fil = q ? all.filter(o=>o.label.includes(q)) : all;
  const drop = $('ss-drop-skitem'); if(!drop) return;
  drop.classList.add('open');
  const groups = {};
  fil.forEach(o=>{ (groups[o.typeLabel]=groups[o.typeLabel]||[]).push(o); });
  drop.innerHTML = Object.keys(groups).map(t=>`
    <div style="padding:4px 8px;font-size:10px;color:var(--tx3);background:var(--sf2);font-weight:600">${t}</div>
    ${groups[t].map(o=>`<div class="ss-opt" onmousedown="skPickItem('${o.val}')">${o.label}</div>`).join('')}
  `).join('') || `<div class="ss-opt no">無結果</div>`;
}
window.skFilterItem = skFilterItem;
function skPickItem(val) {
  const [prefix,rawVal] = [val.slice(0,1), val.slice(2)];
  const o = prefix==='P' ? window._skProdOpts.find(x=>x.value===rawVal) : window._skConsumOpts.find(x=>x.value===rawVal);
  if(!o) return;
  $('ss-inp-skitem').value = o.label;
  $('sk-add-item').value = val;
  $('sk-add-qty').value = o.defQty;
  $('ss-drop-skitem')?.classList.remove('open');
}
window.skPickItem = skPickItem;

function skAddItem() {
  const val = $('sk-add-item')?.value;
  if(!val){ toast('請搜尋並選擇耗材','e'); return; }
  const qty = parseFloat($('sk-add-qty').value)||1;
  const [prefix,rawVal] = [val.slice(0,1), val.slice(2)];
  if(prefix==='P') {
    const o = window._skProdOpts.find(x=>x.value===rawVal);
    window._skItems.push({source_type:'product', product_no:rawVal, consumable_id:null, item_name:o.label, qty, unit:o.unit});
  } else {
    const o = window._skConsumOpts.find(x=>x.value===rawVal);
    window._skItems.push({source_type:'consumable', product_no:null, consumable_id:parseInt(rawVal), item_name:o.label, qty, unit:o.unit});
  }
  $('ss-inp-skitem').value=''; $('sk-add-item').value=''; $('sk-add-qty').value=1;
  skRenderItems();
}
window.skAddItem = skAddItem;

function skRenderItems() {
  const el = $('sk-item-list'); if(!el) return;
  el.innerHTML = (window._skItems||[]).map((i,idx)=>`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 8px;background:var(--sf);border-radius:var(--r);margin-bottom:4px;font-size:12px">
      <span>${i.item_name} × ${i.qty}${i.unit||''}</span>
      <button onclick="skRmItem(${idx})" style="background:none;border:none;cursor:pointer;color:var(--rd);font-size:15px">×</button>
    </div>`).join('') || '<div style="font-size:12px;color:var(--tx3)">尚未加入品項</div>';
}
window.skRenderItems = skRenderItems;
function skRmItem(idx) { window._skItems.splice(idx,1); skRenderItems(); }
window.skRmItem = skRmItem;

async function saveSvcKit() {
  const name = v('sk-name');
  if(!name){ toast('請填寫套組名稱','e'); return; }
  if(!window._skItems.length){ toast('請至少加入一項耗材','e'); return; }
  const id = window._skEditId;
  const payload = { name, note:v('sk-note')||null };
  let kitId = id;
  if(id) {
    const { error } = await sb.from('service_kits').update(payload).eq('id',id);
    if(error){ toast('更新失敗：'+error.message,'e'); return; }
    await sb.from('service_kit_items').delete().eq('kit_id',id);
  } else {
    const { data, error } = await sb.from('service_kits').insert({...payload, is_active:true}).select('id').single();
    if(error){ toast('建立失敗：'+error.message,'e'); return; }
    kitId = data.id;
  }
  const cleanItems = window._skItems.map(({id:_omit, kit_id:_omit2, ...rest})=>({...rest, kit_id:kitId}));
  const { error:insErr } = await sb.from('service_kit_items').insert(cleanItems);
  if(insErr){ toast('品項儲存失敗：'+insErr.message,'e'); return; }
  toast('✅ 已儲存');
  CM();
  svcKits();
}
window.saveSvcKit = saveSvcKit;

async function toggleSvcKit(id, current) {
  await sb.from('service_kits').update({is_active:!current}).eq('id',id);
  svcKits();
}
window.toggleSvcKit = toggleSvcKit;
async function deleteSvcKit(id, name) {
  if(!confirm(`確定刪除套組「${name}」？`)) return;
  await sb.from('service_kit_items').delete().eq('kit_id',id);
  await sb.from('service_kits').delete().eq('id',id);
  toast('已刪除');
  svcKits();
}
window.deleteSvcKit = deleteSvcKit;

// 供 service-orders.js 呼叫：抓所有啟用中的套組（給「套用套組」下拉選單用）
async function getSvcKitsList() {
  const { data } = await sb.from('service_kits').select('*').eq('is_active',true).order('sort_order').order('name');
  return data||[];
}
window.getSvcKitsList = getSvcKitsList;

// 套用套組：回傳這個套組裡每項耗材「現在」的即時成本/庫存資訊（不用套組存的舊資料，避免成本過期）
async function resolveSvcKitItems(kitId) {
  const { data:items } = await sb.from('service_kit_items').select('*').eq('kit_id',kitId);
  const result = [];
  const warnings = [];
  for(const i of (items||[])) {
    if(i.source_type==='product') {
      const { data:inv } = await sb.from('service_inventory').select('*, products(name,service_unit,service_units_per_stock,cost)').eq('product_no',i.product_no).maybeSingle();
      if(!inv || (inv.stock_qty||0) < i.qty) { warnings.push(`${i.item_name}（服務庫存不足或已無庫存）`); continue; }
      const perStock = parseFloat(inv.products?.service_units_per_stock)||1;
      const costPerSvcUnit = (inv.products?.cost||0) / perStock;
      result.push({ type:'product', product_no:i.product_no, item_name:i.item_name, qty:i.qty, unit:i.unit, cost:costPerSvcUnit });
    } else {
      const { data:sc } = await sb.from('service_consumables').select('*').eq('id',i.consumable_id).maybeSingle();
      if(!sc || sc.is_active===false || (sc.stock_qty||0) < i.qty) { warnings.push(`${i.item_name}（庫存不足或已停用）`); continue; }
      result.push({ type:'consumable', consumable_id:i.consumable_id, item_name:i.item_name, qty:i.qty, unit:i.unit, cost:sc.cost||0 });
    }
  }
  return { items:result, warnings };
}
window.resolveSvcKitItems = resolveSvcKitItems;