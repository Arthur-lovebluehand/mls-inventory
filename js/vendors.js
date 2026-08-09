// ═══════════════════════════════════════
// vendors.js
// ═══════════════════════════════════════

async function vendors(){
  const{data}=await sb.from('vendors').select('*').order('sort_order').order('name');
  $('main').innerHTML=`
  <div class="ph"><div><div class="pt">廠商管理</div><div class="ps">${data?.length||0} 家</div></div>
    <div class="ha"><button class="btn btn-p btn-s" onclick="addVend()">＋ 新增廠商</button></div></div>
  <div class="pc">
    
    <div class="tc">
    <div class="tb"><span class="tt">廠商列表</span></div>
    <div class="tw"><table style="width:100%">
      <tr><th>廠商編號</th><th>廠商名稱</th><th>聯絡人</th><th>電話</th><th>統一編號</th><th>付款方式</th><th>操作</th></tr>
      ${(data||[]).map(vd=>`<tr style="${vd.is_active===false?'opacity:.5':''}">
        <td style="text-align:center">
          <input type="number" value="${vd.sort_order||99}" min="1" max="999"
            style="width:50px;padding:3px 5px;border:1px solid var(--bd);border-radius:var(--r);font-size:12px;text-align:center;outline:none"
            onchange="setVendorSort('${vd.vendor_no}',this.value)" title="數字越小排越前面">
        </td>
        <td style="font-weight:500">${vd.name}${vd.is_active===false?'<span class="badge br2" style="margin-left:5px;font-size:10px">停用</span>':''}</td>
        <td>${vd.contact||'—'}</td>
        <td>${vd.phone||vd.mobile||'—'}</td>
        <td>${vd.tax_no||'—'}</td>
        <td>${vd.payment_method||'—'}</td>
        <td><span class="badge ${vd.is_active===false?'br2':'bg'}">${vd.is_active===false?'停用':'啟用'}</span></td>
        <td><div style="display:flex;gap:3px">
          <button class="btn btn-s" onclick="eVend('${vd.vendor_no}')">編輯</button>
          <button class="btn btn-s" style="color:${vd.is_active===false?'var(--ac)':'var(--am)'};border-color:currentColor"
            onclick="toggleVendor('${vd.vendor_no}',${vd.is_active!==false})">${vd.is_active===false?'啟用':'停用'}</button>
          <button class="btn btn-s btn-r" onclick="deleteVendor(${vd.id},'${vd.name.replace(/'/g,"\\'")}')">刪</button>
        </div></td>
      </tr>`).join('')}
    </table></div>
  </div></div></div>`;
}
function vendForm(vd){
  vd=vd||{};
  return `<div class="fg">
    ${fi('vno','廠商編號','text',vd.vendor_no)} ${fi('vname','廠商名稱 *','text',vd.name)}
    ${fi('vcont','聯絡窗口','text',vd.contact)} ${fi('vph','電話','text',vd.phone)}
    ${fi('vmob','手機','text',vd.mobile)} ${fi('veml','Email','text',vd.email)}
    ${fi('vtax','統一編號','text',vd.tax_no)} ${fi('vfax','傳真','text',vd.fax)}
    ${fi('vpay','付款方式','text',vd.payment_method)} ${fi('vterm','付款條件','text',vd.payment_terms)}
    ${fi('vbank','銀行名稱','text',vd.bank_name)} ${fi('vbacc','帳號','text',vd.bank_account)}
    ${fi('vbhld','戶名','text',vd.bank_holder)}
    <div class="fl fw">${fi('vaddr','地址','text',vd.full_address)}</div>
    <div class="fl fw">${fa('vnote','備註',vd.note)}</div>
  </div>`;
}
async function setVendorSort(vno,val){
  await sb.from('vendors').update({sort_order:parseInt(val)||99}).eq('vendor_no',vno);
  vendors(); // 刷新顯示
}
async function toggleVendor(vno,active){
  await sb.from('vendors').update({is_active:!active}).eq('vendor_no',vno);
  toast(!active?'廠商已啟用':'廠商已停用'); vendors();
}
async function deleteVendor(vno,name){
  if(!confirm(`確定刪除廠商「${name}」？`))return;
  const{error}=await sb.from('vendors').delete().eq('vendor_no',vno);
  if(error){toast('刪除失敗：'+error.message,'e');return;}
  toast('廠商已刪除'); vendors();
}
function addVend(){OM('新增廠商',vendForm(),`<button class="btn" onclick="CM()">取消</button><button class="btn btn-p" onclick="saveVend(false)">新增</button>`);}
async function eVend(no){const{data:vd}=await sb.from('vendors').select('*').eq('vendor_no',no).single();OM('編輯廠商',vendForm(vd),`<button class="btn" onclick="CM()">取消</button><button class="btn btn-p" onclick="saveVend('${no}')">儲存</button>`);}
async function showVend(no){
  const{data:vd}=await sb.from('vendors').select('*').eq('vendor_no',no).single();
  OM(`廠商：${vd?.name}`,`
  <div class="dg">
    <div class="dr"><span class="dlb">廠商編號</span><span class="dv">${vd?.vendor_no}</span></div>
    <div class="dr"><span class="dlb">聯絡人</span><span class="dv">${vd?.contact||'—'}</span></div>
    <div class="dr"><span class="dlb">電話</span><span class="dv">${vd?.phone||vd?.mobile||'—'}</span></div>
    <div class="dr"><span class="dlb">Email</span><span class="dv">${vd?.email||'—'}</span></div>
    <div class="dr"><span class="dlb">統一編號</span><span class="dv">${vd?.tax_no||'—'}</span></div>
    <div class="dr"><span class="dlb">付款方式</span><span class="dv">${vd?.payment_method||'—'}</span></div>
    <div class="dr"><span class="dlb">付款條件</span><span class="dv">${vd?.payment_terms||'—'}</span></div>
    <div class="dr"><span class="dlb">銀行帳號</span><span class="dv">${[vd?.bank_name,vd?.bank_account,vd?.bank_holder].filter(Boolean).join(' / ')||'—'}</span></div>
    <div class="dr" style="grid-column:1/-1"><span class="dlb">地址</span><span class="dv">${vd?.full_address||'—'}</span></div>
  </div>`);
}
async function saveVend(existingNo){
  const nm=v('vname');if(!nm){toast('請填寫廠商名稱','e');return;}
  const obj={name:nm,contact:v('vcont')||null,phone:v('vph')||null,mobile:v('vmob')||null,email:v('veml')||null,tax_no:v('vtax')||null,fax:v('vfax')||null,payment_method:v('vpay')||null,payment_terms:v('vterm')||null,bank_name:v('vbank')||null,bank_account:v('vbacc')||null,bank_holder:v('vbhld')||null,full_address:v('vaddr')||null,note:v('vnote')||null};
  if(existingNo){await sb.from('vendors').update(obj).eq('vendor_no',existingNo);}
  else{obj.vendor_no=v('vno')||null;await sb.from('vendors').insert(obj);}
  toast(existingNo?'廠商已更新':'廠商新增成功');CM();vendors();
}
async function brands() {
  const { data, count } = await sb.from('brands').select('*',{count:'exact'}).order('sort_order').order('name');
  $('main').innerHTML = `
  <div class="ph"><div><div class="pt">品牌商</div><div class="ps">${count||0} 個品牌</div></div>
    <div class="ha"><button class="btn btn-p btn-s" onclick="addBrand()">＋ 新增品牌</button></div></div>
  <div class="pc">
    <div class="al al-w" style="font-size:12px">記錄合作的品牌商（製造商/代理品牌），方便管理商品來源。</div>
    <div class="tc"><div class="tb"><span class="tt">品牌列表</span></div>
    <div class="tw"><table style="width:100%">
      <tr><th>排序</th><th>品牌名稱</th><th>類型</th><th>產地/來源</th><th>官網</th><th>備註</th><th>狀態</th><th>操作</th></tr>
      ${(data||[]).map(b=>`<tr style="${b.is_active===false?'opacity:.5':''}">
        <td style="text-align:center">
          <input type="number" value="${b.sort_order||99}" min="1" max="999"
            style="width:50px;padding:3px 5px;border:1px solid var(--bd);border-radius:var(--r);font-size:12px;text-align:center;outline:none"
            onchange="setBrandSort(${b.id},this.value)" title="數字越小排越前面">
        </td>
        <td style="font-weight:500">${b.name}${b.is_active===false?'<span class="badge br2" style="margin-left:5px;font-size:10px">停用</span>':''}</td>
        <td>${b.category||'—'}</td>
        <td>${b.origin||'—'}</td>
        <td>${b.website?`<a href="${b.website}" target="_blank" style="color:var(--ac);font-size:12px">${b.website.replace(/^https?:\/\//,'').split('/')[0]}</a>`:'—'}</td>
        <td style="font-size:12px;color:var(--tx2);max-width:150px">${b.note||'—'}</td>
        <td><span class="badge ${b.is_active===false?'br2':'bg'}">${b.is_active===false?'停用':'啟用'}</span></td>
        <td><div style="display:flex;gap:3px">
          <button class="btn btn-s" onclick="editBrand(${b.id})">編輯</button>
          <button class="btn btn-s" style="color:${b.is_active===false?'var(--ac)':'var(--am)'};border-color:currentColor"
            onclick="toggleBrand(${b.id},${b.is_active!==false})">${b.is_active===false?'啟用':'停用'}</button>
          <button class="btn btn-s btn-r" onclick="deleteBrand(${b.id},'${b.name.replace(/'/g,"\\'")}')" >刪</button>
        </div></td>
      </tr>`).join('')}
    </table></div></div>
  </div>`;
}
function brandForm(b) {
  b = b||{};
  return `<div class="fg">
    ${fi('bname','品牌名稱 *','text',b.name)}
    ${fs('bcategory','品牌類型',['保養品牌','保健品牌','美髮品牌','化妝品牌','輔消品牌','其他'],b.category||'保養品牌')}
    ${fi('borigin','產地/來源國','text',b.origin)}
    ${fi('bwebsite','官網','text',b.website)}
    <div class="fl fw">${fa('bnote2','備註',b.note)}</div>
  </div>`;
}
function addBrand() {
  OM('新增品牌商', brandForm(), `<button class="btn" onclick="CM()">取消</button><button class="btn btn-p" onclick="saveBrand(false)">新增</button>`);
}
async function editBrand(id) {
  const{data:b}=await sb.from('brands').select('*').eq('id',id).single();
  OM('編輯品牌商', brandForm(b), `<button class="btn" onclick="CM()">取消</button><button class="btn btn-p" onclick="saveBrand(${id})">儲存</button>`);
}
async function saveBrand(editId) {
  const nm=v('bname');
  if(!nm){toast('請填寫品牌名稱','e');return;}
  const obj={name:nm,category:v('bcategory'),origin:v('borigin')||null,website:v('bwebsite')||null,note:v('bnote2')||null,is_active:true};
  if(editId){await sb.from('brands').update(obj).eq('id',editId);}
  else{await sb.from('brands').insert(obj);}
  toast(editId?'品牌已更新':'品牌新增成功！');CM();brands();
}
async function setBrandSort(id,val){
  await sb.from('brands').update({sort_order:parseInt(val)||99}).eq('id',id);
  brands();
}
async function toggleBrand(id,active){
  await sb.from('brands').update({is_active:!active}).eq('id',id);
  toast(!active?'品牌已啟用':'品牌已停用');brands();
}
async function deleteBrand(id,name){
  if(!confirm(`確定刪除品牌「${name}」？`))return;
  await sb.from('brands').delete().eq('id',id);
  toast('品牌已刪除');brands();
}
window.brands=brands;
window.saveBrand=saveBrand;
window.toggleBrand=toggleBrand;
async function showPuVendorSettings() {
  const vendors = (window._puVendors||[]).filter(v=>v!=='全部');
  let ord = {};
  try {
    const {data:s} = await sb.from('settings').select('value').eq('key','pu_vendor_order').single();
    if(s?.value) ord = JSON.parse(s.value);
  } catch(e){}
  const sorted = vendors.slice().sort((a,b)=>(ord[a]||99)-(ord[b]||99)||a.localeCompare(b));
  const rows = sorted.map(v => `
    <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--bd)">
      <input type="number" id="puvo-${v}" value="${ord[v]||99}" min="1" max="99"
        style="width:46px;padding:4px;border:1px solid var(--bd);border-radius:var(--r);font-size:12px;text-align:center">
      <span style="flex:1;font-weight:500">${v}</span>
    </div>`).join('');
  OM('進貨廠商排序設定', `
    <div style="font-size:12px;color:var(--tx3);margin-bottom:10px">數字越小排越前面（1=最前）</div>
    ${rows}`,
    `<button class="btn" onclick="CM()">取消</button>
     <button class="btn btn-p" onclick="savePuVendorSettings()">儲存</button>`);
}
async function savePuVendorSettings() {
  const vendors = (window._puVendors||[]).filter(v=>v!=='全部');
  const newOrd = {};
  vendors.forEach(v => {
    const el = document.getElementById('puvo-'+v);
    if(el) newOrd[v] = parseInt(el.value)||99;
  });
  await sb.from('settings').upsert({key:'pu_vendor_order', value:JSON.stringify(newOrd), updated_at:new Date().toISOString()});
  toast('廠商排序已儲存'); CM(); purchase();
}
window.showPuVendorSettings = showPuVendorSettings;
window.savePuVendorSettings = savePuVendorSettings;
