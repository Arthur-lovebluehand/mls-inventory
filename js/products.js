// Tab 切換（商品詳情 Modal）
function switchProdTab(tab){
  ['s','p','l','a','t','g'].forEach(t=>{
    const btn=document.getElementById('ptab-'+t);
    const con=document.getElementById('ptab-'+t+'-con');
    if(btn) btn.className='tab'+(t===tab?' on':'');
    if(con) con.style.display=t===tab?'block':'none';
  });
}
window.switchProdTab = switchProdTab;

// ═══════════════════════════════════════
// products.js
// ═══════════════════════════════════════

async function products(){
  try{
    // 來源 Tab：抓所有來源 + 使用者設定的排序
    let allSrcs = ['全部'];
    try {
      const { data: srcList } = await sb.from('products').select('source').eq('is_active',true).not('product_no','is',null);
      const rawSrcs = [...new Set((srcList||[]).map(x=>x.source).filter(Boolean))];
      let srcOrd = {}, srcHidden = [];
      try {
        const { data: so } = await sb.from('settings').select('value').eq('key','prod_src_order').single();
        if(so?.value){
          const parsed = JSON.parse(so.value);
          // 相容舊格式（直接是 {src:order}）和新格式（{order:{},hidden:[]}）
          if(parsed.order) { srcOrd=parsed.order; srcHidden=parsed.hidden||[]; }
          else srcOrd = parsed;
        }
      } catch(e2){}
      rawSrcs.sort((a,b) => (srcOrd[a]||99)-(srcOrd[b]||99) || a.localeCompare(b));
      // 過濾停用來源
      const visibleSrcs = rawSrcs.filter(s => !srcHidden.includes(s));
      allSrcs = ['全部', ...visibleSrcs];
      window._prodAllSrcs   = rawSrcs;      // 全部（含停用，設定用）
      window._prodSrcOrd    = srcOrd;
      window._prodSrcHidden = srcHidden;
    } catch(e2) { window._prodAllSrcs = []; window._prodSrcOrd = {}; }
    let q=sb.from('products').select('product_no,name,spec,category,stock,price_founder,price_region,price_city,price_dealer,price_vip,price_retail,cost,image_url,is_active',{count:'exact'}).not('product_no','is',null).order('product_no');
    if(pS) q=q.or(`name.ilike.%${pS}%,product_no.ilike.%${pS}%,category.ilike.%${pS}%`);
    if(!pShowInactive) q=q.eq('is_active',true);
    if(pSrc) { q=q.eq('source',pSrc); }
    else if(window._prodSrcHidden?.length) { q=q.not('source','in',`(${window._prodSrcHidden.map(s=>`"${s}"`).join(',')})`); }
    const{data,count}=await q.range((pP-1)*30,pP*30-1);
    const tp=Math.ceil((count||0)/30);
    $('main').innerHTML=`
    <div class="ph"><div><div class="pt">商品列表</div><div class="ps">${count||0} 項</div></div>
      <div class="ha">
      <button class="btn btn-s" onclick="printStockTake()">🖨 列印盤點單</button>
      <button class="btn btn-s" style="background:var(--aml);color:var(--am);border-color:var(--am)" onclick="openSplitBag()">📦 拆袋作業</button>
      <button class="btn btn-p btn-s" onclick="addProd()">＋ 新增商品</button>
    </div></div>
    <div class="pc">
    <div style="display:flex;align-items:center;gap:4px;margin-bottom:10px">
      <div class="tab-bar" style="flex:1;overflow-x:auto">
        ${allSrcs.map(s=>{const on=s===(pSrc||'全部');const click=s==='全部'?"pSrc='';pP=1;products()":"pSrc='"+s+"';pP=1;products()";return '<div class="tab'+(on?' on':'')+'" onclick="'+click+'" style="white-space:nowrap">'+s+'</div>';}).join('')}
      </div>
      ${window._prodAllSrcs?.length>1?'<button onclick="showProdSrcSettings()" title="來源排序設定" style="flex-shrink:0;padding:5px 9px;border:1px solid var(--bd);border-radius:var(--r);background:var(--sf2);cursor:pointer;font-size:14px">⚙</button>':''}
    </div>
    <div class="tc">
      <div class="tb"><span class="tt">商品清單</span>
        <div class="si"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input placeholder="名稱/編號/類別…" value="${pS}"
          oninput="if(!window._ime){pS=this.value;pP=1;products();}"
          onkeydown="if(event.key==='Enter'){pS=this.value;pP=1;products();}"
          oncompositionstart="window._ime=true"
          oncompositionend="window._ime=false;setTimeout(()=>{pS=this.value;pP=1;products();},50)"></div>
      <button class="btn btn-s" style="${pShowInactive?'background:var(--am);color:#fff;border-color:var(--am)':''}" onclick="pShowInactive=!pShowInactive;pP=1;products()">
        ${pShowInactive?'▶ 含停用中':'顯示停用'}
      </button>
      </div>
      <div class="tw"><table>
        <tr><th></th><th>編號</th><th>商品名稱</th><th>規格</th><th>類別</th><th>庫存</th><th>操作</th></tr>
        ${(data||[]).map(p=>`<tr>
          <td style="width:44px;padding:4px 6px">
            ${p.image_url
              ? `<img src="${p.image_url}" style="width:36px;height:36px;object-fit:cover;border-radius:5px;display:block" onerror="this.style.display='none'">`
              : `<div style="width:36px;height:36px;background:var(--sf2);border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:16px">📦</div>`}
          </td>
          <td style="font-size:11px;font-family:monospace;color:var(--tx2);opacity:${p.is_active===false?'.5':'1'}">${p.product_no}</td>
          <td style="font-weight:500;white-space:nowrap;opacity:${p.is_active===false?'.5':'1'}">
            ${p.name}${p.is_active===false?'<span class="badge br2" style="margin-left:5px;font-size:10px">停用</span>':''}
          </td>
          <td style="font-size:12px;color:var(--tx2)">${p.spec||'—'}</td>
          <td>${p.category?`<span class="badge bgr">${p.category}</span>`:'—'}</td>
          <td class="num ${skCls(p.stock)}">${fN(p.stock)}</td>
          
          <td><div style="display:flex;gap:3px">
            <button class="btn btn-s" onclick="window.innerWidth<=768?showMobileProd('${p.product_no}'):showProd('${p.product_no}')">查看</button>
            <button class="btn btn-s" onclick="editProdByNo('${p.product_no}')">編輯</button>
            <button class="btn btn-s" onclick="adjStk('${p.product_no}','${p.name.replace(/'/g,"\\'")}',${p.stock})">調庫存</button>
            <button class="btn btn-s" style="${p.is_active===false?'background:var(--acl);color:var(--ac);border-color:var(--ac)':'background:var(--aml);color:var(--am);border-color:var(--am)'}" onclick="toggleProd('${p.product_no}',${p.is_active!==false})">
              ${p.is_active===false?'✓ 啟用':'⊘ 停用'}</button>
            <button class="btn btn-s btn-r" onclick="dProd('${p.product_no}','${p.name.replace(/'/g,"\\'")}')">刪</button>
          </div></td>
        </tr>`).join('')}
      </table></div>
      <div class="pg"><span class="pi">第${pP}/${tp}頁，共${count}筆</span>
        <div style="display:flex;gap:5px;align-items:center">
          ${pP>1?`<button class="btn btn-s" onclick="pP--;products()">◀</button>`:''}
          <span style="font-size:12px">跳至</span>
          <input type="number" min="1" max="${tp}" value="${pP}"
            style="width:52px;padding:4px 6px;border:1px solid var(--bd);border-radius:var(--r);font-size:12px;text-align:center;outline:none"
            onchange="pP=Math.min(${tp},Math.max(1,+this.value||1));products()">
          <span style="font-size:12px">頁</span>
          ${pP<tp?`<button class="btn btn-s" onclick="pP++;products()">▶</button>`:''}
        </div></div>
    </div></div>`;
  }catch(e){$('main').innerHTML=`<div class="ld" style="color:var(--rd)">載入失敗：${e.message}</div>`;}
}
function prodForm(p){
  p=p||{};
  return `<div class="fg">
    ${fi('pno','商品編號 *','text',p.product_no)} ${fi('pname','商品名稱 *','text',p.name)}
    ${fi('pspec','規格','text',p.spec)}
    <div class="fl"><label>類別</label>
      <select id="f-pcat" style="width:100%;padding:7px 8px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;background:var(--sf);outline:none"
        onchange="if(this.value==='__new__'){const nc=prompt('請輸入新類別名稱：');if(nc){window._cats=[...new Set([...(window._cats||[]),nc])].sort();const o=new Option(nc,nc,true,true);this.insertBefore(o,this.lastElementChild);this.value=nc;}else{this.value='';}}">
        <option value="">— 選擇類別 —</option>
        ${(window._cats||[]).map(c=>`<option value="${c}" ${c===(p.category||'')?'selected':''}>${c}</option>`).join('')}
        ${(p.category&&!(window._cats||[]).includes(p.category))?`<option value="${p.category}" selected>${p.category}</option>`:''}
        <option value="__new__">＋ 新增類別…</option>
      </select>
    </div>
    ${fi('punit','單位','text',p.unit||'個')} ${fi('pstock','現有庫存','number',p.stock||0)}
    ${fs('psource','品牌',_brandNames,p.source||_brandNames[0]||'')}
    ${fi('pvpno','廠商原始編號（廠商自己的商品編號）','text',p.vendor_product_no)}
  </div>
  <div class="sh">各位階售價</div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
    ${fi('pf','創始','number',p.price_founder)} ${fi('prg','大區','number',p.price_region)} ${fi('pct','市代','number',p.price_city)}
    ${fi('pdr','經銷','number',p.price_dealer)} ${fi('pvp','VIP','number',p.price_vip)} ${fi('prl','零售','number',p.price_retail)}
    ${fi('pcost','進貨價','number',p.cost)}
    <div style="background:var(--acl);border:1px solid var(--bd);border-radius:var(--rl);padding:16px;margin-top:8px">
      <div style="font-size:13px;font-weight:700;color:var(--ac);margin-bottom:14px">🛁 服務用途設定（選填）</div>
      <div style="margin-bottom:12px">
        <label>服務單位</label>
        <select id="f-psunit" onchange="svcUnitHint(this)"
          style="width:100%;padding:8px 10px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;background:var(--sf);margin-top:6px">
          <option value="">不用於服務</option>
          <option value="組" ${(p.service_unit||'')==='組'?'selected':''}>組（計件：如外泌體 4組/盒）</option>
          <option value="ml" ${(p.service_unit||'')==='ml'?'selected':''}>ml（計量液體：如精油、保養品）</option>
          <option value="片" ${(p.service_unit||'')==='片'?'selected':''}>片（計件：如面膜）</option>
          <option value="次" ${(p.service_unit||'')==='次'?'selected':''}>次（整支整瓶為1次）</option>
          <option value="顆" ${(p.service_unit||'')==='顆'?'selected':''}>顆</option>
        </select>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
        <div class="fl">
          <label id="lbl-super">${(p.service_unit==='ml')?'每瓶/盒總容量（ml）':'1盒/瓶包含幾個服務單位'}</label>
          <input type="number" id="f-psuperunit" value="${p.service_units_per_stock||1}" min="0.1" step="1"
            oninput="updateSvcHintCalc()"
            style="width:100%;padding:8px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;outline:none">
        </div>
        <div class="fl">
          <label id="lbl-defqty">${(p.service_unit==='ml')?'每次服務用量（ml）':'每次服務用幾個'}</label>
          <input type="number" id="f-psdefqty" value="${p.default_service_qty||1}" min="0.5" step="1"
            oninput="updateSvcHintCalc()"
            style="width:100%;padding:8px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;outline:none">
        </div>
      </div>
      <div id="svc-hint-calc" style="font-size:12px;color:var(--ac);padding:8px;background:rgba(92,122,92,.08);border-radius:var(--r)">${p.service_unit ? (p.service_unit==='ml' ? '💡 填入容量和每次用量，自動計算可服務次數' : '💡 填入個數和每次用量，自動計算可服務次數') : '選擇服務單位後顯示換算說明'}</div>
    </div>
  </div>
  <div class="sh">商品圖片</div>
  <div style="margin-bottom:12px">
    <div style="display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap">
      <div id="prod-img-preview" style="width:100px;height:100px;border:2px dashed var(--bd);border-radius:var(--r);display:flex;align-items:center;justify-content:center;overflow:hidden;background:var(--sf2);flex-shrink:0">
        ${p.image_url
          ? `<img src="${p.image_url}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">`
          : `<span style="font-size:11px;color:var(--tx3);text-align:center">無圖片</span>`}
      </div>
      <div style="flex:1;min-width:180px">
        <div style="font-size:11px;font-weight:600;color:var(--tx2);margin-bottom:6px">上傳圖片（JPG/PNG/WEBP，上限 5MB）</div>
        <input type="file" id="prod-img-file" accept="image/*" style="font-size:12px;margin-bottom:7px;width:100%"
          onchange="previewProdImg(this)">
        <div style="font-size:11px;color:var(--tx3);margin-bottom:5px">—— 或貼上圖片網址 ——</div>
        <input type="text" id="f-pimg" value="${p.image_url||''}" placeholder="https://…"
          style="width:100%;padding:6px 8px;border:1px solid var(--bd);border-radius:var(--r);font-size:12px;outline:none"
          oninput="this.previousElementSibling.previousElementSibling && document.getElementById('prod-img-preview') && (document.getElementById('prod-img-preview').innerHTML=this.value?'<img src=\''+this.value+'\' style=\'width:100%;height:100%;object-fit:cover\'>':'<span style=\'font-size:11px;color:var(--tx3)\'>無圖片</span>')">
      </div>
    </div>
    <input type="hidden" id="prod-img-url" value="${p.image_url||''}">
  </div>
  <div class="sh">其他</div>
  <div class="fg"><div class="fl fw">${fa('pdesc','說明',p.description)}</div></div>`;
}
async function addProd(){
  await loadCatList();
  OM('新增商品',prodForm(),`<button class="btn" onclick="CM()">取消</button><button class="btn btn-p" onclick="saveProd(false)">儲存</button>`);
}
function previewProdImg(input){
  const file=input.files[0]; if(!file)return;
  const preview=document.getElementById('prod-img-preview');
  const urlField=document.getElementById('f-pimg');
  const reader=new FileReader();
  reader.onload=e=>{
    if(preview) preview.innerHTML=`<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover">`;
    if(urlField) urlField.value=''; // 清空 URL 欄，等儲存時再上傳
    // 儲存 file 到全域，saveProd 時上傳
    window._prodImgFile=file;
  };
  reader.readAsDataURL(file);
}
async function loadCatList(){
  const{data}=await sb.from('products').select('category').not('category','is',null);
  const cats=[...new Set((data||[]).map(x=>x.category).filter(Boolean))].sort();
  // 補上預設類別
  const defaults=['保養品','保健食品','洗面乳','髮品','精油','外泌體','化妝品','輔消品','輔助設備','贈品','其他'];
  const all=[...new Set([...defaults,...cats])];
  // 等 DOM 有 datalist 才填
  setTimeout(()=>{
    const dl=document.getElementById('catDL')||document.getElementById('cat-list');
    if(dl) dl.innerHTML=all.map(c=>`<option value="${c}">`).join('');
  },50);
}
async function eProd(p){
  await loadCatList();
  OM('編輯商品',`<div class="fl" style="margin-bottom:12px"><label>商品編號</label><input value="${p.product_no}" disabled style="opacity:.6;width:100%;padding:7px 8px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px"></div>`+prodForm(p).replace(`id="f-pno"`,`id="f-pno-disabled"`),
  `<button class="btn" onclick="CM()">取消</button><button class="btn" onclick="showPriceLog('${p.product_no}','${p.name.replace(/'/g,"\'")}')">價格記錄</button><button class="btn btn-p" onclick="saveProd('${p.product_no}')">儲存</button>`);
}
async function showPriceLog(no,name){
  const{data:logs}=await sb.from('product_price_logs').select('*').eq('product_no',no).order('created_at',{ascending:false}).limit(50);
  OM(`${name}・價格異動記錄`,`
  <div class="al al-w" style="font-size:12px">儲存商品編輯後，價格變動會自動記錄在這裡。歷史訂單的售價不受影響（已固定在訂單明細中）。</div>
  ${!logs||!logs.length?'<div style="color:var(--tx3);padding:20px 0;text-align:center">尚無異動記錄</div>':`
  <table class="itb"><tr><th>位階</th><th>舊價格</th><th>新價格</th><th>異動日期</th><th>備註</th></tr>
  ${logs.map(l=>`<tr>
    <td><span class="badge bgr">${l.price_type}</span></td>
    <td class="num" style="color:var(--tx2)">${fM(l.old_price)}</td>
    <td class="num" style="font-weight:600;color:${(l.new_price||0)>(l.old_price||0)?'var(--rd)':'var(--ac)'}">${fM(l.new_price)}</td>
    <td style="font-size:12px">${fD(l.change_date)}</td>
    <td style="font-size:12px;color:var(--tx2)">${l.note||'—'}</td>
  </tr>`).join('')}
  </table>`}`);
}
async function saveProd(existingNo){
  const no=existingNo||v('pno'), nm=v('pname');
  if(!nm){toast('請填寫商品名稱','e');return;}
  const priceFields={price_founder:n('pf'),price_region:n('prg'),price_city:n('pct'),price_dealer:n('pdr'),price_vip:n('pvp'),price_retail:n('prl'),cost:n('pcost')};
  // 處理圖片：先上傳檔案（如果有），再存 URL
  let imageUrl = v('pimg') || document.getElementById('prod-img-url')?.value || null;
  if(window._prodImgFile){
    const file=window._prodImgFile;
    const ext=file.name.split('.').pop();
    const path=`${existingNo||v('pno')}-${Date.now()}.${ext}`;
    const{data:upData,error:upErr}=await sb.storage.from('product-images').upload(path,file,{upsert:true,contentType:file.type});
    if(upErr){ toast('圖片上傳失敗：'+upErr.message,'e'); }
    else{
      const{data:urlData}=sb.storage.from('product-images').getPublicUrl(path);
      imageUrl=urlData?.publicUrl||imageUrl;
    }
    window._prodImgFile=null;
  }
  const obj={name:nm,spec:v('pspec')||null,category:(()=>{const cv=v('pcat');return(cv&&cv!=='__new__')?cv:null;})(),unit:v('punit')||'個',stock:n('pstock')||0,...priceFields,source:v('psource')||null,vendor_product_no:v('pvpno')||null,image_url:imageUrl,description:v('pdesc')||null,
    service_unit:document.getElementById('f-psunit')?.value||null,
    service_units_per_stock:parseFloat(document.getElementById('f-psuperunit')?.value)||1,
    default_service_qty:parseFloat(document.getElementById('f-psdefqty')?.value)||1};
  let err;
  if(existingNo){
    // 比對舊價格，有變動則記錄
    const{data:old}=await sb.from('products').select('price_founder,price_region,price_city,price_dealer,price_vip,price_retail,cost').eq('product_no',existingNo).single();
    if(old){
      const priceNames={price_founder:'創始',price_region:'大區',price_city:'市代',price_dealer:'經銷',price_vip:'VIP',price_retail:'零售',cost:'進貨價'};
      const logs=[];
      for(const[col,label] of Object.entries(priceNames)){
        const ov=old[col],nv=priceFields[col];
        if(ov!==nv&&(ov!=null||nv!=null)) logs.push({product_no:existingNo,price_type:label,old_price:ov,new_price:nv,change_date:today(),note:'編輯更新'});
      }
      if(logs.length) await sb.from('product_price_logs').insert(logs);
    }
    ({error:err}=await sb.from('products').update(obj).eq('product_no',existingNo));
  } else {
    if(!no){toast('請填寫商品編號','e');return;}
    obj.product_no=no;
    ({error:err}=await sb.from('products').insert(obj));
  }
  if(err){toast('儲存失敗：'+err.message,'e');return;}
  toast(existingNo?'商品已更新':'商品新增成功！');CM();products();
}
function adjStk(no,name,cur){
  OM(`調整庫存：${name}`,`
    <p style="margin-bottom:13px">目前庫存：<strong class="${skCls(cur)}" style="font-size:20px">${cur}</strong></p>
    <div class="fg">
      ${fs('adjt','調整方式',['設定為','增加','減少'],'設定為')}
      ${fi('adjq','數量','number','0')}
    </div>
    <div style="margin-top:10px">${fi('adjn','備註（調整原因）')}</div>`,
  `<button class="btn" onclick="CM()">取消</button><button class="btn btn-p" onclick="doAdj('${no}',${cur})">確認</button>`);
}
async function doAdj(no,cur){
  const t=v('adjt'),q=n('adjq')||0;
  const ns=t==='設定為'?q:t==='增加'?cur+q:Math.max(0,cur-q);
  const{error}=await sb.from('products').update({stock:ns}).eq('product_no',no);
  if(error){toast('調整失敗','e');return;}
  await logAction('adjust','products',no,`庫存調整 ${no}：${cur} → ${ns}（${t==='設定為'?'設定為 '+q:t==='增加'?'+'+q+' 增加':'-'+q+' 減少'}）${v('adjn')?'，原因：'+v('adjn'):''}`,{stock:cur},{stock:ns});
  toast(`庫存已調整為 ${ns}`);CM();products();
}
async function toggleProd(no,active){
  const isActive = active!==false && active!=='false';
  const msg=isActive?`確定停用「${no}」？停用後不會出現在新增訂單的選單中，歷史記錄不受影響。`:`確定重新啟用「${no}」？`;
  if(!confirm(msg))return;
  await sb.from('products').update({is_active:!isActive}).eq('product_no',no);
  toast(isActive?'商品已停用':'商品已重新啟用');
  products();
}
async function dProd(no,name){
  if(!confirm(`確定刪除「${name}」？`))return;
  await sb.from('products').delete().eq('product_no',no);
  toast('商品已刪除');products();
}
function showProdPage(p, its, poIts, loanIts, adjLogs, soMap, poMap, lnMap) {
  console.log('[showProdPage] called, no=', p?.product_no, 'width=', window.innerWidth);
  const no = p?.product_no;

  const priceRows = [
    ['創始', p?.price_founder], ['大區', p?.price_region], ['市代', p?.price_city],
    ['經銷', p?.price_dealer], ['VIP', p?.price_vip], ['零售', p?.price_retail], ['進貨', p?.cost],
  ].filter(([, v]) => v != null);

  $('main').innerHTML = `
  <div style="background:var(--sf);position:sticky;top:52px;z-index:100;
    display:flex;align-items:center;gap:8px;padding:10px 14px;
    border-bottom:1px solid var(--bd);box-shadow:0 1px 4px rgba(0,0,0,.06)">
    <button onclick="products()" style="display:flex;align-items:center;gap:4px;
      background:none;border:none;cursor:pointer;font-size:14px;font-weight:600;
      color:var(--ac);padding:4px 0;white-space:nowrap;flex-shrink:0">← 返回</button>
    <span style="font-size:14px;font-weight:600;color:var(--tx);
      overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p?.name || no}</span>
  </div>

  <div style="padding:14px;width:100%;box-sizing:border-box">
    ${p?.image_url ? `<div style="text-align:center;margin-bottom:14px">
      <img src="${p.image_url}" style="max-height:160px;max-width:100%;border-radius:10px;object-fit:contain">
    </div>` : ''}

    <!-- 基本資訊 + 庫存 -->
    <div style="background:var(--sf);border-radius:12px;padding:14px;margin-bottom:12px">
      <div style="font-size:11px;font-weight:600;color:var(--tx3);letter-spacing:.5px;margin-bottom:10px;text-transform:uppercase">商品資訊</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
        <div><div style="font-size:11px;color:var(--tx3)">商品編號</div><div style="font-size:14px;font-weight:600">${p?.product_no}</div></div>
        <div><div style="font-size:11px;color:var(--tx3)">規格</div><div style="font-size:14px">${p?.spec||'—'}</div></div>
        <div><div style="font-size:11px;color:var(--tx3)">類別</div><div><span class="badge bgr" style="font-size:12px">${p?.category||'—'}</span></div></div>
        <div><div style="font-size:11px;color:var(--tx3)">品牌</div><div style="font-size:14px">${p?.source||'—'}</div></div>
        <div><div style="font-size:11px;color:var(--tx3)">廠商原始編號</div><div style="font-size:13px;font-family:monospace">${p?.vendor_product_no||'—'}</div></div>
        <div><div style="font-size:11px;color:var(--tx3)">單位</div><div style="font-size:14px">${p?.unit||'個'}</div></div>
      </div>
      <div style="background:var(--acl);border-radius:8px;padding:12px;display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:11px;color:var(--tx3)">目前庫存</div>
          <div class="${skCls(p?.stock||0)}" style="font-size:28px;font-weight:700;line-height:1.2">${fN(p?.stock)}</div>
        </div>
        <button class="btn btn-s" onclick="adjStk('${no}','${(p?.name||'').replace(/'/g,"\'")}',${p?.stock||0})">調庫存</button>
      </div>
    </div>

    <!-- 各位階售價 -->
    <div style="background:var(--sf);border-radius:12px;padding:14px;margin-bottom:12px">
      <div style="font-size:11px;font-weight:600;color:var(--tx3);letter-spacing:.5px;margin-bottom:10px;text-transform:uppercase">各位階售價</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        ${priceRows.map(([lbl, val]) => {
          const isCost = lbl==='進貨';
          const isRetail = lbl==='零售';
          const bg = isCost ? '#fff3e0' : isRetail ? '#f3e5f5' : 'var(--acl)';
          const clr = isCost ? '#e65100' : isRetail ? '#7b1fa2' : 'var(--ac)';
          const border = isCost ? '1.5px solid #ff9800' : isRetail ? '1px solid #ce93d8' : '1px solid transparent';
          return `<div style="background:${bg};border-radius:8px;padding:10px 12px;border:${border}">
            <div style="font-size:11px;color:var(--tx3);margin-bottom:2px">${lbl}${isCost?' 💰':''}</div>
            <div style="font-size:18px;font-weight:700;color:${clr}">${fM(val)}</div>
          </div>`;
        }).join('')}
      </div>
    </div>

    <!-- 記錄 -->
    <div style="background:var(--sf);border-radius:12px;padding:14px;margin-bottom:12px">
      <div style="display:flex;border-bottom:1px solid var(--bd);margin-bottom:12px">
        <div class="tab on" id="mptab-s" onclick="switchMPTab('s')" style="flex:1;text-align:center;font-size:13px;padding:8px 4px">銷貨</div>
        <div class="tab" id="mptab-p" onclick="switchMPTab('p')" style="flex:1;text-align:center;font-size:13px;padding:8px 4px">進貨</div>
        <div class="tab" id="mptab-l" onclick="switchMPTab('l')" style="flex:1;text-align:center;font-size:13px;padding:8px 4px">借貨</div>
        <div class="tab" id="mptab-a" onclick="switchMPTab('a')" style="flex:1;text-align:center;font-size:13px;padding:8px 4px">調整</div>
      </div>
      <div id="mptab-s-con">
        ${(its||[]).length===0?'<div style="text-align:center;color:var(--tx3);padding:16px;font-size:13px">暫無銷貨紀錄</div>':
          (its||[]).map(i=>{const o=soMap[i.order_no];return '<div style="padding:10px 0;border-bottom:1px solid var(--bd)">'
            +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">'
            +'<a href="#" onclick="event.preventDefault();showOrder(this.dataset.no)" data-no="'+i.order_no+'" style="color:var(--ac);font-weight:600;font-size:14px">'+i.order_no+'</a>'
            +'<span class="badge '+(o?.payment_done?'bg':'br2')+'" style="font-size:12px">'+(o?.payment_done?'已收':'未收')+'</span></div>'
            +'<div style="display:flex;justify-content:space-between;align-items:center">'
            +'<span style="font-size:13px;color:var(--tx2)">'+(o?.customer_name||'—')+' · '+fD(o?.order_date)+'</span>'
            +'<span style="font-size:16px;font-weight:700">'+fM(i.amount)+'</span></div>'
            +'<div style="font-size:12px;color:var(--tx3);margin-top:2px">售價 '+fM(i.unit_price)+' × '+fN(i.qty)+(i.gift_qty?' + 贈 '+fN(i.gift_qty):'')+'</div>'
            +'</div>';}).join('')}
      </div>
      <div id="mptab-p-con" style="display:none">
        ${(poIts||[]).length===0?'<div style="text-align:center;color:var(--tx3);padding:16px;font-size:13px">暫無進貨紀錄</div>':
          (poIts||[]).map(i=>{const o=poMap[i.po_no];return '<div style="padding:10px 0;border-bottom:1px solid var(--bd)">'
            +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">'
            +'<a href="#" onclick="event.preventDefault();showPO(this.dataset.no)" data-no="'+i.po_no+'" style="color:var(--br);font-weight:600;font-size:14px">'+i.po_no+'</a>'
            +'<span class="badge '+(o?.receipt_status==='全部收貨'?'bg':o?.receipt_status==='部分收貨'?'ba':'br2')+'" style="font-size:12px">'+(o?.receipt_status||'待收貨')+'</span></div>'
            +'<div style="display:flex;justify-content:space-between;align-items:center">'
            +'<span style="font-size:13px;color:var(--tx2)">'+(o?.vendor_name||'—')+' · '+fD(o?.po_date)+'</span>'
            +'<span style="font-size:16px;font-weight:700">'+fM(i.amount)+'</span></div>'
            +'<div style="font-size:12px;color:var(--tx3);margin-top:2px">進 '+(fN((i.qty||0)+(i.gift_qty||0)))+' 件 · 已收 '+fN(i.received_qty||0)+'</div>'
            +'</div>';}).join('')}
      </div>
      <div id="mptab-l-con" style="display:none">
        ${(loanIts||[]).length===0?'<div style="text-align:center;color:var(--tx3);padding:16px;font-size:13px">暫無借貨紀錄</div>':
          (loanIts||[]).map(i=>{const o=lnMap[i.loan_no];return '<div style="padding:10px 0;border-bottom:1px solid var(--bd)">'
            +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">'
            +'<a href="#" onclick="event.preventDefault();showLoan(this.dataset.no)" data-no="'+i.loan_no+'" style="color:var(--bl);font-weight:600;font-size:14px">'+i.loan_no+'</a>'
            +'<span class="badge '+(o?.direction==='借出'?'bb':'bbr')+'" style="font-size:12px">'+(o?.direction||'借出')+'</span></div>'
            +'<div style="display:flex;justify-content:space-between;align-items:center">'
            +'<span style="font-size:13px;color:var(--tx2)">'+(o?.customer_name||'—')+' · '+fD(o?.loan_date)+'</span>'
            +'<span class="badge '+(o?.return_status==='全部歸還'?'bg':'br2')+'" style="font-size:12px">'+(o?.return_status||'未歸還')+'</span></div>'
            +'<div style="font-size:12px;color:var(--tx3);margin-top:2px">借 '+fN(i.qty)+' 件 · 已還 '+fN(i.returned_qty||0)+'</div>'
            +'</div>';}).join('')}
      </div>
      <div id="mptab-a-con" style="display:none">
        ${(adjLogs||[]).length===0?'<div style="text-align:center;color:var(--tx3);padding:16px;font-size:13px">暫無調整記錄</div>':
          (adjLogs||[]).map(l=>'<div style="padding:10px 0;border-bottom:1px solid var(--bd)"><div style="font-size:12px;color:var(--tx3)">'+new Date(l.created_at).toLocaleString('zh-TW')+' · '+(l.operator||'—')+'</div><div style="font-size:13px;margin-top:3px">'+(l.description||'—')+'</div></div>').join('')}
      </div>
    </div>

    <!-- 底部按鈕 -->
    <div style="display:flex;gap:10px;padding-bottom:24px">
      <button class="btn" style="flex:1;padding:12px;font-size:15px" onclick="adjStk('${no}','${(p?.name||'').replace(/'/g,"\'")}',${p?.stock||0})">調庫存</button>
      <button class="btn btn-p" style="flex:1;padding:12px;font-size:15px" onclick="editProdByNo('${no}')">編輯商品</button>
    </div>
  </div>`;

  window.switchMPTab = tab => {
    ['s','p','l','a'].forEach(t => {
      const btn = document.getElementById('mptab-'+t);
      const con = document.getElementById('mptab-'+t+'-con');
      if(btn) btn.className = 'tab' + (t===tab?' on':'');
      if(con) con.style.display = t===tab ? 'block' : 'none';
    });
  };
  document.querySelectorAll('.ni').forEach(el => el.classList.remove('on'));
  document.querySelector('.ni[data-p="products"]')?.classList.add('on');
}
window.showProdPage = showProdPage;
async function showProd(no) {
  // 分開查詢（不用 FK join，避免 Supabase 關聯查詢失敗）
  const { data: p } = await sb.from('products').select('*').eq('product_no', no).single();
  // 先抓較大批次（不依賴單號文字排序，因為單號日期常跟真實訂單日期對不上），之後依真實日期排序再截取顯示筆數
  const { data: soItemsRaw } = await sb.from('sales_order_items').select('order_no,qty,unit_price,amount,gift_qty').eq('product_no',no).limit(300);
  const { data: poItemsRaw } = await sb.from('purchase_order_items').select('po_no,qty,gift_qty,unit_price,amount,received_qty').eq('product_no',no).limit(300);
  const { data: lnItems } = await sb.from('loan_order_items').select('loan_no,qty,returned_qty').eq('product_no',no).order('loan_no',{ascending:false}).limit(10);
  const { data: adjLogs } = await sb.from('audit_logs').select('description,created_at,operator').eq('table_name','products').eq('record_id',no).eq('action','adjust').order('created_at',{ascending:false}).limit(10);
  const { data: transfers } = await sb.from('service_transfers').select('transfer_date,qty_stock,qty_service,note').eq('product_no',no).order('transfer_date',{ascending:false}).limit(20);
  // 這個商品的贈品記錄（服務單贈送 + 儲值贈送）
  const { data: svcGiftIts } = await sb.from('service_order_items').select('order_no,qty,unit,cost').eq('item_type','gift_product').eq('product_no',no).order('order_no',{ascending:false});
  const { data: crGiftRecs } = await sb.from('store_credit_records').select('customer_no,record_date,product_qty,note').eq('type','gift').eq('product_no',no).order('record_date',{ascending:false});
  const giftOrderNos=[...new Set((svcGiftIts||[]).map(x=>x.order_no))];
  const giftCustNos=[...new Set((crGiftRecs||[]).map(x=>x.customer_no).filter(Boolean))];
  const [giftOrderMap,giftCustMap]=[{},{}];
  if(giftOrderNos.length){const{data:gords}=await sb.from('service_orders').select('order_no,order_date,customer_name').in('order_no',giftOrderNos);(gords||[]).forEach(x=>giftOrderMap[x.order_no]=x);}
  if(giftCustNos.length){const{data:gcusts}=await sb.from('customers').select('customer_no,name').in('customer_no',giftCustNos);(gcusts||[]).forEach(x=>giftCustMap[x.customer_no]=x.name);}
  const giftRows=[
    ...(svcGiftIts||[]).map(i=>({date:giftOrderMap[i.order_no]?.order_date||'',customer:giftOrderMap[i.order_no]?.customer_name||'—',qty:i.qty,unit:i.unit||'個',cost:i.cost,source:'服務單',no:i.order_no})),
    ...(crGiftRecs||[]).map(r=>({date:r.record_date,customer:giftCustMap[r.customer_no]||r.customer_no,qty:r.product_qty,unit:'個',cost:null,source:'儲值贈品',no:null})),
  ].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  // 批次取相關主表資訊
  const soNosAll=(soItemsRaw||[]).map(x=>x.order_no).filter(Boolean);
  const poNosAll=(poItemsRaw||[]).map(x=>x.po_no).filter(Boolean);
  const lnNos=(lnItems||[]).map(x=>x.loan_no).filter(Boolean);
  const [soMap,poMap,lnMap]=[{},{},{}];
  if(soNosAll.length){const{data:sos}=await sb.from('sales_orders').select('order_no,order_date,customer_name,payment_done').in('order_no',soNosAll);(sos||[]).forEach(x=>soMap[x.order_no]=x);}
  if(poNosAll.length){const{data:pos}=await sb.from('purchase_orders').select('po_no,po_date,vendor_name,receipt_status').in('po_no',poNosAll);(pos||[]).forEach(x=>poMap[x.po_no]=x);}
  if(lnNos.length){const{data:lns}=await sb.from('loan_orders').select('loan_no,loan_date,customer_name,direction,return_status').in('loan_no',lnNos);(lns||[]).forEach(x=>lnMap[x.loan_no]=x);}
  // 依真實日期排序（新到舊），再截取要顯示的筆數
  const soItemsSorted=(soItemsRaw||[]).slice().sort((a,b)=>(soMap[b.order_no]?.order_date||'').localeCompare(soMap[a.order_no]?.order_date||''));
  const poItemsSorted=(poItemsRaw||[]).slice().sort((a,b)=>(poMap[b.po_no]?.po_date||'').localeCompare(poMap[a.po_no]?.po_date||''));
  const soItems=soItemsSorted.slice(0,15), poItems=poItemsSorted.slice(0,10);
  const soTotalCount=soItemsRaw?.length||0, poTotalCount=poItemsRaw?.length||0;
  const its=soItems; const poIts=poItems; const loanIts=lnItems;

  const priceRows = [
    ['創始', p?.price_founder], ['大區', p?.price_region], ['市代', p?.price_city],
    ['經銷', p?.price_dealer], ['VIP', p?.price_vip], ['零售', p?.price_retail], ['進貨', p?.cost],
  ].filter(([, v]) => v != null);


  OM(`商品：${p?.name || no}`, `
  ${p?.image_url ? `<div style="text-align:center;margin-bottom:14px"><img src="${p.image_url}" style="max-height:200px;max-width:100%;border-radius:var(--rl);object-fit:contain" onerror="this.style.display='none'"></div>` : ''}
  <div class="dg" style="margin-bottom:13px;grid-template-columns:repeat(auto-fill,minmax(120px,1fr))">
    <div class="dr"><span class="dlb">商品編號</span><span class="dv" style="font-family:monospace;font-size:13px">${p?.product_no}</span></div>
    <div class="dr"><span class="dlb">廠商原始編號</span><span class="dv" style="font-family:monospace;font-size:13px">${p?.vendor_product_no || '—'}</span></div>
    <div class="dr"><span class="dlb">規格</span><span class="dv">${p?.spec || '—'}</span></div>
    <div class="dr"><span class="dlb">類別</span><span class="dv">${p?.category ? `<span class="badge bgr">${p.category}</span>` : '—'}</span></div>
    <div class="dr"><span class="dlb">品牌</span><span class="dv">${p?.source || '—'}</span></div>
    <div class="dr"><span class="dlb">單位</span><span class="dv">${p?.unit || '個'}</span></div>
    <div class="dr"><span class="dlb">目前庫存</span><span class="dv ${skCls(p?.stock||0)}" style="font-size:20px;font-weight:700">${fN(p?.stock)}</span></div>
    ${p?.description ? `<div class="dr" style="grid-column:1/-1"><span class="dlb">說明</span><span class="dv">${p.description}</span></div>` : ''}
  </div>
  <div class="sh">各位階售價</div>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:7px;margin-bottom:14px">
    ${priceRows.map(([lbl, val]) => {
      const isCost=lbl==='進貨';
      const isRetail=lbl==='零售';
      const bg=isCost?'#fff3e0':isRetail?'#f3e5f5':'var(--acl)';
      const clr=isCost?'#e65100':isRetail?'#7b1fa2':'var(--ac)';
      const border=isCost?'1.5px solid #ff9800':isRetail?'1px solid #ce93d8':'none';
      return `<div style="background:${bg};border-radius:var(--r);padding:8px 10px;text-align:center;border:${border}">
        <div style="font-size:10px;color:var(--tx3);font-weight:600;margin-bottom:3px">${lbl}${isCost?' 💰':''}</div>
        <div style="font-weight:700;font-size:15px;color:${clr}">${fM(val)}</div>
      </div>`;
    }).join('')}
  </div>
  <div style="display:flex;gap:2px;border-bottom:1px solid var(--bd);margin-bottom:10px;overflow-x:auto;-webkit-overflow-scrolling:touch">
    <div class="tab on" id="ptab-s" onclick="switchProdTab('s')" style="white-space:nowrap">銷貨${soTotalCount>15?`（近15/共${soTotalCount}）`:''}</div>
    <div class="tab" id="ptab-p" onclick="switchProdTab('p')" style="white-space:nowrap">進貨${poTotalCount>10?`（近10/共${poTotalCount}）`:''}</div>
    <div class="tab" id="ptab-l" onclick="switchProdTab('l')" style="white-space:nowrap">借貨</div>
    <div class="tab" id="ptab-a" onclick="switchProdTab('a')" style="white-space:nowrap">庫存調整</div>
    <div class="tab" id="ptab-t" onclick="switchProdTab('t')" style="white-space:nowrap">🛁 服務撥轉</div>
    <div class="tab" id="ptab-g" onclick="switchProdTab('g')" style="white-space:nowrap">🎁 贈品${giftRows.length?`（${giftRows.length}）`:''}</div>
  </div>
  <div id="ptab-content">
  <!-- 銷貨 -->
  <div id="ptab-s-con">
  <div style="overflow-x:auto;-webkit-overflow-scrolling:touch"><table class="itb" style="min-width:380px">
    <tr><th>訂單號</th><th>日期</th><th>客戶</th><th>售價</th><th>數量</th><th>贈品</th><th>收款</th></tr>
    ${(its || []).map(i => {
      const o = i.sales_orders;
      return '<tr>'
        +'<td><a href="#" onclick="event.preventDefault();CM();setTimeout(()=>showOrder(this.dataset.no),80)" data-no="'+i.order_no+'" style="color:var(--ac);font-size:11px;font-family:monospace">'+i.order_no+'</a></td>'
        +'<td style="font-size:11px">'+fD(soMap[i.order_no]?.order_date||'')+'</td>'
        +'<td style="font-size:12px">'+(soMap[i.order_no]?.customer_name||'—')+'</td>'
        +'<td class="num">'+fM(i.unit_price)+'</td>'
        +'<td class="num">'+fN(i.qty)+'</td>'
        +'<td class="num" style="color:var(--am)">'+(i.gift_qty?fN(i.gift_qty):'—')+'</td>'
        +'<td><span class="badge '+(soMap[i.order_no]?.payment_done?'bg':'br2')+'">'+(soMap[i.order_no]?.payment_done?'已收':'未收')+'</span></td>'
        +'</tr>';
    }).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--tx3)">暫無銷貨紀錄</td></tr>'}
  </table></div></div>
  <!-- 進貨 -->
  <div id="ptab-p-con" style="display:none">
  <div style="overflow-x:auto;-webkit-overflow-scrolling:touch"><table class="itb" style="min-width:420px">
    <tr><th>進貨單號</th><th>日期</th><th>廠商</th><th>進貨價</th><th>訂購數</th><th>已收數</th><th>收貨狀態</th></tr>
    ${(poIts || []).map(i => {
      const o = i.purchase_orders;
      return '<tr>'
        +'<td><a href="#" onclick="event.preventDefault();CM();setTimeout(()=>showPO(this.dataset.no),80)" data-no="'+i.po_no+'" style="color:var(--br);font-size:11px;font-family:monospace">'+i.po_no+'</a></td>'
        +'<td style="font-size:11px">'+fD(poMap[i.po_no]?.po_date||'')+'</td>'
        +'<td style="font-size:12px">'+(poMap[i.po_no]?.vendor_name||'—')+'</td>'
        +'<td class="num">'+fM(i.unit_price)+'</td>'
        +'<td class="num">'+(fN((i.qty||0)+(i.gift_qty||0)))+'</td>'
        +'<td class="num ok">'+fN(i.received_qty||0)+'</td>'
        +'<td><span class="badge '+(poMap[i.po_no]?.receipt_status==='全部收貨'?'bg':poMap[i.po_no]?.receipt_status==='部分收貨'?'ba':'br2')+'">'+( poMap[i.po_no]?.receipt_status||'待收貨')+'</span></td>'
        +'</tr>';
    }).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--tx3)">暫無進貨紀錄</td></tr>'}
  </table></div></div>
  <!-- 借貨 -->
  <div id="ptab-l-con" style="display:none">
  <div style="overflow-x:auto;-webkit-overflow-scrolling:touch"><table class="itb" style="min-width:380px">
    <tr><th>借貨單號</th><th>日期</th><th>對象</th><th>方向</th><th>借貨數</th><th>已歸還</th><th>狀態</th></tr>
    ${(loanIts || []).map(i => {
      const o = i.loan_orders;
      return '<tr>'
        +'<td><a href="#" onclick="event.preventDefault();CM();setTimeout(()=>showLoan(this.dataset.no),80)" data-no="'+i.loan_no+'" style="color:var(--bl);font-size:11px;font-family:monospace">'+i.loan_no+'</a></td>'
        +'<td style="font-size:11px">'+fD(lnMap[i.loan_no]?.loan_date||'')+'</td>'
        +'<td style="font-size:12px">'+(lnMap[i.loan_no]?.customer_name||'—')+'</td>'
        +'<td><span class="badge '+(lnMap[i.loan_no]?.direction==='借出'?'bb':'bbr')+'">'+(lnMap[i.loan_no]?.direction||'借出')+'</span></td>'
        +'<td class="num">'+fN(i.qty)+'</td>'
        +'<td class="num ok">'+fN(i.returned_qty||0)+'</td>'
        +'<td><span class="badge '+(lnMap[i.loan_no]?.return_status==='全部歸還'?'bg':lnMap[i.loan_no]?.return_status==='部分歸還'?'ba':'br2')+'">'+( lnMap[i.loan_no]?.return_status||'未歸還')+'</span></td>'
        +'</tr>';
    }).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--tx3)">暫無借貨紀錄</td></tr>'}
  </table></div></div>
  <!-- 庫存調整 -->
  <div id="ptab-t-con" style="display:none">
    ${p.service_unit ? `
    <div style="background:var(--acl);border-radius:var(--r);padding:12px;margin-bottom:12px">
      <div style="font-size:13px;font-weight:700;color:var(--ac);margin-bottom:6px">🛁 服務設定</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-size:13px">
        <div><span style="color:var(--tx3)">服務單位：</span><b>${p.service_unit}</b></div>
        <div><span style="color:var(--tx3)">1進貨單位=</span><b>${p.service_units_per_stock||1} ${p.service_unit}</b></div>
        <div><span style="color:var(--tx3)">每次預設：</span><b>${p.default_service_qty||1} ${p.service_unit}</b></div>
      </div>
    </div>
    ${(transfers||[]).length ? `<table style="width:100%"><tr><th>日期</th><th>撥轉盒數</th><th>換算</th><th>備註</th></tr>
      ${transfers.map(t=>`<tr>
        <td>${t.transfer_date}</td>
        <td style="text-align:center">${t.qty_stock} 盒/瓶</td>
        <td style="text-align:center;color:var(--ac)">${t.qty_service} ${p.service_unit}</td>
        <td style="font-size:12px;color:var(--tx3)">${t.note||'—'}</td>
      </tr>`).join('')}
    </table>` : '<div style="padding:20px;text-align:center;color:var(--tx3)">尚無撥轉記錄</div>'}` :
    `<div style="padding:20px;text-align:center;color:var(--tx3)">此商品尚未設定服務單位<br><small>請點「編輯商品」→ 填寫服務用途設定</small></div>`}
  </div>
  <div id="ptab-g-con" style="display:none">
    <div style="font-size:12px;color:var(--tx3);margin-bottom:10px">送給客戶帶走的這個商品，來源包含服務單的贈送商品、儲值時附送的商品。</div>
    ${giftRows.length ? `<table class="itb"><tr><th>日期</th><th>客戶</th><th>數量</th><th>成本</th><th>來源</th></tr>
      ${giftRows.map(g=>`<tr>
        <td style="font-size:12px">${fD(g.date)}</td>
        <td>${g.customer}</td>
        <td class="num">${g.qty} ${g.unit}</td>
        <td class="num" style="color:var(--rd)">${g.cost!=null?fM(g.cost):'—'}</td>
        <td style="font-size:11px">${g.source==='服務單'?`<a href="#" onclick="event.preventDefault();CM();setTimeout(()=>svcShowOrder('${g.no}'),80)" style="color:var(--ac)">服務單：${g.no}</a>`:'<span class="badge ba" style="font-size:10px">儲值贈品</span>'}</td>
      </tr>`).join('')}
    </table>` : '<div style="padding:20px;text-align:center;color:var(--tx3)">尚無贈品記錄</div>'}
  </div>
  <div id="ptab-a-con" style="display:none">
  <table class="itb">
    <tr><th>時間</th><th>調整說明</th><th>操作者</th></tr>
    ${(adjLogs || []).map(l => '<tr>'
      +'<td style="font-size:11px">'+new Date(l.created_at).toLocaleString('zh-TW')+'</td>'
      +'<td style="font-size:12px">'+(l.description||'—')+'</td>'
      +'<td style="font-size:12px">'+(l.operator||'—')+'</td>'
      +'</tr>').join('') || '<tr><td colspan="3" style="text-align:center;color:var(--tx3)">暫無調整記錄</td></tr>'}
  </table></div>
  </div>`,
    `<button class="btn" onclick="CM()">關閉</button>
     <button class="btn" onclick='eProd(${JSON.stringify(p || {})})'>編輯商品</button>
     <button class="btn" onclick="adjStk('${no}','${(p?.name || '').replace(/'/g, "\\'")}',${p?.stock || 0})">調庫存</button>`
  );
}
window.showProd = showProd;
async function showMobileProd(no) {
  $('main').innerHTML='<div class="ld"><div class="sp"></div>載入中…</div>';
  const { data: p } = await sb.from('products').select('*').eq('product_no', no).single();
  const { data: soItemsRaw } = await sb.from('sales_order_items').select('order_no,qty,unit_price,amount,gift_qty').eq('product_no',no).limit(300);
  const { data: poItemsRaw } = await sb.from('purchase_order_items').select('po_no,qty,gift_qty,unit_price,amount,received_qty').eq('product_no',no).limit(300);
  const { data: lnItems } = await sb.from('loan_order_items').select('loan_no,qty,returned_qty').eq('product_no',no).order('loan_no',{ascending:false}).limit(10);
  const { data: adjLogs } = await sb.from('audit_logs').select('description,created_at,operator').eq('table_name','products').eq('record_id',no).eq('action','adjust').order('created_at',{ascending:false}).limit(10);
  const soNosAll=(soItemsRaw||[]).map(x=>x.order_no).filter(Boolean);
  const poNosAll=(poItemsRaw||[]).map(x=>x.po_no).filter(Boolean);
  const lnNos=(lnItems||[]).map(x=>x.loan_no).filter(Boolean);
  const [soMap,poMap,lnMap]=[{},{},{}];
  if(soNosAll.length){const{data:sos}=await sb.from('sales_orders').select('order_no,order_date,customer_name,payment_done').in('order_no',soNosAll);(sos||[]).forEach(x=>soMap[x.order_no]=x);}
  if(poNosAll.length){const{data:pos}=await sb.from('purchase_orders').select('po_no,po_date,vendor_name,receipt_status').in('po_no',poNosAll);(pos||[]).forEach(x=>poMap[x.po_no]=x);}
  if(lnNos.length){const{data:lns}=await sb.from('loan_orders').select('loan_no,loan_date,customer_name,direction,return_status').in('loan_no',lnNos);(lns||[]).forEach(x=>lnMap[x.loan_no]=x);}
  const soItems=(soItemsRaw||[]).slice().sort((a,b)=>(soMap[b.order_no]?.order_date||'').localeCompare(soMap[a.order_no]?.order_date||'')).slice(0,15);
  const poItems=(poItemsRaw||[]).slice().sort((a,b)=>(poMap[b.po_no]?.po_date||'').localeCompare(poMap[a.po_no]?.po_date||'')).slice(0,10);
  showProdPage(p, soItems, poItems, lnItems, adjLogs, soMap, poMap, lnMap);
}
window.showMobileProd = showMobileProd;
async function editProdByNo(no){
  const{data:p}=await sb.from('products').select('*').eq('product_no',no).single();
  if(p) eProd(p);
}
window.editProdByNo = editProdByNo;
window.svcUnitHint = function(sel) {
  const u = sel.value;
  const lblS = document.getElementById('lbl-super');
  const lblQ = document.getElementById('lbl-defqty');
  const inp = document.getElementById('f-psuperunit');
  if(lblS) lblS.textContent = u==='ml'?'每瓶/盒總容量（ml）':'1盒/瓶包含幾個服務單位';
  if(lblQ) lblQ.textContent = u==='ml'?'每次服務用量（ml）':'每次服務用幾個';
  if(inp) { inp.step = u==='ml'?'10':'1'; }
  updateSvcHintCalc();
};
window.updateSvcHintCalc = function() {
  const u = document.getElementById('f-psunit')?.value||'';
  const t = parseFloat(document.getElementById('f-psuperunit')?.value)||0;
  const q = parseFloat(document.getElementById('f-psdefqty')?.value)||1;
  const hint = document.getElementById('svc-hint-calc');
  if(!hint) return;
  if(!u) { hint.textContent='選擇服務單位後會顯示換算說明'; return; }
  const n = Math.floor(t/q);
  hint.textContent = u==='ml'
    ? '💡 '+t+'ml ÷ 每次'+q+'ml ≈ 1瓶可服務 '+n+' 次'
    : '💡 1盒含 '+t+' '+u+'，每次用 '+q+' '+u+' → 可服務 '+n+' 次';
};
window.toggleProd = toggleProd;
window.previewProdImg=previewProdImg;
async function showProdSrcSettings() {
  const srcs   = window._prodAllSrcs  || [];
  const ord    = window._prodSrcOrd   || {};
  const hidden = window._prodSrcHidden|| [];
  if (!srcs.length) { toast('目前無來源資料','w'); return; }

  const sorted = srcs.slice().sort((a,b) => (ord[a]||99)-(ord[b]||99) || a.localeCompare(b));
  const rows = sorted.map(s => {
    const isHid = hidden.includes(s);
    return `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--bd);${isHid?'opacity:.5':''}">
      <input type="number" id="psord-${s}" value="${ord[s]||99}" min="1" max="99"
        style="width:46px;padding:4px;border:1px solid var(--bd);border-radius:var(--r);font-size:12px;text-align:center">
      <label style="flex:1;display:flex;align-items:center;gap:6px;cursor:pointer">
        <input type="checkbox" id="psvis-${s}" ${!isHid?'checked':''} style="width:14px;height:14px">
        <span style="font-weight:500">${s}</span>
        ${isHid?'<span class="badge br2" style="font-size:10px">已停用</span>':''}
      </label>
    </div>`;
  }).join('');

  OM('商品來源設定', `
  <div style="font-size:12px;color:var(--tx3);margin-bottom:12px">
    數字設排序（1=最前）；不勾 = 停用該來源（Tab 隱藏，商品從列表消失）。
  </div>
  ${rows}`,
  `<button class="btn" onclick="CM()">取消</button>
   <button class="btn btn-p" onclick="saveProdSrcSettings()">儲存</button>`);
}
async function saveProdSrcSettings() {
  const srcs = window._prodAllSrcs || [];
  const newOrd = {}, newHidden = [];
  srcs.forEach(s => {
    const ordEl = document.getElementById('psord-'+s);
    const visEl = document.getElementById('psvis-'+s);
    if (ordEl) newOrd[s] = parseInt(ordEl.value)||99;
    if (visEl && !visEl.checked) newHidden.push(s);
  });
  await sb.from('settings').upsert({
    key: 'prod_src_order',
    value: JSON.stringify({order:newOrd, hidden:newHidden}),
    updated_at: new Date().toISOString()
  });
  toast('設定已儲存');
  CM();
  window._prodSrcOrd    = newOrd;
  window._prodSrcHidden = newHidden;
  products();
}
window.showProdSrcSettings = showProdSrcSettings;
window.saveProdSrcSettings = saveProdSrcSettings;