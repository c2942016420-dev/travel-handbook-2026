/* 有度茶舍 V12 结账打印设计：打印可选；不打印不影响结账；
 * 订单唯一落账后才能打印；失败可从订单详情补打。
 * 打印调用系统 PrintManager / 浏览器打印，不承诺未知 USB 机型兼容。
 */
(function(){
 'use strict';
 const PAPER_KEY='youdu_receipt_paper_v12';
 let paper=localStorage.getItem(PAPER_KEY)==='80'?'80':'58';
 const s=x=>esc(String(x??''));
 const amount=x=>money(Number(x)||0);
 const htmlText=x=>s(x).replace(/\r?\n/g,'<br>');
 function receipt(order,trial=false){
  const o=order;
  const items=(o.items||[]).map(i=>'<div class="line"><span>'+s(i.name)+' '+s(i.label)+
   ' × '+Number(i.qty||0)+'</span><b>'+amount(Number(i.price||0)*Number(i.qty||0))+'</b></div>').join('');
  const date=x=>x?fmtDate(x):new Date().toLocaleString('zh-CN');
  const css='@page{size:'+paper+'mm auto;margin:2mm}'+
    'html,body{margin:0;padding:0;color:#101010;background:#fff;font-family:system-ui,"Noto Sans CJK SC","Microsoft Yahei",sans-serif;font-size:12px}'+
    'main{max-width:'+(paper==='80'?'72':'50')+'mm;padding:3mm;margin:0 auto}h1{text-align:center;font-size:17px;letter-spacing:2px;margin:6px 0 4px}'+
    '.minor{text-align:center;color:#444;font-size:10px;margin-bottom:12px}.line{display:flex;justify-content:space-between;gap:7px;margin:7px 0}'+
    '.line span{flex:1;overflow-wrap:anywhere}.line b{white-space:nowrap}.sep{border-top:1px dashed #444;margin:12px 0}'+
    '.money{font-size:19px;font-weight:750}.footer{text-align:center;margin:18px 0 6px;font-size:11px}'+
    'button{display:block;width:100%;padding:12px;font-size:16px;background:#234b3a;color:white;border:0;border-radius:8px;margin:16px 0}'+
    '@media print{button,.instructions{display:none!important}}';
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'+
    '<meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>有度茶舍 · '+s(trial?'测试打印':o.room)+'小票</title><style>'+css+'</style></head><body><main>'+
    '<h1>有度茶舍</h1><p class="minor">营业小票'+(trial?' · 测试样张':'')+'</p>'+
    '<div class="line"><span>房台</span><b>'+s(o.floor)+'楼 · '+s(o.room)+'</b></div>'+
    '<div class="line"><span>开台</span><span>'+date(o.startedAt)+'</span></div>'+
    '<div class="line"><span>结账</span><span>'+date(o.closedAt)+'</span></div>'+
    '<div class="line"><span>人数</span><span>'+Number(o.guests||0)+'</span></div>'+
    '<div class="sep"></div>'+
    '<div class="line"><span>房费/茶位/超时</span><b>'+amount(o.roomFee)+'</b></div>'+
    (items?items:'<div class="line"><span>无商品加单</span></div>')+
    '<div class="sep"></div>'+
    '<div class="line"><span>商品合计</span><b>'+amount(o.goodsFee)+'</b></div>'+
    '<div class="line"><span>系统应收</span><b>'+amount(o.due)+'</b></div>'+
    '<div class="line money"><span>实际收款</span><b>'+amount(o.actual)+'</b></div>'+
    '<div class="line"><span>支付方式</span><span>'+s(o.payment||'—')+'</span></div>'+
    (o.note?'<div>备注：'+htmlText(o.note)+'</div>':'')+
    '<div class="sep"></div><div class="footer">谢谢光临 · 有度茶舍</div>'+
    '<p class="instructions">若需打印，请点击下方按钮，并选择已安装的打印机。</p>'+
    '<button type="button" onclick="window.print()">打印这张小票</button>'+
    '</main></body></html>';
 }
 function print(order,trial=false){
  const markup=receipt(order,trial);
  if(window.YouduNative&&typeof window.YouduNative.printReceipt==='function'){
   try{
    window.YouduNative.printReceipt(markup);
    notify('已打开系统打印选择，打印失败可在订单详情补打');
    return true;
   }catch(e){
    notify('无法打开打印服务；可从历史订单重新打印');
    return false;
   }
  }
  // On iPhone, keep a visible print button: Safari requires an explicit user gesture.
  const w=window.open('','_blank');
  if(!w){notify('浏览器阻止弹窗，请允许打开小票页面');return false;}
  w.document.open();w.document.write(markup);w.document.close();
  return true;
 }
 function fromId(id){
  const o=data.orders.find(x=>x.id===id);
  if(!o){notify('未找到历史订单');return;}
  print(o);
 }
 const priorRoomBill=roomBill;
 roomBill=function(){
  const markup=priorRoomBill();
  const target='<div class="form-actions"><button type="submit" class="btn fill">确认收款 · 房间恢复空闲</button></div>';
  if(!markup.includes(target))return markup;
  return markup.replace(target,
   '<div class="form-actions yd-print-actions">'+
   '<button type="submit" data-yd-print="0" class="btn light">确认结账 · 不打印</button>'+
   '<button type="submit" data-yd-print="1" class="btn fill">确认结账并打印小票</button>'+
   '</div>');
 };
 const priorOrderDialog=orderDialog;
 orderDialog=function(){
  const markup=priorOrderDialog();
  const o=data.orders.find(x=>x.id===ui.modal?.id);
  if(!o)return markup;
  const button='<div class="form-actions yd-print-actions"><button type="button" class="btn light" data-action="yd-print-order" data-id="'+s(o.id)+'">补打小票</button></div>';
  const end=markup.lastIndexOf('</div>');
  return end<0?markup:markup.slice(0,end)+button+markup.slice(end);
 };
 // Retain the actual submitter even if native dialogs interrupt the event flow.
 document.addEventListener('submit',e=>{
  if(e.target.id==='checkoutForm')
   e.target.dataset.ydPrintWanted=e.submitter?.getAttribute('data-yd-print')==='1'?'1':'0';
 },true);
 const originalCheckout=checkout;
 checkout=function(form){
  const before=data.orders.length;
  const wanted=form.dataset.ydPrintWanted==='1';
  originalCheckout(form);
  if(data.orders.length===before+1 && wanted){
   const justSaved=data.orders[data.orders.length-1];
   print(justSaved);
  }
 };
 document.addEventListener('click',e=>{
  const b=e.target.closest('[data-action="yd-print-order"]');
  if(!b)return;
  e.preventDefault();e.stopImmediatePropagation();
  fromId(b.dataset.id);
 },true);
 document.addEventListener('change',e=>{
  if(e.target?.id==='ydPrinterPaper'){
   paper=e.target.value==='80'?'80':'58';
   localStorage.setItem(PAPER_KEY,paper);
   notify('已保存小票纸宽 '+paper+'mm');
  }
 },true);
 const settings=settingsPage;
 settingsPage=function(){
  return settings()+'<section class="panel" style="margin-top:16px"><h3>小票打印</h3>'+
   '<p class="panel-sub">结账时可选择“不打印”或“结账并打印”。打印失败不会重做订单，可从历史订单补打。使用系统打印服务，USB小票机需先确认型号和兼容性。</p>'+
   '<div class="form-grid"><div class="field"><label for="ydPrinterPaper">热敏纸宽</label>'+
   '<select id="ydPrinterPaper"><option value="58"'+(paper==='58'?' selected':'')+'>58 mm</option>'+
   '<option value="80"'+(paper==='80'?' selected':'')+'>80 mm</option></select></div></div>'+
   '<div class="form-actions"><button type="button" class="btn light" data-action="yd-print-test">测试打印（不产生订单）</button></div></section>';
 };
 document.addEventListener('click',e=>{
  const b=e.target.closest('[data-action="yd-print-test"]');
  if(!b)return;
  e.preventDefault();e.stopImmediatePropagation();
  const now=new Date().toISOString();
  print({room:'测试房间',floor:2,startedAt:now,closedAt:now,guests:2,
   roomFee:100,goodsFee:20,due:120,actual:120,payment:'测试',
   note:'这是测试小票，不会产生营业订单。',items:[{name:'测试茶饮',label:'杯',qty:1,price:20}]},true);
 },true);
 const styles=document.createElement('style');
 styles.textContent='.yd-print-actions{display:flex;gap:12px;flex-wrap:wrap}.yd-print-actions button{flex:1 1 220px;min-height:48px}@media(max-width:600px){.yd-print-actions button{flex:1 1 100%}}';
 document.head.appendChild(styles);
 window.YouduReceiptV12={printOrder:fromId,buildReceipt:receipt,printTest:()=>document.querySelector('[data-action="yd-print-test"]')?.click()};
})();