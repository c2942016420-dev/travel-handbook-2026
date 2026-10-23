'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../iphone-viewer-v14.js'),'utf8');

function fixture({ios=true,native=false}={}){
 const docEvents={},status={textContent:''},connect={hidden:false},login={hidden:false};
 let installed=false,prevented=0,stopped=0,lastToast='';
 const state={mode:'local',connected:false,issue:'',revision:0,orders:8,dirty:false};
 const banner={
  className:'',innerHTML:'',setAttribute(){},
  classList:{toggle(){}},
  querySelector(s){return s==='#ydIphoneCloudStatus'?status:
    s==='[data-yd-iphone="connect"]'?connect:
    s==='[data-yd-iphone="login"]'?login:null;},
  addEventListener(n,fn){this.handlers??={};this.handlers[n]=fn;}
 };
 const document={
  createElement(tag){return tag==='section'?banner:{textContent:''};},
  head:{appendChild(){}},
  getElementById(id){
   return id==='offlineBar'?{
     insertAdjacentElement(){installed=true;}
   }:null;
  },
  addEventListener(n,fn,cap){(docEvents[n]??=[]).push({fn,cap});}
 };
 const ctx={
  document,
  navigator:{userAgent:ios?'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) AppleWebKit/605.1.15':'Mozilla/5.0 (Android 10)',platform:ios?'iPhone':'Linux',maxTouchPoints:0,onLine:true},
  window:{
   YouduNative:native?{}:undefined,
   YouduSharedSyncV12:{getState:()=>state,viewer(){},refresh(){}},
   addEventListener(){}
  },
  setInterval(){},
  alert(msg){lastToast=msg;},
  notify(msg){lastToast=msg;}
 };
 vm.runInNewContext(source,ctx,{filename:'iphone-viewer-v14.js'});
 const fire=(kind,attr,value)=>{
  const target={closest(sel){
    if(sel==='[data-yd-sync-btn]'&&kind==='sync')return {getAttribute:()=>value};
    if(sel==='[data-action]'&&kind==='action')return {dataset:{action:value}};
    return null;
  }};
  const e={target,preventDefault(){prevented++;},stopImmediatePropagation(){stopped++;}};
  for(const item of docEvents[kind==='form'?'submit':'click']||[])item.fn(e);
  return e;
 };
 return {ctx,state,status,connect,login,installed,docEvents,fire,
  flags:()=>({prevented,stopped,lastToast})};
}
const iphone=fixture();
assert.equal(iphone.installed,true,'iPhone banner must appear');
assert.match(iphone.status.textContent,/尚未确认云端同步/);
iphone.fire('action','data-action','checkout');
assert.equal(iphone.flags().prevented,1);
assert.equal(iphone.flags().stopped,1);
iphone.fire('sync','data-yd-sync-btn','claim');
assert.equal(iphone.flags().prevented,2,'iPhone must never claim master');
iphone.fire('sync','data-yd-sync-btn','init');
assert.equal(iphone.flags().prevented,3,'iPhone must never initialize master');
iphone.fire('sync','data-yd-sync-btn','connect');
assert.equal(iphone.flags().prevented,3,'Connecting as viewer remains allowed');
iphone.fire('action','data-action','view-order');
assert.equal(iphone.flags().prevented,3,'Viewing an order remains allowed');
iphone.fire('form','submit','checkoutForm');
assert.equal(iphone.flags().prevented,4,'Any iPhone checkout form must be rejected');
const android=fixture({ios:false,native:true});
assert.equal(android.installed,false,'Huawei native app must not import iPhone guard');
console.log('PASS iPhone V14: stale local data indicated, checkout blocked, cloud viewer connection allowed, master claim blocked');
console.log('PASS Android V14: iPhone-only guard does not run on Huawei');
console.log('V14_IPHONE_VIEWER_REGRESSION_OK');
