// ═══════════════════════════════════════
// categories.js
// ═══════════════════════════════════════

async function loadCats() {
  const { data } = await sb.from('products').select('category').not('category','is',null);
  window._cats = [...new Set((data||[]).map(x=>x.category).filter(Boolean))].sort();
  return window._cats;
}
async function categories() {
  const cats = await loadCats();
  $('main').innerHTML = `
  <div class="ph"><div><div class="pt">類別管理</div><div class="ps">${cats.length} 個類別</div></div>
    <div class="ha"><button class="btn btn-p btn-s" onclick="addCategoryModal()">＋ 新增類別</button></div></div>
  <div class="pc">
    <div class="al al-w" style="font-size:12px">
      管理商品類別。類別名稱修改後，現有商品的類別不會自動更新，請至商品列表手動更新。
    </div>
    <div class="tc"><div class="tb"><span class="tt">類別列表</span></div>
    <div class="tw"><table style="width:100%">
      <tr><th>類別名稱</th><th>商品數量</th><th>操作</th></tr>
      ${cats.map(c => {
        const cnt = 0; // 可以另外查
        return `<tr>
          <td style="font-weight:500;font-size:14px">${c}</td>
          <td><span class="badge bg" style="font-size:11px">${c}</span></td>
          <td><div style="display:flex;gap:4px">
            <button class="btn btn-s" onclick="renameCategoryModal('${c.replace(/'/g,"\\'")}')">改名</button>
          </div></td>
        </tr>`;
      }).join('')}
    </table></div></div>
  </div>`;
  
  // 補上各類別商品數量
  const { data: cnts } = await sb.from('products').select('category').eq('is_active',true);
  const catCount = {};
  (cnts||[]).forEach(x => { if(x.category) catCount[x.category] = (catCount[x.category]||0)+1; });
  
  // 重新渲染（含數量）
  $('main').innerHTML = `
  <div class="ph"><div><div class="pt">類別管理</div><div class="ps">${cats.length} 個類別</div></div>
    <div class="ha"><button class="btn btn-p btn-s" onclick="addCategoryModal()">＋ 新增類別</button></div></div>
  <div class="pc">
    <div class="al al-w" style="font-size:12px">管理商品類別。新增類別後，在編輯商品時可從下拉選單選擇。</div>
    <div class="tc"><div class="tb"><span class="tt">類別列表</span></div>
    <div class="tw"><table style="width:100%">
      <tr><th>類別名稱</th><th>使用中商品</th><th>操作</th></tr>
      ${cats.map(c => `<tr>
        <td style="font-weight:500;font-size:15px">${c}</td>
        <td style="text-align:center"><span class="badge bg">${catCount[c]||0} 項</span></td>
        <td><button class="btn btn-s" onclick="renameCategoryModal('${c.replace(/'/g,"\\'")}')">改名</button></td>
      </tr>`).join('')}
    </table></div></div>
  </div>`;
}
function addCategoryModal() {
  OM('新增類別',
    fi('newcat','類別名稱 *'),
    `<button class="btn" onclick="CM()">取消</button>
     <button class="btn btn-p" onclick="saveNewCategory()">新增</button>`);
}
async function saveNewCategory() {
  const nm = v('newcat').trim();
  if(!nm) { toast('請輸入類別名稱','e'); return; }
  if(window._cats.includes(nm)) { toast('此類別已存在','w'); return; }
  // 類別不需要獨立表，直接新增一個暫時商品再更新不對
  // 改為：存到 settings 表的 custom_categories
  let existing = [];
  try {
    const { data: s } = await sb.from('settings').select('value').eq('key','custom_categories').single();
    if(s?.value) existing = JSON.parse(s.value);
  } catch(e){}
  if(!existing.includes(nm)) {
    existing.push(nm);
    await sb.from('settings').upsert({key:'custom_categories', value:JSON.stringify(existing), updated_at:new Date().toISOString()});
  }
  window._cats = [...new Set([...window._cats, nm])].sort();
  toast('類別已新增：'+nm);
  CM();
  categories();
}
async function renameCategoryModal(oldName) {
  OM(`改名類別：${oldName}`,
    fi('rencat','新類別名稱 *','text',oldName),
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
  window._cats = window._cats.map(c => c===oldName?newName:c).sort();
  CM();
  categories();
}
window.categories = categories;
window.addCategoryModal = addCategoryModal;
window.saveNewCategory = saveNewCategory;
window.renameCategoryModal = renameCategoryModal;
window.renameCategory = renameCategory;
