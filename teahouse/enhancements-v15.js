/* V15: order-specific prices, temporary items, detailed bills and real inventory XLSX. */
(()=>{
 'use strict';
 const isApple=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 function writable(){
  const state=window.YouduSharedSyncV12?.getState();
  return !(isApple&&!window.YouduNative)&&state?.mode!=='viewer'&&
   !['CONFLICT','READ_ONLY'].includes(state?.issue)&&(!window.YouduNative||state?.mode==='primary');
 }
 function originalPrice(item){const p=Number(item.originalPrice??item.price);return Number.isFinite(p)?p:0;}
 function totals(session){
  const f=fee(session),originalGoods=num((session.items||[]).reduce((n,x)=>n+originalPrice(x)*x.qty,0));
  return {originalGoods,goodsAdjustment:num(f.goods-originalGoods),originalDue:num(f.total-f.goods+originalGoods),due:f.total};
 }
 function lineDetails(items){
  if(!items?.length)return '<div class="empty">本单暂无商品</div>';
  return '<div class="yd-v15-lines">'+items.map(x=>{
   const original=originalPrice(x),changed=Math.abs(original-Number(x.price))>.000001;
   return '<div class="yd-v15-line"><div><strong>'+esc(x.name)+(x.temporary?' <span class="tag">临时商品</span>':'')+'</strong>'+
    '<small>'+esc(x.label)+' × '+num(x.qty)+' · '+(changed?'原单价 '+money(original)+' → 本单单价 '+money(x.price):'单价 '+money(x.price))+'</small>'+
    (changed?'<small>原价金额 '+money(original*x.qty)+' · 本项改价 '+money((x.price-original)*x.qty)+'</small>':'')+
    '</div><strong>应收 '+money(x.price*x.qty)+'</strong></div>';
  }).join('')+'</div>';
 }
 function summary(originalDue,adjustment){return '<div class="summary-line"><span>原价应收（含房费／超时）</span><strong id="ydV15OriginalDue">'+money(originalDue)+'</strong></div>'+
  '<div class="summary-line"><span>商品改价调整</span><strong>'+money(adjustment)+'</strong></div>';}
 const previousCart=cartRows;
 cartRows=function(s){
  if(!s.items.length)return previousCart(s);
  const canEdit=writable();
  return s.items.map((x,i)=>'<div class="yd-v15-cart"><div class="yd-v15-cart-main"><div><strong>'+esc(x.name)+(x.temporary?' <span class="tag">临时</span>':'')+'</strong>'+
   '<small>'+esc(x.label)+' · '+(x.temporary?'录入单价 ':'菜单原价 ')+money(originalPrice(x))+'</small></div>'+
   '<div class="yd-v15-quantity"><button class="qtybtn" data-action="qty" data-idx="'+i+'" data-delta="-1"'+(canEdit?'':' disabled')+'>−</button><span>'+num(x.qty)+'</span><button class="qtybtn" data-action="qty" data-idx="'+i+'" data-delta="1"'+(canEdit?'':' disabled')+'>＋</button></div><strong>'+money(x.price*x.qty)+'</strong></div>'+
   '<div class="yd-v15-price"><label>本单单价（元／'+esc(x.label)+'） '+(canEdit?'<input type="number" min="0" max="10000000" step="0.01" inputmode="decimal" data-v15-price="'+i+'" aria-label="'+esc(x.name)+'本单单价" value="'+num(x.price)+'">':'<b>'+money(x.price)+'</b>')+'</label>'+
   '<small>'+(Math.abs(originalPrice(x)-x.price)>.000001?'已改价 · 每'+esc(x.label)+'调整 '+money(x.price-originalPrice(x)):canEdit?'修改后自动保存，仅影响本单':'按主收银记录显示')+'</small></div></div>').join('');
 };
 const previousMenu=roomMenu;
 roomMenu=function(s){
  const markup=previousMenu(s);
  if(!writable())return markup;
  const temporary='<section class="panel yd-v15-temporary"><details><summary>＋ 添加菜单外临时商品</summary><form id="ydV15TemporaryForm"><div class="form-grid">'+
   '<div class="field wide"><label>商品名称</label><input name="name" maxlength="60" required placeholder="填写本次临时商品名称"></div>'+
   '<div class="field"><label>单价（元）</label><input name="price" type="number" min="0" max="10000000" step="0.01" inputmode="decimal" required></div>'+
   '<div class="field"><label>数量</label><input name="qty" type="number" min="1" max="9999" step="1" value="1" required></div>'+
   '<div class="field"><label>单位</label><input name="unit" maxlength="10" value="份" required></div></div><div class="form-actions"><button class="btn" type="submit">加入本单</button></div></form></details></section>';
  return markup.replace('<div class="panel"><h3>当前已点商品</h3>',temporary+'<div class="panel"><h3>当前已点商品</h3>');
 };
 const previousBill=roomBill;
 roomBill=function(s){
  const t=totals(s),target='<div class="summary-line"><span>茶品 / 小食 / 饮品</span>';
  let markup=previousBill(s).replace(target,'<div class="form-section">已点商品明细</div>'+lineDetails(s.items)+summary(t.originalDue,t.goodsAdjustment)+target);
  markup=markup.replace('<h3>确认结账</h3>','<h3>确认结账</h3><div class="summary-line"><span>本单应收</span><strong id="ydV15DuePreview">'+money(t.due)+'</strong></div>'+
   '<div class="summary-line"><span>实际收款（结账前预览）</span><strong id="ydV15ActualPreview">'+money(t.due)+'</strong></div>'+
   '<div class="summary-line"><span>结账差额</span><strong id="ydV15DifferencePreview">¥0</strong></div>');
  return markup;
 };
 const previousOrder=orderDialog;
 orderDialog=function(){
  let markup=previousOrder();const o=data.orders.find(x=>x.id===ui.modal?.id);if(!o)return markup;
  const originalGoods=num((o.items||[]).reduce((n,x)=>n+originalPrice(x)*x.qty,0));
  markup=markup.replace('<div class="summary-line"><span>系统应收</span>',summary(o.originalDue??num(o.due-o.goodsFee+originalGoods),o.goodsAdjustment??num(o.goodsFee-originalGoods))+'<div class="summary-line"><span>系统应收</span>');
  const old=(o.items||[]).map(i=>'<div class="summary-line"><span>'+esc(i.name)+'（'+esc(i.label)+'）× '+i.qty+'</span><strong>'+money(i.price*i.qty)+'</strong></div>').join('');
  if(old)markup=markup.replace(old,lineDetails(o.items));
  return markup;
 };
 function currentSession(){const room=findRoom(ui.modal?.id);return room&&activeRoom(room);}
 function changePrice(index,value){
  if(!writable())return notify('请在华为主收银设备修改价格');
  const session=currentSession(),line=session?.items[index],price=Number(value);
  if(!line||String(value).trim()===''||!Number.isFinite(price)||price<0||price>10000000){notify('请填写有效的本单单价');renderDialog();return;}
  const next=num(price),before=Number(line.price);if(next===before)return;
  line.originalPrice=originalPrice(line);line.price=next;
  const event={at:new Date().toISOString(),from:before,to:next,originalPrice:line.originalPrice};
  (line.priceHistory??=[]).push(event);
  (data.audit??=[]).push({id:rid(),type:'item_price_change',orderId:session.id,productId:line.productId,name:line.name,...event});
  save();renderDialog();render();notify(line.name+' 本单单价已改为 '+money(next));
 }
 function addTemporary(form){
  if(!writable())return notify('请在华为主收银设备添加商品');
  const session=currentSession();if(!session)return;
  const name=form.elements.name.value.trim().slice(0,60),unit=form.elements.unit.value.trim().slice(0,10),raw=form.elements.price.value.trim(),price=Number(raw),qty=Number(form.elements.qty.value);
  if(!name||!unit||raw===''||!Number.isFinite(price)||price<0||price>10000000||!Number.isInteger(qty)||qty<1||qty>9999)return notify('请检查临时商品的名称、单位、数量和价格');
  session.items.push({lineId:rid(),productId:'temporary-'+rid(),name,label:unit,price:num(price),originalPrice:num(price),qty,temporary:true,stockId:'',consume:0});
  save();renderDialog();render();notify('临时商品已加入本单');
 }
 function liveTotals(){
  const s=currentSession();if(!s)return;const t=totals(s),input=document.getElementById('actualReceived'),raw=input?.value.trim()||'',actual=raw===''?t.due:Number(raw);
  const entries={ydV15OriginalDue:t.originalDue,ydV15DuePreview:t.due,ydV15ActualPreview:actual,ydV15DifferencePreview:num(actual-t.due)};
  for(const [id,value] of Object.entries(entries)){const el=document.getElementById(id);if(el)el.textContent=Number.isFinite(value)?money(value):'请检查金额';}
 }
 const unitPrice=n=>n==null?'—':'¥'+Number(n).toLocaleString('zh-CN',{maximumFractionDigits:6});
 function menuPrices(stock){return data.products.filter(p=>p.active).flatMap(p=>p.options.filter(o=>o.stockId===stock.id).map(o=>p.name+' '+money(o.price)+'／'+o.label)).join('；')||'未设置';}
 function specification(stock){return stock.specification||'';}
 function registered(){return data.inventory.filter(x=>x.active&&x.initialized);}
 function inventoryRows(){return registered().map(x=>[x.name,x.category,specification(x),Number(x.stock)||0,x.unit,x.lastCost??'', '元／'+x.unit,x.avgCost??'',x.avgCost==null?'':num(x.stock*x.avgCost),menuPrices(x)]);}
 stockList=function(){
  const q=ui.stockSearch.trim().toLowerCase(),all=data.inventory.filter(x=>x.active&&(!q||x.name.toLowerCase().includes(q))),list=all.filter(x=>x.initialized),pending=all.filter(x=>!x.initialized),canEdit=writable();
  const actions=x=>canEdit?'<div class="tiny-actions"><button class="textbtn" data-action="purchase" data-id="'+esc(x.id)+'">进货</button><button class="textbtn" data-action="adjust-stock" data-id="'+esc(x.id)+'">盘点</button><button class="textbtn" data-action="edit-stock" data-id="'+esc(x.id)+'">编辑</button></div>':'<span class="tag">只读</span>';
  return '<div class="toolbar"><input id="searchStock" class="search" type="search" placeholder="搜索库存品种…" value="'+esc(ui.stockSearch)+'"><span class="small-caption">已录入 '+registered().length+' 种 · 库存成本 '+money(registered().reduce((n,x)=>n+Math.max(0,x.stock)*(x.avgCost||0),0))+'</span></div>'+
   '<div class="table-wrap"><table class="data-table yd-v15-stock"><thead><tr><th>商品名称／规格</th><th>分类</th><th>现有库存</th><th>单位</th><th>最近进价</th><th>平均进价</th><th>菜单售价</th><th>操作</th></tr></thead><tbody>'+list.map(x=>'<tr><td><strong>'+esc(x.name)+'</strong><small class="yd-v15-spec">'+esc(specification(x))+'</small></td><td>'+esc(x.category)+'</td><td><strong>'+num(x.stock)+'</strong></td><td>'+esc(x.unit)+'</td><td>'+unitPrice(x.lastCost)+'／'+esc(x.unit)+'</td><td>'+unitPrice(x.avgCost)+'／'+esc(x.unit)+'</td><td>'+esc(menuPrices(x))+'</td><td>'+actions(x)+'</td></tr>').join('')+'</tbody></table>'+(!list.length?'<div class="empty">暂无已录入库存；登记进货或盘点后会显示在这里和 Excel 中。</div>':'')+'</div>'+
   (pending.length?'<details class="panel yd-v15-pending"><summary>待录入 '+pending.length+' 项（不导出到 Excel）</summary>'+pending.map(x=>'<div class="summary-line"><span>'+esc(x.name)+' · '+esc(x.unit)+'</span>'+actions(x)+'</div>').join('')+'</details>':'');
 };
 const previousInventory=inventoryPage;
 inventoryPage=function(){return previousInventory().replace('↓ 导出库存 CSV','↓ 导出库存 Excel').replace(/<div class="note">已预置茶叶[\s\S]*?<\/div>\s*$/,'<div class="note">上表和 Excel 只包含已登记库存的商品。待录入项目单独列出，登记进货或盘点后会自动进入库存表；已录入但数量为0的商品仍保留。</div>');};
 const previousCSV=exportCSV;
 exportCSV=function(what){
  if(what!=='stock')return previousCSV(what);
  const bytes=window.YouduExcelV15.workbook(inventoryRows(),fmtDate(Date.now()));
  window.YouduExcelV15.download('有度茶舍_现有库存_'+inputDate(Date.now()).slice(0,10)+'.xlsx',bytes);notify('库存 Excel 已生成，仅包含已录入库存');
 };
 document.addEventListener('change',e=>{const index=e.target?.getAttribute?.('data-v15-price');if(index!==null&&index!==undefined)changePrice(Number(index),e.target.value);},true);
 document.addEventListener('input',e=>{if(e.target?.id==='actualReceived')liveTotals();});
 document.addEventListener('submit',e=>{if(e.target.id!=='ydV15TemporaryForm')return;e.preventDefault();e.stopImmediatePropagation();addTemporary(e.target);},true);
 const css=document.createElement('style');
 css.textContent='.yd-v15-cart{padding:16px 0;border-bottom:1px solid #e5e9df}.yd-v15-cart-main,.yd-v15-price,.yd-v15-line{display:flex;justify-content:space-between;align-items:center;gap:12px}.yd-v15-cart-main>div:first-child{flex:1;min-width:0}.yd-v15-cart small,.yd-v15-line small,.yd-v15-spec{display:block;color:#7c887a;font-size:13px;line-height:1.7}.yd-v15-quantity{display:flex;align-items:center;gap:12px}.yd-v15-price{margin-top:10px;flex-wrap:wrap}.yd-v15-price label{display:flex;align-items:center;gap:10px;font-size:14px}.yd-v15-price input{width:115px;min-height:44px;font-size:17px;padding:8px;border:1px solid #cbd8c7;border-radius:8px;background:#fffefa}.yd-v15-line{align-items:flex-start;padding:13px 0;border-bottom:1px solid #e8e9df}.yd-v15-line>strong{white-space:nowrap}.yd-v15-lines{margin-bottom:14px}.yd-v15-temporary summary,.yd-v15-pending summary{cursor:pointer;font-size:15px;font-weight:650;color:#365643;padding:4px 0}.yd-v15-temporary form{padding-top:17px}.yd-v15-pending{margin-top:18px}.yd-v15-stock{min-width:950px}.yd-v15-stock td{vertical-align:top}.yd-v15-stock td:nth-child(7){max-width:240px}@media(max-width:640px){.yd-v15-cart-main{gap:7px}.yd-v15-quantity{gap:7px}.yd-v15-line{gap:8px}.yd-v15-line>strong{font-size:13px}}';
 document.head.appendChild(css);
 window.YouduV15={originalPrice,totals,lineDetails,changePrice,addTemporary,inventoryRows,registered,liveTotals,writable};
 render();
})();
