// ═══════════════════════════════════════
// loans.js
// ═══════════════════════════════════════

async function loans(){
  try{
    // 用兩段 query：未歸還排前面，同類再依日期倒序
    let q=sb.from('loan_orders')
      .select('loan_no,loan_date,direction,customer_name,agent_level,products_summary,total,return_status,returned,bad_debt,bad_debt_note',{count:'exact'});
    if(lFilter==='pending') q=q.eq('returned',false).eq('bad_debt',false);
    if(lFilter==='done') q=q.eq('returned',true);
    if(lFilter==='bad') q=q.eq('bad_debt',true);
    // 先抓全部，在前端自己排序（未歸還置頂，再依日期倒序）
    const{data:raw,count}=await q.limit(200);

    // 排序：未歸還/部分歸還在前，全部歸還在後；同狀態內依日期倒序
    const statusOrder=s=>{
      if(!s||s==='未歸還') return 0;
      if(s==='部分歸還') return 1;
      return 2;
    };
    const data=(raw||[]).sort((a,b)=>{
      const sd=statusOrder(a.return_status)-statusOrder(b.return_status);
      if(sd!==0) return sd;
      return (b.loan_date||'').localeCompare(a.loan_date||'');
    });

    const pendingCount=(raw||[]).filter(l=>!l.returned&&l.return_status!=='全部歸還').length;

    $('main').innerHTML=`
    <div class="ph"><div><div class="pt">借貨管理</div><div class="ps">${count||0} 張${pendingCount>0?` · <span style="color:var(--rd);font-weight:600">${pendingCount} 筆未歸還</span>`:''}</div></div>
      <div class="ha"><button class="btn btn-p btn-s" onclick="addLoan()">＋ 新增借貨單</button></div></div>
    <div class="pc">
      <div class="tab-bar">
        <div class="tab ${lFilter==='all'?'on':''}" onclick="lFilter='all';loans()">全部</div>
        <div class="tab ${lFilter==='pending'?'on':''}" onclick="lFilter='pending';loans()" style="${lFilter!=='pending'&&pendingCount>0?'color:var(--rd)':''}">
          未歸還 ${pendingCount>0?`<span style="background:var(--rd);color:#fff;border-radius:10px;padding:1px 6px;font-size:10px;margin-left:3px">${pendingCount}</span>`:''}
        </div>
        <div class="tab ${lFilter==='done'?'on':''}" onclick="lFilter='done';loans()">已歸還</div>
        <div class="tab ${lFilter==='bad'?'on':''}" onclick="lFilter='bad';loans()" style="color:var(--tx3)">呆帳</div>
      </div>
      <div class="tc">
        <div class="tb"><span class="tt">借貨單列表</span>
          <span style="font-size:11px;color:var(--tx3)">
            <span style="display:inline-block;width:10px;height:10px;background:var(--rdl);border:1px solid var(--rd);border-radius:2px;margin-right:3px"></span>未歸還
            <span style="display:inline-block;width:10px;height:10px;background:var(--aml);border:1px solid var(--am);border-radius:2px;margin:0 3px 0 8px"></span>部分歸還
          </span>
        </div>
        <div class="tw"><table style="width:100%">
          <tr><th>借貨單號</th><th>日期</th><th>方向</th><th>客戶</th><th>位階</th><th>商品</th><th>歸還狀態</th><th>操作</th></tr>
          ${data.map(l=>{
            const isBadDebt=l.bad_debt===true;
            const isNotReturned=!l.returned&&l.return_status!=='全部歸還'&&!isBadDebt;
            const isPartial=l.return_status==='部分歸還'&&!isBadDebt;
            const rowBg=isBadDebt?'background:#f0f0f0;opacity:.7':isNotReturned&&!isPartial?'background:var(--rdl)':isPartial?'background:var(--aml)':'';
            return `<tr style="${rowBg}">
              <td style="font-size:11px;font-family:monospace;${isNotReturned?'font-weight:600;color:var(--rd)':'color:var(--tx2)'}">${l.loan_no}</td>
              <td style="font-size:12px;font-weight:${isNotReturned?'600':'400'}">${fD(l.loan_date)}</td>
              <td><span class="badge ${l.direction==='借出'?'bb':'bbr'}">${l.direction||'借出'}</span></td>
              <td style="font-weight:500">${l.customer_name||'—'}</td>
              <td>${lvBadge(l.agent_level)}</td>
              <td style="font-size:12px;color:var(--tx2);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.products_summary||'—'}</td>
              <td>
                ${l.bad_debt?'<span class="badge bgr">呆帳核銷</span>':''}
                <span class="badge ${l.return_status==='全部歸還'||l.returned?'bg':l.return_status==='部分歸還'?'ba':'br2'}">${l.return_status||'未歸還'}</span>
              </td>
              <td><div style="display:flex;gap:3px">
                <button class="btn btn-s" onclick="showLoan('${l.loan_no}')">明細</button>
                ${isBadDebt
                  ? `<button class="btn btn-s" onclick="toggleBadDebt('${l.loan_no}',true)">取消呆帳</button>`
                  : `${isNotReturned||isPartial?`<button class="btn btn-s btn-p" onclick="returnLoan('${l.loan_no}')">記錄歸還</button>`:`<button class="btn btn-s" onclick="returnLoan('${l.loan_no}')">歸還記錄</button>`}
                    <button class="btn btn-s" style="color:var(--tx3);border-color:var(--tx3)" onclick="markBadDebt('${l.loan_no}')">呆帳</button>`
                }
              </div></td>
            </tr>`;
          }).join('')}
        </table></div>
      </div>
    </div>`;
  }catch(e){$('main').innerHTML=`<div class="ld" style="color:var(--rd)">載入失敗：${e.message}</div>`;}
}
async function addLoan(){
  const{data:pr}=await sb.from('products').select('product_no,name,spec,stock').eq('is_active',true).order('product_no');
  _loanProds=pr||[];
  _loanItems=[{id:1,pno:'',qty:1}];
  const td=today(), no=await genNo('LO','loan_orders','loan_no');
  const{data:parties}=await sb.from('loan_parties').select('*').eq('is_active',true).order('name');
  OM('新增借貨單',`
  <div class="fg" style="margin-bottom:13px">
    ${fi('lno','借貨單號','text',no)} <div class="fl"><label>日期</label><input id="f-ldt" type="date" value="${td}" onchange="regenNoOnDateChange('ldt','lno','LO','loan_orders','loan_no')" style="width:100%;padding:7px 8px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;outline:none"></div>
    ${fs('ldir','方向',['借出','借入'],'借出')}
    <div class="fl"><label>借貨對象</label>
      <div style="position:relative">
        <input type="text" id="lparty-inp" placeholder="輸入姓名或位階搜尋…"
          style="width:100%;padding:7px 8px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;outline:none"
          oninput="filterLParty(this.value)" onfocus="filterLParty(this.value)"
          onblur="setTimeout(()=>$('lparty-drop')?.classList.remove('open'),350)"
          oncompositionstart="window._ime=true" oncompositionend="window._ime=false" autocomplete="off">
        <input type="hidden" id="lparty-id">
        <div id="lparty-drop" style="position:absolute;top:100%;left:0;right:0;background:var(--sf);border:1px solid var(--bd);border-radius:var(--r);max-height:180px;overflow-y:auto;z-index:500;display:none;box-shadow:0 4px 12px rgba(0,0,0,.1)"></div>
      </div>
    </div>
    ${fi('lname','對象姓名 *')} ${fi('lph','手機/LINE')}
    ${fs('llv','位階',LEVELS,'零售')}
    ${fi('laddr','地址')}
  </div>
  <div style="margin-bottom:10px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px">
      <span style="font-size:12px;font-weight:600;color:var(--tx3)">借貨品項</span>
      <div style="display:flex;gap:5px">
        <button class="btn btn-s" style="background:var(--bll);color:var(--bl);border-color:var(--bl)" onclick="openBundlePicker('loan')">＋ 加入套組</button>
        <button class="btn btn-s" onclick="addLoanItem()">＋ 單品</button>
      </div>
    </div>
    <div id="loanArea"></div>
  </div>
  ${fa('lnote','備註','')}`,
  `<button class="btn" onclick="CM()">取消</button><button class="btn btn-p" onclick="saveLoan()">建立借貨單</button>`,true);
  window._lparties=parties||[];
  window.filterLParty=q=>{
    const drop=$('lparty-drop'); if(!drop)return;
    const fil=q?window._lparties.filter(p=>p.name.includes(q)||(p.agent_level||'').includes(q)||(p.phone||'').includes(q)):window._lparties;
    drop.classList.add('open');
    drop.style.display='block';
    drop.innerHTML=fil.slice(0,20).map(p=>
      `<div style="padding:7px 10px;font-size:13px;cursor:pointer;border-bottom:1px solid var(--bd)"
        onmouseover="this.style.background='var(--acl)'" onmouseout="this.style.background=''"
        onmousedown="pickLParty(${p.id},'${p.name.replace(/'/g,"\'")}','${p.phone||''}','${p.agent_level||''}')">
        <span style="font-weight:500">${p.name}</span>
        <span class="badge bgr" style="margin-left:6px;font-size:10px">${p.agent_level||'—'}</span>
        ${p.phone?`<span style="font-size:11px;color:var(--tx3);margin-left:6px">${p.phone}</span>`:''}
      </div>`
    ).join('')||`<div style="padding:8px 10px;font-size:12px;color:var(--tx3)">無結果 — 可直接在姓名欄填入</div>`;
  };
  window.pickLParty=(id,name,phone,lv)=>{
    $('lparty-inp').value=name;
    $('lparty-id').value=id;
    $('f-lname').value=name;
    if(phone) $('f-lph').value=phone;
    if(lv) $('f-llv').value=lv;
    $('lparty-drop').style.display='none';
  };
  renderLoanItems();
}
function renderLoanItems(){
  const area=$('loanArea');if(!area)return;
  area.innerHTML=_loanItems.map((item,idx)=>`
  <div class="ir ir-loan">
    <span style="font-size:12px;color:var(--tx3);text-align:center">${idx+1}</span>
    <div style="position:relative">
      <input type="text" value="${item.pno?(_loanProds.find(p=>p.product_no===item.pno)?.name||item.pno):''}" placeholder="輸入關鍵字搜尋商品…"
        style="font-size:12px;padding:5px 7px;border:1px solid var(--bd);border-radius:var(--r);background:var(--sf);width:100%;outline:none"
        oninput="filterLoanDrop(${item.id},this.value)" onfocus="filterLoanDrop(${item.id},this.value)"
        oncompositionstart="window._ime=true" oncompositionend="window._ime=false" onblur="if(!window._ime)setTimeout(()=>closeLoanDrop(${item.id}),400)" autocomplete="off">
      <div id="ldrop-${item.id}" style="position:absolute;top:100%;left:0;right:0;background:var(--sf);border:1px solid var(--bd);border-radius:var(--r);max-height:160px;overflow-y:auto;z-index:500;display:none;box-shadow:0 4px 12px rgba(0,0,0,.1)"></div>
    </div>
    <input type="number" value="${item.qty}" min="1" onchange="setLoanIQ(${item.id},this.value)" placeholder="數量" style="font-size:12px;padding:5px 7px;border:1px solid var(--bd);border-radius:var(--r);width:100%;outline:none">

    <button onclick="rmLoanItem(${item.id})" style="background:none;border:none;cursor:pointer;color:var(--rd);font-size:18px;line-height:1">×</button>
  </div>`).join('');
}
async function saveLoan(){
  const no=v('lno'),nm=v('lname'),dt=v('ldt'),dir=v('ldir');
  if(!no||!nm){toast('請填寫單號和客戶名稱','e');return;}
  const its=_loanItems.filter(i=>i.pno&&i.qty>0);
  if(!its.length){toast('請至少選一項商品','e');return;}
  await sb.from('loan_orders').insert({loan_no:no,loan_date:dt,direction:dir,customer_name:nm,phone:v('lph'),agent_level:v('llv'),address:v('laddr'),shipping_method:v('lshp'),note:v('lnote'),return_status:'未歸還',returned:false,products_summary:its.map(i=>(_loanProds.find(p=>p.product_no===i.pno)?.name||i.pno)).join('、'),year_month:ym(dt)});
  await sb.from('loan_order_items').insert(its.map(i=>{const p=_loanProds.find(x=>x.product_no===i.pno);return{loan_no:no,product_no:i.pno,product_name:p?.name||i.pno,spec:p?.spec,qty:i.qty,returned_qty:0};}));
  // 連動庫存
  for(const i of its){
    const{data:p}=await sb.from('products').select('stock').eq('product_no',i.pno).single();
    if(p){const ns=dir==='借出'?Math.max(0,p.stock-i.qty):p.stock+i.qty;await sb.from('products').update({stock:ns}).eq('product_no',i.pno);}
  }
  toast('借貨單建立成功！庫存已更新');CM();loans();
}
async function markBadDebt(no){
  OM('標記呆帳：'+no,`
  <div class="al al-e" style="font-size:12px">標記為呆帳後，此借貨記錄將列入「呆帳」分類，不再計入未歸還清單。建議詳細記錄原因以供日後追蹤。</div>
  <div class="fl" style="margin-top:10px"><label>呆帳原因/備註 *</label>
    <textarea id="f-bdnote" rows="4" placeholder="例：對方失聯無法聯絡，已確認放棄追討。借貨品項：XXX×2。損失金額：$XXXX" style="width:100%;padding:8px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;outline:none"></textarea>
  </div>`,
  `<button class="btn" onclick="CM()">取消</button><button class="btn btn-r" onclick="confirmBadDebt('${no}')">確認標記為呆帳</button>`);
}
async function confirmBadDebt(no){
  const note=document.getElementById('f-bdnote')?.value?.trim();
  if(!note){toast('請填寫呆帳原因','e');return;}
  await sb.from('loan_orders').update({bad_debt:true,bad_debt_note:note}).eq('loan_no',no);
  toast('已標記為呆帳，記錄保留供查詢');CM();loans();
}
async function toggleBadDebt(no,isBad){
  if(isBad){
    if(!confirm('確定取消呆帳標記？此筆記錄將回到未歸還清單。'))return;
    await sb.from('loan_orders').update({bad_debt:false,bad_debt_note:null}).eq('loan_no',no);
    toast('已取消呆帳標記');loans();
  }
}
async function showLoan(no){
  const[{data:l},{data:its}]=await Promise.all([
    sb.from('loan_orders').select('*').eq('loan_no',no).single(),
    sb.from('loan_order_items').select('*').eq('loan_no',no),
  ]);
  OM(`借貨單：${no}`,`
  ${l?.bad_debt?`<div class="al al-e" style="margin-bottom:12px"><b>⚠ 此筆已標記為呆帳</b><br><span style="font-size:12px">${l.bad_debt_note||''}</span></div>`:''}
  <div class="dg" style="margin-bottom:13px">
    <div class="dr"><span class="dlb">日期</span><span class="dv">${fD(l?.loan_date)}</span></div>
    <div class="dr"><span class="dlb">方向</span><span class="dv"><span class="badge ${l?.direction==='借出'?'bb':'bbr'}">${l?.direction||'借出'}</span></span></div>
    <div class="dr"><span class="dlb">對象</span><span class="dv">${l?.customer_name||'—'}</span></div>
    <div class="dr"><span class="dlb">位階</span><span class="dv">${lvBadge(l?.agent_level)}</span></div>
    <div class="dr"><span class="dlb">歸還狀態</span><span class="dv"><span class="badge ${l?.return_status==='全部歸還'||l?.returned?'bg':l?.return_status==='部分歸還'?'ba':'br2'}">${l?.return_status||'未歸還'}</span></span></div>
    <div class="dr"><span class="dlb">地址</span><span class="dv">${l?.address||'—'}</span></div>
  </div>
  <table class="itb"><tr><th>#</th><th>商品</th><th>借貨數</th><th>已歸還</th><th>未歸還</th><th>歸還日</th></tr>
  ${(its||[]).map((i,idx)=>`<tr>
    <td style="color:var(--tx3);font-size:12px">${idx+1}</td>
    <td>${i.product_name||'—'}${i.spec?` (${i.spec})`:''}</td>
    <td class="num">${fN(i.qty)}</td>
    <td class="num ok">${fN(i.returned_qty||0)}</td>
    <td class="num ${(i.qty-(i.returned_qty||0))>0?'cr':''}">${fN(i.qty-(i.returned_qty||0))}</td>
    <td style="font-size:12px">${i.return_date||'—'}</td>
  </tr>`).join('')}
  </table>`,
  `<button class="btn" onclick="CM()">關閉</button><button class="btn btn-p" onclick="returnLoan('${no}')">記錄歸還</button>`);
}
async function returnLoan(no){
  const[{data:l},{data:its}]=await Promise.all([
    sb.from('loan_orders').select('*').eq('loan_no',no).single(),
    sb.from('loan_order_items').select('*').eq('loan_no',no),
  ]);
  const td=today();
  OM(`記錄歸還：${no}`,`
  <div style="margin-bottom:12px">
    <div class="fl"><label>歸還日期</label><input id="f-rdt" type="date" value="${td}" style="width:200px;padding:7px 8px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;outline:none"></div>
  </div>
  <table class="itb"><tr><th>商品</th><th>借出數</th><th>已歸還</th><th>本次歸還數</th></tr>
  ${(its||[]).map(i=>`<tr>
    <td>${i.product_name||'—'}</td>
    <td class="num">${fN(i.qty)}</td>
    <td class="num">${fN(i.returned_qty||0)}</td>
    <td><input type="number" id="f-ret-${i.id}" value="${i.qty-(i.returned_qty||0)}" min="0" max="${i.qty-(i.returned_qty||0)}" style="width:70px;padding:4px 6px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;outline:none"></td>
  </tr>`).join('')}
  </table>`,
  `<button class="btn" onclick="CM()">取消</button><button class="btn btn-p" onclick="doReturn('${no}',${JSON.stringify(its)})">確認歸還</button>`);
}
async function doReturn(no,its){
  const rdt=v('rdt')||today();
  let allReturned=true, anyReturned=false;
  for(const i of its){
    const retQty=parseFloat($('f-ret-'+i.id)?.value)||0;
    const newRet=Math.min(i.qty,(i.returned_qty||0)+retQty);
    if(newRet<i.qty) allReturned=false;
    if(retQty>0){
      anyReturned=true;
      await sb.from('loan_order_items').update({returned_qty:newRet,return_date:rdt}).eq('id',i.id);
      // 連動庫存（歸還則補回庫存）
      const{data:p}=await sb.from('products').select('stock').eq('product_no',i.product_no).single();
      if(p) await sb.from('products').update({stock:p.stock+retQty}).eq('product_no',i.product_no);
    }
  }
  const status=allReturned?'全部歸還':anyReturned?'部分歸還':'未歸還';
  await sb.from('loan_orders').update({return_status:status,returned:allReturned,return_date:allReturned?rdt:null}).eq('loan_no',no);
  toast('歸還記錄已更新！庫存已連動');CM();loans();
}
window.markBadDebt=markBadDebt;
async function loanParties() {
  const { data, count } = await sb.from('loan_parties')
    .select('*', { count: 'exact' })
    .order('name');

  $('main').innerHTML = `
  <div class="ph"><div><div class="pt">借貨對象名單</div><div class="ps">${count || 0} 位</div></div>
    <div class="ha"><button class="btn btn-p btn-s" onclick="addLParty()">＋ 新增對象</button></div></div>
  <div class="pc">
    <div class="al al-w" style="font-size:12px">
      這裡記錄的是<b>代理間互借的對象</b>（不同於一般客戶），新增借貨單時可直接從這裡搜尋選用。
    </div>
    <div class="tc">
      <div class="tb"><span class="tt">借貨對象列表</span></div>
      <div class="tw"><table style="width:100%">
        <tr><th>姓名</th><th>位階</th><th>手機/LINE</th><th>地址</th><th>備註</th><th>狀態</th><th>操作</th></tr>
        ${(data || []).map(p => `<tr style="${!p.is_active ? 'opacity:.5' : ''}">
          <td style="font-weight:500">${p.name}${!p.is_active ? '<span class="badge br2" style="margin-left:5px;font-size:10px">停用</span>' : ''}</td>
          <td>${lvBadge(p.agent_level)}</td>
          <td>${p.phone || '—'}</td>
          <td style="font-size:12px;color:var(--tx2)">${p.address || '—'}</td>
          <td style="font-size:12px;color:var(--tx2)">${p.note || '—'}</td>
          <td><span class="badge ${p.is_active ? 'bg' : 'br2'}">${p.is_active ? '啟用' : '停用'}</span></td>
          <td><div style="display:flex;gap:3px">
            <button class="btn btn-s" onclick="editLParty(${p.id})">編輯</button>
            <button class="btn btn-s" onclick="toggleLParty(${p.id},${p.is_active})">${p.is_active ? '停用' : '啟用'}</button>
          </div></td>
        </tr>`).join('')}
      </table></div>
    </div>
  </div>`;
}
function lPartyForm(p) {
  p = p || {};
  return `<div class="fg">
    ${fi('lpname', '姓名 *', 'text', p.name)}
    ${fs('lplv', '位階', LEVELS, p.agent_level || '零售')}
    ${fi('lpph', '手機/LINE', 'text', p.phone)}
    ${fi('lpline', 'LINE ID', 'text', p.line_id)}
    <div class="fl fw">${fi('lpaddr', '地址', 'text', p.address)}</div>
    <div class="fl fw">${fa('lpnote', '備註', p.note)}</div>
  </div>`;
}
function addLParty() {
  OM('新增借貨對象', lPartyForm(),
    `<button class="btn" onclick="CM()">取消</button><button class="btn btn-p" onclick="saveLParty(false)">新增</button>`);
}
async function editLParty(id) {
  const { data: p } = await sb.from('loan_parties').select('*').eq('id', id).single();
  OM('編輯借貨對象', lPartyForm(p),
    `<button class="btn" onclick="CM()">取消</button><button class="btn btn-p" onclick="saveLParty(${id})">儲存</button>`);
}
async function saveLParty(editId) {
  const nm = v('lpname');
  if (!nm) { toast('請填寫姓名', 'e'); return; }
  const obj = { name: nm, agent_level: v('lplv'), phone: v('lpph') || null, line_id: v('lpline') || null, address: v('lpaddr') || null, note: v('lpnote') || null };
  if (editId) {
    await sb.from('loan_parties').update(obj).eq('id', editId);
  } else {
    obj.is_active = true;
    await sb.from('loan_parties').insert(obj);
  }
  toast(editId ? '對象已更新' : '借貨對象新增成功！');
  CM();
  loanParties();
}
async function toggleLParty(id, active) {
  await sb.from('loan_parties').update({ is_active: !active }).eq('id', id);
  toast(!active ? '已啟用' : '已停用');
  loanParties();
}
window.loanParties = loanParties;
window.addLParty = addLParty;
window.editLParty = editLParty;
window.saveLParty = saveLParty;
window.toggleLParty = toggleLParty;