// ═══════════════════════════════════════
// misc.js
// ═══════════════════════════════════════

async function printStockTake() {
  // 先載入所有來源和類別供篩選
  const { data: allProds } = await sb.from('products')
    .select('source,category').not('product_no','is',null);
  const sources = [...new Set((allProds||[]).map(p=>p.source).filter(Boolean))].sort();
  const cats = [...new Set((allProds||[]).map(p=>p.category).filter(Boolean))].sort();

  OM('盤點單篩選', `
  <div style="margin-bottom:14px">
    <div class="sh">依主要來源篩選</div>
    <label style="display:flex;align-items:center;gap:6px;margin-bottom:8px;font-size:13px">
      <input type="checkbox" id="src-all" checked onchange="toggleSrcAll(this.checked)" style="width:15px;height:15px"> 全部來源
    </label>
    <div id="src-list" style="display:grid;grid-template-columns:1fr 1fr;gap:5px;padding-left:8px">
      ${sources.map(s=>`<label style="display:flex;align-items:center;gap:5px;font-size:12px">
        <input type="checkbox" class="src-cb" value="${s}" checked style="width:13px;height:13px"> ${s}
      </label>`).join('')}
    </div>
  </div>
  <div style="margin-bottom:14px">
    <div class="sh">依類別篩選</div>
    <label style="display:flex;align-items:center;gap:6px;margin-bottom:8px;font-size:13px">
      <input type="checkbox" id="cat-all" checked onchange="toggleCatAll(this.checked)" style="width:15px;height:15px"> 全部類別
    </label>
    <div id="cat-list" style="display:grid;grid-template-columns:1fr 1fr;gap:5px;padding-left:8px">
      ${cats.map(c=>`<label style="display:flex;align-items:center;gap:5px;font-size:12px">
        <input type="checkbox" class="cat-cb" value="${c}" checked style="width:13px;height:13px"> ${c}
      </label>`).join('')}
    </div>
  </div>
  <div style="margin-bottom:6px">
    <div class="sh">其他選項</div>
    <label style="display:flex;align-items:center;gap:6px;font-size:13px">
      <input type="checkbox" id="hide-zero" style="width:15px;height:15px"> 隱藏零庫存商品
    </label>
  </div>`,
  `<button class="btn" onclick="CM()">取消</button><button class="btn btn-p" onclick="doPrintStockTake()">產生盤點單</button>`);

  window.toggleSrcAll = checked => {
    document.querySelectorAll('.src-cb').forEach(cb => cb.checked = checked);
  };
  window.toggleCatAll = checked => {
    document.querySelectorAll('.cat-cb').forEach(cb => cb.checked = checked);
  };
  // 監聽個別勾選變更全選狀態
  setTimeout(()=>{
    document.querySelectorAll('.src-cb').forEach(cb=>cb.addEventListener('change',()=>{
      const all=document.querySelectorAll('.src-cb');
      document.getElementById('src-all').checked=[...all].every(c=>c.checked);
    }));
    document.querySelectorAll('.cat-cb').forEach(cb=>cb.addEventListener('change',()=>{
      const all=document.querySelectorAll('.cat-cb');
      document.getElementById('cat-all').checked=[...all].every(c=>c.checked);
    }));
  },100);

  window._stockTakeAllProds = allProds;
}
async function doPrintStockTake() {
  const selSrcs = [...document.querySelectorAll('.src-cb:checked')].map(c=>c.value);
  const selCats = [...document.querySelectorAll('.cat-cb:checked')].map(c=>c.value);
  const hideZero = document.getElementById('hide-zero')?.checked;
  CM();

  // 載入商品（套用篩選）
  let q = sb.from('products')
    .select('product_no,name,spec,category,unit,stock,source')
    .not('product_no','is',null);
  // 來源篩選
  if(selSrcs.length > 0) q = q.in('source', selSrcs);
  // 類別篩選
  if(selCats.length > 0) q = q.in('category', selCats);
  if(hideZero) q = q.gt('stock', 0);

  const { data: prods } = await q.order('category').order('product_no');

  if (!prods || !prods.length) { toast('無商品資料', 'w'); return; }

  const today_str = new Date().toLocaleDateString('zh-TW', { year:'numeric', month:'2-digit', day:'2-digit' });
  const today_iso = today();

  // 依類別分組
  const groups = {};
  prods.forEach(p => {
    const cat = p.category || '其他';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(p);
  });

  const totalItems = prods.length;
  const totalStock = prods.reduce((s, p) => s + (p.stock || 0), 0);
  const lowStock = prods.filter(p => p.stock <= 5 && p.stock > 0).length;
  const zeroStock = prods.filter(p => p.stock <= 0).length;

  let tableRows = '';
  let rowNum = 0;
  Object.entries(groups).forEach(([cat, items]) => {
    tableRows += `<tr class="cat-header"><td colspan="8">${cat}</td></tr>`;
    items.forEach(p => {
      rowNum++;
      const stockClass = p.stock <= 0 ? 'zero' : p.stock <= 5 ? 'low' : '';
      tableRows += `
      <tr class="${stockClass}">
        <td class="center">${rowNum}</td>
        <td class="mono">${p.product_no}</td>
        <td>${p.name}${p.spec ? `<span class="spec"> ${p.spec}</span>` : ''}</td>
        <td class="center">${p.unit || '個'}</td>
        <td class="right sys-stock ${stockClass}">${p.stock || 0}</td>
        <td class="right actual-stock"></td>
        <td class="right diff"></td>
        <td class="note-col"></td>
      </tr>`;
    });
  });

  const win = window.open('', '_blank', 'width=1000,height=700');
  win.document.write(`<!DOCTYPE html>
<html lang="zh-TW"><head><meta charset="UTF-8">
<title>慢樂仙坊・庫存盤點單 ${today_iso}</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Noto Sans TC', system-ui, sans-serif; font-size: 12px; color: #111; padding: 20px; }
.header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid #111; }
.header h1 { font-size: 20px; font-weight: 700; }
.header .meta { text-align: right; font-size: 11px; color: #555; line-height: 1.8; }
.summary { display: flex; gap: 20px; margin-bottom: 14px; }
.summary-box { border: 1px solid #ddd; border-radius: 6px; padding: 8px 14px; min-width: 100px; text-align: center; }
.summary-box .label { font-size: 10px; color: #777; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 3px; }
.summary-box .val { font-size: 18px; font-weight: 700; }
.val.red { color: #c0392b; } .val.amber { color: #b8860b; } .val.green { color: #2d6a2d; }
table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
th { background: #1a1714; color: #fff; padding: 7px 8px; text-align: left; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; white-space: nowrap; }
td { padding: 6px 8px; border-bottom: 1px solid #eee; vertical-align: middle; }
tr:hover td { background: #f9f9f9; }
.cat-header td { background: #f0ede6; font-weight: 700; font-size: 11px; color: #5c7a5c; padding: 5px 8px; border-bottom: 1px solid #c8c2b8; letter-spacing: .5px; }
tr.zero td { color: #c0392b; }
tr.low td { color: #b8860b; }
.center { text-align: center; }
.right { text-align: right; }
.mono { font-family: monospace; font-size: 11px; color: #666; }
.spec { color: #888; font-size: 11px; }
.sys-stock { font-weight: 700; }
tr.zero .sys-stock { color: #c0392b; }
tr.low .sys-stock { color: #b8860b; }
.actual-stock { background: #fffde7; min-width: 60px; border-left: 1px dashed #ccc; }
.diff { background: #f0f4ff; min-width: 50px; border-left: 1px dashed #ccc; }
.note-col { min-width: 80px; background: #fafafa; border-left: 1px dashed #ccc; }
.col-sys { color: #2d6a2d; }
.col-actual { color: #b8860b; }
.col-diff { color: #2c5f8a; }
.footer { margin-top: 20px; padding-top: 12px; border-top: 1px solid #ddd; display: flex; justify-content: space-between; font-size: 11px; color: #888; }
.sign-area { display: flex; gap: 40px; margin-top: 20px; }
.sign-box { flex: 1; border-top: 1px solid #999; padding-top: 4px; text-align: center; font-size: 11px; color: #666; }
.legend { font-size: 10px; color: #888; margin-bottom: 8px; }
.legend span { margin-right: 12px; }
.legend .z { color: #c0392b; font-weight: 600; }
.legend .l { color: #b8860b; font-weight: 600; }
@media print {
  button { display: none !important; }
  body { padding: 10px; }
  .actual-stock, .diff, .note-col { min-height: 22px; }
}
</style>
</head><body>
<div class="no-print" style="margin-bottom:12px;display:flex;gap:8px">
  <button onclick="window.print()" style="padding:8px 18px;background:#5c7a5c;color:#fff;border:none;border-radius:6px;font-size:14px;cursor:pointer;font-weight:600">🖨 列印盤點單</button>
  <button onclick="window.close()" style="padding:8px 14px;border:1px solid #ccc;background:#fff;border-radius:6px;font-size:13px;cursor:pointer">關閉</button>
  <span style="font-size:11px;color:#888;line-height:36px">列印後，在「實際數量」欄手寫填入盤點結果，「差異」欄填入系統數-實際數</span>
</div>
<div class="header">
  <div>
    <h1>慢樂仙坊・庫存盤點單</h1>
    <div style="font-size:12px;color:#666;margin-top:4px">盤點日期：${today_str} &nbsp;|&nbsp; 列印時間：${new Date().toLocaleTimeString('zh-TW')}</div>
  </div>
  <div class="meta">
    商品種類：${totalItems} 項<br>
    系統總庫存：${totalStock.toLocaleString('zh-TW')} 件<br>
    零庫存：${zeroStock} 項 &nbsp; 低庫存（≤5）：${lowStock} 項
  </div>
</div>
<div class="summary">
  <div class="summary-box"><div class="label">商品種類</div><div class="val">${totalItems}</div></div>
  <div class="summary-box"><div class="label">系統總庫存</div><div class="val green">${totalStock.toLocaleString('zh-TW')}</div></div>
  <div class="summary-box"><div class="label">零庫存</div><div class="val red">${zeroStock}</div></div>
  <div class="summary-box"><div class="label">低庫存(≤5)</div><div class="val amber">${lowStock}</div></div>
</div>
<div class="legend">
  <span class="z">■ 紅色 = 庫存歸零</span>
  <span class="l">■ 橙色 = 低庫存（≤5）</span>
</div>
<table>
  <thead>
    <tr>
      <th style="width:30px">#</th>
      <th style="width:90px">商品編號</th>
      <th>商品名稱</th>
      <th style="width:40px">單位</th>
      <th style="width:65px" class="col-sys">系統數量</th>
      <th style="width:65px" class="col-actual">實際數量</th>
      <th style="width:55px" class="col-diff">差異</th>
      <th style="width:100px">備註</th>
    </tr>
  </thead>
  <tbody>${tableRows}</tbody>
</table>
<div class="sign-area">
  <div class="sign-box">盤點人員</div>
  <div class="sign-box">複核人員</div>
  <div class="sign-box">主管簽核</div>
  <div class="sign-box">盤點完成日期</div>
</div>
<div class="footer">
  <span>慢樂仙坊進銷存系統・自動產生</span>
  <span>第 1 頁，共 1 頁</span>
</div>
</body></html>`);
  win.document.close();
}
window.printStockTake = printStockTake;
window.doPrintStockTake = doPrintStockTake;
async function openSplitBag() {
  const { data: prods } = await sb.from('products')
    .select('product_no,name,spec,stock,category')
    .not('product_no','is',null)
    .order('name');
  _splitProds = prods || [];
  _splitItems = [];

  OM('拆袋/拆箱作業', `
  <div class="al al-w" style="font-size:12px">
    <b>使用說明：</b>選擇要拆解的商品（如福袋），填入要拆出的數量，再填入拆解後各品項及數量。
    完成後系統自動扣除原品項庫存、增加各拆出品項庫存，並記錄備註。
  </div>
  <div class="sh">來源商品（要拆解的）</div>
  <div style="display:grid;grid-template-columns:3fr 80px;gap:8px;margin-bottom:4px;align-items:end">
    <div class="fl"><label>商品</label>
      <div style="position:relative">
        <input type="text" id="split-src-inp" placeholder="輸入關鍵字搜尋…"
          style="width:100%;padding:7px 8px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;outline:none"
          oninput="filterSplitSrc(this.value)" onfocus="filterSplitSrc(this.value)"
          onblur="setTimeout(()=>$('split-src-drop')?.classList.remove('open'),200)">
        <input type="hidden" id="split-src-pno">
        <div id="split-src-drop" style="position:absolute;top:100%;left:0;right:0;background:var(--sf);border:1px solid var(--bd);border-radius:var(--r);max-height:160px;overflow-y:auto;z-index:500;display:none;box-shadow:0 4px 12px rgba(0,0,0,.1)"></div>
      </div>
    </div>
    <div class="fl"><label>拆解數量</label>
      <input type="number" id="split-src-qty" value="1" min="1"
        style="width:100%;padding:7px 8px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;outline:none">
    </div>
  </div>
  <div id="split-src-info" style="font-size:12px;color:var(--tx2);margin-bottom:10px;padding:5px 8px;background:var(--sf2);border-radius:var(--r)">
    選擇商品後顯示目前庫存
  </div>
  <div class="sh">拆出品項</div>
  <div style="display:grid;grid-template-columns:3fr 80px 28px;gap:6px;padding:3px 6px;font-size:10px;font-weight:600;color:var(--tx3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">
    <span>商品</span><span>數量</span><span></span>
  </div>
  <div id="splitItemsArea"></div>
  <button class="btn btn-s" onclick="addSplitItem()" style="margin-top:6px">＋ 加品項</button>
  <div style="margin-top:12px">
    <div class="fl"><label>備註</label>
      <input id="split-note" placeholder="例：愛閃耀福袋 2026/05 批次"
        style="width:100%;padding:7px 8px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;outline:none">
    </div>
  </div>`,
  `<button class="btn" onclick="CM()">取消</button><button class="btn btn-p" onclick="doSplitBag()">確認拆袋（更新庫存）</button>`);

  window.filterSplitSrc = q => {
    const drop = $('split-src-drop'); if(!drop) return;
    const fil = q ? _splitProds.filter(p=>p.name.includes(q)||(p.product_no||'').includes(q)) : _splitProds;
    drop.style.display = 'block';
    drop.innerHTML = fil.slice(0,30).map(p=>
      `<div style="padding:6px 9px;font-size:12px;cursor:pointer"
        onmouseover="this.style.background='var(--acl)'" onmouseout="this.style.background=''"
        onmousedown="pickSplitSrc('${p.product_no.replace(/'/g,"\\'")}','${p.name.replace(/'/g,"\\'")}',${p.stock})">
        ${p.name}${p.spec?` (${p.spec})`:''} <span style="color:var(--tx3)">庫存:${p.stock}</span>
      </div>`
    ).join('') || '<div style="padding:6px 9px;font-size:12px;color:var(--tx3)">無結果</div>';
  };
  window.pickSplitSrc = (pno, name, stock) => {
    $('split-src-pno').value = pno;
    $('split-src-inp').value = name;
    $('split-src-drop').style.display = 'none';
    $('split-src-info').innerHTML = `<span style="font-weight:600">${name}</span> 目前庫存：<span style="font-weight:700;color:var(--ac)">${stock}</span>`;
  };
  renderSplitItems();
}
function renderSplitItems() {
  const area = $('splitItemsArea'); if(!area) return;
  area.innerHTML = _splitItems.map(item => `
  <div style="display:grid;grid-template-columns:3fr 80px 28px;gap:6px;align-items:center;background:var(--sf2);border-radius:var(--r);padding:7px;margin-bottom:5px">
    <div style="position:relative">
      <input type="text" value="${item.name||''}" placeholder="輸入關鍵字搜尋商品…"
        style="font-size:12px;padding:5px 7px;border:1px solid var(--bd);border-radius:var(--r);background:var(--sf);width:100%;outline:none"
        oninput="filterSplitDrop(${item.id},this.value)" onfocus="filterSplitDrop(${item.id},this.value)"
        onblur="setTimeout(()=>closeSplitDrop(${item.id}),350)">
      <div id="sdrop-${item.id}" style="position:absolute;top:100%;left:0;right:0;background:var(--sf);border:1px solid var(--bd);border-radius:var(--r);max-height:140px;overflow-y:auto;z-index:500;display:none;box-shadow:0 4px 12px rgba(0,0,0,.1)"></div>
    </div>
    <input type="number" value="${item.qty||1}" min="1" onchange="setSplitIQ(${item.id},this.value)"
      style="font-size:12px;padding:5px 7px;border:1px solid var(--bd);border-radius:var(--r);width:100%;outline:none">
    <button onclick="rmSplitItem(${item.id})" style="background:none;border:none;cursor:pointer;color:var(--rd);font-size:18px;line-height:1">×</button>
  </div>`).join('');
}
async function doSplitBag() {
  const srcPno = $('split-src-pno')?.value;
  const srcQty = parseInt($('split-src-qty')?.value) || 1;
  const note = $('split-note')?.value || '拆袋作業';
  const outItems = _splitItems.filter(i=>i.pno && i.qty>0);

  if(!srcPno) { toast('請選擇來源商品（要拆解的）', 'e'); return; }
  if(!outItems.length) { toast('請至少新增一項拆出品項', 'e'); return; }

  // 確認來源庫存夠
  const {data:src} = await sb.from('products').select('name,stock').eq('product_no',srcPno).single();
  if(!src) { toast('找不到來源商品', 'e'); return; }
  if(src.stock < srcQty) {
    if(!confirm(`來源商品「${src.name}」庫存僅剩 ${src.stock}，確定要拆 ${srcQty} 個？`)) return;
  }

  // 扣除來源
  const newSrcStock = Math.max(0, src.stock - srcQty);
  await sb.from('products').update({stock: newSrcStock}).eq('product_no', srcPno);

  // 增加各拆出品項
  for(const item of outItems) {
    const {data:p} = await sb.from('products').select('stock').eq('product_no',item.pno).single();
    if(p) await sb.from('products').update({stock: p.stock + item.qty}).eq('product_no',item.pno);
  }

  // 記錄在庫存調整（用 products 備註或直接用 toast 告知）
  toast(`✅ 拆袋完成！「${src.name}」庫存 ${src.stock} → ${newSrcStock}，已增加 ${outItems.length} 項拆出品項`);
  CM();
  products(); // 刷新商品頁
}
window.openSplitBag = openSplitBag;
window.doSplitBag = doSplitBag;
async function auditLogs() {
  const { data, count } = await sb.from('audit_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((alP - 1) * 30, alP * 30 - 1);
  const tp = Math.ceil((count || 0) / 30);

  const actionColor = { create: 'bg', update: 'bb', delete: 'br2', return: 'ba', adjust: 'bbr' };
  const actionLabel = { create: '新增', update: '修改', delete: '刪除', return: '退回', adjust: '調整' };

  $('main').innerHTML = `
  <div class="ph"><div><div class="pt">操作記錄</div><div class="ps">共 ${count || 0} 筆</div></div>
    <div class="ha">
      <div class="fl" style="display:flex;gap:6px;align-items:center">
        <label style="font-size:12px;color:var(--tx2)">操作者名稱：</label>
        <input id="op-name" value="${localStorage.getItem('mls_operator') || ''}" placeholder="輸入你的名字"
          style="padding:5px 8px;border:1px solid var(--bd);border-radius:var(--r);font-size:12px;outline:none;width:100px">
        <button class="btn btn-s" onclick="saveOpName()">儲存</button>
      </div>
    </div></div>
  <div class="pc">
    <div class="al al-w" style="font-size:12px">
      所有新增、修改、刪除、退貨、庫存調整操作都記錄在這裡。設定操作者名稱後，每筆記錄都會帶入你的名字，方便多人操作時追蹤。
    </div>
    <div class="tc">
      <div class="tb"><span class="tt">操作日誌</span></div>
      <div class="tw"><table style="width:100%">
        <tr><th>時間</th><th>操作類型</th><th>資料表</th><th>記錄號</th><th>說明</th><th>操作者</th><th>裝置</th></tr>
        ${(data || []).map(l => `<tr>
          <td style="font-size:11px;white-space:nowrap;color:var(--tx2)">${new Date(l.created_at).toLocaleString('zh-TW')}</td>
          <td><span class="badge ${actionColor[l.action] || 'bgr'}">${actionLabel[l.action] || l.action}</span></td>
          <td style="font-size:11px;color:var(--tx2)">${l.table_name}</td>
          <td style="font-size:11px;font-family:monospace">${l.record_id || '—'}</td>
          <td style="font-size:12px;max-width:280px">${l.description || '—'}</td>
          <td style="font-size:12px">${l.operator || '—'}</td>
          <td style="font-size:10px;color:var(--tx3)">${l.device_id || '—'}</td>
        </tr>`).join('')}
      </table></div>
      <div class="pg"><span class="pi">第 ${alP}/${tp} 頁，共 ${count} 筆</span>
        <div style="display:flex;gap:5px">
          ${alP > 1 ? `<button class="btn btn-s" onclick="alP--;auditLogs()">上一頁</button>` : ''}
          ${alP < tp ? `<button class="btn btn-s" onclick="alP++;auditLogs()">下一頁</button>` : ''}
        </div></div>
    </div>
  </div>`;
}
window.auditLogs = auditLogs;
