// ═══════════════════════════════════════
// pricecheck.js — 查價區（純試算，不進訂單、不動庫存）
// ═══════════════════════════════════════

var _pcLevel = '零售';
var _pcCart = []; // {product_no, name, spec, qty}
var _pcAllProds = [];
var _pcBrandFilter = '';
var _pcSearch = '';

async function priceCheck() {
  if (!_pcAllProds.length) {
    const { data } = await sb.from('products').select('product_no,name,spec,source,price_founder,price_region,price_city,price_dealer,price_vip,price_retail').eq('is_active',true).order('product_no');
    _pcAllProds = data || [];
  }
  renderPriceCheck();
}
window.priceCheck = priceCheck;

function pcUnitPrice(prod, level) {
  const col = LEVEL_COLS[level] || 'price_retail';
  return prod?.[col] || 0;
}

function renderPriceCheck() {
  const brands = _brandNames.filter(b => _pcAllProds.some(p => p.source === b));

  $('main').innerHTML = `
  <div class="ph"><div><div class="pt">查價區</div><div class="ps">選位階、點商品，直接看價格；不會建立訂單，也不會動到庫存</div></div>
    <div class="ha"><button class="btn btn-s" onclick="pcClearCart()">🗑 清空重新試算</button></div></div>
  <div class="pc">
    <div class="tc" style="margin-bottom:16px">
      <div class="tb"><span class="tt">選擇位階</span></div>
      <div style="padding:14px;display:flex;flex-wrap:wrap;gap:8px">
        ${LEVELS.map(lv=>`<button class="btn ${lv===_pcLevel?'btn-p':''} btn-s" onclick="pcSetLevel('${lv}')">${lv}</button>`).join('')}
      </div>
    </div>

    <div class="tc" style="margin-bottom:16px">
      <div class="tb"><span class="tt">選商品</span>
        <button class="btn btn-s" style="background:var(--bll);color:var(--bl);border-color:var(--bl)" onclick="openBundlePicker('pricecheck')">＋ 加入套組</button>
      </div>
      <div style="padding:14px">
        <div class="ss-wrap" style="margin-bottom:10px">
          <input class="ss-input" id="pc-search-input" placeholder="輸入商品名稱搜尋…" autocomplete="off" value="${_pcSearch}"
            oninput="_pcSearch=this.value;pcRenderProdList()">
        </div>
        ${brands.length ? `<div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:8px;margin-bottom:8px">
          <span onclick="pcSetBrand('')" style="flex-shrink:0;font-size:12px;padding:5px 12px;border-radius:14px;cursor:pointer;white-space:nowrap;${!_pcBrandFilter?'background:var(--ac);color:#fff':'background:var(--sf2);color:var(--tx2)'}">全部品牌</span>
          ${brands.map(b=>`<span onclick="pcSetBrand('${b.replace(/'/g,"\\'")}')" style="flex-shrink:0;font-size:12px;padding:5px 12px;border-radius:14px;cursor:pointer;white-space:nowrap;${_pcBrandFilter===b?'background:var(--ac);color:#fff':'background:var(--sf2);color:var(--tx2)'}">${b}</span>`).join('')}
        </div>` : ''}
        <div id="pc-prod-list" style="max-height:320px;overflow-y:auto;border:1px solid var(--bd);border-radius:var(--r)"></div>
      </div>
    </div>

    <div class="tc">
      <div class="tb"><span class="tt">已選商品（${_pcLevel} 位階）</span></div>
      <div class="tw"><table style="width:100%">
        <tr><th>#</th><th>商品</th><th>單價</th><th>數量</th><th>小計</th><th></th></tr>
        <tbody id="pc-cart-body"></tbody>
      </table></div>
      <div id="pc-cart-total" style="padding:14px 16px;text-align:right;font-size:20px;font-weight:700;border-top:1px solid var(--bd)"></div>
    </div>
  </div>`;

  pcRenderProdList();
  pcRenderCart();
}

function pcSetLevel(lv) {
  _pcLevel = lv;
  renderPriceCheck();
}
window.pcSetLevel = pcSetLevel;

function pcSetBrand(b) {
  _pcBrandFilter = b;
  pcRenderProdList();
}
window.pcSetBrand = pcSetBrand;

function pcRenderProdList() {
  const box = $('pc-prod-list'); if (!box) return;
  let list = _pcAllProds;
  if (_pcBrandFilter) list = list.filter(p => p.source === _pcBrandFilter);
  if (_pcSearch) list = list.filter(p => p.name.includes(_pcSearch) || (p.product_no||'').includes(_pcSearch) || (p.spec||'').includes(_pcSearch));
  box.innerHTML = list.map(p => {
    const price = pcUnitPrice(p, _pcLevel);
    return `<div onclick="pcAddToCart('${p.product_no}')" style="display:flex;justify-content:space-between;align-items:center;padding:9px 12px;cursor:pointer;border-bottom:1px solid var(--bd)"
      onmouseover="this.style.background='var(--acl)'" onmouseout="this.style.background=''">
      <div>
        <div style="font-size:13px;font-weight:500">${p.name}${p.spec?` <span class="badge bb" style="font-size:11px;margin-left:4px">${p.spec}</span>`:''}</div>
        <div style="font-size:11px;color:var(--tx3)">${p.product_no}${p.source?' · '+p.source:''}</div>
      </div>
      <div style="font-weight:700;color:var(--ac);white-space:nowrap;margin-left:10px">${fM(price)}</div>
    </div>`;
  }).join('') || '<div style="padding:16px;text-align:center;color:var(--tx3);font-size:13px">找不到符合的商品</div>';
}
window.pcRenderProdList = pcRenderProdList;

function pcAddToCart(pno) {
  const existing = _pcCart.find(c => c.product_no === pno && !c.bundle_group);
  if (existing) { existing.qty += 1; }
  else {
    const prod = _pcAllProds.find(p => p.product_no === pno);
    if (!prod) return;
    _pcCart.push({ product_no: pno, name: prod.name, spec: prod.spec, qty: 1, giftQty: 0, price_override: null, bundle_name: null, bundle_group: null });
  }
  pcRenderCart();
}
window.pcAddToCart = pcAddToCart;

function pcSetQty(pno, val) {
  const item = _pcCart.find(c => c.product_no === pno);
  if (!item) return;
  const qty = Math.max(0, parseInt(val) || 0);
  if (qty === 0) { _pcCart = _pcCart.filter(c => c.product_no !== pno); }
  else { item.qty = qty; }
  pcRenderCart();
}
window.pcSetQty = pcSetQty;

function pcRemove(pno, bundleGroup) {
  if (bundleGroup) {
    if (!confirm('這是套組裡的一項，要把整個套組一起移除嗎？')) return;
    _pcCart = _pcCart.filter(c => c.bundle_group !== bundleGroup);
  } else {
    _pcCart = _pcCart.filter(c => c.product_no !== pno || c.bundle_group);
  }
  pcRenderCart();
}
window.pcRemove = pcRemove;

function pcClearCart() {
  _pcCart = [];
  pcRenderCart();
}
window.pcClearCart = pcClearCart;

function pcRenderCart() {
  const body = $('pc-cart-body'); if (!body) return;
  let total = 0, prevBG = '', html = '', idx = 0;
  _pcCart.forEach(c => {
    idx++;
    if (c.bundle_group && c.bundle_group !== prevBG) {
      prevBG = c.bundle_group;
      html += `<tr><td colspan="6" style="background:var(--bll);padding:6px 10px;font-weight:600;color:var(--bl);font-size:12px">📦 ${c.bundle_name || '套組'}</td></tr>`;
    } else if (!c.bundle_group) { prevBG = ''; }
    const prod = _pcAllProds.find(p => p.product_no === c.product_no);
    const price = c.price_override != null ? c.price_override : pcUnitPrice(prod, _pcLevel);
    const subtotal = price * c.qty;
    total += subtotal;
    html += `<tr${c.bundle_group?' style="border-left:3px solid var(--bl)"':''}>
      <td style="color:var(--tx3);font-size:12px">${idx}</td>
      <td>${c.name}${c.spec?` <span class="badge bb" style="font-size:11px">${c.spec}</span>`:''}</td>
      <td class="num">${fM(price)}</td>
      <td>${c.bundle_group
        ? `${c.qty}${c.giftQty?`<span style="color:var(--am);font-size:11px;display:block">＋贈${c.giftQty}</span>`:''}`
        : `<input type="number" value="${c.qty}" min="0" onchange="pcSetQty('${c.product_no}',this.value)"
            style="width:60px;padding:4px 6px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;text-align:center;outline:none">`}</td>
      <td class="num" style="font-weight:600">${fM(subtotal)}</td>
      <td><button onclick="pcRemove('${c.product_no}',${c.bundle_group?`'${c.bundle_group}'`:'null'})" style="background:none;border:none;cursor:pointer;color:var(--rd);font-size:18px;line-height:1">×</button></td>
    </tr>`;
  });
  body.innerHTML = html || '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--tx3)">還沒選任何商品，點上面的商品清單加入，或加入套組</td></tr>';

  const totalEl = $('pc-cart-total');
  if (totalEl) totalEl.innerHTML = `共 ${_pcCart.reduce((s,c)=>s+c.qty+(c.giftQty||0),0)} 件商品　總計：<span style="color:var(--ac)">${fM(total)}</span>`;

  const tbTitle = document.querySelector('.tc:last-child .tt');
  if (tbTitle) tbTitle.textContent = `已選商品（${_pcLevel} 位階）`;
}
window.pcRenderCart = pcRenderCart;