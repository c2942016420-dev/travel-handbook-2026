'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ROOT=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const html=read('index.html');
const apple=read('iphone-viewer-v14.js');
const shared=read('sync-client-v12.js');
const getSet=(src,name)=>{
 const start=src.indexOf('const '+name+'=new Set(');
 assert(start>=0,name+' whitelist not found');
 const rest=src.slice(start);
 const match=rest.match(/^const [A-Z_]+=new Set\((\[[\s\S]*?\])\);/);
 assert(match,name+' whitelist unreadable');
 return vm.runInNewContext('new Set('+match[1]+')');
};
const allowApple=getSet(apple,'SAFE_ACTIONS');
const allowSync=getSet(shared,'ALLOW_VIEW');
for(const action of ['period','view-order','choose-floor','room-filter']){
 assert(allowApple.has(action),'iPhone must allow read-only '+action);
 assert(allowSync.has(action),'sync viewer must allow read-only '+action);
}
for(const action of ['add-to-cart','qty','new-product','new-stock','purchase','delete-room','renew']){
 assert(!allowApple.has(action),'iPhone may not edit via '+action);
 assert(!allowSync.has(action),'sync viewer may not edit via '+action);
}
for(const period of ['day','week','month'])
 assert(html.includes('data-action="period" data-period="'+period+'"'),
   'core HTML must contain period '+period+' button');
const match=html.match(/if\(a==='period'\)\{ui\.reportPeriod=b\.dataset\.period;render\(\);return;\}/);
assert(match,'core must handle report period with no write operation');
const documentEvents={};
let saves=0,notices=[],renders=0;
const oldSnapshot={version:3,
 rooms:[{id:'2-包一',floor:2,name:'包一'}],
 orders:[{id:'order-existing',actual:88,due:90,closedAt:'2026-10-23T08:00:00Z'}],
 inventory:[{id:'water',stock:25}],
 products:[{id:'tea',name:'茶'}],movements:[],sessions:{},rates:{}};
const stored=new Map([
 ['youdu_tea_house_v3',JSON.stringify(oldSnapshot)],
 ['youdu_tea_house_v3__sync_v10_mode',JSON.stringify({mode:'viewer',revision:17})],
 ['youdu_tea_house_v3__sync_v10_view_cache',JSON.stringify(oldSnapshot)]
]);
const localStorage={
 getItem:key=>stored.get(key)||null,
 setItem:(key,value)=>stored.set(key,String(value)),
 removeItem:key=>stored.delete(key)
};
const cloudStatus={textContent:''};
const banner={
 id:'',innerHTML:'',className:'',setAttribute(){},
 classList:{toggle(){}},
 querySelector(selector){
  if(selector==='#ydIphoneCloudStatus')return cloudStatus;
  if(selector==='[data-yd-iphone="connect"]'||selector==='[data-yd-iphone="login"]')
   return {hidden:false};
  return null;
 },
 addEventListener(){}
};
const document={
 head:{appendChild(){}},
 createElement(tag){return tag==='section'?banner:{textContent:''};},
 getElementById(id){return id==='offlineBar'?{insertAdjacentElement(){}}:null;},
 querySelector(){return null;},
 querySelectorAll(){return [];},
 addEventListener(name,fn,capture){
  (documentEvents[name]??=[]).push({fn,capture:!!capture});
 }
};
const ui={reportPeriod:'day',modal:null};
const ctx={
 document,localStorage,ui,data:JSON.parse(JSON.stringify(oldSnapshot)),
 KEY:'youdu_tea_house_v3',
 clone:x=>JSON.parse(JSON.stringify(x)),
 esc:x=>String(x),
 Date,JSON,Map,Set,Array,Object,String,Number,Math,
 crypto:{randomUUID:()=> '123e4567-e89b-12d3-a456-426614174002'},
 navigator:{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)',platform:'iPhone',maxTouchPoints:0,onLine:true},
 window:{
  YouduNative:undefined,addEventListener(){},
  YouduSharedSyncV12:null
 },
 setInterval(){},setTimeout(){return 1;},clearTimeout(){},
 inputDate:()=> '2026-10-23T08:00',
 settingsPage:()=>'<section/>',
 reportsPage:()=>'<div>数据只来自本设备。</div>',
 notify:msg=>notices.push(msg),
 alert:msg=>notices.push(msg),
 confirm:()=>true,
 render(){renders++;},save(){saves++;},
 fetch:async()=>{throw Error('regression test must not reach network');}
};
vm.createContext(ctx);
vm.runInContext(apple,ctx,{filename:'iphone-viewer-v14.js'});
vm.runInContext(shared,ctx,{filename:'sync-client-v12.js'});
assert.equal(ctx.window.YouduSharedSyncV12.getState().mode,'viewer');
const before=localStorage.getItem('youdu_tea_house_v3');
const originalCount=ctx.data.orders.length;
function performAction(action,period){
 const button={dataset:{action,period}};
 let prevented=false,stopped=false;
 const event={
  target:{closest(selector){
   if(selector==='[data-yd-sync-btn]')return null;
   if(selector==='[data-action]')return button;
   return null;
  }},
  preventDefault(){prevented=true;},
  stopImmediatePropagation(){stopped=true;}
 };
 // Browser: capture listeners on document run before the main UI bubble handler.
 for(const {fn} of documentEvents.click||[]){
  fn(event);
  if(stopped)break;
 }
 if(!prevented){
  vm.runInContext('(()=>{const a='+JSON.stringify(action)+';const b={dataset:{period:'+JSON.stringify(period)+'}};'+match[0]+'})()',ctx);
 }
 return {prevented,stopped};
}
for(const period of ['day','week','month']){
 const event=performAction('period',period);
 assert.equal(event.prevented,false,period+' report button must not show insufficient-permissions');
 assert.equal(ui.reportPeriod,period,period+' report data range should change');
 assert.equal(ctx.data.orders.length,originalCount,'report switching must not edit orders');
}
assert.equal(saves,0,'report switching must not write local ledger');
assert.equal(localStorage.getItem('youdu_tea_house_v3'),before,
 'report switching must not overwrite prior phone records');
assert.equal(performAction('new-product','').prevented,true,'iPhone cannot create products');
assert.equal(performAction('add-to-cart','').prevented,true,'iPhone cannot create orders');
assert.equal(performAction('qty','').prevented,true,'iPhone cannot change sale');
assert.equal(performAction('purchase','').prevented,true,'iPhone cannot add stock');
const submit={prevented:false,stopped:false,
 preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},
 target:{id:'checkoutForm'}};
for(const {fn} of documentEvents.submit||[]){
 fn(submit);
 if(submit.stopped)break;
}
assert.equal(submit.prevented,true,'iPhone checkout remains forbidden');
assert.equal(localStorage.getItem('youdu_tea_house_v3'),before,'checkout block must not mutate the ledger');
console.log('PASS iPhone V14.2: day, week, month report changes pass BOTH real capture guards');
console.log('PASS iPhone V14.2: no local writes, order/account/product mutations remain blocked');
console.log('V14_2_REPORT_READONLY_REGRESSION_OK');
