var svcTab = 'orders';
var svcOrderPage = 1;
var _svcItemCat = '全部';

// ══════════════════════════════
// service-core.js
// ══════════════════════════════

function serviceHub() {
  const tabs = [
    { id:'orders',    label:'服務訂單' },
    { id:'gifts',     label:'服務贈品' },
    { id:'inventory', label:'服務庫存' },
    { id:'kits',      label:'耗材套組' },
    { id:'consumables', label:'服務耗材' },
    { id:'transfer',  label:'撥轉記錄' },
    { id:'credits',   label:'儲值管理' },
    { id:'items',     label:'服務項目' },
    { id:'technicians', label:'技師管理' },
  ];
  $('main').innerHTML = `
  <div class="ph">
    <div><div class="pt">服務管理</div></div>
    <div class="ha"><button class="btn btn-p btn-s" onclick="svcNewOrder()">＋ 新增服務單</button></div>
  </div>
  <div class="tab-bar" style="padding:0 16px 10px;overflow-x:auto">
    ${tabs.map(t=>`<div class="tab${svcTab===t.id?' on':''}" onclick="svcTab='${t.id}';serviceHub()"
      style="white-space:nowrap">${t.label}</div>`).join('')}
  </div>
  <div class="pc" id="svc-content">載入中…</div>`;
  if(svcTab==='orders')      window.svcOrders?.();
  if(svcTab==='gifts')       window.svcGifts?.();
  if(svcTab==='kits')        window.svcKits?.();
  if(svcTab==='inventory')   window.svcInventory?.();
  if(svcTab==='consumables') window.svcConsumables?.();
  if(svcTab==='transfer')    window.svcTransfers?.();
  if(svcTab==='credits')     window.svcCredits?.();
  if(svcTab==='items')       window.svcItems?.();
  if(svcTab==='technicians') window.svcTechnicians?.();
}

window.serviceHub      = serviceHub;
function svcCatChange(sel) {
  if(sel.value !== '__new__') return;
  const name = prompt('請輸入新分類名稱：');
  if(!name || !name.trim()) { sel.value = sel.options[0].value; return; }
  const trimmed = name.trim();
  // 檢查是否已存在
  const exists = Array.from(sel.options).some(o => o.value === trimmed);
  if(!exists) {
    // 在「＋ 新增分類」前插入新選項
    const newOpt = new Option(trimmed, trimmed, true, true);
    sel.insertBefore(newOpt, sel.lastElementChild);
  }
  sel.value = trimmed;
}

window.svcCatChange = svcCatChange;
function svcUnitChange(sel) {
  if(sel.value !== '__new__') return;
  const name = prompt('請輸入自訂單位：（例如：組、顆）');
  if(!name || !name.trim()) { sel.value = '次'; return; }
  const trimmed = name.trim();
  const newOpt = new Option(trimmed, trimmed, true, true);
  sel.insertBefore(newOpt, sel.lastElementChild);
  sel.value = trimmed;
}

window.svcUnitChange = svcUnitChange;
function svcRoleChange(sel) {
  if(sel.value !== '__new__') return;
  const name = prompt('請輸入自訂職位名稱：');
  if(!name || !name.trim()) { sel.value = sel.options[0].value; return; }
  const trimmed = name.trim();
  const exists = Array.from(sel.options).some(o => o.value === trimmed);
  if(!exists) {
    const newOpt = new Option(trimmed, trimmed, true, true);
    sel.insertBefore(newOpt, sel.lastElementChild);
  }
  sel.value = trimmed;
}

window.svcRoleChange = svcRoleChange;