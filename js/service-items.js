// ══════════════════════════════
// service-items.js
// ══════════════════════════════

async function svcItems() {
  const { data } = await sb.from('service_items').select('*').order('sort_order').order('name');
  const cats = ['全部', ...new Set((data||[]).map(s=>s.category).filter(Boolean))];
  const filtered = _svcItemCat === '全部' ? (data||[]) : (data||[]).filter(s=>s.category===_svcItemCat);

  $('svc-content').innerHTML = `
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
    <div class="tab-bar" style="flex:1;overflow-x:auto">
      ${cats.map(c=>`<div class="tab${_svcItemCat===c?' on':''}" onclick="_svcItemCat='${c}';svcItems()" style="white-space:nowrap">${c}</div>`).join('')}
    </div>
    <button class="btn btn-p btn-s" style="flex-shrink:0;margin-left:8px" onclick="addSvcItem()">＋ 新增</button>
  </div>
  <div class="tc"><div class="tw"><table style="width:100%">
    <tr><th>服務名稱</th><th>分類</th><th>說明</th><th>預設價格</th><th>單位</th><th>狀態</th><th>操作</th></tr>
    ${filtered.map(s=>`<tr>
      <td style="font-weight:500">${s.name}</td>
      <td><span class="badge bg" style="font-size:10px">${s.category||'—'}</span></td>
      <td style="font-size:12px;color:var(--tx3)">${s.description||'—'}</td>
      <td class="num">${fM(s.default_price)}</td>
      <td>${s.unit||'次'}</td>
      <td><span class="badge ${s.is_active?'bg':'br2'}">${s.is_active?'使用中':'停用'}</span></td>
      <td><button class="btn btn-s" onclick="editSvcItem(${s.id})">編輯</button></td>
    </tr>`).join('')||'<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--tx3)">尚無項目</td></tr>'}
  </table></div></div>`;
}

window.svcItems        = svcItems;
async function addSvcItem() {
  OM('新增服務項目',`
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
    ${fi('si-name','服務名稱 *')}
    <div class='fl'><label>單位</label><select id='f-si-unit' onchange='svcUnitChange(this)' style='width:100%;padding:7px 8px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;background:var(--sf)'>
  <option value="次">次</option>
  <option value="小時">小時（按時計費，步進0.5）</option>
  <option value="30分">30分（按30分計費）</option>
  <option value="療程">療程</option>
  <option value="片">片</option>
  <option value="ml">ml</option>
  <option value="__new__">＋ 自訂單位…</option>
</select></div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
    ${fi('si-price','預設價格','number','0')}
    ${fi('si-sort','排序','number','99')}
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
    <div class='fl'><label>分類</label><select id='si-cat' onchange='svcCatChange(this)' style='width:100%;padding:7px 8px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;background:var(--sf)'><option value="身體療程">身體療程</option>
<option value="臉部療程">臉部療程</option>
<option value="精華液導入">精華液導入</option>
<option value="極緻幼態喚醒">極緻幼態喚醒</option>
<option value="活化加固">活化加固</option>
<option value="其他項目">其他項目</option><option value="__new__">＋ 新增分類…</option></select></div>
    ${fi('si-desc','說明（選填）')}
  </div>`,
  `<button class="btn" onclick="CM()">取消</button>
   <button class="btn btn-p" onclick="saveSvcItem()">儲存</button>`);
}

window.addSvcItem      = addSvcItem;
async function editSvcItem(id) {
  const { data:s } = await sb.from('service_items').select('*').eq('id',id).single();
  if(!s) return;
  const catOpts = ['身體療程','臉部療程','精華液導入','極緻幼態喚醒','活化加固','其他項目']
    .map(c=>`<option value="${c}" ${(s.category||'其他項目')===c?'selected':''}>${c}</option>`).join('');
  OM('編輯服務項目',`
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
    ${fi('si-name','服務名稱 *','text',s.name)}
    <div class="fl"><label>單位</label><select id="f-si-unit" onchange="svcUnitChange(this)" style="width:100%;padding:7px 8px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;background:var(--sf)">
  <option value="次" ${(s.unit||'次')==='次'?'selected':''}>次</option>
  <option value="小時" ${(s.unit||'次')==='小時'?'selected':''}>小時（按時計費，步進0.5）</option>
  <option value="30分" ${(s.unit||'次')==='30分'?'selected':''}>30分（按30分計費）</option>
  <option value="療程" ${(s.unit||'次')==='療程'?'selected':''}>療程</option>
  <option value="片" ${(s.unit||'次')==='片'?'selected':''}>片</option>
  <option value="ml" ${(s.unit||'次')==='ml'?'selected':''}>ml</option>
  ${!['次','小時','30分','療程','片','ml'].includes(s.unit||'次')?`<option value="${s.unit}" selected>${s.unit}</option>`:''}
  <option value="__new__">＋ 自訂單位…</option>
</select></div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
    ${fi('si-price','預設價格','number',s.default_price||0)}
    ${fi('si-sort','排序','number',s.sort_order||99)}
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
    <div class="fl"><label>分類</label>
      <select id="si-cat" onchange="svcCatChange(this)" style="width:100%;padding:7px 8px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;background:var(--sf)">
        ${catOpts}
        <option value="__new__">＋ 新增分類…</option>
      </select>
    </div>
    ${fi('si-desc','說明','text',s.description||'')}
  </div>
  <div style="margin-top:10px">
    <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
      <input type="checkbox" id="si-active" ${s.is_active?'checked':''} style="width:14px;height:14px">
      <span style="font-size:13px">啟用此服務項目</span>
    </label>
  </div>`,
  `<button class="btn" onclick="CM()">取消</button>
   <button class="btn btn-p" onclick="saveSvcItem(${id})">儲存</button>`);
}

window.editSvcItem     = editSvcItem;
async function saveSvcItem(id) {
  const name = v('si-name');
  if(!name){ toast('請輸入服務名稱','e'); return; }
  const catEl = document.getElementById('si-cat');
  const payload = {
    name, unit:(document.getElementById('f-si-unit')?.value||'次'),
    default_price:parseFloat(v('si-price'))||0,
    sort_order:parseInt(v('si-sort'))||99,
    description:v('si-desc')||null,
    category:catEl?.value||'其他項目',
    is_active:id ? (document.getElementById('si-active')?.checked??true) : true,
  };
  if(id) { await sb.from('service_items').update(payload).eq('id',id); }
  else { await sb.from('service_items').insert(payload); }
  toast('✅ 已儲存');
  CM();
  svcItems();
}

window.saveSvcItem     = saveSvcItem;
async function svcTechnicians() {
  const { data } = await sb.from('technicians').select('*').order('name');
  $('svc-content').innerHTML = `
  <div style="margin-bottom:12px;display:flex;justify-content:flex-end">
    <button class="btn btn-p btn-s" onclick="addTechnician()">＋ 新增技師</button>
  </div>
  <div class="tc"><div class="tb"><span class="tt">技師名單</span></div>
  <div class="tw"><table style="width:100%">
    <tr><th>姓名</th><th>職位</th><th>抽成比例</th><th>狀態</th><th>操作</th></tr>
    ${(data||[]).map(t=>`<tr>
      <td style="font-weight:500">${t.name}</td>
      <td style="color:var(--tx3)">${t.role||'技師'}</td>
      <td style="text-align:center">${Math.round(t.commission_rate*100)}%</td>
      <td><span class="badge ${t.is_active?'bg':'br2'}">${t.is_active?'在職':'離職'}</span></td>
      <td style="display:flex;gap:4px">
        <button class="btn btn-s" onclick="editTechnician(${t.id})">編輯</button>
        <button class="btn btn-s btn-r" onclick="deleteTechnician(${t.id},'${t.name}（${t.role||'技師'}）')">刪除</button>
      </td>
    </tr>`).join('')||'<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--tx3)">尚無技師</td></tr>'}
  </table></div></div>`;
}

window.svcTechnicians  = svcTechnicians;
function addTechnician() {
  OM('新增技師',`
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
    ${fi('tc-name','技師姓名 *')}
    <div class="fl"><label>職位</label>
      <select id="tc-role" onchange="svcRoleChange(this)" style="width:100%;padding:7px 8px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;background:var(--sf)">
        <option value="按摩師">按摩師</option>
        <option value="美容師">美容師</option>
        <option value="美容按摩師">美容按摩師</option>
        <option value="技師">技師</option>
        <option value="助理">助理</option>
        <option value="__new__">＋ 自訂職位…</option>
      </select>
    </div>
  </div>
  ${fi('tc-rate','抽成比例（%）*','number','50')}`,
  `<button class="btn" onclick="CM()">取消</button>
   <button class="btn btn-p" onclick="saveTechnician()">儲存</button>`);
}

window.addTechnician   = addTechnician;
async function editTechnician(id) {
  const { data:t } = await sb.from('technicians').select('*').eq('id',id).single();
  if(!t) return;
  OM(`編輯技師：${t.name}`,`
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
    ${fi('tc-name','技師姓名 *','text',t.name)}
    <div class="fl"><label>職位</label>
      <select id="tc-role" onchange="svcRoleChange(this)" style="width:100%;padding:7px 8px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;background:var(--sf)">
        <option value="按摩師" ${t.role==='按摩師'?'selected':''}>按摩師</option>
        <option value="美容師" ${t.role==='美容師'?'selected':''}>美容師</option>
        <option value="美容按摩師" ${t.role==='美容按摩師'?'selected':''}>美容按摩師</option>
        <option value="技師" ${(t.role||'技師')==='技師'?'selected':''}>技師</option>
        <option value="助理" ${t.role==='助理'?'selected':''}>助理</option>
        ${!['按摩師','美容師','美容按摩師','技師','助理'].includes(t.role||'')&&t.role?`<option value="${t.role}" selected>${t.role}</option>`:''}
        <option value="__new__">＋ 自訂職位…</option>
      </select>
    </div>
  </div>
  ${fi('tc-rate','抽成比例（%）','number',Math.round(t.commission_rate*100))}
  <div style="margin-top:10px">
  <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
    <input type="checkbox" id="tc-active" ${t.is_active?'checked':''} style="width:14px;height:14px">
    <span>在職中</span>
  </label></div>`,
  `<button class="btn" onclick="CM()">取消</button>
   <button class="btn btn-p" onclick="saveTechnician(${id})">儲存</button>`);
}

window.editTechnician  = editTechnician;
async function saveTechnician(id) {
  const name = v('tc-name');
  const rate = parseFloat(v('tc-rate'))/100;
  if(!name||isNaN(rate)){ toast('請填寫姓名和抽成比例','e'); return; }
  const role = document.getElementById('tc-role')?.value || '技師';
  const payload = { name, role, commission_rate:rate,
    is_active: id ? (document.getElementById('tc-active')?.checked??true) : true };
  if(id) await sb.from('technicians').update(payload).eq('id',id);
  else await sb.from('technicians').insert(payload);
  toast('✅ 已儲存');
  CM();
  svcTechnicians();
}

window.saveTechnician  = saveTechnician;
async function deleteTechnician(id, name) {
  if(!confirm(`確定刪除「${name}」？\n⚠ 已建立的服務記錄不受影響，但未來無法選擇此技師。`)) return;
  const { error } = await sb.from('technicians').delete().eq('id', id);
  if(error) { toast('刪除失敗：'+error.message,'e'); return; }
  toast('已刪除技師：'+name);
  svcTechnicians();
}

window.deleteTechnician = deleteTechnician;
