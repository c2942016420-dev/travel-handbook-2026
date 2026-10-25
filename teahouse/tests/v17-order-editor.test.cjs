'use strict';
process.env.TZ='Asia/Shanghai';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(process.env.YOUDU_TEST_JS_MODULES?path.join(process.env.YOUDU_TEST_JS_MODULES,'jsdom'):'jsdom');
const ROOT=path.resolve(__dirname,'..'),KEY='youdu_tea_house_v3';
const nativeSource=fs.readFileSync(path.join(ROOT,'android-app/app/src/main/java/com/youdu/teahouse/MainActivity.java'),'utf8');
const nativeResources=new Map([...nativeSource.matchAll(/m\.put\("([^\"]+)",\s*"([^\"]+)"\)/g)].map(m=>[m[1],m[2]]));
const clone=x=>JSON.parse(JSON.stringify(x));
const rates={teaSeatFee:0,teaHours:4,teaDayHourly:25,teaNightHourly:40,teaNightStartHour:22};
const fixture={version:3,rooms:[{id:'2-test',name:'测试茶席',floor:2,group:'测试'}],sessions:{},orders:[],
 products:[{id:'g1',name:'永川秀芽',category:'绿茶',active:true,options:[{label:'杯',price:58,stockId:'stock-test',consume:1}]}],
 inventory:[{id:'stock-test',name:'测试库存',category:'测试',unit:'份',stock:100,avgCost:2,lastCost:2,initialized:true,active:true,min:0}],
 movements:[],rates,expenses:[{id:'existing-cost',date:new Date().toISOString(),category:'维修',amount:9}],expenseCategories:['买菜','水电','维修']};
function app({snapshot=fixture,native=true,mode='primary',iphone=false}={}){
 const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
 const dom=new JSDOM(html,{url:'https://youdu.test/',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,errors=[],confirmations=[],prints=[],exports=[];
 w.addEventListener('error',e=>{errors.push(e.error||e.message);e.preventDefault();});
 Object.defineProperty(w.navigator,'userAgent',{value:iphone?'iPhone':'Android tablet test'});
 Object.defineProperty(w.navigator,'platform',{value:iphone?'iPhone':'Linux'});
 Object.defineProperty(w.navigator,'onLine',{value:false});
 w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;
 w.scrollTo=()=>{};w.CSS={escape:x=>String(x)};w.setTimeout=()=>0;w.setInterval=()=>0;w.clearInterval=()=>{};w.alert=()=>{};
 w.confirm=message=>{confirmations.push(message);return true;};
 w.fetch=()=>{throw Error('A UI regression test must never contact a real ledger');};
 if(native)w.YouduNative={checkpoint(){},recoverCheckpoint:()=>'',appVersion:()=> '180',
  printerInfo:()=>JSON.stringify({ok:true,mode:'usb',width:58,device:'test',usb:[],bluetooth:[]}),
  printReceipt:markup=>prints.push({markup}),printerPrint:(json,reprint,trial)=>prints.push({order:JSON.parse(json),reprint,trial}),
  exportFile:(name,content,type)=>exports.push({name,content,type})};
 w.localStorage.setItem(KEY,JSON.stringify(snapshot));
 w.localStorage.setItem(KEY+'__sync_v10_mode',JSON.stringify({mode,revision:1}));
 const sources=[];
 for(const script of w.document.querySelectorAll('script')){
  const src=script.getAttribute('src');
  if(src){if(native&&src.includes('iphone-viewer'))continue;if(native)assert.equal(nativeResources.get(src.replace(/^\.\//,'')),'application/javascript','Android would return 403 for '+src);sources.push(fs.readFileSync(path.join(ROOT,src),'utf8'));}
  else if(!script.textContent.includes('navigator.serviceWorker.register'))sources.push(script.textContent);
 }
 if(native)sources.push(fs.readFileSync(path.join(ROOT,'android-app/tools/native-offline-v14_1.js'),'utf8'));
 w.eval(sources.join('\n;\n'));
 const $=selector=>w.document.querySelector(selector);
 const click=selector=>{const node=$(selector);assert(node,'Missing button '+selector);node.click();assert.deepEqual(errors,[]);};
 function edit(selector,value,change=true){const node=$(selector);assert(node,'Missing field '+selector);node.value=String(value);node.dispatchEvent(new w.Event('input',{bubbles:true}));if(change)node.dispatchEvent(new w.Event('change',{bubbles:true}));assert.deepEqual(errors,[]);return node;}
 function submit(selector,button){const form=$(selector);assert(form);form.dispatchEvent(new w.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:button?$(button):null}));assert.deepEqual(errors,[]);}
 const ledger=()=>JSON.parse(w.localStorage.getItem(KEY));
 return {dom,w,$,click,edit,submit,ledger,confirmations,prints,exports,errors};
}
const a=app();
assert.match(a.w.document.title,/V18 安卓版/);
assert.match(a.$('.top-state').textContent,/V18/);
a.click('[data-action="open-room"]');
a.edit('#startForm [name="memo"]','自查脚本测试，非真实营业');a.submit('#startForm');
a.click('[data-action="add-to-cart"][data-id="g1"][data-idx="0"]');
assert.equal(a.$('[data-v17-name]'),null,'Existing product names remain unchanged');
assert(a.$('[data-v15-price="0"]'),'Ordering page must have a visible unit-price input');
assert(a.$('[data-v17-amount="0"]'),'Ordering page must have a visible line-amount input');
const firstPrice=a.edit('[data-v15-price="0"]','30',false);
firstPrice.dispatchEvent(new a.w.FocusEvent('focusout',{bubbles:true}));
let line=a.ledger().sessions['2-test'].items[0];
assert.equal(line.name,'永川秀芽');assert.equal(line.price,30);assert.equal(line.originalPrice,58);
assert.equal(a.ledger().products[0].name,'永川秀芽');assert.equal(a.ledger().products[0].options[0].price,58);
assert.equal(a.ledger().inventory[0].stock,100,'Editing cannot deduct inventory before checkout');
assert(a.$('#ydV17ProductForm'),'A new product can be added on the ordering page');
a.edit('#ydV17NewName','自查新增点心 <&>');a.edit('#ydV17NewPrice','12');a.edit('#ydV17NewQty','2');a.edit('#ydV17NewCategory','小食');a.submit('#ydV17ProductForm');
assert.equal(a.ledger().products.length,2);assert.equal(a.ledger().products[1].name,'自查新增点心 <&>');
assert.equal(a.ledger().products[1].options[0].price,12);assert.equal(a.ledger().products[1].active,true);
assert.equal(a.ledger().sessions['2-test'].items[1].productId,a.ledger().products[1].id);assert.equal(a.ledger().sessions['2-test'].items[1].temporary,undefined);
assert(a.$('[data-action="add-to-cart"][data-id="'+a.ledger().products[1].id+'"]'),'The saved product must immediately be selectable from the menu');
console.log('PASS V17 full production script chain: ordering UI changes amounts and adds a permanent menu product without changing existing names or menu prices');

a.click('[data-action="room-tab"][data-tab="bill"]');
assert(a.$('#dialog').textContent.includes('永川秀芽'));assert.equal(a.$('[data-v17-name]'),null);
assert.equal(a.$('[data-v17-amount="0"]').value,'30');
assert.match(a.$('#dialog').textContent,/已点商品明细/);assert.match(a.$('#dialog').textContent,/原单价 ¥58/);
a.edit('#actualReceived','25');a.edit('#ydV17Payment','现金');a.edit('#ydV17CheckoutNote','测试备注保留');
const sameForm=a.$('#checkoutForm');
a.edit('[data-v17-amount="0"]','28');
assert.equal(a.$('#checkoutForm'),sameForm,'Editing a line must not replace a checkout form or swallow its submit click');
assert.equal(a.$('#actualReceived').value,'25');assert.equal(a.$('#ydV17Payment').value,'现金');assert.equal(a.$('#ydV17CheckoutNote').value,'测试备注保留');
assert.equal(a.$('#billDue').textContent,'¥52');assert.equal(a.$('#ydV15ActualPreview').textContent,'¥25');assert.equal(a.$('#ydV15DifferencePreview').textContent,'¥-27');
// New names and prices can also be entered here and become permanent menu entries.
a.edit('#ydV17NewName','自查新增饮品');a.edit('#ydV17NewPrice','5');a.submit('#ydV17ProductForm');
assert.equal(a.ledger().products.length,3);assert.equal(a.ledger().sessions['2-test'].items.length,3);
assert.equal(a.$('#actualReceived').value,'25');assert.equal(a.$('#ydV17Payment').value,'现金');assert.equal(a.$('#ydV17CheckoutNote').value,'测试备注保留');
a.click('[data-action="qty"][data-delta="1"]');
assert.equal(a.$('#actualReceived').value,'25','A quantity re-render must retain the actual amount');
assert.equal(a.$('#ydV17Payment').value,'现金');assert.equal(a.$('#ydV17CheckoutNote').value,'测试备注保留');
a.click('[data-action="qty"][data-delta="1"]');a.edit('[data-v17-amount="0"]','10');
assert.equal(a.$('#billDue').textContent,'¥39','Three units may be set to a total of ¥10 without cent drift; all other products remain in the bill');
assert.equal(a.$('[data-v17-amount="0"]').value,'10');assert(a.$('[data-v15-price="0"]').checkValidity());
a.edit('#actualReceived','9');
const beforeInvalid=JSON.stringify(a.ledger());a.edit('[data-v17-amount="0"]','');
a.submit('#checkoutForm','[data-yd-print="0"]');assert.equal(JSON.stringify(a.ledger()),beforeInvalid,'An empty item amount must block settlement');
a.edit('[data-v17-amount="0"]','10');
// The last field can still be focused: settlement must flush its unblurred edit.
a.edit('[data-v17-amount="0"]','12',false);
a.submit('#checkoutForm','[data-yd-print="1"]');
const record=a.ledger().orders[0];
assert.equal(record.items[0].name,'永川秀芽');assert.equal(record.items.length,3);
assert.equal(record.items[0].originalPrice,58);assert.equal(record.items[0].qty,3);assert.equal(record.goodsFee,41);
assert.equal(record.originalDue,203);assert.equal(record.goodsAdjustment,-162);assert.equal(record.due,41);assert.equal(record.actual,9);assert.equal(record.difference,-32);
assert.equal(record.payment,'现金');assert.equal(record.note,'测试备注保留');
assert.equal(a.ledger().inventory[0].stock,97);assert.equal(a.ledger().movements.length,1);assert.equal(a.ledger().expenses[0].amount,9);
assert.equal(a.ledger().orders.length,1);assert.equal(a.ledger().sessions['2-test'],undefined);
for(const text of ['已点商品','永川秀芽','自查新增点心 <&>','自查新增饮品','原单价 ¥58','系统应收：¥41','实际收款：¥9','实收差额：¥-32'])assert(a.confirmations.at(-1).includes(text),text);
assert.equal(a.prints.length,1);assert.equal(a.prints[0].order.items[0].originalName,'永川秀芽');
const receipt=a.w.YouduReceiptV13.buildReceipt(record);
for(const text of ['自查新增点心 &lt;&amp;&gt;','自查新增饮品','原单价 ¥58','本单单价 ¥4','实际收款','结账差额'])assert(receipt.includes(text),text);
a.w.exportCSV('orders');assert(a.exports.at(-1).content.includes('自查新增点心 <&>'));assert(a.exports.at(-1).content.includes('原单价:58'));assert(a.exports.at(-1).content.includes('本项金额:12'));
a.click('[data-action="view-order"]');for(const text of ['永川秀芽','自查新增点心 <&>','自查新增饮品'])assert(a.$('#dialog').textContent.includes(text));
assert.deepEqual(a.errors,[]);console.log('PASS V17 final UI: line edits, unblurred amount, actual/payment/note retention, final itemized confirmation, one settlement and matching receipt/CSV');

const synced=clone(a.ledger());synced.sessions['2-test']={id:'viewer-fixture',roomId:'2-test',mode:'tea',guests:2,startedAt:new Date().toISOString(),rates,items:clone(record.items)};
for(const options of [{native:true,mode:'viewer'},{native:false,mode:'viewer',iphone:true},{native:true,mode:'local'}]){
 const v=app({snapshot:synced,...options});v.click('[data-action="open-room"]');v.click('[data-action="room-tab"][data-tab="bill"]');
 assert(v.$('#dialog').textContent.includes('自查新增点心 <&>'));assert(v.$('#dialog').textContent.includes('永川秀芽'));
 assert.equal(v.$('[data-v17-name]'),null);assert.equal(v.$('[data-v15-price]'),null);assert.equal(v.$('[data-v17-amount]'),null);
 assert.equal(v.$('#ydV17ProductForm'),null);assert.equal(v.ledger().products[1].name,'自查新增点心 <&>');
 const original=JSON.stringify(v.ledger());v.w.YouduV15.changePrice(0,'1');v.w.YouduV15.changeAmount(0,'2');v.w.YouduV15.addMenuProduct({elements:{}});
 assert.equal(JSON.stringify(v.ledger()),original);assert.deepEqual(v.errors,[]);v.dom.window.close();
}
console.log('PASS V17 sync snapshot and read rights: iPhone/viewer/unclaimed native see final item facts and cannot edit; bill tab remains navigable');
a.dom.window.close();
