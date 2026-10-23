/* 有度茶舍 V14.1 修复结账传参并保留可选小票打印：打印可选；不打印不影响结账；
 * 订单唯一落账后才能打印；失败可从订单详情补打。
 * 打印调用系统 PrintManager / 浏览器打印，不承诺未知 USB 机型兼容。
 */
(function(){
 'use strict';
 const PAPER_KEY='youdu_receipt_paper_v12';
 let paper=localStorage.getItem(PAPER_KEY)==='80'?'80':'58';
 const native=window.YouduNative;
 const supportsDriver=!!(native&&typeof native.printerInfo==='function');
 let printerMessage='打印机尚未实测；连接检测通过也不代表已出纸';
 let printerDevices=null;
 const escapeHtml=x=>esc(String(x??''));
 function nativeCall(method,...args){
  if(!supportsDriver)throw Error('此设备尚未安装 V14.1 华为离线版，无法直连打印机');
  const result=native[method](...args);
  return JSON.parse(result||'{"ok":false,"message":"无返回数据"}');
 }
 function info(){
  if(!supportsDriver)return null;
  try{
   const result=nativeCall('printerInfo');
   if(result.ok)printerDevices=result;
   return printerDevices;
  }catch(e){printerMessage='读取打印机失败：'+String(e.message||e);return printerDevices;}
 }
 function selectedMode(){
  const x=info();
  return x?.mode||'system';
 }
 const s=x=>esc(String(x??''));
 const amount=x=>money(Number(x)||0);
 const htmlText=x=>s(x).replace(/\r?\n/g,'<br>');
 function receipt(order,trial=false,duplicate=false){
  const o=order;
  const originalGoods=(o.items||[]).reduce((n,i)=>n+Number(i.originalPrice??i.price??0)*Number(i.qty||0),0);
  const items=(o.items||[]).map(i=>{
   const original=Number(i.originalPrice??i.price??0),price=Number(i.price||0),qty=Number(i.qty||0);
   const detail=Math.abs(original-price)>0.000001?
    '<div class="line"><span>原单价 '+amount(original)+' → 本单单价 '+amount(price)+'</span></div>'+
    '<div class="line"><span>本项改价</span><b>'+amount((price-original)*qty)+'</b></div>':'';
   return '<div class="line"><span>'+s(i.name)+' '+s(i.label)+' × '+qty+(i.temporary?'（临时商品）':'')+'</span><b>'+amount(price*qty)+'</b></div>'+detail;
  }).join('');
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
    '<h1>有度茶舍</h1><p class="minor">营业小票'+
    (trial?' · 测试打印（无真实订单）':duplicate?' · 【补打】 REPRINT':'')+'</p>'+
    '<div class="line"><span>房台</span><b>'+s(o.floor)+'楼 · '+s(o.room)+'</b></div>'+
    '<div class="line"><span>开台</span><span>'+date(o.startedAt)+'</span></div>'+
    '<div class="line"><span>结账</span><span>'+date(o.closedAt)+'</span></div>'+
    '<div class="line"><span>人数</span><span>'+Number(o.guests||0)+'</span></div>'+
    '<div class="sep"></div>'+
    '<div class="line"><span>房费/茶位/超时</span><b>'+amount(o.roomFee)+'</b></div>'+
    (items?items:'<div class="line"><span>无商品加单</span></div>')+
    '<div class="sep"></div>'+
    '<div class="line"><span>商品合计</span><b>'+amount(o.goodsFee)+'</b></div>'+
    '<div class="line"><span>原价应收</span><b>'+amount(o.originalDue??(Number(o.roomFee||0)+originalGoods))+'</b></div>'+
    '<div class="line"><span>商品改价调整</span><b>'+amount(o.goodsAdjustment??(Number(o.goodsFee||0)-originalGoods))+'</b></div>'+
    '<div class="line"><span>系统应收</span><b>'+amount(o.due)+'</b></div>'+
    '<div class="line money"><span>实际收款</span><b>'+amount(o.actual)+'</b></div>'+
    '<div class="line"><span>结账差额</span><b>'+amount(Number(o.actual||0)-Number(o.due||0))+'</b></div>'+
    '<div class="line"><span>支付方式</span><span>'+s(o.payment||'—')+'</span></div>'+
    (o.note?'<div>备注：'+htmlText(o.note)+'</div>':'')+
    '<div class="sep"></div><div class="footer">谢谢光临 · 有度茶舍</div>'+
    '<p class="instructions">若需打印，请点击下方按钮，并选择已安装的打印机。</p>'+
    '<button type="button" onclick="window.print()">打印这张小票</button>'+
    '</main></body></html>';
 }
 function print(order,trial=false,duplicate=false){
  const markup=receipt(order,trial,duplicate);
  if(native&&typeof native.printReceipt==='function'){
   try{
    if(supportsDriver&&selectedMode()!=='system'){
     native.printerPrint(JSON.stringify(order),!!duplicate,!!trial);
     notify('正在发送小票数据，请查看打印结果；失败可在订单详情补打');
    }else{
     native.printReceipt(markup);
     notify('已打开系统打印选项；请选择系统已安装的打印机');
    }
    return true;
   }catch(e){
    notify('打印调用失败，但订单已经保存；可在订单详情补打');
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
  print(o,false,true);
 }
 const priorRoomBill=roomBill;
 roomBill=function(s){
  // The original roomBill requires its active-session argument for fee(s).
  // Losing s crashed the bill tab on Huawei and on iPhone, preventing checkout.
  const markup=priorRoomBill(s);
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

 const priorSettings=settingsPage;
 function opts(list,selected,withPlaceholder){
  let out=withPlaceholder?'<option value="">— 选择检测到的设备 —</option>':'';
  return out+(list||[]).map(item=>
   '<option value="'+escapeHtml(item.id)+'"'+(item.id===selected?' selected':'')+'>'+
    escapeHtml(item.label)+(item.permission===false?'（未授权）':'')+'</option>'
  ).join('');
 }
 function printerPanel(){
  const i=info();
  const current=i?.mode||'system';
  const id=i?.device||'';
  const usbList=i?.usb||[];
  const btList=i?.bluetooth||[];
  const missingBt=!!i&&!i.bluetoothPermission;
  return '<section class="panel yd-printer-panel" style="margin-top:16px">'+
   '<h3>打印机管理</h3>'+
   '<p class="panel-sub">结账可打印或不打印，历史订单可补打。可连接支持 ESC/POS 的 USB OTG、已配对蓝牙（经典 SPP）及局域网 TCP 小票机。必须测试实际出纸后再用于营业。</p>'+
   '<div class="form-grid">'+
   '<div class="field"><label for="ydPrinterMode">打印方式</label><select id="ydPrinterMode">'+
   '<option value="system"'+(current==='system'?' selected':'')+'>系统打印（默认）</option>'+
   '<option value="usb"'+(current==='usb'?' selected':'')+'>USB · OTG</option>'+
   '<option value="lan"'+(current==='lan'?' selected':'')+'>局域网 · TCP</option>'+
   '<option value="bluetooth"'+(current==='bluetooth'?' selected':'')+'>蓝牙 · 已配对设备</option>'+
   '</select></div>'+
   '<div class="field"><label for="ydPrinterPaper">小票纸宽</label><select id="ydPrinterPaper">'+
   '<option value="58"'+(paper==='58'?' selected':'')+'>58 mm</option>'+
   '<option value="80"'+(paper==='80'?' selected':'')+'>80 mm</option></select></div>'+
   '<div class="field yd-printer-field" data-mode-only="usb"'+(current!=='usb'?' hidden':'')+'><label for="ydUsbPrinter">USB 设备</label>'+
   '<select id="ydUsbPrinter">'+opts(usbList,id,true)+'</select>'+
   '<small>需 OTG 数据线；Type-C 扩展坞能否同时供电须实机确认</small></div>'+
   '<div class="field yd-printer-field" data-mode-only="bluetooth"'+(current!=='bluetooth'?' hidden':'')+'><label for="ydBtPrinter">蓝牙设备</label>'+
   '<select id="ydBtPrinter">'+opts(btList,id,true)+'</select>'+
   '<small>'+(missingBt?'需要允许「附近设备」权限。':'请先到平板系统蓝牙设置中配对小票机。')+'</small></div>'+
   '<div class="field yd-printer-field" data-mode-only="lan"'+(current!=='lan'?' hidden':'')+'><label for="ydPrinterIp">店内打印机 IP</label>'+
   '<input id="ydPrinterIp" inputmode="decimal" placeholder="192.168.1.50" value="'+escapeHtml(i?.host||'')+'"></div>'+
   '<div class="field yd-printer-field" data-mode-only="lan"'+(current!=='lan'?' hidden':'')+'><label for="ydPrinterPort">端口号</label>'+
   '<input id="ydPrinterPort" type="number" min="1" max="65535" value="'+Number(i?.port||9100)+'"></div>'+
   '</div>'+
   '<div class="form-actions yd-print-actions">'+
   '<button type="button" class="btn light" data-action="yd-printer-refresh">刷新设备列表</button>'+
   '<button type="button" class="btn light yd-printer-field" data-mode-only="usb"'+(current!=='usb'?' hidden':'')+' data-action="yd-printer-permission">USB 授权</button>'+
   '<button type="button" class="btn light yd-printer-field" data-mode-only="bluetooth"'+(current!=='bluetooth'?' hidden':'')+' data-action="yd-printer-bt-permission">蓝牙权限</button>'+
   '<button type="button" class="btn" data-action="yd-printer-save">保存打印机设置</button>'+
   '<button type="button" class="btn light" data-action="yd-printer-probe">检测连接</button>'+
   '<button type="button" class="btn" data-action="yd-print-test">测试打印</button></div>'+
   '<p id="ydPrinterState" class="panel-sub" aria-live="polite">'+escapeHtml(printerMessage)+'</p>'+
   '<p class="panel-sub">连接检测只能说明端口可访问；测试显示「数据已发送」也无法代替肉眼确认出纸。打印失败不会重复收款，订单可从营业订单详情补打，补打小票会标记【补打】。</p>'+
   (supportsDriver?'':'<p class="panel-sub">当前是 iPhone／网页版。请在华为 V14.1 离线 APP 中管理实体打印机；此处可使用系统打印。</p>')+
   '</section>';
 }
 settingsPage=function(){return priorSettings()+printerPanel();};
 function field(id){return document.getElementById(id);}
 function drawPrinterState(){
  const s=field('ydPrinterState');if(s)s.textContent=printerMessage;
 }
 function setPrinterMode(mode){
  document.querySelectorAll('[data-mode-only]').forEach(x=>{
   x.hidden=x.getAttribute('data-mode-only')!==mode;
  });
 }
 function updateSelection(){
  const mode=field('ydPrinterMode')?.value||'system';
  const device=mode==='usb'?field('ydUsbPrinter')?.value||'':
   mode==='bluetooth'?field('ydBtPrinter')?.value||'':'';
  const host=field('ydPrinterIp')?.value?.trim()||'';
  const port=Number(field('ydPrinterPort')?.value||9100);
  const newPaper=Number(field('ydPrinterPaper')?.value||paper);
  if(!supportsDriver){
   if(mode!=='system')throw Error('请先在华为平板安装 V13 离线版');
   localStorage.setItem(PAPER_KEY,String(newPaper));paper=String(newPaper);
   return {ok:true,message:'已使用系统打印模式'};
  }
  const result=nativeCall('printerSelect',mode,device,host,port,newPaper);
  if(result.ok){
   paper=String(newPaper);localStorage.setItem(PAPER_KEY,paper);
   printerDevices=null;info();
  }
  return result;
 }
 window.addEventListener('youdu-printer',e=>{
  const d=e.detail||{};
  if(!['probe','test','print','permission'].includes(d.event))return;
  printerMessage=d.message||'打印状态未确定';
  if(d.event==='print'&&d.ok)notify('打印数据已发送，请检查小票机是否出纸');
  if(d.event==='print'&&!d.ok)notify('打印未成功，已结订单保留在历史订单，可补打');
  if(d.event==='test')notify(d.ok?'测试数据已发送，请确认是否出纸':'测试打印失败，请检查连接');
  printerDevices=null;
  if(ui.view==='settings')render();
  else drawPrinterState();
 });
 document.addEventListener('change',e=>{
  if(e.target?.id==='ydPrinterMode'){
   setPrinterMode(e.target.value);
   printerMessage='打印方式已切换，请保存设置后检测连接';
   drawPrinterState();
  }
  if(e.target?.id==='ydPrinterPaper'){
   paper=e.target.value==='80'?'80':'58';
   localStorage.setItem(PAPER_KEY,paper);
   printerMessage='纸宽设为 '+paper+'mm。请保存并测试打印。';
   drawPrinterState();
  }
 },true);
 document.addEventListener('click',e=>{
  const b=e.target.closest('[data-action]');
  if(!b)return;
  const action=b.dataset.action;
  if(!['yd-printer-refresh','yd-printer-permission','yd-printer-bt-permission',
       'yd-printer-save','yd-printer-probe','yd-print-test'].includes(action))return;
  e.preventDefault();e.stopImmediatePropagation();
  try{
   if(action==='yd-printer-refresh'){
    printerDevices=null;info();printerMessage='已刷新检测到的设备列表';render();
   }else if(action==='yd-printer-permission'){
    const id=field('ydUsbPrinter')?.value||'';
    if(!id)throw Error('请先选择 USB 设备，或检查 OTG 数据线');
    const r=nativeCall('printerUsbPermission',id);
    printerMessage=r.message;drawPrinterState();
   }else if(action==='yd-printer-bt-permission'){
    const r=nativeCall('printerBluetoothPermission');
    printerMessage=r.message;drawPrinterState();
   }else if(action==='yd-printer-save'){
    const r=updateSelection();printerMessage=r.message;render();
   }else if(action==='yd-printer-probe'){
    if(!supportsDriver)throw Error('请在华为平板使用原生 APP 进行连接检测');
    native.printerProbe();printerMessage='正在检测端口连接…';drawPrinterState();
   }else if(action==='yd-print-test'){
    const now=new Date().toISOString();
    const sample={room:'测试房间',floor:2,startedAt:now,closedAt:now,guests:2,
      roomFee:100,goodsFee:20,due:120,actual:120,payment:'测试',
      note:'这是测试小票，不会产生营业订单。',
      items:[{name:'测试茶饮',label:'杯',qty:1,price:20}]};
    print(sample,true,false);
   }
  }catch(err){printerMessage=String(err.message||'操作失败');drawPrinterState();notify(printerMessage);}
 },true);
 const styles=document.createElement('style');
 styles.textContent='.yd-print-actions{display:flex;gap:12px;flex-wrap:wrap}.yd-print-actions button{flex:1 1 220px;min-height:48px}@media(max-width:600px){.yd-print-actions button{flex:1 1 100%}}';
 document.head.appendChild(styles);
 window.YouduReceiptV13={
  printOrder:fromId,buildReceipt:receipt,printerInfo:info,
  printTest:()=>document.querySelector('[data-action="yd-print-test"]')?.click()
 };
})();
