/* 有度茶舍 V8：明确区分误录作废和其他收入补录。
 * 仅修改操作入口与审计可视化，不更改旧版数据存储键，不自动作废任何记录。
 */
(()=>{
  'use strict';
  const previousOrders=ordersPage,previousInventory=inventoryPage,previousReports=reportsPage,previousDialog=renderDialog;
  ui.correctionTab=ui.correctionTab||'orders';
  const correctionButton=tab=>'<button type="button" class="btn light yd-v8-correction-button" data-action="correction-open" data-tab="'+tab+'">↩ 误录纠错／作废</button>';
  ordersPage=function(){
    const content=previousOrders();
    return content.replace('<button class="btn light" data-action="export-csv" data-what="orders">',correctionButton('orders')+'<button class="btn light" data-action="export-csv" data-what="orders">');
  };
  inventoryPage=function(){
    const content=previousInventory();
    return content.replace('<button class="btn" data-action="purchase">＋ 登记进货</button>', '<button class="btn" data-action="purchase">＋ 登记进货</button>'+correctionButton('inventory'));
  };
  reportsPage=function(){
    let content=previousReports();
    const oldButton='<button class="btn light" data-action="report-adjust">＋ 人工调整收入</button>';
    content=content.replace(oldButton,correctionButton('orders'));
    const helper='<div class="yd-v8-explainer"><strong>误点订单或演示进货？</strong> 请选择上面的「误录纠错／作废」，找到对应记录后作废。系统会自动重算收入或进货合计，原记录和原因仍保留。</div>';
    content=content.replace('<div class="stats">',helper+'<div class="stats">');
    const other='<details class="yd-v8-other-income"><summary>其他收入补录（非订单，通常不用）</summary><div class="yd-v8-other-inner"><p>这是补录其它实际收入的功能，<strong>不是用来删除错误订单</strong>。误录请使用上方纠错入口。</p><button class="btn light" data-action="report-adjust">＋ 补录其他收入</button></div></details>';
    content=content.replace('<div class="two-col" style="margin-top:15px">',other+'<div class="two-col" style="margin-top:15px">');
    return content.replace(/人工收入调整/g,'其他收入补录').replace('按日／周／月独立汇总、导出与人工调整。','报表从有效账目自动生成；错误记录请从纠错入口逐笔撤销。');
  };
  const shortHistory=id=>{
    const arr=Array.isArray(data.audit)?data.audit.filter(x=>x.target===id):[];
    return arr.length?'<button class="yd-v8-history" type="button" data-action="correction-history" data-id="'+esc(id)+'">查看操作历史（'+arr.length+'）</button>':'';
  };
  function orderCard(o){
    const voided=!!o.voidedAt;
    return '<article class="yd-v8-record '+(voided?'yd-v8-record-voided':'')+'"><div class="yd-v8-record-head"><b>'+esc(o.floor)+'楼 · '+esc(o.room)+'</b><span class="tag '+(voided?'warning':'good')+'">'+(voided?'已作废 · 不计收入':'有效订单')+'</span></div>'+
    '<div class="yd-v8-record-sub">'+esc(fmtDate(o.closedAt))+' · '+esc(o.payment||'未知支付方式')+'</div>'+
    '<div class="yd-v8-values"><div><small>系统应收</small><strong>'+money(o.due)+'</strong></div><div><small>实际收款</small><strong>'+money(o.actual)+'</strong></div></div>'+
    (voided?'<p class="yd-v8-reason">作废原因：'+esc(o.voidReason||'未注明')+'</p>':'<div class="yd-v8-record-actions"><button type="button" class="btn light" data-action="edit-order" data-id="'+esc(o.id)+'">修改订单</button><button type="button" class="btn danger" data-action="void-order" data-id="'+esc(o.id)+'">删除误录（留痕）</button></div>')+
    shortHistory(o.id)+'</article>';
  }
  function purchaseCard(m){
    const stock=findStock(m.stockId),isIn=m.type==='inbound',voided=!!m.voidedAt;
    const label=isIn?'进货入库':'盘点调整';
    return '<article class="yd-v8-record '+(voided?'yd-v8-record-voided':'')+'"><div class="yd-v8-record-head"><b>'+esc(m.stockName||stock?.name||'库存品种')+'</b><span class="tag '+(voided?'warning':'good')+'">'+(voided?'已作废 · 已冲回':label)+'</span></div>'+
    '<div class="yd-v8-record-sub">'+esc(fmtDate(m.date))+' · '+esc(m.vendor||m.note||'无供应商信息')+'</div>'+
    '<div class="yd-v8-values"><div><small>本次'+(isIn?'进货':'库存变动')+'</small><strong>'+num(m.delta)+' '+esc(m.unit||stock?.unit||'')+'</strong></div><div><small>'+(isIn?'进货金额':'本次变动')+'</small><strong>'+(isIn?money(m.total):'盘点')+'</strong></div></div>'+
    (voided?'<p class="yd-v8-reason">作废原因：'+esc(m.voidReason||'未注明')+'</p>':'<div class="yd-v8-record-actions"><button type="button" class="btn light" data-action="movement-edit" data-id="'+esc(m.id)+'">修改记录</button><button type="button" class="btn danger" data-action="movement-void" data-id="'+esc(m.id)+'">删除误录（冲回库存）</button></div>')+
    shortHistory(m.id)+'</article>';
  }
  function correctionHub(){
    const tab=ui.correctionTab==='inventory'?'inventory':'orders';
    const entries=tab==='orders'?data.orders.slice().sort((a,b)=>+new Date(b.closedAt)-+new Date(a.closedAt)):
      data.movements.filter(x=>['inbound','adjust'].includes(x.type)).slice().sort((a,b)=>+new Date(b.date)-+new Date(a.date));
    const countActive=entries.filter(x=>!x.voidedAt).length;
    const cards=entries.slice(0,40).map(tab==='orders'?orderCard:purchaseCard).join('');
    return dialogHead('操作纠错','纠错／撤销误录','这里不是修改报表金额，而是逐笔更正原始账目。')+
    '<div class="yd-v8-hub"><div class="yd-v8-choice"><button type="button" data-action="correction-switch" data-tab="orders" class="'+(tab==='orders'?'active':'')+'">营业订单</button><button type="button" data-action="correction-switch" data-tab="inventory" class="'+(tab==='inventory'?'active':'')+'">进货／盘点</button></div>'+
    '<div class="yd-v8-intro"><b>'+(tab==='orders'?'更正错收／误点订单':'撤销测试进货或误录库存')+'</b><p>'+(tab==='orders'?'修改实收可以保留正确账单；如果整笔订单不存在，请选择“删除误录”，填写原因后作废，不再计入营业额。':'例如为演示录入“长牌20副、40元”，选择那笔进货记录作废，库存冲回20副，进货合计也会自动减去40元。')+'</p></div>'+
    '<p class="yd-v8-count">本设备共有 '+entries.length+' 笔此类记录，其中有效 '+countActive+' 笔。最近40笔如下，较早记录可在原始列表中查找。</p>'+
    '<div class="yd-v8-record-list">'+(cards||'<div class="empty">本设备还没有这类记录</div>')+'</div>'+
    '<div class="note">每次撤销都要确认并填写原因；不会永久抹掉原始记录。这里只处理当前设备上的账本，不会直接修改另一台设备的本地数据。</div></div>';
  }
  function historyDialog(){
    const id=ui.modal?.id;
    const list=(data.audit||[]).filter(x=>x.target===id).slice().reverse();
    return dialogHead('账目留痕','操作历史','原始值、修改后的值、修改原因都会保留在本机备份中。')+
    '<div class="yd-v8-hub"><button class="btn light" data-action="correction-back" type="button">← 返回纠错列表</button>'+
    (list.map(a=>'<article class="yd-v8-record"><div class="yd-v8-record-head"><b>'+esc(a.action)+'</b><small>'+esc(fmtDate(a.at))+'</small></div><p class="yd-v8-reason">原因：'+esc(a.reason||'—')+'</p><details><summary>查看操作前后原始数据</summary><pre class="yd-v8-raw">'+esc(JSON.stringify({before:a.before,after:a.after},null,2))+'</pre></details></article>').join('')||'<div class="empty">没有找到历史操作</div>')+
    '</div>';
  }
  function decorateVoidingDialog(){
    const panel=$('dialog'),reason=panel.querySelector('textarea[name="reason"]');
    if(!reason||panel.querySelector('.yd-v8-reason-options'))return;
    reason.insertAdjacentHTML('beforebegin','<div class="yd-v8-reason-options"><span>快捷填写原因：</span><button type="button" data-action="correction-reason" data-reason="演示操作，未实际发生">给家人演示／误点</button><button type="button" data-action="correction-reason" data-reason="重复录入，实际只发生一次">重复录入</button><button type="button" data-action="correction-reason" data-reason="录入对象或金额错误">记录有误</button></div>');
    if(ui.modal.type==='order-void'){
      const check=panel.querySelector('input[name="returnStock"]');
      if(check)check.closest('label')?.insertAdjacentHTML('beforebegin','<p class="yd-v8-stock-note">如果这笔只是演示订单、商品并未真的售出，应勾选下面的“退回库存”；若商品已经实际消耗，不要勾选。</p>');
    }
  }
  renderDialog=function(){
    if(ui.modal?.type==='correction-hub'||ui.modal?.type==='correction-history'){
      const dlg=$('dialog');
      dlg.classList.remove('compact');dlg.classList.add('yd-v8-modal');
      dlg.innerHTML=ui.modal.type==='correction-hub'?correctionHub():historyDialog();
      $('overlay').classList.remove('hidden');$('overlay').setAttribute('aria-hidden','false');
      return;
    }
    $('dialog').classList.remove('yd-v8-modal');
    previousDialog();
    if(['order-void','movement-void'].includes(ui.modal?.type))decorateVoidingDialog();
  };
  document.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.action==='correction-open'){
      ui.correctionTab=b.dataset.tab==='inventory'?'inventory':'orders';
      openDialog('correction-hub');return;
    }
    if(b.dataset.action==='correction-switch'){
      ui.correctionTab=b.dataset.tab==='inventory'?'inventory':'orders';
      renderDialog();return;
    }
    if(b.dataset.action==='correction-history'){
      ui.modal={type:'correction-history',id:b.dataset.id};
      renderDialog();return;
    }
    if(b.dataset.action==='correction-back'){ui.modal={type:'correction-hub'};renderDialog();return;}
    if(b.dataset.action==='correction-reason'){
      const text=$('dialog').querySelector('textarea[name="reason"]');
      if(text){text.value=b.dataset.reason;text.focus();}
    }
  });
})();