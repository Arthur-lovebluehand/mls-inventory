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

// ── 欄位中文標題字典（匯出CSV抬頭用）──
const COL_LABELS = {
  id:'系統序號', product_no:'商品編號', name:'名稱', name_spec:'名稱規格', category:'類別', unit:'單位',
  spec:'規格', source:'來源', vendor:'廠商', vendor_no:'廠商編號', vendor_name:'廠商名稱', cost:'成本',
  stock:'庫存', adjust_stock:'調整庫存', price_retail:'零售價', price_vip:'VIP價', price_dealer:'經銷價',
  description:'說明', created_by:'建立者', created_at_ragic:'建立時間(舊系統)', updated_by:'更新者',
  updated_at_ragic:'更新時間(舊系統)', price_founder:'創始價', price_region:'大區價', price_city:'市代價',
  vendor_product_no:'廠商原始編號', image_url:'圖片網址', is_active:'啟用中', service_unit:'服務單位',
  service_units_per_stock:'每進貨單位可服務量', default_service_qty:'每次預設服務用量',
  price_no:'價格編號', product_name:'商品名稱', price:'價格', level:'位階', profit:'利潤', note:'備註',
  purchase_no:'進貨單號', contact:'聯絡人', date:'日期', brand_no:'品牌編號', sort_order:'排序',
  origin:'產地', website:'網站',
  customer_no:'客戶編號', member_no:'會員編號', phone:'手機', other_phone:'其他電話', agent_level:'位階',
  payment_terms:'付款條件', shipping_method:'寄送方式', payment_method:'付款方式', fax:'傳真',
  invoice_title:'發票抬頭', tax_no:'統編', email:'Email', birthday:'生日', lunar_mark:'農曆註記',
  bill_district:'帳單行政區', ship_district:'送貨行政區', bill_zip:'帳單郵遞區號', ship_zip:'送貨郵遞區號',
  bill_address:'帳單地址', ship_address:'送貨地址', bill_full_address:'帳單完整地址', ship_full_address:'送貨完整地址',
  store_credit:'儲值金餘額', store_credit_used:'已用儲值金', created_at:'建立時間', is_service_customer:'服務客戶',
  loan_no:'借貨單號', returned_qty:'已還數量', return_date:'退回/退貨日期', promo_code:'活動代碼',
  bundle_group:'套組群組', is_gift:'是否贈品', loan_type:'借貨類型', status:'狀態', loan_date:'借貨日期',
  year_month:'年月', address:'地址', products_summary:'商品摘要', returned:'已歸還', shipping_fee:'運費',
  total:'總金額', tax_type:'稅別', subtotal:'小計', tax_rate:'稅率', tax:'稅額', actual_ship_date:'實際出貨日',
  direction:'方向', return_status:'退貨狀態', bad_debt:'呆帳', bad_debt_note:'呆帳備註',
  party_no:'對象編號', line_id:'Line ID',
  month:'月份', monthly_account_no:'月結編號', yearly_account_no:'年結編號', income:'收入', expense:'支出',
  po_no:'進貨單號', po_date:'進貨日期', staff:'經手人', invoice_no:'發票號碼', monthly_account:'月結帳戶',
  done:'完成', receipt_status:'收貨狀態',
  order_no:'訂單編號', order_type:'訂單類型', order_date:'訂單日期', customer_name:'客戶名稱',
  is_return:'是否退貨', recipient:'收款/收件人', store_credit_deduct:'儲值金折抵', payment_done:'已收款',
  payment_date:'收款日期', total_profit:'總利潤', promo_name:'活動名稱', ship_status:'出貨狀態',
  return_reason:'退貨原因', stock_deducted_at_creation:'建單時已扣庫存',
  qty:'數量', unit_price:'單價', amount:'金額', stock_before:'扣減前庫存', gift_qty:'贈品數',
  actual_qty:'實際數量', shipped_qty:'已出貨數量', is_bundle_item:'是否套組品項', bundle_name:'套組名稱',
  old_price:'原價格', new_price:'新價格', price_type:'價格類型', change_date:'異動日期',
  buy_qty:'買幾件', get_qty:'送幾件', bundle_price:'組合價', discount_amount:'折扣金額', discount_pct:'折扣%',
  min_qty:'最低數量', start_date:'開始日期', end_date:'結束日期', type:'類型',
  record_no:'記錄編號', record_date:'記錄日期', payer:'付款人', trigger_who:'觸發人',
  restock_no:'補貨單號', restock_date:'補貨日期', consumable_id:'耗材ID', item_name:'品項名稱',
  unit_cost:'單位成本', total_cost:'總成本', item_no:'耗材編號', stock_qty:'庫存數量', updated_at:'更新時間',
  default_price:'預設單價', item_type:'品項類型', technician_id:'技師ID', technician_name:'技師姓名',
  commission_amount:'抽成金額', technician_pay:'技師抽成', paid_by_credit:'儲值金支付', paid_by_cash:'現金支付',
  consumable_cost:'耗材成本', total_commission:'總抽成', transfer_no:'撥轉單號', transfer_date:'撥轉日期',
  qty_stock:'商品庫存數量', qty_service:'服務庫存數量', key:'設定鍵', value:'設定值',
  balance:'餘額', balance_after:'異動後餘額', commission_rate:'抽成比例', role:'職位',
  mobile:'手機', bank_name:'銀行', bank_account:'銀行帳號', bank_holder:'戶名',
  year:'年度', action:'動作', table_name:'資料表', record_id:'記錄編號', old_values:'異動前',
  new_values:'異動後', operator:'操作人', device_id:'裝置ID', reason:'原因',
};
function labelCol(k){ return COL_LABELS[k]||k; }
function fmtVal(v){
  if(v===true) return '是';
  if(v===false) return '否';
  if(v==null) return '';
  return v;
}
// Excel 會把開頭是0的純數字字串自動吃掉開頭0（例如手機0912345678變912345678），
// 用公式包起來強制當文字處理，避免使用者看到手機號碼開頭0不見。
const PHONE_LIKE_COLS = new Set(['phone','other_phone','mobile','fax','tax_no','bill_zip','ship_zip']);
function excelText(v){
  if(v==null||v==='') return '';
  const s=String(v);
  if(/^0\d+$/.test(s)) return '="'+s.replace(/"/g,'""')+'"';
  return s;
}

// ── 匯出／備份：全部資料表清單（分類顯示）──
const EXPORT_TABLES = [
  { group:'商品／庫存', tables:[
    {t:'products',label:'商品主檔'},
    {t:'product_prices',label:'商品價格'},
    {t:'product_purchase_prices',label:'商品進貨價'},
    {t:'product_price_logs',label:'商品價格異動記錄'},
    {t:'brands',label:'品牌商'},
  ]},
  { group:'客戶／儲值', tables:[
    {t:'customers',label:'客戶名單'},
    {t:'store_credits',label:'儲值金'},
    {t:'store_credit_records',label:'儲值金異動記錄'},
  ]},
  { group:'銷售', tables:[
    {custom:'salesOrders',label:'銷售訂單（含商品明細）'},
    {t:'promotions',label:'促銷活動/套組'},
    {t:'promotion_items',label:'促銷活動品項'},
  ]},
  { group:'進貨／廠商', tables:[
    {custom:'purchaseOrders',label:'進貨單（含商品明細）'},
    {t:'purchase_returns',label:'進貨退貨單'},
    {t:'purchase_return_items',label:'進貨退貨品項'},
    {t:'vendors',label:'廠商'},
  ]},
  { group:'借貨', tables:[
    {custom:'loanOrders',label:'借貨單（含商品明細）'},
    {t:'loan_parties',label:'借貨對象名單'},
  ]},
  { group:'服務管理', tables:[
    {t:'service_items',label:'服務項目'},
    {t:'technicians',label:'技師'},
    {t:'service_roles',label:'服務職位'},
    {t:'service_orders',label:'服務訂單'},
    {t:'service_order_items',label:'服務訂單品項'},
    {custom:'serviceInventory',label:'服務庫存（商品撥轉）'},
    {t:'service_transfers',label:'撥轉記錄'},
    {t:'service_consumables',label:'服務專屬耗材'},
    {t:'service_consumable_restocks',label:'服務耗材補貨記錄'},
  ]},
  { group:'財務／其他', tables:[
    {t:'bonus_records',label:'獎金/分潤記錄'},
    {t:'monthly_accounts',label:'月結對帳'},
    {t:'yearly_accounts',label:'年度對帳'},
    {t:'payment_methods',label:'付款方式設定'},
    {t:'settings',label:'系統設定'},
    {t:'audit_logs',label:'操作記錄'},
  ]},
];

// ── 客製合併匯出（訂單主檔+明細合併成一份報表，一列一個品項）──
const CUSTOM_EXPORTERS = {
  async salesOrders(){
    const orders=await fetchAllRows('sales_orders');
    const items=await fetchAllRows('sales_order_items');
    orders.sort((a,b)=>(a.order_date||'').localeCompare(b.order_date||'')||(a.order_no||'').localeCompare(b.order_no||''));
    const itemsByOrder={};
    items.forEach(i=>{ (itemsByOrder[i.order_no]=itemsByOrder[i.order_no]||[]).push(i); });
    const rows=[];
    orders.forEach(o=>{
      const its=itemsByOrder[o.order_no]||[{}];
      its.forEach(i=>rows.push({
        訂單編號:o.order_no, 訂單日期:o.order_date, 客戶編號:o.customer_no, 客戶名稱:o.customer_name,
        手機:excelText(o.phone), 位階:o.agent_level, 出貨狀態:o.ship_status, 已收款:fmtVal(o.payment_done),
        收款日期:o.payment_date, 商品名稱:i.product_name||'', 商品編號:i.product_no||'', 數量:i.qty??'',
        贈品數:i.gift_qty??'', 已出貨數量:i.shipped_qty??'', 單價:i.unit_price??'', 品項金額:i.amount??'',
        運費:o.shipping_fee, 訂單小計:o.subtotal, 訂單總金額:o.total, 付款方式:o.payment_method,
        送貨地址:o.ship_address, 備註:o.note
      }));
    });
    return rows;
  },
  async purchaseOrders(){
    const orders=await fetchAllRows('purchase_orders');
    const items=await fetchAllRows('purchase_order_items');
    orders.sort((a,b)=>(a.po_date||'').localeCompare(b.po_date||'')||(a.po_no||'').localeCompare(b.po_no||''));
    const itemsByOrder={};
    items.forEach(i=>{ (itemsByOrder[i.po_no]=itemsByOrder[i.po_no]||[]).push(i); });
    const rows=[];
    orders.forEach(o=>{
      const its=itemsByOrder[o.po_no]||[{}];
      its.forEach(i=>rows.push({
        進貨單號:o.po_no, 進貨日期:o.po_date, 廠商編號:o.vendor_no, 廠商名稱:o.vendor_name, 狀態:o.status,
        商品名稱:i.product_name||'', 商品編號:i.product_no||'', 數量:i.qty??'', 贈品數:i.gift_qty??'',
        已收貨數量:i.received_qty??'', 單價:i.unit_price??'', 品項金額:i.amount??'',
        運費:o.shipping_fee, 進貨小計:o.subtotal, 進貨總金額:o.total, 付款方式:o.payment_method,
        發票號碼:o.invoice_no, 完成:fmtVal(o.done), 收貨狀態:o.receipt_status, 備註:o.note
      }));
    });
    return rows;
  },
  async loanOrders(){
    const orders=await fetchAllRows('loan_orders');
    const items=await fetchAllRows('loan_order_items');
    orders.sort((a,b)=>(a.loan_date||'').localeCompare(b.loan_date||'')||(a.loan_no||'').localeCompare(b.loan_no||''));
    const itemsByOrder={};
    items.forEach(i=>{ (itemsByOrder[i.loan_no]=itemsByOrder[i.loan_no]||[]).push(i); });
    const rows=[];
    orders.forEach(o=>{
      const its=itemsByOrder[o.loan_no]||[{}];
      its.forEach(i=>rows.push({
        借貨單號:o.loan_no, 借貨日期:o.loan_date, 方向:o.direction==='out'?'借出':o.direction==='in'?'借入':(o.direction||''),
        客戶名稱:o.customer_name, 手機:excelText(o.phone), 位階:o.agent_level,
        商品名稱:i.product_name||'', 商品編號:i.product_no||'', 數量:i.qty??'', 已歸還數量:i.returned_qty??'',
        歸還狀態:o.return_status, 呆帳:fmtVal(o.bad_debt), 呆帳備註:o.bad_debt_note,
        送貨方式:o.shipping_method, 地址:o.address, 備註:o.note
      }));
    });
    return rows;
  },
  async serviceInventory(){
    const [inv,prods]=await Promise.all([fetchAllRows('service_inventory'), fetchAllRows('products')]);
    const nameMap={}; prods.forEach(p=>nameMap[p.product_no]=p.name);
    return inv.map(r=>({
      商品編號:r.product_no, 商品名稱:nameMap[r.product_no]||'（找不到商品名稱）',
      服務庫存數量:r.stock_qty, 更新時間:r.updated_at
    }));
  },
};

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
window._impMode = 'import';
function dataImport(){
  const imp=window._imp;
  $('main').innerHTML=`
  <div class="ph"><div><div class="pt">資料匯入／匯出</div><div class="ps">從舊系統匯入資料，或匯出目前資料做備份</div></div></div>
  <div class="pc">
    <div class="tab-bar" style="margin-bottom:14px">
      <div class="tab ${window._impMode==='import'?'on':''}" onclick="window._impMode='import';dataImport()">📥 匯入</div>
      <div class="tab ${window._impMode==='export'?'on':''}" onclick="window._impMode='export';dataImport()">📤 匯出／備份</div>
    </div>
    ${window._impMode==='export' ? renderExportPage() : `
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
    `}
  </div>`;
}
window.dataImport = dataImport;

function renderExportPage(){
  return `
  <div class="al al-w" style="font-size:12px;margin-bottom:14px">
    匯出的是<b>目前資料庫的完整內容</b>（CSV，Excel可直接開），建議定期備份保存。點「匯出」會直接下載檔案到你的電腦，不會異動任何資料。
  </div>
  <div style="margin-bottom:14px"><button class="btn btn-p" onclick="exportAllTables()">📦 一鍵匯出全部資料表</button></div>
  ${EXPORT_TABLES.map(g=>`
  <div class="tc" style="margin-bottom:14px">
    <div class="tb"><span class="tt">${g.group}</span></div>
    <div style="padding:14px;display:flex;flex-wrap:wrap;gap:8px">
      ${g.tables.map(x=>`<button class="btn btn-s" onclick="exportOneTableIdx('${x.custom||x.t}')">${x.label}</button>`).join('')}
    </div>
  </div>`).join('')}
  <div id="exportLog" style="font-size:12px;color:var(--tx3);margin-top:10px"></div>`;
}

function toCSV(rows){
  if(!rows||!rows.length) return '';
  const headerSet=new Set();
  rows.forEach(r=>Object.keys(r).forEach(k=>headerSet.add(k)));
  const headers=[...headerSet];
  const esc=v=>{
    if(v==null) return '';
    const s=typeof v==='object'?JSON.stringify(v):String(v);
    return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
  };
  const cellVal=(h,v)=> PHONE_LIKE_COLS.has(h) ? excelText(fmtVal(v)) : fmtVal(v);
  const lines=[headers.map(labelCol).join(',')];
  rows.forEach(r=>lines.push(headers.map(h=>esc(cellVal(h,r[h]))).join(',')));
  return '\uFEFF'+lines.join('\n');
}
function downloadCSV(filename, content){
  const blob=new Blob([content],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 3000);
}
async function fetchAllRows(table){
  let all=[], from=0; const step=1000;
  while(true){
    const{data,error}=await sb.from(table).select('*').range(from, from+step-1);
    if(error) throw error;
    all=all.concat(data||[]);
    if(!data||data.length<step) break;
    from+=step;
  }
  return all;
}
function exportOneTableIdx(key){
  const all=EXPORT_TABLES.flatMap(g=>g.tables);
  const x=all.find(e=>(e.custom||e.t)===key);
  if(x) exportOneTable(x);
}
window.exportOneTableIdx = exportOneTableIdx;
async function exportOneTable(x,label){
  label = label || x.label || x;
  const log=$('exportLog');
  if(log) log.textContent=`匯出「${label}」中…`;
  try{
    const rows = x.custom ? await CUSTOM_EXPORTERS[x.custom]() : await fetchAllRows(x.t||x);
    if(!rows.length){ toast(`「${label}」目前沒有資料`,'e'); if(log) log.textContent=''; return; }
    downloadCSV(`${label}_${today()}.csv`, toCSV(rows));
    if(log) log.textContent=`✅ 「${label}」匯出完成，共 ${rows.length} 筆`;
  }catch(e){
    toast(`匯出「${label}」失敗：${e.message}`,'e');
    if(log) log.textContent=`⚠️ 「${label}」失敗：${e.message}`;
  }
}
window.exportOneTable = exportOneTable;
async function exportAllTables(){
  const all=EXPORT_TABLES.flatMap(g=>g.tables);
  const log=$('exportLog');
  let done=0;
  for(const x of all){
    if(log) log.textContent=`匯出中… (${done+1}/${all.length}) ${x.label}`;
    try{
      const rows = x.custom ? await CUSTOM_EXPORTERS[x.custom]() : await fetchAllRows(x.t);
      if(rows.length) downloadCSV(`${x.label}_${today()}.csv`, toCSV(rows));
    }catch(e){ console.error(x.t||x.custom, e); }
    done++;
    await new Promise(r=>setTimeout(r,250)); // 讓瀏覽器有時間處理下載，避免被擋
  }
  if(log) log.textContent=`✅ 全部匯出完成（${done} 個項目，沒有資料的已自動略過）。如果瀏覽器跳出「這個網站要下載多個檔案」的詢問，記得點「允許」，不然後面的檔案會被瀏覽器擋下來沒有下載到。`;
  toast('全部資料表匯出完成！');
}
window.exportAllTables = exportAllTables;

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