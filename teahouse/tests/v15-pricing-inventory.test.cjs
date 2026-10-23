'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ROOT=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
function extract(start,end){const a=html.indexOf(start),b=html.indexOf(end,a+start.length);assert(a>=0&&b>a);return html.slice(a,b);}
let saves=0,downloaded=null;
const now=Date.now(),room={id:'2-test',name:'测试茶席',floor:2};
const rates={teaSeatFee:0,teaHours:4,teaDayHourly:25,teaNightHourly:40,teaNightStartHour:22};
const session={id:'order-v15-test',roomId:room.id,mode:'tea',guests:2,startedAt:new Date(now).toISOString(),rates,items:[]};
const data={version:3,rooms:[room],products:[{id:'g1',name:'永川秀芽',active:true,options:[{label:'杯',price:58,stockId:'pending',consume:1}]}],sessions:{[room.id]:session},orders:[],movements:[],audit:[],rates,
 inventory:[{id:'pending',name:'待录入示例',category:'测试',unit:'份',stock:0,active:true,initialized:false,min:0},
 {id:'zero',name:'已录入零库存',category:'测试',unit:'瓶',stock:0,active:true,initialized:true,lastCost:2.125,avgCost:2.125},
 {id:'tea',name:'测试茶叶',category:'测试',unit:'克',stock:100,active:true,initialized:true,lastCost:.012345,avgCost:.012345},
 {id:'off',name:'已停用商品',category:'测试',unit:'个',stock:5,active:false,initialized:true}]};
const context={Date,JSON,Number,Math,Map,Set,String,Object,Array,Uint8Array,Uint32Array,DataView,TextEncoder,Blob,
 data,ui:{modal:{type:'room',id:room.id},pickerCategory:'全部',pickerSearch:'',stockSearch:'',view:'rooms'},DEFAULT_RATES:rates,
 navigator:{userAgent:'Android test',platform:'Linux',maxTouchPoints:1},
 num:n=>Math.round((Number(n)||0)*100)/100,money:n=>'¥'+(+n||0).toFixed(2),
 esc:x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
 hrs:n=>n>0?Math.ceil(n/3600000):0,fmtDate:String,inputDate:()=>new Date().toISOString().slice(0,16),
 clone:x=>JSON.parse(JSON.stringify(x)),rid:()=>Math.random().toString(36).slice(2),
 findRoom:id=>data.rooms.find(x=>x.id===id),activeRoom:r=>data.sessions[r.id],findStock:id=>data.inventory.find(x=>x.id===id),
 notify(){},save(){saves++;},render(){},renderDialog(){},closeDialog(){context.ui.modal=null;},
 settingsPage:()=>'',cartRows:()=>'',roomMenu:()=>'',roomBill:()=>'',orderDialog:()=>'',inventoryPage:()=>'',stockList:()=>'',exportCSV:()=>'',
 dialogHead:()=>'',stat:()=>'',title:()=>'',stockMobileCards:()=>'',movementList:()=>'',
 localStorage:{getItem:()=>null,setItem(){}},setTimeout:()=>0,clearTimeout(){},
 document:{getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},createElement:()=>({textContent:''}),head:{appendChild(){}}},
 window:{confirm:()=>true,addEventListener(){},YouduSharedSyncV12:{getState:()=>({mode:'primary',issue:''})},
  YouduNative:{printerInfo:()=>'{"ok":true,"mode":"system"}',printReceipt(){}}}
};
context.window.window=context.window;vm.createContext(context);
for(const [start,end] of [['function fee(','function roomStatus('],['function roomMenu(','function cartRows('],['function cartRows(','function roomBill('],['function roomBill(','function roomTime('],['function orderDialog(','function navigate('],['function addToCart(','function checkout('],['function checkout(','function productSave('],['function inventoryPage(','function stockList(']])
 vm.runInContext(extract(start,end),context);
vm.runInContext(fs.readFileSync(path.join(ROOT,'receipt-client-v14_1.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(ROOT,'excel-v15.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(ROOT,'enhancements-v15.js'),'utf8'),context);
context.addToCart('g1',0);
assert.equal(session.items[0].originalPrice,58);
context.window.YouduV15.changePrice(0,'30');
assert.equal(session.items[0].price,30);assert.equal(session.items[0].originalPrice,58);
assert.equal(data.products[0].options[0].price,58,'An order override must never change the menu');
assert.equal(session.items[0].priceHistory[0].from,58);assert.equal(data.audit.length,1);
context.window.YouduV15.changePrice(0,'-10');assert.equal(session.items[0].price,30);
context.window.YouduV15.changePrice(0,'');assert.equal(session.items[0].price,30);
context.window.YouduV15.addTemporary({elements:{name:{value:'测试临时商品 <&>'},unit:{value:'份'},price:{value:'12'},qty:{value:'2'}}});
assert.equal(data.products.length,1,'A temporary line must not enter the permanent menu');
assert.equal(session.items[1].temporary,true);assert.equal(session.items[1].stockId,'');
const total=context.window.YouduV15.totals(session);
assert.equal(total.originalDue,82);assert.equal(total.due,54);assert.equal(total.goodsAdjustment,-28);
const bill=context.roomBill(session);
for(const text of ['永川秀芽','原单价 ¥58.00','本单单价 ¥30.00','原价应收','商品改价调整','实际收款（结账前预览）','确认结账并打印小票'])assert(bill.includes(text),text);
assert(bill.includes('&lt;&amp;&gt;'),'Temporary item names must be escaped');
context.checkout({dataset:{ydPrintWanted:'0'},elements:{actual:{value:'50'},payment:{value:'现金'},note:{value:''}}});
const order=data.orders[0];
assert.equal(order.originalDue,82);assert.equal(order.goodsAdjustment,-28);assert.equal(order.due,54);assert.equal(order.actual,50);assert.equal(order.difference,-4);
assert.equal(JSON.parse(JSON.stringify(order)).items[0].originalPrice,58,'Price facts must survive persistence and sync');
assert.equal(data.inventory[0].stock,-1);assert.equal(data.inventory[0].initialized,false,'Selling an unregistered item must not register it');
const receipt=context.window.YouduReceiptV13.buildReceipt(order);
for(const text of ['原单价 ¥58.00','本单单价 ¥30.00','原价应收','商品改价调整','结账差额','临时商品'])assert(receipt.includes(text),text);
assert(!receipt.includes('测试临时商品 <&>'),'Receipt must escape names');
const rows=context.window.YouduV15.inventoryRows();
assert.equal(rows.length,2);assert(rows.some(x=>x[0]==='已录入零库存'));assert(!rows.some(x=>x[0]==='待录入示例'));
assert.equal(rows.find(x=>x[0]==='测试茶叶')[5],.012345,'Sub-cent per-gram purchase cost must be preserved');
context.window.YouduExcelV15.download=(name,bytes)=>{downloaded={name,bytes};};context.exportCSV('stock');
assert(downloaded.name.endsWith('.xlsx'));assert.equal(downloaded.bytes[0],80);assert.equal(downloaded.bytes[1],75);
if(process.argv[2])fs.writeFileSync(process.argv[2],downloaded.bytes);
console.log('PASS V15: 58 → 30 order-only override, immutable original price, audit, temporary lines and actual 50 on due 54');
console.log('PASS V15: detailed bill + receipt + persisted accounting retain originals, adjustments, payable and actual');
console.log('PASS V15: unregistered and disabled stocks excluded; registered zero stock and precise costs retained in XLSX');
// Explicit iPhone guard is independent of the current sync-mode value.
context.navigator.userAgent='iPhone';context.navigator.platform='iPhone';context.window.YouduNative=null;
context.window.YouduSharedSyncV12.getState=()=>({mode:'viewer',issue:''});
context.ui.modal={type:'room',id:room.id};data.sessions[room.id]=session;
const oldPrice=session.items[0].price,count=session.items.length;
context.window.YouduV15.changePrice(0,'5');context.window.YouduV15.addTemporary({elements:{}});
assert.equal(session.items[0].price,oldPrice);assert.equal(session.items.length,count);
console.log('PASS V15: read-only viewers cannot edit item prices or add temporary products');
