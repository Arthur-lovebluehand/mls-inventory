// ══════════════════════════════
// service-credits.js
// 客戶儲值 —— 一位客戶可以有「服務」「產品」兩個獨立帳戶，互不共用餘額
// ══════════════════════════════

const WALLET_TYPES = ['服務','產品'];

async function svcCredits() {
  const { data } = await sb.from('store_credits')
    .select('*').order('customer_name').order('wallet_type');

  $('svc-content').innerHTML = `
  <div style="margin-bottom:12px;display:flex;justify-content:flex-end">
    <button class="btn btn-p btn-s" onclick="svcAddCredit()">＋ 新增儲值</button>
  </div>
  <div class="al al-w" style="font-size:12px;margin-bottom:12px">服務儲值跟產品儲值是分開的兩個帳戶，各自獨立算餘額，不會互相扣用。</div>
  <div class="tc"><div class="tb"><span class="tt">儲值帳戶</span></div>
  <div class="tw"><table style="width:100%">
    <tr><th>客戶</th><th>帳戶類型</th><th>目前餘額</th><th>操作</th></tr>
    ${(data||[]).map(c=>`<tr>
      <td style="font-weight:500">${c.customer_name||c.customer_no}</td>
      <td><span class="badge ${c.wallet_type==='產品'?'bb':'bg'}">${c.wallet_type}</span></td>
      <td class="num" style="font-weight:700;color:${c.balance>0?'var(--ac)':c.balance<0?'var(--rd)':'var(--tx3)'}">
        ${fM(c.balance)}
      </td>
      <td>
        <button class="btn btn-s" onclick="svcCreditHistory('${c.customer_no}','${c.wallet_type}')">記錄</button>
        <button class="btn btn-s" onclick="svcAddCredit('${c.customer_no}','${(c.customer_name||'').replace(/'/g,"\\'")}','${c.wallet_type}')">儲值</button>
      </td>
    </tr>`).join('')||'<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--tx3)">尚無儲值帳戶</td></tr>'}
  </table></div></div>`;
}

window.svcCredits      = svcCredits;
async function svcAddCredit(custNo, custName, walletType) {
  const [{ data:custs },{ data:allProds }] = await Promise.all([
    sb.from('customers').select('customer_no,name,phone').order('name'),
    sb.from('products').select('product_no,name,spec,stock').eq('is_active',true).order('name'),
  ]);
  window._crCusts = custs||[];
  window._crAllProds = allProds||[];
  window._crGifts = [];

  OM('新增儲值',`
  <div class="al al-w" style="font-size:12px;margin-bottom:12px">
    儲值金額和贈送金額會合計加入餘額，記錄中可區分來源。服務帳戶跟產品帳戶是分開的，選錯帳戶會扣錯錢，請注意確認。
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
    <div class="fl"><label>客戶</label>
      <div class="ss-wrap" id="ss-crcust">
        <input class="ss-input" id="ss-inp-crcust" placeholder="輸入姓名搜尋…" autocomplete="off" value="${custName||''}"
          oninput="crFilterCust(this.value)" onfocus="crFilterCust(this.value)"
          onblur="setTimeout(()=>$('ss-drop-crcust')?.classList.remove('open'),200)">
        <input type="hidden" id="ss-val-crcust" value="${custNo||''}">
        <div class="ss-drop" id="ss-drop-crcust"></div>
      </div>
    </div>
    <div class="fl"><label>帳戶類型</label>
      <select id="f-cr-wallet">${WALLET_TYPES.map(w=>`<option ${w===(walletType||'服務')?'selected':''}>${w}</option>`).join('')}</select>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
    ${fi('cr-date','日期','date',new Date().toISOString().split('T')[0])}
    ${fi('cr-amount','儲值金額 *','number','')}
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
    ${fi('cr-bonus','贈送金額（選填）','number','0')}
  </div>
  ${fi('cr-note','備註（例如：存5萬送3千）')}
  <div style="margin-top:14px;padding:12px;background:var(--sf2);border-radius:var(--r)">
    <div style="font-weight:600;margin-bottom:8px;font-size:13px">贈送商品（選填，會直接扣銷售商品庫存）</div>
    <div style="display:grid;grid-template-columns:2fr auto auto;gap:6px;align-items:end">
      <div class="ss-wrap" id="ss-crgift">
        <input class="ss-input" id="ss-inp-crgift" placeholder="輸入商品名稱搜尋…" autocomplete="off"
          oninput="crFilterGiftProd(this.value)" onfocus="crFilterGiftProd(this.value)"
          onblur="setTimeout(()=>$('ss-drop-crgift')?.classList.remove('open'),200)">
        <input type="hidden" id="cr-giftpno">
        <div class="ss-drop" id="ss-drop-crgift"></div>
      </div>
      <input type="number" id="cr-giftqty" value="1" min="1" step="1" placeholder="數量"
        style="width:60px;padding:6px;border:1px solid var(--bd);border-radius:var(--r);font-size:12px">
      <button class="btn btn-s" onclick="crAddGift()">＋ 加入</button>
    </div>
    <div id="cr-gift-list" style="margin-top:8px"></div>
  </div>`,
  `<button class="btn" onclick="CM()">取消</button>
   <button class="btn btn-p" onclick="saveCredit()">確認儲值</button>`);

  window.crFilterCust = q=>{
    const fil = q ? window._crCusts.filter(c=>c.name.includes(q)||(c.phone||'').includes(q)) : window._crCusts;
    const drop = $('ss-drop-crcust'); if(!drop) return;
    drop.classList.add('open');
    drop.style.maxHeight = '280px';
    drop.innerHTML = fil.map(c=>`<div class="ss-opt" onmousedown="crPickCust('${c.customer_no}','${(c.name||'').replace(/'/g,"\\'")}')">${c.name} · ${c.phone||'—'}</div>`).join('')||`<div class="ss-opt no">無結果</div>`;
  };
  window.crPickCust = (cno,name)=>{
    $('ss-inp-crcust').value = name;
    $('ss-val-crcust').value = cno;
    $('ss-drop-crcust')?.classList.remove('open');
  };
  window.crFilterGiftProd = q=>{
    const fil = (q ? window._crAllProds.filter(p=>p.name.includes(q)) : window._crAllProds);
    const drop = $('ss-drop-crgift'); if(!drop) return;
    drop.classList.add('open');
    drop.innerHTML = fil.slice(0,30).map(p=>`<div class="ss-opt" onmousedown="crPickGiftProd('${p.product_no}','${(p.name||'').replace(/'/g,"\\'")}')">${p.name}${p.spec?`（${p.spec}）`:''} [庫${p.stock}]</div>`).join('')||`<div class="ss-opt no">無結果</div>`;
  };
  window.crPickGiftProd = (pno,name)=>{
    $('ss-inp-crgift').value = name;
    $('cr-giftpno').value = pno;
    $('ss-drop-crgift')?.classList.remove('open');
  };
}

window.svcAddCredit    = svcAddCredit;

function crAddGift() {
  const pno = $('cr-giftpno')?.value;
  const name = $('ss-inp-crgift')?.value;
  if(!pno){ toast('請搜尋並選擇商品','e'); return; }
  const qty = parseFloat($('cr-giftqty')?.value)||1;
  window._crGifts.push({ product_no:pno, product_name:name, qty });
  $('ss-inp-crgift').value=''; $('cr-giftpno').value=''; $('cr-giftqty').value=1;
  renderCrGifts();
}
window.crAddGift = crAddGift;
function renderCrGifts() {
  const el = $('cr-gift-list'); if(!el) return;
  el.innerHTML = window._crGifts.map((g,idx)=>`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 8px;background:var(--sf);border-radius:var(--r);margin-bottom:4px;font-size:12px">
      <span>${g.product_name} × ${g.qty}</span>
      <button onclick="crRmGift(${idx})" style="background:none;border:none;cursor:pointer;color:var(--rd);font-size:15px">×</button>
    </div>`).join('');
}
window.renderCrGifts = renderCrGifts;
function crRmGift(idx) { window._crGifts.splice(idx,1); renderCrGifts(); }
window.crRmGift = crRmGift;

async function saveCredit() {
  const custNo = $('ss-val-crcust')?.value;
  const custName = $('ss-inp-crcust')?.value;
  const walletType = v('cr-wallet')||'服務';
  const date = v('cr-date');
  const amount = parseFloat(v('cr-amount'))||0;
  const bonus = parseFloat(v('cr-bonus'))||0;
  const note = v('cr-note');
  const gifts = window._crGifts||[];
  if(!custNo||!date||(amount<=0 && !gifts.length)){ toast('請填寫客戶、日期，並至少填儲值金額或贈送商品其中一項','e'); return; }

  const { data:cr } = await sb.from('store_credits').select('balance').eq('customer_no',custNo).eq('wallet_type',walletType).maybeSingle();
  const oldBal = cr?.balance||0;
  const newBal = oldBal + amount + bonus;

  if(cr) {
    await sb.from('store_credits').update({balance:newBal,customer_name:custName,updated_at:new Date().toISOString()}).eq('customer_no',custNo).eq('wallet_type',walletType);
  } else if(amount>0 || bonus>0) {
    await sb.from('store_credits').insert({customer_no:custNo,customer_name:custName,wallet_type:walletType,balance:newBal});
  }

  if(amount>0) {
    await sb.from('store_credit_records').insert({
      customer_no:custNo, wallet_type:walletType, record_date:date, type:'deposit',
      amount, balance_after:oldBal+amount, note:note||null
    });
  }
  if(bonus>0) {
    await sb.from('store_credit_records').insert({
      customer_no:custNo, wallet_type:walletType, record_date:date, type:'bonus',
      amount:bonus, balance_after:newBal, note:`贈送 ${fM(bonus)}`
    });
  }
  // 贈送商品：扣銷售庫存 + 留記錄（不影響儲值餘額，amount=0）
  for(const g of gifts) {
    const { data:p } = await sb.from('products').select('stock').eq('product_no',g.product_no).single();
    if(p) await sb.from('products').update({stock:Math.max(0,(p.stock||0)-g.qty)}).eq('product_no',g.product_no);
    await sb.from('store_credit_records').insert({
      customer_no:custNo, wallet_type:walletType, record_date:date, type:'gift', amount:0, balance_after:newBal,
      product_no:g.product_no, product_name:g.product_name, product_qty:g.qty,
      note:`贈品：${g.product_name} × ${g.qty}`
    });
  }

  toast(`✅ 已儲存${amount>0?`，餘額：${fM(newBal)}`:''}`);
  CM();
  svcCredits();
}

window.saveCredit      = saveCredit;

// 依日期/建立時間重新計算整條餘額鏈（修改或刪除記錄後用）
async function recomputeCreditChain(custNo, walletType) {
  walletType = walletType || '服務';
  const { data:recs } = await sb.from('store_credit_records').select('*')
    .eq('customer_no',custNo).eq('wallet_type',walletType).order('record_date').order('created_at');
  let bal = 0;
  for(const r of (recs||[])) {
    bal += parseFloat(r.amount)||0;
    if(bal !== parseFloat(r.balance_after)) {
      await sb.from('store_credit_records').update({balance_after:bal}).eq('id',r.id);
    }
  }
  await sb.from('store_credits').update({balance:bal,updated_at:new Date().toISOString()}).eq('customer_no',custNo).eq('wallet_type',walletType);
  return bal;
}
window.recomputeCreditChain = recomputeCreditChain;

async function svcCreditHistory(custNo, walletType) {
  walletType = walletType || '服務';
  const [{ data:cr },{ data:recs }] = await Promise.all([
    sb.from('store_credits').select('*').eq('customer_no',custNo).eq('wallet_type',walletType).maybeSingle(),
    sb.from('store_credit_records').select('*').eq('customer_no',custNo).eq('wallet_type',walletType)
      .order('record_date',{ascending:false}).order('created_at',{ascending:false}).limit(50),
  ]);
  const typeLabel = {deposit:'儲值',bonus:'贈送',deduct:'扣款',gift:'贈品'};
  OM(`儲值記錄：${cr?.customer_name||custNo}（${walletType}帳戶）`,`
  <div style="font-size:16px;font-weight:700;margin-bottom:14px;color:${(cr?.balance||0)>0?'var(--ac)':'var(--rd)'}">
    目前餘額：${fM(cr?.balance||0)}
  </div>
  <div class="tc"><div class="tw"><table style="width:100%">
    <tr><th>日期</th><th>類型</th><th>金額</th><th>餘額</th><th>備註</th><th>操作</th></tr>
    ${(recs||[]).map(r=>`<tr>
      <td style="font-size:12px">${r.record_date}</td>
      <td><span class="badge ${r.type==='deduct'?'br2':r.type==='gift'?'ba':'bg'}">${typeLabel[r.type]||r.type}</span></td>
      <td class="num" style="color:${r.amount<0?'var(--rd)':'var(--ac)'}">${fM(r.amount)}</td>
      <td class="num">${fM(r.balance_after)}</td>
      <td style="font-size:12px;color:var(--tx3)">${r.note||''}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-s" onclick="editCreditRecord(${r.id},'${custNo}','${walletType}')">編輯</button>
        <button class="btn btn-s btn-r" onclick="deleteCreditRecord(${r.id},'${custNo}','${walletType}')">刪除</button>
      </td>
    </tr>`).join('')||'<tr><td colspan="6" style="text-align:center;color:var(--tx3)">尚無記錄</td></tr>'}
  </table></div></div>`,
  `<button class="btn" onclick="CM()">關閉</button>
   <button class="btn btn-p" onclick="CM();svcAddCredit('${custNo}','','${walletType}')">新增儲值</button>`);
}

window.svcCreditHistory= svcCreditHistory;

async function editCreditRecord(id, custNo, walletType) {
  const { data:r } = await sb.from('store_credit_records').select('*').eq('id',id).single();
  if(!r) return;
  const isProduct = r.type==='gift' && r.product_no;
  OM('編輯儲值記錄', `
  ${isProduct?`<div class="al al-w" style="font-size:12px;margin-bottom:10px">這是贈品記錄（${r.product_name} × ${r.product_qty}），這裡只能改日期/備註；商品數量不會重新調整庫存，如果數量填錯建議直接刪除這筆重新登記。</div>`:''}
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
    ${fi('ecr-date','日期','date',r.record_date)}
    ${isProduct?'':fi('ecr-amount','金額','number',r.amount)}
  </div>
  ${fi('ecr-note','備註','text',r.note)}`,
  `<button class="btn" onclick="CM()">取消</button>
   <button class="btn btn-p" onclick="saveEditCreditRecord(${id},'${custNo}','${walletType}',${isProduct})">儲存</button>`);
}
window.editCreditRecord = editCreditRecord;

async function saveEditCreditRecord(id, custNo, walletType, isProduct) {
  const payload = { record_date:v('ecr-date'), note:v('ecr-note')||null };
  if(!isProduct) payload.amount = parseFloat(v('ecr-amount'))||0;
  await sb.from('store_credit_records').update(payload).eq('id',id);
  await recomputeCreditChain(custNo, walletType);
  toast('✅ 已更新');
  CM();
  svcCreditHistory(custNo, walletType);
}
window.saveEditCreditRecord = saveEditCreditRecord;

async function deleteCreditRecord(id, custNo, walletType) {
  const { data:r } = await sb.from('store_credit_records').select('*').eq('id',id).single();
  if(!r) return;
  let restoreStock = false;
  if(r.type==='gift' && r.product_no) {
    restoreStock = confirm(`這筆是贈品記錄（${r.product_name} × ${r.product_qty}）。刪除的同時要把庫存加回來嗎？\n\n確定＝刪除記錄並補回庫存\n取消＝只刪除記錄，不動庫存`);
  } else {
    if(!confirm('確定刪除這筆儲值記錄？')) return;
  }
  if(restoreStock) {
    const { data:p } = await sb.from('products').select('stock').eq('product_no',r.product_no).single();
    if(p) await sb.from('products').update({stock:(p.stock||0)+(r.product_qty||0)}).eq('product_no',r.product_no);
  }
  await sb.from('store_credit_records').delete().eq('id',id);
  await recomputeCreditChain(custNo, walletType);
  toast('✅ 已刪除');
  svcCreditHistory(custNo, walletType);
}
window.deleteCreditRecord = deleteCreditRecord;