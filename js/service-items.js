// ══════════════════════════════
// service-items.js — 服務項目 + 技師管理
// ══════════════════════════════

// ── 服務項目管理 ──
async function svcItems() {
  try {
  const { data, error } = await sb.from('service_items')
    .select('*').order('category').order('sort_order').order('name');
  if(error) throw error;

  const cats = [...new Set((data||[]).map(i=>i.category).filter(Boolean))].sort();
  window._svcItemCats = cats;

  let catOrd = {};
  try{ const{data:co}=await sb.from('settings').select('value').eq('key','svc_item_cat_order').single(); if(co?.value) catOrd=JSON.parse(co.value); }catch(e){}
  window._svcCatOrd = catOrd;

  const hideInactive = window._svcHideInactive!==false; // 預設隱藏
  const shownData = hideInactive ? (data||[]).filter(s=>s.is_active!==false) : (data||[]);
  const inactiveCount = (data||[]).filter(s=>s.is_active===false).length;

  const groups = {};
  shownData.forEach(s=>{ const c=s.category||'未分類'; (groups[c]=groups[c]||[]).push(s); });
  const groupNames = Object.keys(groups).sort((a,b)=>(catOrd[a]||99)-(catOrd[b]||99) || a.localeCompare(b));

  const rowsHtml = s => `<tr style="${s.is_active===false?'opacity:.5':''}">
      <td style="font-weight:500">${s.name}</td>
      <td class="num">${fM(s.default_price)}</td>
      <td>${s.unit||'次'}</td>
      <td style="text-align:center">${s.sort_order}</td>
      <td><span class="badge ${s.is_active!==false?'bg':'br2'}">${s.is_active!==false?'啟用':'停用'}</span></td>
      <td style="white-space:nowrap">
        <button class="btn btn-s" onclick="svcEditItemModal(${s.id})">編輯</button>
        <button class="btn btn-s" onclick="toggleServiceItem(${s.id},${s.is_active!==false})">${s.is_active!==false?'停用':'啟用'}</button>
        <button class="btn btn-s btn-r" onclick="deleteServiceItem(${s.id},'${(s.name||'').replace(/'/g,"\\'")}')">刪除</button>
      </td>
    </tr>`;

  $('svc-content').innerHTML = `
  <div style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;gap:8px">
    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;color:var(--tx3)">
      <input type="checkbox" ${hideInactive?'checked':''} onchange="window._svcHideInactive=this.checked;svcItems()">
      隱藏已停用${inactiveCount>0?`（${inactiveCount}項）`:''}
    </label>
    <div style="display:flex;gap:8px">
      ${groupNames.length>1?'<button class="btn btn-s" onclick="showSvcCatOrder()">⚙ 分類排序</button>':''}
      <button class="btn btn-p btn-s" onclick="svcNewItemModal()">＋ 新增服務項目</button>
    </div>
  </div>
  ${(data||[]).length===0 ? '<div class="tc"><div style="padding:20px;text-align:center;color:var(--tx3)">尚無服務項目，請先新增</div></div>' :
    shownData.length===0 ? `<div class="tc"><div style="padding:20px;text-align:center;color:var(--tx3)">全部都是已停用的項目，取消勾選「隱藏已停用」即可看到</div></div>` :
    groupNames.map(cat=>`
    <div class="tc" style="margin-bottom:14px">
      <div class="tb"><span class="tt">${cat}</span><span class="badge bg" style="font-size:11px;margin-left:8px">${groups[cat].length} 項</span></div>
      <div class="tw"><table style="width:100%">
        <tr><th>名稱</th><th>預設單價</th><th>單位</th><th style="text-align:center">排序</th><th>狀態</th><th>操作</th></tr>
        ${groups[cat].map(rowsHtml).join('')}
      </table></div>
    </div>`).join('')
  }`;
  }catch(e){$('svc-content').innerHTML=`<div class="ld" style="color:var(--rd)">載入失敗：${e.message}</div>`;}
}

// ── 分類排序設定 ──
function showSvcCatOrder() {
  const cats = window._svcItemCats || [];
  const ord = window._svcCatOrd || {};
  const displayCats = [...new Set(cats.concat(Object.keys(ord)))];
  const list = displayCats.length ? displayCats : cats;
  const sorted = list.slice().sort((a,b)=>(ord[a]||99)-(ord[b]||99) || a.localeCompare(b));
  const rows = sorted.map(c=>`
    <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--bd)">
      <input type="number" id="scord-${c}" value="${ord[c]||99}" min="1" max="99"
        style="width:46px;padding:4px;border:1px solid var(--bd);border-radius:var(--r);font-size:12px;text-align:center">
      <span style="font-weight:500;flex:1">${c}</span>
    </div>`).join('');
  OM('服務項目分類排序', `
  <div style="font-size:12px;color:var(--tx3);margin-bottom:12px">數字設排序（1=最前），數字愈小愈前面，可以重複時就照名稱排。</div>
  ${rows}`,
  `<button class="btn" onclick="CM()">取消</button>
   <button class="btn btn-p" onclick="saveSvcCatOrder()">儲存</button>`);
}
window.showSvcCatOrder = showSvcCatOrder;
async function saveSvcCatOrder() {
  const cats = window._svcItemCats || [];
  const newOrd = {};
  cats.forEach(c=>{ const el=document.getElementById('scord-'+c); if(el) newOrd[c]=parseInt(el.value)||99; });
  await sb.from('settings').upsert({key:'svc_item_cat_order', value:JSON.stringify(newOrd), updated_at:new Date().toISOString()});
  toast('✅ 排序已儲存');
  CM();
  svcItems();
}
window.saveSvcCatOrder = saveSvcCatOrder;

window.svcItems = svcItems;
function svcItemCatSelect(currentVal) {
  const cats = window._svcItemCats||[];
  const opts = [...new Set([...cats, currentVal||''].filter(Boolean))].sort();
  return `<div class="fl"><label>分類</label>
    <select id="f-si-cat" onchange="svcCatChange(this)"
      style="width:100%;padding:7px 8px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;background:var(--sf);outline:none">
      ${opts.map(c=>`<option value="${c}" ${c===currentVal?'selected':''}>${c}</option>`).join('')}
      ${!currentVal?'<option value="其他" selected>其他</option>':''}
      <option value="__new__">＋ 新增分類…</option>
    </select></div>`;
}

function svcItemUnitSelect(currentVal) {
  const base = ['次','小時','堂','分鐘'];
  const opts = [...new Set([...base, currentVal||'次'])];
  return `<div class="fl"><label>單位</label>
    <select id="f-si-unit" onchange="svcUnitChange(this)"
      style="width:100%;padding:7px 8px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;background:var(--sf);outline:none">
      ${opts.map(u=>`<option value="${u}" ${u===(currentVal||'次')?'selected':''}>${u}</option>`).join('')}
      <option value="__new__">＋ 自訂單位…</option>
    </select></div>`;
}

function svcNewItemModal() {
  OM('新增服務項目', `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
      ${fi('si-name','項目名稱 *')}
      ${svcItemCatSelect('')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px">
      ${fi('si-price','預設單價','number','0')}
      ${svcItemUnitSelect('次')}
      ${fi('si-sort','排序','number','99')}
    </div>
    ${fi('si-desc','說明（選填）')}`,
    `<button class="btn" onclick="CM()">取消</button>
     <button class="btn btn-p" onclick="saveServiceItem()">新增</button>`);
}

window.svcNewItemModal = svcNewItemModal;
async function svcEditItemModal(id) {
  const { data:s } = await sb.from('service_items').select('*').eq('id',id).single();
  if(!s){ toast('找不到服務項目','e'); return; }
  OM(`編輯服務項目：${s.name}`, `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
      ${fi('si-name','項目名稱 *','text',s.name)}
      ${svcItemCatSelect(s.category)}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px">
      ${fi('si-price','預設單價','number',s.default_price)}
      ${svcItemUnitSelect(s.unit)}
      ${fi('si-sort','排序','number',s.sort_order)}
    </div>
    ${fi('si-desc','說明（選填）','text',s.description)}`,
    `<button class="btn" onclick="CM()">取消</button>
     <button class="btn btn-p" onclick="saveServiceItem(${id})">儲存</button>`);
}

window.svcEditItemModal = svcEditItemModal;
async function saveServiceItem(id) {
  const name = v('si-name')?.trim();
  if(!name){ toast('請輸入項目名稱','e'); return; }
  const payload = {
    name,
    category: document.getElementById('f-si-cat')?.value || '其他',
    unit: document.getElementById('f-si-unit')?.value || '次',
    default_price: parseFloat(v('si-price'))||0,
    sort_order: parseInt(v('si-sort'))||99,
    description: v('si-desc')||null
  };
  if(id) {
    const { error } = await sb.from('service_items').update(payload).eq('id',id);
    if(error){ toast('更新失敗：'+error.message,'e'); return; }
  } else {
    const { error } = await sb.from('service_items').insert(payload);
    if(error){ toast('新增失敗：'+error.message,'e'); return; }
  }
  await logAction(id?'update':'create','service_items',String(id||name),`${id?'更新':'新增'}服務項目 ${name}`,null,null);
  toast('✅ 已儲存');
  CM();
  svcItems();
}

window.saveServiceItem = saveServiceItem;
async function toggleServiceItem(id, current) {
  await sb.from('service_items').update({is_active:!current}).eq('id',id);
  toast(current?'已停用':'已啟用');
  svcItems();
}

window.toggleServiceItem = toggleServiceItem;
async function deleteServiceItem(id, name) {
  if(!confirm(`確定刪除服務項目「${name}」？`)) return;
  await sb.from('service_items').delete().eq('id',id);
  toast('已刪除');
  svcItems();
}

window.deleteServiceItem = deleteServiceItem;

// ── 技師管理 ──
async function svcTechnicians() {
  try {
  const [{ data:techs, error:e1 },{ data:roles, error:e2 }] = await Promise.all([
    sb.from('technicians').select('*').order('is_active',{ascending:false}).order('name'),
    sb.from('service_roles').select('*').eq('is_active',true).order('sort_order').order('name'),
  ]);
  if(e1) throw e1;
  if(e2) throw e2;
  window._svcRoles = roles||[];

  $('svc-content').innerHTML = `
  <div style="margin-bottom:12px;display:flex;justify-content:flex-end">
    <button class="btn btn-p btn-s" onclick="svcNewTechModal()">＋ 新增技師</button>
  </div>
  <div class="tc"><div class="tb"><span class="tt">技師列表</span></div>
  <div class="tw"><table style="width:100%">
    <tr><th>姓名</th><th>職位</th><th>電話</th><th style="text-align:center">抽成方式</th><th>狀態</th><th>操作</th></tr>
    ${(techs||[]).map(t=>`<tr style="${t.is_active===false?'opacity:.5':''}">
      <td style="font-weight:500">${t.name}</td>
      <td><span class="badge bg" style="font-size:11px">${t.role||'技師'}</span></td>
      <td>${t.phone||'—'}</td>
      <td style="text-align:center">${t.commission_mode==='fixed'?`固定 ${fM(t.commission_fixed_amount||0)}/次`:`${Math.round((t.commission_rate||0)*100)}%`}</td>
      <td><span class="badge ${t.is_active!==false?'bg':'br2'}">${t.is_active!==false?'啟用':'停用'}</span></td>
      <td style="white-space:nowrap">
        <button class="btn btn-s" onclick="svcEditTechModal(${t.id})">編輯</button>
        <button class="btn btn-s" onclick="toggleTechnician(${t.id},${t.is_active!==false})">${t.is_active!==false?'停用':'啟用'}</button>
        <button class="btn btn-s btn-r" onclick="deleteTechnician(${t.id},'${(t.name||'').replace(/'/g,"\\'")}')">刪除</button>
      </td>
    </tr>`).join('')||'<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--tx3)">尚無技師，請先新增</td></tr>'}
  </table></div></div>`;
  }catch(e){$('svc-content').innerHTML=`<div class="ld" style="color:var(--rd)">載入失敗：${e.message}</div>`;}
}

window.svcTechnicians = svcTechnicians;
function svcTechRoleSelect(currentVal) {
  const roles = window._svcRoles||[];
  return `<div class="fl"><label>職位</label>
    <select id="f-tech-role" onchange="svcRoleChange(this)"
      style="width:100%;padding:7px 8px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;background:var(--sf);outline:none">
      ${roles.map(r=>`<option value="${r.name}" ${r.name===currentVal?'selected':''}>${r.name}</option>`).join('')}
      ${currentVal && !roles.some(r=>r.name===currentVal)?`<option value="${currentVal}" selected>${currentVal}</option>`:''}
      <option value="__new__">＋ 新增職位…</option>
    </select></div>`;
}

function svcTechCommissionFields(mode, rate, fixedAmt) {
  return `
    <div class="fl"><label>抽成方式</label><select id="f-tech-mode" onchange="svcTechModeChange(this.value)">
      <option value="percentage" ${mode!=='fixed'?'selected':''}>比例（%）</option>
      <option value="fixed" ${mode==='fixed'?'selected':''}>固定金額（每次服務）</option>
    </select></div>
    <div id="tech-rate-field" style="${mode==='fixed'?'display:none':''}">${fi('tech-rate','抽成比例（%）','number',Math.round((rate||0)*100))}</div>
    <div id="tech-fixed-field" style="${mode==='fixed'?'':'display:none'}">${fi('tech-fixed','固定金額（元/次）','number',fixedAmt||0)}</div>
  `;
}
window.svcTechModeChange = mode => {
  const rf = $('tech-rate-field'), ff = $('tech-fixed-field');
  if(rf) rf.style.display = mode==='fixed' ? 'none' : '';
  if(ff) ff.style.display = mode==='fixed' ? '' : 'none';
};

function svcNewTechModal() {
  OM('新增技師', `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
      ${fi('tech-name','姓名 *')}
      ${svcTechRoleSelect('技師')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
      ${fi('tech-phone','電話（選填）')}
      ${svcTechCommissionFields('percentage', 50, 0)}
    </div>`,
    `<button class="btn" onclick="CM()">取消</button>
     <button class="btn btn-p" onclick="saveTechnician()">新增</button>`);
}

window.svcNewTechModal = svcNewTechModal;
async function svcEditTechModal(id) {
  const { data:t } = await sb.from('technicians').select('*').eq('id',id).single();
  if(!t){ toast('找不到技師','e'); return; }
  if(!window._svcRoles) {
    const { data:roles } = await sb.from('service_roles').select('*').eq('is_active',true).order('sort_order').order('name');
    window._svcRoles = roles||[];
  }
  OM(`編輯技師：${t.name}`, `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
      ${fi('tech-name','姓名 *','text',t.name)}
      ${svcTechRoleSelect(t.role)}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
      ${fi('tech-phone','電話（選填）','text',t.phone)}
      ${svcTechCommissionFields(t.commission_mode, t.commission_rate, t.commission_fixed_amount)}
    </div>`,
    `<button class="btn" onclick="CM()">取消</button>
     <button class="btn btn-p" onclick="saveTechnician(${id})">儲存</button>`);
}

window.svcEditTechModal = svcEditTechModal;
async function saveTechnician(id) {
  const name = v('tech-name')?.trim();
  if(!name){ toast('請輸入姓名','e'); return; }
  const mode = v('tech-mode') || 'percentage';
  const payload = {
    name,
    role: document.getElementById('f-tech-role')?.value || '技師',
    phone: v('tech-phone')||null,
    commission_mode: mode,
    commission_rate: mode==='fixed' ? 0 : (parseFloat(v('tech-rate'))||0)/100,
    commission_fixed_amount: mode==='fixed' ? (parseFloat(v('tech-fixed'))||0) : 0
  };
  if(id) {
    const { error } = await sb.from('technicians').update(payload).eq('id',id);
    if(error){ toast('更新失敗：'+error.message,'e'); return; }
  } else {
    const { error } = await sb.from('technicians').insert(payload);
    if(error){ toast('新增失敗：'+error.message,'e'); return; }
  }
  await logAction(id?'update':'create','technicians',String(id||name),`${id?'更新':'新增'}技師 ${name}`,null,null);
  toast('✅ 已儲存');
  CM();
  svcTechnicians();
}

window.saveTechnician = saveTechnician;
async function toggleTechnician(id, current) {
  await sb.from('technicians').update({is_active:!current}).eq('id',id);
  toast(current?'已停用':'已啟用');
  svcTechnicians();
}

window.toggleTechnician = toggleTechnician;
async function deleteTechnician(id, name) {
  if(!confirm(`確定刪除技師「${name}」？`)) return;
  await sb.from('technicians').delete().eq('id',id);
  toast('已刪除');
  svcTechnicians();
}

window.deleteTechnician = deleteTechnician;