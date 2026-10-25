/* V17: edit order amounts and add permanent menu products from ordering or checkout. */
(()=>{
 'use strict';
 const isApple=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 function writable(){
  const state=window.YouduSharedSyncV12?.getState();
  return !(isApple&&!window.YouduNative)&&state?.mode!=='viewer'&&
   !['CONFLICT','READ_ONLY'].includes(state?.issue)&&(!window.YouduNative||state?.mode==='primary');
 }
 function originalPrice(item){const p=Number(item.originalPrice??item.price);return Number.isFinite(p)?p:0;}
 function originalName(item){return String(item.originalName??item.name??'');}
 function priceText(value){return Number(Number(value).toFixed(6));}
 function totals(session){
  const f=fee(session),originalGoods=num((session.items||[]).reduce((n,x)=>n+originalPrice(x)*x.qty,0));
  return {originalGoods,goodsAdjustment:num(f.goods-originalGoods),originalDue:num(f.total-f.goods+originalGoods),due:f.total};
 }
 function lineDetails(items){
  if(!items?.length)return '<div class="empty">本单暂无商品</div>';
  return '<div class="yd-v15-lines">'+items.map(x=>{
   const original=originalPrice(x),changed=Math.abs(original-Number(x.price))>.000001;
   return '<div class="yd-v15-line"><div><strong>'+esc(x.name)+(x.temporary?' <span class="tag">临时商品</span>':'')+'</strong>'+
    (originalName(x)!==x.name?'<small>原名称：'+esc(originalName(x))+'</small>':'')+
    '<small>'+esc(x.label)+' × '+num(x.qty)+' · '+(changed?'原单价 '+money(original)+' → 本单单价 '+money(x.price):'单价 '+money(x.price))+'</small>'+
    (changed?'<small>原价金额 '+money(original*x.qty)+' · 本项改价 '+money((x.price-original)*x.qty)+'</small>':'')+
    '</div><strong>应收 '+money(x.price*x.qty)+'</strong></div>';
  }).join('')+'</div>';
 }
 function summary(originalDue,adjustment){return '<div class="summary-line"><span>原价应收（含房费／超时）</span><strong id="ydV15OriginalDue">'+money(originalDue)+'</strong></div>'+
  '<div class="summary-line"><span>商品改价调整</span><strong id="ydV17GoodsAdjustment">'+money(adjustment)+'</strong></div>';}
 const previousCart=cartRows;
 cartRows=function(s){
  if(!s.items.length)return previousCart(s);
  const canEdit=writable();
  return s.items.map((x,i)=>'<div class="yd-v15-cart yd-v17-cart" data-v17-line="'+i+'">'+
   '<div class="yd-v15-cart-main"><span class="tag">第 '+(i+1)+' 项'+(x.temporary?' · 临时商品':'')+'</span><div class="yd-v15-quantity"><span>数量</span><button type="button" class="qtybtn" data-action="qty" data-idx="'+i+'" data-delta="-1"'+(canEdit?'':' disabled')+'>−</button><span>'+num(x.qty)+' '+esc(x.label)+'</span><button type="button" class="qtybtn" data-action="qty" data-idx="'+i+'" data-delta="1"'+(canEdit?'':' disabled')+'>＋</button></div></div>'+
   '<div class="yd-v17-edit-grid"><div class="yd-v17-name"><strong>'+esc(x.name)+'</strong><small>'+esc(x.label)+'</small></div>'+
   '<label>本单单价（元／'+esc(x.label)+'）'+(canEdit?'<input type="number" min="0" max="10000000" step="any" inputmode="decimal" required data-v15-price="'+i+'" aria-label="第'+(i+1)+'项本单单价" value="'+priceText(x.price)+'">':'<strong>'+money(x.price)+'</strong>')+'</label>'+
   '<label>本项金额（元）'+(canEdit?'<input type="number" min="0" max="10000000" step="0.01" inputmode="decimal" required data-v17-amount="'+i+'" aria-label="第'+(i+1)+'项金额" value="'+num(x.price*x.qty)+'">':'<strong>'+money(x.price*x.qty)+'</strong>')+'</label></div>'+
   '<small data-v17-origin="'+i+'">原单价 '+money(originalPrice(x))+' → 本单单价 '+money(x.price)+'</small>'+
   '<div class="yd-v17-line-summary"><small data-v17-adjustment="'+i+'">原价金额 '+money(originalPrice(x)*x.qty)+' · 本项改价 '+money((x.price-originalPrice(x))*x.qty)+'</small><strong data-v17-line-total="'+i+'">本项应收 '+money(x.price*x.qty)+'</strong></div></div>').join('');
 };
 function newProductForm(){
  if(!writable())return '';
  return '<section class="panel yd-v15-temporary"><h3>＋ 新增商品并加入本单</h3><p class="panel-sub">填写名称和金额后，商品会同时保存到商品菜单，以后可直接点选。</p><form id="ydV17ProductForm"><div class="form-grid">'+
   '<div class="field wide"><label for="ydV17NewName">新商品名称</label><input id="ydV17NewName" name="name" maxlength="60" required placeholder="填写要新增到菜单的商品名称"></div>'+
   '<div class="field"><label for="ydV17NewPrice">商品单价（元）</label><input id="ydV17NewPrice" name="price" type="number" min="0" max="10000000" step="0.01" inputmode="decimal" required></div>'+
   '<div class="field"><label for="ydV17NewQty">加入本单数量</label><input id="ydV17NewQty" name="qty" type="number" min="1" max="9999" step="1" value="1" required></div>'+
   '<div class="field"><label for="ydV17NewUnit">单位</label><input id="ydV17NewUnit" name="unit" maxlength="10" value="份" required></div>'+
   '<div class="field"><label for="ydV17NewCategory">菜单分类</label><input id="ydV17NewCategory" name="category" maxlength="30" value="其他" required></div></div>'+
   '<div class="form-actions"><button class="btn fill" type="submit">新增到菜单并加入本单</button></div></form></section>';
 }
 const previousMenu=roomMenu;
 roomMenu=function(s){
  const markup=previousMenu(s);
  if(!writable())return markup;
  return markup.replace('<div class="panel"><h3>当前已点商品</h3>',newProductForm()+'<div class="panel"><h3>当前已点商品</h3>');
 };
 roomBill=function(s){
  const f=fee(s),t=totals(s),r={...DEFAULT_RATES,...s.rates,teaDayHourly:s.rates.teaDayHourly==null?data.rates.teaDayHourly:s.rates.teaDayHourly};
  const draft=ui.checkoutDraft?.sessionId===s.id?ui.checkoutDraft:null;
  const actual=draft?.actual?.trim()?Number(draft.actual):t.due;
  return '<section class="panel" style="margin-top:14px"><h3>已点商品明细'+(writable()?' · 可直接改金额':'')+'</h3><p class="panel-sub">'+(writable()?'单价和本项金额可重新输入，改价只影响本单，原价会保留。新增商品可在下面填写名称和金额。':'按华为主收银记录显示商品名称、原价和本单金额。')+'</p>'+cartRows(s)+'</section>'+newProductForm()+
   '<section class="panel"><h3>自动计算的账单</h3><div class="summary-line"><span>'+(s.mode==='tea'?'二楼茶位费':'三楼棋牌套餐（含已续时）')+'</span><strong id="billBase">'+money(f.base)+'</strong></div>'+
   '<div class="summary-line"><span>'+(s.mode==='tea'?'茶席日间超时':'普通超时')+' '+f.dayHours+'小时 × '+(s.mode==='tea'?(r.teaDayHourly==null?'待设置':money(r.teaDayHourly)):money(r.overHourly))+'</span><strong id="billDay">'+(f.missingRate?'待设置':money(f.day))+'</strong></div>'+
   '<div class="summary-line"><span>'+(s.mode==='tea'?'22:00后超时':'零点后超时')+' '+f.nightHours+'小时 × '+money(s.mode==='tea'?r.teaNightHourly:r.nightHourly)+'</span><strong id="billNight">'+money(f.night)+'</strong></div>'+
   '<div class="summary-line"><span>茶品 / 小食 / 饮品</span><strong id="billGoods">'+money(f.goods)+'</strong></div>'+summary(t.originalDue,t.goodsAdjustment)+
   '<div class="bill-total"><span>系统应收（本单改价后）</span><strong id="billDue">'+money(t.due)+'</strong></div></section>'+
   (f.missingRate?'<div class="note warning">二楼茶席日间超时单价未设置，请先到收费设置填写；确认不收可填0。</div>':'')+
   '<section class="panel"><h3>确认结账</h3><div class="summary-line"><span>本单应收</span><strong id="ydV15DuePreview">'+money(t.due)+'</strong></div>'+
   '<div class="summary-line"><span>实际收款（结账前预览）</span><strong id="ydV15ActualPreview">'+money(actual)+'</strong></div><div class="summary-line"><span>结账差额</span><strong id="ydV15DifferencePreview">'+money(num(actual-t.due))+'</strong></div>'+
   '<form id="checkoutForm"><div class="form-grid"><div class="field"><label for="actualReceived">实际收款（可留空）</label><input id="actualReceived" type="number" name="actual" min="0" max="10000000" step="0.01" value="'+esc(draft?.actual||'')+'" placeholder="不填则按系统应收"></div>'+
   '<div class="field"><label for="ydV17Payment">付款方式</label><select id="ydV17Payment" name="payment">'+['微信','支付宝','现金','银行卡','其他'].map(p=>'<option'+(draft?.payment===p?' selected':'')+'>'+p+'</option>').join('')+'</select></div>'+
   '<div class="field wide"><label for="ydV17CheckoutNote">账单备注（可选）</label><input id="ydV17CheckoutNote" name="note" value="'+esc(draft?.note||'')+'" placeholder="例如：老客户优惠、抹零"></div></div><div class="form-actions yd-print-actions">'+
   '<button type="submit" data-yd-print="0" class="btn light">确认结账 · 不打印</button><button type="submit" data-yd-print="1" class="btn fill">确认结账并打印小票</button></div></form></section>'+
   '<div class="note">商品改价会保留原价；实际收款留空时，按结账瞬间的最新应收计算。小票和营业订单会记录商品明细、原价、本单金额、应收、实收及差额。</div>';
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
 function changePrice(index,value,entryMode='unit'){
  if(!writable())return notify('请在华为主收银设备修改价格');
  const session=currentSession(),line=session?.items[index],price=Number(value);
  if(!line||String(value).trim()===''||!Number.isFinite(price)||price<0||price>10000000||!Number(line.qty)){notify('请填写有效的商品金额');return false;}
  const next=entryMode==='amount'?num(price)/Number(line.qty):num(price),before=Number(line.price);if(next===before)return true;
  line.originalPrice=originalPrice(line);line.price=next;
  line.priceEntryMode=entryMode;
  const event={at:new Date().toISOString(),from:before,to:next,originalPrice:line.originalPrice,fromAmount:num(before*line.qty),toAmount:num(next*line.qty),entryMode};
  (line.priceHistory??=[]).push(event);
  (data.audit??=[]).push({id:rid(),type:'item_price_change',orderId:session.id,lineId:line.lineId,productId:line.productId,name:line.name,...event});
  save();refreshLine(index);liveTotals();return true;
 }
 function refreshLine(index){
  const line=currentSession()?.items[index];if(!line)return;
  for(const row of document.querySelectorAll('[data-v17-line="'+index+'"]')){
   const price=row.querySelector('[data-v15-price]'),amount=row.querySelector('[data-v17-amount]');
   if(price&&document.activeElement!==price)price.value=priceText(line.price);
   if(amount&&document.activeElement!==amount)amount.value=num(line.price*line.qty);
   const origin=row.querySelector('[data-v17-origin]'),adjustment=row.querySelector('[data-v17-adjustment]'),total=row.querySelector('[data-v17-line-total]');
   if(origin)origin.textContent='原单价 '+money(originalPrice(line))+' → 本单单价 '+money(line.price);
   if(adjustment)adjustment.textContent='原价金额 '+money(originalPrice(line)*line.qty)+' · 本项改价 '+money((line.price-originalPrice(line))*line.qty);
   if(total)total.textContent='本项应收 '+money(line.price*line.qty);
  }
 }
 function commitInput(input){
  const price=input.getAttribute('data-v15-price'),amount=input.getAttribute('data-v17-amount');
  const ok=price!==null?changePrice(Number(price),input.value):amount!==null?changePrice(Number(amount),input.value,'amount'):true;
  input.setCustomValidity?.(ok?'':'请检查商品金额');
  if(ok)delete input.dataset.ydPending;
  return !!ok;
 }
 function flushEdits(){
  if(!writable())return false;
  for(const input of document.querySelectorAll('[data-v15-price],[data-v17-amount]')){
   if(input.dataset.ydPending==='1'&&!commitInput(input)){input.reportValidity?.();return false;}
   if(input.checkValidity&&!input.checkValidity()){input.reportValidity?.();return false;}
  }
  return true;
 }
 function addMenuProduct(form){
  if(!writable())return notify('请在华为主收银设备新增商品');
  const session=currentSession();if(!session)return false;
  const name=form.elements.name.value.trim(),unit=form.elements.unit.value.trim(),category=form.elements.category.value.trim(),raw=form.elements.price.value.trim(),price=Number(raw),qty=Number(form.elements.qty.value);
  if(!name||name.length>60||!unit||unit.length>10||!category||category.length>30||raw===''||!Number.isFinite(price)||price<0||price>10000000||!Number.isInteger(qty)||qty<1||qty>9999){notify('请检查新商品的名称、金额、数量、单位和分类');return false;}
  let product=data.products.find(p=>p.name===name),option=product?.options.find(o=>o.label===unit&&Number(o.price)===num(price));
  if(product&&(!product.active||!option)){notify('菜单已有同名商品，请从菜单点选后修改本单金额；新增商品请填写不同名称');return false;}
  if(!product){
   option={label:unit,price:num(price),stockId:'',consume:0};product={id:'prod-'+rid(),name,category,active:true,options:[option]};data.products.push(product);
   (data.audit??=[]).push({id:rid(),type:'menu_product_created',at:new Date().toISOString(),orderId:session.id,productId:product.id,product:clone(product)});
  }
  let line=session.items.find(x=>x.productId===product.id&&x.name===product.name&&x.label===option.label&&x.price===option.price&&x.stockId===(option.stockId||''));
  if(line)line.qty+=qty;
  else session.items.push({lineId:rid(),productId:product.id,name:product.name,originalName:product.name,label:option.label,price:option.price,originalPrice:option.price,qty,stockId:option.stockId||'',consume:Number(option.consume)||0});
  ui.pickerCategory='全部';ui.pickerSearch='';save();renderDialog();render();notify('商品已保存到菜单，并加入本单');return true;
 }
 function addTemporary(form){
  if(!writable())return notify('请在华为主收银设备添加商品');
  const session=currentSession();if(!session)return;
  const name=form.elements.name.value.trim().slice(0,60),unit=form.elements.unit.value.trim().slice(0,10),raw=form.elements.price.value.trim(),price=Number(raw),qty=Number(form.elements.qty.value);
  if(!name||!unit||raw===''||!Number.isFinite(price)||price<0||price>10000000||!Number.isInteger(qty)||qty<1||qty>9999)return notify('请检查临时商品的名称、单位、数量和价格');
  session.items.push({lineId:rid(),productId:'temporary-'+rid(),name,originalName:name,label:unit,price:num(price),originalPrice:num(price),qty,temporary:true,stockId:'',consume:0});
  save();renderDialog();render();notify('临时商品已加入本单');
 }
 function liveTotals(){
  const s=currentSession();if(!s)return;const t=totals(s),input=document.getElementById('actualReceived'),raw=input?.value.trim()||'',actual=raw===''?t.due:Number(raw);
  const entries={ydV15OriginalDue:t.originalDue,ydV17GoodsAdjustment:t.goodsAdjustment,billGoods:fee(s).goods,billDue:t.due,modalSubTotal:t.due,ydV15DuePreview:t.due,ydV15ActualPreview:actual,ydV15DifferencePreview:num(actual-t.due)};
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
 const editSelector='[data-v15-price],[data-v17-amount]';
 document.addEventListener('change',e=>{if(e.target?.matches?.(editSelector))commitInput(e.target);},true);
 document.addEventListener('input',e=>{if(e.target?.matches?.(editSelector)){e.target.dataset.ydPending='1';e.target.setCustomValidity?.('');}if(e.target?.id==='actualReceived')liveTotals();});
 document.addEventListener('click',e=>{
  const action=e.target.closest?.('[data-action]')?.dataset.action;
  if(['room-tab','qty','add-to-cart'].includes(action)&&writable()&&!flushEdits()){e.preventDefault();e.stopImmediatePropagation();}
 },true);
 document.addEventListener('submit',e=>{if(e.target.id!=='ydV15TemporaryForm')return;e.preventDefault();e.stopImmediatePropagation();addTemporary(e.target);},true);
 document.addEventListener('submit',e=>{if(e.target.id!=='ydV17ProductForm')return;e.preventDefault();e.stopImmediatePropagation();if(flushEdits())addMenuProduct(e.target);},true);
 const previousDialog=renderDialog;
 renderDialog=function(){
  const session=currentSession(),form=document.getElementById('checkoutForm');
  if(session&&form)ui.checkoutDraft={sessionId:session.id,actual:form.elements.actual.value,payment:form.elements.payment.value,note:form.elements.note.value};
  previousDialog();liveTotals();
 };
 const previousCheckout=checkout;
 checkout=function(form){if(flushEdits())previousCheckout(form);};
 const css=document.createElement('style');
 css.textContent='.yd-v15-cart{padding:16px 0;border-bottom:1px solid #e5e9df}.yd-v15-cart-main,.yd-v15-price,.yd-v15-line{display:flex;justify-content:space-between;align-items:center;gap:12px}.yd-v15-cart-main>div:first-child{flex:1;min-width:0}.yd-v15-cart small,.yd-v15-line small,.yd-v15-spec{display:block;color:#7c887a;font-size:13px;line-height:1.7}.yd-v15-quantity{display:flex;align-items:center;gap:12px}.yd-v15-price{margin-top:10px;flex-wrap:wrap}.yd-v15-price label{display:flex;align-items:center;gap:10px;font-size:14px}.yd-v15-price input{width:115px;min-height:44px;font-size:17px;padding:8px;border:1px solid #cbd8c7;border-radius:8px;background:#fffefa}.yd-v15-line{align-items:flex-start;padding:13px 0;border-bottom:1px solid #e8e9df}.yd-v15-line>strong{white-space:nowrap}.yd-v15-lines{margin-bottom:14px}.yd-v15-temporary summary,.yd-v15-pending summary{cursor:pointer;font-size:15px;font-weight:650;color:#365643;padding:4px 0}.yd-v15-temporary form{padding-top:17px}.yd-v15-pending{margin-top:18px}.yd-v15-stock{min-width:950px}.yd-v15-stock td{vertical-align:top}.yd-v15-stock td:nth-child(7){max-width:240px}@media(max-width:640px){.yd-v15-cart-main{gap:7px}.yd-v15-quantity{gap:7px}.yd-v15-line{gap:8px}.yd-v15-line>strong{font-size:13px}}';
 document.head.appendChild(css);
 const editStyle=document.createElement('style');
 editStyle.textContent='.yd-v17-edit-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:12px 0}.yd-v17-edit-grid label{display:flex;flex-direction:column;gap:7px;font-size:14px;color:#49604d}.yd-v17-edit-grid .yd-v17-name{grid-column:1/-1}.yd-v17-edit-grid input{width:100%;min-width:0;box-sizing:border-box;min-height:48px;padding:10px 12px;font-size:18px;color:#263b2b;background:#fffefa;border:1px solid #bfcdba;border-radius:9px}.yd-v17-edit-grid input:invalid{border-color:#b2533d}.yd-v17-line-summary{display:flex;gap:12px;justify-content:space-between;align-items:center}.yd-v17-line-summary strong{white-space:nowrap;color:#345541}.yd-v17-cart:last-child{border-bottom:0}@media(max-width:420px){.yd-v17-edit-grid{grid-template-columns:1fr}.yd-v17-line-summary{align-items:flex-start;flex-direction:column;gap:5px}.yd-v15-quantity{gap:8px}}';
 document.head.appendChild(editStyle);
 window.YouduV15={originalPrice,originalName,totals,lineDetails,changePrice,changeAmount:(i,value)=>changePrice(i,value,'amount'),addMenuProduct,flushEdits,addTemporary,inventoryRows,registered,liveTotals,writable};
 render();
})();
