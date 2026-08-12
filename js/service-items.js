// ═══════════════════════════════════════
// categories.js — 商品類別 + 服務職位管理
// ═══════════════════════════════════════

async function loadCats() {
  const { data } = await sb.from('products').select('category').not('category','is',null);
  window._cats = [...new Set((data||[]).map(x=>x.category).filter(Boolean))].sort();
  return window._cats;
}

var _catTab = 'products';

async function categories() {
  const tab = window._catTab || 'products';
  // 先設 ph + tabs
  $('main').innerHTML = `
  <div class="ph">
    <div><div class="pt">類別管理</div></div>
    <div class="ha">
      ${tab==='products'
        ? `<button class="btn btn-p btn-s" onclick="addCategoryModal()">＋ 新增類別</button>`
        : `<button class="btn btn-p btn-s" onclick="addRoleModal()">＋ 新增職位</button>`
      }
    </div>
  </div>
  <div class="tab-bar" style="padding:0 16px 10px">
    <div class="tab${tab==='products'?' on':''}" onclick="window._catTab='products';categories()">商品類別</div>
    <div class="tab${tab==='roles'?' on':''}" onclick="window._catTab='roles';categories()">服務職位</div>
  </div>
  <div class="pc" id="cat-content"><div class="ld"><div class="sp"></div>載入中…</div></div>`;

  if(tab==='roles') { await categoriesRoles(); return; }
  await categoriesProducts();
}

async function categoriesProducts() {
  // 抓類別和商品數量
  const [cats, { data:cnts }] = await Promise.all([
    loadCats(),
    sb.from('products').select('category').eq('is_active',true)
  ]);
  const catCount = {};
  (cnts||[]).forEach(x => { if(x.category) catCount[x.category] = (catCount[x.category]||0)+1; });

  document.getElementById('cat-content').innerHTML = `
  <div class="al al-w" style="font-size:12px;margin-bottom:12px">
    管理商品類別。名稱修改後，現有商品類別不會自動更新，請至商品列表手動更新。
  </div>
  <div class="tc"><div class="tb"><span class="tt">類別列表</span></div>
  <div class="tw"><table style="width:100%">
    <tr><th>類別名稱</th><th>使用中商品</th><th>操作</th></tr>
    ${cats.map(c=>`<tr>
      <td style="font-weight:500;font-size:14px">${c}</td>
      <td style="text-align:center"><span class="badge bg">${catCount[c]||0} 項</span></td>
      <td><button class="btn btn-s" onclick="renameCategoryModal('${c.replace(/'/g,"\\'")}')">改名</button></td>
    </tr>`).join('')||'<tr><td colspan="3" style="text-align:center;padding:20px;color:var(--tx3)">尚無類別</td></tr>'}
  </table></div></div>`;
}

async function categoriesRoles() {
  const { data } = await sb.from('service_roles').select('*').order('sort_order').order('name');
  document.getElementById('cat-content').innerHTML = `
  <div class="al al-w" style="font-size:12px;margin-bottom:12px">
    管理服務職位。職位用於技師管理的職位選單，可新增/編輯/停用/刪除。
  </div>
  <div class="tc"><div class="tb"><span class="tt">職位列表</span></div>
  <div class="tw"><table style="width:100%">
    <tr><th>職位名稱</th><th>排序</th><th>狀態</th><th>操作</th></tr>
    ${(data||[]).map(r=>`<tr>
      <td style="font-weight:500">${r.name}</td>
      <td style="text-align:center">${r.sort_order}</td>
      <td><span class="badge ${r.is_active?'bg':'br2'}">${r.is_active?'啟用':'停用'}</span></td>
      <td><div style="display:flex;gap:4px">
        <button class="btn btn-s" onclick="editRoleModal(${r.id},'${r.name.replace(/'/g,"\\'")}',${r.sort_order},${r.is_active})">編輯</button>
        <button class="btn btn-s" onclick="toggleRole(${r.id},${r.is_active})">${r.is_active?'停用':'啟用'}</button>
        <button class="btn btn-s btn-r" onclick="deleteRole(${r.id},'${r.name.replace(/'/g,"\\'")}')">刪除</button>
      </div></td>
    </tr>`).join('')||'<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--tx3)">尚無職位</td></tr>'}
  </table></div></div>`;
}

// ── 商品類別 CRUD ──
function addCategoryModal() {
  OM('新增類別', fi('newcat','類別名稱 *'),
    `<button class="btn" onclick="CM()">取消</button>
     <button class="btn btn-p" onclick="saveNewCategory()">新增</button>`);
}

async function saveNewCategory() {
  const nm = v('newcat').trim();
  if(!nm) { toast('請輸入類別名稱','e'); return; }
  if((window._cats||[]).includes(nm)) { toast('此類別已存在','w'); return; }
  let existing = [];
  try {
    const { data:s } = await sb.from('settings').select('value').eq('key','custom_categories').single();
    if(s?.value) existing = JSON.parse(s.value);
  } catch(e){}
  if(!existing.includes(nm)) {
    existing.push(nm);
    await sb.from('settings').upsert({key:'custom_categories', value:JSON.stringify(existing), updated_at:new Date().toISOString()});
  }
  window._cats = [...new Set([...(window._cats||[]), nm])].sort();
  toast('類別已新增：'+nm); CM(); categories();
}

async function renameCategoryModal(oldName) {
  OM(`改名類別：${oldName}`, fi('rencat','新類別名稱 *','text',oldName),
    `<button class="btn" onclick="CM()">取消</button>
     <button class="btn btn-p" onclick="renameCategory('${oldName.replace(/'/g,"\\'")}')">確認改名</button>`);
}

async function renameCategory(oldName) {
  const newName = v('rencat').trim();
  if(!newName || newName===oldName) { CM(); return; }
  if(!confirm(`確定把「${oldName}」改名為「${newName}」？\n這會批次更新所有使用此類別的商品。`)) return;
  const { error } = await sb.from('products').update({category:newName}).eq('category',oldName);
  if(error) { toast('更新失敗：'+error.message,'e'); return; }
  toast(`已更新「${oldName}」→「${newName}」`);
  window._cats = (window._cats||[]).map(c => c===oldName?newName:c).sort();
  CM(); categories();
}

// ── 服務職位 CRUD ──
function addRoleModal() {
  OM('新增服務職位',
    `${fi('role-name','職位名稱 *')}${fi('role-sort','排序','number','99')}`,
    `<button class="btn" onclick="CM()">取消</button>
     <button class="btn btn-p" onclick="saveRole()">新增</button>`);
}

function editRoleModal(id, name, sort, active) {
  OM(`編輯職位：${name}`,
    `${fi('role-name','職位名稱 *','text',name)}${fi('role-sort','排序','number',sort)}
     <div style="margin-top:10px">
       <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
         <input type="checkbox" id="role-active" ${active?'checked':''} style="width:14px;height:14px">
         <span>啟用此職位</span>
       </label>
     </div>`,
    `<button class="btn" onclick="CM()">取消</button>
     <button class="btn btn-p" onclick="saveRole(${id})">儲存</button>`);
}

async function saveRole(id) {
  const name = v('role-name')?.trim();
  if(!name) { toast('請輸入職位名稱','e'); return; }
  const payload = {
    name, sort_order:parseInt(v('role-sort'))||99,
    is_active: id ? (document.getElementById('role-active')?.checked??true) : true
  };
  if(id) await sb.from('service_roles').update(payload).eq('id',id);
  else {
    const { error } = await sb.from('service_roles').insert(payload);
    if(error) { toast('新增失敗：'+error.message,'e'); return; }
  }
  window._svcRoles = null;
  toast('✅ 已儲存'); CM(); categories();
}

async function toggleRole(id, current) {
  await sb.from('service_roles').update({is_active:!current}).eq('id',id);
  window._svcRoles = null;
  categories();
}

async function deleteRole(id, name) {
  if(!confirm(`確定刪除職位「${name}」？`)) return;
  await sb.from('service_roles').delete().eq('id',id);
  window._svcRoles = null;
  toast('已刪除'); categories();
}

window.categories = categories;
window.categoriesRoles = categoriesRoles;
window.addCategoryModal = addCategoryModal;
window.saveNewCategory = saveNewCategory;
window.renameCategoryModal = renameCategoryModal;
window.renameCategory = renameCategory;
window.addRoleModal = addRoleModal;
window.editRoleModal = editRoleModal;
window.saveRole = saveRole;
window.toggleRole = toggleRole;
window.deleteRole = deleteRole;
window.loadCats = loadCats;
window.makeCatSelect = (currentVal) => {
  const cats = window._cats || [];
  const opts = [...new Set([...cats, currentVal||''].filter(Boolean))].sort();
  return `<div class="fl"><label>類別</label><select id="f-cat"
    style="width:100%;padding:7px 8px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;background:var(--sf);outline:none"
    onchange="if(this.value==='__new__'){const nc=prompt('請輸入新類別名稱：');if(nc){window._cats=[...new Set([...(window._cats||[]),nc])].sort();}return nc||null;}">
    <option value="">— 選擇類別 —</option>
    ${opts.map(c=>`<option value="${c}" ${c===currentVal?'selected':''}>${c}</option>`).join('')}
    <option value="__new__">＋ 新增類別…</option>
  </select></div>`;
};