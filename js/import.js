// ═══════════════════════════════════════
// import.js — CSV 資料匯入（供新用戶轉系統使用）
// 支援：商品主檔／客戶名單／歷史訂單（含明細，自動改編號、分組建單）
// ═══════════════════════════════════════

window._imp = { type:null, headers:[], rows:[], mapping:{} };

// ── 欄位定義（key、顯示名稱、是否必填、常見別名關鍵字，用來自動猜測對應）──
const IMP_FIELDS = {
  products: [
    { key:'product_no', label:'商品編號（留空自動產生）', req:false, alias:['商品編號','編號','貨號','料號','品號','sku','code'] },
    { key:'name',        label:'商品名稱', req:true,  alias:['商品名稱','品名','名稱','商品','name'] },
    { key:'spec',         label:'規格', req:false, alias:['規格','spec'] },
    { key:'unit',         label:'單位', req:false, alias:['單位','unit'] },
    { key:'category',     label:'類別', req:false, alias:['類別','分類','category'] },
    { key:'cost',         label:'進貨成本', req:false, alias:['進貨價','成本','進貨成本','cost'] },
    { key:'price_retail', label:'零售價', req:false, alias:['零售價','售價','零售','retail','price'] },
    { key:'price_vip',    label:'VIP價', req:false, alias:['vip價','vip'] },
    { key:'price_dealer', label:'經銷價', req:false, alias:['經銷價','經銷','dealer'] },
    { key:'price_region', label:'大區價', req:false, alias:['大區價','大區'] },
    { key:'price_city',   label:'市代價', req:false, alias:['市代價','市代'] },
    { key:'price_founder',label:'創始價', req:false, alias:['創始價','創始'] },
    { key:'stock',        label:'初始庫存', req:false, alias:['庫存','數量','初始庫存','期初庫存','stock'] },
    { key:'vendor',       label:'廠商', req:false, alias:['廠商','供應商','vendor'] },
  ],
  customers: [
    { key:'customer_no',  label:'客戶編號（留空自動產生）', req:false, alias:['客戶編號','編號','customer_no'] },
    { key:'name',         label:'姓名', req:true, alias:['姓名','客戶名稱','客戶','name'] },
    { key:'phone',        label:'手機', req:false, alias:['手機','電話','手機號碼','phone'] },
    { key:'agent_level',  label:'位階', req:false, alias:['位階','等級','會員等級','level'] },
    { key:'email',        label:'Email', req:false, alias:['email','信箱'] },
    { key:'ship_address', label:'地址', req:false, alias:['地址','送貨地址','address'] },
    { key:'store_credit', label:'儲值金餘額', req:false, alias:['儲值金','點數','儲值','credit'] },
    { key:'note',         label:'備註', req:false, alias:['備註','note'] },
  ],
  orders: [
    { key:'group_key',    label:'原始訂單編號（同號會合併成一張單）', req:true, alias:['訂單編號','原始單號','order_no','order_id','單號'] },
    { key:'order_date',   label:'訂單日期', req:true, alias:['日期','訂單日期','order_date','date'] },
    { key:'customer_name',label:'客戶姓名', req:true, alias:['客戶','客戶名稱','姓名','customer'] },
    { key:'customer_phone',label:'客戶電話', req:false, alias:['電話','手機','phone'] },
    { key:'product_no',   label:'商品編號（有的話優先用來比對）', req:false, alias:['商品編號','貨號','sku'] },
    { key:'product_name', label:'商品名稱', req:true, alias:['商品','品名','商品名稱','product'] },
    { key:'qty',          label:'數量', req:true, alias:['數量','銷售數','qty'] },
    { key:'gift_qty',     label:'贈品數', req:false, alias:['贈品','贈品數','gift'] },
    { key:'unit_price',   label:'單價', req:true, alias:['單價','售價','price','unit_price'] },
    { key:'paid',         label:'是否已收款（Y/N，留空預設已收）', req:false, alias:['是否收款','已收款','付款狀態','paid'] },
    { key:'note',         label:'備註', req:false, alias:['備註','note'] },
  ]
};
const IMP_TYPE_LABEL = { products:'商品主檔', customers:'客戶名單', orders:'歷史訂單（含明細）' };

// ── CSV / TSV 簡易解析（支援雙引號包欄位、逗號或Tab分隔）──
function parseCSVText(text){
  text = text.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n').replace(/\r/g,'\n');
  const firstLine = text.split('\n')[0]||'';
  const delim = (firstLine.split('\t').length > firstLine.split(',').length) ? '\t' : ',';
  const rows=[]; let row=[]; let field=''; let inQ=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(inQ){
      if(c==='"'){ if(text[i+1]==='"'){field+='"';i++;} else inQ=false; }
      else field+=c;
    } else {
      if(c==='"') inQ=true;
      else if(c===delim){ row.push(field); field=''; }
      else if(c==='\n'){ row.push(field); rows.push(row); row=[]; field=''; }
      else field+=c;
    }
  }
  if(field.length||row.length){ row.push(field); rows.push(row); }
  const clean = rows.filter(r=>r.some(f=>f.trim()!==''));
  if(!clean.length) return {headers:[],rows:[]};
  const headers = clean[0].map(h=>h.trim());
  const dataRows = clean.slice(1).map(r=>{
    const o={}; headers.forEach((h,idx)=>o[h]=(r[idx]||'').trim()); return o;
  });
  return {headers,rows:dataRows};
}

// ── 自動猜測欄位對應 ──
function guessMapping(headers, fields){
  const map={};
  fields.forEach(f=>{
    let best=null;
    for(const h of headers){
      const hn=h.toLowerCase().replace(/\s/g,'');
      if(f.alias.some(a=>hn===a.toLowerCase()||hn.includes(a.toLowerCase())||a.toLowerCase().includes(hn))){ best=h; break; }
    }
    map[f.key]=best||'';
  });
  return map;
}

// ── 主頁面 ──
function dataImport(){
  const imp=window._imp;
  $('main').innerHTML=`
  <div class="ph"><div><div class="pt">資料匯入</div><div class="ps">從舊系統匯入商品、客戶、歷史訂單（CSV）</div></div></div>
  <div class="pc">
    <div class="tc" style="margin-bottom:14px">
      <div class="tb"><span class="tt">第一步：選擇匯入資料類型</span></div>
      <div style="padding:16px;display:flex;gap:10px;flex-wrap:wrap">
        ${Object.keys(IMP_TYPE_LABEL).map(t=>`<button class="btn ${imp.type===t?'btn-p':''}" onclick="impSetType('${t}')">${IMP_TYPE_LABEL[t]}</button>`).join('')}
      </div>
    </div>
    ${imp.type?`
    <div class="tc" style="margin-bottom:14px">
      <div class="tb"><span class="tt">第二步：貼上或上傳 CSV</span></div>
      <div style="padding:16px">
        <div class="al al-w" style="font-size:12px;margin-bottom:10px">
          ${imp.type==='orders'
            ? '每一列是「一筆訂單裡的一個商品」，同一張訂單的多個商品請填相同的「原始訂單編號」，系統會自動合併成一張單，並改用我們自己的編號規則（不會使用舊系統的單號）。歷史訂單匯入<b>不會</b>異動目前的商品庫存數字（庫存請以你目前實際盤點的數字為準，另外用商品主檔匯入或直接編輯）。'
            : '第一列請是欄位標題（例如：商品名稱、售價、庫存…），下面每一列是一筆資料。'}
        </div>
        <input type="file" id="impFile" accept=".csv,.txt,.tsv" onchange="impFileLoad(this)" style="margin-bottom:10px">
        <div style="font-size:12px;color:var(--tx3);margin-bottom:6px">或直接貼上：</div>
        <textarea id="impPaste" rows="6" style="width:100%;padding:8px;border:1px solid var(--bd);border-radius:var(--r);font-size:12px;font-family:monospace" placeholder="貼上 CSV 或從 Excel 複製的內容…"></textarea>
        <button class="btn btn-p" style="margin-top:10px" onclick="impParse()">解析內容</button>
      </div>
    </div>` : ''}
    ${imp.headers.length?renderImpMapping():''}
    <div id="impResult"></div>
  </div>`;
}
window.dataImport = dataImport;

function impSetType(t){
  window._imp = { type:t, headers:[], rows:[], mapping:{} };
  dataImport();
}
window.impSetType = impSetType;

function impFileLoad(inp){
  const file=inp.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=e=>{ $('impPaste').value = e.target.result; impParse(); };
  reader.readAsText(file, 'utf-8');
}
window.impFileLoad = impFileLoad;

function impParse(){
  const text=$('impPaste')?.value||'';
  if(!text.trim()){ toast('請先貼上或上傳內容','e'); return; }
  const {headers,rows}=parseCSVText(text);
  if(!headers.length){ toast('沒有解析到任何資料，請確認格式','e'); return; }
  const imp=window._imp;
  imp.headers=headers; imp.rows=rows;
  imp.mapping=guessMapping(headers, IMP_FIELDS[imp.type]);
  toast(`解析成功：${headers.length} 個欄位、${rows.length} 筆資料`);
  dataImport();
}
window.impParse = impParse;

function renderImpMapping(){
  const imp=window._imp;
  const fields=IMP_FIELDS[imp.type];
  const optHtml = h => `<option value="">（不匯入）</option>`+imp.headers.map(x=>`<option value="${x}" ${imp.mapping[h.key]===x?'selected':''}>${x}</option>`).join('');
  return `
  <div class="tc" style="margin-bottom:14px">
    <div class="tb"><span class="tt">第三步：欄位對應（系統已自動猜測，請確認或手動調整）</span></div>
    <div class="tw"><table style="width:100%">
      <tr><th>我們的欄位</th><th>對應到你 CSV 的哪一欄</th></tr>
      ${fields.map(f=>`<tr>
        <td>${f.label}${f.req?' <span style="color:var(--rd)">*必填</span>':''}</td>
        <td><select onchange="impSetMap('${f.key}',this.value)" style="padding:6px 8px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;min-width:220px">${optHtml(f)}</select></td>
      </tr>`).join('')}
    </table></div>
    <div style="padding:14px;display:flex;gap:10px">
      <button class="btn" onclick="impPreview()">預覽前5筆</button>
      <button class="btn btn-p" onclick="impRun()">✅ 開始匯入（共 ${imp.rows.length} 筆原始資料）</button>
    </div>
    <div id="impPreviewArea" style="padding:0 14px 14px"></div>
  </div>`;
}

function impSetMap(key,val){ window._imp.mapping[key]=val; }
window.impSetMap = impSetMap;

function impMapRow(row, fields, mapping){
  const o={};
  fields.forEach(f=>{ const col=mapping[f.key]; o[f.key]=col?(row[col]||'').trim():''; });
  return o;
}

function impPreview(){
  const imp=window._imp;
  const fields=IMP_FIELDS[imp.type];
  const missingReq = fields.filter(f=>f.req && !imp.mapping[f.key]);
  if(missingReq.length){ toast('還沒對應必填欄位：'+missingReq.map(f=>f.label).join('、'),'e'); return; }
  const sample = imp.rows.slice(0,5).map(r=>impMapRow(r,fields,imp.mapping));
  $('impPreviewArea').innerHTML = `
  <div class="tw"><table style="width:100%">
    <tr>${fields.map(f=>`<th>${f.label}</th>`).join('')}</tr>
    ${sample.map(r=>`<tr>${fields.map(f=>`<td style="font-size:12px">${r[f.key]||'—'}</td>`).join('')}</tr>`).join('')}
  </table></div>`;
}
window.impPreview = impPreview;

// ── 匯入編號小工具 ──
async function impNextCustomerNo(cache){
  if(cache.next==null){
    const{data}=await sb.from('customers').select('customer_no').order('customer_no',{ascending:false}).limit(50);
    let max=0;
    (data||[]).forEach(r=>{ const m=(r.customer_no||'').match(/^C-(\d+)$/); if(m) max=Math.max(max,parseInt(m[1])); });
    cache.next=max+1;
  }
  const no='C-'+String(cache.next).padStart(5,'0'); cache.next++; return no;
}
async function impNextProductNo(cache){
  if(cache.next==null){
    const{data}=await sb.from('products').select('product_no').like('product_no','IMP%');
    let max=0;
    (data||[]).forEach(r=>{ const m=(r.product_no||'').match(/^IMP(\d+)$/); if(m) max=Math.max(max,parseInt(m[1])); });
    cache.next=max+1;
  }
  const no='IMP'+String(cache.next).padStart(4,'0'); cache.next++; return no;
}
async function impNextOrderNo(dateStr, cache){
  const td=(dateStr||'').replace(/[^0-9]/g,'').slice(0,8) || today().replace(/-/g,'');
  const prefix='SO-'+td+'-';
  if(cache[prefix]==null){
    const{data}=await sb.from('sales_orders').select('order_no').like('order_no',prefix+'%');
    let max=0;
    (data||[]).forEach(r=>{ const m=(r.order_no||'').replace(prefix,''); const n=parseInt(m); if(!isNaN(n)) max=Math.max(max,n); });
    cache[prefix]=max+1;
  }
  const no=prefix+String(cache[prefix]).padStart(3,'0'); cache[prefix]++; return no;
}
function impNormDate(s){
  if(!s) return today();
  s=s.trim();
  let m=s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if(m) return m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');
  m=s.match(/^(\d{2,3})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/); // 民國年
  if(m) return (parseInt(m[1])+1911)+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');
  return today();
}

async function impRun(){
  const imp=window._imp;
  const fields=IMP_FIELDS[imp.type];
  const missingReq = fields.filter(f=>f.req && !imp.mapping[f.key]);
  if(missingReq.length){ toast('還沒對應必填欄位：'+missingReq.map(f=>f.label).join('、'),'e'); return; }
  if(!confirm(`確定要匯入 ${imp.rows.length} 筆資料嗎？此動作會直接寫入資料庫。`)) return;

  const mapped = imp.rows.map(r=>impMapRow(r,fields,imp.mapping));
  const resultEl=$('impResult');
  resultEl.innerHTML='<div class="ld"><div class="sp"></div>匯入中，請稍候…</div>';

  let result;
  if(imp.type==='products') result = await impRunProducts(mapped);
  else if(imp.type==='customers') result = await impRunCustomers(mapped);
  else result = await impRunOrders(mapped);

  resultEl.innerHTML = `
  <div class="tc">
    <div class="tb"><span class="tt">匯入結果</span></div>
    <div style="padding:16px">
      <div style="margin-bottom:8px">✅ 成功：<b style="color:var(--ac)">${result.ok}</b> 筆　⚠️ 失敗：<b style="color:var(--rd)">${result.fail}</b> 筆</div>
      ${result.errors.length?`<div class="al al-w" style="font-size:12px;max-height:200px;overflow-y:auto">${result.errors.map(e=>'• '+e).join('<br>')}</div>`:''}
    </div>
  </div>`;
}
window.impRun = impRun;

async function impRunProducts(rows){
  let ok=0, fail=0; const errors=[];
  const noCache={};
  for(const [i,r] of rows.entries()){
    if(!r.name){ fail++; errors.push(`第${i+2}列：缺少商品名稱，已跳過`); continue; }
    try{
      let product_no=r.product_no;
      const payload={
        name:r.name, spec:r.spec||null, unit:r.unit||'個', category:r.category||null,
        cost:parseFloat(r.cost)||0,
        price_retail:parseFloat(r.price_retail)||0, price_vip:parseFloat(r.price_vip)||0,
        price_dealer:parseFloat(r.price_dealer)||0, price_region:parseFloat(r.price_region)||0,
        price_city:parseFloat(r.price_city)||0, price_founder:parseFloat(r.price_founder)||0,
        stock:parseFloat(r.stock)||0, vendor:r.vendor||null, is_active:true
      };
      if(product_no){
        const{data:exist}=await sb.from('products').select('product_no').eq('product_no',product_no).maybeSingle();
        if(exist){ const{error}=await sb.from('products').update(payload).eq('product_no',product_no); if(error) throw error; }
        else { const{error}=await sb.from('products').insert({...payload,product_no}); if(error) throw error; }
      } else {
        product_no = await impNextProductNo(noCache);
        const{error}=await sb.from('products').insert({...payload,product_no});
        if(error) throw error;
      }
      ok++;
    }catch(e){ fail++; errors.push(`第${i+2}列（${r.name}）：${e.message}`); }
  }
  return {ok,fail,errors};
}

async function impRunCustomers(rows){
  let ok=0, fail=0; const errors=[];
  const noCache={};
  for(const [i,r] of rows.entries()){
    if(!r.name){ fail++; errors.push(`第${i+2}列：缺少姓名，已跳過`); continue; }
    try{
      let customer_no=r.customer_no;
      const payload={
        name:r.name, phone:r.phone||null, agent_level:r.agent_level||'零售',
        email:r.email||null, ship_address:r.ship_address||null,
        store_credit:parseFloat(r.store_credit)||0, note:r.note||null
      };
      if(customer_no){
        const{data:exist}=await sb.from('customers').select('customer_no').eq('customer_no',customer_no).maybeSingle();
        if(exist){ const{error}=await sb.from('customers').update(payload).eq('customer_no',customer_no); if(error) throw error; }
        else { const{error}=await sb.from('customers').insert({...payload,customer_no}); if(error) throw error; }
      } else {
        customer_no = await impNextCustomerNo(noCache);
        const{error}=await sb.from('customers').insert({...payload,customer_no});
        if(error) throw error;
      }
      ok++;
    }catch(e){ fail++; errors.push(`第${i+2}列（${r.name}）：${e.message}`); }
  }
  return {ok,fail,errors};
}

async function impRunOrders(rows){
  let ok=0, fail=0; const errors=[];
  const custNoCache={}; const prodNoCache={}; const orderNoCache={};

  // 先把現有客戶、商品抓進記憶體做比對快取
  const [{data:allCust},{data:allProd}] = await Promise.all([
    sb.from('customers').select('customer_no,name,phone'),
    sb.from('products').select('product_no,name'),
  ]);
  const custByPhone={}, custByName={};
  (allCust||[]).forEach(c=>{ if(c.phone) custByPhone[c.phone]=c; if(c.name) custByName[c.name]=c; });
  const prodByNo={}, prodByName={};
  (allProd||[]).forEach(p=>{ prodByNo[p.product_no]=p; prodByName[p.name]=p; });

  // 依「原始訂單編號」分組
  const groups={};
  rows.forEach((r,i)=>{
    const key=r.group_key||('_row'+i);
    if(!groups[key]) groups[key]=[];
    groups[key].push({...r, _line:i+2});
  });

  for(const key of Object.keys(groups)){
    const items=groups[key];
    const head=items[0];
    try{
      if(!head.customer_name){ throw new Error('缺少客戶姓名'); }
      // 客戶比對／建立
      let cust = (head.customer_phone && custByPhone[head.customer_phone]) || custByName[head.customer_name];
      if(!cust){
        const customer_no = await impNextCustomerNo(custNoCache);
        const payload={ customer_no, name:head.customer_name, phone:head.customer_phone||null, agent_level:'零售', store_credit:0 };
        const{error}=await sb.from('customers').insert(payload);
        if(error) throw error;
        cust={customer_no,name:head.customer_name,phone:head.customer_phone};
        if(cust.phone) custByPhone[cust.phone]=cust;
        custByName[cust.name]=cust;
      }

      // 品項比對／自動建立缺少的商品
      const orderItems=[];
      let subtotal=0;
      for(const it of items){
        if(!it.product_name && !it.product_no){ throw new Error(`第${it._line}列缺少商品名稱`); }
        const qty=parseFloat(it.qty)||0;
        const giftQty=parseFloat(it.gift_qty)||0;
        const price=parseFloat(it.unit_price)||0;
        if(qty<=0 && giftQty<=0){ throw new Error(`第${it._line}列數量為0，已跳過該列`); }
        let prod = (it.product_no && prodByNo[it.product_no]) || prodByName[it.product_name];
        if(!prod){
          const product_no = await impNextProductNo(prodNoCache);
          const payload={ product_no, name:it.product_name||it.product_no, category:'匯入商品', unit:'個', cost:0, price_retail:price, stock:0, is_active:true };
          const{error}=await sb.from('products').insert(payload);
          if(error) throw error;
          prod={product_no,name:payload.name};
          prodByNo[prod.product_no]=prod; prodByName[prod.name]=prod;
        }
        const amount=qty*price;
        subtotal+=amount;
        orderItems.push({
          product_no:prod.product_no, product_name:prod.name, qty, gift_qty:giftQty,
          actual_qty:qty+giftQty, unit_price:price, amount, shipped_qty:qty+giftQty,
          year_month:impNormDate(head.order_date).slice(0,7)
        });
      }

      const order_date=impNormDate(head.order_date);
      const order_no = await impNextOrderNo(order_date, orderNoCache);
      const paidVal = (head.paid||'').trim();
      const payment_done = paidVal ? /^(y|是|已收|true|1)/i.test(paidVal) : true;

      const{error:oErr}=await sb.from('sales_orders').insert({
        order_no, order_date, customer_no:cust.customer_no, customer_name:cust.name, phone:cust.phone||null,
        subtotal, total:subtotal, shipping_fee:0, payment_done, ship_status:'全部出貨',
        actual_ship_date:order_date, stock_deducted_at_creation:true,
        products_summary: orderItems.map(x=>x.product_name).join('、'),
        note:'CSV匯入 原始單號:'+key, year_month:order_date.slice(0,7)
      });
      if(oErr) throw oErr;

      const{error:iErr}=await sb.from('sales_order_items').insert(orderItems.map(x=>({...x, order_no})));
      if(iErr) throw iErr;

      ok++;
    }catch(e){ fail++; errors.push(`原始單號「${key}」：${e.message}`); }
  }
  return {ok,fail,errors};
}