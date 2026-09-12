// ═══════════════════════════════════════
// finance.js
// ═══════════════════════════════════════

// ══════════════════════════════
// 營運成本（房租/水電/網路等固定成本）
// ══════════════════════════════
var _opexYear = null; // 目前展開的年份，null=顯示年度總覽
var _opexMonth = null; // 目前展開的月份(YYYY-MM)，null=顯示該年月份彙整

// 支出頻率：決定多久要自動延續一次，以及這筆金額要平均分攤到幾個月的營運成本報表裡。
// monthly=每月一次/攤1個月（不分攤，整筆算在當月）、bimonthly=每兩月一次/攤2個月、yearly=每年一次/攤12個月。
// 頻率跟攤提月數是綁在一起的：多久繳一次，就代表這筆錢是在為接下來那幾個月的成本負責，所以攤提月數＝繳費間隔。
const OPEX_FREQ_MONTHS = { monthly:1, bimonthly:2, yearly:12 };

function addMonthsYm(ym, n){
  const [y,m] = (ym||'').split('-').map(Number);
  if(!y || !m) return ym;
  const d = new Date(y, m-1+n, 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

// 把一筆支出依照「攤提月數」展開成它涵蓋的每一個月＋每月分攤到的金額（用整數金額分攤，
// 餘數放在起始月，確保展開後加總還是等於原始金額，不會因為除不盡而兜不起來）。
function expandOpexToMonths(r){
  const months = Math.max(1, r.amortize_months||1);
  const startYm = (r.expense_date||'').slice(0,7);
  if(!startYm) return [];
  const total = r.amount||0;
  const base = Math.floor(total/months);
  const first = total - base*(months-1);
  const out = [];
  for(let i=0;i<months;i++){
    out.push({ ym:addMonthsYm(startYm,i), amount:i===0?first:base, src:r, isAttributed:i>0, totalMonths:months });
  }
  return out;
}

// 自動延續「固定支出」：勾了頻率（每月/每兩月/每年）的項目，不用自己每次到期都手動再登記一次，
// 系統會自己補上到期的那一筆（金額照上次的，日期照上次的幾號，備註會標明是自動補的方便檢查金額）。
// 用「類別+備註」當作同一筆固定支出的識別（同類別底下可能同時有好幾筆不同的固定支出，例如「雜項」
// 裡有掃地機器人月租、除蟲月費兩筆，備註不同就要分開各自延續，不能用類別直接合併成一筆）。
// 只有「最新一筆」還是有設定頻率才會繼續延續——如果最新一筆頻率已經改成「一般支出」，代表這筆固定支出已經停了，不再自動生。
// 這個函式是「補上到期的這一筆」，不會補過去漏掉好幾期的（如果好幾期沒開系統，只會補回現在這一期）。
//
// 血淚教訓（2026-09）：識別「同一筆」用的 key 一定要用「原始備註」去比對，不能直接用資料庫裡存的
// note 欄位——因為自動補上的那一筆，note 會被加上「（系統自動延續...）」的提示文字，如果比對時沒有先
// 把這段提示文字拿掉，下次比對就會把「加了提示文字的新記錄」跟「原本乾淨的舊記錄」當成不同的兩筆，
// 於是每次一檢查就又補一筆新的，越補越多（曾經在幾分鐘內生出十幾筆重複記錄）。
const OPEX_AUTO_MARK = '（系統自動延續上月固定支出，請確認金額是否有變動）';
const stripOpexAutoMark = note => (note||'').replace('　'+OPEX_AUTO_MARK,'').replace(OPEX_AUTO_MARK,'').trim();
let _opexCarryChecked = false; // 同一個分頁只需要檢查一次，不用每次切換頁面都重跑一次
async function autoCarryForwardOpex(){
  if(_opexCarryChecked) return;
  _opexCarryChecked = true;
  const thisMonth = new Date().toISOString().slice(0,7);
  const { data:all } = await sb.from('operating_expenses').select('id,expense_date,category,amount,recur_freq,amortize_months,note');
  if(!all || !all.length) return;
  const keyOf = r => `${r.category}::${stripOpexAutoMark(r.note)}`;
  const latestByKey = {};
  all.forEach(r=>{
    const k = keyOf(r);
    if(!latestByKey[k] || (r.expense_date||'') > (latestByKey[k].expense_date||'')) latestByKey[k] = r;
  });
  const keysByMonth = {};
  all.forEach(r=>{
    const ym=(r.expense_date||'').slice(0,7);
    if(!ym) return;
    if(!keysByMonth[ym]) keysByMonth[ym] = new Set();
    keysByMonth[ym].add(keyOf(r));
  });
  const [yy,mm] = thisMonth.split('-').map(Number);
  const daysInThisMonth = new Date(yy, mm, 0).getDate();
  const toInsert = [];
  Object.values(latestByKey).forEach((src,idx)=>{
    if(!src.recur_freq) return; // 沒設定頻率＝一般支出，不自動延續
    const interval = Math.max(1, src.amortize_months || OPEX_FREQ_MONTHS[src.recur_freq] || 1);
    const srcYm = (src.expense_date||'').slice(0,7);
    if(!srcYm) return;
    const nextDueYm = addMonthsYm(srcYm, interval);
    if(nextDueYm > thisMonth) return; // 還沒到下一次繳費的月份
    if((keysByMonth[thisMonth]||new Set()).has(keyOf(src))) return; // 這一期已經登記過了
    const day = Math.min(parseInt((src.expense_date||'').slice(8,10))||1, daysInThisMonth);
    const newDate = `${thisMonth}-${String(day).padStart(2,'0')}`;
    const baseNote = stripOpexAutoMark(src.note);
    toInsert.push({
      expense_no: 'OX-'+thisMonth.replace('-','')+'-A'+idx+Date.now().toString().slice(-4),
      expense_date:newDate, category:src.category, amount:src.amount,
      recur_freq:src.recur_freq, amortize_months:src.amortize_months||1, is_recurring:true,
      note: (baseNote?baseNote+'　':'')+OPEX_AUTO_MARK
    });
  });
  if(!toInsert.length) return;
  const { error } = await sb.from('operating_expenses').insert(toInsert);
  if(!error) toast(`✅ 已自動補上 ${toInsert.length} 筆到期的固定支出，記得檢查金額是否需要調整`);
}
window.autoCarryForwardOpex = autoCarryForwardOpex;

async function opex(){
  await autoCarryForwardOpex();
  const { data:allRecs, count } = await sb.from('operating_expenses').select('*',{count:'exact'}).order('expense_date',{ascending:false});

  const thisMonth = new Date().toISOString().slice(0,7);

  // 依「攤提月數」把每一筆記錄展開到它涵蓋的月份，年度/月份彙整都用展開後的金額，
  // 這樣像保費、借址登記費這種一次繳一年的支出，才會平均反映在每個月的營運成本裡，
  // 而不是只有繳費那個月看起來爆增、其他月份看起來很低。
  const yearMap = {}, monthMap = {};
  (allRecs||[]).forEach(r=>{
    expandOpexToMonths(r).forEach(seg=>{
      const yr = seg.ym.slice(0,4);
      if(!yr) return;
      if(!yearMap[yr]) yearMap[yr]={count:0,total:0};
      yearMap[yr].count++; yearMap[yr].total+=seg.amount;
      if(!monthMap[seg.ym]) monthMap[seg.ym]={count:0,total:0,items:[]};
      monthMap[seg.ym].count++; monthMap[seg.ym].total+=seg.amount;
      monthMap[seg.ym].items.push(seg);
    });
  });
  const years = Object.keys(yearMap).sort().reverse();
  const monthTotal = monthMap[thisMonth]?.total || 0;
  const yearTotal = yearMap[thisMonth.slice(0,4)]?.total || 0;

  $('main').innerHTML=`
  <div class="ph"><div><div class="pt">營運成本</div><div class="ps">共 ${count||0} 筆</div></div>
    <div class="ha"><button class="btn btn-p btn-s" onclick="addOpex()">＋ 新增記錄</button></div></div>
  <div class="pc">
    <div class="mg">
      <div class="mc"><div class="ml">本月合計（含攤提）</div><div class="mv cr">${fM(monthTotal)}</div></div>
      <div class="mc"><div class="ml">今年累計（含攤提）</div><div class="mv cr">${fM(yearTotal)}</div></div>
    </div>
    <div class="al al-w" style="font-size:12px">
      記錄房租、水電、網路等跟商品/服務無關、但公司經營一定會花的錢。像保費、借址登記費這種一次繳一年的支出，
      或會計師、水電瓦斯這種兩個月繳一次的支出，新增時選對應的「支出頻率」，系統會自動平均攤提到它涵蓋的每個月，
      月報表看到的才是真實的每月成本。
    </div>`;

  // ── 第一層：年度總覽 ──
  if(!_opexYear) {
    $('main').innerHTML += `
    <div class="tc">
      <div class="tb"><span class="tt">年度總覽（點年份看該年每月彙整，金額已含攤提）</span></div>
      <div class="tw"><table style="width:100%">
        <tr><th>年份</th><th>項目數</th><th style="font-weight:700">金額合計</th></tr>
        ${years.map(yr=>{
          const y=yearMap[yr];
          return `<tr style="cursor:pointer" onclick="_opexYear='${yr}';opex()" onmouseover="this.style.background='var(--acl)'" onmouseout="this.style.background=''">
            <td style="font-weight:700;color:var(--ac);font-size:15px">${yr} ›</td>
            <td>${y.count} 項</td>
            <td class="num" style="font-weight:700;color:var(--rd)">${fM(y.total)}</td>
          </tr>`;
        }).join('')||'<tr><td colspan="3" style="text-align:center;padding:20px;color:var(--tx3)">尚無記錄</td></tr>'}
      </table></div>
    </div>
  </div>`;
    return;
  }

  // ── 第二層：該年度的月份彙整 ──
  if(!_opexMonth) {
    const yearMonths = Object.keys(monthMap).filter(ym=>ym.startsWith(_opexYear)).sort().reverse();
    $('main').innerHTML += `
    <div style="margin-bottom:14px">
      <button class="btn btn-s" onclick="_opexYear=null;opex()">‹ 返回年度總覽</button>
    </div>
    <div class="tc">
      <div class="tb"><span class="tt">${_opexYear} 年月度彙整（點月份看逐筆明細，金額已含攤提）</span></div>
      <div class="tw"><table style="width:100%">
        <tr><th>月份</th><th>項目數</th><th style="font-weight:700">金額合計</th></tr>
        ${yearMonths.map(ym=>{
          const m=monthMap[ym];
          return `<tr style="cursor:pointer" onclick="_opexMonth='${ym}';opex()" onmouseover="this.style.background='var(--acl)'" onmouseout="this.style.background=''">
            <td style="font-weight:600;color:var(--ac)">${ym} ›</td>
            <td>${m.count} 項</td>
            <td class="num" style="font-weight:700;color:var(--rd)">${fM(m.total)}</td>
          </tr>`;
        }).join('')||'<tr><td colspan="3" style="text-align:center;padding:20px;color:var(--tx3)">本年度尚無記錄</td></tr>'}
      </table></div>
    </div>
  </div>`;
    return;
  }

  // ── 第三層：該月逐筆明細 ──
  // 每一列可能是「原始登記的那一筆」，也可能是「從別的月份攤提過來的一部分」（isAttributed），
  // 攤提過來的不能直接編輯/刪除，要回到原始那筆去改，避免改亂攤提關係。
  const monthItems = (monthMap[_opexMonth]?.items || []).slice().sort((a,b)=>(a.src.expense_date||'').localeCompare(b.src.expense_date||''));
  const freqLabel = { monthly:'每月固定', bimonthly:'每兩月', yearly:'每年' };
  $('main').innerHTML += `
    <div style="margin-bottom:14px">
      <button class="btn btn-s" onclick="_opexMonth=null;opex()">‹ 返回 ${_opexYear} 年月度彙整</button>
    </div>
    <div class="tc">
      <div class="tb"><span class="tt">${_opexMonth} 營運成本明細</span></div>
      <div class="tw"><table style="width:100%">
        <tr><th>日期</th><th>類別</th><th>本月金額</th><th>頻率</th><th>備註</th><th>操作</th></tr>
        ${monthItems.map(seg=>{
          const r=seg.src;
          const amtSub = seg.totalMonths>1 ? `<div style="font-size:11px;font-weight:400;color:var(--tx3)">原始 ${fM(r.amount)}，分攤${seg.totalMonths}個月</div>` : '';
          return `<tr ${seg.isAttributed?'style="opacity:.65"':''}>
          <td style="font-size:12px">${seg.isAttributed?_opexMonth:fD(r.expense_date)}</td>
          <td><span class="badge bgr">${r.category}</span></td>
          <td class="num" style="font-weight:600;color:var(--rd)">${fM(seg.amount)}${amtSub}</td>
          <td>${r.recur_freq?`<span class="badge bg">${freqLabel[r.recur_freq]||r.recur_freq}</span>`:'—'}</td>
          <td style="font-size:12px;color:var(--tx3)">${seg.isAttributed?`分攤自 ${fD(r.expense_date)} 那筆`:(r.note||'—')}</td>
          <td style="white-space:nowrap">
            ${seg.isAttributed
              ? `<button class="btn btn-s" onclick="editOpex(${r.id})">查看原始</button>`
              : `<button class="btn btn-s" onclick="editOpex(${r.id})">編輯</button>
                 <button class="btn btn-s btn-r" onclick="deleteOpex(${r.id})">刪除</button>`}
          </td>
        </tr>`;
        }).join('')||'<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--tx3)">本月尚無記錄</td></tr>'}
      </table></div>
    </div>
  </div>`;
}
window.opex = opex;

function addOpex() {
  OM('新增營運成本', `
  <div class="fg">
    ${fi('oxdate','日期','date',today())}
    <div class="fl"><label>類別</label><select id="f-oxcat">${_opexCategories.map(c=>`<option>${c}</option>`).join('')}</select></div>
    ${fi('oxamt','金額 *','number')}
    <div class="fl"><label>支出頻率</label>
      <select id="f-oxfreq">
        <option value="">一般支出（不循環，只算這一筆）</option>
        <option value="monthly">每月固定（每月都要繳）</option>
        <option value="bimonthly">每兩月一次（自動攤提到2個月）</option>
        <option value="yearly">每年一次（自動攤提到12個月）</option>
      </select>
    </div>
    <div class="fl fw">${fi('oxnote','備註（選填）')}</div>
  </div>`,
  `<button class="btn" onclick="CM()">取消</button>
   <button class="btn btn-p" onclick="saveOpex()">新增</button>`);
}
window.addOpex = addOpex;
async function editOpex(id) {
  const { data:r } = await sb.from('operating_expenses').select('*').eq('id',id).single();
  if(!r) return;
  OM('編輯營運成本', `
  <div class="fg">
    ${fi('oxdate','日期','date',r.expense_date)}
    <div class="fl"><label>類別</label><select id="f-oxcat">${_opexCategories.map(c=>`<option ${c===r.category?'selected':''}>${c}</option>`).join('')}</select></div>
    ${fi('oxamt','金額 *','number',r.amount)}
    <div class="fl"><label>支出頻率</label>
      <select id="f-oxfreq">
        <option value="" ${!r.recur_freq?'selected':''}>一般支出（不循環，只算這一筆）</option>
        <option value="monthly" ${r.recur_freq==='monthly'?'selected':''}>每月固定（每月都要繳）</option>
        <option value="bimonthly" ${r.recur_freq==='bimonthly'?'selected':''}>每兩月一次（自動攤提到2個月）</option>
        <option value="yearly" ${r.recur_freq==='yearly'?'selected':''}>每年一次（自動攤提到12個月）</option>
      </select>
    </div>
    <div class="fl fw">${fi('oxnote','備註（選填）','text',r.note)}</div>
  </div>`,
  `<button class="btn" onclick="CM()">取消</button>
   <button class="btn btn-p" onclick="saveOpex(${id})">儲存</button>`);
}
window.editOpex = editOpex;
async function saveOpex(id) {
  const amt = n('oxamt');
  if(!amt) { toast('請填寫金額','e'); return; }
  const freq = v('oxfreq') || null;
  const payload = {
    expense_date:v('oxdate'), category:v('oxcat'), amount:amt,
    recur_freq: freq,
    amortize_months: freq ? OPEX_FREQ_MONTHS[freq] : 1,
    is_recurring: !!freq,
    note:v('oxnote')||null
  };
  if(id) {
    await sb.from('operating_expenses').update(payload).eq('id',id);
  } else {
    payload.expense_no = 'OX-'+v('oxdate').replace(/-/g,'')+'-'+Date.now().toString().slice(-4);
    await sb.from('operating_expenses').insert(payload);
  }
  toast('✅ 已儲存');
  CM();
  opex();
}
window.saveOpex = saveOpex;
async function deleteOpex(id) {
  const { data:r } = await sb.from('operating_expenses').select('amortize_months').eq('id',id).single();
  const months = r?.amortize_months||1;
  const msg = months>1 ? `這筆是分攤${months}個月的支出，刪除後所有攤提到的月份都會一起消失，確定刪除？` : '確定刪除這筆營運成本記錄？';
  if(!confirm(msg)) return;
  await sb.from('operating_expenses').delete().eq('id',id);
  toast('已刪除');
  opex();
}
window.deleteOpex = deleteOpex;

async function bonus(){
  const{data,count}=await sb.from('bonus_records').select('*',{count:'exact'}).order('record_date',{ascending:false}).range((bnP-1)*30,bnP*30-1);
  const tp=Math.ceil((count||0)/30);
  const totals=await sb.from('bonus_records').select('amount,payment_done,direction');
  const outRows=(totals.data||[]).filter(x=>x.direction!=='收入');
  const inRows=(totals.data||[]).filter(x=>x.direction==='收入');
  const paid=outRows.filter(x=>x.payment_done).reduce((s,x)=>s+(x.amount||0),0);
  const unpaid=outRows.filter(x=>!x.payment_done).reduce((s,x)=>s+(x.amount||0),0);
  const recvPaid=inRows.filter(x=>x.payment_done).reduce((s,x)=>s+(x.amount||0),0);
  const recvUnpaid=inRows.filter(x=>!x.payment_done).reduce((s,x)=>s+(x.amount||0),0);
  $('main').innerHTML=`
  <div class="ph"><div><div class="pt">獎金/分潤</div><div class="ps">共 ${count||0} 筆</div></div>
    <div class="ha"><button class="btn btn-p btn-s" onclick="addBonus()">＋ 新增記錄</button></div></div>
  <div class="pc">
    <div class="mg">
      <div class="mc"><div class="ml">已支出（分潤給人）</div><div class="mv cr">${fM(paid)}</div></div>
      <div class="mc"><div class="ml">待支出</div><div class="mv cr">${fM(unpaid)}</div></div>
      <div class="mc"><div class="ml">已收入（上游分潤）</div><div class="mv cg">${fM(recvPaid)}</div></div>
      <div class="mc"><div class="ml">待收入</div><div class="mv cg">${fM(recvUnpaid)}</div></div>
    </div>
    <div class="al al-w" style="font-size:12px">
      <b>獎金/分潤記帳建議：</b>每次收到獎金或需發放分潤時，在此新增一筆記錄，填寫對象、金額、類型（分潤/推薦獎金/層碰獎金/其他）。
      發放完成後勾選「已發放」，財務月結算時此處合計即為當月獎金支出。
    </div>
    <div class="tc">
      <div class="tb"><span class="tt">獎金/分潤記錄</span></div>
      <div class="tw"><table style="width:100%">
        <tr><th>記錄號</th><th>日期</th><th>方向</th><th>對象</th><th>類型</th><th>金額</th><th>發票</th><th>狀態</th><th>操作</th></tr>
        ${(data||[]).map(b=>`<tr>
          <td style="font-size:11px;font-family:monospace;color:var(--tx2)">${b.record_no}</td>
          <td style="font-size:12px">${fD(b.record_date)}</td>
          <td><span class="badge ${b.direction==='收入'?'bg':'br2'}">${b.direction==='收入'?'↙收入':'↗支出'}</span></td>
          <td style="font-weight:500">${b.recipient||'—'}</td>
          <td><span class="badge bgr">${b.type||'—'}</span></td>
          <td class="num" style="font-weight:600;color:${b.direction==='收入'?'var(--ac)':'var(--rd)'}">${fM(b.amount)}</td>
          <td style="font-size:11px;color:var(--tx2)">${b.invoice_no||'—'}</td>
          <td><span class="badge ${b.payment_done?'bg':'br2'}">${b.payment_done?'已完成':'待處理'}</span></td>
          <td><div style="display:flex;gap:3px">
            <button class="btn btn-s" onclick="showBonus('${b.record_no}')">查看</button>
            <button class="btn btn-s" onclick="editBonus('${b.record_no}')">編輯</button>
            <button class="btn btn-s ${b.payment_done?'':'btn-p'}" onclick="toggleBonus('${b.id}',${b.payment_done})">${b.payment_done?'取消':'發放'}</button>
            <button class="btn btn-s btn-r" onclick="dBonus('${b.id}')">刪</button>
          </div></td>
        </tr>`).join('')}
      </table></div>
      <div class="pg"><span class="pi">第${bnP}/${tp}頁</span>
        <div style="display:flex;gap:5px">
          ${bnP>1?`<button class="btn btn-s" onclick="bnP--;bonus()">上一頁</button>`:''}
          ${bnP<tp?`<button class="btn btn-s" onclick="bnP++;bonus()">下一頁</button>`:''}
        </div></div>
    </div>
  </div>`;
}
async function addBonus(){
  const td=today(), no=await genNo('BN','bonus_records','record_no');
  OM('新增獎金/分潤記錄',`<div class="fg">
    ${fi('bno','記錄號','text',no)}
    <div class="fl"><label>日期</label><input id="f-bdt" type="date" value="${td}" onchange="regenNoOnDateChange('bdt','bno','BN','bonus_records','record_no')" style="width:100%;padding:7px 8px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;outline:none"></div>
    <div class="fl"><label>方向</label><select id="f-bdir" onchange="toggleBonusFields(this.value)">
      <option value="支出（我分潤給人）">支出（我分潤給人）</option>
      <option value="收入（上游分潤給我）">收入（上游分潤給我）</option>
    </select></div>
    <div class="fl"><label>支付對象（誰收款）</label>
      <input id="f-brec" type="text" placeholder="收款人姓名（收入方向可留空）"
        style="width:100%;padding:7px 8px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;background:var(--sf);outline:none">
    </div>
    ${fs('btype','類型',['分潤','推薦獎金','層碰獎金','對碰獎金','業績獎金','其他'])}
    <div id="bonus-income-fields" style="display:none;grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:10px">
      ${fi('bpayer','發放者（上家）')}
      ${fi('btrigger','因誰而收（下家/同階）')}
    </div>
    <div class="fl"><label>金額（收入方向請填含稅實收總額）</label><input id="f-bamt" type="number" autocomplete="off" oninput="bonusCalcTax()"></div>
    ${payMethodSel('bpay','')}
    <div class="fl fw" id="bonus-tax-calc" style="display:none;font-size:12px;color:var(--tx3);background:var(--sf2);padding:8px 10px;border-radius:var(--r)"></div>
    ${fi('binv','發票號碼','text')} ${fi('bpdt','發放/收款日期','date')}
    <div class="fl fw">${fa('bnote','備註')}</div>
  </div>`,
  `<button class="btn" onclick="CM()">取消</button><button class="btn btn-p" onclick="saveBonus()">儲存</button>`);
}
async function saveBonus(){
  const no=v('bno'),rec=v('brec'),amt=n('bamt');
  const dir=v('bdir').startsWith('收入')?'收入':'支出';
  if(!amt){toast('請填寫金額','e');return;}
  if(dir==='支出' && !rec){toast('請填寫支付對象（誰收款）','e');return;}
  const{error}=await sb.from('bonus_records').insert({record_no:no,record_date:v('bdt'),direction:dir,recipient:rec||v('btrigger')||v('bpayer')||null,type:v('btype'),amount:amt,payment_method:v('bpay'),invoice_no:v('binv')||null,payment_date:v('bpdt')||null,note:v('bnote')||null,payer:v('bpayer')||null,trigger_who:v('btrigger')||null,payment_done:false,year_month:ym(v('bdt'))});
  if(error){toast('新增失敗：'+error.message,'e');return;}
  toast('記錄已新增');CM();bonus();
}
async function toggleBonus(id,done){await sb.from('bonus_records').update({payment_done:!done,payment_date:!done?today():null}).eq('id',id);toast(!done?'已標記發放':'已取消');bonus();}
async function dBonus(id){if(!confirm('確定刪除此記錄？'))return;await sb.from('bonus_records').delete().eq('id',id);toast('已刪除');bonus();}
async function accounts(){
  const[{data:orders_m},{data:po_m},{data:bn_m}]=await Promise.all([
    sb.from('sales_orders').select('year_month,total,payment_done,payment_date,order_no,order_date,customer_name'),
    sb.from('purchase_orders').select('year_month,total,po_no,po_date,vendor_name,done'),
    sb.from('bonus_records').select('year_month,amount,payment_done,direction,record_no,record_date,recipient,type'),
  ]);

  // 統一 year_month 格式：全部轉成 YYYY-MM（去斜線、補零）
  const normYM=ym=>{
    if(!ym||ym.trim()==='') return '（未知月）';
    let s=ym.trim().replace(/\//g,'-');        // 2026/05 → 2026-05
    s=s.replace(/^(\d{4})-(\d)$/,'$1-0$2');   // 2026-5 → 2026-05
    return s;
  };

  // 按月彙整
  const byMonth={};
  const addM=(k,field,val)=>{byMonth[k]=byMonth[k]||{in:0,po:0,bn_out:0,bn_in:0,orders:[],pos:[],bns:[]};byMonth[k][field]+=val;};

    (orders_m||[]).forEach(o=>{
    const orderK = normYM(o.year_month);
    const payK = o.payment_done
      ? normYM((o.payment_date||o.order_date||'').slice(0,7))
      : null;
    // 已收款：訂單和收入放在收款月份；未收款：放在訂單月份
    const showK = payK || orderK;
    byMonth[showK]=byMonth[showK]||{in:0,po:0,bn_out:0,bn_in:0,orders:[],pos:[],bns:[]};
    byMonth[showK].orders.push(o);
    if(payK) byMonth[showK].in+=Number(o.total||0);
    // 確保訂單月份容器存在（供月度表格顯示空行用）
    if(payK && payK!==orderK)
      byMonth[orderK]=byMonth[orderK]||{in:0,po:0,bn_out:0,bn_in:0,orders:[],pos:[],bns:[]};
  });
  (po_m||[]).forEach(p=>{
    const k=normYM(p.year_month);
    byMonth[k]=byMonth[k]||{in:0,po:0,bn_out:0,bn_in:0,orders:[],pos:[],bns:[]};
    byMonth[k].po+=Number(p.total||0);
    byMonth[k].pos.push(p);
  });
  (bn_m||[]).forEach(b=>{
    const k=normYM(b.year_month);
    byMonth[k]=byMonth[k]||{in:0,po:0,bn_out:0,bn_in:0,orders:[],pos:[],bns:[]};
    if(b.direction==='收入') byMonth[k].bn_in+=Number(b.amount||0);
    else byMonth[k].bn_out+=Number(b.amount||0);
    byMonth[k].bns.push(b);
  });

  // 排序（未知月放最後）
  const monthKeys=Object.keys(byMonth).sort((a,b)=>{
    if(a==='（未知月）') return 1; if(b==='（未知月）') return -1;
    return b.localeCompare(a);
  });

  // 把細節資料存全域供點擊查看
  window._acctByMonth=byMonth;

  const accTab = window._accTab || 'sales';
  $('main').innerHTML=`
  <div class="ph"><div><div class="pt">財務報表</div><div class="ps">依訂單自動彙整</div></div></div>
  <div class="tab-bar" style="padding:0 16px 10px;overflow-x:auto">
    <div class="tab${accTab==='sales'?' on':''}" onclick="window._accTab='sales';accounts()">銷售財報</div>
    <div class="tab${accTab==='service'?' on':''}" onclick="window._accTab='service';accounts()">服務財報</div>
    <div class="tab${accTab==='total'?' on':''}" onclick="window._accTab='total';accounts()">總財報</div>
    <div class="tab${accTab==='owner'?' on':''}" onclick="window._accTab='owner';accounts()">老闆娘個人淨利</div>
  </div>`;
  if(accTab==='service'){ await showSvcFinance(); return; }
  if(accTab==='total'){ await showTotalFinance(); return; }
  if(accTab==='owner'){ await showOwnerProfit(); return; }

  // 依年份彙整
  const yearMap={};
  monthKeys.forEach(k=>{
    if(k==='（未知月）') return;
    const yr=k.slice(0,4);
    const d=byMonth[k];
    if(!yearMap[yr]) yearMap[yr]={in:0,po:0,bn_in:0,bn_out:0};
    yearMap[yr].in+=d.in; yearMap[yr].po+=d.po; yearMap[yr].bn_in+=d.bn_in; yearMap[yr].bn_out+=d.bn_out;
  });
  const years=Object.keys(yearMap).sort().reverse();
  const netOf=d=>d.in+d.bn_in-d.po-d.bn_out;

  // ── 年度總覽 ──
  if(!window._acctSalesYear){
    $('main').innerHTML += `
    <div class="pc">
      <div class="tc">
        <div class="tb"><span class="tt">年度總覽（點年份看該年每月明細）</span></div>
        <div class="tw"><table style="width:100%">
          <tr><th>年份</th><th>銷售收入</th><th>獎金收入</th><th>進貨支出</th><th>獎金支出</th><th style="font-weight:700">淨利</th></tr>
          ${years.map(yr=>{
            const d=yearMap[yr]; const net=netOf(d);
            return `<tr style="cursor:pointer" onclick="window._acctSalesYear='${yr}';accounts()" onmouseover="this.style.background='var(--acl)'" onmouseout="this.style.background=''">
              <td style="font-weight:700;color:var(--ac);font-size:15px">${yr} ›</td>
              <td class="num ok">${fM(d.in)}</td>
              <td class="num ok" style="color:var(--br)">${fM(d.bn_in)}</td>
              <td class="num cr">${fM(d.po)}</td>
              <td class="num cr" style="color:var(--am)">${fM(d.bn_out)}</td>
              <td class="num" style="font-weight:700;color:${net>=0?'var(--ac)':'var(--rd)'}">${fM(net)}</td>
            </tr>`;
          }).join('')||'<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--tx3)">尚無記錄</td></tr>'}
        </table></div>
      </div>
    </div>`;
    return;
  }

  // ── 該年度的月份明細 ──
  const yr=window._acctSalesYear;
  const yearMonths=monthKeys.filter(k=>k.startsWith(yr));
  $('main').innerHTML += `
    <div class="pc">
    <div style="margin-bottom:14px">
      <button class="btn btn-s" onclick="window._acctSalesYear=null;accounts()">‹ 返回年度總覽</button>
    </div>
    <div class="tc"><div class="tb"><span class="tt">${yr} 年月度彙整（依訂單計算，點月份看細節）</span></div>
    <div class="tw"><table style="width:100%">
      <tr><th>月份</th><th>銷售收入<br><small>已收款</small></th><th>獎金收入</th><th>進貨支出</th><th>獎金支出</th><th style="font-weight:700">淨利</th></tr>
      ${yearMonths.map(k=>{
        const d=byMonth[k];
        const net=d.in+d.bn_in-d.po-d.bn_out;
        return `<tr style="cursor:pointer" onclick="showMonthDetail('${k}')" onmouseover="this.style.background='var(--acl)'" onmouseout="this.style.background=''">
          <td style="font-weight:600;color:var(--ac)">${k}</td>
          <td class="num ok">${d.in?fM(d.in):'—'}</td>
          <td class="num ok" style="color:var(--br)">${d.bn_in?fM(d.bn_in):'—'}</td>
          <td class="num cr">${d.po?fM(d.po):'—'}</td>
          <td class="num cr" style="color:var(--am)">${d.bn_out?fM(d.bn_out):'—'}</td>
          <td class="num" style="font-weight:700;color:${net>=0?'var(--ac)':'var(--rd)'}">${fM(net)}</td>
        </tr>`;
      }).join('')}
    </table></div></div>
  </div>`;
}
async function showMonthDetail(k){
  const d=window._acctByMonth?.[k];
  if(!d){toast('無資料','w');return;}
  const net=d.in+d.bn_in-d.po-d.bn_out;
  const sortedOrders=(d.orders||[]).slice().sort((a,b)=>(b.order_date||'').localeCompare(a.order_date||''));
  const sortedPos=(d.pos||[]).slice().sort((a,b)=>(b.po_date||'').localeCompare(a.po_date||''));
  OM(`${k} 明細`, `
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;margin-bottom:14px">
    <div style="background:var(--sf2);border-radius:var(--r);padding:8px 10px;text-align:center">
      <div style="font-size:10px;color:var(--tx3);margin-bottom:2px">銷售收入</div><div style="font-weight:700;color:var(--ac)">${fM(d.in)}</div></div>
    <div style="background:var(--sf2);border-radius:var(--r);padding:8px 10px;text-align:center">
      <div style="font-size:10px;color:var(--tx3);margin-bottom:2px">獎金收入</div><div style="font-weight:700;color:var(--br)">${fM(d.bn_in)}</div></div>
    <div style="background:var(--sf2);border-radius:var(--r);padding:8px 10px;text-align:center">
      <div style="font-size:10px;color:var(--tx3);margin-bottom:2px">進貨支出</div><div style="font-weight:700;color:var(--rd)">${fM(d.po)}</div></div>
    <div style="background:var(--sf2);border-radius:var(--r);padding:8px 10px;text-align:center">
      <div style="font-size:10px;color:var(--tx3);margin-bottom:2px">獎金支出</div><div style="font-weight:700;color:var(--am)">${fM(d.bn_out)}</div></div>
    <div style="background:var(--acl);border-radius:var(--r);padding:8px 10px;text-align:center;border:1px solid var(--ac)">
      <div style="font-size:10px;color:var(--tx3);margin-bottom:2px">淨利</div><div style="font-weight:700;font-size:16px;color:${net>=0?'var(--ac)':'var(--rd)'}">${fM(net)}</div></div>
  </div>
  ${d.orders?.length?`<div class="sh">銷售訂單（${d.orders.length}筆）</div>
  <div style="overflow-x:auto"><table class="itb" style="min-width:300px">
    <tr><th>訂單號</th><th>日期</th><th>客戶</th><th>金額</th><th>收款</th></tr>
    ${sortedOrders.map(o=>`<tr><td><a href="#" onclick="event.preventDefault();CM();setTimeout(()=>showOrder('${o.order_no}'),80)" style="color:var(--ac);font-size:11px;font-family:monospace">${o.order_no}</a></td>
      <td style="font-size:11px">${fD(o.order_date)}</td><td style="font-size:12px">${o.customer_name||'—'}</td>
      <td class="num">${fM(o.total)}</td>
      <td><span class="badge ${o.payment_done?'bg':'br2'}">${o.payment_done?'已收':'未收'}</span></td></tr>`).join('')}
  </table></div>`:''}
  ${d.pos?.length?`<div class="sh" style="margin-top:10px">進貨單（${d.pos.length}筆）</div>
  <div style="overflow-x:auto"><table class="itb" style="min-width:280px">
    <tr><th>進貨單號</th><th>日期</th><th>廠商</th><th>金額</th></tr>
    ${sortedPos.map(p=>`<tr><td><a href="#" onclick="event.preventDefault();CM();setTimeout(()=>showPO('${p.po_no}'),80)" style="color:var(--br);font-size:11px;font-family:monospace">${p.po_no}</a></td>
      <td style="font-size:11px">${fD(p.po_date)}</td><td style="font-size:12px">${p.vendor_name||'—'}</td>
      <td class="num">${fM(p.total)}</td></tr>`).join('')}
  </table></div>`:''}
  ${d.bns?.length?`<div class="sh" style="margin-top:10px">獎金/分潤（${d.bns.length}筆）</div>
  <div style="overflow-x:auto"><table class="itb" style="min-width:280px">
    <tr><th>記錄號</th><th>日期</th><th>方向</th><th>類型</th><th>對象</th><th>金額</th></tr>
    ${d.bns.map(b=>`<tr><td style="font-size:11px;font-family:monospace">${b.record_no}</td>
      <td style="font-size:11px">${fD(b.record_date)}</td>
      <td><span class="badge ${b.direction==='收入'?'bg':'ba'}">${b.direction}</span></td>
      <td style="font-size:12px">${b.type||'—'}</td>
      <td style="font-size:12px">${b.recipient||'—'}</td>
      <td class="num" style="color:${b.direction==='收入'?'var(--ac)':'var(--rd)'}">${fM(b.amount)}</td></tr>`).join('')}
  </table></div>`:''}
  `,`<button class="btn" onclick="CM()">關閉</button>`);
}
window.showMonthDetail=showMonthDetail;
function toggleBonusFields(val){
  const isIncome = val.startsWith('收入');
  const fields = document.getElementById('bonus-income-fields');
  if(fields) fields.style.display = isIncome ? 'grid' : 'none';
  // 動態更新對象欄位標籤
  const lbl = document.getElementById('lbl-recipient');
  const inp = document.getElementById('f-brec');
  if(lbl) lbl.textContent = isIncome ? '關聯人員（可留空）' : '支付對象（誰收款）*';
  if(inp) inp.placeholder = isIncome ? '選填，通常用「因誰而收」即可' : '收款人姓名';
  // 收入方向（上游分潤給我）才需要開發票給上家，才顯示稅額試算；支出方向不用
  const taxBox = document.getElementById('bonus-tax-calc');
  if(taxBox) taxBox.style.display = isIncome ? 'block' : 'none';
  if(isIncome) bonusCalcTax();
}
// 收入方向的金額欄位填的是「含稅實收總額」（發票上的總計），這裡直接反推未稅金額跟稅額，
// 不用再跳到外面網站算——未稅金額＝總額÷1.05（四捨五入到整數），稅額＝總額－未稅金額，
// 這樣兩者加起來一定剛好等於你填的總額，不會有湊不起來的問題。
function bonusCalcTax(){
  const box = $('bonus-tax-calc');
  if(!box) return;
  const amt = parseFloat($('f-bamt')?.value)||0;
  if(!amt){ box.innerHTML = '<b>開發票試算</b>　請先填金額'; return; }
  const base = Math.round(amt/1.05);
  const tax = amt - base;
  box.innerHTML = `<b>開發票試算（依台灣營業稅5%反推）</b>　未稅金額：<b>${fM(base)}</b>　稅額：<b>${fM(tax)}</b>　合計：${fM(amt)}`;
}
window.bonusCalcTax = bonusCalcTax;
function bonusForm(b){
  b = b || {};
  const dir = b.direction || '支出（我分潤給人）';
  const isIncome = dir === '收入';
  return `<div class="fg">
    ${fi('bno','記錄號','text',b.record_no)} ${fi('bdt','日期','date',b.record_date||today())}
    <div class="fl"><label>方向</label><select id="f-bdir" onchange="toggleBonusFields(this.value)">
      <option value="支出（我分潤給人）" ${!isIncome?'selected':''}>支出（我分潤給人）</option>
      <option value="收入（上游分潤給我）" ${isIncome?'selected':''}>收入（上游分潤給我）</option>
    </select></div>
    <div class="fl" id="field-recipient"><label id="lbl-recipient">${dir==='收入'?'關聯人員（可留空）':'支付對象（誰收款）*'}</label>
      <input id="f-brec" type="text" value="${b.recipient||''}" ${dir==='收入'?'placeholder="選填，通常用因誰而收即可"':'placeholder="收款人姓名"'}
        style="width:100%;padding:7px 8px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;background:var(--sf);outline:none">
    </div>
    ${fs('btype','類型',['分潤','推薦獎金','層碰獎金','對碰獎金','業績獎金','其他'],b.type)}
    <div id="bonus-income-fields" style="display:${isIncome?'grid':'none'};grid-column:1/-1;grid-template-columns:1fr 1fr;gap:10px">
      ${fi('bpayer','發放者（上家，誰給的）','text',b.payer)}
      ${fi('btrigger','因誰而收（下家/同階業績）','text',b.trigger_who)}
    </div>
    <div class="fl"><label>金額（收入方向請填含稅實收總額）</label><input id="f-bamt" type="number" value="${b.amount||''}" autocomplete="off" oninput="bonusCalcTax()"></div>
    ${payMethodSel('bpay',b.payment_method||'')}
    <div class="fl fw" id="bonus-tax-calc" style="display:${isIncome?'block':'none'};font-size:12px;color:var(--tx3);background:var(--sf2);padding:8px 10px;border-radius:var(--r)"></div>
    ${fi('binv','發票號碼','text',b.invoice_no)} ${fi('bpdt','發放/收款日期','date',b.payment_date)}
    <div class="fl fw">${fa('bnote','備註',b.note)}</div>
  </div>`;
}
async function showBonus(no){
  const{data:b}=await sb.from('bonus_records').select('*').eq('record_no',no).single();
  if(!b){toast('找不到記錄','e');return;}
  const isIncome = b.direction==='收入';
  OM(`獎金記錄：${no}`, `
  <div class="dg" style="margin-bottom:12px">
    <div class="dr"><span class="dlb">日期</span><span class="dv">${fD(b.record_date)}</span></div>
    <div class="dr"><span class="dlb">方向</span><span class="dv"><span class="badge ${isIncome?'bg':'ba'}">${b.direction}</span></span></div>
    <div class="dr"><span class="dlb">類型</span><span class="dv">${b.type||'—'}</span></div>
    <div class="dr"><span class="dlb">金額</span><span class="dv" style="font-size:22px;font-weight:700;color:${isIncome?'var(--ac)':'var(--am)'}">${fM(b.amount)}</span></div>
    ${isIncome ? `
    <div class="dr" style="grid-column:1/-1"><span class="dlb">開發票試算</span><span class="dv">${(()=>{const base=Math.round((b.amount||0)/1.05),tax=(b.amount||0)-base;return `未稅金額 <b>${fM(base)}</b>　稅額(5%) <b>${fM(tax)}</b>　合計 ${fM(b.amount)}`;})()}</span></div>
    <div class="dr"><span class="dlb">發放者（上家）</span><span class="dv" style="font-weight:600">${b.payer||'—'}</span></div>
    <div class="dr"><span class="dlb">因誰而收（觸發人）</span><span class="dv" style="font-weight:600">${b.trigger_who||b.recipient||'—'}</span></div>
    ` : `
    <div class="dr"><span class="dlb">支付對象</span><span class="dv" style="font-weight:600">${b.recipient||'—'}</span></div>
    `}
    <div class="dr"><span class="dlb">付款方式</span><span class="dv">${b.payment_method||'—'}</span></div>
    <div class="dr"><span class="dlb">發票號碼</span><span class="dv" style="font-family:monospace">${b.invoice_no||'—'}</span></div>
    <div class="dr"><span class="dlb">發放/收款日期</span><span class="dv">${fD(b.payment_date)}</span></div>
    <div class="dr"><span class="dlb">狀態</span><span class="dv"><span class="badge ${b.payment_done?'bg':'br2'}">${b.payment_done?'已完成':'待處理'}</span></span></div>
    ${b.note?`<div class="dr" style="grid-column:1/-1"><span class="dlb">備註</span><span class="dv" style="white-space:pre-wrap">${b.note}</span></div>`:''}
  </div>`,
  `<button class="btn" onclick="CM()">關閉</button>
   <button class="btn" onclick="editBonus('${no}')">編輯</button>`
  );
}
async function editBonus(no){
  const{data:b}=await sb.from('bonus_records').select('*').eq('record_no',no).single();
  if(!b){toast('找不到記錄','e');return;}
  OM(`編輯獎金記錄：${no}`, bonusForm(b),
    `<button class="btn" onclick="CM()">取消</button>
     <button class="btn btn-p" onclick="updateBonus('${no}')">儲存</button>`
  );
  if(b.direction==='收入') bonusCalcTax();
}
async function updateBonus(no){
  const rec=v('brec'), amt=n('bamt');
  const dir=v('bdir').startsWith('收入')?'收入':'支出';
  if(!amt){toast('請填寫金額','e');return;}
  if(dir==='支出' && !rec){toast('請填寫支付對象（誰收款）','e');return;}
  const{error}=await sb.from('bonus_records').update({
    record_date:v('bdt'), direction:dir, recipient:rec||v('btrigger')||v('bpayer')||null,
    type:v('btype'), amount:amt, payment_method:v('bpay'),
    invoice_no:v('binv')||null, payment_date:v('bpdt')||null,
    note:v('bnote')||null,
    payer:v('bpayer')||null,
    trigger_who:v('btrigger')||null,
    year_month:ym(v('bdt'))
  }).eq('record_no',no);
  if(error){toast('更新失敗：'+error.message,'e');return;}
  toast('記錄已更新');CM();bonus();
}
window.showBonus=showBonus;
window.editBonus=editBonus;
window.updateBonus=updateBonus;
window.toggleBonusFields=toggleBonusFields;

// ════════════════════════════════════
//  總財報（銷售 + 服務合計）
// ════════════════════════════════════
function normYM(ym){
  if(!ym||ym.trim()==='') return null;
  let s=ym.trim().replace(/\//g,'-');
  s=s.replace(/^(\d{4})-(\d)$/,'$1-0$2');
  return s;
}
async function computeTotalFinanceData(includeSelfUse) {
  const [{ data:sOrders },{ data:pOrders },{ data:bnRecs },{ data:svOrders },{ data:svItems },{ data:opexRecs }] = await Promise.all([
    sb.from('sales_orders').select('order_date,year_month,total,payment_done,payment_date,order_type'),
    sb.from('purchase_orders').select('year_month,total'),
    sb.from('bonus_records').select('year_month,amount,direction'),
    sb.from('service_orders').select('order_date,total,consumable_cost'),
    sb.from('service_order_items').select('order_date:service_orders(order_date),technician_pay').eq('item_type','service'),
    sb.from('operating_expenses').select('expense_date,amount'),
  ]);

  // 月度彙整
  const mMap = {};
  const addM = (ym, key, val) => { if(!ym) return; if(!mMap[ym]) mMap[ym]={salesRev:0,purchCost:0,svcRev:0,svcCost:0,techPay:0,bonusIn:0,bonusOut:0,opCost:0}; mMap[ym][key]+=val||0; };
  // 銷售：已收款算在收款月份、未收款算在訂單原本的年月（跟銷售財報同一套規則，只有已收款才真的算收入）
  (sOrders||[]).forEach(o => {
    if(o.order_type==='自用' && !includeSelfUse) return; // 預設不把自用訂單算進真實營收
    const orderK = normYM(o.year_month);
    const payK = o.payment_done ? normYM((o.payment_date||o.order_date||'').slice(0,7)) : null;
    const showK = payK || orderK;
    if(payK) addM(showK,'salesRev',o.total);
  });
  // 進貨：用年月欄位（跟銷售財報同一套規則）
  (pOrders||[]).forEach(o => { addM(normYM(o.year_month),'purchCost',o.total); });
  // 獎金/分潤：收入加、支出扣
  (bnRecs||[]).forEach(b => {
    if(b.direction==='收入') addM(normYM(b.year_month),'bonusIn',b.amount);
    else addM(normYM(b.year_month),'bonusOut',b.amount);
  });
  (svOrders||[]).forEach(o => { const ym=(o.order_date||'').slice(0,7); if(ym){ addM(ym,'svcRev',o.total); addM(ym,'svcCost',o.consumable_cost); }});
  (svItems||[]).forEach(i => { const ym=(i.order_date?.order_date||'').slice(0,7); if(ym) addM(ym,'techPay',i.technician_pay); });
  // 營運成本（房租/水電/網路等固定成本）
  (opexRecs||[]).forEach(r => { const ym=(r.expense_date||'').slice(0,7); if(ym) addM(ym,'opCost',r.amount); });

  // 年度彙整
  const yMap = {};
  Object.entries(mMap).forEach(([ym, d]) => {
    const yr = ym.slice(0,4);
    if(!yMap[yr]) yMap[yr]={salesRev:0,purchCost:0,svcRev:0,svcCost:0,techPay:0,bonusIn:0,bonusOut:0,opCost:0};
    Object.keys(d).forEach(k => yMap[yr][k]+=d[k]);
  });

  const months = Object.keys(mMap).sort().reverse();
  const years = Object.keys(yMap).sort().reverse();
  return { mMap, yMap, months, years };
}
var _totalFinanceIncl = {purchCost:true, svcCost:true, techPay:true, bonusOut:true, opCost:true};
const netRow = d => {
  let n = d.salesRev + d.svcRev + d.bonusIn;
  if(_totalFinanceIncl.purchCost) n -= d.purchCost;
  if(_totalFinanceIncl.svcCost) n -= d.svcCost;
  if(_totalFinanceIncl.techPay) n -= d.techPay;
  if(_totalFinanceIncl.bonusOut) n -= d.bonusOut;
  if(_totalFinanceIncl.opCost) n -= d.opCost;
  return n;
};
window.computeTotalFinanceData = computeTotalFinanceData;
window.netRow = netRow;

var _includeSelfUse = false;
async function showTotalFinance() {
  const { mMap, yMap, months, years } = await computeTotalFinanceData(_includeSelfUse);

  const controlsHtml = `
    <div class="tc" style="margin-bottom:16px;padding:12px 16px">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;margin-bottom:10px">
        <input type="checkbox" ${_includeSelfUse?'checked':''} onchange="_includeSelfUse=this.checked;accounts()">
        包含「自用」類型的訂單營收（預設不含，只看對外真實銷售）
      </label>
      <div style="font-size:12px;color:var(--tx3);margin-bottom:6px">淨利要不要扣這些項目（取消勾選＝先不看這塊，數字會即時重算）：</div>
      <div style="display:flex;flex-wrap:wrap;gap:14px">
        ${[['purchCost','進貨支出'],['svcCost','耗材成本'],['techPay','技師薪資'],['bonusOut','獎金支出'],['opCost','營運成本']].map(([k,lbl])=>`
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
            <input type="checkbox" ${_totalFinanceIncl[k]?'checked':''} onchange="_totalFinanceIncl.${k}=this.checked;accounts()">
            ${lbl}
          </label>`).join('')}
      </div>
    </div>`;

  const excludedStyle = 'color:var(--tx3);text-decoration:line-through;opacity:.5';
  const cellStyle = (key, normalColor) => _totalFinanceIncl[key] ? `color:${normalColor}` : excludedStyle;

  // ── 年度總覽 ──
  if(!window._totalFinanceYear) {
    $('main').innerHTML += `
    <div class="pc">
      ${controlsHtml}
      <div class="tc">
        <div class="tb"><span class="tt">年度總覽（點年份看該年每月明細）</span></div>
        <div class="al al-w" style="font-size:12px;margin:0 16px 10px">月份分類規則跟「銷售財報」一致：銷售訂單已收款算在收款月份、未收款算在訂單月份；服務成本＝耗材成本＋技師薪資（不含撥轉成本，那只是搬庫存不是真花費）；有把獎金/分潤、營運成本（房租水電網路等）也算進來。取消勾選的項目會用刪除線標示，代表沒有被扣進總淨利。</div>
        <div class="tw"><table style="width:100%">
          <tr><th>年份</th><th>銷售收入</th><th>服務收入</th><th>獎金收入</th><th>進貨支出</th><th>耗材成本</th><th>技師薪資</th><th>獎金支出</th><th>營運成本</th><th style="font-weight:700">總淨利</th></tr>
          ${years.map(yr=>{
            const d=yMap[yr]; const net=netRow(d);
            return `<tr style="cursor:pointer" onclick="window._totalFinanceYear='${yr}';accounts()" onmouseover="this.style.background='var(--acl)'" onmouseout="this.style.background=''">
              <td style="font-weight:700;color:var(--ac);font-size:15px">${yr} ›</td>
              <td class="num" style="color:var(--ac)">${fM(d.salesRev)}</td>
              <td class="num" style="color:var(--ac)">${fM(d.svcRev)}</td>
              <td class="num" style="color:var(--ac)">${fM(d.bonusIn)}</td>
              <td class="num" style="${cellStyle('purchCost','var(--rd)')}">${fM(d.purchCost)}</td>
              <td class="num" style="${cellStyle('svcCost','var(--rd)')}">${fM(d.svcCost)}</td>
              <td class="num" style="${cellStyle('techPay','var(--bl)')}">${fM(d.techPay)}</td>
              <td class="num" style="${cellStyle('bonusOut','var(--rd)')}">${fM(d.bonusOut)}</td>
              <td class="num" style="${cellStyle('opCost','var(--rd)')}">${fM(d.opCost)}</td>
              <td class="num" style="font-weight:700;color:${net>=0?'var(--ac)':'var(--rd)'}">${fM(net)}</td>
            </tr>`;
          }).join('')||'<tr><td colspan="10" style="text-align:center;padding:20px;color:var(--tx3)">尚無記錄</td></tr>'}
        </table></div>
      </div>
    </div>`;
    return;
  }

  // ── 該年度的月份明細 ──
  const yr = window._totalFinanceYear;
  const yearMonths = months.filter(ym=>ym.startsWith(yr));
  $('main').innerHTML += `
  <div class="pc">
    ${controlsHtml}
    <div style="margin-bottom:14px">
      <button class="btn btn-s" onclick="window._totalFinanceYear=null;accounts()">‹ 返回年度總覽</button>
    </div>
    <div class="tc">
      <div class="tb"><span class="tt">${yr} 年月度總財報</span></div>
      <div class="tw"><table style="width:100%">
        <tr><th>月份</th><th>銷售收入</th><th>服務收入</th><th>獎金收入</th><th>進貨支出</th><th>耗材成本</th><th>技師薪資</th><th>獎金支出</th><th>營運成本</th><th style="font-weight:700">總淨利</th></tr>
        ${yearMonths.map(ym=>{
          const d=mMap[ym]; const net=netRow(d);
          return `<tr>
            <td style="color:var(--ac);font-weight:600">${ym}</td>
            <td class="num">${fM(d.salesRev)}</td>
            <td class="num">${fM(d.svcRev)}</td>
            <td class="num">${fM(d.bonusIn)}</td>
            <td class="num" style="${cellStyle('purchCost','var(--rd)')}">${fM(d.purchCost)}</td>
            <td class="num" style="${cellStyle('svcCost','var(--rd)')}">${fM(d.svcCost)}</td>
            <td class="num" style="${cellStyle('techPay','var(--bl)')}">${fM(d.techPay)}</td>
            <td class="num" style="${cellStyle('bonusOut','var(--rd)')}">${fM(d.bonusOut)}</td>
            <td class="num" style="${cellStyle('opCost','var(--rd)')}">${fM(d.opCost)}</td>
            <td class="num" style="font-weight:700;color:${net>=0?'var(--ac)':'var(--rd)'}">${fM(net)}</td>
          </tr>`;
        }).join('')||'<tr><td colspan="10" style="text-align:center;color:var(--tx3)">尚無記錄</td></tr>'}
      </table></div>
    </div>
  </div>`;
}

window.showTotalFinance = showTotalFinance;

// ════════════════════════════════════
//  老闆娘個人淨利（公司總淨利＋自己身為技師的薪資）
// ════════════════════════════════════
var _ownerProfitYear = null; // null=年度總覽；設定年份字串則顯示該年的月份明細
async function showOwnerProfit() {
  const { data:techs } = await sb.from('technicians').select('name').order('name');
  const names = [...new Set((techs||[]).map(t=>t.name))];
  const ownerTechName = names.find(n=>n.includes('闆'))||names[0]||null;

  const { mMap, months } = await computeTotalFinanceData(_includeSelfUse);

  let ownerPayByMonth = {};
  if(ownerTechName) {
    const { data:items } = await sb.from('service_order_items')
      .select('order_date:service_orders(order_date),technician_name,technician_pay')
      .eq('item_type','service').eq('technician_name',ownerTechName);
    (items||[]).forEach(i=>{
      const ym=(i.order_date?.order_date||'').slice(0,7);
      if(ym) ownerPayByMonth[ym]=(ownerPayByMonth[ym]||0)+(i.technician_pay||0);
    });
  }

  // 每個月的完整算式（共用給年度彙整跟月度明細）
  const calc = ym => {
    const d=mMap[ym];
    const costSub = d.svcCost + d.techPay;
    const pay = ownerPayByMonth[ym]||0;
    const svcNet = d.svcRev - costSub + pay;
    const salesNet = d.salesRev - d.purchCost;
    const bonus = d.bonusIn - d.bonusOut;
    const opCost = d.opCost||0;
    const personal = salesNet + svcNet + bonus - opCost;
    return { svcRev:d.svcRev, costSub, pay, svcNet, salesNet, bonus, opCost, personal };
  };

  // 依年度彙整
  const yearMap = {};
  months.forEach(ym=>{
    const yr = ym.slice(0,4);
    const c = calc(ym);
    if(!yearMap[yr]) yearMap[yr]={salesNet:0,svcNet:0,bonus:0,opCost:0,personal:0};
    yearMap[yr].salesNet+=c.salesNet; yearMap[yr].svcNet+=c.svcNet; yearMap[yr].bonus+=c.bonus; yearMap[yr].opCost+=c.opCost; yearMap[yr].personal+=c.personal;
  });
  const years = Object.keys(yearMap).sort().reverse();
  const grandTotal = years.reduce((s,y)=>s+yearMap[y].personal,0);

  const controlsHtml = `
    <div class="tc" style="margin-bottom:16px;padding:12px 16px">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px">
        <input type="checkbox" ${_includeSelfUse?'checked':''} onchange="_includeSelfUse=this.checked;accounts()">
        包含「自用」類型的訂單營收（預設不含，只看對外真實銷售）
      </label>
    </div>`;

  // ── 年度總覽 ──
  if(!_ownerProfitYear) {
    $('main').innerHTML += `
    <div class="pc">
      ${controlsHtml}
      <div class="tc">
        <div class="tb"><span class="tt">年度總覽（點年份看該年每月明細）</span></div>
        <div class="al al-w" style="font-size:12px;margin:0 16px 10px">個人淨利＝銷售淨利＋服務類淨利（已含自己的技師收入）＋獎金淨額－營運成本（房租水電網路等）。</div>
        <div class="tw"><table style="width:100%">
          <tr><th>年份</th><th>銷售淨利</th><th>服務類淨利</th><th>獎金淨額</th><th>營運成本</th><th>個人年淨利</th></tr>
          ${years.map(yr=>{
            const y=yearMap[yr];
            return `<tr style="cursor:pointer" onclick="_ownerProfitYear='${yr}';accounts()" onmouseover="this.style.background='var(--acl)'" onmouseout="this.style.background=''">
              <td style="color:var(--ac);font-weight:700;font-size:15px">${yr} ›</td>
              <td class="num">${fM(y.salesNet)}</td>
              <td class="num">${fM(y.svcNet)}</td>
              <td class="num" style="color:${y.bonus>=0?'var(--ac)':'var(--rd)'}">${fM(y.bonus)}</td>
              <td class="num" style="color:var(--rd)">${fM(y.opCost)}</td>
              <td class="num" style="font-weight:700;color:${y.personal>=0?'var(--ac)':'var(--rd)'}">${fM(y.personal)}</td>
            </tr>`;
          }).join('')||'<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--tx3)">尚無記錄</td></tr>'}
        </table></div>
        ${years.length?`<div style="padding:12px 16px;text-align:right;font-size:14px;font-weight:700;border-top:1px solid var(--bd)">
          全部年度累計個人淨利：<span style="color:${grandTotal>=0?'var(--ac)':'var(--rd)'}">${fM(grandTotal)}</span>
        </div>`:''}
      </div>
    </div>`;
    return;
  }

  // ── 該年度的月份明細 ──
  const yearMonths = months.filter(ym=>ym.startsWith(_ownerProfitYear)).sort();
  const y = yearMap[_ownerProfitYear]||{salesNet:0,svcNet:0,bonus:0,opCost:0,personal:0};

  $('main').innerHTML += `
  <div class="pc">
    ${controlsHtml}
    <div style="margin-bottom:14px">
      <button class="btn btn-s" onclick="_ownerProfitYear=null;accounts()">‹ 返回年度總覽</button>
    </div>
    <div class="tc" style="margin-bottom:16px">
      <div class="tb"><span class="tt">${_ownerProfitYear} 年 ① 服務類淨利（含自己賺的技師薪資）</span></div>
      <div class="al al-w" style="font-size:12px;margin:0 16px 10px">服務類淨利＝服務營收－服務成本小計（耗材＋全部技師薪資）＋${ownerTechName||'（未選）'}自己的技師收入（加回來）。</div>
      <div class="tw"><table style="width:100%">
        <tr><th>月份</th><th>服務營收</th><th>服務成本小計</th><th>${ownerTechName||'—'}技師收入</th><th>服務類淨利</th></tr>
        ${yearMonths.map(ym=>{
          const c=calc(ym);
          return `<tr>
            <td style="color:var(--ac);font-weight:600">${ym}</td>
            <td class="num">${fM(c.svcRev)}</td>
            <td class="num" style="color:var(--rd)">－${fM(c.costSub)}</td>
            <td class="num" style="color:var(--bl)">＋${fM(c.pay)}</td>
            <td class="num" style="font-weight:700;color:${c.svcNet>=0?'var(--ac)':'var(--rd)'}">${fM(c.svcNet)}</td>
          </tr>`;
        }).join('')||'<tr><td colspan="5" style="text-align:center;color:var(--tx3)">本年度尚無記錄</td></tr>'}
      </table></div>
    </div>

    <div class="tc">
      <div class="tb"><span class="tt">${_ownerProfitYear} 年 ② 個人月淨利（銷售淨利＋服務類淨利＋獎金－營運成本）</span></div>
      <div class="al al-w" style="font-size:12px;margin:0 16px 10px">個人月淨利＝銷售淨利（銷售收入－進貨支出）＋①的服務類淨利（已經含自己的技師收入，這裡不再重複加）＋獎金/分潤淨額－營運成本（房租水電網路等）。</div>
      <div class="tw"><table style="width:100%">
        <tr><th>月份</th><th>銷售淨利</th><th>服務類淨利</th><th>獎金淨額</th><th>營運成本</th><th>個人月淨利</th></tr>
        ${yearMonths.map(ym=>{
          const c=calc(ym);
          return `<tr>
            <td style="color:var(--ac);font-weight:600">${ym}</td>
            <td class="num">${fM(c.salesNet)}</td>
            <td class="num">${fM(c.svcNet)}</td>
            <td class="num" style="color:${c.bonus>=0?'var(--ac)':'var(--rd)'}">${fM(c.bonus)}</td>
            <td class="num" style="color:var(--rd)">${fM(c.opCost)}</td>
            <td class="num" style="font-weight:700;color:${c.personal>=0?'var(--ac)':'var(--rd)'}">${fM(c.personal)}</td>
          </tr>`;
        }).join('')||'<tr><td colspan="6" style="text-align:center;color:var(--tx3)">本年度尚無記錄</td></tr>'}
      </table></div>
      <div style="padding:12px 16px;text-align:right;font-size:14px;font-weight:700;border-top:1px solid var(--bd)">
        ${_ownerProfitYear}年累計：銷售淨利 ${fM(y.salesNet)} ＋ 服務類淨利 ${fM(y.svcNet)} ＋ 獎金淨額 ${fM(y.bonus)} － 營運成本 ${fM(y.opCost)} ＝ 個人年淨利 <span style="color:${y.personal>=0?'var(--ac)':'var(--rd)'}">${fM(y.personal)}</span>
      </div>
    </div>
  </div>`;
}
window.showOwnerProfit = showOwnerProfit;

// ════════════════════════════════════
//  服務財報（含技師薪資）
// ════════════════════════════════════
async function showSvcFinance() {
  const [{ data:orders },{ data:transfers },{ data:items }] = await Promise.all([
    sb.from('service_orders').select('order_date,total,consumable_cost'),
    sb.from('service_transfers').select('transfer_date,total_cost'),
    sb.from('service_order_items').select('order_no,item_name,order_date:service_orders(order_date),technician_id,technician_name,technician_pay,item_type,qty,unit_price,subtotal').eq('item_type','service'),
  ]);

  // 月度彙整
  const mMap = {};
  const addM = (ym,key,val) => { if(!mMap[ym]) mMap[ym]={rev:0,cost:0,trCost:0,techPay:0}; mMap[ym][key]+=val||0; };
  (orders||[]).forEach(o=>{ const ym=(o.order_date||'').slice(0,7); if(ym){ addM(ym,'rev',o.total); addM(ym,'cost',o.consumable_cost); }});
  (transfers||[]).forEach(t=>{ const ym=(t.transfer_date||'').slice(0,7); if(ym) addM(ym,'trCost',t.total_cost); });
  (items||[]).forEach(i=>{ const ym=(i.order_date?.order_date||'').slice(0,7); if(ym) addM(ym,'techPay',i.technician_pay); });

  // 技師月薪彙整（用姓名合併，避免同一人因為技師資料重複ID分成好幾行）
  const techMap = {};
  window._svcTechDetail = {};
  (items||[]).forEach(i=>{
    if(!i.technician_name) return;
    const ym=(i.order_date?.order_date||'').slice(0,7);
    if(!ym) return;
    const key=`${i.technician_name}_${ym}`;
    if(!techMap[key]) techMap[key]={name:i.technician_name,ym,pay:0,sessions:0};
    techMap[key].pay+=i.technician_pay||0;
    techMap[key].sessions+=i.qty||0;
    (window._svcTechDetail[key]=window._svcTechDetail[key]||[]).push(i);
  });

  const months = Object.keys(mMap).sort().reverse();

  // 依年份彙整
  const yearMap = {};
  months.forEach(ym=>{
    const yr=ym.slice(0,4);
    const d=mMap[ym];
    if(!yearMap[yr]) yearMap[yr]={rev:0,cost:0,techPay:0};
    yearMap[yr].rev+=d.rev; yearMap[yr].cost+=d.cost; yearMap[yr].techPay+=d.techPay;
  });
  const years = Object.keys(yearMap).sort().reverse();

  // ── 年度總覽 ──
  if(!window._svcFinanceYear) {
    $('main').innerHTML += `
    <div class="pc">
      <div class="tc">
        <div class="tb"><span class="tt">年度總覽（點年份看該年每月明細）</span></div>
        <div class="al al-w" style="font-size:12px;margin:0 16px 10px">服務淨利＝服務收入－耗材成本－技師薪資。</div>
        <div class="tw"><table style="width:100%">
          <tr><th>年份</th><th>服務收入</th><th>耗材成本</th><th>技師薪資</th><th style="font-weight:700">服務淨利</th></tr>
          ${years.map(yr=>{
            const d=yearMap[yr]; const net=d.rev-d.cost-d.techPay;
            return `<tr style="cursor:pointer" onclick="window._svcFinanceYear='${yr}';accounts()" onmouseover="this.style.background='var(--acl)'" onmouseout="this.style.background=''">
              <td style="font-weight:700;color:var(--ac);font-size:15px">${yr} ›</td>
              <td class="num" style="color:var(--ac)">${fM(d.rev)}</td>
              <td class="num" style="color:var(--rd)">${fM(d.cost)}</td>
              <td class="num" style="color:var(--bl)">${fM(d.techPay)}</td>
              <td class="num" style="font-weight:700;color:${net>=0?'var(--ac)':'var(--rd)'}">${fM(net)}</td>
            </tr>`;
          }).join('')||'<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--tx3)">尚無記錄</td></tr>'}
        </table></div>
      </div>
    </div>`;
    return;
  }

  // ── 該年度的月份明細 ──
  const yr = window._svcFinanceYear;
  const yearMonths = months.filter(ym=>ym.startsWith(yr));
  const yearTechEntries = Object.entries(techMap).filter(([key,t])=>t.ym.startsWith(yr))
    .sort((a,b)=>b[1].ym.localeCompare(a[1].ym)||a[1].name.localeCompare(b[1].name));

  $('main').innerHTML += `
  <div class="pc">
    <div style="margin-bottom:14px">
      <button class="btn btn-s" onclick="window._svcFinanceYear=null;accounts()">‹ 返回年度總覽</button>
    </div>
    <div class="tc" style="margin-bottom:16px">
      <div class="tb"><span class="tt">${yr} 年月度服務財報</span></div>
      <div class="al al-w" style="font-size:12px;margin:0 16px 10px">「成本小計」＝耗材成本＋技師薪資，是真正會從服務收入扣掉的錢（服務收入－成本小計＝服務淨利）。「撥轉成本」單獨列出來僅供參考（那是把商品搬去服務庫存的當下金額，不是真的花費，不算進小計也不算進淨利，避免重複扣兩次）。</div>
      <div class="tw"><table style="width:100%">
        <tr><th>月份</th><th>服務收入</th><th>耗材成本</th><th>技師薪資</th><th>成本小計</th><th>撥轉成本（參考）</th><th>服務淨利</th></tr>
        ${yearMonths.map(ym=>{
          const d=mMap[ym];
          const costSub = d.cost+d.techPay;
          const net=d.rev-costSub;
          return `<tr>
            <td style="color:var(--ac);font-weight:600;cursor:pointer" onclick="svcMonthDetail('${ym}')">${ym}</td>
            <td class="num" style="color:var(--ac)">${fM(d.rev)}</td>
            <td class="num" style="color:var(--rd)">${fM(d.cost)}</td>
            <td class="num" style="color:var(--bl)">${fM(d.techPay)}</td>
            <td class="num" style="font-weight:700;color:var(--rd)">－${fM(costSub)}</td>
            <td class="num" style="color:var(--tx3);font-size:12px">${fM(d.trCost)}</td>
            <td class="num" style="font-weight:700;color:${net>=0?'var(--ac)':'var(--rd)'}">${fM(net)}</td>
          </tr>`;
        }).join('')||'<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--tx3)">尚無記錄</td></tr>'}
      </table></div>
    </div>
    <div class="tc">
      <div class="tb"><span class="tt">${yr} 年技師月薪表</span></div>
      <div class="tw"><table style="width:100%">
        <tr><th>月份</th><th>技師</th><th>服務時數/次</th><th>應付薪資</th></tr>
        ${yearTechEntries.map(([key,t])=>`<tr style="cursor:pointer" onclick="techMonthDetail('${key}')" onmouseover="this.style.background='var(--acl)'" onmouseout="this.style.background=''">
          <td style="color:var(--ac);font-weight:600">${t.ym}</td>
          <td style="font-weight:500">${t.name}</td>
          <td style="text-align:center">${t.sessions}</td>
          <td class="num" style="font-weight:700;color:var(--bl)">${fM(t.pay)}</td>
        </tr>`).join('')||'<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--tx3)">尚無記錄</td></tr>'}
      </table></div>
    </div>
  </div>`;
}

window.showSvcFinance = showSvcFinance;

async function svcMonthDetail(ym) {
  const [y,m] = ym.split('-').map(Number);
  const nextYm = (m===12 ? (y+1)+'-01' : y+'-'+String(m+1).padStart(2,'0'))+'-01';
  const [{ data:orders, error:e1 },{ data:transfers, error:e2 }] = await Promise.all([
    sb.from('service_orders').select('order_no,order_date,customer_name,total,consumable_cost').gte('order_date',ym+'-01').lt('order_date',nextYm).order('order_date'),
    sb.from('service_transfers').select('transfer_date,product_name,qty_stock,qty_service,total_cost').gte('transfer_date',ym+'-01').lt('transfer_date',nextYm).order('transfer_date'),
  ]);
  if(e1) console.error('svcMonthDetail orders error',e1);
  if(e2) console.error('svcMonthDetail transfers error',e2);
  const revTotal=(orders||[]).reduce((s,o)=>s+(o.total||0),0);
  const costTotal=(orders||[]).reduce((s,o)=>s+(o.consumable_cost||0),0);

  OM(`${ym} 服務明細`, `
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;margin-bottom:14px">
    <div style="background:var(--sf2);border-radius:var(--r);padding:8px 10px;text-align:center">
      <div style="font-size:10px;color:var(--tx3);margin-bottom:2px">服務收入</div><div style="font-weight:700;color:var(--ac)">${fM(revTotal)}</div></div>
    <div style="background:var(--sf2);border-radius:var(--r);padding:8px 10px;text-align:center">
      <div style="font-size:10px;color:var(--tx3);margin-bottom:2px">耗材成本</div><div style="font-weight:700;color:var(--rd)">${fM(costTotal)}</div></div>
    <div style="background:var(--acl);border-radius:var(--r);padding:8px 10px;text-align:center;border:1px solid var(--ac)">
      <div style="font-size:10px;color:var(--tx3);margin-bottom:2px">淨利</div><div style="font-weight:700;font-size:16px;color:${(revTotal-costTotal)>=0?'var(--ac)':'var(--rd)'}">${fM(revTotal-costTotal)}</div></div>
  </div>
  ${orders?.length?`<div class="sh">服務單（${orders.length}筆）</div>
  <div style="overflow-x:auto"><table class="itb" style="min-width:300px">
    <tr><th>單號</th><th>日期</th><th>客戶</th><th>金額</th><th>耗材成本</th></tr>
    ${orders.map(o=>`<tr><td><a href="#" onclick="event.preventDefault();CM();setTimeout(()=>svcShowOrder('${o.order_no}'),80)" style="color:var(--ac);font-size:11px;font-family:monospace">${o.order_no}</a></td>
      <td style="font-size:11px">${fD(o.order_date)}</td><td style="font-size:12px">${o.customer_name||'—'}</td>
      <td class="num">${fM(o.total)}</td>
      <td class="num" style="color:var(--rd)">${fM(o.consumable_cost)}</td></tr>`).join('')}
  </table></div>`:'<div style="text-align:center;color:var(--tx3);padding:16px 0">本月無服務單</div>'}
  ${transfers?.length?`<div class="sh" style="margin-top:10px">撥轉記錄（${transfers.length}筆，純參考——把商品搬進服務庫存的動作，不算真正花費，不影響淨利）</div>
  <div style="overflow-x:auto"><table class="itb" style="min-width:280px">
    <tr><th>日期</th><th>商品</th><th>撥轉量</th><th>換算</th><th>參考金額</th></tr>
    ${transfers.map(t=>`<tr>
      <td style="font-size:11px">${fD(t.transfer_date)}</td><td style="font-size:12px">${t.product_name||'—'}</td>
      <td class="num">${t.qty_stock}</td><td class="num" style="color:var(--ac)">${t.qty_service}</td>
      <td class="num" style="color:var(--tx3)">${fM(t.total_cost)}</td></tr>`).join('')}
  </table></div>`:''}
  `,`<button class="btn" onclick="CM()">關閉</button>`);
}
window.svcMonthDetail = svcMonthDetail;

async function techMonthDetail(key) {
  const rows = window._svcTechDetail?.[key]||[];
  if(!rows.length){ toast('無資料','w'); return; }
  const [name,ym] = [rows[0].technician_name, (rows[0].order_date?.order_date||'').slice(0,7)];
  const orderNos = [...new Set(rows.map(r=>r.order_no))];
  const { data:ords } = await sb.from('service_orders').select('order_no,order_date,customer_name').in('order_no',orderNos);
  const ordMap = {}; (ords||[]).forEach(o=>ordMap[o.order_no]=o);
  const totalPay = rows.reduce((s,r)=>s+(r.technician_pay||0),0);
  // 照服務單當初登記的日期排序（不是資料庫查詢回來的隨機順序）
  rows.sort((a,b)=> (ordMap[a.order_no]?.order_date||'').localeCompare(ordMap[b.order_no]?.order_date||'') || (a.order_no||'').localeCompare(b.order_no||''));

  OM(`${ym} ${name} 薪資明細`, `
  <div style="font-size:16px;font-weight:700;margin-bottom:14px;color:var(--bl)">應付薪資合計：${fM(totalPay)}</div>
  <table class="itb"><tr><th>服務單</th><th>日期</th><th>客戶</th><th>項目</th><th>數量</th><th>抽成</th></tr>
    ${rows.map(r=>`<tr>
      <td><a href="#" onclick="event.preventDefault();CM();setTimeout(()=>svcShowOrder('${r.order_no}'),80)" style="color:var(--ac);font-size:11px;font-family:monospace">${r.order_no}</a></td>
      <td style="font-size:11px">${fD(ordMap[r.order_no]?.order_date)}</td>
      <td style="font-size:12px">${ordMap[r.order_no]?.customer_name||'—'}</td>
      <td style="font-size:12px">${r.item_name||'—'}</td>
      <td class="num">${r.qty}</td>
      <td class="num" style="color:var(--bl)">${fM(r.technician_pay)}</td>
    </tr>`).join('')}
  </table>`,
  `<button class="btn" onclick="CM()">關閉</button>`);
}
window.techMonthDetail = techMonthDetail;