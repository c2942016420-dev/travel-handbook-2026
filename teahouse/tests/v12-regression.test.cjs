'use strict';
/* V12 regression checks: local/remote ownership safety, iPhone auto viewer,
 * offline mutation then upload, optional print / one and only one paid order.
 * These are deterministic browser-logic simulations, not physical-device tests.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ROOT=path.resolve(__dirname,'..');
const clone=x=>JSON.parse(JSON.stringify(x));
const seed=()=>({version:3,rooms:[{id:'2-1',floor:2,name:'包一'}],products:[],inventory:[],
  movements:[],sessions:{},orders:[],rates:{}});
const remote={revision:6,ownerDevice:'123e4567-e89b-12d3-a456-426614174000',
  updatedAt:'2026-10-23T07:22:06Z',snapshot:seed()};
const network=async(url,opts={})=>{
 if(url!=='/api/sync'&&url!=='/api/backup')throw Error('unexpected endpoint '+url);
 const p=JSON.parse(opts.body||'{}');
 if(url==='/api/backup')return {ok:true,json:async()=>({ok:true,savedAt:new Date().toISOString()})};
 let body={ok:true,initialized:true,revision:remote.revision,
  ownerDevice:remote.ownerDevice,updatedAt:remote.updatedAt};
 if(p.op==='read')body.snapshot=clone(remote.snapshot);
 if(p.op==='claim'){
  if(p.expectedRevision!==remote.revision)body={ok:false,code:'CONFLICT'};
  else{remote.ownerDevice=p.deviceId;body.revision=++remote.revision;}
 }
 if(p.op==='put'){
  if(remote.ownerDevice!==p.deviceId)body={ok:false,code:'READ_ONLY'};
  else if(p.expectedRevision!==remote.revision)body={ok:false,code:'CONFLICT'};
  else{remote.snapshot=clone(p.snapshot);body.revision=++remote.revision;}
 }
 if(p.op==='init')body={ok:false,code:'ALREADY_INITIALIZED'};
 return {ok:body.ok,status:body.ok?200:409,json:async()=>body};
};
function harness({iphone=false,deviceId='',ledger=seed(),native=false}={}){
 const storage=new Map([['youdu_tea_house_v3',JSON.stringify(ledger)]]);
 if(deviceId)storage.set('youdu_tea_house_v3__device_id',deviceId);
 const handlers={},timers=[],winhandlers={};
 const doc={
  head:{appendChild(){}},
  createElement(){return {textContent:''};},
  getElementById(){return null;},
  querySelector(){return null;},
  querySelectorAll(){return [];},
  addEventListener(k,fn){(handlers[k]??=[]).push(fn);}
 };
 const localStorage={
  getItem:k=>storage.has(k)?storage.get(k):null,
  setItem:(k,v)=>storage.set(k,String(v)),
  removeItem:k=>storage.delete(k)
 };
 const context={
  document:doc,localStorage,
  navigator:{userAgent:iphone?'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5) AppleWebKit/605.1.15':'Mozilla/5.0 (Linux; Android 10; HUAWEI AGS3)',
   platform:iphone?'iPhone':'Linux armv8',maxTouchPoints:0,onLine:true},
  window:{YouduNative:native?{appVersion(){return '12';},printReceipt(){}}:undefined,
   addEventListener(k,fn){(winhandlers[k]??=[]).push(fn);}},
  data:clone(ledger),
  ui:{modal:null},
  KEY:'youdu_tea_house_v3',clone,
  crypto:{randomUUID:()=>native?'123e4567-e89b-12d3-a456-426614174001':'123e4567-e89b-12d3-a456-426614174002'},
  fetch:network,
  Date,JSON,Math,Number,Object,Array,Map,Set,String,
  settingsPage:()=>'<section/>',reportsPage:()=>'<div>数据只来自本设备。</div>',
  render(){},save(){localStorage.setItem('youdu_tea_house_v3',JSON.stringify(context.data));},
  notify(){},confirm:()=>true,alert(){},
  esc:s=>String(s),inputDate:()=> '2026-10-23T07:22',
  setTimeout(fn){timers.push(fn);return timers.length;},
  clearTimeout(){},
  setInterval(){},
  console
 };
 vm.createContext(context);
 vm.runInContext(fs.readFileSync(path.join(ROOT,'sync-client-v12.js'),'utf8'),
  context,{filename:'sync-client-v12.js'});
 const flush=async()=>{await new Promise(resolve=>setImmediate(resolve));};
 const drain=async()=>{let n=0;while(timers.length&&n++<12){const fn=timers.shift();fn();await flush();}};
 const click=async name=>{
  const btn={getAttribute:()=>name,dataset:{}};
  const e={target:{closest:s=>s==='[data-yd-sync-btn]'?btn:null},preventDefault(){},stopImmediatePropagation(){}};
  for(const fn of handlers.click||[])fn(e);
  await flush();
 };
 return {context,storage,timers,drain,click,flush};
}
async function main(){
 const oldPhone=seed();oldPhone.orders.push({id:'phone-older',due:99,actual:99});
 const phone=harness({iphone:true,ledger:oldPhone});
 assert.equal(phone.context.window.YouduSharedSyncV12.getState().mode,'local');
 await phone.drain();
 const state=phone.context.window.YouduSharedSyncV12.getState();
 assert.equal(state.mode,'viewer','iPhone must attach as cloud-only viewer without manual clicking');
 assert.equal(state.revision,remote.revision);
 assert.equal(state.orders,0);
 assert.deepEqual(JSON.parse(phone.storage.get('youdu_tea_house_v3')),oldPhone,
   'existing iPhone original local records must stay untouched');
 phone.context.data.orders.push({id:'never-persist',due:0,actual:0});
 phone.context.save();
 assert.deepEqual(JSON.parse(phone.storage.get('youdu_tea_house_v3')),oldPhone,
   'viewer save must not overwrite existing local ledger');
 const pad=harness({native:true,deviceId:'123e4567-e89b-12d3-a456-426614174001'});
 await pad.drain();
 assert.equal(pad.context.window.YouduSharedSyncV12.getState().mode,'local',
  'Huawei must not take over the cloud automatically');
 await pad.click('connect');
 assert.equal(pad.context.window.YouduSharedSyncV12.getState().mode,'viewer');
 await pad.click('claim');
 assert.equal(pad.context.window.YouduSharedSyncV12.getState().mode,'primary');
 assert.equal(remote.ownerDevice,'123e4567-e89b-12d3-a456-426614174001');
 pad.context.data.orders.push({id:'pad-sale',due:120,actual:100,room:'包一'});
 pad.context.save();
 await pad.drain();
 assert.equal(remote.snapshot.orders.length,1,'Huawei saves new order to cloud');
 assert.equal(pad.context.window.YouduSharedSyncV12.getState().dirty,false);
 await phone.context.window.YouduSharedSyncV12.refresh();
 assert.equal(phone.context.window.YouduSharedSyncV12.getState().orders,1,
  'iPhone viewer sees saved Huawei order after refresh');
 assert.deepEqual(JSON.parse(phone.storage.get('youdu_tea_house_v3')),oldPhone,
  'iPhone local records still not overwritten by cloud refresh');
 console.log('PASS shared ledger: Huawei claim -> save -> CAS upload -> iPhone read-only refresh');
 console.log('PASS original phone ledger preserved; phone cannot write shared records');
 // V15: an explicitly authorized opening inventory replaces the old trial ledger
 // on the SAME primary device, and price facts survive the next phone refresh.
 remote.snapshot.releaseId='youdu-v15-20261023';
 remote.snapshot.orders=[];
 remote.snapshot.inventory=[{id:'registered-test',name:'测试库存',unit:'瓶',stock:7,initialized:true,active:true}];
 remote.revision++;
 await pad.context.window.YouduSharedSyncV12.refresh();
 assert.equal(pad.context.data.releaseId,'youdu-v15-20261023');
 assert.equal(pad.context.data.orders.length,0);
 assert.equal(pad.context.data.inventory[0].stock,7);
 assert.equal(pad.context.window.YouduSharedSyncV12.getState().dirty,false);
 assert.equal(pad.context.window.YouduSharedSyncV12.getState().revision,remote.revision);
 pad.context.data.orders.push({id:'v15-priced-order',originalDue:58,goodsAdjustment:-28,due:30,actual:29,
  items:[{name:'测试茶饮',originalPrice:58,price:30,qty:1}]});
 pad.context.save();await pad.drain();
 await phone.context.window.YouduSharedSyncV12.refresh();
 assert.equal(phone.context.data.orders[0].items[0].originalPrice,58);
 assert.equal(phone.context.data.orders[0].items[0].price,30);
 assert.equal(phone.context.data.orders[0].actual,29);
 assert.equal(phone.context.data.inventory[0].stock,7);
 assert.equal(remote.ownerDevice,'123e4567-e89b-12d3-a456-426614174001');
 console.log('PASS V15 opening reset keeps the existing primary identity; iPhone receives prices, actuals and inventory');
 pad.context.data.expenseCategories=['买菜','水电','维修','交通费'];
 pad.context.data.expenses=[{id:'expense-v16-test',date:new Date().toISOString(),amount:20,category:'交通费',note:''}];
 pad.context.save();await pad.drain();
 await phone.context.window.YouduSharedSyncV12.refresh();
 assert.equal(phone.context.data.expenses[0].amount,20);
 assert.equal(phone.context.data.expenses[0].category,'交通费');
 assert(phone.context.data.expenseCategories.includes('交通费'));
 assert.deepEqual(JSON.parse(phone.storage.get('youdu_tea_house_v3')),oldPhone);
 console.log('PASS V16 custom expense categories and costs reach the read-only phone through the existing shared ledger');

 // Print functions use a reduced DOM. Confirm both buttons and print only after
 // a successful checkout, never for a canceled checkout.
 const clickHandlers=[],submitHandlers=[],nativePrints=[];
 const document={
   head:{appendChild(){}},
   createElement(){return {textContent:''};},
   addEventListener:(n,fn)=>{if(n==='click')clickHandlers.push(fn);if(n==='submit')submitHandlers.push(fn)},
   querySelector(){return null;}
 };
 const printContext={
  document,window:{YouduNative:{printReceipt:html=>nativePrints.push(html)}},
  data:{orders:[]},ui:{modal:{id:'order1'}},
  localStorage:{getItem:()=>null,setItem(){}},
  settingsPage:()=>'<section/>',
  roomBill:()=>'<div class="form-actions"><button type="submit" class="btn fill">确认收款 · 房间恢复空闲</button></div>',
  orderDialog:()=>'<div class="panel">订单详情</div>',
  checkout(form){
   if(form.noConfirm)return;
   printContext.data.orders.push({id:'order1',room:'包一',floor:2,startedAt:'2026-10-23T00:00:00Z',
    closedAt:'2026-10-23T01:00:00Z',guests:2,roomFee:100,goodsFee:20,due:120,actual:100,
    payment:'微信',items:[{name:'茶',label:'杯',qty:1,price:20}]});
  },
  esc:x=>String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;'),
  fmtDate:x=>String(x),money:x=>'¥'+x,notify(){},
  Number,String,Math,Date,JSON
 };
 vm.createContext(printContext);
 vm.runInContext(fs.readFileSync(path.join(ROOT,'receipt-client-v12.js'),'utf8'),
   printContext,{filename:'receipt-client-v12.js'});
 assert.match(printContext.roomBill(),/确认结账 · 不打印/);
 assert.match(printContext.roomBill(),/确认结账并打印小票/);
 printContext.data.orders.push({id:'order1'});
 assert.match(printContext.orderDialog(),/补打小票/);
 printContext.data.orders.pop();
 function record(wanted,noConfirm=false){
  const form={id:'checkoutForm',dataset:{},noConfirm};
  for(const fn of submitHandlers)fn({target:form,submitter:{getAttribute:()=>wanted?'1':'0'}});
  printContext.checkout(form);
 }
 record(false);assert.equal(nativePrints.length,0);
 record(true,true);assert.equal(nativePrints.length,0);
 record(true);assert.equal(nativePrints.length,1);
 assert.match(nativePrints[0],/有度茶舍/);
 assert.equal(printContext.data.orders.length,2,'printing must not create extra orders');
 console.log('PASS checkout: print / no print, abort without printing, history reprint button');
 console.log('V12_LOGIC_REGRESSION_SUCCESS');
}
main().catch(e=>{console.error(e);process.exitCode=1;});

