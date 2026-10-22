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

// ── 計費期間（帳單上的起訖日，例如水費 6/10~8/6）──
// 有填計費期間：依「天數」比例攤到涵蓋的每個月（6/10~8/6 共58天 → 6月21天、7月31天、8月6天）。
// 沒填：照舊，從付款日期那個月開始，依攤提月數平均分攤（舊資料行為不變）。
// 「實際支出」永遠照付款日期（expense_date）那個月整筆算，跟成本分開看。
const _ymd = s => { const [y,m,d]=(s||'').split('-').map(Number); return (y&&m&&d)?new Date(Date.UTC(y,m-1,d)):null; };
const _ymOf = dt => `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,'0')}`;
const _DAY = 86400000;
function opexHasPeriod(r){
  const a=_ymd(r.period_start), b=_ymd(r.period_end);
  return !!(a && b && b>=a);
}
// 計費期間每個月分到幾天（含頭含尾）
function opexPeriodDays(startStr, endStr){
  const a=_ymd(startStr), b=_ymd(endStr);
  if(!a || !b || b<a) return [];
  const out=[]; let cur=a;
  while(cur<=b){
    const monthEnd=new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth()+1, 0));
    const segEnd = monthEnd<b ? monthEnd : b;
    out.push({ ym:_ymOf(cur), days:Math.round((segEnd-cur)/_DAY)+1 });
    cur=new Date(segEnd.getTime()+_DAY);
  }
  return out;
}
// 按天數比例分金額（整數，最後一個月吃餘數，確保加總＝原始金額）
function opexSplitByDays(total, parts){
  const totalDays = parts.reduce((s,p)=>s+p.days,0) || 1;
  let used=0;
  return parts.map((p,i)=>{
    const amt = i===parts.length-1 ? total-used : Math.round(total*p.days/totalDays);
    used+=amt; return { ...p, amount:amt };
  });
}
const _md = s => { const d=_ymd(s); return d?`${d.getUTCMonth()+1}/${d.getUTCDate()}`:''; };
function opexPeriodLabel(r){
  if(opexHasPeriod(r)) return `${_md(r.period_start)}~${_md(r.period_end)}（${opexPeriodDays(r.period_start,r.period_end).reduce((s,p)=>s+p.days,0)}天）`;
  const months = Math.max(1, r.amortize_months||1);
  const st = (r.expense_date||'').slice(0,7);
  return months>1 ? `${st} ~ ${addMonthsYm(st,months-1)}` : st;
}

// 把一筆支出展開成它涵蓋的每一個月＋每月分攤到的金額
function expandOpexToMonths(r){
  const payYm = (r.expense_date||'').slice(0,7);
  const total = r.amount||0;
  if(opexHasPeriod(r)){
    const parts = opexSplitByDays(total, opexPeriodDays(r.period_start, r.period_end));
    return parts.map(p=>({ ym:p.ym, amount:p.amount, days:p.days, src:r, isAttributed:p.ym!==payYm, totalMonths:parts.length }));
  }
  const months = Math.max(1, r.amortize_months||1);
  if(!payYm) return [];
  const base = Math.floor(total/months);
  const first = total - base*(months-1);
  const out = [];
  for(let i=0;i<months;i++){
    const segYm = addMonthsYm(payYm,i);
    out.push({ ym:segYm, amount:i===0?first:base, src:r, isAttributed:segYm!==payYm, totalMonths:months });
  }
  return out;
}

// 日期往後推 n 個月（日超過該月天數就取月底），給自動延續的計費期間用
function addMonthsDate(str, n){
  const d=_ymd(str); if(!d) return null;
  const y=d.getUTCFullYear(), m=d.getUTCMonth()+n, day=d.getUTCDate();
  const last=new Date(Date.UTC(y, m+1, 0)).getUTCDate();
  const nd=new Date(Date.UTC(y, m, Math.min(day,last)));
  return nd.toISOString().slice(0,10);
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
  const thisMonth = ym();
  const { data:all } = await sb.from('operating_expenses').select('*');
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
    // 有填計費期間的（水電瓦斯這類帳單常晚到、金額每期都不同），不自動補，避免跟之後登記的真帳單重複；
    // 改成在營運成本頁提醒「該登記下一期了」（見 opexDueReminders）
    if(opexHasPeriod(src)) return;
    const interval = Math.max(1, src.amortize_months || OPEX_FREQ_MONTHS[src.recur_freq] || 1);
    const srcYm = (src.expense_date||'').slice(0,7);
    if(!srcYm) return;
    const nextDueYm = addMonthsYm(srcYm, interval);
    if(nextDueYm > thisMonth) return; // 還沒到下一次繳費的月份
    if((keysByMonth[thisMonth]||new Set()).has(keyOf(src))) return; // 這一期已經登記過了
    const day = Math.min(parseInt((src.expense_date||'').slice(8,10))||1, daysInThisMonth);
    const newDate = `${thisMonth}-${String(day).padStart(2,'0')}`;
    const baseNote = stripOpexAutoMark(src.note);
    const rec = {
      expense_no: 'OX-'+thisMonth.replace('-','')+'-A'+idx+Date.now().toString().slice(-4),
      expense_date:newDate, category:src.category, amount:src.amount,
      recur_freq:src.recur_freq, amortize_months:src.amortize_months||1, is_recurring:true,
      note: (baseNote?baseNote+'　':'')+OPEX_AUTO_MARK
    };
    // 上一期有填計費期間，新的一期也往後推同樣的月數（只是預估，收到帳單後記得照帳單改）
    if(opexHasPeriod(src)) { rec.period_start = addMonthsDate(src.period_start, interval); rec.period_end = addMonthsDate(src.period_end, interval); }
    toInsert.push(rec);
  });
  if(!toInsert.length) return;
  const { error } = await sb.from('operating_expenses').insert(toInsert);
  if(!error) toast(`✅ 已自動補上 ${toInsert.length} 筆到期的固定支出，記得檢查金額是否需要調整`);
}
window.autoCarryForwardOpex = autoCarryForwardOpex;
window.expandOpexToMonths = expandOpexToMonths;

// 提醒：有填計費期間＋有設頻率的帳單，上一期結束後再過一個週期（下一期也該結束了）還沒登記新的一期，就提醒一下
function opexDueReminders(all){
  const latest = {};
  (all||[]).filter(opexHasPeriod).forEach(r=>{
    const kk = r.category; // 同類別（水費／電費／天然氣）看最新那一期就好
    if(!latest[kk] || r.period_end > latest[kk].period_end) latest[kk] = r;
  });
  const td = today();
  return Object.values(latest).filter(r=>r.recur_freq).map(r=>{
    const interval = Math.max(1, OPEX_FREQ_MONTHS[r.recur_freq] || r.amortize_months || 1);
    const nextEnd = addMonthsDate(r.period_end, interval);
    return nextEnd && td >= nextEnd ? { r, nextStart: addMonthsDate(r.period_end, 0), nextEnd } : null;
  }).filter(Boolean);
}

async function opex(){
  await autoCarryForwardOpex();
  const { data:allRecs, count } = await sb.from('operating_expenses').select('*',{count:'exact'}).order('expense_date',{ascending:false});

  const thisMonth = ym();

  // 依「攤提月數」把每一筆記錄展開到它涵蓋的月份，年度/月份彙整都用展開後的金額，
  // 這樣像保費、借址登記費這種一次繳一年的支出，才會平均反映在每個月的營運成本裡，
  // 而不是只有繳費那個月看起來爆增、其他月份看起來很低。
  // total＝分攤後的每月成本（依費用所屬月份攤提）；paid＝實際支出（付款日期那個月整筆算）
  const yearMap = {}, monthMap = {};
  const ensureY = yr => (yearMap[yr] = yearMap[yr] || {count:0,total:0,paid:0});
  const ensureM = m => (monthMap[m] = monthMap[m] || {count:0,total:0,paid:0,items:[],paidItems:[]});
  (allRecs||[]).forEach(r=>{
    expandOpexToMonths(r).forEach(seg=>{
      const yr = seg.ym.slice(0,4);
      if(!yr) return;
      const y=ensureY(yr); y.count++; y.total+=seg.amount;
      const m=ensureM(seg.ym); m.count++; m.total+=seg.amount; m.items.push(seg);
    });
    const payYm = (r.expense_date||'').slice(0,7);
    if(payYm){
      ensureY(payYm.slice(0,4)).paid += r.amount||0;
      const m=ensureM(payYm); m.paid += r.amount||0; m.paidItems.push(r);
    }
  });
  const years = Object.keys(yearMap).sort().reverse();
  const monthTotal = monthMap[thisMonth]?.total || 0;
  const yearTotal = yearMap[thisMonth.slice(0,4)]?.total || 0;
  const monthPaid = monthMap[thisMonth]?.paid || 0;
  const yearPaid = yearMap[thisMonth.slice(0,4)]?.paid || 0;

  $('main').innerHTML=`
  <div class="ph"><div><div class="pt">營運成本</div><div class="ps">共 ${count||0} 筆</div></div>
    <div class="ha"><button class="btn btn-p btn-s" onclick="addOpex()">＋ 新增記錄</button></div></div>
  <div class="pc">
    <div class="mg">
      <div class="mc"><div class="ml">本月成本（分攤後）</div><div class="mv cr">${fM(monthTotal)}</div></div>
      <div class="mc"><div class="ml">本月實際支出</div><div class="mv">${fM(monthPaid)}</div></div>
      <div class="mc"><div class="ml">今年成本（分攤後）</div><div class="mv cr">${fM(yearTotal)}</div></div>
      <div class="mc"><div class="ml">今年實際支出</div><div class="mv">${fM(yearPaid)}</div></div>
    </div>
    <div class="al al-w" style="font-size:12px">
      <b>分攤後成本</b>＝這個月真正用掉多少（水電瓦斯照帳單計費期間按天數攤）；<b>實際支出</b>＝這個月實際付出去多少錢。
    </div>
    ${(()=>{ const due = opexDueReminders(allRecs); return due.length ? `<div class="al" style="font-size:12px;background:var(--acl);border-radius:var(--r);padding:8px 12px;margin-bottom:12px">
      📮 這些帳單的下一期應該已經出來了，收到後記得登記：${due.map(d=>`<b>${d.r.category}</b>（上一期到 ${_md(d.r.period_end)}）`).join('、')}
    </div>` : ''; })()}`;

  // ── 第一層：年度總覽 ──
  if(!_opexYear) {
    $('main').innerHTML += `
    <div class="tc">
      <div class="tb"><span class="tt">年度總覽（點年份看每月）</span></div>
      <div class="tw"><table style="width:100%">
        <tr><th>年份</th><th class="num" style="font-weight:700">分攤後成本</th><th class="num">實際支出</th></tr>
        ${years.map(yr=>{
          const y=yearMap[yr];
          return `<tr style="cursor:pointer" onclick="_opexYear='${yr}';opex()" onmouseover="this.style.background='var(--acl)'" onmouseout="this.style.background=''">
            <td style="font-weight:700;color:var(--ac);font-size:15px">${yr} ›</td>
            <td class="num" style="font-weight:700;color:var(--rd)">${fM(y.total)}</td>
            <td class="num" style="color:var(--tx2)">${fM(y.paid)}</td>
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
      <div class="tb"><span class="tt">${_opexYear} 年每月（點月份看明細）</span></div>
      <div class="tw"><table style="width:100%">
        <tr><th>月份</th><th class="num" style="font-weight:700">分攤後成本</th><th class="num">實際支出</th></tr>
        ${yearMonths.map(ym=>{
          const m=monthMap[ym];
          return `<tr style="cursor:pointer" onclick="_opexMonth='${ym}';opex()" onmouseover="this.style.background='var(--acl)'" onmouseout="this.style.background=''">
            <td style="font-weight:600;color:var(--ac)">${ym} ›</td>
            <td class="num" style="font-weight:700;color:var(--rd)">${fM(m.total)}</td>
            <td class="num" style="color:var(--tx2)">${fM(m.paid)}</td>
          </tr>`;
        }).join('')||'<tr><td colspan="3" style="text-align:center;padding:20px;color:var(--tx3)">本年度尚無記錄</td></tr>'}
      </table></div>
    </div>
  </div>`;
    return;
  }

  // ── 第三層：該月明細 ──
  // 一筆支出一列，「本月成本」跟「本月付款」並排：
  // 例如 8/5 付的天然氣帳單（5/18~7/17），在 8 月這一頁只會出現在「本月付款」那欄，本月成本是空的。
  const freqLabel = { monthly:'每月固定', bimonthly:'每兩月', yearly:'每年' };
  const mm = monthMap[_opexMonth] || { items:[], paidItems:[], total:0, paid:0 };
  const rowsById = {};
  mm.items.forEach(seg=>{ const r=seg.src; rowsById[r.id]=rowsById[r.id]||{r}; rowsById[r.id].cost=(rowsById[r.id].cost||0)+seg.amount; rowsById[r.id].days=seg.days; });
  mm.paidItems.forEach(r=>{ rowsById[r.id]=rowsById[r.id]||{r}; rowsById[r.id].paid=r.amount||0; });
  const rows = Object.values(rowsById).sort((x,y)=>(x.r.category||'').localeCompare(y.r.category||'') || (x.r.expense_date||'').localeCompare(y.r.expense_date||''));
  const periodCell = r => {
    if(opexHasPeriod(r)) return `${_md(r.period_start)}~${_md(r.period_end)}`;
    const f = r.recur_freq ? (freqLabel[r.recur_freq]||r.recur_freq) : '一次性';
    const m = Math.max(1, r.amortize_months||1);
    return m>1 ? `${f}（攤${m}個月）` : f;
  };
  $('main').innerHTML += `
    <div style="margin-bottom:14px">
      <button class="btn btn-s" onclick="_opexMonth=null;opex()">‹ 返回 ${_opexYear} 年</button>
    </div>
    <div class="tc">
      <div class="tb"><span class="tt">${_opexMonth} 明細</span></div>
      <div class="tw"><table style="width:100%">
        <tr><th>類別</th><th class="num">本月成本</th><th class="num">本月付款</th><th>計費期間／頻率</th><th>付款日</th><th></th></tr>
        ${rows.map(({r,cost,paid,days})=>{
          const note = stripOpexAutoMark(r.note);
          const isAuto = (r.note||'').includes(OPEX_AUTO_MARK);
          return `<tr>
          <td><span class="badge bgr">${r.category}</span>${note?`<div style="font-size:11px;color:var(--tx3);margin-top:2px">${note}</div>`:''}${isAuto?`<div style="font-size:11px;color:var(--am);margin-top:2px">系統自動延續，待確認</div>`:''}</td>
          <td class="num" style="font-weight:600;color:var(--rd)">${cost!=null?fM(cost):'<span style="color:var(--tx3);font-weight:400">—</span>'}${days&&cost!=null?`<div style="font-size:11px;font-weight:400;color:var(--tx3)">${days} 天</div>`:''}</td>
          <td class="num">${paid!=null?fM(paid):'<span style="color:var(--tx3)">—</span>'}</td>
          <td style="font-size:12px;color:var(--tx2)">${periodCell(r)}</td>
          <td style="font-size:12px;color:var(--tx2)">${fD(r.expense_date)}</td>
          <td><button class="btn btn-s" onclick="editOpex(${r.id})">編輯</button></td>
        </tr>`;
        }).join('')||'<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--tx3)">本月沒有記錄</td></tr>'}
        <tr style="background:var(--sf2);font-weight:700">
          <td>合計</td>
          <td class="num" style="color:var(--rd)">${fM(mm.total)}</td>
          <td class="num">${fM(mm.paid)}</td>
          <td colspan="3"></td>
        </tr>
      </table></div>
    </div>
  </div>`;
}
window.opex = opex;

// 計費期間：選填，填了起訖日就照天數攤，下方即時顯示每個月分到多少
function oxPeriodHint(){
  const hint=$('ox-period-hint'); if(!hint) return;
  const a=$('f-oxps')?.value, b=$('f-oxpe')?.value, amt=parseFloat($('f-oxamt')?.value)||0;
  const payYm=($('f-oxdate')?.value||'').slice(0,7);
  if(!a && !b){ hint.textContent='沒填計費期間：照付款月份＋支出頻率平均攤（一般月繳的支出不用填）'; return; }
  if(!a || !b){ hint.textContent='起日、迄日都要填'; return; }
  const parts=opexPeriodDays(a,b);
  if(!parts.length){ hint.textContent='迄日不能早於起日'; return; }
  const totalDays=parts.reduce((s,p)=>s+p.days,0);
  const split=opexSplitByDays(amt,parts);
  hint.innerHTML=`共 ${totalDays} 天：`+split.map(p=>`${p.ym.slice(5)}月 ${p.days}天${amt?` ${fM(p.amount)}`:''}`).join('、')
    + (payYm?`<br>實際支出算在付款月份 ${payYm}`:'');
}
window.oxPeriodHint = oxPeriodHint;
function addOpex() {
  OM('新增營運成本', `
  <div class="fg">
    <div class="fl"><label>付款日期</label><input id="f-oxdate" type="date" value="${today()}" autocomplete="off" oninput="oxPeriodHint()"></div>
    <div class="fl fw"><label>計費期間（選填，照帳單上的起訖日填，水電瓦斯用）</label>
      <div style="display:flex;gap:6px;align-items:center">
        <input id="f-oxps" type="date" value="" autocomplete="off" oninput="oxPeriodHint()" style="flex:1">
        <span>~</span>
        <input id="f-oxpe" type="date" value="" autocomplete="off" oninput="oxPeriodHint()" style="flex:1">
      </div>
      <div id="ox-period-hint" style="font-size:11px;color:var(--tx3);margin-top:3px"></div>
    </div>
    <div class="fl"><label>類別</label><select id="f-oxcat">${_opexCategories.map(c=>`<option>${c}</option>`).join('')}</select></div>
    <div class="fl"><label>金額 *</label><input id="f-oxamt" type="number" value="" autocomplete="off" oninput="oxPeriodHint()"></div>
    <div class="fl"><label>支出頻率</label>
      <select id="f-oxfreq" onchange="oxPeriodHint()">
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
  oxPeriodHint();
}
window.addOpex = addOpex;
async function editOpex(id) {
  const { data:r } = await sb.from('operating_expenses').select('*').eq('id',id).single();
  if(!r) return;
  OM('編輯營運成本', `
  <div class="fg">
    <div class="fl"><label>付款日期</label><input id="f-oxdate" type="date" value="${r.expense_date||''}" autocomplete="off" oninput="oxPeriodHint()"></div>
    <div class="fl fw"><label>計費期間（選填，照帳單上的起訖日填，水電瓦斯用）</label>
      <div style="display:flex;gap:6px;align-items:center">
        <input id="f-oxps" type="date" value="${r.period_start||''}" autocomplete="off" oninput="oxPeriodHint()" style="flex:1">
        <span>~</span>
        <input id="f-oxpe" type="date" value="${r.period_end||''}" autocomplete="off" oninput="oxPeriodHint()" style="flex:1">
      </div>
      <div id="ox-period-hint" style="font-size:11px;color:var(--tx3);margin-top:3px"></div>
    </div>
    <div class="fl"><label>類別</label><select id="f-oxcat">${_opexCategories.map(c=>`<option ${c===r.category?'selected':''}>${c}</option>`).join('')}</select></div>
    <div class="fl"><label>金額 *</label><input id="f-oxamt" type="number" value="${r.amount??''}" autocomplete="off" oninput="oxPeriodHint()"></div>
    <div class="fl"><label>支出頻率</label>
      <select id="f-oxfreq" onchange="oxPeriodHint()">
        <option value="" ${!r.recur_freq?'selected':''}>一般支出（不循環，只算這一筆）</option>
        <option value="monthly" ${r.recur_freq==='monthly'?'selected':''}>每月固定（每月都要繳）</option>
        <option value="bimonthly" ${r.recur_freq==='bimonthly'?'selected':''}>每兩月一次（自動攤提到2個月）</option>
        <option value="yearly" ${r.recur_freq==='yearly'?'selected':''}>每年一次（自動攤提到12個月）</option>
      </select>
    </div>
    <div class="fl fw">${fi('oxnote','備註（選填）','text',r.note)}</div>
  </div>`,
  `<button class="btn btn-r" style="margin-right:auto" onclick="CM();deleteOpex(${id})">刪除</button>
   <button class="btn" onclick="CM()">取消</button>
   <button class="btn btn-p" onclick="saveOpex(${id})">儲存</button>`);
  oxPeriodHint();
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
  const ps=v('oxps')||null, pe=v('oxpe')||null;
  if((ps && !pe) || (!ps && pe)) { toast('計費期間起日、迄日都要填（或都不填）','e'); return; }
  if(ps && pe && pe<ps) { toast('計費期間迄日不能早於起日','e'); return; }
  payload.period_start = ps; payload.period_end = pe;
  if(!id) payload.expense_no = 'OX-'+v('oxdate').replace(/-/g,'')+'-'+Date.now().toString().slice(-4);
  const write = p => id ? sb.from('operating_expenses').update(p).eq('id',id) : sb.from('operating_expenses').insert(p);
  let { error } = await write(payload);
  // 保險：資料庫萬一還沒有計費期間欄位，就先不帶這兩個欄位存，這筆照付款月份算
  if(error && /period_(start|end)/.test(error.message||'')) {
    const hadPeriod = !!payload.period_start;
    delete payload.period_start; delete payload.period_end;
    ({ error } = await write(payload));
    if(!error && hadPeriod) toast('已儲存，但資料庫還沒有計費期間欄位，這筆先照付款月份算','w');
  }
  if(error) { toast('儲存失敗：'+error.message,'e'); return; }
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

let _bonusVendors=[];
async function loadBonusVendors(){
  const{data}=await sb.from('vendors').select('name').eq('is_active',true).order('sort_order').order('name');
  _bonusVendors=data||[];
}
function bonusPayerField(val){
  return `<div class="fl"><label>發放者（上家，可從廠商選擇或自行輸入）</label>
    <input id="f-bpayer" list="bpayer-dl" type="text" value="${(val||'').toString().replace(/"/g,'&quot;')}" placeholder="輸入或從廠商中選擇" autocomplete="off"
      style="width:100%;padding:7px 8px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;outline:none">
    <datalist id="bpayer-dl">${_bonusVendors.map(x=>`<option value="${x.name.replace(/"/g,'&quot;')}">`).join('')}</datalist>
  </div>`;
}

// ── 獎金/分潤明細（選填，記錄佐證依據，例如上游後台顯示的訂單/產品明細）──
// 純手動謄寫用的備份資料，不連動系統裡的商品/訂單，所以直接存一個 JSON 陣列在
// bonus_records.detail_items，不用另外開關聯表。_bnDetailItems 是表單開啟期間的暫存清單，
// 新增/編輯表單開啟時要記得重設或帶入既有資料，儲存時再整包寫回欄位。
let _bnDetailItems=[];
// 依訂單編號分組（同一張單的品項疊在一起，不用每列都重複打單號），保留第一次出現的順序。
// items 可以是原始明細，也可以是先標好 _idx（原始陣列位置，給刪除按鈕用）的版本。
function bnGroupDetailItems(items){
  const groups=[]; const posByKey=new Map();
  (items||[]).forEach(it=>{
    const key=it.order_no||'';
    if(!posByKey.has(key)){ posByKey.set(key,groups.length); groups.push({order_no:it.order_no||null,order_date:it.order_date||null,items:[]}); }
    else if(!groups[posByKey.get(key)].order_date && it.order_date){ groups[posByKey.get(key)].order_date=it.order_date; }
    groups[posByKey.get(key)].items.push(it);
  });
  return groups;
}
// editable=true 時每列多一個刪除按鈕（用 it._idx 對應 _bnDetailItems 原始位置）
function bnDetailGroupsHtml(items,editable){
  if(!items||!items.length) return editable?'<div style="font-size:12px;color:var(--tx3)">尚未加入明細</div>':'';
  const groups=bnGroupDetailItems(items);
  let total=0;
  const body=groups.map(g=>{
    const subtotal=g.items.reduce((s,it)=>s+(Number(it.unit)||0)*(Number(it.qty)||0),0);
    total+=subtotal;
    return `<div style="border:1px solid var(--bd);border-radius:var(--r);overflow:hidden;margin-bottom:8px">
      <div style="background:var(--sf2);padding:6px 10px;display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:12px;font-weight:700;font-family:monospace">${g.order_no||'（未填訂單編號）'}${g.order_date?` <span style="font-weight:400;color:var(--tx3);font-family:inherit">（${fD(g.order_date)}）</span>`:''}</span>
        <span style="font-size:12px;color:var(--tx3)">小計 <b style="color:var(--tx)">${fM(subtotal)}</b></span>
      </div>
      <div style="overflow-x:auto"><table class="itb" style="width:100%;min-width:260px">
        <tr><th>產品名稱</th><th>分潤金額</th><th>數量</th><th>小計</th>${editable?'<th></th>':''}</tr>
        ${g.items.map(it=>`<tr>
          <td style="font-size:12px">${(it.name||'').toString().replace(/</g,'&lt;')}</td>
          <td class="num">${fM(it.unit)}</td>
          <td class="num">${it.qty}</td>
          <td class="num" style="font-weight:600">${fM((Number(it.unit)||0)*(Number(it.qty)||0))}</td>
          ${editable?`<td><button type="button" class="btn btn-s btn-r" onclick="bnRemoveDetailItem(${it._idx})">刪</button></td>`:''}
        </tr>`).join('')}
      </table></div>
    </div>`;
  }).join('');
  return body + `<div style="text-align:right;margin-top:6px;font-size:12px;color:var(--tx3)">明細加總：<b style="color:var(--tx);font-size:14px">${fM(total)}</b>${editable?'（僅供核對，不會自動覆蓋上方金額欄位）':''}</div>`;
}
function bnDetailListHtml(){ return bnDetailGroupsHtml(_bnDetailItems.map((it,i)=>({...it,_idx:i})),true); }
function bnRenderDetailList(){ const box=$('bn-detail-list'); if(box) box.innerHTML=bnDetailListHtml(); }
// 唯讀版本（給「查看」畫面顯示佐證明細用，不帶刪除按鈕，也不依賴表單暫存的 _bnDetailItems）
function bnDetailViewHtml(items){ return bnDetailGroupsHtml(items,false); }
function bnDetailSection(){
  return `<label style="margin-bottom:6px;display:block">明細（選填，記錄佐證依據，例如上游後台顯示的訂單/產品明細；同一張訂單的產品可以連續加，訂單編號跟日期不用每列重打，換下一張單再改）</label>
    <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:end;margin-bottom:8px">
      <div style="flex:1 1 100px;min-width:90px"><div style="font-size:11px;color:var(--tx3);margin-bottom:2px">訂單編號</div><input id="bn-di-order" type="text" placeholder="選填" autocomplete="off" style="width:100%;padding:6px;border:1px solid var(--bd);border-radius:var(--r);font-size:12px;box-sizing:border-box"></div>
      <div style="flex:1 1 140px;min-width:130px"><div style="font-size:11px;color:var(--tx3);margin-bottom:2px">官方單據日期</div><input id="bn-di-date" type="date" autocomplete="off" style="width:100%;padding:6px;border:1px solid var(--bd);border-radius:var(--r);font-size:12px;box-sizing:border-box"></div>
      <div style="flex:2 1 160px;min-width:120px"><div style="font-size:11px;color:var(--tx3);margin-bottom:2px">產品名稱</div><input id="bn-di-name" type="text" placeholder="產品名稱" autocomplete="off" style="width:100%;padding:6px;border:1px solid var(--bd);border-radius:var(--r);font-size:12px;box-sizing:border-box"></div>
      <div style="flex:1 1 90px;min-width:70px"><div style="font-size:11px;color:var(--tx3);margin-bottom:2px">分潤金額</div><input id="bn-di-unit" type="number" placeholder="單件" autocomplete="off" style="width:100%;padding:6px;border:1px solid var(--bd);border-radius:var(--r);font-size:12px;box-sizing:border-box"></div>
      <div style="flex:1 1 70px;min-width:60px"><div style="font-size:11px;color:var(--tx3);margin-bottom:2px">數量</div><input id="bn-di-qty" type="number" value="1" min="1" step="1" autocomplete="off" style="width:100%;padding:6px;border:1px solid var(--bd);border-radius:var(--r);font-size:12px;box-sizing:border-box"></div>
      <button type="button" class="btn btn-s" onclick="bnAddDetailItem()">＋加入</button>
    </div>
    <div id="bn-detail-list">${bnDetailListHtml()}</div>`;
}
function bnAddDetailItem(){
  const name=($('bn-di-name')?.value||'').trim();
  const unit=parseFloat($('bn-di-unit')?.value)||0;
  const qty=parseFloat($('bn-di-qty')?.value)||1;
  const order_no=($('bn-di-order')?.value||'').trim();
  const order_date=($('bn-di-date')?.value||'').trim();
  if(!name){toast('請填寫產品名稱','e');return;}
  _bnDetailItems.push({order_no:order_no||null,order_date:order_date||null,name,unit,qty});
  // 訂單編號跟日期故意不清空——同一張單通常會連續加好幾個產品，留著方便繼續打；換單再自己改掉
  $('bn-di-name').value=''; $('bn-di-unit').value=''; $('bn-di-qty').value='1';
  $('bn-di-name').focus();
  bnRenderDetailList();
}
function bnRemoveDetailItem(i){ _bnDetailItems.splice(i,1); bnRenderDetailList(); }
window.bnAddDetailItem=bnAddDetailItem;
window.bnRemoveDetailItem=bnRemoveDetailItem;

// ── 同階代理下家分潤：客戶因跟她的上家同階被拉到我方出貨，訂單確認收款後要把官方分潤原封不動轉給她真正的上家（受益人）──
// 抓所有「有設定分潤受益人」的客戶底下、已確認收款、還沒建立過分潤記錄的訂單，用「訂購數量 × 商品官方分潤金額」自動算出應分潤金額
// （原本用「全部出貨」當觸發點，2026-09 使用者實測後改成「確認收款」就觸發，不用等出貨完成——所以這裡的數量要用訂購量 qty，不能用 shipped_qty，
//  出貨前 shipped_qty 在資料庫預設值就是 0（不是 null），用 shipped_qty??qty 會被 0 卡住、金額永遠算成 0）
async function passthroughPendingRows(){
  const{data:benCusts}=await sb.from('customers').select('customer_no,name,passthrough_beneficiary_no').not('passthrough_beneficiary_no','is',null);
  if(!benCusts||!benCusts.length) return [];
  const custNos=benCusts.map(x=>x.customer_no);
  const benNos=[...new Set(benCusts.map(x=>x.passthrough_beneficiary_no).filter(Boolean))];
  const{data:benInfo}=await sb.from('customers').select('customer_no,name').in('customer_no',benNos);
  const benNameMap={}; (benInfo||[]).forEach(b=>benNameMap[b.customer_no]=b.name);
  const custBenMap={}; benCusts.forEach(c=>custBenMap[c.customer_no]=c.passthrough_beneficiary_no);
  const{data:orders}=await sb.from('sales_orders').select('order_no,order_date,payment_date,customer_no,customer_name').eq('payment_done',true).eq('passthrough_bonus_created',false).in('customer_no',custNos);
  if(!orders||!orders.length) return [];
  const orderNos=orders.map(o=>o.order_no);
  const{data:items}=await sb.from('sales_order_items').select('order_no,product_no,product_name,qty,is_gift').in('order_no',orderNos);
  const prodNos=[...new Set((items||[]).filter(i=>!i.is_gift).map(i=>i.product_no).filter(Boolean))];
  let bonusMap={};
  if(prodNos.length){
    const{data:prods}=await sb.from('products').select('product_no,official_bonus_amount').in('product_no',prodNos);
    (prods||[]).forEach(p=>bonusMap[p.product_no]=p.official_bonus_amount);
  }
  const itemsByOrder={}; (items||[]).forEach(i=>{(itemsByOrder[i.order_no]=itemsByOrder[i.order_no]||[]).push(i);});
  return orders.map(o=>{
    const its=(itemsByOrder[o.order_no]||[]).filter(i=>!i.is_gift);
    let amount=0,missingPrice=false;
    its.forEach(i=>{
      const unitBonus=bonusMap[i.product_no];
      const qty=i.qty||0;
      if(unitBonus==null){ if(qty) missingPrice=true; return; }
      amount+=unitBonus*qty;
    });
    return{order_no:o.order_no,order_date:o.payment_date||o.order_date,custName:o.customer_name,benName:benNameMap[custBenMap[o.customer_no]]||custBenMap[o.customer_no],amount,missingPrice};
  });
}
async function createPassthroughBonus(orderNo){
  if(!confirm('確定要建立這張訂單的下家分潤記錄嗎？'))return;
  const{data:order}=await sb.from('sales_orders').select('order_no,order_date,payment_date,customer_no,customer_name').eq('order_no',orderNo).single();
  if(!order){toast('找不到這張訂單','e');return;}
  const{data:cust}=await sb.from('customers').select('passthrough_beneficiary_no').eq('customer_no',order.customer_no).single();
  const benNo=cust?.passthrough_beneficiary_no;
  if(!benNo){toast('這位客戶目前沒有設定分潤受益人','e');return;}
  const{data:ben}=await sb.from('customers').select('name').eq('customer_no',benNo).single();
  const{data:items}=await sb.from('sales_order_items').select('product_no,product_name,qty,is_gift').eq('order_no',orderNo);
  const nonGift=(items||[]).filter(i=>!i.is_gift);
  const prodNos=[...new Set(nonGift.map(i=>i.product_no).filter(Boolean))];
  let bonusMap={};
  if(prodNos.length){
    const{data:prods}=await sb.from('products').select('product_no,official_bonus_amount').in('product_no',prodNos);
    (prods||[]).forEach(p=>bonusMap[p.product_no]=p.official_bonus_amount);
  }
  const orderDate=order.payment_date||order.order_date;
  const detailItems=[]; let total=0;
  nonGift.forEach(i=>{
    const unitBonus=bonusMap[i.product_no];
    const qty=i.qty||0;
    if(unitBonus==null||!qty) return;
    total+=unitBonus*qty;
    detailItems.push({order_no:orderNo,order_date:orderDate,name:i.product_name,unit:unitBonus,qty});
  });
  if(!detailItems.length){toast('這張訂單的品項都沒有設定官方分潤金額，請先到商品列表補上','e');return;}
  const no=await genNo('BN','bonus_records','record_no');
  const{error}=await sb.from('bonus_records').insert({
    record_no:no,record_date:orderDate,direction:'支出',recipient:ben?.name||benNo,type:'分潤',amount:total,
    payment_done:false,note:`同階代理「${order.customer_name}」訂單 ${orderNo} 確認收款，分潤轉給下家`,trigger_who:order.customer_name,
    year_month:ym(orderDate),detail_items:detailItems,passthrough_order_no:orderNo
  });
  if(error){toast('建立失敗：'+error.message,'e');return;}
  await sb.from('sales_orders').update({passthrough_bonus_created:true}).eq('order_no',orderNo);
  toast('分潤記錄已建立');
  bonus();
}
window.createPassthroughBonus=createPassthroughBonus;
// 「略過」：這筆訂單雖然符合同階代理分潤的條件，但實際上不需要（也不應該）建立分潤記錄——
// 最常見的情況是這張單發生在建這套系統以前、當初分潤早就已經處理過了。直接把 passthrough_bonus_created
// 標成 true（不建立 bonus_records），讓它從待處理清單消失，但不會假造一筆不存在的分潤記錄。
async function skipPassthroughOrder(orderNo){
  if(!confirm(`確定要略過這張訂單、不建立分潤記錄嗎？\n\n通常用在這筆訂單其實早就處理過分潤了（例如是建立這套系統以前的舊訂單），不是系統漏算，只是不需要再建一次。\n\n這個動作不會建立任何分潤記錄，只是讓這張單不再出現在待處理清單。`))return;
  await sb.from('sales_orders').update({passthrough_bonus_created:true}).eq('order_no',orderNo);
  toast('已略過這張訂單');
  bonus();
}
window.skipPassthroughOrder=skipPassthroughOrder;

async function bonus(){
  const passthroughRows=await passthroughPendingRows();
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
      發票號碼：收入方向是我方開票給上家報稅；支出方向如果下家本身是營業人，換成下家開票給我方——兩種方向都可能用到，這欄不強制填。完成後按下「收款」或「發放」，財務月結算時此處合計即為當月獎金收支。
    </div>
    ${passthroughRows.length?`<div class="tc" style="margin-bottom:16px;border:1px solid #ffd54f">
      <div class="tb" style="background:#fff8e1"><span class="tt" style="color:#8d6e00">📋 待建立的下家分潤（${passthroughRows.length} 筆訂單）</span></div>
      <div style="padding:10px 14px">
        <div style="font-size:12px;color:var(--tx3);margin-bottom:10px">以下是同階代理客戶、已確認收款的訂單，分潤要轉給右邊列出的受益人。金額用「訂購數量 × 商品官方分潤金額」自動算，⚠ 代表有品項還沒設定官方分潤金額（去商品列表補上即可）。</div>
        <div style="overflow-x:auto"><table class="itb" style="width:100%;min-width:480px">
          <tr><th>訂單號</th><th>日期</th><th>下單客戶</th><th>分潤受益人</th><th>應分潤金額</th><th></th></tr>
          ${passthroughRows.map(r=>`<tr>
            <td><a href="#" onclick="event.preventDefault();setTimeout(()=>showOrder('${r.order_no}'),80)" style="color:var(--ac);font-family:monospace;font-size:12px">${r.order_no}</a></td>
            <td style="font-size:11px">${fD(r.order_date)}</td>
            <td style="font-size:12px">${r.custName}</td>
            <td style="font-size:12px">${r.benName||'—'}</td>
            <td class="num" style="font-weight:600">${fM(r.amount)}${r.missingPrice?'<span title="有品項還沒設定官方分潤金額，金額可能不完整" style="color:var(--rd);margin-left:4px">⚠</span>':''}</td>
            <td><div style="display:flex;gap:4px">
              <button class="btn btn-s btn-p" onclick="createPassthroughBonus('${r.order_no}')">建立分潤</button>
              <button class="btn btn-s" onclick="skipPassthroughOrder('${r.order_no}')">略過</button>
            </div></td>
          </tr>`).join('')}
        </table></div>
      </div>
    </div>`:''}
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
          <td class="num" style="font-weight:600;color:${b.direction==='收入'?'var(--ac)':'var(--rd)'}">${fM(b.amount)}${Array.isArray(b.detail_items)&&b.detail_items.length?'<span title="含明細佐證資料" style="margin-left:4px;font-size:11px">📋</span>':''}</td>
          <td style="font-size:11px;color:var(--tx2)">${b.invoice_no||'—'}</td>
          <td><span class="badge ${b.payment_done?'bg':'br2'}">${b.payment_done?'已完成':'待處理'}</span></td>
          <td><div style="display:flex;gap:3px">
            <button class="btn btn-s" onclick="showBonus('${b.record_no}')">查看</button>
            <button class="btn btn-s" onclick="editBonus('${b.record_no}')">編輯</button>
            <button class="btn btn-s" onclick="quickInvoiceBN('${b.record_no}')">發票</button>
            <button class="btn btn-s ${b.payment_done?'':'btn-p'}" onclick="toggleBonus('${b.id}',${b.payment_done},'${b.direction}')">${b.payment_done?'取消':(b.direction==='收入'?'收款':'發放')}</button>
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
  await loadBonusVendors();
  _bnDetailItems=[];
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
    <div id="bonus-income-fields" style="display:none;grid-column:1/-1;grid-template-columns:1fr 1fr;gap:10px">
      ${bonusPayerField('')}
      ${fi('btrigger','因誰而收（下家/同階）')}
    </div>
    <div class="fl"><label>金額（收入方向請填含稅實收總額）</label><input id="f-bamt" type="number" autocomplete="off" oninput="bonusCalcTax()"></div>
    ${payMethodSel('bpay','')}
    <div class="fl fw" id="bonus-tax-calc" style="display:none;font-size:12px;color:var(--tx3);background:var(--sf2);padding:8px 10px;border-radius:var(--r)"></div>
    ${fi('binv','發票號碼','text')} ${fi('bpdt','發放/收款日期','date')}
    <div class="fl fw">${bnDetailSection()}</div>
    <div class="fl fw">${fa('bnote','備註')}</div>
  </div>`,
  `<button class="btn" onclick="CM()">取消</button><button class="btn btn-p" onclick="saveBonus()">儲存</button>`);
}
async function saveBonus(){
  const no=v('bno'),rec=v('brec'),amt=n('bamt');
  const dir=v('bdir').startsWith('收入')?'收入':'支出';
  if(!amt){toast('請填寫金額','e');return;}
  if(dir==='支出' && !rec){toast('請填寫支付對象（誰收款）','e');return;}
  const{error}=await sb.from('bonus_records').insert({record_no:no,record_date:v('bdt'),direction:dir,recipient:rec||v('btrigger')||v('bpayer')||null,type:v('btype'),amount:amt,payment_method:v('bpay'),invoice_no:v('binv')||null,payment_date:v('bpdt')||null,note:v('bnote')||null,payer:v('bpayer')||null,trigger_who:v('btrigger')||null,payment_done:false,year_month:ym(v('bdt')),detail_items:_bnDetailItems.length?_bnDetailItems:null});
  if(error){toast('新增失敗：'+error.message,'e');return;}
  toast('記錄已新增');CM();bonus();
}
// 「發放」跟「收款」是同一個 payment_done 狀態的兩種說法：我們是支出方（分潤給人）時是「發放」，
// 我們是收入方（上游分潤給我們）時其實是「收款」，按鈕文字要照 direction 顯示對應的字，不能兩種情況都寫死「發放」
// （2026-09 使用者反映收入方向的記錄按鈕也寫「發放」，語意不對，已修正成依方向顯示）。
async function toggleBonus(id,done,direction){
  await sb.from('bonus_records').update({payment_done:!done,payment_date:!done?today():null}).eq('id',id);
  toast(!done?(direction==='收入'?'已標記收款':'已標記發放'):'已取消');
  bonus();
}
async function dBonus(id){
  if(!confirm('確定刪除此記錄？'))return;
  // 如果這筆是「同階代理下家分潤」自動建立的（有記錄 passthrough_order_no），刪除後要把來源訂單的
  // passthrough_bonus_created 重設回 false，讓它重新回到「獎金/分潤」的待處理清單——
  // 不然誤刪這筆分潤記錄後，這張訂單會永遠消失在待處理清單裡，變成明明還欠著分潤、卻沒有任何提醒
  const{data:rec}=await sb.from('bonus_records').select('passthrough_order_no').eq('id',id).single();
  await sb.from('bonus_records').delete().eq('id',id);
  if(rec?.passthrough_order_no){
    await sb.from('sales_orders').update({passthrough_bonus_created:false}).eq('order_no',rec.passthrough_order_no);
  }
  toast('已刪除');bonus();
}
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
  // 收入方向（上游分潤給我）才需要試算稅額（我方開票給上家報稅），支出方向不用。
  // 發票號碼欄位兩個方向都留著、不跟著隱藏：收入方向是我方開票給上家；支出方向如果下家本身是營業人，
  // 換成下家開票給我方——不管哪邊，這個欄位都是單純記錄那張發票的號碼。
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
      ${bonusPayerField(b.payer)}
      ${fi('btrigger','因誰而收（下家/同階業績）','text',b.trigger_who)}
    </div>
    <div class="fl"><label>金額（收入方向請填含稅實收總額）</label><input id="f-bamt" type="number" value="${b.amount||''}" autocomplete="off" oninput="bonusCalcTax()"></div>
    ${payMethodSel('bpay',b.payment_method||'')}
    <div class="fl fw" id="bonus-tax-calc" style="display:${isIncome?'block':'none'};font-size:12px;color:var(--tx3);background:var(--sf2);padding:8px 10px;border-radius:var(--r)"></div>
    ${fi('binv','發票號碼','text',b.invoice_no)} ${fi('bpdt','發放/收款日期','date',b.payment_date)}
    <div class="fl fw">${bnDetailSection()}</div>
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
  </div>
  ${Array.isArray(b.detail_items)&&b.detail_items.length?`<div class="sh">明細（佐證依據）</div>${bnDetailViewHtml(b.detail_items)}`:''}
  `,
  `<button class="btn" onclick="CM()">關閉</button>
   <button class="btn" onclick="CM();quickInvoiceBN('${no}')">補發票</button>
   <button class="btn" onclick="editBonus('${no}')">編輯</button>`
  );
}
// 補發票號碼（快速編輯）：只更新 bonus_records.invoice_no 這一個欄位，理由跟進貨單／銷售訂單／
// 服務訂單的 quickInvoice 系列一樣——不用為了補一個發票號碼打開整張記錄的編輯表單
// （2026-09 新增；bonus_records 本身沒有品項子表，不像訂單/進貨單有「整批刪除重建」的風險，
// 但一樣提供這個輕量入口方便使用者，不用每次都走「編輯」）。
async function quickInvoiceBN(no){
  const {data:b}=await sb.from('bonus_records').select('record_no,invoice_no').eq('record_no',no).single();
  OM(`補發票號碼：${no}`,
    fi('qinvbn','發票號碼','text',b?.invoice_no||''),
    `<button class="btn" onclick="CM()">取消</button><button class="btn btn-p" onclick="saveQuickInvoiceBN('${no}')">儲存</button>`
  );
}
async function saveQuickInvoiceBN(no){
  const inv=v('qinvbn')?.trim()||null;
  const {error}=await sb.from('bonus_records').update({invoice_no:inv}).eq('record_no',no);
  if(error){toast('儲存失敗：'+error.message,'e');return;}
  toast('發票號碼已更新！');CM();bonus();
}
window.quickInvoiceBN=quickInvoiceBN;
window.saveQuickInvoiceBN=saveQuickInvoiceBN;
async function editBonus(no){
  const{data:b}=await sb.from('bonus_records').select('*').eq('record_no',no).single();
  if(!b){toast('找不到記錄','e');return;}
  await loadBonusVendors();
  _bnDetailItems=Array.isArray(b.detail_items)?b.detail_items.slice():[];
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
    year_month:ym(v('bdt')),
    detail_items:_bnDetailItems.length?_bnDetailItems:null
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
// 儲值分成：客人儲值時分給技師的金額，當成技師在「儲值那個月」的薪資。
// 轉成跟 service_order_items 一樣的形狀，各財報/薪資彙整直接接在服務品項後面一起加總。
async function fetchCreditSplitPayItems(techName) {
  let q = sb.from('store_credit_records').select('customer_no,record_date,tech_split_name,tech_split_amount').not('tech_split_amount','is',null).gt('tech_split_amount',0);
  if(techName) q = q.eq('tech_split_name',techName);
  const { data } = await q;
  return (data||[]).map(r=>({
    order_no:null, item_name:'儲值分成', item_type:'service', is_credit_split:true, customer_no:r.customer_no,
    order_date:{order_date:r.record_date}, technician_id:null, technician_name:r.tech_split_name,
    technician_pay:parseFloat(r.tech_split_amount)||0, qty:0, unit_price:0, subtotal:0
  }));
}
window.fetchCreditSplitPayItems = fetchCreditSplitPayItems;

// 財報用的技師成本：每次服務「實際該抽多少」。
// 儲值時已分成的品項，technician_pay 記 0（現金早就給了），原本的抽成存在 settled_pay_amount——
// 財報要的是每次服務真正的成本，所以用原本的抽成；「技師月薪表／應付薪資」才用 technician_pay＋儲值分成（實際發錢）。
function svcReportPay(i) {
  return i.pay_settled_by_credit ? (parseFloat(i.settled_pay_amount)||0) : (parseFloat(i.technician_pay)||0);
}
window.svcReportPay = svcReportPay;

async function computeTotalFinanceData(includeSelfUse) {
  const [{ data:sOrders },{ data:pOrders },{ data:bnRecs },{ data:svOrders },{ data:svItems },{ data:opexRecs }] = await Promise.all([
    sb.from('sales_orders').select('order_date,year_month,total,payment_done,payment_date,order_type'),
    sb.from('purchase_orders').select('year_month,total'),
    sb.from('bonus_records').select('year_month,amount,direction'),
    sb.from('service_orders').select('order_date,total,consumable_cost'),
    sb.from('service_order_items').select('order_date:service_orders(order_date),technician_pay,pay_settled_by_credit,settled_pay_amount').eq('item_type','service'),
    sb.from('operating_expenses').select('*'),
  ]);

  // 月度彙整
  const mMap = {};
  const addM = (ym, key, val) => { if(!ym) return; if(!mMap[ym]) mMap[ym]={salesRev:0,purchCost:0,svcRev:0,svcCost:0,techPay:0,bonusIn:0,bonusOut:0,opCost:0,opPaid:0}; mMap[ym][key]+=val||0; };
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
  (svItems||[]).forEach(i => { const ym=(i.order_date?.order_date||'').slice(0,7); if(ym) addM(ym,'techPay',svcReportPay(i)); });
  // 營運成本（房租/水電/網路等固定成本）
  // opCost＝依費用所屬月份攤提後的成本（算進淨利，跟「營運成本」頁的分攤後成本一致）；
  // opPaid＝實際付款月份整筆算，只列出來參考，不算進淨利，避免重複扣
  (opexRecs||[]).forEach(r => {
    expandOpexToMonths(r).forEach(seg => addM(seg.ym,'opCost',seg.amount));
    const ym=(r.expense_date||'').slice(0,7); if(ym) addM(ym,'opPaid',r.amount);
  });

  // 年度彙整
  const yMap = {};
  Object.entries(mMap).forEach(([ym, d]) => {
    const yr = ym.slice(0,4);
    if(!yMap[yr]) yMap[yr]={salesRev:0,purchCost:0,svcRev:0,svcCost:0,techPay:0,bonusIn:0,bonusOut:0,opCost:0,opPaid:0};
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
        <div class="al al-w" style="font-size:12px;margin:0 16px 10px">月份分類規則跟「銷售財報」一致：銷售訂單已收款算在收款月份、未收款算在訂單月份；服務成本＝耗材成本＋技師薪資（不含撥轉成本，那只是搬庫存不是真花費）；有把獎金/分潤、營運成本（房租水電網路等）也算進來；營運成本是分攤後的每月成本，「營運實付」是那個月實際付出去的錢，只列出來參考、不算進淨利。取消勾選的項目會用刪除線標示，代表沒有被扣進總淨利。</div>
        <div class="tw"><table style="width:100%">
          <tr><th>年份</th><th>銷售收入</th><th>服務收入</th><th>獎金收入</th><th>進貨支出</th><th>耗材成本</th><th>技師薪資</th><th>獎金支出</th><th>營運成本</th><th>營運實付（參考）</th><th style="font-weight:700">總淨利</th></tr>
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
              <td class="num" style="color:var(--tx3);font-size:12px">${fM(d.opPaid)}</td>
              <td class="num" style="font-weight:700;color:${net>=0?'var(--ac)':'var(--rd)'}">${fM(net)}</td>
            </tr>`;
          }).join('')||'<tr><td colspan="11" style="text-align:center;padding:20px;color:var(--tx3)">尚無記錄</td></tr>'}
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
        <tr><th>月份</th><th>銷售收入</th><th>服務收入</th><th>獎金收入</th><th>進貨支出</th><th>耗材成本</th><th>技師薪資</th><th>獎金支出</th><th>營運成本</th><th>營運實付（參考）</th><th style="font-weight:700">總淨利</th></tr>
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
              <td class="num" style="color:var(--tx3);font-size:12px">${fM(d.opPaid)}</td>
            <td class="num" style="font-weight:700;color:${net>=0?'var(--ac)':'var(--rd)'}">${fM(net)}</td>
          </tr>`;
        }).join('')||'<tr><td colspan="11" style="text-align:center;color:var(--tx3)">尚無記錄</td></tr>'}
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
      .select('order_date:service_orders(order_date),technician_name,technician_pay,pay_settled_by_credit,settled_pay_amount')
      .eq('item_type','service').eq('technician_name',ownerTechName);
    (items||[]).forEach(i=>{
      const ym=(i.order_date?.order_date||'').slice(0,7);
      if(ym) ownerPayByMonth[ym]=(ownerPayByMonth[ym]||0)+svcReportPay(i);
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
  const [{ data:orders },{ data:transfers },{ data:items0 },splitItems] = await Promise.all([
    sb.from('service_orders').select('order_date,total,consumable_cost'),
    sb.from('service_transfers').select('transfer_date,total_cost'),
    sb.from('service_order_items').select('order_no,item_name,order_date:service_orders(order_date),technician_id,technician_name,technician_pay,pay_settled_by_credit,settled_pay_amount,item_type,qty,unit_price,subtotal').eq('item_type','service'),
    fetchCreditSplitPayItems(),
  ]);
  const items = [...(items0||[]), ...(splitItems||[])];

  // 月度彙整
  const mMap = {};
  const addM = (ym,key,val) => { if(!mMap[ym]) mMap[ym]={rev:0,cost:0,trCost:0,techPay:0}; mMap[ym][key]+=val||0; };
  (orders||[]).forEach(o=>{ const ym=(o.order_date||'').slice(0,7); if(ym){ addM(ym,'rev',o.total); addM(ym,'cost',o.consumable_cost); }});
  (transfers||[]).forEach(t=>{ const ym=(t.transfer_date||'').slice(0,7); if(ym) addM(ym,'trCost',t.total_cost); });
  // 財報：每次服務實際的技師成本（儲值時已分成的服務也照原本抽成算），儲值分成不重複算進財報
  (items0||[]).forEach(i=>{ const ym=(i.order_date?.order_date||'').slice(0,7); if(ym) addM(ym,'techPay',svcReportPay(i)); });

  // 技師月薪彙整（實際要發的錢：服務抽成＋儲值當下分成，儲值時已分的服務記 0）（用姓名合併，避免同一人因為技師資料重複ID分成好幾行）
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
        <tr><th>月份</th><th>技師</th><th>服務時數/次</th><th>應付薪資（實際發放）</th></tr>
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
  const orderNos = [...new Set(rows.map(r=>r.order_no).filter(Boolean))];
  const splitCustNos = [...new Set(rows.filter(r=>r.is_credit_split).map(r=>r.customer_no).filter(Boolean))];
  const [{ data:ords },{ data:splitCusts }] = await Promise.all([
    orderNos.length ? sb.from('service_orders').select('order_no,order_date,customer_name').in('order_no',orderNos) : Promise.resolve({data:[]}),
    splitCustNos.length ? sb.from('customers').select('customer_no,name').in('customer_no',splitCustNos) : Promise.resolve({data:[]}),
  ]);
  const ordMap = {}; (ords||[]).forEach(o=>ordMap[o.order_no]=o);
  const custNameMap = {}; (splitCusts||[]).forEach(c=>custNameMap[c.customer_no]=c.name);
  const rowDate = r => r.is_credit_split ? (r.order_date?.order_date||'') : (ordMap[r.order_no]?.order_date||'');
  const totalPay = rows.reduce((s,r)=>s+(r.technician_pay||0),0);
  // 照服務單當初登記的日期排序（不是資料庫查詢回來的隨機順序）
  rows.sort((a,b)=> rowDate(a).localeCompare(rowDate(b)) || (a.order_no||'').localeCompare(b.order_no||''));

  OM(`${ym} ${name} 薪資明細`, `
  <div style="font-size:16px;font-weight:700;margin-bottom:14px;color:var(--bl)">應付薪資合計：${fM(totalPay)}</div>
  <table class="itb"><tr><th>服務單</th><th>日期</th><th>客戶</th><th>項目</th><th>數量</th><th>抽成</th></tr>
    ${rows.map(r=>r.is_credit_split?`<tr style="background:var(--acl)">
      <td style="font-size:11px;color:var(--tx3)">儲值</td>
      <td style="font-size:11px">${fD(rowDate(r))}</td>
      <td style="font-size:12px">${custNameMap[r.customer_no]||r.customer_no||'—'}</td>
      <td style="font-size:12px">儲值分成</td>
      <td class="num">—</td>
      <td class="num" style="color:var(--bl)">${fM(r.technician_pay)}</td>
    </tr>`:`<tr>
      <td><a href="#" onclick="event.preventDefault();CM();setTimeout(()=>svcShowOrder('${r.order_no}'),80)" style="color:var(--ac);font-size:11px;font-family:monospace">${r.order_no}</a></td>
      <td style="font-size:11px">${fD(ordMap[r.order_no]?.order_date)}</td>
      <td style="font-size:12px">${ordMap[r.order_no]?.customer_name||'—'}</td>
      <td style="font-size:12px">${r.item_name||'—'}</td>
      <td class="num">${r.qty}</td>
      <td class="num" style="color:var(--bl)">${fM(r.technician_pay)}${r.pay_settled_by_credit?`<div style="font-size:10px;color:var(--tx3)">已於儲值時分（原 ${fM(r.settled_pay_amount||0)}）</div>`:''}</td>
    </tr>`).join('')}
  </table>`,
  `<button class="btn" onclick="CM()">關閉</button>`);
}
window.techMonthDetail = techMonthDetail;