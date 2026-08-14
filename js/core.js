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
    // Auth 檢查（用 localStorage token）
    if (!isLoggedIn()) {
      showLoginPage();
      return;
    }
    loadPayMethods().then(() => go('dashboard'));
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
    categories:()=>window.categories?.(),
    serviceHub:()=>window.serviceHub?.(),
    dataImport:()=>window.dataImport?.()
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
var _ssState={};
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
var pS='',pP=1,pShowInactive=false,pSrc='';


// ── ORDERS ──
var oS='',oP=1,oF='all';


// 列印出貨單


// 新增訂單
var _items=[], _allProds=[], _allCusts=[];


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
  // 只更新搜尋框文字和金額，不整個重繪（避免焦點跳掉）
  const srch=$('isrch-'+id);
  if(srch) srch.value=name;
  const amtEl=$('iamt-'+id);
  if(amtEl) amtEl.textContent=fM(it.amt);
  closeItemDrop(id);
  updAmt();
};
window.addItem=()=>{_items.push({id:Date.now(),pno:'',_pname:'',qty:1,price:0,giftQty:0,amt:0});renderItems();};
window.rmItem=id=>{_items=_items.filter(x=>x.id!==id);renderItems();};
window.setIQ=(id,val)=>{const it=_items.find(x=>x.id===id);if(it){it.qty=Math.max(0,+val||0);it.amt=it.qty*it.price;}renderItems();};
window.setIV=(id,val)=>{const it=_items.find(x=>x.id===id);if(it){it.price=+val||0;it.amt=it.qty*it.price;}renderItems();};
window.setIG=(id,val)=>{const it=_items.find(x=>x.id===id);if(it)it.giftQty=Math.max(0,+val||0);};


// ── PURCHASE ──
var puP=1, _poItems=[], _poProds=[], _vends2=[];


window.pickVend=vno=>{const v=_vends2.find(x=>x.vendor_no===vno);if(v)$('f-povname').value=v.name;};

window._getPoItems=()=>_poItems;
window._setPoItems=(v)=>{_poItems=v;};
window._renderPOItems=()=>renderPOItems();
// vendors/brands expose 已在 vendors.js 內


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
window.setPOIQ=(id,val)=>{const it=_poItems.find(x=>x.id===id);if(it){it.qty=Math.max(0,+val||0);it.amt=it.qty*it.price;}renderPOItems();};
window.setPOIV=(id,val)=>{const it=_poItems.find(x=>x.id===id);if(it){it.price=+val||0;it.amt=it.qty*it.price;}renderPOItems();};
window.setPOIG=(id,val)=>{const it=_poItems.find(x=>x.id===id);if(it){it.giftQty=Math.max(0,+val||0);}updPOAmt();};


// ── CUSTOMERS ──
var cS='',cP=1;


// ── VENDORS ──


// ── LOANS ──
var _loanItems=[], _loanProds=[];
var lFilter='all';


window.filterLoanDrop=(id,q)=>{const drop=$('ldrop-'+id);if(!drop)return;drop.style.display='block';const fil=q?_loanProds.filter(p=>p.name.includes(q)||(p.product_no||'').includes(q)):_loanProds;drop.innerHTML=fil.slice(0,30).map(p=>`<div style="padding:6px 9px;font-size:12px;cursor:pointer" onmouseover="this.style.background='var(--acl)'" onmouseout="this.style.background=''" onmousedown="pickLoanItem(${id},'${p.product_no.replace(/'/g,"\\'")}','${p.name.replace(/'/g,"\\'")}')">
  ${p.name}${p.spec?` (${p.spec})`:''} <span style="color:var(--tx3)">庫存:${p.stock}</span></div>`).join('')||'<div style="padding:6px 9px;font-size:12px;color:var(--tx3)">無結果</div>';};
window.closeLoanDrop=id=>{const d=$('ldrop-'+id);if(d)d.style.display='none';};
window.pickLoanItem=(id,pno,name)=>{const it=_loanItems.find(x=>x.id===id);if(it){it.pno=pno;}renderLoanItems();const inp=document.querySelector(`#ldrop-${id}`)?.previousElementSibling;if(inp)inp.value=name;closeLoanDrop(id);};
window.addLoanItem=()=>{_loanItems.push({id:Date.now(),pno:'',qty:1});renderLoanItems();};
window.rmLoanItem=id=>{_loanItems=_loanItems.filter(x=>x.id!==id);renderLoanItems();};
window.setLoanIQ=(id,val)=>{const it=_loanItems.find(x=>x.id===id);if(it)it.qty=Math.max(1,+val||1);};


// ── BONUS ──
var bnP=1;


// ── ACCOUNTS ──


async function loadPayMethods(){
  const{data}=await sb.from('payment_methods').select('name').eq('is_active',true).order('sort_order');
  if(data&&data.length) _payMethods=data.map(x=>x.name);
}

function payMethodSel(id,val){
  return `<div class="fl"><label>付款方式</label><select id="f-${id}">${_payMethods.map(m=>`<option value="${m}" ${m===val?'selected':''}>${m}</option>`).join('')}</select></div>`;
}

// expose for inline — 已移至各模組自行 expose


// ═══════════════════════════════════════════
//  手機版商品詳情：獨立頁面（Responsive Modal）
// ═══════════════════════════════════════════


// ════════════════════════════════════════
//  套組/活動系統 (Promotions Module)
// ════════════════════════════════════════

// ── 套組管理頁面 ──


// ── 新增/編輯套組 ──
var _promoItems = [], _allProdsForPromo = [];


// updatePromoFields moved to promotions.js


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
// removed (moved to module) if (d) d.style.display = 'none'; };
// removed (moved to module)
// addPromoItem moved to module renderPromoItems(); };
// removed (moved to module)
// removed (moved to module)
// removed (moved to module)
// removed (moved to module)


// ── 在訂單/進貨/借貨新增表單中：選用套組 ──


// window.addPromoItem — 已在 promotions.js expose
// window.updatePromoFields — 已在 promotions.js expose


// ════════════════════════
//  盤點單列印功能
// ════════════════════════


// ════════════════════════════
//  拆袋/拆箱作業
// ════════════════════════════
var _splitItems = [], _splitProds = [];


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
// removed (moved to module) if(d) d.style.display='none'; };
// removed (moved to module)
// addSplitItem moved to module renderSplitItems(); };
// removed (moved to module)
// removed (moved to module)


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

// CM2/OM2 已在本檔案定義，delCust/confirmBadDebt/toggleBadDebt 已在各自模組 expose
window.openSidebar=openSidebar;
window.closeSidebar=closeSidebar;


// ════════════════════════════
//  商品查看詳情 (showProd)
// ════════════════════════════


// 手機版獨立頁面（直接 fetch + 渲染）


// switchProdTab 已移至 products.js


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
var alP = 1;


function saveOpName() {
  const name = $('op-name')?.value?.trim();
  if (name) { localStorage.setItem('mls_operator', name); toast('操作者名稱已儲存：' + name); }
}


window.saveOpName = saveOpName;

async function logout() {
  if (!confirm('確定要登出嗎？')) return;
  localStorage.removeItem('mls_token');
  localStorage.removeItem('mls_token_exp');
  location.reload();
}
window.logout = logout;


// ═══════════════════════════════
//  獎金查看 / 編輯
// ═══════════════════════════════


// ═══════════════════════════
//  補貨清單功能
// ═══════════════════════════


// window._createRestockPO — 已在 restock.js expose


// ════════════════════════════
//  品牌商管理
// ════════════════════════════


 // window.addBrand — 已在 vendors.js expose // window.editBrand — 已在 vendors.js expose
 // window.setBrandSort — 已在 vendors.js expose
 // window.deleteBrand — 已在 vendors.js expose


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

// ════════════════════════════════════════
//  簡單密碼登入（不依賴 Supabase Auth）
// ════════════════════════════════════════

function isLoggedIn() {
  const token = localStorage.getItem('mls_token');
  const exp   = localStorage.getItem('mls_token_exp');
  if (!token || !exp) return false;
  if (Date.now() > parseInt(exp)) {
    localStorage.removeItem('mls_token');
    localStorage.removeItem('mls_token_exp');
    return false;
  }
  return true;
}

function showLoginPage(errMsg) {
  document.body.style.cssText = 'margin:0;padding:0;font-family:Microsoft JhengHei,sans-serif;background:#f7f5f0;';
  document.body.innerHTML = `
  <div style="min-height:100vh;display:flex;align-items:center;justify-content:center">
    <div style="width:340px;background:#fff;border-radius:16px;padding:40px;box-shadow:0 8px 32px rgba(0,0,0,.12)">
      <div style="text-align:center;margin-bottom:32px">
        <div style="font-size:26px;font-weight:800;color:#5c7a5c;letter-spacing:2px">慢樂仙坊</div>
        <div style="font-size:12px;color:#9e9890;margin-top:6px">進銷存管理系統</div>
      </div>
      <div style="margin-bottom:24px">
        <label style="font-size:13px;color:#6b6560;font-weight:600;display:block;margin-bottom:6px">存取密碼</label>
        <input type="password" id="login-pw" placeholder="請輸入密碼"
          onkeydown="if(event.key==='Enter')doLogin()"
          style="width:100%;padding:11px 14px;border:1.5px solid #e2ddd5;border-radius:7px;font-size:14px;outline:none;box-sizing:border-box">
      </div>
      <button id="login-btn" onclick="doLogin()"
        style="width:100%;padding:13px;background:#5c7a5c;color:#fff;border:none;border-radius:7px;font-size:15px;font-weight:700;cursor:pointer">
        進入系統
      </button>
      ${errMsg ? `<div style="margin-top:12px;color:#c0392b;font-size:13px;text-align:center;background:#fdf0ef;padding:8px;border-radius:7px">${errMsg}</div>` : ''}
    </div>
  </div>`;
}

async function doLogin() {
  const pw  = document.getElementById('login-pw')?.value?.trim();
  const btn = document.getElementById('login-btn');
  if (!pw) { showLoginPage('請輸入密碼'); return; }
  if (btn) { btn.disabled = true; btn.textContent = '驗證中…'; }
  // 計算 MD5
  const hash = pgMd5(pw);
  // 比對 DB
  const { data } = await sb.from('settings').select('value').eq('key','access_password').eq('value', hash).single();
  if (!data) {
    showLoginPage('密碼錯誤，請再試一次');
    return;
  }
  // 正確 → 存 token（12小時）
  localStorage.setItem('mls_token', 'mls_ok_' + Date.now());
  localStorage.setItem('mls_token_exp', Date.now() + 12*60*60*1000);
  location.reload();
}

function pgMd5(str) {
  function safeAdd(x,y){var l=(x&0xFFFF)+(y&0xFFFF),m=(x>>16)+(y>>16)+(l>>16);return(m<<16)|(l&0xFFFF);}
  function rol(n,c){return(n<<c)|(n>>>(32-c));}
  function cmn(q,a,b,x,s,t){return safeAdd(rol(safeAdd(safeAdd(a,q),safeAdd(x,t)),s),b);}
  function ff(a,b,c,d,x,s,t){return cmn((b&c)|((~b)&d),a,b,x,s,t);}
  function gg(a,b,c,d,x,s,t){return cmn((b&d)|(c&(~d)),a,b,x,s,t);}
  function hh(a,b,c,d,x,s,t){return cmn(b^c^d,a,b,x,s,t);}
  function ii(a,b,c,d,x,s,t){return cmn(c^(b|(~d)),a,b,x,s,t);}
  var x=[],i,n=str.length,s2=[1732584193,-271733879,-1732584194,271733878];
  for(i=0;i<n;i++)x[i>>2]|=str.charCodeAt(i)<<((i%4)*8);
  x[n>>2]|=0x80<<((n%4)*8);x[(((n+8)>>6)<<4)+14]=n*8;
  for(i=0;i<x.length;i+=16){
    var a=s2[0],b=s2[1],c=s2[2],d=s2[3];
    a=ff(a,b,c,d,x[i],7,-680876936);d=ff(d,a,b,c,x[i+1],12,-389564586);c=ff(c,d,a,b,x[i+2],17,606105819);b=ff(b,c,d,a,x[i+3],22,-1044525330);
    a=ff(a,b,c,d,x[i+4],7,-176418897);d=ff(d,a,b,c,x[i+5],12,1200080426);c=ff(c,d,a,b,x[i+6],17,-1473231341);b=ff(b,c,d,a,x[i+7],22,-45705983);
    a=ff(a,b,c,d,x[i+8],7,1770035416);d=ff(d,a,b,c,x[i+9],12,-1958414417);c=ff(c,d,a,b,x[i+10],17,-42063);b=ff(b,c,d,a,x[i+11],22,-1990404162);
    a=ff(a,b,c,d,x[i+12],7,1804603682);d=ff(d,a,b,c,x[i+13],12,-40341101);c=ff(c,d,a,b,x[i+14],17,-1502002290);b=ff(b,c,d,a,x[i+15],22,1236535329);
    a=gg(a,b,c,d,x[i+1],5,-165796510);d=gg(d,a,b,c,x[i+6],9,-1069501632);c=gg(c,d,a,b,x[i+11],14,643717713);b=gg(b,c,d,a,x[i],20,-373897302);
    a=gg(a,b,c,d,x[i+5],5,-701558691);d=gg(d,a,b,c,x[i+10],9,38016083);c=gg(c,d,a,b,x[i+15],14,-660478335);b=gg(b,c,d,a,x[i+4],20,-405537848);
    a=gg(a,b,c,d,x[i+9],5,568446438);d=gg(d,a,b,c,x[i+14],9,-1019803690);c=gg(c,d,a,b,x[i+3],14,-187363961);b=gg(b,c,d,a,x[i+8],20,1163531501);
    a=gg(a,b,c,d,x[i+13],5,-1444681467);d=gg(d,a,b,c,x[i+2],9,-51403784);c=gg(c,d,a,b,x[i+7],14,1735328473);b=gg(b,c,d,a,x[i+12],20,-1926607734);
    a=hh(a,b,c,d,x[i+5],4,-378558);d=hh(d,a,b,c,x[i+8],11,-2022574463);c=hh(c,d,a,b,x[i+11],16,1839030562);b=hh(b,c,d,a,x[i+14],23,-35309556);
    a=hh(a,b,c,d,x[i+1],4,-1530992060);d=hh(d,a,b,c,x[i+4],11,1272893353);c=hh(c,d,a,b,x[i+7],16,-155497632);b=hh(b,c,d,a,x[i+10],23,-1094730640);
    a=hh(a,b,c,d,x[i+13],4,681279174);d=hh(d,a,b,c,x[i],11,-358537222);c=hh(c,d,a,b,x[i+3],16,-722521979);b=hh(b,c,d,a,x[i+6],23,76029189);
    a=hh(a,b,c,d,x[i+9],4,-640364487);d=hh(d,a,b,c,x[i+12],11,-421815835);c=hh(c,d,a,b,x[i+15],16,530742520);b=hh(b,c,d,a,x[i+2],23,-995338651);
    a=ii(a,b,c,d,x[i],6,-198630844);d=ii(d,a,b,c,x[i+7],10,1126891415);c=ii(c,d,a,b,x[i+14],15,-1416354905);b=ii(b,c,d,a,x[i+5],21,-57434055);
    a=ii(a,b,c,d,x[i+12],6,1700485571);d=ii(d,a,b,c,x[i+3],10,-1894986606);c=ii(c,d,a,b,x[i+10],15,-1051523);b=ii(b,c,d,a,x[i+1],21,-2054922799);
    a=ii(a,b,c,d,x[i+8],6,1873313359);d=ii(d,a,b,c,x[i+15],10,-30611744);c=ii(c,d,a,b,x[i+6],15,-1560198380);b=ii(b,c,d,a,x[i+13],21,1309151649);
    a=ii(a,b,c,d,x[i+4],6,-145523070);d=ii(d,a,b,c,x[i+11],10,-1120210379);c=ii(c,d,a,b,x[i+2],15,718787259);b=ii(b,c,d,a,x[i+9],21,-343485551);
    s2[0]=safeAdd(a,s2[0]);s2[1]=safeAdd(b,s2[1]);s2[2]=safeAdd(c,s2[2]);s2[3]=safeAdd(d,s2[3]);
  }
  var hex='';
  for(i=0;i<4;i++){var w=s2[i];for(var j=0;j<4;j++){hex+=(((w>>(j*8+4))&0xF).toString(16)+((w>>(j*8))&0xF).toString(16));}}
  return hex;
}

async function logout() {
  if (!confirm('確定要登出嗎？')) return;
  localStorage.removeItem('mls_token');
  localStorage.removeItem('mls_token_exp');
  location.reload();
}

window.doLogin  = doLogin;
window.logout   = logout;

async function changePassword() {
  OM('修改密碼', `
  <div style="margin-bottom:12px">
    <label style="font-size:13px;color:var(--tx3);font-weight:600;display:block;margin-bottom:6px">目前密碼</label>
    <input type="password" id="pw-old" placeholder="輸入目前密碼"
      style="width:100%;padding:10px 12px;border:1.5px solid var(--bd);border-radius:var(--r);font-size:14px;outline:none;box-sizing:border-box">
  </div>
  <div style="margin-bottom:12px">
    <label style="font-size:13px;color:var(--tx3);font-weight:600;display:block;margin-bottom:6px">新密碼</label>
    <input type="password" id="pw-new" placeholder="輸入新密碼（至少6字元）"
      style="width:100%;padding:10px 12px;border:1.5px solid var(--bd);border-radius:var(--r);font-size:14px;outline:none;box-sizing:border-box">
  </div>
  <div>
    <label style="font-size:13px;color:var(--tx3);font-weight:600;display:block;margin-bottom:6px">確認新密碼</label>
    <input type="password" id="pw-new2" placeholder="再輸入一次新密碼"
      style="width:100%;padding:10px 12px;border:1.5px solid var(--bd);border-radius:var(--r);font-size:14px;outline:none;box-sizing:border-box">
  </div>`,
  `<button class="btn" onclick="CM()">取消</button>
   <button class="btn btn-p" onclick="savePassword()">確認修改</button>`);
}

async function savePassword() {
  const oldPw  = document.getElementById('pw-old')?.value;
  const newPw  = document.getElementById('pw-new')?.value;
  const newPw2 = document.getElementById('pw-new2')?.value;
  if (!oldPw || !newPw || !newPw2) { toast('請填寫所有欄位','e'); return; }
  if (newPw.length < 6) { toast('新密碼至少需要6個字元','e'); return; }
  if (newPw !== newPw2) { toast('兩次新密碼不一致','e'); return; }
  // 驗證目前密碼
  const { data:check } = await sb.from('settings').select('value')
    .eq('key','access_password').eq('value', pgMd5(oldPw)).single();
  if (!check) { toast('目前密碼錯誤','e'); return; }
  // 更新新密碼
  await sb.from('settings').update({ value: pgMd5(newPw), updated_at: new Date().toISOString() })
    .eq('key','access_password');
  toast('✅ 密碼已修改，下次登入請用新密碼');
  CM();
}

window.changePassword = changePassword;
window.savePassword = savePassword;