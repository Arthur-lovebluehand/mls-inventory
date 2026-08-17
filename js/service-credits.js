// ══════════════════════════════
// service-credits.js
// ══════════════════════════════

async function svcCredits() {
  const { data } = await sb.from('store_credits')
    .select('*').order('customer_name');

  $('svc-content').innerHTML = `
  <div style="margin-bottom:12px;display:flex;justify-content:flex-end">
    <button class="btn btn-p btn-s" onclick="svcAddCredit()">＋ 新增儲值</button>
  </div>
  <div class="tc"><div class="tb"><span class="tt">儲值帳戶</span></div>
  <div class="tw"><table style="width:100%">
    <tr><th>客戶</th><th>目前餘額</th><th>操作</th></tr>
    ${(data||[]).map(c=>`<tr>
      <td style="font-weight:500">${c.customer_name||c.customer_no}</td>
      <td class="num" style="font-weight:700;color:${c.balance>0?'var(--ac)':c.balance<0?'var(--rd)':'var(--tx3)'}">
        ${fM(c.balance)}
      </td>
      <td>
        <button class="btn btn-s" onclick="svcCreditHistory('${c.customer_no}')">記錄</button>
        <button class="btn btn-s" onclick="svcAddCredit('${c.customer_no}','${(c.customer_name||'').replace(/'/g,"\\'")}')">儲值</button>
      </td>
    </tr>`).join('')||'<tr><td colspan="3" style="text-align:center;padding:20px;color:var(--tx3)">尚無儲值帳戶</td></tr>'}
  </table></div></div>`;
}

window.svcCredits      = svcCredits;
async function svcAddCredit(custNo, custName) {
  const { data:custs } = await sb.from('customers').select('customer_no,name,phone').order('name');
  window._crCusts = custs||[];

  OM('新增儲值',`
  <div class="al al-w" style="font-size:12px;margin-bottom:12px">
    儲值金額和贈送金額會合計加入餘額，記錄中可區分來源。
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
    ${fi('cr-date','日期','date',new Date().toISOString().split('T')[0])}
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
    ${fi('cr-amount','儲值金額 *','number','')}
    ${fi('cr-bonus','贈送金額（選填）','number','0')}
  </div>
  ${fi('cr-note','備註（例如：存5萬送3千）')}`,
  `<button class="btn" onclick="CM()">取消</button>
   <button class="btn btn-p" onclick="saveCredit()">確認儲值</button>`);

  window.crFilterCust = q=>{
    const fil = q ? window._crCusts.filter(c=>c.name.includes(q)||(c.phone||'').includes(q)) : window._crCusts;
    const drop = $('ss-drop-crcust'); if(!drop) return;
    drop.classList.add('open');
    drop.innerHTML = fil.slice(0,30).map(c=>`<div class="ss-opt" onmousedown="crPickCust('${c.customer_no}','${(c.name||'').replace(/'/g,"\\'")}')">${c.name} · ${c.phone||'—'}</div>`).join('')||`<div class="ss-opt no">無結果</div>`;
  };
  window.crPickCust = (cno,name)=>{
    $('ss-inp-crcust').value = name;
    $('ss-val-crcust').value = cno;
    $('ss-drop-crcust')?.classList.remove('open');
  };
}

window.svcAddCredit    = svcAddCredit;
async function saveCredit() {
  const custNo = $('ss-val-crcust')?.value;
  const custName = $('ss-inp-crcust')?.value;
  const date = v('cr-date');
  const amount = parseFloat(v('cr-amount'))||0;
  const bonus = parseFloat(v('cr-bonus'))||0;
  const note = v('cr-note');
  if(!custNo||!date||amount<=0){ toast('請填寫客戶、日期和儲值金額','e'); return; }

  // 取目前餘額
  const { data:cr } = await sb.from('store_credits').select('balance').eq('customer_no',custNo).single();
  const oldBal = cr?.balance||0;
  const newBal = oldBal + amount + bonus;

  // 更新或建立帳戶
  if(cr) {
    await sb.from('store_credits').update({balance:newBal,customer_name:custName,updated_at:new Date().toISOString()}).eq('customer_no',custNo);
  } else {
    await sb.from('store_credits').insert({customer_no:custNo,customer_name:custName,balance:newBal});
  }

  // 儲值記錄
  await sb.from('store_credit_records').insert({
    customer_no:custNo, record_date:date, type:'deposit',
    amount, balance_after:oldBal+amount, note:note||null
  });
  // 贈送記錄
  if(bonus>0) {
    await sb.from('store_credit_records').insert({
      customer_no:custNo, record_date:date, type:'bonus',
      amount:bonus, balance_after:newBal, note:`贈送 ${fM(bonus)}`
    });
  }

  toast(`✅ 儲值成功，餘額：${fM(newBal)}`);
  CM();
  svcCredits();
}

window.saveCredit      = saveCredit;
async function svcCreditHistory(custNo) {
  const [{ data:cr },{ data:recs }] = await Promise.all([
    sb.from('store_credits').select('*').eq('customer_no',custNo).single(),
    sb.from('store_credit_records').select('*').eq('customer_no',custNo)
      .order('created_at',{ascending:false}).limit(50),
  ]);
  const typeLabel = {deposit:'儲值',bonus:'贈送',deduct:'扣款',gift:'贈品'};
  OM(`儲值記錄：${cr?.customer_name||custNo}`,`
  <div style="font-size:16px;font-weight:700;margin-bottom:14px;color:${(cr?.balance||0)>0?'var(--ac)':'var(--rd)'}">
    目前餘額：${fM(cr?.balance||0)}
  </div>
  <div class="tc"><div class="tw"><table style="width:100%">
    <tr><th>日期</th><th>類型</th><th>金額</th><th>餘額</th><th>備註</th></tr>
    ${(recs||[]).map(r=>`<tr>
      <td>${r.record_date}</td>
      <td><span class="badge ${r.type==='deduct'?'br2':'bg'}">${typeLabel[r.type]||r.type}</span></td>
      <td class="num" style="color:${r.amount<0?'var(--rd)':'var(--ac)'}">${fM(r.amount)}</td>
      <td class="num">${fM(r.balance_after)}</td>
      <td style="font-size:12px;color:var(--tx3)">${r.note||''}</td>
    </tr>`).join('')||'<tr><td colspan="5" style="text-align:center;color:var(--tx3)">尚無記錄</td></tr>'}
  </table></div></div>`,
  `<button class="btn" onclick="CM()">關閉</button>
   <button class="btn btn-p" onclick="CM();svcAddCredit('${custNo}','')">新增儲值</button>`);
}

window.svcCreditHistory= svcCreditHistory;