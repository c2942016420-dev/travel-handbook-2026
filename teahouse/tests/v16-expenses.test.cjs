'use strict';
process.env.TZ='UTC';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const fixed=Date.parse('2026-10-25T12:00:00Z');
class Clock extends Date{constructor(...args){super(...(args.length?args:[fixed]));}static now(){return fixed;}}
const listeners={},storage=new Map(),notices=[];let mode='primary',saves=0;
const nodes={dialog:{innerHTML:'',classList:{add(){}}},overlay:{classList:{remove(){}},setAttribute(){}}};
const data={version:3,orders:[{id:'existing-order',actual:100,due:100,closedAt:new Clock().toISOString()}],
 expenses:[],reportAdjustments:[],movements:[],inventory:[{id:'keep',name:'现有库存',stock:22,initialized:true}],products:[],rooms:[],sessions:{},audit:[]};
const ui={reportPeriod:'day',modal:null};
const ctx={Date:Clock,JSON,Number,Object,Array,Math,String,Map,Set,console,data,ui,KEY:'youdu_tea_house_v3',
 navigator:{userAgent:'Android',platform:'Linux',maxTouchPoints:1},window:{YouduNative:{},YouduSharedModeV10:()=>mode,YouduSharedSyncV12:{getState:()=>({mode,issue:''})},confirm:()=>true},
 localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v))},
 clone:x=>JSON.parse(JSON.stringify(x)),num:n=>Math.round((Number(n)||0)*100)/100,rid:()=>Math.random().toString(36).slice(2),
 money:n=>'¥'+(+n||0).toFixed(2),esc:x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
 fmtDate:String,inputDate:x=>new Clock(x).toISOString().slice(0,16),
 datesRange(){const d=new Clock();d.setUTCHours(0,0,0,0);if(ui.reportPeriod==='week')d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);if(ui.reportPeriod==='month')d.setUTCDate(1);return +d;},
 notify:x=>notices.push(x),save(){saves++;storage.set(ctx.KEY,JSON.stringify(data));},render(){},restoreFile(){},settingsPage:()=>'',orderDialog:()=>'',renderDialog(){},exportCSV(){},exportFile(){},csvCell:String,
 title:(a,b,c)=>a+b+c,stat:(a,b)=>a+':'+b,dialogHead:(a,b,c)=>a+b+c,
 $:id=>nodes[id]||null,closeDialog(){ui.modal=null;},
 openDialog(type,id){ui.modal={type,id};ctx.renderDialog();},
 document:{createElement:()=>({textContent:''}),head:{appendChild(){}},querySelectorAll:()=>[],getElementById:id=>nodes[id]||null,addEventListener:(k,f)=>(listeners[k]??=[]).push(f)},
};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../enhancements-v6.js'),'utf8'),ctx);
const api=ctx.window.YouduExpensesV16;
assert.deepEqual(Array.from(api.categories()),['买菜','水电','维修','房租','人工工资','其他杂费']);
api.addCategory('交通');assert(api.categories().includes('交通'));
let index=api.categories().indexOf('交通');api.renameCategory(index,'交通费');assert(api.categories().includes('交通费'));
const length=api.categories().length;api.addCategory('交通费');assert.equal(api.categories().length,length);
api.addCategory('');assert.equal(api.categories().length,length);
function submit(id,values,type='expense-entry',recordId='new',kind){
 ui.modal={type,id:recordId,kind};const form={id,elements:Object.fromEntries(Object.entries(values).map(([k,value])=>[k,{value:String(value)}]))};
 for(const fn of listeners.submit||[])fn({target:form,preventDefault(){}});
}
const now='2026-10-25T12:00';
submit('v6ExpenseForm',{date:now,amount:20,category:'买菜',note:''});
assert.equal(data.expenses.length,1);assert.equal(api.summary().operatingCosts,20);assert.equal(api.summary().profit,80);
const firstId=data.expenses[0].id;
submit('v6ExpenseForm',{date:now,amount:25,category:'水电',note:'',changeReason:'按账单更正'},'expense-edit',firstId);
assert.equal(data.expenses.length,1);assert.equal(api.summary().operatingCosts,25);assert.equal(data.expenses[0].category,'水电');
submit('v6EntryVoidForm',{reason:'重复录入'},'entry-void',firstId,'expense');
assert.equal(api.summary().operatingCosts,0);assert.equal(data.expenses.length,1);assert(data.expenses[0].voidedAt);
submit('v6ExpenseForm',{date:now,amount:30,category:'维修',note:'更换灯泡'});
submit('v6ExpenseForm',{date:'2026-10-24T12:00',amount:20,category:'买菜',note:''});
submit('v6ExpenseForm',{date:'2026-10-03T12:00',amount:40,category:'其他杂费',note:''});
ui.reportPeriod='day';assert.equal(api.summary().operatingCosts,30);
ui.reportPeriod='week';assert.equal(api.summary().operatingCosts,50);
ui.reportPeriod='month';assert.equal(api.summary().operatingCosts,90);
index=api.categories().indexOf('买菜');api.renameCategory(index,'每日买菜');assert.equal(data.expenses[2].category,'买菜');
api.removeCategory(api.categories().indexOf('每日买菜'));assert(!api.categories().includes('每日买菜'));assert.equal(api.summary().operatingCosts,90);
assert.equal(data.inventory[0].stock,22);assert.equal(data.orders.length,1);
ctx.openDialog('expense-edit',data.expenses[2].id);assert(nodes.dialog.innerHTML.includes('value="买菜"'),'Old project remains selectable when editing its historic record');
ctx.openDialog('expense-categories','new');assert(nodes.dialog.innerHTML.includes('添加项目'));assert(nodes.dialog.innerHTML.includes('删除项目'));
ctx.openDialog('expense-entry','new');assert(nodes.dialog.innerHTML.includes('杂费项目'));assert(nodes.dialog.innerHTML.includes('支出备注（可留空）'));
const html=ctx.reportsPage();assert(html.includes('登记杂费')&&html.includes('管理杂费项目')&&html.includes('杂费与经营成本'));
// Opening project management preserves the pending expense form without posting it.
ctx.openDialog('expense-entry','new');
nodes.v6ExpenseForm={elements:Object.fromEntries(Object.entries({date:now,amount:'18',category:'维修',note:'保留备注'}).map(([k,value])=>[k,{value}]))};
function click(action){const button={dataset:{action}};for(const fn of listeners.click||[])fn({target:{closest:()=>button}});}
click('expense-categories');assert.equal(ui.modal.type,'expense-categories');assert.equal(ui.expenseDraft.amount,'18');
api.addCategory('清洁');click('expense-category-return');assert.equal(ui.modal.type,'expense-entry');
assert(nodes.dialog.innerHTML.includes('value="18"'));assert(nodes.dialog.innerHTML.includes('保留备注'));assert(nodes.dialog.innerHTML.includes('value="清洁" selected'));
delete nodes.v6ExpenseForm;ui.expenseDraft=null;ui.expenseReturn=null;
console.log('PASS V16 expense draft survives adding a project before confirmation');
const before=data.expenses.length;submit('v6ExpenseForm',{date:now,amount:0,category:'维修',note:''});assert.equal(data.expenses.length,before);
submit('v6ExpenseForm',{date:now,amount:1,category:'不存在的项目',note:''});assert.equal(data.expenses.length,before);
const snapshot=JSON.stringify(data),saveCount=saves;
mode='viewer';api.addCategory('禁止新增');api.renameCategory(0,'禁止改名');api.removeCategory(0);
submit('v6ExpenseForm',{date:now,amount:10,category:'维修',note:''});
submit('v6EntryVoidForm',{reason:'禁止作废'},'entry-void',data.expenses[1].id,'expense');
assert.equal(JSON.stringify(data),snapshot);assert.equal(saves,saveCount);
mode='primary';ctx.navigator.userAgent='iPhone';ctx.window.YouduNative=undefined;api.addCategory('手机禁止');assert.equal(JSON.stringify(data),snapshot);
ctx.navigator.userAgent='Android';ctx.window.YouduNative={};mode='local';api.addCategory('未接管禁止');assert.equal(JSON.stringify(data),snapshot);
assert.deepEqual(JSON.parse(storage.get(ctx.KEY)).expenseCategories,JSON.parse(snapshot).expenseCategories);
console.log('PASS V16 expense projects: defaults, add, rename, delete, duplicate/empty validation and historic project retention');
console.log('PASS V16 expenses: create, edit, void, optional memo, positive money and day/week/month totals');
console.log('PASS V16 data safety: orders and stocks unchanged; iPhone/viewer/uninitialized native mutations blocked');

// The offline shell must protect both the existing temporary-item form and new cost forms.
const nativeListeners={};let nativeMode='local',nativeAlerts=0;
const nativeContext={Set,window:{YouduSharedModeV10:()=>nativeMode},alert(){nativeAlerts++;},
 document:{getElementById:()=>({}),addEventListener:(type,fn)=>(nativeListeners[type]??=[]).push(fn)}};
vm.createContext(nativeContext);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../android-app/tools/native-offline-v14_1.js'),'utf8'),nativeContext);
for(const formId of ['ydV15TemporaryForm','v6ExpenseForm','v6EntryVoidForm','v16ExpenseCategoryForm']){
 for(const currentMode of ['local','viewer','primary']){
  nativeMode=currentMode;let prevented=false,stopped=false;
  for(const fn of nativeListeners.submit)fn({target:{id:formId},preventDefault(){prevented=true;},stopImmediatePropagation(){stopped=true;}});
  assert.equal(prevented,currentMode!=='primary',formId+' in '+currentMode);
  assert.equal(stopped,currentMode!=='primary',formId+' in '+currentMode);
 }
}
assert.equal(nativeAlerts,8);
console.log('PASS V16 offline shell preserves temporary-item and expense form ownership guards');
