// ═══════════════════════════════════════
// promotions.js
// ═══════════════════════════════════════

async function promotions() {
  const { data, count } = await sb.from('promotions').select('*', { count: 'exact' }).order('is_active', { ascending: false }).order('end_date', { ascending: true });
  const today_s = today();
  const fmt_date = d => d ? d : '—';
  const typeColor = { '固定套組': 'bb', '買幾送幾': 'bg', '折扣金額': 'ba', '百分比折扣': 'bbr' };

  $('main').innerHTML = `
  <div class="ph"><div><div class="pt">活動/套組管理</div><div class="ps">${count || 0} 個</div></div>
    <div class="ha"><button class="btn btn-p btn-s" onclick="addPromo()">＋ 新增活動/套組</button></div></div>
  <div class="pc">
    <div class="al al-w" style="font-size:12px">
      <b>設計說明：</b>建立套組後，在新增訂單/進貨/借貨時點「加入套組」，系統自動展開所有商品品項（含贈品），不需逐一手動輸入。
      套組有時效性，過期後無法選用。
    </div>
    <div class="tc">
      <div class="tb"><span class="tt">活動/套組列表</span></div>
      <div class="tw"><table style="width:100%">
        <tr><th>代碼</th><th>名稱</th><th>類型</th><th>有效期間</th><th>套組內容</th><th>狀態</th><th>操作</th></tr>
        ${(data || []).map(p => {
          const expired = p.end_date && p.end_date < today_s;
          const active = p.is_active && !expired;
          return `<tr>
            <td style="font-size:11px;font-family:monospace;color:var(--tx2)">${p.promo_code}</td>
            <td style="font-weight:500">${p.name}</td>
            <td><span class="badge ${typeColor[p.type] || 'bgr'}">${p.type}</span></td>
            <td style="font-size:12px">${fmt_date(p.start_date)} ～ ${fmt_date(p.end_date)}</td>
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
        }).join('')}
      </table></div>
    </div>
  </div>`;
}
async function addPromo() {
  const { data: prods } = await sb.from('products').select('product_no,name,spec,stock').eq('is_active',true).order('name');
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
    sb.from('products').select('product_no,name,spec,stock').order('name'),
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
    <div class="fl"><label>名稱 *</label><input id="f-pname" value="${p.name || ''}"></div>
    <div class="fl"><label>類型</label>
      <select id="f-ptype" onchange="updatePromoFields()">
        ${['固定套組', '買幾送幾', '折扣金額', '百分比折扣'].map(t => `<option ${t === p.type ? 'selected' : ''}>${t}</option>`).join('')}
      </select></div>
    <div class="fl"><label>生效日期</label><input id="f-pstart" type="date" value="${p.start_date || ''}"></div>
    <div class="fl"><label>到期日（空白=永久）</label><input id="f-pend" type="date" value="${p.end_date || ''}"></div>
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
  const type = p.type || '固定套組';
  if (type === '固定套組') return `<label>套組售價（空白=各商品加總）</label><input id="f-pbprice" type="number" value="${p.bundle_price || ''}">`;
  if (type === '買幾送幾') return `<div style="display:flex;gap:8px;align-items:center"><div style="flex:1"><label>購買數量</label><input id="f-pbuy" type="number" value="${p.buy_qty || ''}"></div><div style="flex:1"><label>贈送數量</label><input id="f-pget" type="number" value="${p.get_qty || ''}"></div></div>`;
  if (type === '折扣金額') return `<label>折扣金額（NT$）</label><input id="f-pdamt" type="number" value="${p.discount_amount || ''}">`;
  if (type === '百分比折扣') return `<label>折扣百分比（0-100）</label><input id="f-pdpct" type="number" min="0" max="100" value="${p.discount_pct || ''}">`;
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
      <div id="prodrop-${item.id}" style="position:absolute;top:100%;left:0;right:0;background:var(--sf);border:1px solid var(--bd);border-radius:var(--r);max-height:140px;overflow-y:auto;z-index:500;display:none;box-shadow:0 4px 12px rgba(0,0,0,.1)"></div>
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
async function savePromo(editCode) {
  const code = v('pcode'), name = v('pname'), type = v('ptype');
  if (!code || !name) { toast('請填寫代碼和名稱', 'e'); return; }
  const payload = {
    promo_code: code, name, type,
    start_date: v('pstart') || null, end_date: v('pend') || null,
    description: v('pdesc') || null, note: v('pnote') || null,
    bundle_price: null, discount_amount: null, discount_pct: null, buy_qty: null, get_qty: null,
  };
  if (type === '固定套組') payload.bundle_price = parseFloat($('f-pbprice')?.value) || null;
  if (type === '買幾送幾') { payload.buy_qty = parseFloat($('f-pbuy')?.value) || null; payload.get_qty = parseFloat($('f-pget')?.value) || null; }
  if (type === '折扣金額') payload.discount_amount = parseFloat($('f-pdamt')?.value) || null;
  if (type === '百分比折扣') payload.discount_pct = parseFloat($('f-pdpct')?.value) || null;

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
async function togglePromo(code, active) {
  await sb.from('promotions').update({ is_active: !active }).eq('promo_code', code);
  toast(!active ? '已啟用' : '已停用'); promotions();
}
async function openBundlePicker(mode) {
  // mode: 'order' | 'po' | 'loan'
  const today_s = today();
  // 不再把過期套組排除掉——小店不一定天天建單，套組過期後還是常常需要照當初的內容補單，
  // 過期的套組改成用標示提醒，仍然可以直接選用，不用因為過期就整個手動重建品項/贈品
  const { data: promos } = await sb.from('promotions').select('*')
    .eq('is_active', true)
    .order('name');
  const sorted = (promos||[]).slice().sort((a,b)=>{
    const aExp = a.end_date && a.end_date < today_s;
    const bExp = b.end_date && b.end_date < today_s;
    if(aExp!==bExp) return aExp?1:-1; // 未過期排前面
    return (a.name||'').localeCompare(b.name||'');
  });
  OM2('選用套組/活動', `
  <div class="al al-w" style="font-size:12px">選擇套組後，子項目數量會依「組數」自動計算（買2組送的也自動×2）。已過期的套組一樣可以選用，只是特別標示提醒你留意。</div>
  ${sorted.length === 0 ? '<div style="color:var(--tx3);padding:20px;text-align:center">目前無套組</div>' :
    sorted.map(p => {
      const expired = p.end_date && p.end_date < today_s;
      return `
    <div style="border:1px solid ${expired?'var(--rd)':'var(--bd)'};border-radius:var(--r);padding:10px 12px;margin-bottom:8px;${expired?'opacity:.8':''}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span style="font-weight:500">${p.name}${expired?' <span class="badge br2" style="font-size:10px">已過期</span>':''}</span>
        <span class="badge ${p.type === '固定套組' ? 'bb' : p.type === '買幾送幾' ? 'bg' : 'ba'}">${p.type}</span>
      </div>
      <div style="font-size:12px;color:var(--tx2);margin-bottom:8px">
        ${p.description || ''} ${p.bundle_price ? `・套組價 ${fM(p.bundle_price)}` : ''}
        ${p.end_date ? `・<span style="${expired?'color:var(--rd)':''}">有效至 ${p.end_date}</span>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <label style="font-size:12px;color:var(--tx2)">幾組：</label>
        <input type="number" id="bqty-${p.promo_code}" value="1" min="1" max="99"
          style="width:65px;padding:5px 7px;border:1px solid var(--bd);border-radius:var(--r);font-size:14px;font-weight:600;text-align:center;outline:none">
        <button class="btn btn-p btn-s" onclick="applyPromo('${p.promo_code}','${mode}',parseInt(document.getElementById('bqty-${p.promo_code}')?.value)||1)">
          加入 →
        </button>
      </div>
    </div>`;}).join('')}`, '');
}
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

window.applyBundle = async (code) => {
  const { data: promo } = await sb.from('promotions').select('*,promotions_items(*)').eq('promo_code', code).single();
  if (!promo) { toast('找不到套組', 'e'); return; }
  const items = promo.promotions_items || [];
  items.forEach(item => {
    _promoItems.push({
      id: Date.now() + Math.random(),
      pno: item.product_no,
      name: item.product_name || item.product_no,
      qty: item.qty || 1,
      giftQty: item.gift_qty || 0,
      isGift: item.is_gift || false,
    });
  });
  renderPromoItems();
};


// 以下函數定義已移至下方


// ══ 套組表單輔助函數（從 core.js 還原）══
window.updatePromoFields = () => {
  const t = $('f-ptype')?.value || '固定套組';
  const ef = $('promo-extra-fields');
  if (ef) ef.innerHTML = promoExtraFields({ type: t });
};

function renderPromoItems() {
  const area = $('promoItemsArea'); if (!area) return;
  area.innerHTML = _promoItems.map(item => `
  <div style="display:grid;grid-template-columns:3fr 60px 80px 60px 28px;gap:6px;align-items:center;background:var(--sf2);border-radius:var(--r);padding:7px;margin-bottom:5px">
    <div style="position:relative">
      <input type="text" value="${item.pno ? (item.name || item.pno) : ''}" placeholder="輸入關鍵字搜尋商品…"
        style="font-size:12px;padding:5px 7px;border:1px solid var(--bd);border-radius:var(--r);background:var(--sf);width:100%;outline:none"
        oninput="filterPromoDrop(${item.id},this.value)" onfocus="filterPromoDrop(${item.id},this.value)"
        onblur="setTimeout(()=>closePromoDrop(${item.id}),350)">
      <div id="prodrop-${item.id}" style="position:absolute;top:100%;left:0;right:0;background:var(--sf);border:1px solid var(--bd);border-radius:var(--r);max-height:140px;overflow-y:auto;z-index:500;display:none;box-shadow:0 4px 12px rgba(0,0,0,.1)"></div>
    </div>
    <input type="number" value="${item.qty || 1}" min="1" onchange="setPromoIQ(${item.id},this.value)"
      style="font-size:12px;padding:5px 7px;border:1px solid var(--bd);border-radius:var(--r);width:100%;outline:none">
    <input type="number" value="${item.price_override || ''}" placeholder="套組價" onchange="setPromoIV(${item.id},this.value)"
      style="font-size:12px;padding:5px 7px;border:1px solid var(--bd);border-radius:var(--r);width:100%;outline:none">
    <input type="checkbox" ${item.is_gift ? 'checked' : ''} onchange="setPromoIG(${item.id},this.checked)"
      style="width:16px;height:16px;cursor:pointer" title="勾選=贈品（免費）">
    <button onclick="rmPromoItem(${item.id})" style="background:none;border:none;cursor:pointer;color:var(--rd);font-size:18px;line-height:1">×</button>
  </div>`).join('');
};

window.addPromoItem = () => { _promoItems.push({ id: Date.now(), pno: '', name: '', qty: 1, is_gift: false, price_override: null }); renderPromoItems(); };;

window.rmPromoItem = id => { _promoItems = _promoItems.filter(x => x.id !== id); renderPromoItems(); };;

window.setPromoIQ = (id, val) => { const it = _promoItems.find(x => x.id === id); if (it) it.qty = Math.max(1, +val || 1); };;

window.setPromoIV = (id, val) => { const it = _promoItems.find(x => x.id === id); if (it) it.price_override = +val || null; };;

window.setPromoIG = (id, checked) => { const it = _promoItems.find(x => x.id === id); if (it) it.is_gift = checked; };

async function savePromo(editCode) {
  const code = v('pcode'), name = v('pname'), type = v('ptype');
  if (!code || !name) { toast('請填寫代碼和名稱', 'e'); return; }
  const payload = {
    promo_code: code, name, type,
    start_date: v('pstart') || null, end_date: v('pend') || null,
    description: v('pdesc') || null, note: v('pnote') || null,
    bundle_price: null, discount_amount: null, discount_pct: null, buy_qty: null, get_qty: null,
  };
  if (type === '固定套組') payload.bundle_price = parseFloat($('f-pbprice')?.value) || null;
  if (type === '買幾送幾') { payload.buy_qty = parseFloat($('f-pbuy')?.value) || null; payload.get_qty = parseFloat($('f-pget')?.value) || null; }
  if (type === '折扣金額') payload.discount_amount = parseFloat($('f-pdamt')?.value) || null;
  if (type === '百分比折扣') payload.discount_pct = parseFloat($('f-pdpct')?.value) || null;

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
  const expired = p?.end_date && p.end_date < today_s;
  OM(`套組：${p?.name}`, `
  <div class="dg" style="margin-bottom:13px">
    <div class="dr"><span class="dlb">代碼</span><span class="dv" style="font-family:monospace">${p?.promo_code}</span></div>
    <div class="dr"><span class="dlb">類型</span><span class="dv">${p?.type}</span></div>
    <div class="dr"><span class="dlb">有效期間</span><span class="dv">${p?.start_date || '即日起'} ～ ${p?.end_date || '永久'}</span></div>
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
    <tr><th>商品</th><th>數量</th><th>性質</th>${LEVELS.map(lv=>`<th style="font-size:11px">${lv}</th>`).join('')}</tr>
    ${(its || []).map(i => {
      const pr = prodPriceMap[i.product_no];
      return `<tr>
      <td>${i.product_name || '—'}</td>
      <td class="num">${fN(i.qty)}</td>
      <td><span class="badge ${i.is_gift ? 'ba' : 'bg'}">${i.is_gift ? '贈品' : '商品'}</span></td>
      ${LEVELS.map(lv=>{
        if(i.is_gift) return `<td class="num" style="color:var(--tx3);font-size:12px">贈</td>`;
        const unitPrice = i.price_override!=null ? i.price_override : (pr?.[LEVEL_COLS[lv]]||0);
        return `<td class="num" style="font-size:12px">${fM(unitPrice*(i.qty||1))}</td>`;
      }).join('')}
    </tr>`;}).join('')}
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

  const today_s = today();
  if (p.end_date && p.end_date < today_s) { toast('此套組已過有效期！', 'e'); return; }

  const bundleGroup = 'BG-' + Date.now();

  if (mode === 'order') {
    // 取得客戶位階決定售價
    const lv = $('f-oalv')?.value || '零售';
    const col = LEVEL_COLS[lv] || 'price_retail';

    for (const i of its) {
      const { data: prod } = await sb.from('products').select('product_no,name,spec,stock,' + col).eq('product_no', i.product_no).single();
      const unitPrice = i.is_gift ? 0 : (i.price_override || prod?.[col] || 0);
      const itemQty = (i.qty || 1) * sets;       // 數量 × 組數
      const newItem = {
        id: Date.now() + Math.random(),
        pno: i.product_no,
        qty: i.is_gift ? 0 : itemQty,
        price: unitPrice,
        giftQty: i.is_gift ? itemQty : 0,
        amt: i.is_gift ? 0 : (itemQty * unitPrice),
        is_gift: i.is_gift,
        promo_code: code,
        bundle_name: p.name + (sets > 1 ? ' ×' + sets : ''),
        bundle_group: bundleGroup,
        _pname: i.product_name || prod?.name || i.product_no,
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
    for (const i of its) {
      const pQty = (i.qty || 1) * sets;
      // 從已載入的商品清單取進貨成本，若套組有設定 price_override 則優先使用
      const prodInfo = _poProds.find(x => x.product_no === i.product_no);
      const price = i.is_gift ? 0 : (i.price_override || prodInfo?.cost || 0);
      _poItems.push({ id: Date.now() + Math.random(), pno: i.product_no, qty: i.is_gift ? 0 : pQty, price, giftQty: i.is_gift ? pQty : 0, amt: i.is_gift ? 0 : pQty * price, _pname: i.product_name || prodInfo?.name || i.product_no, promo_code: code, bundle_name: p.name + (sets > 1 ? ' ×' + sets : ''), bundle_group: bundleGroup });
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