// ═══════════════════════════════════════
// finance.js
// ═══════════════════════════════════════

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
    ${fi('bno','記錄號','text',no)} ${fi('bdt','日期','date',td)}
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
    ${fi('bamt','金額','number')} ${payMethodSel('bpay','')}
    ${fi('binv','發票號碼','text')} ${fi('bpdt','發放/收款日期','date')}
    <div class="fl fw">${fa('bnote','備註')}</div>
  </div>`,
  `<button class="btn" onclick="CM()">取消</button><button class="btn btn-p" onclick="saveBonus()">儲存</button>`);
}
async function saveBonus(){
  const no=v('bno'),rec=v('brec'),amt=n('bamt');
  if(!rec||!amt){toast('請填寫對象和金額','e');return;}
  const dir=v('bdir').startsWith('收入')?'收入':'支出';
  const{error}=await sb.from('bonus_records').insert({record_no:no,record_date:v('bdt'),direction:dir,recipient:rec,type:v('btype'),amount:amt,payment_method:v('bpay'),invoice_no:v('binv')||null,payment_date:v('bpdt')||null,note:v('bnote')||null,payer:v('bpayer')||null,trigger_who:v('btrigger')||null,payment_done:false,year_month:ym(v('bdt'))});
  if(error){toast('新增失敗：'+error.message,'e');return;}
  toast('記錄已新增');CM();bonus();
}
async function toggleBonus(id,done){await sb.from('bonus_records').update({payment_done:!done,payment_date:!done?today():null}).eq('id',id);toast(!done?'已標記發放':'已取消');bonus();}
async function dBonus(id){if(!confirm('確定刪除此記錄？'))return;await sb.from('bonus_records').delete().eq('id',id);toast('已刪除');bonus();}
async function accounts(){
  const[{data:yr},{data:orders_m},{data:po_m},{data:bn_m}]=await Promise.all([
    sb.from('yearly_accounts').select('*').order('year',{ascending:false}),
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
    const orderK = normYM(o.year_month);  // 訂單月份（列表用）
    // 收入以 payment_date 為準；若無則用 order_date
    const payK = o.payment_done
      ? normYM((o.payment_date||o.order_date||'').slice(0,7))
      : null;
    // 確保訂單月份的容器存在（供訂單列表使用）
    byMonth[orderK]=byMonth[orderK]||{in:0,po:0,bn_out:0,bn_in:0,orders:[],pos:[],bns:[]};
    byMonth[orderK].orders.push(o);
    // 收入計入收款月份
    if(payK){
      byMonth[payK]=byMonth[payK]||{in:0,po:0,bn_out:0,bn_in:0,orders:[],pos:[],bns:[]};
      byMonth[payK].in+=Number(o.total||0);
    }
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
  <div class="ph"><div><div class="pt">對帳記錄</div><div class="ps">依訂單自動彙整</div></div></div>
  <div class="tab-bar" style="padding:0 16px 10px;overflow-x:auto">
    <div class="tab${accTab==='sales'?' on':''}" onclick="window._accTab='sales';accounts()">銷售財報</div>
    <div class="tab${accTab==='service'?' on':''}" onclick="window._accTab='service';accounts()">服務財報</div>
    <div class="tab${accTab==='total'?' on':''}" onclick="window._accTab='total';accounts()">總財報</div>
  </div>`;
  if(accTab==='service'){ await showSvcFinance(); return; }
  if(accTab==='total'){ await showTotalFinance(); return; }
  $('main').innerHTML += `
    <div class="pc">
    ${(yr&&yr.length)?`<div class="tc" style="margin-bottom:14px"><div class="tb"><span class="tt">年度對帳</span></div>
    <div class="tw"><table style="width:100%"><tr><th>年份</th><th>收入</th><th>支出</th><th>結餘</th></tr>
    ${(yr||[]).map(y=>`<tr><td style="font-weight:600">${y.year}</td><td class="num ok">${fM(y.income)}</td><td class="num cr">${fM(y.expense)}</td><td class="num" style="font-weight:700;color:${y.total>=0?'var(--ac)':'var(--rd)'}">${fM(y.total)}</td></tr>`).join('')}
    </table></div></div>`:''}
    <div class="tc"><div class="tb"><span class="tt">月度彙整（依訂單計算，點月份看細節）</span></div>
    <div class="tw"><table style="width:100%">
      <tr><th>月份</th><th>銷售收入<br><small>已收款</small></th><th>獎金收入</th><th>進貨支出</th><th>獎金支出</th><th style="font-weight:700">淨利</th></tr>
      ${monthKeys.map(k=>{
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
    ${d.orders.map(o=>`<tr><td><a href="#" onclick="event.preventDefault();CM();setTimeout(()=>showOrder('${o.order_no}'),80)" style="color:var(--ac);font-size:11px;font-family:monospace">${o.order_no}</a></td>
      <td style="font-size:11px">${fD(o.order_date)}</td><td style="font-size:12px">${o.customer_name||'—'}</td>
      <td class="num">${fM(o.total)}</td>
      <td><span class="badge ${o.payment_done?'bg':'br2'}">${o.payment_done?'已收':'未收'}</span></td></tr>`).join('')}
  </table></div>`:''}
  ${d.pos?.length?`<div class="sh" style="margin-top:10px">進貨單（${d.pos.length}筆）</div>
  <div style="overflow-x:auto"><table class="itb" style="min-width:280px">
    <tr><th>進貨單號</th><th>日期</th><th>廠商</th><th>金額</th></tr>
    ${d.pos.map(p=>`<tr><td><a href="#" onclick="event.preventDefault();CM();setTimeout(()=>showPO('${p.po_no}'),80)" style="color:var(--br);font-size:11px;font-family:monospace">${p.po_no}</a></td>
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
}
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
    ${fi('bamt','金額','number',b.amount)} ${payMethodSel('bpay',b.payment_method||'')}
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
}
async function updateBonus(no){
  const rec=v('brec'), amt=n('bamt');
  if(!rec||!amt){toast('請填寫對象和金額','e');return;}
  const dir=v('bdir').startsWith('收入')?'收入':'支出';
  const{error}=await sb.from('bonus_records').update({
    record_date:v('bdt'), direction:dir, recipient:rec,
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
async function showTotalFinance() {
  const [{ data:sOrders },{ data:pOrders },{ data:svOrders },{ data:svTransfers }] = await Promise.all([
    sb.from('sales_orders').select('order_date,total_amount,payment_status').eq('payment_status','已收'),
    sb.from('purchase_orders').select('po_date,total').eq('done','完成'),
    sb.from('service_orders').select('order_date,total,consumable_cost'),
    sb.from('service_transfers').select('transfer_date,total_cost'),
  ]);

  // 月度彙整
  const mMap = {};
  const addM = (ym, key, val) => { if(!mMap[ym]) mMap[ym]={salesRev:0,purchCost:0,svcRev:0,svcCost:0,trCost:0}; mMap[ym][key]+=val||0; };
  (sOrders||[]).forEach(o => {
    if(!o.payment_done) return; // 未收款不計
    const ym=(o.payment_date||o.order_date||'').slice(0,7);
    if(ym) addM(ym,'salesRev',o.total_amount);
  });
  (pOrders||[]).forEach(o => { const ym=(o.po_date||'').slice(0,7); if(ym) addM(ym,'purchCost',o.total); });
  (svOrders||[]).forEach(o => { const ym=(o.order_date||'').slice(0,7); if(ym){ addM(ym,'svcRev',o.total); addM(ym,'svcCost',o.consumable_cost); }});
  (svTransfers||[]).forEach(t => { const ym=(t.transfer_date||'').slice(0,7); if(ym) addM(ym,'trCost',t.total_cost); });

  // 年度彙整
  const yMap = {};
  Object.entries(mMap).forEach(([ym, d]) => {
    const yr = ym.slice(0,4);
    if(!yMap[yr]) yMap[yr]={salesRev:0,purchCost:0,svcRev:0,svcCost:0,trCost:0};
    Object.keys(d).forEach(k => yMap[yr][k]+=d[k]);
  });

  const months = Object.keys(mMap).sort().reverse().slice(0,24);
  const years = Object.keys(yMap).sort().reverse();

  const netRow = d => d.salesRev + d.svcRev - d.purchCost - d.svcCost - d.trCost;

  $('main').innerHTML += `
  <div class="pc">
    <div class="tc" style="margin-bottom:16px">
      <div class="tb"><span class="tt">年度總財報</span></div>
      <div class="tw"><table style="width:100%">
        <tr><th>年份</th><th>銷售收入</th><th>服務收入</th><th>進貨支出</th><th>服務成本</th><th>總淨利</th></tr>
        ${years.map(yr=>{
          const d=yMap[yr]; const net=netRow(d);
          return `<tr>
            <td style="font-weight:700">${yr}</td>
            <td class="num" style="color:var(--ac)">${fM(d.salesRev)}</td>
            <td class="num" style="color:var(--ac)">${fM(d.svcRev)}</td>
            <td class="num" style="color:var(--rd)">${fM(d.purchCost)}</td>
            <td class="num" style="color:var(--rd)">${fM(d.svcCost+d.trCost)}</td>
            <td class="num" style="font-weight:700;color:${net>=0?'var(--ac)':'var(--rd)'}">${fM(net)}</td>
          </tr>`;
        }).join('')||'<tr><td colspan="6" style="text-align:center;color:var(--tx3)">尚無記錄</td></tr>'}
      </table></div>
    </div>
    <div class="tc">
      <div class="tb"><span class="tt">月度總財報</span></div>
      <div class="tw"><table style="width:100%">
        <tr><th>月份</th><th>銷售收入</th><th>服務收入</th><th>進貨支出</th><th>服務成本</th><th>總淨利</th></tr>
        ${months.map(ym=>{
          const d=mMap[ym]; const net=netRow(d);
          return `<tr>
            <td style="color:var(--ac);font-weight:600">${ym}</td>
            <td class="num">${fM(d.salesRev)}</td>
            <td class="num">${fM(d.svcRev)}</td>
            <td class="num" style="color:var(--rd)">${fM(d.purchCost)}</td>
            <td class="num" style="color:var(--rd)">${fM(d.svcCost+d.trCost)}</td>
            <td class="num" style="font-weight:700;color:${net>=0?'var(--ac)':'var(--rd)'}">${fM(net)}</td>
          </tr>`;
        }).join('')||'<tr><td colspan="6" style="text-align:center;color:var(--tx3)">尚無記錄</td></tr>'}
      </table></div>
    </div>
  </div>`;
}

window.showTotalFinance = showTotalFinance;

// ════════════════════════════════════
//  服務財報（含技師薪資）
// ════════════════════════════════════
async function showSvcFinance() {
  const [{ data:orders },{ data:transfers },{ data:items }] = await Promise.all([
    sb.from('service_orders').select('order_date,total,consumable_cost'),
    sb.from('service_transfers').select('transfer_date,total_cost'),
    sb.from('service_order_items').select('order_date:service_orders(order_date),technician_id,technician_name,technician_pay,item_type,qty,unit_price,subtotal').eq('item_type','service'),
  ]);

  // 月度彙整
  const mMap = {};
  const addM = (ym,key,val) => { if(!mMap[ym]) mMap[ym]={rev:0,cost:0,trCost:0,techPay:0}; mMap[ym][key]+=val||0; };
  (orders||[]).forEach(o=>{ const ym=(o.order_date||'').slice(0,7); if(ym){ addM(ym,'rev',o.total); addM(ym,'cost',o.consumable_cost); }});
  (transfers||[]).forEach(t=>{ const ym=(t.transfer_date||'').slice(0,7); if(ym) addM(ym,'trCost',t.total_cost); });
  (items||[]).forEach(i=>{ const ym=(i.order_date?.order_date||'').slice(0,7); if(ym) addM(ym,'techPay',i.technician_pay); });

  // 技師月薪彙整
  const techMap = {};
  (items||[]).forEach(i=>{
    if(!i.technician_id) return;
    const ym=(i.order_date?.order_date||'').slice(0,7);
    if(!ym) return;
    const key=`${i.technician_id}_${ym}`;
    if(!techMap[key]) techMap[key]={name:i.technician_name,ym,pay:0,sessions:0};
    techMap[key].pay+=i.technician_pay||0;
    techMap[key].sessions+=i.qty||0;
  });

  const months = Object.keys(mMap).sort().reverse().slice(0,24);

  $('main').innerHTML += `
  <div class="pc">
    <div class="tc" style="margin-bottom:16px">
      <div class="tb"><span class="tt">月度服務財報</span></div>
      <div class="tw"><table style="width:100%">
        <tr><th>月份</th><th>服務收入</th><th>耗材成本</th><th>撥轉成本</th><th>技師薪資</th><th>服務淨利</th></tr>
        ${months.map(ym=>{
          const d=mMap[ym];
          const net=d.rev-d.cost-d.trCost-d.techPay;
          return `<tr>
            <td style="color:var(--ac);font-weight:600;cursor:pointer" onclick="svcMonthDetail('${ym}')">${ym}</td>
            <td class="num" style="color:var(--ac)">${fM(d.rev)}</td>
            <td class="num" style="color:var(--rd)">${fM(d.cost)}</td>
            <td class="num" style="color:var(--am)">${fM(d.trCost)}</td>
            <td class="num" style="color:var(--bl)">${fM(d.techPay)}</td>
            <td class="num" style="font-weight:700;color:${net>=0?'var(--ac)':'var(--rd)'}">${fM(net)}</td>
          </tr>`;
        }).join('')||'<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--tx3)">尚無記錄</td></tr>'}
      </table></div>
    </div>
    <div class="tc">
      <div class="tb"><span class="tt">技師月薪表</span></div>
      <div class="tw"><table style="width:100%">
        <tr><th>月份</th><th>技師</th><th>服務時數/次</th><th>應付薪資</th></tr>
        ${Object.values(techMap).sort((a,b)=>b.ym.localeCompare(a.ym)||a.name.localeCompare(b.name)).map(t=>`<tr>
          <td>${t.ym}</td>
          <td style="font-weight:500">${t.name}</td>
          <td style="text-align:center">${t.sessions}</td>
          <td class="num" style="font-weight:700;color:var(--bl)">${fM(t.pay)}</td>
        </tr>`).join('')||'<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--tx3)">尚無記錄</td></tr>'}
      </table></div>
    </div>
  </div>`;
}

window.showSvcFinance = showSvcFinance;