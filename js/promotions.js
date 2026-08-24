// ═══════════════════════════════════════
// promotions.js
// ═══════════════════════════════════════

// 判斷套組是否已經過期：有填時段（快閃活動）就精確到分鐘，沒填就照原本只看日期（到當天結束都算有效）
function isPromoExpired(p) {
  if (!p?.end_date) return false; // 沒有到期日 = 永久有效
  const endStr = p.end_date + 'T' + (p.end_time || '23:59:59');
  return new Date(endStr).getTime() < Date.now();
}
// 判斷套組是否「還沒開始」（快閃活動設了開始時間，現在還沒到）
function isPromoNotStarted(p) {
  if (!p?.start_date) return false;
  const startStr = p.start_date + 'T' + (p.start_time || '00:00:00');
  return new Date(startStr).getTime() > Date.now();
}

var _promoTab = 'all';
var _promoSearch = '';
var _promoPage = 1;
async function promotions() {
  const today_s = today();
  const typeColor = name => promoTypeColor(name);
  const fmt_date = d => d ? d : '—';

  // 先把全部抓回來，在前端依頁籤篩選（活動/套組通常數量不多，這樣篩選跟排序邏輯比較單純）
  const { data: allData } = await sb.from('promotions').select('*');
  const withStatus = (allData||[]).map(p=>({...p, _expired: isPromoExpired(p)}));

  let filtered;
  if(_promoTab==='active') filtered = withStatus.filter(p=>!p._expired);
  else if(_promoTab==='expired') filtered = withStatus.filter(p=>p._expired);
  else filtered = withStatus;
  if(_promoSearch) {
    const kw = _promoSearch;
    filtered = filtered.filter(p=>(p.name||'').includes(kw)||(p.promo_code||'').includes(kw)||(p.description||'').includes(kw));
  }

  // 全部頁籤：未過期排前面，已過期排後面；同組內依名稱排序
  filtered = filtered.slice().sort((a,b)=>{
    if(_promoTab==='all' && a._expired!==b._expired) return a._expired?1:-1;
    return (a.end_date||'9999').localeCompare(b.end_date||'9999');
  });

  const count = filtered.length;
  const tp = Math.max(1, Math.ceil(count/20));
  if(_promoPage>tp) _promoPage=tp;
  const pageData = filtered.slice((_promoPage-1)*20, _promoPage*20);

  const allCount = withStatus.length;
  const activeCount = withStatus.filter(p=>!p._expired).length;
  const expiredCount = withStatus.filter(p=>p._expired).length;

  $('main').innerHTML = `
  <div class="ph"><div><div class="pt">活動/套組管理</div><div class="ps">${allCount} 個</div></div>
    <div class="ha">
      <button class="btn btn-s" onclick="batchBuyGetModal()">⚡ 批次新增買X送Y</button>
      <button class="btn btn-s" onclick="batchBigSmallModal()">⚡ 批次新增買大送小</button>
      <button class="btn btn-p btn-s" onclick="addPromo()">＋ 新增活動/套組</button>
    </div></div>
  <div class="pc">
    <div class="al al-w" style="font-size:12px">
      <b>設計說明：</b>建立套組後，在新增訂單/進貨/借貨時點「加入套組」，系統自動展開所有商品品項（含贈品），不需逐一手動輸入。
      套組過期後仍然可以選用（畫面上會特別標示提醒），過期超過3個月才會從選單中消失。
    </div>
    <div class="tab-bar" style="margin-bottom:12px">
      <div class="tab${_promoTab==='all'?' on':''}" onclick="_promoTab='all';_promoPage=1;promotions()">全部（${allCount}）</div>
      <div class="tab${_promoTab==='active'?' on':''}" onclick="_promoTab='active';_promoPage=1;promotions()">進行中（${activeCount}）</div>
      <div class="tab${_promoTab==='expired'?' on':''}" onclick="_promoTab='expired';_promoPage=1;promotions()">已過期（${expiredCount}）</div>
    </div>
    <div class="tc">
      <div class="tb"><span class="tt">活動/套組列表</span>
        <div class="si"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input placeholder="名稱/代碼/說明…（輸入後按 Enter 搜尋）" value="${_promoSearch}" onkeydown="if(event.key==='Enter'){_promoSearch=this.value;_promoPage=1;promotions();}"></div>
      </div>
      <div class="tw"><table style="width:100%">
        <tr><th>代碼</th><th>名稱</th><th>類型</th><th>有效期間</th><th>套組內容</th><th>狀態</th><th>操作</th></tr>
        ${pageData.map(p => {
          const expired = p._expired;
          const active = p.is_active && !expired;
          return `<tr>
            <td style="font-size:11px;font-family:monospace;color:var(--tx2)">${p.promo_code}</td>
            <td style="font-weight:500">${p.name}</td>
            <td><span class="badge ${typeColor(p.type)}">${p.type}</span></td>
            <td style="font-size:12px">${fmt_date(p.start_date)} ～ ${fmt_date(p.end_date)}${(p.start_time||p.end_time)?`<div style="color:var(--am);font-weight:600">⚡ ${p.start_time||'00:00'}～${p.end_time||'23:59'}</div>`:''}</td>
            <td style="font-size:12px;color:var(--tx2)">${p.description || '—'}</td>
            <td><span class="badge ${active ? 'bg' : 'br2'}">${expired ? '已過期' : p.is_active ? '使用中' : '停用'}</span></td>
            <td><div style="display:flex;gap:3px">
              <button class="btn btn-s" onclick="showPromo('${p.promo_code}')">查看</button>
              <button class="btn btn-s" onclick="editPromo('${p.promo_code}')">編輯</button>
              <button class="btn btn-s" onclick="togglePromo('${p.promo_code}',${p.is_active})">
                ${p.is_active ? '停用' : '啟用'}
              </button>
            </div></td>
          </tr>`;
        }).join('')||`<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--tx3)">尚無資料</td></tr>`}
      </table></div>
      <div class="pg"><span class="pi">第 ${_promoPage}/${tp} 頁，共 ${count} 筆</span>
        ${_promoPage>1?`<button class="btn btn-s" onclick="_promoPage--;promotions()">上一頁</button>`:''}
        ${_promoPage<tp?`<button class="btn btn-s" onclick="_promoPage++;promotions()">下一頁</button>`:''}${pageJump('_promoPage',tp,'promotions')}
      </div>
    </div>
  </div>`;
}
// ══════════════════════════════
// 批次新增「買X送Y」——同一個活動，多個商品各自不同買/送數量，一次全部建立
// ══════════════════════════════
var _batchBGRows = [];
var _batchBGAllProds = [];
async function batchBuyGetModal() {
  const { data: prods } = await sb.from('products').select('product_no,name,spec,stock,source').eq('is_active',true).order('name');
  _batchBGAllProds = prods || [];
  _batchBGRows = [{ id: Date.now(), pno: '', name: '', buy: 5, get: 1 }];
  const buyGetTypeName = promoTypeNames().find(n => promoTypeCalcMode(n)==='buy_get') || '買X送Y';

  OM('批次新增「' + buyGetTypeName + '」套組', `
  <div class="al al-w" style="font-size:12px;margin-bottom:12px">
    先填共用的活動資訊（日期、說明），下面每一行選一個商品、填買幾送幾，送出後會一次幫你建立好每一行各自獨立的套組（各自有自己的代碼），不用一個一個重複建立。
  </div>
  <div class="fg" style="margin-bottom:12px">
    <div class="fl fw"><label>活動名稱前綴（選填，例如「8週年慶」，會自動加在每個套組名稱前面）</label><input id="f-bbgprefix" placeholder="例如：8週年慶"></div>
    <div class="fl"><label>生效日期</label><input id="f-bbgstart" type="date" value="${today()}"></div>
    <div class="fl"><label>到期日（空白=永久）</label><input id="f-bbgend" type="date"></div>
    <div class="fl"><label>限時開始（選填）</label><input id="f-bbgstime" type="time"></div>
    <div class="fl"><label>限時結束（選填）</label><input id="f-bbgetime" type="time"></div>
    <div class="fl fw"><label>說明（選填，會存到每個套組的說明欄）</label><input id="f-bbgdesc" placeholder="例如：8週年慶"></div>
  </div>
  <div class="sh">商品清單（每一行＝一個獨立套組）<span id="batchBGCount" style="font-weight:400;color:var(--tx3);font-size:12px;margin-left:8px">共 ${_batchBGRows.length} 行</span></div>
  <div style="display:grid;grid-template-columns:26px 2.5fr 70px 70px 28px;gap:6px;padding:4px 8px;font-size:10px;font-weight:600;color:var(--tx3);text-transform:uppercase">
    <span>#</span><span>商品</span><span>買幾</span><span>送幾</span><span></span>
  </div>
  <div id="batchBGArea"></div>
  <button class="btn btn-s" onclick="addBatchBGRow()" style="margin-top:6px">＋ 加一行</button>
  `,
  `<button class="btn" onclick="CM()">取消</button>
   <button class="btn btn-p" onclick="saveBatchBuyGet()">批次建立</button>`, true);
  renderBatchBGRows();
}
window.batchBuyGetModal = batchBuyGetModal;

function renderBatchBGRows() {
  const area = $('batchBGArea'); if (!area) return;
  area.innerHTML = _batchBGRows.map((row,idx) => `
  <div style="display:grid;grid-template-columns:26px 2.5fr 70px 70px 28px;gap:6px;align-items:center;background:var(--sf2);border-radius:var(--r);padding:7px;margin-bottom:5px">
    <span style="font-size:12px;color:var(--tx3);text-align:center">${idx+1}</span>
    <div style="position:relative">
      <input type="text" value="${row.pno ? (row.name || row.pno) : ''}" placeholder="輸入關鍵字搜尋商品…"
        style="font-size:12px;padding:5px 7px;border:1px solid var(--bd);border-radius:var(--r);background:var(--sf);width:100%;outline:none"
        oninput="filterBatchBGDrop(${row.id},this.value)" onfocus="filterBatchBGDrop(${row.id},this.value)"
        onblur="setTimeout(()=>{const d=$('bbgdrop-${row.id}');if(d)d.style.display='none';},350)">
      <div id="bbgdrop-${row.id}" style="position:absolute;top:100%;left:0;right:0;background:var(--sf);border:1px solid var(--bd);border-radius:var(--r);z-index:500;display:none;box-shadow:0 4px 12px rgba(0,0,0,.1);overflow:hidden"></div>
    </div>
    <input type="number" value="${row.buy}" min="1" onchange="setBatchBGVal(${row.id},'buy',this.value)"
      style="font-size:12px;padding:5px 7px;border:1px solid var(--bd);border-radius:var(--r);width:100%;outline:none">
    <input type="number" value="${row.get}" min="1" onchange="setBatchBGVal(${row.id},'get',this.value)"
      style="font-size:12px;padding:5px 7px;border:1px solid var(--bd);border-radius:var(--r);width:100%;outline:none">
    <button onclick="rmBatchBGRow(${row.id})" style="background:none;border:none;cursor:pointer;color:var(--rd);font-size:18px;line-height:1">×</button>
  </div>`).join('');
  const countEl = $('batchBGCount');
  if (countEl) countEl.textContent = `共 ${_batchBGRows.length} 行`;
}
window.renderBatchBGRows = renderBatchBGRows;

var _batchBGDropBrand = {};
window.filterBatchBGDrop = (id, q) => {
  const drop = $('bbgdrop-' + id); if (!drop) return;
  const brands = _brandNames.filter(b => _batchBGAllProds.some(p => p.source === b));
  const curBrand = _batchBGDropBrand[id] || '';
  let fil = q ? _batchBGAllProds.filter(p => p.name.includes(q) || (p.product_no || '').includes(q)) : _batchBGAllProds;
  if (curBrand) fil = fil.filter(p => p.source === curBrand);
  drop.style.display = 'block';
  const qEsc = (q || '').replace(/'/g, "\\'");
  const tabsHtml = brands.length ? `
    <div style="display:flex;gap:4px;overflow-x:auto;padding:5px 6px;border-bottom:1px solid var(--bd);background:var(--sf2)">
      <span onmousedown="event.preventDefault();setBatchBGDropBrand(${id},'','${qEsc}')"
        style="flex-shrink:0;font-size:11px;padding:3px 8px;border-radius:10px;cursor:pointer;white-space:nowrap;${!curBrand ? 'background:var(--ac);color:#fff' : 'background:var(--sf);color:var(--tx2)'}">全部</span>
      ${brands.map(b => `<span onmousedown="event.preventDefault();setBatchBGDropBrand(${id},'${b.replace(/'/g, "\\'")}','${qEsc}')"
        style="flex-shrink:0;font-size:11px;padding:3px 8px;border-radius:10px;cursor:pointer;white-space:nowrap;${curBrand === b ? 'background:var(--ac);color:#fff' : 'background:var(--sf);color:var(--tx2)'}">${b}</span>`).join('')}
    </div>` : '';
  drop.innerHTML = tabsHtml + `<div style="max-height:180px;overflow-y:auto">` + (fil.map(p =>
    `<div style="padding:6px 9px;font-size:12px;cursor:pointer" onmouseover="this.style.background='var(--acl)'" onmouseout="this.style.background=''"
      onmousedown="pickBatchBGProd(${id},'${p.product_no.replace(/'/g,"\\'")}','${p.name.replace(/'/g,"\\'")}')">
      ${p.name}${p.spec ? ` (${p.spec})` : ''} <span style="color:var(--tx3)">庫存:${p.stock}</span>
    </div>`).join('') || '<div style="padding:6px 9px;font-size:12px;color:var(--tx3)">無結果</div>') + `</div>`;
};
window.setBatchBGDropBrand = (id, brand, q) => { _batchBGDropBrand[id] = brand; filterBatchBGDrop(id, q || ''); };
window.pickBatchBGProd = (id, pno, name) => {
  const row = _batchBGRows.find(x => x.id === id); if (!row) return;
  row.pno = pno; row.name = name;
  renderBatchBGRows();
  const d = $('bbgdrop-' + id); if (d) d.style.display = 'none';
};
window.setBatchBGVal = (id, key, val) => { const row = _batchBGRows.find(x => x.id === id); if (row) row[key] = Math.max(1, parseInt(val) || 1); };
window.addBatchBGRow = () => { _batchBGRows.push({ id: Date.now() + Math.random(), pno: '', name: '', buy: 5, get: 1 }); renderBatchBGRows(); };
window.rmBatchBGRow = id => { _batchBGRows = _batchBGRows.filter(x => x.id !== id); renderBatchBGRows(); };

async function saveBatchBuyGet() {
  const rows = _batchBGRows.filter(r => r.pno);
  if (!rows.length) { toast('請至少選一個商品', 'e'); return; }
  const prefix = v('bbgprefix');
  const start_date = v('bbgstart') || null;
  const end_date = v('bbgend') || null;
  const start_time = v('bbgstime') || null;
  const end_time = v('bbgetime') || null;
  const description = v('bbgdesc') || null;
  const buyGetTypeName = promoTypeNames().find(n => promoTypeCalcMode(n)==='buy_get') || '買X送Y';

  let ok = 0, fail = 0;
  for (const [idx, row] of rows.entries()) {
    try {
      const code = 'PRO-' + today().replace(/-/g, '').slice(2) + '-' + String(Date.now() + idx).slice(-4);
      const name = (prefix ? prefix + '_' : '') + row.name + ` 買${row.buy}送${row.get}`;
      const { error: pErr } = await sb.from('promotions').insert({
        promo_code: code, name, type: buyGetTypeName,
        start_date, end_date, start_time, end_time, description,
        buy_qty: row.buy, get_qty: row.get, is_active: true,
      });
      if (pErr) throw pErr;
      const { error: iErr } = await sb.from('promotion_items').insert([
        { promo_code: code, product_no: row.pno, product_name: row.name, qty: row.buy, is_gift: false },
        { promo_code: code, product_no: row.pno, product_name: row.name, qty: row.get, is_gift: true },
      ]);
      if (iErr) throw iErr;
      ok++;
    } catch (e) { fail++; }
  }
  toast(`✅ 已建立 ${ok} 個套組${fail ? `，${fail} 個失敗` : ''}`);
  CM();
  promotions();
}
window.saveBatchBuyGet = saveBatchBuyGet;

// ══════════════════════════════
// 批次新增「買大送小」——每一行是「買A商品送B商品」，A、B是兩個不同商品，一次全部建立
// ══════════════════════════════
var _batchBSRows = [];
var _batchBSAllProds = [];
async function batchBigSmallModal() {
  const { data: prods } = await sb.from('products').select('product_no,name,spec,stock,source').eq('is_active',true).order('name');
  _batchBSAllProds = prods || [];
  _batchBSRows = [{ id: Date.now(), bigPno: '', bigName: '', bigQty: 1, smallPno: '', smallName: '', smallQty: 1 }];
  const buyGetTypeName = promoTypeNames().find(n => promoTypeCalcMode(n)==='buy_get') || '買X送Y';

  OM('批次新增「買大送小」套組', `
  <div class="al al-w" style="font-size:12px;margin-bottom:12px">
    買的商品跟送的商品是兩個不同商品（例如買大瓶送小瓶）。先填共用的活動資訊，下面每一行選「買哪個、送哪個」，送出後一次幫你建立好每一行各自獨立的套組。
  </div>
  <div class="fg" style="margin-bottom:12px">
    <div class="fl fw"><label>活動名稱前綴（選填，例如「8週年慶」，會自動加在每個套組名稱前面）</label><input id="f-bbsprefix" placeholder="例如：8週年慶"></div>
    <div class="fl"><label>生效日期</label><input id="f-bbsstart" type="date" value="${today()}"></div>
    <div class="fl"><label>到期日（空白=永久）</label><input id="f-bbsend" type="date"></div>
    <div class="fl"><label>限時開始（選填）</label><input id="f-bbsstime" type="time"></div>
    <div class="fl"><label>限時結束（選填）</label><input id="f-bbsetime" type="time"></div>
    <div class="fl fw"><label>說明（選填，會存到每個套組的說明欄）</label><input id="f-bbsdesc" placeholder="例如：8週年慶"></div>
  </div>
  <div class="sh">商品配對清單（每一行＝一個獨立套組）<span id="batchBSCount" style="font-weight:400;color:var(--tx3);font-size:12px;margin-left:8px">共 ${_batchBSRows.length} 行</span></div>
  <div style="display:grid;grid-template-columns:22px 2fr 55px 2fr 55px 28px;gap:6px;padding:4px 8px;font-size:10px;font-weight:600;color:var(--tx3);text-transform:uppercase">
    <span>#</span><span>買（收費）</span><span>買幾</span><span style="color:var(--am)">送（免費）</span><span>送幾</span><span></span>
  </div>
  <div id="batchBSArea"></div>
  <button class="btn btn-s" onclick="addBatchBSRow()" style="margin-top:6px">＋ 加一行</button>
  `,
  `<button class="btn" onclick="CM()">取消</button>
   <button class="btn btn-p" onclick="saveBatchBigSmall()">批次建立</button>`, true);
  renderBatchBSRows();
}
window.batchBigSmallModal = batchBigSmallModal;

function renderBatchBSRows() {
  const area = $('batchBSArea'); if (!area) return;
  area.innerHTML = _batchBSRows.map((row,idx) => `
  <div style="display:grid;grid-template-columns:22px 2fr 55px 2fr 55px 28px;gap:6px;align-items:center;background:var(--sf2);border-radius:var(--r);padding:7px;margin-bottom:5px">
    <span style="font-size:12px;color:var(--tx3);text-align:center">${idx+1}</span>
    <div style="position:relative">
      <input type="text" value="${row.bigPno ? (row.bigName || row.bigPno) : ''}" placeholder="搜尋要收費的商品…"
        style="font-size:12px;padding:5px 7px;border:1px solid var(--bd);border-radius:var(--r);background:var(--sf);width:100%;outline:none"
        oninput="filterBatchBSDrop(${row.id},'big',this.value)" onfocus="filterBatchBSDrop(${row.id},'big',this.value)"
        onblur="setTimeout(()=>{const d=$('bbsdrop-${row.id}-big');if(d)d.style.display='none';},350)">
      <div id="bbsdrop-${row.id}-big" style="position:absolute;top:100%;left:0;right:0;background:var(--sf);border:1px solid var(--bd);border-radius:var(--r);z-index:500;display:none;box-shadow:0 4px 12px rgba(0,0,0,.1);overflow:hidden"></div>
    </div>
    <input type="number" value="${row.bigQty}" min="1" onchange="setBatchBSVal(${row.id},'bigQty',this.value)"
      style="font-size:12px;padding:5px 7px;border:1px solid var(--bd);border-radius:var(--r);width:100%;outline:none">
    <div style="position:relative">
      <input type="text" value="${row.smallPno ? (row.smallName || row.smallPno) : ''}" placeholder="搜尋要送的商品…"
        style="font-size:12px;padding:5px 7px;border:1px solid var(--am);border-radius:var(--r);background:var(--sf);width:100%;outline:none"
        oninput="filterBatchBSDrop(${row.id},'small',this.value)" onfocus="filterBatchBSDrop(${row.id},'small',this.value)"
        onblur="setTimeout(()=>{const d=$('bbsdrop-${row.id}-small');if(d)d.style.display='none';},350)">
      <div id="bbsdrop-${row.id}-small" style="position:absolute;top:100%;left:0;right:0;background:var(--sf);border:1px solid var(--bd);border-radius:var(--r);z-index:500;display:none;box-shadow:0 4px 12px rgba(0,0,0,.1);overflow:hidden"></div>
    </div>
    <input type="number" value="${row.smallQty}" min="1" onchange="setBatchBSVal(${row.id},'smallQty',this.value)"
      style="font-size:12px;padding:5px 7px;border:1px solid var(--bd);border-radius:var(--r);width:100%;outline:none">
    <button onclick="rmBatchBSRow(${row.id})" style="background:none;border:none;cursor:pointer;color:var(--rd);font-size:18px;line-height:1">×</button>
  </div>`).join('');
  const countEl = $('batchBSCount');
  if (countEl) countEl.textContent = `共 ${_batchBSRows.length} 行`;
}
window.renderBatchBSRows = renderBatchBSRows;

var _batchBSDropBrand = {};
window.filterBatchBSDrop = (id, side, q) => {
  const drop = $('bbsdrop-' + id + '-' + side); if (!drop) return;
  const brands = _brandNames.filter(b => _batchBSAllProds.some(p => p.source === b));
  const dropKey = id + '-' + side;
  const curBrand = _batchBSDropBrand[dropKey] || '';
  let fil = q ? _batchBSAllProds.filter(p => p.name.includes(q) || (p.product_no || '').includes(q)) : _batchBSAllProds;
  if (curBrand) fil = fil.filter(p => p.source === curBrand);
  drop.style.display = 'block';
  const qEsc = (q || '').replace(/'/g, "\\'");
  const tabsHtml = brands.length ? `
    <div style="display:flex;gap:4px;overflow-x:auto;padding:5px 6px;border-bottom:1px solid var(--bd);background:var(--sf2)">
      <span onmousedown="event.preventDefault();setBatchBSDropBrand(${id},'${side}','','${qEsc}')"
        style="flex-shrink:0;font-size:11px;padding:3px 8px;border-radius:10px;cursor:pointer;white-space:nowrap;${!curBrand ? 'background:var(--ac);color:#fff' : 'background:var(--sf);color:var(--tx2)'}">全部</span>
      ${brands.map(b => `<span onmousedown="event.preventDefault();setBatchBSDropBrand(${id},'${side}','${b.replace(/'/g, "\\'")}','${qEsc}')"
        style="flex-shrink:0;font-size:11px;padding:3px 8px;border-radius:10px;cursor:pointer;white-space:nowrap;${curBrand === b ? 'background:var(--ac);color:#fff' : 'background:var(--sf);color:var(--tx2)'}">${b}</span>`).join('')}
    </div>` : '';
  drop.innerHTML = tabsHtml + `<div style="max-height:180px;overflow-y:auto">` + (fil.map(p =>
    `<div style="padding:6px 9px;font-size:12px;cursor:pointer" onmouseover="this.style.background='var(--acl)'" onmouseout="this.style.background=''"
      onmousedown="pickBatchBSProd(${id},'${side}','${p.product_no.replace(/'/g,"\\'")}','${p.name.replace(/'/g,"\\'")}')">
      ${p.name}${p.spec ? ` (${p.spec})` : ''} <span style="color:var(--tx3)">庫存:${p.stock}</span>
    </div>`).join('') || '<div style="padding:6px 9px;font-size:12px;color:var(--tx3)">無結果</div>') + `</div>`;
};
window.setBatchBSDropBrand = (id, side, brand, q) => { _batchBSDropBrand[id + '-' + side] = brand; filterBatchBSDrop(id, side, q || ''); };
window.pickBatchBSProd = (id, side, pno, name) => {
  const row = _batchBSRows.find(x => x.id === id); if (!row) return;
  if (side === 'big') { row.bigPno = pno; row.bigName = name; }
  else { row.smallPno = pno; row.smallName = name; }
  renderBatchBSRows();
  const d = $('bbsdrop-' + id + '-' + side); if (d) d.style.display = 'none';
};
window.setBatchBSVal = (id, key, val) => { const row = _batchBSRows.find(x => x.id === id); if (row) row[key] = Math.max(1, parseInt(val) || 1); };
window.addBatchBSRow = () => { _batchBSRows.push({ id: Date.now() + Math.random(), bigPno: '', bigName: '', bigQty: 1, smallPno: '', smallName: '', smallQty: 1 }); renderBatchBSRows(); };
window.rmBatchBSRow = id => { _batchBSRows = _batchBSRows.filter(x => x.id !== id); renderBatchBSRows(); };

async function saveBatchBigSmall() {
  const rows = _batchBSRows.filter(r => r.bigPno && r.smallPno);
  if (!rows.length) { toast('請至少完整選好一行的「買」跟「送」商品', 'e'); return; }
  const prefix = v('bbsprefix');
  const start_date = v('bbsstart') || null;
  const end_date = v('bbsend') || null;
  const start_time = v('bbsstime') || null;
  const end_time = v('bbsetime') || null;
  const description = v('bbsdesc') || null;
  const buyGetTypeName = promoTypeNames().find(n => promoTypeCalcMode(n)==='buy_get') || '買X送Y';

  let ok = 0, fail = 0;
  for (const [idx, row] of rows.entries()) {
    try {
      const code = 'PRO-' + today().replace(/-/g, '').slice(2) + '-' + String(Date.now() + idx).slice(-4);
      const name = (prefix ? prefix + '_' : '') + `買${row.bigName}送${row.smallName}`;
      const { error: pErr } = await sb.from('promotions').insert({
        promo_code: code, name, type: buyGetTypeName,
        start_date, end_date, start_time, end_time, description,
        buy_qty: row.bigQty, get_qty: row.smallQty, is_active: true,
      });
      if (pErr) throw pErr;
      const { error: iErr } = await sb.from('promotion_items').insert([
        { promo_code: code, product_no: row.bigPno, product_name: row.bigName, qty: row.bigQty, is_gift: false },
        { promo_code: code, product_no: row.smallPno, product_name: row.smallName, qty: row.smallQty, is_gift: true },
      ]);
      if (iErr) throw iErr;
      ok++;
    } catch (e) { fail++; }
  }
  toast(`✅ 已建立 ${ok} 個套組${fail ? `，${fail} 個失敗` : ''}`);
  CM();
  promotions();
}
window.saveBatchBigSmall = saveBatchBigSmall;

async function addPromo() {
  const { data: prods } = await sb.from('products').select('product_no,name,spec,stock,source').eq('is_active',true).order('name');
  _allProdsForPromo = prods || [];
  _promoItems = [];
  const td = today();
  const code = 'PRO-' + td.replace(/-/g, '').slice(2) + '-' + String(Date.now()).slice(-3);
  OM('新增活動/套組', promoForm({ promo_code: code }), promoFoot(false), true);
  renderPromoItems();
}
async function editPromo(code) {
  const [{ data: p }, { data: its }, { data: prods }] = await Promise.all([
    sb.from('promotions').select('*').eq('promo_code', code).single(),
    sb.from('promotion_items').select('*').eq('promo_code', code).order('id'),
    sb.from('products').select('product_no,name,spec,stock,source').order('name'),
  ]);
  _allProdsForPromo = prods || [];
  _promoItems = (its || []).map((i, idx) => ({ id: idx + 1, pno: i.product_no, name: i.product_name, qty: i.qty, is_gift: i.is_gift, price_override: i.price_override }));
  OM('編輯活動/套組', promoForm(p), promoFoot(code), true);
  renderPromoItems();
}
function promoFoot(editCode) {
  return `<button class="btn" onclick="CM()">取消</button><button class="btn btn-p" onclick="savePromo(${editCode ? "'" + editCode + "'" : 'false'})">儲存</button>`;
}
function promoForm(p) {
  p = p || {};
  return `<div class="fg" style="margin-bottom:12px">
    <div class="fl"><label>代碼</label><input id="f-pcode" value="${p.promo_code || ''}" ${p.promo_code && !p.promo_code.startsWith('PRO-') ? 'disabled style="opacity:.6"' : ''}></div>
    <div class="fl"><label>名稱 *</label><input id="f-pname" name="promo-activity-name" autocomplete="on" value="${p.name || ''}"></div>
    <div class="fl"><label>類型</label>
      <select id="f-ptype" onchange="updatePromoFields()">
        ${promoTypeNames().map(t => `<option ${t === p.type ? 'selected' : ''}>${t}</option>`).join('')}
      </select></div>
    <div class="fl"><label>生效日期</label><input id="f-pstart" type="date" value="${p.start_date || ''}"></div>
    <div class="fl"><label>到期日（空白=永久）</label><input id="f-pend" type="date" value="${p.end_date || ''}"></div>
    <div class="fl"><label>限時開始（選填，快閃活動用，例如10:00）</label><input id="f-pstime" type="time" value="${p.start_time || ''}"></div>
    <div class="fl"><label>限時結束（選填，例如13:00）</label><input id="f-petime" type="time" value="${p.end_time || ''}"></div>
    <div class="fl fw" id="promo-extra-fields">
      ${promoExtraFields(p)}
    </div>
    <div class="fl fw"><label>說明（顯示在訂單上）</label><input id="f-pdesc" value="${p.description || ''}"></div>
    <div class="fl fw"><label>備註</label><input id="f-pnote" value="${p.note || ''}"></div>
  </div>
  <div class="sh">套組/活動商品</div>
  <div style="display:grid;grid-template-columns:3fr 60px 80px 60px 28px;gap:6px;padding:4px 8px;font-size:10px;font-weight:600;color:var(--tx3);text-transform:uppercase;letter-spacing:.5px">
    <span>商品</span><span>數量</span><span>套組價</span><span style="color:var(--am)">贈品</span><span></span>
  </div>
  <div id="promoItemsArea"></div>
  <button class="btn btn-s" onclick="addPromoItem()" style="margin-top:6px">＋ 加商品</button>`;
}
function promoExtraFields(p) {
  const calcMode = promoTypeCalcMode(p.type || promoTypeNames()[0]);
  if (calcMode === 'fixed_price') return `<label>套組售價（空白=各商品加總）</label><input id="f-pbprice" type="number" value="${p.bundle_price || ''}">`;
  if (calcMode === 'buy_get') return `<div style="display:flex;gap:8px;align-items:center"><div style="flex:1"><label>購買數量</label><input id="f-pbuy" type="number" value="${p.buy_qty || ''}"></div><div style="flex:1"><label>贈送數量</label><input id="f-pget" type="number" value="${p.get_qty || ''}"></div></div>`;
  if (calcMode === 'discount_amount') return `<label>折扣金額（NT$）</label><input id="f-pdamt" type="number" value="${p.discount_amount || ''}">`;
  if (calcMode === 'discount_pct') return `<label>折扣百分比（0-100）</label><input id="f-pdpct" type="number" min="0" max="100" value="${p.discount_pct || ''}">`;
  return '';
}
function renderPromoItems() {
  const area = $('promoItemsArea'); if (!area) return;
  area.innerHTML = _promoItems.map(item => `
  <div style="display:grid;grid-template-columns:3fr 60px 80px 60px 28px;gap:6px;align-items:center;background:var(--sf2);border-radius:var(--r);padding:7px;margin-bottom:5px">
    <div style="position:relative">
      <input type="text" value="${item.pno ? (item.name || item.pno) : ''}" placeholder="輸入關鍵字搜尋商品…"
        style="font-size:12px;padding:5px 7px;border:1px solid var(--bd);border-radius:var(--r);background:var(--sf);width:100%;outline:none"
        oninput="filterPromoDrop(${item.id},this.value)" onfocus="filterPromoDrop(${item.id},this.value)"
        onblur="setTimeout(()=>closePromoDrop(${item.id}),350)">
      <div id="prodrop-${item.id}" style="position:absolute;top:100%;left:0;right:0;background:var(--sf);border:1px solid var(--bd);border-radius:var(--r);z-index:500;display:none;box-shadow:0 4px 12px rgba(0,0,0,.1);overflow:hidden"></div>
    </div>
    <input type="number" value="${item.qty || 1}" min="1" onchange="setPromoIQ(${item.id},this.value)"
      style="font-size:12px;padding:5px 7px;border:1px solid var(--bd);border-radius:var(--r);width:100%;outline:none">
    <input type="number" value="${item.price_override || ''}" placeholder="套組價" onchange="setPromoIV(${item.id},this.value)"
      style="font-size:12px;padding:5px 7px;border:1px solid var(--bd);border-radius:var(--r);width:100%;outline:none">
    <input type="checkbox" ${item.is_gift ? 'checked' : ''} onchange="setPromoIG(${item.id},this.checked)"
      style="width:16px;height:16px;cursor:pointer" title="勾選=贈品（免費）">
    <button onclick="rmPromoItem(${item.id})" style="background:none;border:none;cursor:pointer;color:var(--rd);font-size:18px;line-height:1">×</button>
  </div>`).join('');
}
async function togglePromo(code, active) {
  await sb.from('promotions').update({ is_active: !active }).eq('promo_code', code);
  toast(!active ? '已啟用' : '已停用'); promotions();
}
var _bundlePickerTab = 'active';
async function openBundlePicker(mode) {
  // mode: 'order' | 'po' | 'loan'
  const today_s = today();
  const cutoff_s = new Date(Date.now() - 90*24*60*60*1000).toISOString().slice(0,10); // 3個月前

  // 過期超過3個月的套組，直接不查出來——通常不會有人拖3個月才照舊套組補單，清單才不會無限變長
  const { data: promos } = await sb.from('promotions').select('*')
    .eq('is_active', true)
    .or(`end_date.is.null,end_date.gte.${cutoff_s}`)
    .order('name');

  window._bundlePickerData = {
    mode,
    active: (promos||[]).filter(p=>!isPromoExpired(p)),
    expired: (promos||[]).filter(p=>isPromoExpired(p)),
  };
  _bundlePickerTab = 'active';
  renderBundlePickerBody();
}
function renderBundlePickerBody() {
  const { mode, active, expired } = window._bundlePickerData||{};
  const tab = _bundlePickerTab;
  const list = tab==='active' ? active : expired;
  const cardHtml = p => {
    const isExpired = tab==='expired';
    return `
    <div style="border:1px solid ${isExpired?'var(--rd)':'var(--bd)'};border-radius:var(--r);padding:10px 12px;margin-bottom:8px;${isExpired?'opacity:.8':''}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span style="font-weight:500">${p.name}${isExpired?' <span class="badge br2" style="font-size:10px">已過期</span>':''}</span>
        <span class="badge ${promoTypeColor(p?.type)}">${p?.type}</span>
      </div>
      <div style="font-size:12px;color:var(--tx2);margin-bottom:8px">
        ${p.description || ''} ${p.bundle_price ? `・套組價 ${fM(p.bundle_price)}` : ''}
        ${p.end_date ? `・<span style="${isExpired?'color:var(--rd)':''}">有效至 ${p.end_date}${p.end_time?' '+p.end_time:''}</span>` : ''}
        ${(p.start_time||p.end_time) ? `<div style="color:var(--am);font-weight:600;margin-top:2px">⚡ 限時 ${p.start_time||'00:00'}～${p.end_time||'23:59'}${isPromoNotStarted(p)?'（尚未開始）':''}</div>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <label style="font-size:12px;color:var(--tx2)">幾組：</label>
        <input type="number" id="bqty-${p.promo_code}" value="1" min="1" max="99"
          style="width:65px;padding:5px 7px;border:1px solid var(--bd);border-radius:var(--r);font-size:14px;font-weight:600;text-align:center;outline:none">
        <button class="btn btn-p btn-s" onclick="applyPromo('${p.promo_code}','${mode}',parseInt(document.getElementById('bqty-${p.promo_code}')?.value)||1)">
          加入 →
        </button>
      </div>
    </div>`;
  };
  OM2('選用套組/活動', `
  <div class="al al-w" style="font-size:12px">選擇套組後，子項目數量會依「組數」自動計算（買2組送的也自動×2）。已過期的套組一樣可以選用；過期超過3個月的套組不會再出現在這裡。</div>
  <div class="tab-bar" style="margin-bottom:10px">
    <div class="tab${tab==='active'?' on':''}" onclick="_bundlePickerTab='active';renderBundlePickerBody()">進行中（${active.length}）</div>
    <div class="tab${tab==='expired'?' on':''}" onclick="_bundlePickerTab='expired';renderBundlePickerBody()">已過期（${expired.length}）</div>
  </div>
  ${list.length === 0 ? `<div style="color:var(--tx3);padding:20px;text-align:center">${tab==='active'?'目前無進行中的套組':'沒有已過期的套組（3個月內）'}</div>` :
    list.map(cardHtml).join('')}`, '');
}
window.renderBundlePickerBody = renderBundlePickerBody;

window.openBundlePicker = openBundlePicker;
window.promotions = promotions;
window.addPromo = addPromo;
window.editPromo = editPromo;
window.savePromo = savePromo;
window.showPromo = showPromo;
window.togglePromo = togglePromo;
async function deletePromo(code) {
  if (!confirm(`確定刪除活動「${code}」？此操作無法復原。`)) return;
  const { error } = await sb.from('promotions').delete().eq('promo_code', code);
  if (error) { toast('刪除失敗：' + error.message, 'e'); return; }
  await logAction('delete', 'promotions', code, `刪除活動 ${code}`, null, null);
  toast('已刪除活動');
  CM();
  promotions();
}

window.deletePromo = deletePromo;
window.renderPromoItems = renderPromoItems;
// ── 活動品項操作函數 ──
window.updatePromoFields = () => {
  const t = $('f-ptype')?.value || '固定套組';
  const ef = $('promo-extra-fields');
  if (ef) ef.innerHTML = promoExtraFields({ type: t });
};

window.addPromoItem = () => { _promoItems.push({ id: Date.now(), pno: '', name: '', qty: 1, is_gift: false, price_override: null }); renderPromoItems(); };

window.rmPromoItem = id => { _promoItems = _promoItems.filter(x => x.id !== id); renderPromoItems(); };

window.setPromoIQ = (id, val) => { const it = _promoItems.find(x => x.id === id); if (it) it.qty = Math.max(1, +val || 1); };

window.setPromoIV = (id, val) => { const it = _promoItems.find(x => x.id === id); if (it) it.price_override = +val || null; };

window.setPromoIG = (id, checked) => { const it = _promoItems.find(x => x.id === id); if (it) it.is_gift = checked; };

window.closePromoDrop = id => { const d = $('prodrop-' + id); if (d) d.style.display = 'none'; };

window.pickPromoItem = (id, pno, name) => {
  const it = _promoItems.find(x => x.id === id); if (!it) return;
  it.pno = pno; it.name = name;
  renderPromoItems();
  closePromoDrop(id);
};

async function savePromo(editCode) {
  const code = v('pcode'), name = v('pname'), type = v('ptype');
  if (!code || !name) { toast('請填寫代碼和名稱', 'e'); return; }
  const payload = {
    promo_code: code, name, type,
    start_date: v('pstart') || null, end_date: v('pend') || null,
    start_time: v('pstime') || null, end_time: v('petime') || null,
    description: v('pdesc') || null, note: v('pnote') || null,
    bundle_price: null, discount_amount: null, discount_pct: null, buy_qty: null, get_qty: null,
  };
  const calcMode = promoTypeCalcMode(type);
  if (calcMode === 'fixed_price') payload.bundle_price = parseFloat($('f-pbprice')?.value) || null;
  if (calcMode === 'buy_get') { payload.buy_qty = parseFloat($('f-pbuy')?.value) || null; payload.get_qty = parseFloat($('f-pget')?.value) || null; }
  if (calcMode === 'discount_amount') payload.discount_amount = parseFloat($('f-pdamt')?.value) || null;
  if (calcMode === 'discount_pct') payload.discount_pct = parseFloat($('f-pdpct')?.value) || null;

  if (editCode) {
    await sb.from('promotions').update(payload).eq('promo_code', editCode);
    await sb.from('promotion_items').delete().eq('promo_code', editCode);
  } else {
    payload.is_active = true;
    const { error } = await sb.from('promotions').insert(payload);
    if (error) { toast('新增失敗：' + error.message, 'e'); return; }
  }
  const items = _promoItems.filter(i => i.pno).map(i => ({
    promo_code: code, product_no: i.pno, product_name: i.name, qty: i.qty, is_gift: i.is_gift, price_override: i.price_override || null
  }));
  if (items.length) await sb.from('promotion_items').insert(items);
  toast(editCode ? '套組已更新' : '套組新增成功！'); CM(); promotions();
}

async function showPromo(code) {
  const [{ data: p }, { data: its }] = await Promise.all([
    sb.from('promotions').select('*').eq('promo_code', code).single(),
    sb.from('promotion_items').select('*').eq('promo_code', code).order('is_gift'),
  ]);
  // 把用到的商品的各位階售價一次抓回來，才能算出這個套組在每個位階實際會是多少錢
  const prodNos = [...new Set((its||[]).filter(i=>!i.price_override).map(i=>i.product_no).filter(Boolean))];
  let prodPriceMap = {};
  if(prodNos.length) {
    const { data:prods } = await sb.from('products').select('product_no,price_founder,price_region,price_city,price_dealer,price_vip,price_retail').in('product_no',prodNos);
    (prods||[]).forEach(pr=>{ prodPriceMap[pr.product_no]=pr; });
  }
  // 依每個位階算這個套組的總價（贈品不計價，有寫死售價的品項用寫死的，其他用商品在該位階的售價 × 數量）
  const levelTotals = {};
  LEVELS.forEach(lv=>{
    const col = LEVEL_COLS[lv];
    levelTotals[lv] = (its||[]).reduce((sum,i)=>{
      if(i.is_gift) return sum;
      const unitPrice = i.price_override!=null ? i.price_override : (prodPriceMap[i.product_no]?.[col]||0);
      return sum + unitPrice*(i.qty||1);
    }, 0);
  });

  const today_s = today();
  const expired = isPromoExpired(p);
  OM(`套組：${p?.name}`, `
  <div class="dg" style="margin-bottom:13px">
    <div class="dr"><span class="dlb">代碼</span><span class="dv" style="font-family:monospace">${p?.promo_code}</span></div>
    <div class="dr"><span class="dlb">類型</span><span class="dv">${p?.type}</span></div>
    <div class="dr"><span class="dlb">有效期間</span><span class="dv">${p?.start_date || '即日起'} ～ ${p?.end_date || '永久'}</span></div>
    ${(p?.start_time||p?.end_time)?`<div class="dr"><span class="dlb">限時時段</span><span class="dv" style="color:var(--am);font-weight:600">⚡ ${p?.start_time||'00:00'} ～ ${p?.end_time||'23:59'}</span></div>`:''}
    <div class="dr"><span class="dlb">狀態</span><span class="dv"><span class="badge ${!expired && p?.is_active ? 'bg' : 'br2'}">${expired ? '已過期' : p?.is_active ? '使用中' : '停用'}</span></span></div>
    ${p?.bundle_price ? `<div class="dr"><span class="dlb">套組售價</span><span class="dv" style="font-weight:600;color:var(--ac)">${fM(p.bundle_price)}</span></div>` : ''}
    ${p?.buy_qty ? `<div class="dr"><span class="dlb">買幾送幾</span><span class="dv">買 ${p.buy_qty} 送 ${p.get_qty}</span></div>` : ''}
    ${p?.discount_amount ? `<div class="dr"><span class="dlb">折扣金額</span><span class="dv">折 ${fM(p.discount_amount)}</span></div>` : ''}
    ${p?.discount_pct ? `<div class="dr"><span class="dlb">折扣比例</span><span class="dv">${p.discount_pct}% off</span></div>` : ''}
    ${p?.description ? `<div class="dr" style="grid-column:1/-1"><span class="dlb">說明</span><span class="dv">${p.description}</span></div>` : ''}
  </div>
  <div class="sh">各位階套組總價（不含贈品，直接算好，不用去訂單才看得到）</div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:8px;margin-bottom:16px">
    ${LEVELS.map(lv=>{
      const cls={創始:'bbr',大區:'bbr',市代:'bb',經銷:'bg',VIP:'ba',零售:'bgr'}[lv]||'bgr';
      return `<div class="badge ${cls}" style="border-radius:var(--r);padding:10px;text-align:center;display:block">
        <div style="font-size:11px;opacity:.8;margin-bottom:4px">${lv}</div>
        <div style="font-size:16px;font-weight:700">${fM(levelTotals[lv])}</div>
      </div>`;}).join('')}
  </div>
  <div class="sh">套組包含商品</div>
  <table class="itb">
    <tr><th>商品</th><th>銷售數</th><th style="color:var(--am)">贈品數</th>${LEVELS.map(lv=>`<th style="font-size:11px">${lv}</th>`).join('')}</tr>
    ${(()=>{
      // 同一個商品的銷售數跟贈品數合併成一列，不同商品才各自一列
      const grouped = {};
      (its||[]).forEach(i=>{
        if(!grouped[i.product_no]) grouped[i.product_no] = { name:i.product_name, qty:0, giftQty:0, price_override:i.price_override };
        if(i.is_gift) grouped[i.product_no].giftQty += (i.qty||1);
        else grouped[i.product_no].qty += (i.qty||1);
      });
      return Object.keys(grouped).map(pno=>{
        const g = grouped[pno];
        const pr = prodPriceMap[pno];
        return `<tr>
          <td>${g.name || '—'}</td>
          <td class="num">${g.qty||'—'}</td>
          <td class="num" style="color:var(--am);font-weight:600">${g.giftQty||'—'}</td>
          ${LEVELS.map(lv=>{
            if(!g.qty) return `<td class="num" style="color:var(--tx3);font-size:12px">贈</td>`;
            const unitPrice = g.price_override!=null ? g.price_override : (pr?.[LEVEL_COLS[lv]]||0);
            return `<td class="num" style="font-size:12px">${fM(unitPrice*g.qty)}</td>`;
          }).join('')}
        </tr>`;
      }).join('');
    })()}
  </table>`);
}

async function togglePromo(code, active) {
  await sb.from('promotions').update({ is_active: !active }).eq('promo_code', code);
  toast(!active ? '已啟用' : '已停用'); promotions();
}

// ── 在訂單/進貨/借貨新增表單中：選用套組 ──
async function applyPromo(code, mode, sets) {
  sets = Math.max(1, parseInt(sets) || 1);
  const [{ data: p }, { data: its }] = await Promise.all([
    sb.from('promotions').select('*').eq('promo_code', code).single(),
    sb.from('promotion_items').select('*').eq('promo_code', code).order('is_gift'),
  ]);
  if (!its || !its.length) { toast('此套組尚無商品設定', 'w'); return; }

  const bundleGroup = 'BG-' + Date.now();

  if (mode === 'order') {
    // 取得客戶位階決定售價
    const lv = $('f-oalv')?.value || '零售';
    const col = LEVEL_COLS[lv] || 'price_retail';

    // 先依商品編號分組：同一個商品的「買」跟「送」合併成一列（qty＝銷售數、giftQty＝贈品數），
    // 不同商品才各自一列，這樣「買5送1」看起來才是一列，不會拆成兩三列都同一個商品名
    const grouped = {};
    for (const i of its) {
      if (!grouped[i.product_no]) grouped[i.product_no] = { qty: 0, giftQty: 0, price_override: i.price_override };
      const itemQty = (i.qty || 1) * sets;
      if (i.is_gift) grouped[i.product_no].giftQty += itemQty;
      else grouped[i.product_no].qty += itemQty;
    }

    for (const pno of Object.keys(grouped)) {
      const g = grouped[pno];
      const { data: prod } = await sb.from('products').select('product_no,name,spec,stock,' + col).eq('product_no', pno).single();
      const unitPrice = g.price_override || prod?.[col] || 0;
      const newItem = {
        id: Date.now() + Math.random(),
        pno: pno,
        qty: g.qty,
        price: unitPrice,
        giftQty: g.giftQty,
        amt: g.qty * unitPrice,
        is_gift: g.qty === 0,
        promo_code: code,
        bundle_name: p.name + (sets > 1 ? ' ×' + sets : ''),
        bundle_group: bundleGroup,
        _pname: prod?.name || pno,
      };
      _items.push(newItem);
    }
    // 套組折扣
    if (p.discount_amount) {
      _items.push({ id: Date.now(), pno: 'DISCOUNT', qty: 1, price: -p.discount_amount, giftQty: 0, amt: -p.discount_amount, _pname: `套組折扣 (${p.name})`, promo_code: code, bundle_group: bundleGroup });
    }
    CM2();
    renderItems();
    toast('套組已展開，請確認品項！');
  } else if (mode === 'po') {
    const grouped = {};
    for (const i of its) {
      if (!grouped[i.product_no]) grouped[i.product_no] = { qty: 0, giftQty: 0, price_override: i.price_override, product_name: i.product_name };
      const pQty = (i.qty || 1) * sets;
      if (i.is_gift) grouped[i.product_no].giftQty += pQty;
      else grouped[i.product_no].qty += pQty;
    }
    for (const pno of Object.keys(grouped)) {
      const g = grouped[pno];
      const prodInfo = _poProds.find(x => x.product_no === pno);
      const price = g.price_override || prodInfo?.cost || 0;
      _poItems.push({ id: Date.now() + Math.random(), pno, qty: g.qty, price, giftQty: g.giftQty, amt: g.qty * price, _pname: g.product_name || prodInfo?.name || pno, promo_code: code, bundle_name: p.name + (sets > 1 ? ' ×' + sets : ''), bundle_group: bundleGroup });
    }
    CM2();
    renderPOItems();
    toast('套組已展開至進貨品項！');
  } else if (mode === 'loan') {
    for (const i of its) {
      const lQty = (i.qty || 1) * sets;
      _loanItems.push({ id: Date.now() + Math.random(), pno: i.product_no, qty: lQty, _pname: i.product_name || i.product_no, promo_code: code, bundle_group: bundleGroup, is_gift: i.is_gift });
    }
    CM2();
    renderLoanItems();
    toast('套組已展開至借貨品項！');
  }
};

window.closePromoDrop = id => { const d = $('prodrop-' + id); if (d) d.style.display = 'none'; };;

window.pickPromoItem = (id, pno, name) => {
  const it = _promoItems.find(x => x.id === id); if (!it) return;
  it.pno = pno; it.name = name;
  renderPromoItems();
  closePromoDrop(id);
};;

window.applyBundle = function applyBundle(code) {
  const promo = (window._allPromos || []).find(p => p.promo_code === code);
  if (!promo) return;
  const items = promo.items || [];
  _promoItems = items.map(i => ({id: Date.now()+Math.random(), pno:i.product_no, name:i.product_name||'', qty:i.qty||1, price:i.unit_price||0, giftQty:i.gift_qty||0, is_gift:!!i.is_gift}));
  renderPromoItems();
};