'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ROOT=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const receipt=fs.readFileSync(path.join(ROOT,'receipt-client-v14_1.js'),'utf8');
function extract(start,end){
 const a=html.indexOf(start);
 const b=html.indexOf(end,a+start.length);
 assert(a>=0&&b>a,'Core production function '+start+' must exist');
 return html.slice(a,b);
}
const docListeners={};
const receiptOutput=[],notices=[];
let changed=0,saved=0,mayConfirm=true;
const roomId='2-包一';
const rates={gamePrice:100,gameHours:4,renewPrice:100,renewHours:4,overHourly:25,
 nightHourly:40,teaSeatFee:0,teaHours:4,teaDayHourly:25,teaNightHourly:40,teaNightStartHour:22};
const session=(start)=>({id:'order-test-'+Date.now(),roomId,mode:'tea',
 guests:2,startedAt:start||new Date(Date.now()-60*60*1000).toISOString(),renewals:0,
 memo:'',rates:{...rates},items:[]});
const original=session();
const data={version:3,rooms:[{id:roomId,name:'包一',floor:2,group:'包间'}],
 sessions:{[roomId]:original},orders:[],inventory:[],movements:[],rates:{...rates}};
const ctx={
 Date,JSON,Number,Math,Map,Set,String,Object,Array,
 data,ui:{modal:{type:'room',id:roomId},view:'rooms'},
 DEFAULT_RATES:rates,
 hrs:ms=>ms>0?Math.ceil(ms/3600000):0,
 money:n=>'¥'+(+n||0).toFixed(2),
 num:n=>Math.round((Number(n)||0)*100)/100,
 esc:s=>String(s??'').replace(/[&<>"']/g,''),
 clone:x=>JSON.parse(JSON.stringify(x)),
 rid:()=>Math.random().toString(36).slice(2),
 fmtDate:x=>String(x),
 findRoom:id=>data.rooms.find(x=>x.id===id),
 activeRoom:r=>data.sessions[r.id],
 findStock:id=>data.inventory.find(x=>x.id===id),
 notify:msg=>notices.push(msg),
 save(){saved++;},closeDialog(){ctx.ui.modal=null;},
 render(){changed++;},settingsPage:()=>'<section/>',
 orderDialog:()=>'<div class="panel">记录</div>',
 document:{
  getElementById(){return null;},
  head:{appendChild(){}},
  createElement(){return {textContent:''};},
  querySelector(){return null;},querySelectorAll(){return [];},
  addEventListener(name,fn){(docListeners[name]??=[]).push(fn);}
 },
 localStorage:{getItem:()=>null,setItem(){}},
 window:{
  YouduNative:{
   printerInfo:()=>JSON.stringify({ok:true,mode:'usb',width:58,device:'usb-test',
    usb:[{id:'usb-test',label:'USB test',permission:true}],bluetooth:[],
    bluetoothPermission:true,host:'',port:9100}),
   printReceipt:()=>{throw Error('wrong backend')},
   printerPrint:(json,reprint,trial)=>receiptOutput.push({order:JSON.parse(json),reprint,trial})
  },
  addEventListener(){},
  confirm:()=>mayConfirm
 },
};
vm.createContext(ctx);
vm.runInContext(extract('function fee(', 'function roomStatus('),ctx);
vm.runInContext(extract('function roomBill(', 'function roomTime('),ctx);
vm.runInContext(extract('function checkout(', 'function productSave('),ctx);
vm.runInContext(receipt,ctx,{filename:'receipt-client-v14_1.js'});
// This is the REGRESSION missing from V13/V14: roomBill MUST forward session.
// V13 had roomBill=function(){const markup=priorRoomBill();...}
// and crashed on s.items when changing to the checkout tab.
const bill=ctx.roomBill(original);
assert.match(bill,/确认结账 · 不打印/);
assert.match(bill,/确认结账并打印小票/);
assert.match(bill,/系统应收/);
assert.match(bill,/checkoutForm/);
assert.match(bill,/actualReceived/);
console.log('PASS real core fee(s) + roomBill(s) renders the two checkout choices');
function submit(print){
 const form={id:'checkoutForm',
  dataset:{},elements:{
   actual:{value:''},payment:{value:'微信'},note:{value:''}
  }};
 for(const fn of docListeners.submit||[]){
  fn({target:form,submitter:{getAttribute:attr=>attr==='data-yd-print'?(print?'1':'0'):null}});
 }
 ctx.checkout(form);
}
const initialOrders=data.orders.length;
mayConfirm=false;submit(true);
assert.equal(data.orders.length,initialOrders,'Canceled payment must not write orders');
assert.equal(receiptOutput.length,0,'Canceled payment must not print');
mayConfirm=true;submit(false);
assert.equal(data.orders.length,initialOrders+1,'No-print checkout must save one order');
assert.equal(Object.keys(data.sessions).length,0,'Checkout must release the table');
assert.equal(receiptOutput.length,0,'No-print checkout must not send print commands');
assert.equal(data.orders[0].room,'包一');
assert.equal(saved,1,'Checkout must save to local ledger');
console.log('PASS no-print checkout writes exactly one order and frees the table');
data.sessions[roomId]=session();
ctx.ui.modal={type:'room',id:roomId};
submit(true);
assert.equal(data.orders.length,initialOrders+2,'Print checkout must save one order');
assert.equal(receiptOutput.length,1,'Print checkout must trigger exactly one print job');
assert.equal(receiptOutput[0].reprint,false);
assert.equal(saved,2,'Print checkout must persist before printing');
ctx.window.YouduReceiptV13.printOrder(data.orders[0].id);
assert.equal(receiptOutput.length,2,'Reprinting must send another printer job');
assert.equal(receiptOutput[1].reprint,true,'Reprint must be explicitly marked');
assert.equal(data.orders.length,2,'Reprint cannot create another sale');
console.log('PASS print checkout and marked reprint do not duplicate sales');
data.sessions[roomId]=session(new Date(Date.now()-6*60*60*1000).toISOString());
ctx.ui.modal={type:'room',id:roomId};
data.sessions[roomId].rates.teaDayHourly=null;
data.rates.teaDayHourly=null;
const missing=ctx.roomBill(data.sessions[roomId]);
assert.match(missing,/待设置/,'Missing daytime rate warning should be visible');
submit(false);
assert.equal(data.orders.length,2,'Unknown overtime price should not silently settle');
assert.match(notices.at(-1),/日间超时单价未设置/);
console.log('PASS unknown tea overtime rate yields a clear warning and no misleading sale');
console.log('V14_1_END_TO_END_CHECKOUT_PASS');
