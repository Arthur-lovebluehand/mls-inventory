// ═══════════════════════════════════════
// customers.js
// ═══════════════════════════════════════

async function customers(){
  try{
    // 位階 Tab：抓資料庫裡實際出現過的位階（含 LEVELS 沒列到的舊值，例如「總盤」），照 LEVELS 順序排、沒列到的排最後
    let allLvs = ['全部'];
    try {
      const { data: lvList } = await sb.from('customers').select('agent_level');
      const rawLvs = [...new Set((lvList||[]).map(x=>x.agent_level).filter(Boolean))];
      rawLvs.sort((a,b)=>{
        const ia=LEVELS.indexOf(a), ib=LEVELS.indexOf(b);
        if(ia===-1&&ib===-1) return a.localeCompare(b);
        if(ia===-1) return 1;
        if(ib===-1) return -1;
        return ia-ib;
      });
      allLvs = ['全部', ...rawLvs];
    } catch(e2){}
    let q=sb.from('customers').select('customer_no,name,agent_level,phone,email,ship_full_address,passthrough_beneficiary_no',{count:'exact'}).order('customer_no');
    if(cS) q=q.or(`name.ilike.%${cS}%,phone.ilike.%${cS}%,customer_no.ilike.%${cS}%`);
    if(cLv==='__pt__') q=q.not('passthrough_beneficiary_no','is',null);
    else if(cLv) q=q.eq('agent_level',cLv);
    const{data,count}=await q.range((cP-1)*30,cP*30-1);
    const tp=Math.ceil((count||0)/30);
    // 即時查這一頁客戶的儲值帳戶餘額（不用舊的customers.store_credit欄位，那個沒有跟真正的儲值系統連動）
    const custNos = (data||[]).map(c=>c.customer_no);
    let creditMap = {};
    if(custNos.length) {
      const { data:credits } = await sb.from('store_credits').select('customer_no,wallet_type,balance').in('customer_no',custNos);
      (credits||[]).forEach(cr=>{ (creditMap[cr.customer_no]=creditMap[cr.customer_no]||[]).push(cr); });
    }
    // 這一頁客戶如果有設定「分潤受益人」，順便查名字，列表直接顯示，方便找「誰是誰的同階代理」
    let benNameMap = {};
    const benNosOnPage = [...new Set((data||[]).map(c=>c.passthrough_beneficiary_no).filter(Boolean))];
    if(benNosOnPage.length) {
      const { data:bens } = await sb.from('customers').select('customer_no,name').in('customer_no',benNosOnPage);
      (bens||[]).forEach(b=>benNameMap[b.customer_no]=b.name);
    }
    const creditCell = cno => {
      const wallets = creditMap[cno];
      if(!wallets||!wallets.length) return '—';
      if(wallets.length===1) return fM(wallets[0].balance);
      return wallets.map(w=>`${w.wallet_type[0]}:${fM(w.balance)}`).join(' ');
    };
    $('main').innerHTML=`
    <div class="ph"><div><div class="pt">客戶資料</div><div class="ps">${count||0} 位</div></div>
      <div class="ha"><button class="btn btn-p btn-s" onclick="addCust()">＋ 新增客戶</button></div></div>
    <div class="pc">
    <div class="tab-bar" style="margin-bottom:10px;overflow-x:auto">
      ${allLvs.map(s=>{const on=s===(cLv||'全部');const click=s==='全部'?"cLv='';cP=1;customers()":"cLv='"+s+"';cP=1;customers()";return '<div class="tab'+(on?' on':'')+'" onclick="'+click+'" style="white-space:nowrap">'+s+'</div>';}).join('')}
      <div class="tab${cLv==='__pt__'?' on':''}" onclick="cLv='__pt__';cP=1;customers()" style="white-space:nowrap">📋 同階代理</div>
    </div>
    <div class="tc">
      <div class="tb"><span class="tt">客戶列表</span>
        <div class="si"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input placeholder="姓名/電話/編號…（輸入後按 Enter 搜尋）" value="${cS}" onkeydown="if(event.key==='Enter'){cS=this.value;cP=1;customers();}"></div>
      </div>
      <div class="tw"><table style="width:100%">
        <tr><th>編號</th><th>姓名</th><th>位階</th><th>同階受益人</th><th>手機</th><th>Email</th><th>送貨地址</th><th>儲值餘額</th><th>操作</th></tr>
        ${(data||[]).map(c=>`<tr>
          <td style="font-size:11px;font-family:monospace;color:var(--tx2)">${c.customer_no}</td>
          <td style="font-weight:500">${c.name}</td>
          <td>${lvBadge(c.agent_level)}</td>
          <td style="font-size:12px;color:#8d6e00">${c.passthrough_beneficiary_no?(benNameMap[c.passthrough_beneficiary_no]||c.passthrough_beneficiary_no):'—'}</td>
          <td>${c.phone||'—'}</td>
          <td style="font-size:12px">${c.email||'—'}</td>
          <td style="font-size:12px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.ship_full_address||'—'}</td>
          <td class="num" style="font-size:12px">${creditCell(c.customer_no)}</td>
          <td><div style="display:flex;gap:3px">
            <button class="btn btn-s" onclick="showCust('${c.customer_no}')">查看</button>
            <button class="btn btn-s" onclick="eCust('${c.customer_no}')">編輯</button>
            <button class="btn btn-s btn-r" onclick="delCust('${c.customer_no}','${c.name.replace(/'/g,"\\'")}')" >刪</button>
          </div></td>
        </tr>`).join('')}
      </table></div>
      <div class="pg"><span class="pi">第${cP}/${tp}頁</span>
        <div style="display:flex;gap:5px">
          ${cP>1?`<button class="btn btn-s" onclick="cP--;customers()">上一頁</button>`:''}
          ${cP<tp?`<button class="btn btn-s" onclick="cP++;customers()">下一頁</button>`:''}${pageJump('cP',tp,'customers')}
        </div></div>
    </div></div>`;
  }catch(e){$('main').innerHTML=`<div class="ld" style="color:var(--rd)">載入失敗：${e.message}</div>`;}
}
async function showCust(no){
  const[{data:c},{data:os},{data:credits}]=await Promise.all([
    sb.from('customers').select('*').eq('customer_no',no).single(),
    sb.from('sales_orders').select('order_no,order_date,total,payment_done').eq('customer_no',no).order('order_date',{ascending:false}).limit(30),
    sb.from('store_credits').select('wallet_type,balance').eq('customer_no',no),
  ]);
  const creditDisplay = (credits&&credits.length)
    ? credits.map(cr=>`<div>${cr.wallet_type}：<b style="color:${cr.balance>0?'var(--ac)':cr.balance<0?'var(--rd)':'var(--tx3)'}">${fM(cr.balance)}</b></div>`).join('')
    : '<div style="color:var(--tx3)">尚未開過儲值帳戶</div>';
  let benName=null;
  if(c?.passthrough_beneficiary_no){
    const{data:ben}=await sb.from('customers').select('name').eq('customer_no',c.passthrough_beneficiary_no).single();
    benName=ben?.name||c.passthrough_beneficiary_no;
  }
  OM(`客戶：${c?.name}`,`
  <div class="dg" style="margin-bottom:13px">
    <div class="dr"><span class="dlb">客戶編號</span><span class="dv">${c?.customer_no}</span></div>
    <div class="dr"><span class="dlb">位階</span><span class="dv">${lvBadge(c?.agent_level)}</span></div>
    <div class="dr"><span class="dlb">手機</span><span class="dv">${c?.phone||'—'}</span></div>
    <div class="dr"><span class="dlb">Email</span><span class="dv">${c?.email||'—'}</span></div>
    <div class="dr"><span class="dlb">生日</span><span class="dv">${c?.birthday||'—'}</span></div>
    <div class="dr"><span class="dlb">13月亮印記</span><span class="dv">${c?.lunar_mark||'—'}</span></div>
    <div class="dr"><span class="dlb">愛閃耀會員編號</span><span class="dv" style="font-family:monospace">${c?.member_no||'—'}</span></div>
    <div class="dr"><span class="dlb">儲值餘額</span><span class="dv ok" style="font-weight:600">${creditDisplay}</span></div>
    <div class="dr"><span class="dlb">付款方式</span><span class="dv">${c?.payment_method||'—'}</span></div>
    ${benName?`<div class="dr" style="grid-column:1/-1"><span class="dlb">📋 分潤受益人</span><span class="dv" style="color:#8d6e00">同階代理，訂單出貨完成後分潤轉給：<b>${benName}</b>（${c.passthrough_beneficiary_no}）</span></div>`:''}
    <div class="dr" style="grid-column:1/-1"><span class="dlb">送貨地址</span><span class="dv">${c?.ship_full_address||c?.ship_address||'—'}</span></div>
    <div class="dr" style="grid-column:1/-1"><span class="dlb">備註</span><span class="dv">${c?.note||'—'}</span></div>
  </div>
  <div class="sh">購買紀錄（點訂單號查看明細）</div>
  <table class="itb"><tr><th>訂單號</th><th>日期</th><th>金額</th><th>收款</th></tr>
  ${(os||[]).map(o=>`<tr>
    <td><a href="#" onclick="event.preventDefault();CM();setTimeout(()=>showOrder('${o.order_no}'),100)" style="color:var(--ac);font-family:monospace;font-size:12px">${o.order_no}</a></td>
    <td style="font-size:12px">${fD(o.order_date)}</td>
    <td class="num" style="font-weight:600">${fM(o.total)}</td>
    <td><span class="badge ${o.payment_done?'bg':'br2'}">${o.payment_done?'已收':'未收'}</span></td>
  </tr>`).join('')||'<tr><td colspan="4" style="text-align:center;color:var(--tx3)">暫無購買紀錄</td></tr>'}
  </table>`,
  `<button class="btn" onclick="CM()">關閉</button><button class="btn" onclick="eCust('${no}')">編輯資料</button>`,true);
}
async function delCust(no, name){
  if(!confirm(`確定刪除客戶「${name}」？

注意：過往訂單記錄不會被刪除，但訂單內的客戶資訊仍會保留。`)) return;
  const{error}=await sb.from('customers').delete().eq('customer_no',no);
  if(error){toast('刪除失敗：'+error.message,'e');return;}
  await logAction('delete','customers',no,'刪除客戶 '+name+' ('+no+')');
  toast('客戶已刪除');customers();
}
function custForm(c,benList){
  c=c||{};
  benList=benList||[];
  return `<div class="fg">
    ${fi('cno','客戶編號','text',c.customer_no)} ${fi('cname','姓名 *','text',c.name)}
    ${fs('clv','位階',LEVELS,c.agent_level||'零售')}
    ${fi('cmno','愛閃耀會員編號','text',c.member_no)}
    ${fi('cph','手機','text',c.phone)} ${fi('ceml','Email','text',c.email)}
    ${fi('cbday','生日','text',c.birthday)} ${fi('clmk','13月亮印記','text',c.lunar_mark)}
    ${payMethodSel('cpay',c.payment_method||'')}
    ${shipMethodSel('cshp',c.shipping_method||'')}
    <div class="fl"><label>儲值錢包模式</label><select id="f-cwallet">
      <option value="shared" ${(c.wallet_mode||'shared')==='shared'?'selected':''}>共用一個（服務+產品同一筆餘額）</option>
      <option value="separate" ${c.wallet_mode==='separate'?'selected':''}>服務、產品分開算</option>
    </select></div>
    <div class="fl fw">${fi('caddr','送貨地址','text',c.ship_full_address||c.ship_address)}</div>
    <div class="fl fw" style="background:var(--acl);border-radius:var(--r);padding:8px 10px">
      <label>分潤受益人（選填——此客戶與上家同階、改由我方出貨時，分潤要轉給的對象；輸入姓名或編號搜尋，零售客戶不會列入）</label>
      <div class="ss-wrap" id="ss-cben">
        <input class="ss-input" id="ss-inp-cben" placeholder="輸入姓名/編號搜尋…" autocomplete="off" oninput="ssFilterBen(this.value)" onfocus="ssFilterBen(this.value)" onblur="setTimeout(()=>$('ss-drop-cben')?.classList.remove('open'),200)">
        <input type="hidden" id="f-cben" value="${c.passthrough_beneficiary_no||''}">
        <div class="ss-drop" id="ss-drop-cben"></div>
      </div>
      <div style="margin-top:5px"><button type="button" class="btn btn-s" onclick="clearBen()">✕ 清除設定</button></div>
    </div>
    <div class="fl fw">${fa('cnote','備註',c.note)}</div>
  </div>`;
}
async function addCust(){
  // 自動產生下一個客戶編號
  // 只抓 C-00001 ~ C-09999 格式，排除特殊號碼
  const{data:last}=await sb.from('customers').select('customer_no').like('customer_no','C-0____').order('customer_no',{ascending:false}).limit(5);
  let nextNo='C-00001';
  if(last&&last.length){
    const nums=last.map(r=>{const m=r.customer_no?.match(/^C-0(\d{4})$/);return m?parseInt('0'+m[1]):0;}).filter(n=>n>0&&n<10000);
    if(nums.length){const mx=Math.max(...nums);nextNo='C-'+String(mx+1).padStart(5,'0');}
  }
  // 分潤受益人候選名單排除「零售」——零售是位階最底層，本來就不會有自己的下家跟她同階，不可能是誰的分潤受益人
  const{data:benList}=await sb.from('customers').select('customer_no,name,agent_level').neq('agent_level','零售').order('customer_no');
  OM('新增客戶',custForm({customer_no:nextNo},benList),`<button class="btn" onclick="CM()">取消</button><button class="btn btn-p" onclick="saveCust(false)">新增</button>`);
  initBenPicker(benList,null);
}
async function eCust(no){
  const[{data:c},{data:benList}]=await Promise.all([
    sb.from('customers').select('*').eq('customer_no',no).single(),
    sb.from('customers').select('customer_no,name,agent_level').neq('customer_no',no).neq('agent_level','零售').order('customer_no'),
  ]);
  OM('編輯客戶',custForm(c,benList),`<button class="btn" onclick="CM()">取消</button><button class="btn btn-p" onclick="saveCust('${no}')">儲存</button>`);
  initBenPicker(benList,c.passthrough_beneficiary_no);
}
// 分潤受益人的搜尋選人小工具（比照 orders.js 選客戶的搜尋下拉模式），benList 已經排除零售、可能還是上百人，
// 純 <select> 很難找，改成輸入姓名/編號即時篩選
function initBenPicker(benList,curBenNo){
  window._benListForPicker=benList||[];
  window.ssFilterBen=q=>{
    const list=window._benListForPicker||[];
    const fil=q?list.filter(b=>b.name.includes(q)||(b.customer_no||'').includes(q)):list;
    const drop=$('ss-drop-cben'); if(!drop)return;
    drop.classList.add('open');
    drop.innerHTML=fil.map(b=>`<div class="ss-opt" onmousedown="pickBen('${b.customer_no}')">${b.customer_no} ${b.name}${b.agent_level?`（${b.agent_level}）`:''}</div>`).join('')||`<div class="ss-opt no">無符合的客戶</div>`;
  };
  window.pickBen=cno=>{
    const b=(window._benListForPicker||[]).find(x=>x.customer_no===cno);
    if(!b)return;
    $('ss-inp-cben').value=`${b.customer_no} ${b.name}${b.agent_level?`（${b.agent_level}）`:''}`;
    $('f-cben').value=cno;
    $('ss-drop-cben')?.classList.remove('open');
  };
  window.clearBen=()=>{
    $('ss-inp-cben').value='';
    $('f-cben').value='';
    $('ss-drop-cben')?.classList.remove('open');
  };
  const inp=$('ss-inp-cben');
  if(inp) inp.value = curBenNo ? (()=>{const b=(benList||[]).find(x=>x.customer_no===curBenNo);return b?`${b.customer_no} ${b.name}${b.agent_level?`（${b.agent_level}）`:''}`:curBenNo;})() : '';
}
async function saveCust(existingNo){
  const nm=v('cname');if(!nm){toast('請填寫姓名','e');return;}
  const newBenNo=v('cben')||null;
  const newLevel=v('clv');
  const obj={name:nm,agent_level:newLevel,member_no:v('cmno')||null,phone:v('cph'),email:v('ceml'),birthday:v('cbday')||null,lunar_mark:v('clmk')||null,payment_method:v('cpay'),shipping_method:v('cshp')||null,wallet_mode:v('cwallet')||'shared',ship_address:v('caddr'),ship_full_address:v('caddr'),note:v('cnote')||null,passthrough_beneficiary_no:newBenNo};
  if(existingNo){
    // 第一次把「分潤受益人」從無設定成有：這位客戶過去的舊訂單不該一次全部跳出來要建分潤（不知道同階狀態是何時開始的），
    // 所以先把她目前所有「已收款」的舊訂單標記成「已處理」（略過），之後只有新確認收款的訂單才會出現在待處理清單
    // （分潤觸發點 2026-09 已改成「確認收款」而不是「全部出貨」，這裡的判斷條件要跟 finance.js 的 passthroughPendingRows() 一致）
    const{data:old}=await sb.from('customers').select('passthrough_beneficiary_no,agent_level').eq('customer_no',existingNo).single();
    const isNewlyEnabled = !old?.passthrough_beneficiary_no && newBenNo;
    // 反過來：把「分潤受益人」從有清成無（例如原本同階的上家升階了，出貨權轉回她個人，不再需要代轉分潤）——
    // 這位客戶底下如果還有「已收款但還沒建立分潤記錄」的舊訂單（同階期間下的單，理論上仍然欠受益人這筆分潤），
    // 清空設定後這些訂單就不會再出現在待處理清單裡了，先跳出提醒，讓使用者可以選擇先去處理完再清空
    const isCleared = old?.passthrough_beneficiary_no && !newBenNo;
    if(isCleared){
      const{data:pend}=await sb.from('sales_orders').select('order_no').eq('customer_no',existingNo).eq('payment_done',true).eq('passthrough_bonus_created',false);
      if(pend&&pend.length){
        const ok=confirm(`這位客戶還有 ${pend.length} 筆已收款、但還沒建立分潤記錄的訂單。\n\n取消「分潤受益人」設定後，這些訂單就不會再出現在「獎金/分潤」的待處理清單裡了。\n\n如果這幾筆是同階代理期間下的單、仍然要分潤給原本的受益人，建議先按「取消」，去「獎金/分潤」頁面把這幾筆處理完，再回來清空設定。\n\n確定要直接清空嗎？`);
        if(!ok) return;
      }
    }
    // 位階異動時自動連動：這個人如果是別人的「分潤受益人」，一旦她自己的位階變了、跟底下那些客戶的位階不再一樣（例如她升階了），
    // 這些下家就不再符合「同階代理」資格，系統自動把她們的分潤受益人設定清空，不用使用者自己一個一個記得去改
    const levelChanged = old && old.agent_level!==newLevel;
    let affectedToClear=[];
    if(levelChanged){
      const{data:downstream}=await sb.from('customers').select('customer_no,name,agent_level').eq('passthrough_beneficiary_no',existingNo);
      affectedToClear=(downstream||[]).filter(d=>d.agent_level!==newLevel);
      if(affectedToClear.length){
        const{data:pendOrders}=await sb.from('sales_orders').select('order_no,customer_no').eq('payment_done',true).eq('passthrough_bonus_created',false).in('customer_no',affectedToClear.map(d=>d.customer_no));
        const namesWithPending=[...new Set((pendOrders||[]).map(o=>affectedToClear.find(d=>d.customer_no===o.customer_no)?.name))].filter(Boolean);
        const msg = namesWithPending.length
          ? `這位客戶的位階異動後，原本設定她為分潤受益人的下家（${affectedToClear.map(d=>d.name).join('、')}）將不再符合同階資格，系統會自動清空她們的「分潤受益人」設定。\n\n其中 ${namesWithPending.join('、')} 還有 ${pendOrders.length} 筆已收款、尚未建立分潤記錄的訂單，建議先去「獎金/分潤」頁面處理完再回來調整位階。\n\n確定要現在儲存、並自動清空這些下家的同階設定嗎？`
          : `這位客戶的位階異動後，原本設定她為分潤受益人的下家（${affectedToClear.map(d=>d.name).join('、')}）將不再符合同階資格，系統會自動清空她們的「分潤受益人」設定。確定要儲存嗎？`;
        if(!confirm(msg)) return;
      }
    }
    const{error}=await sb.from('customers').update(obj).eq('customer_no',existingNo);
    if(error){toast('儲存失敗：'+error.message,'e');return;}
    if(isNewlyEnabled){
      await sb.from('sales_orders').update({passthrough_bonus_created:true}).eq('customer_no',existingNo).eq('payment_done',true).eq('passthrough_bonus_created',false);
    }
    if(affectedToClear.length){
      await sb.from('customers').update({passthrough_beneficiary_no:null}).in('customer_no',affectedToClear.map(d=>d.customer_no));
    }
  } else {
    const no=v('cno');obj.customer_no=no||null;
    const{error}=await sb.from('customers').insert(obj);
    if(error){toast('新增失敗：'+error.message,'e');return;}
  }
  toast(existingNo?'客戶資料已更新':'客戶新增成功');CM();customers();
}