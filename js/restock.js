// ═══════════════════════════════════════
// restock.js
// ═══════════════════════════════════════

async function showRestockList() {
  const { data: lowProds } = await sb.from('products')
    .select('product_no,name,spec,category,stock,cost,source')
    .eq('is_active',true).lte('stock',5).not('product_no','is',null).order('stock').order('name');

  let srcSettings = {};
  try {
    const { data: s } = await sb.from('settings').select('value').eq('key','restock_sources').single();
    if(s?.value) srcSettings = JSON.parse(s.value);
  } catch(e) {}

  const all = lowProds || [];
  const allSources = [...new Set(all.map(p=>p.source||'未分類'))].sort();
  const srcOrder  = srcSettings.order    || {};
  const srcHidden = srcSettings.hidden   || [];
  const catHidden = srcSettings.catHidden || [];
  const catOrder  = srcSettings.catOrder  || {};
  window._rstCatOrder = catOrder;

  // 過濾掉隱藏類別
  const filtered = all.filter(p => !catHidden.includes(p.category||'未分類'));

  const shownSrcs = allSources
    .filter(s => !srcHidden.includes(s))
    .sort((a,b) => (srcOrder[a]||99)-(srcOrder[b]||99) || a.localeCompare(b));

  window._rstProds = all;
  window._rstFiltered = filtered;
  window._rstSrc = '全部';
  window._rstAllSrcs = allSources;

  function renderRows(src) {
    const list = (src==='全部' ? filtered : filtered.filter(p=>(p.source||'未分類')===src));
    if(!list.length) return '<div style="text-align:center;color:var(--tx3);padding:20px;font-size:13px">此來源無需補貨商品</div>';

    // 依類別分組
    const groups = {};
    list.forEach(p => {
      const cat = p.category || '未分類';
      if(!groups[cat]) groups[cat] = [];
      groups[cat].push(p);
    });
    // 類別內排序
    const sortBy = window._rstSortBy || 'stock';
    Object.values(groups).forEach(arr => arr.sort((a,b)=>{
      if(sortBy==='stock') return a.stock-b.stock;
      if(sortBy==='name') return a.name.localeCompare(b.name);
      return 0;
    }));

    return Object.entries(groups).sort((a,b)=>{
      const oa=(window._rstCatOrder&&window._rstCatOrder[a[0]])||99;
      const ob=(window._rstCatOrder&&window._rstCatOrder[b[0]])||99;
      return oa-ob||a[0].localeCompare(b[0]);
    }).map(([cat, items]) => {
      const zeroCount = items.filter(p=>p.stock<=0).length;
      const rows = items.map(p=>{
        const tag = p.stock<=0
          ? '<span class="badge br2" style="font-size:11px">缺貨</span>'
          : `<span class="badge ba" style="font-size:11px">剩 ${p.stock}</span>`;
        return `<tr style="border-bottom:1px solid var(--bd)">
          <td style="padding:7px 6px 7px 20px"><label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="checkbox" class="restock-cb" data-no="${p.product_no}" data-name="${p.name.replace(/"/g,'&quot;')}"
              style="width:15px;height:15px;cursor:pointer" ${p.stock<=0?'checked':''}>
            <div><div style="font-size:14px">${p.name}</div>
            <div style="font-size:11px;color:var(--tx3)">${p.spec||''}</div></div>
          </label></td>
          <td style="padding:7px 6px;text-align:center">${tag}</td>
          <td style="padding:7px 6px;text-align:center">
            <input type="number" class="restock-qty" data-no="${p.product_no}" value="${p.stock<=0?3:1}" min="1"
              style="width:58px;padding:4px 5px;border:1px solid var(--bd);border-radius:var(--r);font-size:14px;text-align:center;outline:none">
          </td></tr>`;
      }).join('');

      const catId = 'cat-'+cat.replace(/[^a-zA-Z0-9一-鿿]/g,'_');
      return `<tr><td colspan="3" style="background:var(--sf2);padding:6px 8px;border-bottom:1px solid var(--bd)">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="${catId}" checked
            style="width:15px;height:15px;cursor:pointer"
            onchange="window._toggleCat('${catId}',this.checked)">
          <span style="font-size:12px;font-weight:700;color:var(--tx2);letter-spacing:.3px">${cat}</span>
          <span style="font-size:11px;font-weight:400;color:var(--tx3)">${items.length} 項${zeroCount?'・缺貨 '+zeroCount:''}</span>
        </label>
      </td></tr>${rows}`;
    }).join('');
  }

  function buildTabs() {
    return ['全部',...shownSrcs].map(s=>{
      const cnt = s==='全部' ? filtered.length : filtered.filter(p=>(p.source||'未分類')===s).length;
      const on = s===window._rstSrc?' on':'';
      return `<div class="tab${on}" onclick="window._switchRstTab('${s}')" style="white-space:nowrap">
        ${s} <span style="font-size:11px;opacity:.6">(${cnt})</span></div>`;
    }).join('');
  }

  OM('補貨清單', `
  <div class="al al-w" style="font-size:12px;margin-bottom:8px">勾選要補貨的商品，填入數量，點「建立進貨單」自動帶入。</div>
  <div style="display:flex;align-items:center;gap:4px;margin-bottom:8px">
    <div id="rst-tabs" style="display:flex;gap:2px;overflow-x:auto;flex:1;border-bottom:1px solid var(--bd)">${buildTabs()}</div>
    <button onclick="window._showRstSettings()" title="設定顯示與排序"
      style="flex-shrink:0;padding:5px 10px;border:1px solid var(--bd);border-radius:var(--r);background:var(--sf2);cursor:pointer;font-size:15px;margin-left:4px">⚙</button>
  </div>
  <div style="display:flex;gap:6px;margin-bottom:8px;align-items:center;flex-wrap:wrap">
    <button class="btn btn-s" onclick="document.querySelectorAll('.restock-cb').forEach(c=>c.checked=true)">全選</button>
    <button class="btn btn-s" onclick="document.querySelectorAll('.restock-cb').forEach(c=>c.checked=false)">全不選</button>
    <select onchange="window._rstSortBy=this.value;window._switchRstTab(window._rstSrc)"
      style="padding:4px 8px;border:1px solid var(--bd);border-radius:var(--r);font-size:12px;background:var(--sf);outline:none">
      <option value="stock">排序：缺貨優先</option>
      <option value="name">排序：品名 A→Z</option>
    </select>
    <span id="rst-stats" style="font-size:12px;color:var(--tx3)">共 ${filtered.length} 項</span>
  </div>
  <table style="width:100%">
    <thead><tr style="border-bottom:2px solid var(--bd)">
      <th style="padding:6px;font-size:12px;font-weight:600;text-align:left">商品</th>
      <th style="padding:6px;font-size:12px;font-weight:600;width:70px">庫存</th>
      <th style="padding:6px;font-size:12px;font-weight:600;width:80px">補貨量</th>
    </tr></thead>
    <tbody id="rst-tbody">${renderRows('全部')}</tbody>
  </table>`,
  `<button class="btn" onclick="CM()">關閉</button>
   <button class="btn btn-p" onclick="createRestockPO()">📋 建立進貨單</button>`);

  window._rstSortBy = window._rstSortBy || 'stock';

  window._toggleCat = (catId, checked) => {
    // 找到這個類別下所有 checkbox（在 catId 之後、下一個類別之前）
    const header = document.getElementById(catId);
    if(!header) return;
    const headerRow = header.closest('tr');
    let row = headerRow?.nextElementSibling;
    while(row) {
      const cb = row.querySelector('.restock-cb');
      if(!cb) break;  // 遇到下一個類別標題（無 .restock-cb 的 tr）
      cb.checked = checked;
      row = row.nextElementSibling;
    }
  };

  window._switchRstTab = src => {
    window._rstSrc = src;
    const wrap=document.getElementById('rst-tabs'); if(wrap) wrap.innerHTML=buildTabs();
    const tbody=document.getElementById('rst-tbody'); if(tbody) tbody.innerHTML=renderRows(src);
    const stats=document.getElementById('rst-stats');
    if(stats){
      const list=src==='全部'?filtered:filtered.filter(p=>(p.source||'未分類')===src);
      stats.textContent=`缺貨 ${list.filter(p=>p.stock<=0).length} 項・低庫存 ${list.filter(p=>p.stock>0).length} 項`;
    }
  };

  window._showRstSettings = () => {
    const allCats = [...new Set(all.map(p=>p.category||'未分類'))].sort();
    const srcRows = allSources.map(s=>{
      const ord=srcOrder[s]||99, hid=srcHidden.includes(s), cnt=all.filter(p=>(p.source||'未分類')===s).length;
      return `<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--bd)">
        <input type="number" id="rstord-${s}" value="${ord}" min="1" max="99"
          style="width:44px;padding:4px;border:1px solid var(--bd);border-radius:var(--r);font-size:12px;text-align:center">
        <label style="flex:1;display:flex;align-items:center;gap:6px;cursor:pointer">
          <input type="checkbox" id="rstvis-${s}" ${!hid?'checked':''} style="width:14px;height:14px">
          <span style="font-weight:500">${s}</span><span style="font-size:11px;color:var(--tx3)">${cnt} 項</span>
        </label></div>`;
    }).join('');

    const allCatsSorted = [...new Set(all.map(p=>p.category||'未分類'))].sort((a,b)=>{
      return (catOrder[a]||99)-(catOrder[b]||99)||a.localeCompare(b);
    });
    const catRows = allCatsSorted.map(c=>{
      const hid=catHidden.includes(c), ord=catOrder[c]||99, cnt=all.filter(p=>(p.category||'未分類')===c).length;
      return `<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--bd)">
        <input type="number" id="rstcatord-${c}" value="${ord}" min="1" max="99"
          style="width:44px;padding:4px;border:1px solid var(--bd);border-radius:var(--r);font-size:12px;text-align:center"
          title="排序（數字越小越前）">
        <label style="flex:1;display:flex;align-items:center;gap:6px;cursor:pointer">
          <input type="checkbox" id="rstcat-${c}" ${!hid?'checked':''} style="width:14px;height:14px">
          <span>${c}</span><span style="font-size:11px;color:var(--tx3)">${cnt} 項</span>
        </label>
      </div>`;
    }).join('');

    OM2('補貨清單設定', `
    <div class="sh">來源顯示與排序</div>
    <div style="font-size:12px;color:var(--tx3);margin-bottom:8px">數字=排序（越小越前），勾選=是否顯示</div>
    ${srcRows}
    <div class="sh" style="margin-top:14px">類別篩選（不勾 = 不出現在補貨清單）</div>
    <div style="font-size:12px;color:var(--tx3);margin-bottom:8px">左邊數字設排序（依你的銷售重要程度），不勾 = 不顯示（例如輔消品）</div>
    ${catRows}`,
    `<button class="btn" onclick="CM2()">取消</button>
     <button class="btn btn-p" onclick="window._saveRstSettings()">儲存設定</button>`);
  };

  window._saveRstSettings = async () => {
    const allCats2 = [...new Set(all.map(p=>p.category||'未分類'))].sort();
    const newOrder={}, newHidden=[], newCatHidden=[];
    allSources.forEach(s=>{
      newOrder[s] = parseInt(document.getElementById('rstord-'+s)?.value)||99;
      if(!document.getElementById('rstvis-'+s)?.checked) newHidden.push(s);
    });
    const newCatOrder = {};
    allCats2.forEach(c=>{
      if(!document.getElementById('rstcat-'+c)?.checked) newCatHidden.push(c);
      newCatOrder[c] = parseInt(document.getElementById('rstcatord-'+c)?.value)||99;
    });
    await sb.from('settings').upsert({
      key:'restock_sources',
      value: JSON.stringify({order:newOrder,hidden:newHidden,catHidden:newCatHidden,catOrder:newCatOrder}),
      updated_at: new Date().toISOString()
    });
    toast('設定已儲存');
    CM2();
    showRestockList();
  };
}
window.showRestockList = showRestockList;
async function createRestockPO() {
  const selected = [];
  document.querySelectorAll('.restock-cb:checked').forEach(cb => {
    const no = cb.dataset.no, name = cb.dataset.name;
    const qty = parseInt(document.querySelector(`.restock-qty[data-no="${no}"]`)?.value) || 1;
    selected.push({ no, name, qty });
  });
  if(!selected.length) { toast('請勾選至少一項商品','e'); return; }
  const { data: prods } = await sb.from('products').select('product_no,name,spec,cost').in('product_no', selected.map(s=>s.no));
  const prodMap = {};
  (prods||[]).forEach(p => prodMap[p.product_no] = p);
  CM();
  if(!window.loadPOForm){toast('系統錯誤：loadPOForm 未載入','e');return;}
  // loadPOForm 回傳 HTML，需要自己呼叫 OM()
  let poHtml;
  try { poHtml = await window.loadPOForm(); } catch(e) { toast('開表單失敗：'+e.message,'e'); console.error(e); return; }
  OM('新增進貨單', poHtml, '<button class="btn" onclick="CM()">取消</button><button class="btn btn-p" onclick="savePO(false)">建立進貨單</button>', true);
  // 帶入補貨品項
  window._setPoItems(selected.map(s => {
    const p = prodMap[s.no];
    return { id: Date.now()+Math.random(), pno: s.no, _pname: p?.name||s.name, qty: s.qty, price: p?.cost||0, giftQty: 0, amt: s.qty*(p?.cost||0) };
  }));
  window._renderPOItems();
  toast('✅ 已帶入 '+selected.length+' 項商品，請選廠商後儲存');
}
window.createRestockPO = createRestockPO;
