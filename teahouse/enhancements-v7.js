/* 有度茶舍 V7：进货/盘点修改与作废保留痕迹。不得直接删除营业数据。 */
(()=>{
  'use strict';
  data.audit=Array.isArray(data.audit)?data.audit:[];
  const beforeInventoryPage=inventoryPage;
  const beforeRenderDialog=renderDialog;
  function validDate(d){const t=+new Date(d);return Number.isFinite(t)&&t<=Date.now()+86400000;}
  function amount(v,negative=false){const n=Number(v);return Number.isFinite(n)&&Math.abs(n)<=1e7&&(negative||n>=0)?num(n):null;}
  function moveById(id){return data.movements.find(m=>m.id===id);}
  const editable=m=>m&&!m.voidedAt&&['inbound','adjust'].includes(m.type);
  function audit(action,m,before,reason){data.audit.push({id:'audit-'+rid(),at:new Date().toISOString(),action,target:m.id,reason,actor:'共享账号',before:clone(before),after:clone(m)});}
  function checkpoint(){try{const name=KEY+'__before_first_v7_inventory_edit';if(!localStorage.getItem(name))localStorage.setItem(name,JSON.stringify(data));}catch(e){console.warn('本机保护快照未能保存',e);}}
  function recalcPurchaseCost(stockId){
    const st=findStock(stockId);if(!st)return;
    const active=data.movements.filter(m=>m.type==='inbound'&&!m.voidedAt&&m.stockId===stockId);
    if(!active.length){st.lastCost=null;st.avgCost=null;return;}
    const quantity=active.reduce((a,m)=>a+Number(m.delta||0),0),cost=active.reduce((a,m)=>a+Number(m.total||0),0);
    st.avgCost=quantity>0?num(cost/quantity):null;
    st.lastCost=num(active.sort((a,b)=>+new Date(b.date)-+new Date(a.date))[0].unitCost||0);
  }
  function showActions(m){
    if(m.voidedAt)return '<span class="tag warning">已作废（留档）</span>';
    if(!editable(m))return '<span class="small-caption">不可从进货页修改</span>';
    return '<div class="tiny-actions"><button type="button" class="textbtn" data-action="movement-edit" data-id="'+esc(m.id)+'">修改</button><button type="button" class="textbtn yd-v7-delete" data-action="movement-void" data-id="'+esc(m.id)+'">删除／作废</button></div>';
  }
  function nameType(m){
    return ({inbound:'进货入库',sale:'销售扣减',adjust:'盘点调整',purchase_correction:'进货修正',purchase_void:'进货冲回',adjust_correction:'盘点修正',adjust_void:'盘点冲回',void_return:'订单退库'})[m.type]||'变动留痕';
  }
  movementList=function(){
    const moves=data.movements.slice().sort((a,b)=>+new Date(b.date)-+new Date(a.date));
    const rows=moves.map(m=>{
      const st=findStock(m.stockId);
      const title=esc(m.stockName||st?.name||'历史品种');
      const quantity=(m.delta>0?'+':'')+num(m.delta)+' '+esc(m.unit||st?.unit||'');
      const status=m.voidedAt?' <span class="tag warning">作废</span>':'';
      const cost=m.type==='inbound'?money(m.unitCost)+' / '+money(m.total):m.type==='sale'?'随订单扣减':'—';
      const text='<tr class="'+(m.voidedAt?'yd-v7-voided':'')+'"><td>'+fmtDate(m.date)+'</td><td><span class="tag '+(m.type==='inbound'?'good':m.type==='sale'?'warning':'')+'">'+nameType(m)+'</span>'+status+'</td><td><strong>'+title+'</strong></td><td class="mono">'+quantity+'</td><td>'+cost+'</td><td>'+esc(m.vendor||m.note||'—')+'</td><td>'+showActions(m)+'</td></tr>';
      return text;
    }).join('');
    const mobile=moves.map(m=>{
      const st=findStock(m.stockId),quantity=(m.delta>0?'+':'')+num(m.delta)+' '+esc(m.unit||st?.unit||'');
      return '<div class="mobile-stock-card '+(m.voidedAt?'yd-v7-voided':'')+'"><div class="stock-head"><div><b>'+esc(m.stockName||st?.name||'库存记录')+'</b><small>'+fmtDate(m.date)+'</small></div><span class="tag '+(m.type==='inbound'?'good':'')+'">'+nameType(m)+(m.voidedAt?' · 已作废':'')+'</span></div><div class="summary-line"><span>数量变动</span><strong>'+quantity+'</strong></div><div class="summary-line"><span>进价／金额</span><strong>'+(m.type==='inbound'?money(m.unitCost)+' / '+money(m.total):'—')+'</strong></div><small>'+esc(m.vendor||m.note||'')+'</small><div class="yd-v7-mobile-actions">'+showActions(m)+'</div></div>';
    }).join('');
    return '<div class="table-wrap stock-desktop"><table class="data-table"><thead><tr><th>时间</th><th>类型</th><th>品种</th><th>数量变动</th><th>进价／金额</th><th>供应商／原因</th><th>操作</th></tr></thead><tbody>'+rows+'</tbody></table>'+(moves.length?'':'<div class="empty">还没有库存变动记录</div>')+'</div>'+(moves.length?'<div class="mobile-stock-list">'+mobile+'</div>':'')+'<div class="note">入库和盘点记录支持修改或作废，原始记录与原因保留；销售扣库存只能通过订单和库存核对更正。进货记录作废后，不再计入进货金额。</div>';
  };
  inventoryPage=function(){
    const html=beforeInventoryPage(),d=new Date();d.setHours(0,0,0,0);
    const total=data.movements.filter(x=>x.type==='inbound'&&!x.voidedAt&&+new Date(x.date)>=+d).reduce((a,x)=>a+Number(x.total||0),0);
    return html.replace(/(<span class="stat-label">今日进货<\/span><strong class="stat-number">)[\s\S]*?(<\/strong>)/,(_,head,tail)=>head+money(total)+tail);
  };
  function editPage(){
    const m=moveById(ui.modal.id);
    if(!editable(m))return dialogHead('进货库存','该记录不能修改');
    const s=findStock(m.stockId);
    if(!s)return dialogHead('进货库存','原库存品种不存在');
    const isIn=m.type==='inbound';
    const qtyLabel=isIn?'本次进货数量':'原盘点变动量（正数增加、负数减少）';
    return dialogHead('进货库存','修改 · '+s.name,'修改数量会自动调整当前库存，并保留历史。')+
    '<form id="v7MovementEdit" class="panel"><div class="note">库存品种：'+esc(s.name)+'（'+esc(s.unit)+'）。修改品种请作废后重新登记，避免混淆历史。</div><div class="form-grid">'+
    '<div class="field"><label>'+qtyLabel+'</label><input type="number" name="quantity" '+(isIn?'min="0.001"':'')+' step="0.001" required value="'+num(m.delta)+'"></div>'+
    (isIn?'<div class="field"><label>每单位进价（元）</label><input type="number" min="0" step="0.001" name="cost" required value="'+num(m.unitCost||0)+'"></div><div class="field wide"><label>供应商</label><input name="vendor" maxlength="80" value="'+esc(m.vendor||'')+'"></div>':'')+
    '<div class="field"><label>记录日期</label><input type="datetime-local" name="date" required value="'+inputDate(m.date)+'"></div>'+
    '<div class="field wide"><label>备注</label><input name="note" maxlength="200" value="'+esc(m.note||'')+'"></div>'+
    '<div class="field wide"><label>本次修改原因（必填）</label><textarea name="reason" minlength="2" maxlength="300" required placeholder="如：实际点数为18副，原输入20副"></textarea></div></div>'+
    '<div class="note warning">系统按新旧数量的差额修正当前库存，不重新写入已完成的销售或其它进货记录。若改变了已盘点的历史数量，请复核当前实物库存。</div>'+
    '<div class="form-actions"><button class="btn fill" type="submit">保存修改并保留历史</button></div></form>';
  }
  function voidPage(){
    const m=moveById(ui.modal.id),s=m&&findStock(m.stockId);
    if(!editable(m)||!s)return dialogHead('进货库存','该记录不可作废');
    return dialogHead('进货库存','删除／作废 · '+s.name,'不是永久删除，会冲回本笔库存变动，并保存原因。')+
    '<form id="v7MovementVoid" class="panel"><div class="summary-line"><span>原记录类型</span><strong>'+nameType(m)+'</strong></div><div class="summary-line"><span>原数量变动</span><strong>'+num(m.delta)+' '+esc(s.unit)+'</strong></div><div class="summary-line"><span>当前库存</span><strong>'+num(s.stock)+' '+esc(s.unit)+'</strong></div>'+
    '<div class="field" style="margin-top:14px"><label>作废原因（必填）</label><textarea name="reason" minlength="2" maxlength="300" required placeholder="例如：重复入库，核对后作废"></textarea></div>'+
    '<div class="note warning">作废将自动冲回 '+num(m.delta)+' '+esc(s.unit)+' 的变动，原记录仍可查。若当前库存不足以冲回，系统会阻止作废，请先核对实际库存。</div>'+
    '<div class="form-actions"><button type="submit" class="btn danger">确认作废并冲回库存</button></div></form>';
  }
  renderDialog=function(){
    if(ui.modal?.type==='movement-edit'||ui.modal?.type==='movement-void'){
      const box=$('dialog');box.classList.add('compact');box.innerHTML=ui.modal.type==='movement-edit'?editPage():voidPage();
      $('overlay').classList.remove('hidden');$('overlay').setAttribute('aria-hidden','false');
      return;
    }
    beforeRenderDialog();
  };
  function updateStock(m,difference,kind,reason){
    const st=findStock(m.stockId);if(!st)return false;
    const old=Number(st.stock)||0,next=num(old+difference);
    if(next<0){notify('库存数量不足，无法作废或修改这笔记录。请先核对实际库存，再做盘点更正。');return false;}
    st.stock=next;st.initialized=true;
    if(Math.abs(difference)>1e-8){
      data.movements.push({id:rid(),type:kind,date:new Date().toISOString(),stockId:st.id,stockName:st.name,unit:st.unit,delta:num(difference),prevStock:old,nextStock:next,relatedMovementId:m.id,note:reason});
    }
    return true;
  }
  function editMove(form){
    const m=moveById(ui.modal?.id);if(!editable(m))return;
    const s=findStock(m.stockId);if(!s)return notify('库存品种不存在');
    const q=amount(form.elements.quantity.value,true),isIn=m.type==='inbound';
    const cost=isIn?amount(form.elements.cost.value):0;
    const date=new Date(form.elements.date.value),reason=form.elements.reason.value.trim();
    if(q===null||(isIn&&q<=0)||(isIn&&cost===null)||!validDate(date)||reason.length<2){notify('请检查数量、单价、日期和原因');return;}
    checkpoint();
    const before=clone(m),diff=num(q-m.delta);
    if(!updateStock(m,diff,isIn?'purchase_correction':'adjust_correction',reason))return;
    m.delta=q;m.date=date.toISOString();m.note=form.elements.note.value.slice(0,200);
    if(m.prevStock!=null)m.nextStock=num(Number(m.prevStock)+q);
    if(isIn){m.unitCost=cost;m.total=num(q*cost);m.vendor=form.elements.vendor.value.trim().slice(0,80);recalcPurchaseCost(m.stockId);}
    m.lastEditedAt=new Date().toISOString();audit('修改'+nameType(m),m,before,reason);
    save();closeDialog();render();notify('修改成功：库存数量已调整，原记录留档');
  }
  function voidMove(form){
    const m=moveById(ui.modal?.id);if(!editable(m))return;
    const reason=form.elements.reason.value.trim();if(reason.length<2)return notify('请填写作废原因');
    if(!window.confirm('确认作废？库存将自动冲回，记录仍可查询。'))return;
    checkpoint();
    const before=clone(m),isIn=m.type==='inbound';
    if(!updateStock(m,num(-m.delta),isIn?'purchase_void':'adjust_void',reason))return;
    m.voidedAt=new Date().toISOString();m.voidReason=reason;
    if(isIn)recalcPurchaseCost(m.stockId);
    audit('作废'+nameType(m),m,before,reason);
    save();closeDialog();render();notify('记录已作废，库存已冲回');
  }
  document.addEventListener('click',event=>{
    const b=event.target.closest('button');if(!b)return;
    if(b.dataset.action==='movement-edit'){openDialog('movement-edit',b.dataset.id);}
    if(b.dataset.action==='movement-void'){openDialog('movement-void',b.dataset.id);}
  });
  document.addEventListener('submit',event=>{
    if(event.target.id==='v7MovementEdit'){event.preventDefault();editMove(event.target);}
    if(event.target.id==='v7MovementVoid'){event.preventDefault();voidMove(event.target);}
  });
  const settingsText=$('offlineLabel');if(settingsText){settingsText.title='仅本机储存。Google Drive 自动备份未获独立授权时不生效。';}
})();