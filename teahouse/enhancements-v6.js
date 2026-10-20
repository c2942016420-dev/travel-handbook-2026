/* Youdu V6: locally audited order editing, report adjustments, cost-free profit estimate.
   Original v3 storage key remains unchanged. No cloud sync is claimed. */
(()=>{
  const BASELINE=KEY+'__pre_v6_20261020';
  try {
    const original=localStorage.getItem(KEY);
    if(original && !localStorage.getItem(BASELINE)) localStorage.setItem(BASELINE,original);
  } catch(err){console.warn('Preserved snapshot unavailable:',err);}
  data.audit=Array.isArray(data.audit)?data.audit:[];
  data.reportAdjustments=Array.isArray(data.reportAdjustments)?data.reportAdjustments:[];
  data.expenses=Array.isArray(data.expenses)?data.expenses:[];
  ui.orderShowVoided=false;
  const oldSave=save;
  save=function(){
    try{
      const today=inputDate(Date.now()).slice(0,10).replaceAll('-','');
      const checkpoint=KEY+'__daily_previous_'+today;
      const raw=localStorage.getItem(KEY);
      if(raw && !localStorage.getItem(checkpoint))localStorage.setItem(checkpoint,raw);
    }catch(e){console.warn('Automatic local checkpoint unavailable:',e);}
    oldSave();
  };
  const oldRestoreFile=restoreFile;
  restoreFile=function(file){
    try{
      const before=localStorage.getItem(KEY);
      if(before)localStorage.setItem(KEY+'__before_manual_import_'+Date.now(),before);
    }catch(e){console.warn(e);}
    oldRestoreFile(file);
  };
  function log(action,target,before,after,reason){
    data.audit.push({id:'audit-'+rid(),at:new Date().toISOString(),action,target,reason,actor:'共享账号',before:clone(before),after:clone(after)});
  }
  function active(o){return !o.voidedAt;}
  function rangeData(period=ui.reportPeriod){
    const start=datesRange();
    const between=(x)=>{const t=+new Date(x);return Number.isFinite(t)&&t>=start&&t<=Date.now()+60000;};
    const orders=data.orders.filter(o=>active(o)&&between(o.closedAt));
    const adjustments=data.reportAdjustments.filter(a=>!a.voidedAt&&between(a.date));
    const expenses=data.expenses.filter(x=>!x.voidedAt&&between(x.date));
    const inbound=data.movements.filter(x=>x.type==='inbound'&&!x.voidedAt&&between(x.date));
    const paid=num(orders.reduce((v,o)=>v+(Number(o.actual)||0),0));
    const due=num(orders.reduce((v,o)=>v+(Number(o.due)||0),0));
    const adjustment=num(adjustments.reduce((v,a)=>v+Number(a.amount),0));
    const operatingCosts=num(expenses.reduce((v,x)=>v+Number(x.amount),0));
    const procurement=num(inbound.reduce((v,x)=>v+(Number(x.total)||0),0));
    return {orders,adjustments,expenses,inbound,paid,due,adjustment,operatingCosts,procurement,revenue:num(paid+adjustment),profit:num(paid+adjustment-operatingCosts),people:orders.reduce((v,o)=>v+(Number(o.guests)||0),0)};
  }
  function dateShort(iso){return fmtDate(iso).slice(0,10);}
  const baseOrderDialog=orderDialog;
  orderDialog=function(){
    const o=data.orders.find(x=>x.id===ui.modal?.id);if(!o)return '';
    const actions=o.voidedAt
     ?'<div class="note warning">此订单已作废，原记录保留供查账，不再计入收入。</div>'
     :'<div class="yd-v6-actions"><button type="button" class="btn light" data-action="edit-order" data-id="'+esc(o.id)+'">修改订单</button><button type="button" class="btn danger" data-action="void-order" data-id="'+esc(o.id)+'">删除 / 作废</button></div>';
    const history=data.audit.filter(a=>a.target===o.id).slice(-8).reverse();
    const auditHtml=history.length?'<section class="yd-audit"><b>修改历史</b>'+history.map(a=>'<div class="yd-audit-line"><small>'+fmtDate(a.at)+' · '+esc(a.action)+'</small><div>'+esc(a.reason||'—')+'</div></div>').join('')+'</section>':'';
    return baseOrderDialog()+actions+auditHtml;
  };
  ordersPage=function(){
    const sorted=data.orders.slice().sort((a,b)=>+new Date(b.closedAt)-+new Date(a.closedAt));
    const midnight=new Date();midnight.setHours(0,0,0,0);
    const today=sorted.filter(o=>active(o)&&+new Date(o.closedAt)>=+midnight);
    const due=num(today.reduce((x,o)=>x+Number(o.due||0),0));
    const received=num(today.reduce((x,o)=>x+Number(o.actual||0),0));
    const list=sorted.filter(o=>ui.orderShowVoided||active(o));
    const controls='<button class="btn light" data-action="export-csv" data-what="orders">↓ 导出订单 CSV</button>';
    const cards='<div class="stats">'+stat('今日有效订单',today.length,'笔')+stat('今日应收',money(due))+stat('今日实收',money(received))+stat('应收实收差额',money(num(received-due)),'',Math.abs(received-due)>.01)+'</div>';
    const filter='<div class="yd-v6-toolbar"><span>订单修改和作废会保留历史记录。作废的订单默认不参加营业统计。</span><label><input type="checkbox" id="showVoidedOrders" '+(ui.orderShowVoided?'checked':'')+'> 显示已作废订单</label></div>';
    const rows=list.map(o=>'<tr class="'+(o.voidedAt?'yd-void-row':'')+'"><td>'+fmtDate(o.closedAt)+'</td><td><strong>'+o.floor+'楼 · '+esc(o.room)+'</strong>'+(o.voidedAt?' <span class="tag warning">已作废</span>':'')+'</td><td>'+esc(o.guests)+'</td><td class="price">'+money(o.due)+'</td><td class="price">'+money(o.actual)+'</td><td class="price">'+money(num(o.actual-o.due))+'</td><td>'+esc(o.payment)+'</td><td><button class="textbtn" data-action="view-order" data-id="'+esc(o.id)+'">详情</button>'+(!o.voidedAt?'<button class="textbtn" data-action="edit-order" data-id="'+esc(o.id)+'">修改</button><button class="textbtn yd-danger-text" data-action="void-order" data-id="'+esc(o.id)+'">删除</button>':'')+'</td></tr>').join('');
    return title('营业订单','系统应收、实际收款分别记录；修改和作废保留审计痕迹。',controls)+cards+filter+'<div class="table-wrap"><table class="data-table"><thead><tr><th>结账时间</th><th>楼层／房间</th><th>人数</th><th>系统应收</th><th>实际收款</th><th>差额</th><th>付款方式</th><th>操作</th></tr></thead><tbody>'+rows+'</tbody></table>'+(!rows?'<div class="empty">暂无符合筛选条件的订单</div>':'')+'</div>';
  };
  reportsPage=function(){
    const r=rangeData(),period={day:'今日',week:'本周',month:'本月'}[ui.reportPeriod];
    const titleActions='<button class="btn light" data-action="export-csv" data-what="report">↓ 导出'+period+'经营报表 CSV</button>';
    const tabs='<div class="yd-v6-toolbar"><div class="chip-group">'+[['day','日报 / 今日'],['week','周报 / 本周'],['month','月报 / 本月']].map(([k,label])=>'<button data-action="period" data-period="'+k+'" class="'+(ui.reportPeriod===k?'active':'')+'">'+label+'</button>').join('')+'</div><button class="btn light" data-action="report-adjust">＋ 人工调整收入</button><button class="btn light" data-action="expense-new">＋ 登记经营支出</button></div>';
    const stats='<div class="stats">'+stat('实际收款',money(r.paid))+stat('调整后营业额',money(r.revenue))+stat('经营支出（不含进货）',money(r.operatingCosts))+stat('暂估利润*',money(r.profit),'',r.profit<0)+'</div>';
    const summary='<div class="two-col"><section class="panel"><h3>'+period+'经营汇总</h3>'+[
      ['有效结账订单',r.orders.length+'笔'],['系统应收',money(r.due)],['订单实际收款',money(r.paid)],['人工收入调整',money(r.adjustment)],['调整后营业额',money(r.revenue)],['已录入的非进货支出',money(r.operatingCosts)],['暂估利润（未计存货成本）',money(r.profit)],['登记进货金额（另列，不扣利润）',money(r.procurement)]
    ].map(([a,b])=>'<div class="summary-line"><span>'+a+'</span><strong>'+b+'</strong></div>').join('')+'</section><section class="panel"><h3>利润计算口径</h3><p class="yd-profit-formula">暂估利润 = 实际收款 + 人工收入调整 − 已登记的非进货经营支出</p><div class="note warning">* 暂估利润未扣除已售商品成本、存货变动、税费，以及尚未登记的房租、人工、水电等费用。即使报表显示正利润，也不代表真实净利润。进货金额另行统计，不能直接当作当期成本扣除。</div><p class="panel-sub">本机记录并非云端同步数据；不同设备目前仍可能不一致。</p></section></div>';
    const incomeList=r.adjustments.map(x=>'<div class="summary-line"><span>'+fmtDate(x.date)+' · '+esc(x.reason)+'</span><strong>'+money(x.amount)+'</strong><button class="textbtn" data-action="report-edit" data-id="'+esc(x.id)+'">修改</button><button class="textbtn yd-danger-text" data-action="entry-void" data-kind="adjustment" data-id="'+esc(x.id)+'">作废</button></div>').join('');
    const expenseList=r.expenses.map(x=>'<div class="summary-line"><span>'+fmtDate(x.date)+' · '+esc(x.category)+' · '+esc(x.note||'')+'</span><strong>'+money(x.amount)+'</strong><button class="textbtn" data-action="expense-edit" data-id="'+esc(x.id)+'">修改</button><button class="textbtn yd-danger-text" data-action="entry-void" data-kind="expense" data-id="'+esc(x.id)+'">作废</button></div>').join('');
    const breakdown='<div class="two-col" style="margin-top:15px"><section class="panel"><h3>人工收入调整</h3><p class="panel-sub">只改报表口径，不覆盖已结账订单。</p>'+(incomeList||'<div class="empty">暂无人工调整</div>')+'</section><section class="panel"><h3>其他经营支出</h3><p class="panel-sub">仅填写非进货支出，例如房租、水电和人工。</p>'+(expenseList||'<div class="empty">暂无其他支出登记</div>')+'</section></div>';
    return title('经营报表','按日／周／月独立汇总、导出与人工调整。',titleActions)+tabs+stats+summary+breakdown;
  };
  const originalSettings=settingsPage;
  settingsPage=function(){
    const status='<section class="panel yd-status-panel"><h3>数据安全与同步状态</h3><div class="note warning">当前为本机独立账本，尚未接入正式云数据库，也尚未实现 Google Drive 自动备份。不要把两台设备分别录入的订单视为已同步。</div><div class="yd-v6-toolbar"><button class="btn light" data-action="export-json">↓ 立即备份本机完整账本</button><button class="btn light" data-action="download-snapshot">↓ 另存升级前保护快照</button></div><p class="panel-sub">升级保留原有本机存储键 <code>youdu_tea_house_v3</code>，旧订单、商品、库存与房态不会因界面升级主动清空。</p></section>';
    return originalSettings()+status;
  };
  const baseRenderDialog=renderDialog;
  function editOrderDialog(){
    const o=data.orders.find(x=>x.id===ui.modal.id);if(!o||o.voidedAt)return dialogHead('营业订单','记录不可修改');
    return dialogHead('营业订单','修改 · '+o.room,'保留原值和修改原因；商品数量与库存请通过库存盘点单独处理。')+
    '<form id="v6OrderEditForm" class="panel">'+
    '<div class="form-grid"><div class="field"><label>系统应收（元）</label><input name="due" type="number" min="0" max="10000000" step="0.01" value="'+o.due+'" required></div>'+
    '<div class="field"><label>实际收款（元）</label><input name="actual" type="number" min="0" max="10000000" step="0.01" value="'+o.actual+'" required></div>'+
    '<div class="field"><label>客人人数</label><input name="guests" type="number" min="1" max="99" value="'+esc(o.guests)+'" required></div>'+
    '<div class="field"><label>收款方式</label><select name="payment">'+['微信','支付宝','现金','银行卡','其他'].map(x=>'<option '+(x===o.payment?'selected':'')+'>'+x+'</option>').join('')+'</select></div>'+
    '<div class="field wide"><label>订单备注</label><input name="note" maxlength="200" value="'+esc(o.note||'')+'"></div>'+
    '<div class="field wide"><label>修改原因（必填，保留在修改历史）</label><textarea name="reason" required maxlength="300" placeholder="例如：核对收银小票后更正实收金额"></textarea></div></div>'+
    '<div class="note">原账单：应收 '+money(o.due)+'，实收 '+money(o.actual)+'。本操作不会删除原账单快照，也不更改商品明细及库存。</div>'+
    '<div class="form-actions"><button class="btn fill" type="submit">确认修改并留痕</button></div></form>';
  }
  function voidOrderDialog(){
    const o=data.orders.find(x=>x.id===ui.modal.id);if(!o||o.voidedAt)return dialogHead('营业订单','记录已作废');
    return dialogHead('营业订单','删除 / 作废 · '+o.room,'不会物理删除订单，只将其从营业报表中排除。')+
    '<form id="v6OrderVoidForm" class="panel"><div class="note warning">作废后历史订单仍可查看。默认不自动返还已扣库存，以免商品实际已消耗时错误增加库存。</div>'+
    '<div class="field"><label>作废原因（必填）</label><textarea name="reason" required maxlength="300" placeholder="例如：重复录入／测试订单"></textarea></div>'+
    '<label class="yd-checkbox"><input type="checkbox" name="returnStock"> 商品实际已退回库存，并同步冲回对应出库记录（谨慎选择）</label>'+
    '<div class="form-actions"><button class="btn danger" type="submit">确认作废并保留记录</button></div></form>';
  }
  function entryDialog(type){
    const adjust=type==='report-adjust'||type==='report-edit';
    const editing=type==='report-edit'||type==='expense-edit';
    const collection=adjust?data.reportAdjustments:data.expenses;
    const old=editing?collection.find(x=>x.id===ui.modal.id):null;
    const label=adjust?'人工收入调整':'非进货经营支出';
    return dialogHead('经营报表',(editing?'修改 · ':'新增 · ')+label,'不修改原始订单；所有新增和修改都保留记录。')+
    '<form id="'+(adjust?'v6AdjustmentForm':'v6ExpenseForm')+'" class="panel"><div class="form-grid">'+
    '<div class="field"><label>发生日期及时间</label><input name="date" type="datetime-local" required value="'+inputDate(old?.date||Date.now())+'"></div>'+
    '<div class="field"><label>'+(adjust?'调整金额（可为负数）':'支出金额（元）')+'</label><input name="amount" type="number" step="0.01" '+(adjust?'':'min="0.01"')+' required value="'+(old?.amount??'')+'" placeholder="'+(adjust?'例如 -20 或 50':'例如 300')+'"></div>'+
    (adjust?'':'<div class="field wide"><label>支出分类</label><select name="category">'+['房租','人工工资','水电物业','设备维修','广告推广','其他经营支出'].map(x=>'<option '+(old?.category===x?'selected':'')+'>'+x+'</option>').join('')+'</select></div>')+
    '<div class="field wide"><label>'+(adjust?'调整原因':'支出备注')+'</label><textarea name="note" maxlength="300" required placeholder="'+(adjust?'例如：收银差额核对、店内其它收入':'填写用途、凭证或经手说明')+'">'+esc(adjust?(old?.reason||''):(old?.note||''))+'</textarea></div>'+
    (editing?'<div class="field wide"><label>本次修改原因（必填）</label><input name="changeReason" required maxlength="300" placeholder="例如：依据账单核对更正金额"></div>':'')+
    '</div><div class="form-actions"><button type="submit" class="btn fill">'+(editing?'保存修改并留痕':'确认登记')+'</button></div></form>';
  }
  function voidEntryDialog(){
    const adjust=ui.modal.kind==='adjustment',list=adjust?data.reportAdjustments:data.expenses;
    const item=list.find(x=>x.id===ui.modal.id);
    if(!item)return dialogHead('经营报表','记录不存在');
    return dialogHead('经营报表','作废记录','将保留原始数据与操作历史。')+'<form id="v6EntryVoidForm" class="panel"><div class="field"><label>作废原因</label><textarea name="reason" maxlength="300" required></textarea></div><div class="form-actions"><button type="submit" class="btn danger">确认作废</button></div></form>';
  }
  renderDialog=function(){
    const t=ui.modal?.type;
    if(!['order-edit','order-void','report-adjust','report-edit','expense-entry','expense-edit','entry-void'].includes(t))return baseRenderDialog();
    const box=$('dialog');
    box.classList.add('compact');
    box.innerHTML=t==='order-edit'?editOrderDialog():t==='order-void'?voidOrderDialog():t==='entry-void'?voidEntryDialog():entryDialog(t);
    $('overlay').classList.remove('hidden');
    $('overlay').setAttribute('aria-hidden','false');
  };
  function parseMoney(v,allowNeg=false){
    const n=Number(v);
    if(!Number.isFinite(n)||n>(1e7)||(allowNeg?n<-(1e7):n<0))return null;
    return num(n);
  }
  function orderEditSave(form){
    const o=data.orders.find(x=>x.id===ui.modal?.id);if(!o||o.voidedAt)return;
    const actual=parseMoney(form.elements.actual.value),due=parseMoney(form.elements.due.value);
    const guests=Number(form.elements.guests.value),reason=form.elements.reason.value.trim();
    const payment=form.elements.payment.value;
    if(actual==null||due==null||!Number.isInteger(guests)||guests<1||guests>99||reason.length<2||!['微信','支付宝','现金','银行卡','其他'].includes(payment)){notify('请检查金额、人数、付款方式及修改原因');return;}
    const before=clone(o);
    if(o.originalCalculatedDue==null)o.originalCalculatedDue=o.due;
    Object.assign(o,{actual,due,difference:num(actual-due),guests,payment,note:form.elements.note.value.slice(0,200),lastEditedAt:new Date().toISOString()});
    log('修改订单',o.id,before,o,reason);
    save();closeDialog();render();notify('订单已修改，原值和原因已保留');
  }
  function orderVoidSave(form){
    const o=data.orders.find(x=>x.id===ui.modal?.id);if(!o||o.voidedAt)return;
    const reason=form.elements.reason.value.trim();
    if(reason.length<2){notify('请填写作废原因');return;}
    const returnStock=form.elements.returnStock.checked;
    if(!confirm('确认作废订单？原始记录会保留，不再计入营业报表。'+(returnStock?'\n同时将退回这笔订单的库存消耗。':'')))return;
    const before=clone(o),now=new Date().toISOString();
    if(returnStock){
      const sales=data.movements.filter(m=>m.orderId===o.id&&m.type==='sale');
      for(const m of sales){
        const s=findStock(m.stockId);
        if(!s||!(m.delta<0))continue;
        const q=num(-m.delta),prev=Number(s.stock)||0;
        s.stock=num(prev+q);s.initialized=true;
        data.movements.push({id:rid(),type:'void_return',date:now,stockId:s.id,stockName:s.name,unit:s.unit,delta:q,prevStock:prev,nextStock:s.stock,orderId:o.id,note:'订单作废 · 确认商品退库'});
      }
    }
    o.voidedAt=now;o.voidReason=reason;o.stockReturned=returnStock;
    log('作废订单',o.id,before,o,reason+(returnStock?'（同时退回库存）':'（未退回库存）'));
    save();closeDialog();render();notify('订单已作废，历史仍可查看');
  }
  function entrySave(form,kind){
    const adjust=kind==='adjustment',list=adjust?data.reportAdjustments:data.expenses;
    const editing=ui.modal.type==='report-edit'||ui.modal.type==='expense-edit';
    const old=editing?list.find(x=>x.id===ui.modal.id):null;
    if(editing&&!old)return;
    const amount=parseMoney(form.elements.amount.value,adjust);
    const dt=new Date(form.elements.date.value);
    const note=form.elements.note.value.trim();
    const reason=editing?form.elements.changeReason.value.trim():note;
    if(amount==null||(!adjust&&amount<=0)||!Number.isFinite(+dt)||+dt>Date.now()+86400000||note.length<2||reason.length<2){notify('请核对金额、日期及原因');return;}
    const before=old?clone(old):null,now=new Date().toISOString();
    const entry=old||{id:(adjust?'rev-':'exp-')+rid(),createdAt:now};
    if(adjust)Object.assign(entry,{date:dt.toISOString(),amount,reason:note});
    else Object.assign(entry,{date:dt.toISOString(),amount,category:form.elements.category.value,note});
    if(!old)list.push(entry);
    log(editing?'修改'+(adjust?'收入调整':'经营支出'):'新增'+(adjust?'收入调整':'经营支出'),entry.id,before,entry,reason);
    save();closeDialog();render();notify('已保存并保留调整记录');
  }
  function entryVoidSave(form){
    const adjust=ui.modal.kind==='adjustment';
    const list=adjust?data.reportAdjustments:data.expenses;
    const item=list.find(x=>x.id===ui.modal.id);if(!item||item.voidedAt)return;
    const reason=form.elements.reason.value.trim();if(reason.length<2)return notify('请输入作废原因');
    const before=clone(item);item.voidedAt=new Date().toISOString();item.voidReason=reason;
    log('作废'+(adjust?'收入调整':'经营支出'),item.id,before,item,reason);
    save();closeDialog();render();notify('记录已作废并留痕');
  }
  const oldExportCSV=exportCSV;
  exportCSV=function(what){
    if(what==='orders'){
      const head=[['订单编号','结账时间','楼层','房间','系统应收','实际收款','差额','付款方式','状态','作废原因','原计算应收','最后修改时间','备注'],...data.orders.map(o=>[o.id,fmtDate(o.closedAt),o.floor,o.room,o.due,o.actual,o.difference,o.payment,o.voidedAt?'已作废':'有效',o.voidReason||'',o.originalCalculatedDue??o.due,o.lastEditedAt||'',o.note||''])];
      exportFile('有度茶舍_营业订单_含作废记录_'+inputDate(Date.now()).slice(0,10)+'.csv',head.map(row=>row.map(csvCell).join(',')).join('\r\n'),'text/csv;charset=utf-8');
      return notify('订单已导出，含作废状态与修改结果');
    }
    if(what!=='report')return oldExportCSV(what);
    const r=rangeData(),name={day:'日报',week:'周报',month:'月报'}[ui.reportPeriod];
    const head=[
      ['有度茶舍 '+name+'（本机数据，非云同步）'],['报表生成时间',fmtDate(Date.now())],
      ['有效订单数',r.orders.length],['系统应收',r.due],['订单实际收款',r.paid],['人工收入调整',r.adjustment],['调整后营业额',r.revenue],['非进货经营支出',r.operatingCosts],
      ['暂估利润（不含存货成本）',r.profit],['进货总额（另列）',r.procurement],['特别说明','未扣除存货成本、税及其他未记录支出；不是正式净利润'],
      [],['有效订单'],['订单号','结账时间','楼层','房间','系统应收','实际收款','付款方式','人数','备注'],
      ...r.orders.map(x=>[x.id,fmtDate(x.closedAt),x.floor,x.room,x.due,x.actual,x.payment,x.guests,x.note||'']),
      [],['人工收入调整'],['时间','金额','调整原因'],...r.adjustments.map(x=>[fmtDate(x.date),x.amount,x.reason]),
      [],['非进货经营支出'],['时间','金额','类别','备注'],...r.expenses.map(x=>[fmtDate(x.date),x.amount,x.category,x.note]),
      [],['进货记录（另列，不计算利润）'],['时间','品种','数量','进货总价','供应商'],...r.inbound.map(x=>[fmtDate(x.date),x.stockName,x.delta,x.total,x.vendor||''])
    ];
    exportFile('有度茶舍_'+name+'_'+inputDate(Date.now()).slice(0,10)+'.csv',head.map(row=>row.map(csvCell).join(',')).join('\r\n'),'text/csv;charset=utf-8');
    notify(name+'已导出');
  };
  document.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    const a=b.dataset.action,id=b.dataset.id;
    if(a==='edit-order'){openDialog('order-edit',id);}
    else if(a==='void-order'){openDialog('order-void',id);}
    else if(a==='report-adjust'){openDialog('report-adjust','new');}
    else if(a==='report-edit'){openDialog('report-edit',id);}
    else if(a==='expense-new'){openDialog('expense-entry','new');}
    else if(a==='expense-edit'){openDialog('expense-edit',id);}
    else if(a==='entry-void'){ui.modal={type:'entry-void',id,kind:b.dataset.kind};renderDialog();}
    else if(a==='download-snapshot'){
      const original=localStorage.getItem(BASELINE);
      if(!original)return notify('未找到升级前备份；可使用完整数据 JSON 导出');
      exportFile('有度茶舍_升级前保护快照.json',original,'application/json');
    }
  });
  document.addEventListener('change',e=>{
    if(e.target?.id==='showVoidedOrders'){ui.orderShowVoided=e.target.checked;render();}
  });
  document.addEventListener('submit',e=>{
    const id=e.target?.id;
    if(!['v6OrderEditForm','v6OrderVoidForm','v6AdjustmentForm','v6ExpenseForm','v6EntryVoidForm'].includes(id))return;
    e.preventDefault();
    if(id==='v6OrderEditForm')orderEditSave(e.target);
    else if(id==='v6OrderVoidForm')orderVoidSave(e.target);
    else if(id==='v6AdjustmentForm')entrySave(e.target,'adjustment');
    else if(id==='v6ExpenseForm')entrySave(e.target,'expense');
    else if(id==='v6EntryVoidForm')entryVoidSave(e.target);
  });
  const iconPaths={
    rooms:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    products:'<path d="M4 7h16M4 12h16M4 17h16"/><circle cx="7" cy="7" r="1" fill="currentColor"/><circle cx="7" cy="12" r="1" fill="currentColor"/><circle cx="7" cy="17" r="1" fill="currentColor"/>',
    inventory:'<path d="M4 8l8-5 8 5v12H4z"/><path d="M4 8l8 5 8-5M12 13v7"/>',
    orders:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6M9 10h6M9 14h6M9 18h4"/>',
    reports:'<path d="M4 20V11M10 20V5M16 20v-9M22 20V8M2 20h21"/>',
    settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="#f7f8f4"/><circle cx="16" cy="17" r="3" fill="#f7f8f4"/>'
  };
  const icon=(name)=>'<svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+iconPaths[name]+'</svg>';
  for(const nav of document.querySelectorAll('.side-nav button[data-nav]')){
    const el=nav.querySelector('.nav-icon');if(el)el.innerHTML=icon(nav.dataset.nav);
  }
  for(const nav of document.querySelectorAll('.mobile-nav button[data-nav]')){
    const el=nav.querySelector('span');if(el)el.innerHTML=icon(nav.dataset.nav);
  }
  render();
})();