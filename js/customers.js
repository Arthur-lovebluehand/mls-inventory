// ═══════════════════════════════════════
// customers.js
// ═══════════════════════════════════════

async function customers(){
  try{
    let q=sb.from('customers').select('customer_no,name,agent_level,phone,email,ship_full_address,store_credit',{count:'exact'}).order('customer_no');
    if(cS) q=q.or(`name.ilike.%${cS}%,phone.ilike.%${cS}%,customer_no.ilike.%${cS}%`);
    const{data,count}=await q.range((cP-1)*30,cP*30-1);
    const tp=Math.ceil((count||0)/30);
    $('main').innerHTML=`
    <div class="ph"><div><div class="pt">客戶資料</div><div class="ps">${count||0} 位</div></div>
      <div class="ha"><button class="btn btn-p btn-s" onclick="addCust()">＋ 新增客戶</button></div></div>
    <div class="pc">
    
    <div class="tc">
      <div class="tb"><span class="tt">客戶列表</span>
        <div class="si"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input placeholder="姓名/電話/編號…（輸入後按 Enter 搜尋）" value="${cS}" onkeydown="if(event.key==='Enter'){cS=this.value;cP=1;customers();}"></div>
      </div>
      <div class="tw"><table style="width:100%">
        <tr><th>編號</th><th>姓名</th><th>位階</th><th>手機</th><th>Email</th><th>送貨地址</th><th>儲值金</th><th>操作</th></tr>
        ${(data||[]).map(c=>`<tr>
          <td style="font-size:11px;font-family:monospace;color:var(--tx2)">${c.customer_no}</td>
          <td style="font-weight:500">${c.name}</td>
          <td>${lvBadge(c.agent_level)}</td>
          <td>${c.phone||'—'}</td>
          <td style="font-size:12px">${c.email||'—'}</td>
          <td style="font-size:12px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.ship_full_address||'—'}</td>
          <td class="num">${c.store_credit?fM(c.store_credit):'—'}</td>
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
  const[{data:c},{data:os}]=await Promise.all([
    sb.from('customers').select('*').eq('customer_no',no).single(),
    sb.from('sales_orders').select('order_no,order_date,total,payment_done').eq('customer_no',no).order('order_date',{ascending:false}).limit(30),
  ]);
  OM(`客戶：${c?.name}`,`
  <div class="dg" style="margin-bottom:13px">
    <div class="dr"><span class="dlb">客戶編號</span><span class="dv">${c?.customer_no}</span></div>
    <div class="dr"><span class="dlb">位階</span><span class="dv">${lvBadge(c?.agent_level)}</span></div>
    <div class="dr"><span class="dlb">手機</span><span class="dv">${c?.phone||'—'}</span></div>
    <div class="dr"><span class="dlb">Email</span><span class="dv">${c?.email||'—'}</span></div>
    <div class="dr"><span class="dlb">生日</span><span class="dv">${c?.birthday||'—'}</span></div>
    <div class="dr"><span class="dlb">13月亮印記</span><span class="dv">${c?.lunar_mark||'—'}</span></div>
    <div class="dr"><span class="dlb">愛閃耀會員編號</span><span class="dv" style="font-family:monospace">${c?.member_no||'—'}</span></div>
    <div class="dr"><span class="dlb">儲值金</span><span class="dv ok" style="font-weight:600">${fM(c?.store_credit)}</span></div>
    <div class="dr"><span class="dlb">付款方式</span><span class="dv">${c?.payment_method||'—'}</span></div>
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
function custForm(c){
  c=c||{};
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
  OM('新增客戶',custForm({customer_no:nextNo}),`<button class="btn" onclick="CM()">取消</button><button class="btn btn-p" onclick="saveCust(false)">新增</button>`);
}
async function eCust(no){
  const{data:c}=await sb.from('customers').select('*').eq('customer_no',no).single();
  OM('編輯客戶',custForm(c),`<button class="btn" onclick="CM()">取消</button><button class="btn btn-p" onclick="saveCust('${no}')">儲存</button>`);
}
async function saveCust(existingNo){
  const nm=v('cname');if(!nm){toast('請填寫姓名','e');return;}
  const obj={name:nm,agent_level:v('clv'),member_no:v('cmno')||null,phone:v('cph'),email:v('ceml'),birthday:v('cbday')||null,lunar_mark:v('clmk')||null,payment_method:v('cpay'),shipping_method:v('cshp')||null,wallet_mode:v('cwallet')||'shared',ship_address:v('caddr'),ship_full_address:v('caddr'),note:v('cnote')||null};
  if(existingNo){
    const{error}=await sb.from('customers').update(obj).eq('customer_no',existingNo);
    if(error){toast('儲存失敗：'+error.message,'e');return;}
  } else {
    const no=v('cno');obj.customer_no=no||null;obj.store_credit=0;
    const{error}=await sb.from('customers').insert(obj);
    if(error){toast('新增失敗：'+error.message,'e');return;}
  }
  toast(existingNo?'客戶資料已更新':'客戶新增成功');CM();customers();
}