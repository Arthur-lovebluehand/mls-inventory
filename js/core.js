// ═══════════════════════════════════════
// MLS 進銷存系統 - 核心模組
// 重構階段 1：全部 JS 暫時集中此處
// ═══════════════════════════════════════


const SURL='https://tctqjjzokixjktiokvtt.supabase.co';
const SKEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjdHFqanpva2l4amt0aW9rdnR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0OTQ0MjksImV4cCI6MjA5OTA3MDQyOX0.guft3uykLi7yUOakmlu9yOR3Or-3bk2gwC4Bd7zXnQ0';
let sb, _cp;

// boot
window._ime=false;
document.addEventListener('compositionstart',()=>window._ime=true);
document.addEventListener('compositionend',()=>{window._ime=false;});
window.addEventListener('error',e=>{
  const m=document.getElementById('main');
  if(m&&m.innerHTML.includes('sp')){m.innerHTML='<div class="ld" style="flex-direction:column;gap:12px"><span style="color:var(--rd)">JS錯誤：'+e.message+'</span><span style="font-size:12px;color:var(--tx3)">'+e.filename+' 行'+e.lineno+'</span></div>';}
});
(function(){
  const s=document.createElement('script');
  s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
  s.onload=()=>{
    try{
      sb=supabase.createClient(SURL,SKEY);
    }catch(e){
      document.getElementById('main').innerHTML='<div class="ld" style="color:var(--rd)">Supabase 初始化失敗：'+e.message+'</div>';
      return;
    }
    document.querySelectorAll('.ni').forEach(el=>el.addEventListener('click',()=>go(el.dataset.p)));
    document.getElementById('modal').addEventListener('click',e=>{if(e.target.id==='modal')CM();});
    // Logo 從 Supabase 載入（sb 已就緒）
    if(typeof initLogo==='function') initLogo();
    // 預載類別（sb 已就緒後才呼叫）
    if(typeof loadCats==='function') loadCats().catch(()=>{});
    document.getElementById('modal2').addEventListener('click',e=>{if(e.target.id==='modal2')CM2();});
    try{sb.channel('rt').on('postgres_changes',{event:'*',schema:'public',table:'products'},()=>{if(_cp)_cp();}).on('postgres_changes',{event:'*',schema:'public',table:'sales_orders'},()=>{if(_cp)_cp();}).subscribe();}catch(e){}
    loadPayMethods().then(()=>go('dashboard'));
  };
  s.onerror=()=>{document.getElementById('main').innerHTML='<div class="ld" style="color:var(--rd)">無法載入Supabase Library，請檢查網路</div>';};
  document.head.appendChild(s);
})();

// ── nav ──
// pages 動態建立（所有模組載入後才呼叫 go()，所以函數都存在）
function _getPages(){
  return {
    dashboard,products,orders,purchase,customers,loans,
    accounts,bonus,vendors,
    promotions:()=>window.promotions?.(),
    loanParties:()=>window.loanParties?.(),
    auditLogs:()=>window.auditLogs?.(),
    brands:()=>window.brands?.(),
    categories:()=>window.categories?.()
  };
}

function go(p){
  const pages=_getPages();
  document.querySelectorAll('.ni').forEach(el=>el.classList.toggle('on',el.dataset.p===p));
  document.getElementById('main').innerHTML='<div class="ld"><div class="sp"></div>載入中…</div>';
  _cp=pages[p]; pages[p]?.();
}

// ── modal ──
function CM(){document.getElementById('modal').classList.remove('open');}
function CM2(){document.getElementById('modal2').classList.remove('open');}
function OM2(title,body,foot){
  document.getElementById('m2title').textContent=title;
  document.getElementById('m2body').innerHTML=body;
  document.getElementById('m2foot').innerHTML=foot||'<button class="btn" onclick="CM2()">關閉</button>';
  document.getElementById('modal2').classList.add('open');
}
function OM(title,body,foot,lg){
  document.getElementById('mtitle').textContent=title;
  document.getElementById('mbody').innerHTML=body;
  document.getElementById('mfoot').innerHTML=foot||'<button class="btn" onclick="CM()">關閉</button>';
  const md=document.getElementById('md');
  md.className='md'+(lg?' md-lg':'');
  document.getElementById('modal').classList.add('open');
}

// ── toast ──
let _tt;
function toast(msg,t){
  const el=document.getElementById('toast');
  el.textContent=msg;
  el.style.background=t==='e'?'var(--rd)':t==='w'?'var(--am)':'#1e4d1e';
  el.classList.add('on');
  clearTimeout(_tt);_tt=setTimeout(()=>el.classList.remove('on'),2800);
}

// ── helpers ──
const $=id=>document.getElementById(id);

// 裝置 ID（第一次產生後存 localStorage）
function getDeviceId(){
  let did=localStorage.getItem('mls_did');
  if(!did){did='D-'+Date.now().toString(36).toUpperCase();localStorage.setItem('mls_did',did);}
  return did;
}

// 操作日誌
async function logAction(action, tableName, recordId, desc, oldVal=null, newVal=null){
  try{
    await sb.from('audit_logs').insert({
      action, table_name:tableName, record_id:recordId,
      description:desc,
      old_values:oldVal?JSON.stringify(oldVal):null,
      new_values:newVal?JSON.stringify(newVal):null,
      device_id:getDeviceId(),
      operator:localStorage.getItem('mls_operator')||('裝置'+getDeviceId().slice(-4))
    });
  }catch(e){ console.warn('log failed',e); } // 記錄失敗不影響主流程
}

// 產生當日流水號，例如 PO-20260806-003
async function genNo(prefix, table, noField){
  const td=today().replace(/-/g,'');
  const prefix_full=prefix+'-'+td+'-';
  // 查今天已有幾張
  const{data}=await sb.from(table).select(noField).like(noField, prefix_full+'%');
  const max=(data||[]).reduce((m,r)=>{
    const n=parseInt((r[noField]||'').replace(prefix_full,''));
    return isNaN(n)?m:Math.max(m,n);
  },0);
  return prefix_full+String(max+1).padStart(3,'0');
}
const v=id=>{const el=$('f-'+id);return el?el.value.trim():'';}
const n=id=>{const x=parseFloat($('f-'+id)?.value);return isNaN(x)?null:x;}
const fM=x=>x==null?'—':'$'+Math.round(Number(x)||0).toLocaleString('zh-TW');
const fN=x=>x==null?'—':Number(x).toLocaleString('zh-TW');
const fD=x=>x?x.slice(0,10):'—';
const today=()=>new Date().toISOString().slice(0,10);
const ym=d=>(d||today()).slice(0,7);

const LEVELS=['創始','大區','市代','經銷','VIP','零售'];
const LEVEL_COLS={創始:'price_founder',大區:'price_region',市代:'price_city',經銷:'price_dealer',VIP:'price_vip',零售:'price_retail'};
function lvBadge(l){
  const cls={創始:'bbr',大區:'bbr',市代:'bb',經銷:'bg',VIP:'ba',零售:'bgr'};
  return `<span class="badge ${cls[l]||'bgr'}">${l||'—'}</span>`;
}
function skCls(n){return n<=0?'ze':n<=5?'lw':'ok';}
function fi(id,lbl,type,val,ph){return `<div class="fl"><label>${lbl}</label><input id="f-${id}" type="${type||'text'}" value="${(val||'').toString().replace(/"/g,'&quot;')}" placeholder="${ph||''}"></div>`;}
function fs(id,lbl,opts,val){return `<div class="fl"><label>${lbl}</label><select id="f-${id}">${opts.map(o=>`<option value="${o}" ${o==val?'selected':''}>${o}</option>`).join('')}</select></div>`;}
function fa(id,lbl,val){return `<div class="fl"><label>${lbl}</label><textarea id="f-${id}" rows="2">${val||''}</textarea></div>`;}

// ── Searchable Select Component ──
// Creates a searchable product picker
// id: unique id, items: [{value,label,data}], onSelect: fn(value,data)
let _ssState={};
function createSS(id,items,placeholder,selectedVal){
  const sel=items.find(x=>x.value===selectedVal);
  return `<div class="ss-wrap" id="ss-${id}">
    <input class="ss-input" id="ss-inp-${id}" placeholder="${placeholder||'搜尋…'}" value="${sel?sel.label:''}" autocomplete="off"
      oninput="ssFilter('${id}',this.value)"
      onfocus="ssOpen('${id}')"
      onblur="setTimeout(()=>ssClose('${id}'),350)">
    <input type="hidden" id="ss-val-${id}" value="${selectedVal||''}">
    <div class="ss-drop" id="ss-drop-${id}"></div>
  </div>`;
}
function ssOpen(id){
  _ssState[id]=_ssState[id]||{};
  ssFilter(id,$('ss-inp-'+id).value);
  $('ss-drop-'+id).classList.add('open');
}
function ssClose(id){$('ss-drop-'+id)?.classList.remove('open');}
function ssFilter(id,q){
  const items=_ssState[id]?.items||[];
  const filtered=q?items.filter(x=>x.label.toLowerCase().includes(q.toLowerCase())):items;
  const drop=$('ss-drop-'+id);
  if(!drop)return;
  if(!filtered.length){drop.innerHTML=`<div class="ss-opt no">無符合結果</div>`;return;}
  drop.innerHTML=filtered.slice(0,50).map(x=>`<div class="ss-opt" onmousedown="ssPick('${id}','${x.value.replace(/'/g,"\\'")}','${x.label.replace(/'/g,"\\'")}')">${x.label}</div>`).join('');
}
function ssPick(id,val,lbl){
  $('ss-val-'+id).value=val;
  $('ss-inp-'+id).value=lbl;
  ssClose(id);
  if(_ssState[id]?.onChange) _ssState[id].onChange(val);
}
function ssGet(id){return $('ss-val-'+id)?.value||'';}
function ssInit(id,items,onChange){_ssState[id]={items,onChange};}

// ── DASHBOARD ──
async function dashboard(){
  try{
    const[r1,r2,r3,r4,r5,r6,r7,r8]=await Promise.all([
      sb.from('products').select('*',{count:'exact',head:true}).not('product_no','is',null),
      sb.from('sales_orders').select('*',{count:'exact',head:true}),
      sb.from('customers').select('*',{count:'exact',head:true}),
      sb.from('products').select('name,spec,stock').lte('stock',5).gt('stock',0).order('stock').limit(8),
      sb.from('products').select('name,spec').eq('stock',0).not('product_no','is',null).limit(8),
      sb.from('sales_orders').select('order_no,order_date,customer_name,total,payment_done').order('order_date',{ascending:false}).limit(6),
      sb.from('sales_orders').select('year_month,total,payment_done').not('year_month','is',null),
      sb.from('purchase_orders').select('year_month,total').not('year_month','is',null),
    ]);
    const oos=r5.data||[],ls=r4.data||[],rec=r6.data||[];
    // 從銷售和進貨直接計算月度收支
    const _normYM=ym=>ym?ym.replace(/\//g,'-').replace(/^(\d{4})-(\d)$/,'$1-0$2'):'';
    const _monMap={};
    (r7.data||[]).forEach(o=>{const k=_normYM(o.year_month);if(!k)return;_monMap[k]=_monMap[k]||{in:0,out:0};if(o.payment_done)_monMap[k].in+=Number(o.total||0);});
    (r8.data||[]).forEach(p=>{const k=_normYM(p.year_month);if(!k)return;_monMap[k]=_monMap[k]||{in:0,out:0};_monMap[k].out+=Number(p.total||0);});
    const mon=Object.entries(_monMap).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,6).map(([k,v])=>({month:k,income:v.in,expense:v.out,total:v.in-v.out}));
    $('main').innerHTML=`
    <div class="ph"><div><div class="pt">總覽儀表板</div><div class="ps">即時同步中</div></div></div>
    <div class="pc">
      <div class="mg">
        <div class="mc"><div class="ml">商品種類</div><div class="mv cg">${r1.count||0}</div><div class="ms">項</div></div>
        <div class="mc"><div class="ml">歷史訂單</div><div class="mv cb">${r2.count||0}</div><div class="ms">張</div></div>
        <div class="mc"><div class="ml">客戶數</div><div class="mv cbr">${r3.count||0}</div><div class="ms">位</div></div>
        <div class="mc" onclick="showRestockList()" style="cursor:pointer;border:1px solid var(--rd)" title="點擊查看補貨清單">
          <div class="ml">需補貨</div>
          <div class="mv cr">${oos.length+ls.length}</div>
          <div class="ms">項 ▸ 點擊查看</div>
        </div>
      </div>
      ${oos.length?`<div class="al al-e"><b>庫存歸零（${oos.length}）：</b>${oos.map(p=>p.name+(p.spec?` (${p.spec})`:'')).join('、')}</div>`:''}
      ${ls.length?`<div class="al al-w"><b>低庫存（${ls.length}）：</b>${ls.map(p=>`${p.name} <b>${p.stock}</b>件`).join('、')}</div>`:''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div class="tc"><div class="tb"><span class="tt">最近訂單</span><button class="btn btn-s" onclick="go('orders')">全部</button></div>
          <div class="tw"><table><tr><th>訂單號</th><th>客戶</th><th>金額</th><th>收款</th></tr>
          ${rec.map(o=>`<tr style="cursor:pointer" onclick="showOrder('${o.order_no}')"><td style="font-size:11px;color:var(--tx2)">${o.order_no}</td><td>${o.customer_name||'—'}</td><td class="num">${fM(o.total)}</td><td><span class="badge ${o.payment_done?'bg':'br2'}">${o.payment_done?'已收':'未收'}</span></td></tr>`).join('')}
          </table></div></div>
        <div class="tc"><div class="tb"><span class="tt">月度收支</span><button class="btn btn-s" onclick="go('accounts')">全部</button></div>
          <div class="tw"><table><tr><th>月份</th><th>收入</th><th>支出</th><th>結餘</th></tr>
          ${mon.map(m=>`<tr><td>${m.month}</td><td class="num ok">${fM(m.income)}</td><td class="num cr">${fM(m.expense)}</td><td class="num" style="font-weight:600">${fM(m.total)}</td></tr>`).join('')}
          </table></div></div>
      </div>
    </div>`;
  }catch(e){$('main').innerHTML=`<div class="ld" style="color:var(--rd)">載入失敗：${e.message}</div>`;}
}

// ── PRODUCTS ──
let pS='',pP=1,pShowInactive=false,pSrc='';


// ── ORDERS ──
let oS='',oP=1,oF='all';


// 列印出貨單


// 新增訂單
let _items=[], _allProds=[], _allCusts=[];


window.filterItemDrop=(id,q)=>{
  const drop=$('idrop-'+id);if(!drop)return;
  const fil=q?_allProds.filter(p=>p.name.includes(q)||(p.product_no||'').includes(q)||(p.spec||'').includes(q)):_allProds;
  drop.style.display='block';
  drop.innerHTML=fil.slice(0,30).map(p=>`<div style="padding:6px 9px;font-size:12px;cursor:pointer" onmouseover="this.style.background='var(--acl)'" onmouseout="this.style.background=''" onmousedown="pickItem(${id},'${p.product_no.replace(/'/g,"\\'")}','${p.name.replace(/'/g,"\\'")}')">
    ${p.name}${p.spec?` (${p.spec})`:''} <span style="color:var(--tx3)">庫存:${p.stock}</span>
  </div>`).join('')||'<div style="padding:6px 9px;font-size:12px;color:var(--tx3)">無結果</div>';
};
window.closeItemDrop=id=>{const d=$('idrop-'+id);if(d)d.style.display='none';};
window.pickItem=(id,pno,name)=>{
  const it=_items.find(x=>x.id===id);if(!it)return;
  it.pno=pno; it._pname=name;
  const p=_allProds.find(x=>x.product_no===pno);
  if(p){
    const lv=v('oalv')||'零售';
    const col=LEVEL_COLS[lv]||'price_retail';
    it.price=p[col]||p.price_retail||0;
  }
  it.amt=it.qty*(it.price||0);
  // 只更新搜尋框文字，不重繪（避免焦點跳掉）
  const srch=$('isrch-'+id);
  if(srch) srch.value=name;
  closeItemDrop(id);
  updAmt();
};
window.addItem=()=>{_items.push({id:Date.now(),pno:'',_pname:'',qty:1,price:0,giftQty:0,amt:0});renderItems();};
window.rmItem=id=>{_items=_items.filter(x=>x.id!==id);renderItems();};
window.setIQ=(id,val)=>{const it=_items.find(x=>x.id===id);if(it){it.qty=Math.max(1,+val||1);it.amt=it.qty*it.price;}renderItems();};
window.setIV=(id,val)=>{const it=_items.find(x=>x.id===id);if(it){it.price=+val||0;it.amt=it.qty*it.price;}renderItems();};
window.setIG=(id,val)=>{const it=_items.find(x=>x.id===id);if(it)it.giftQty=Math.max(0,+val||0);};


// ── PURCHASE ──
let puP=1, _poItems=[], _poProds=[], _vends2=[];


window.pickVend=vno=>{const v=_vends2.find(x=>x.vendor_no===vno);if(v)$('f-povname').value=v.name;};

window._getPoItems=()=>_poItems;
window._setPoItems=(v)=>{_poItems=v;};
window._renderPOItems=()=>renderPOItems();
// expose vendor management
if(typeof addVend!=='undefined') window.addVend=addVend;
if(typeof eVend!=='undefined') window.eVend=eVend;
if(typeof saveVend!=='undefined') window.saveVend=saveVend;
if(typeof setVendorSort!=='undefined') window.setVendorSort=setVendorSort;
if(typeof toggleVendor!=='undefined') window.toggleVendor=toggleVendor;
if(typeof deleteVendor!=='undefined') window.deleteVendor=deleteVendor;


window.filterPODrop=(id,q)=>{const drop=$('podrop-'+id);if(!drop)return;drop.style.display='block';const fil=q?_poProds.filter(p=>p.name.includes(q)||(p.product_no||'').includes(q)):_poProds;drop.innerHTML=fil.slice(0,30).map(p=>`<div style="padding:6px 9px;font-size:12px;cursor:pointer" onmouseover="this.style.background='var(--acl)'" onmouseout="this.style.background=''" onmousedown="pickPOItem(${id},'${p.product_no.replace(/'/g,"\\'")}','${p.name.replace(/'/g,"\\'")}',${p.cost||0})">${p.name}${p.spec?` (${p.spec})`:''}</div>`).join('')||'<div style="padding:6px 9px;font-size:12px;color:var(--tx3)">無結果</div>';};
window.closePODrop=id=>{const d=$('podrop-'+id);if(d)d.style.display='none';};
window.pickPOItem=(id,pno,name,cost)=>{
  const it=_poItems.find(x=>x.id===id);if(!it)return;
  it.pno=pno; it._pname=name; it.price=cost||0; it.amt=it.qty*it.price;
  const srch=$('posrch-'+id);
  if(srch) srch.value=name;
  closePODrop(id);
  updPOAmt();
};
window.addPOItem=()=>{_poItems.push({id:Date.now(),pno:'',qty:1,price:0,amt:0});renderPOItems();};
window.rmPOItem=id=>{_poItems=_poItems.filter(x=>x.id!==id);renderPOItems();};
window.setPOIQ=(id,val)=>{const it=_poItems.find(x=>x.id===id);if(it){it.qty=Math.max(1,+val||1);it.amt=it.qty*it.price;}renderPOItems();};
window.setPOIV=(id,val)=>{const it=_poItems.find(x=>x.id===id);if(it){it.price=+val||0;it.amt=it.qty*it.price;}renderPOItems();};
window.setPOIG=(id,val)=>{const it=_poItems.find(x=>x.id===id);if(it){it.giftQty=Math.max(0,+val||0);}updPOAmt();};


// ── CUSTOMERS ──
let cS='',cP=1;


// ── VENDORS ──


// ── LOANS ──
let _loanItems=[], _loanProds=[];
let lFilter='all';


window.filterLoanDrop=(id,q)=>{const drop=$('ldrop-'+id);if(!drop)return;drop.style.display='block';const fil=q?_loanProds.filter(p=>p.name.includes(q)||(p.product_no||'').includes(q)):_loanProds;drop.innerHTML=fil.slice(0,30).map(p=>`<div style="padding:6px 9px;font-size:12px;cursor:pointer" onmouseover="this.style.background='var(--acl)'" onmouseout="this.style.background=''" onmousedown="pickLoanItem(${id},'${p.product_no.replace(/'/g,"\\'")}','${p.name.replace(/'/g,"\\'")}')">
  ${p.name}${p.spec?` (${p.spec})`:''} <span style="color:var(--tx3)">庫存:${p.stock}</span></div>`).join('')||'<div style="padding:6px 9px;font-size:12px;color:var(--tx3)">無結果</div>';};
window.closeLoanDrop=id=>{const d=$('ldrop-'+id);if(d)d.style.display='none';};
window.pickLoanItem=(id,pno,name)=>{const it=_loanItems.find(x=>x.id===id);if(it){it.pno=pno;}renderLoanItems();const inp=document.querySelector(`#ldrop-${id}`)?.previousElementSibling;if(inp)inp.value=name;closeLoanDrop(id);};
window.addLoanItem=()=>{_loanItems.push({id:Date.now(),pno:'',qty:1});renderLoanItems();};
window.rmLoanItem=id=>{_loanItems=_loanItems.filter(x=>x.id!==id);renderLoanItems();};
window.setLoanIQ=(id,val)=>{const it=_loanItems.find(x=>x.id===id);if(it)it.qty=Math.max(1,+val||1);};


// ── BONUS ──
let bnP=1;


// ── ACCOUNTS ──


async function loadPayMethods(){
  const{data}=await sb.from('payment_methods').select('name').eq('is_active',true).order('sort_order');
  if(data&&data.length) _payMethods=data.map(x=>x.name);
}

function payMethodSel(id,val){
  return `<div class="fl"><label>付款方式</label><select id="f-${id}">${_payMethods.map(m=>`<option value="${m}" ${m===val?'selected':''}>${m}</option>`).join('')}</select></div>`;
}

// expose for inline
Object.assign(window,{showOrder,showPO,showCust,showVend,showLoan,addProd,eProd,dProd,adjStk,saveProd,doAdj,addOrder,editOrder,saveOrder,togglePay,dOrder,printOrder,addPO,editPO,savePO,togglePO,addCust,eCust,saveCust,addVend,eVend,saveVend,addLoan,returnLoan,doReturn,addBonus,saveBonus,toggleBonus,dBonus,CM});


// ═══════════════════════════════════════════
//  手機版商品詳情：獨立頁面（Responsive Modal）
// ═══════════════════════════════════════════


// ════════════════════════════════════════
//  套組/活動系統 (Promotions Module)
// ════════════════════════════════════════

// ── 套組管理頁面 ──


// ── 新增/編輯套組 ──
let _promoItems = [], _allProdsForPromo = [];


window.updatePromoFields = () => {
  const t = $('f-ptype')?.value || '固定套組';
  const ef = $('promo-extra-fields');
  if (ef) ef.innerHTML = promoExtraFields({ type: t });
};


window.filterPromoDrop = (id, q) => {
  const drop = $('prodrop-' + id); if (!drop) return;
  const fil = q ? _allProdsForPromo.filter(p => p.name.includes(q) || (p.product_no || '').includes(q)) : _allProdsForPromo;
  drop.style.display = 'block';
  drop.innerHTML = fil.slice(0, 30).map(p =>
    `<div style="padding:6px 9px;font-size:12px;cursor:pointer" onmouseover="this.style.background='var(--acl)'" onmouseout="this.style.background=''"
      onmousedown="pickPromoItem(${id},'${p.product_no.replace(/'/g,"\\'")}','${p.name.replace(/'/g,"\\'")}')">
      ${p.name}${p.spec ? ` (${p.spec})` : ''} <span style="color:var(--tx3)">庫存:${p.stock}</span>
    </div>`).join('') || '<div style="padding:6px 9px;font-size:12px;color:var(--tx3)">無結果</div>';
};
window.closePromoDrop = id => { const d = $('prodrop-' + id); if (d) d.style.display = 'none'; };
window.pickPromoItem = (id, pno, name) => {
  const it = _promoItems.find(x => x.id === id); if (!it) return;
  it.pno = pno; it.name = name;
  renderPromoItems();
  closePromoDrop(id);
};
window.addPromoItem = () => { _promoItems.push({ id: Date.now(), pno: '', name: '', qty: 1, is_gift: false, price_override: null }); renderPromoItems(); };
window.rmPromoItem = id => { _promoItems = _promoItems.filter(x => x.id !== id); renderPromoItems(); };
window.setPromoIQ = (id, val) => { const it = _promoItems.find(x => x.id === id); if (it) it.qty = Math.max(1, +val || 1); };
window.setPromoIV = (id, val) => { const it = _promoItems.find(x => x.id === id); if (it) it.price_override = +val || null; };
window.setPromoIG = (id, checked) => { const it = _promoItems.find(x => x.id === id); if (it) it.is_gift = checked; };


// ── 在訂單/進貨/借貨新增表單中：選用套組 ──


window.addPromoItem = addPromoItem;
window.updatePromoFields = updatePromoFields;


// ════════════════════════
//  盤點單列印功能
// ════════════════════════


// ════════════════════════════
//  拆袋/拆箱作業
// ════════════════════════════
let _splitItems = [], _splitProds = [];


window.filterSplitDrop = (id, q) => {
  const drop = $('sdrop-'+id); if(!drop) return;
  const fil = q ? _splitProds.filter(p=>p.name.includes(q)||(p.product_no||'').includes(q)) : _splitProds;
  drop.style.display = 'block';
  drop.innerHTML = fil.slice(0,30).map(p=>
    `<div style="padding:6px 9px;font-size:12px;cursor:pointer"
      onmouseover="this.style.background='var(--acl)'" onmouseout="this.style.background=''"
      onmousedown="pickSplitItem(${id},'${p.product_no.replace(/'/g,"\\'")}','${p.name.replace(/'/g,"\\'")}')">
      ${p.name}${p.spec?` (${p.spec})`:''} <span style="color:var(--tx3)">庫存:${p.stock}</span>
    </div>`
  ).join('') || '<div style="padding:6px 9px;font-size:12px;color:var(--tx3)">無結果</div>';
};
window.closeSplitDrop = id => { const d=$('sdrop-'+id); if(d) d.style.display='none'; };
window.pickSplitItem = (id, pno, name) => {
  const it = _splitItems.find(x=>x.id===id); if(!it) return;
  it.pno = pno; it.name = name;
  renderSplitItems();
  closeSplitDrop(id);
};
window.addSplitItem = () => { _splitItems.push({id:Date.now(),pno:'',name:'',qty:1}); renderSplitItems(); };
window.rmSplitItem = id => { _splitItems=_splitItems.filter(x=>x.id!==id); renderSplitItems(); };
window.setSplitIQ = (id, val) => { const it=_splitItems.find(x=>x.id===id); if(it) it.qty=Math.max(1,+val||1); };


// ── 漢堡選單 / 手機側欄 ──
function openSidebar(){
  document.querySelector('.sdb')?.classList.add('open');
  document.getElementById('sdbOverlay')?.classList.add('open');
  document.body.style.overflow='hidden';
}
function closeSidebar(){
  document.querySelector('.sdb')?.classList.remove('open');
  document.getElementById('sdbOverlay')?.classList.remove('open');
  document.body.style.overflow='';
}
// 點選選單項目後自動關閉側欄
document.querySelectorAll('.ni').forEach(el=>{
  el.addEventListener('click',()=>{ if(window.innerWidth<=768) closeSidebar(); });
});

// 在 page header 插入漢堡按鈕（手機版才顯示）
const _origGo = window.go;
// 覆寫 go，每次渲染後插入漢堡按鈕
// 漢堡按鈕已改為固定位置 #mobile-topbar，不再動態注入

window.CM2=CM2; window.OM2=OM2; window.delCust=delCust;
 window.confirmBadDebt=confirmBadDebt; window.toggleBadDebt=toggleBadDebt;
window.openSidebar=openSidebar;
window.closeSidebar=closeSidebar;


// ════════════════════════════
//  商品查看詳情 (showProd)
// ════════════════════════════


// 手機版獨立頁面（直接 fetch + 渲染）


window.switchProdTab = function(tab){
  ['s','p','l','a'].forEach(t=>{
    const btn=document.getElementById('ptab-'+t);
    const con=document.getElementById('ptab-'+t+'-con');
    if(btn) btn.className='tab'+(t===tab?' on':'');
    if(con) con.style.display=t===tab?'block':'none';
  });
};


// ════════════════════════════
//  LOGO 管理（存在 localStorage）
// ════════════════════════════
function changeLogo(){
  document.getElementById('logo-file')?.click();
}
function handleLogoUpload(input){
  const file=input.files[0]; if(!file)return;
  const reader=new FileReader();
  reader.onload=async e=>{
    const src=e.target.result;
    applyLogo(src);
    // 同步存到 Supabase（所有裝置都能用）
    try{
      await sb.from('settings').upsert({key:'logo',value:src,updated_at:new Date().toISOString()});
      toast('LOGO 已儲存並同步到所有裝置');
    }catch(err){
      // fallback: 只存 localStorage
      localStorage.setItem('mls_logo', src);
      toast('LOGO 已儲存（僅此裝置）','w');
    }
  };
  reader.readAsDataURL(file);
}
function applyLogo(src){
  if(!src) return;
  console.log('[Logo] applyLogo called, src length:', src?.length);
  // 側欄 logo
  const img=document.getElementById('logo-img');
  const ph=document.getElementById('logo-placeholder');
  if(img){ img.src=src; img.style.display='block'; if(ph) ph.style.display='none'; }
  // 手機頂部 logo
  const mImg=document.getElementById('mobile-logo-img');
  const mTxt=document.getElementById('mobile-logo-text');
  if(mImg){ mImg.src=src; mImg.style.display='block'; if(mTxt) mTxt.style.display='none'; }
}
// 從 Supabase 載入 LOGO（跨裝置同步）
async function initLogo(){
  try{
    const{data}=await sb.from('settings').select('value').eq('key','logo').single();
    if(data?.value) applyLogo(data.value);
  }catch(e){
    // fallback: localStorage
    const saved=localStorage.getItem('mls_logo');
    if(saved) applyLogo(saved);
  }
}
// initLogo 由 boot 在 sb 初始化後呼叫

window.changeLogo=changeLogo;
window.handleLogoUpload=handleLogoUpload;


// ════════════════════════════════
//  借貨對象名單 (loanParties)
// ════════════════════════════════


// ════════════════════════════════════════
//  進貨退回 + 整筆刪除 + 操作記錄
// ════════════════════════════════════════

// ── 進貨退回 ──


// ── 整筆刪除進貨單 ──


// ── 操作記錄查看頁面 ──
let alP = 1;


function saveOpName() {
  const name = $('op-name')?.value?.trim();
  if (name) { localStorage.setItem('mls_operator', name); toast('操作者名稱已儲存：' + name); }
}


window.saveOpName = saveOpName;


// ═══════════════════════════════
//  獎金查看 / 編輯
// ═══════════════════════════════


// ═══════════════════════════
//  補貨清單功能
// ═══════════════════════════


window._createRestockPO = createRestockPO;


// ════════════════════════════
//  品牌商管理
// ════════════════════════════


 window.addBrand=addBrand; window.editBrand=editBrand;
 window.setBrandSort=setBrandSort;
 window.deleteBrand=deleteBrand;


// ════════════════════════
//  商品頁來源順序設定
// ════════════════════════


// ══════════════════════════════
//  類別管理 + 商品類別下拉選單
// ══════════════════════════════

// 全域類別快取
window._cats = [];


// 類別管理頁面


// 讓商品編輯表單的類別欄改成下拉選單
// 攔截 fi('cat',...) 改為 select
const _origFi = window.fi || null;
window.makeCatSelect = (currentVal) => {
  const cats = window._cats || [];
  const opts = [...new Set([...cats, currentVal||''].filter(Boolean))].sort();
  return `<div class="fl"><label>類別</label><select id="f-cat"
    style="width:100%;padding:7px 8px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;background:var(--sf);outline:none">
    <option value="">— 選擇類別 —</option>
    ${opts.map(c=>`<option value="${c}" ${c===currentVal?'selected':''}>${c}</option>`).join('')}
    <option value="__new__">＋ 新增類別…</option>
  </select></div>`;
};


// loadCats 由 categories() 頁面或 prodForm 需要時才呼叫


// 進貨廠商排序設定