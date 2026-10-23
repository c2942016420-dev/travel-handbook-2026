/* 有度茶舍 V12：单主机写入、其余设备只读；明确用户操作后启用。
 * 永不自动覆盖原始本机账本 youdu_tea_house_v3。
 * 云端采用 Google Drive master + revision CAS，离线更新仅保存在主设备。
 */
(()=>{
 'use strict';
 const IS_IPHONE=/iPhone|iPad|iPod/.test(navigator.userAgent)||
  (navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 const IS_NATIVE=!!window.YouduNative;
 let latestCloudTime='',lastContactAt='';
 const DIRTY_KEY=KEY+'__sync_v10_unsent',
       MODE_KEY=KEY+'__sync_v10_mode',DEVICE_KEY=KEY+'__device_id',
       VIEW_KEY=KEY+'__sync_v10_view_cache',ORIGINAL_KEY=KEY+'__before_sync_claim';
 const ERRORS={SYNC_UPGRADE_REQUIRED:'Google Drive 接收脚本尚未升级到 V10，请先发布新版本。',
  SYNC_NOT_CONFIGURED:'云备份服务尚未配置。',CONFLICT:'云端账本已更新，当前设备已暂停上传，防止覆盖他人操作。',
  READ_ONLY:'本设备不是主收银设备，已阻止覆盖云端账本。',
  NOT_INITIALIZED:'还没有创建共享账本，请先在保存原始记录的设备上建立。',
  ALREADY_INITIALIZED:'共享账本已经存在，不能覆盖，请改用只读连接。',
  SYNC_UNAVAILABLE:'暂时无法连接共享服务，请检查网络。',
  BUSY:'云端正在处理另一笔同步，请稍后重试。'};
 let state={mode:'local',revision:0},lastSeen=null,inFlight=false,dirty=localStorage.getItem(DIRTY_KEY)==='1',
     changeId=0,pushTimer=null,issue='',checking=false,connected=false,savingRemote=false;
 try{const s=JSON.parse(localStorage.getItem(MODE_KEY)||'null');
  if(s&&['primary','viewer'].includes(s.mode)&&Number.isSafeInteger(s.revision))
   state=s;
 }catch{}
 function deviceId(){
  let v=localStorage.getItem(DEVICE_KEY);
  if(v&&/^[a-f0-9-]{16,50}$/i.test(v))return v;
  v=crypto.randomUUID?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(n=>n.toString(16).padStart(2,'0')).join('');
  localStorage.setItem(DEVICE_KEY,v);return v;
 }
 function valid(s){return !!(s&&s.version===3&&Array.isArray(s.orders)&&
  Array.isArray(s.inventory)&&Array.isArray(s.products)&&Array.isArray(s.rooms)&&
  Array.isArray(s.movements)&&s.sessions&&typeof s.sessions==='object');}
 function applyMode(mode,revision){
  state={mode,revision:revision||0};localStorage.setItem(MODE_KEY,JSON.stringify(state));
 }
 const oldSave=save;
 save=function(){
  if(savingRemote)return;
  if(state.mode==='viewer')return; // Never overwrite the original local ledger on a read-only phone.
  oldSave();
  if(state.mode==='primary'){
   dirty=true;localStorage.setItem(DIRTY_KEY,'1');changeId++;
   if(issue!=='CONFLICT'&&issue!=='READ_ONLY')issue='';
   clearTimeout(pushTimer);
   pushTimer=setTimeout(push,1300);
   draw();
  }
 };
 function status(){
  if(state.mode==='local')return '本机独立账本（尚未联网共享）';
  if(issue)return (state.mode==='primary'?'主收银 · ':'只读查看 · ')+(ERRORS[issue]||issue);
  if(!navigator.onLine)return state.mode==='primary'?'主收银离线 · 新操作保存在本机，联网后尝试上传':'只读设备离线 · 显示上一次共享快照';
  if(inFlight)return '正在与共享账本通信…';
  if(state.mode==='primary')return dirty?'主收银 · 本机有待同步记录':'主收银 · 已同步至 Google Drive · 版本 '+state.revision;
  return connected?'iPhone 云端只读 · 共享版本 '+state.revision+' · '+data.rooms.length+'间房 · '+data.orders.length+'笔订单'+(lastContactAt?' · 检查于 '+lastContactAt:''):
     'iPhone 只读查看 · 正在连接云端';
 }
 function draw(){
  const el=document.getElementById('ydSyncState');if(el)el.textContent=status();
  const badge=document.getElementById('ydSyncBadge');
  if(badge)badge.textContent=state.mode==='primary'?'主收银'+(dirty?' · 待同步':' · 已连接'):
    state.mode==='viewer'?'云端只读': '单机';
  document.querySelectorAll('[data-yd-sync-btn]').forEach(b=>{b.disabled=inFlight;});
 }
 function showIssue(v){issue=v;draw();}
 async function api(op,other={}){
  if(!navigator.onLine)throw Error('OFFLINE');
  const r=await fetch('/api/sync',{method:'POST',credentials:'same-origin',
   cache:'no-store',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({op,deviceId:deviceId(),...other})});
  let j;try{j=await r.json();}catch{throw Error('LOGIN_REQUIRED');}
  if(!r.ok||!j.ok)throw Error(j.code||'SYNC_UNAVAILABLE');
  return j;
 }
 async function safeBackup(snapshot){
  const r=await fetch('/api/backup',{method:'POST',credentials:'same-origin',
   cache:'no-store',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({deviceId:deviceId(),day:inputDate(Date.now()).slice(0,10),snapshot})});
  let j;try{j=await r.json();}catch{throw Error('BACKUP_UNAVAILABLE');}
  if(!r.ok||!j.ok)throw Error('BACKUP_NOT_CONFIRMED');
 }
 function replaceViewer(snapshot,revision){
  if(!valid(snapshot))throw Error('SYNC_INVALID_REMOTE');
  // Preserve KEY and any old orders in this browser; store cloud view separately.
  localStorage.setItem(VIEW_KEY,JSON.stringify(snapshot));
  data=clone(snapshot);
  state.revision=revision;connected=true;
  localStorage.setItem(MODE_KEY,JSON.stringify(state));
  if(!ui.modal)render();
  else draw();
 }
 async function pull(force=false){
  if(inFlight||!navigator.onLine||!['primary','viewer'].includes(state.mode))return;
  if(state.mode==='primary'&&dirty){schedulePush();return;}
  inFlight=true;draw();
  try{
   const r=await api('read');
   if(!r.initialized){showIssue('NOT_INITIALIZED');return;}
   lastSeen=r;latestCloudTime=r.updatedAt||'';
   if(state.mode==='primary'){
    if(r.ownerDevice!==deviceId()){
     if(IS_IPHONE&&!IS_NATIVE&&!dirty){
      applyMode('viewer',0);replaceViewer(r.snapshot,r.revision);issue='';return;
     }
     showIssue('READ_ONLY');return;
    }
    if(r.revision!==state.revision){showIssue('CONFLICT');return;}
   }else if(force||r.revision!==state.revision||!connected){
    replaceViewer(r.snapshot,r.revision);
   }
   issue='';
   if(state.mode==='viewer'&&connected)lastContactAt=new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  }catch(e){showIssue(String(e.message||'SYNC_UNAVAILABLE'));}
  finally{inFlight=false;draw();}
 }
 function schedulePush(){clearTimeout(pushTimer);pushTimer=setTimeout(push,1600);}
 async function push(){
  if(state.mode!=='primary'||!dirty||inFlight||!navigator.onLine||issue==='CONFLICT'||issue==='READ_ONLY')return;
  inFlight=true;const thisChange=changeId,snapshot=clone(data),baseRev=state.revision;draw();
  try{
   const r=await api('put',{expectedRevision:baseRev,snapshot});
   state.revision=r.revision;localStorage.setItem(MODE_KEY,JSON.stringify(state));
   dirty=changeId!==thisChange;localStorage.setItem(DIRTY_KEY,dirty?'1':'0');issue='';
   latestCloudTime=r.updatedAt||'';lastContactAt=new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  }catch(e){issue=String(e.message||'SYNC_UNAVAILABLE');}
  finally{inFlight=false;draw();if(dirty&&navigator.onLine&&!['CONFLICT','READ_ONLY'].includes(issue))schedulePush();}
 }
 async function inspect(){
  if(inFlight)return;
  inFlight=true;draw();
  try{
   const r=await api('read');lastSeen=r;issue='';
   notify(r.initialized?'共享账本存在：版本 '+r.revision:'共享账本尚未建立');
  }catch(e){showIssue(String(e.message));notify(ERRORS[issue]||issue);}
  finally{inFlight=false;draw();}
 }
 async function initialize(){
  if(state.mode!=='local'||inFlight)return;
  if(!confirm('将这台设备当前的所有订单、商品和库存作为共享账本的起始数据？\n请确保选择的是原来保存正确账目的设备。\n系统会先完成一次 Google Drive 保底备份，失败则不会建立。'))return;
  inFlight=true;draw();
  try{
   const snapshot=clone(data);
   if(!valid(snapshot))throw Error('INVALID_LEDGER');
   await safeBackup(snapshot);
   const result=await api('init',{snapshot});
   applyMode('primary',result.revision);dirty=false;localStorage.setItem(DIRTY_KEY,'0');connected=true;issue='';lastSeen=null;
   notify('共享主账本已建立，本设备是主收银设备');
  }catch(e){showIssue(String(e.message));notify(ERRORS[issue]||issue);}
  finally{inFlight=false;render();}
 }
 async function autoConnectIPhone(){
  if(!IS_IPHONE||IS_NATIVE||inFlight||state.mode!=='local'||!navigator.onLine)return;
  inFlight=true;draw();
  try{
   const r=await api('read');
   if(!r.initialized)return;
   applyMode('viewer',0); // preserves original localStorage[KEY]
   replaceViewer(r.snapshot,r.revision);
   latestCloudTime=r.updatedAt||'';issue='';
   notify('已连接华为共享账本，iPhone 只读查看');
  }catch(e){
   issue=String(e.message||'SYNC_UNAVAILABLE');
  }finally{inFlight=false;draw();}
 }
 async function connectViewer(){
  if(inFlight)return;
  if(state.mode==='primary'&&dirty){notify('有待同步的记录，请先上传再切换只读');return;}
  if(!confirm('以只读方式查看云端账本？\n不会覆盖这台设备原来的订单和库存；但在只读模式下不能开台、结账或修改记录。'))return;
  inFlight=true;draw();
  try{
   const r=await api('read');
   if(!r.initialized)throw Error('NOT_INITIALIZED');
   applyMode('viewer',0);
   replaceViewer(r.snapshot,r.revision);
   issue='';notify('只读连接成功，账目来自云端共享数据');
  }catch(e){showIssue(String(e.message));notify(ERRORS[issue]||issue);}
  finally{inFlight=false;render();}
 }
 async function claim(){
  if(state.mode!=='viewer'||inFlight)return;
  if(!confirm('把主收银权限转到当前设备？\n请确认原主设备的全部待同步账目已成功上传。\n此操作不会删除原主设备数据，但该设备之后将变为只读。'))return;
  inFlight=true;draw();
  try{
   const r=await api('read');if(!r.initialized)throw Error('NOT_INITIALIZED');
   if(r.revision!==state.revision)throw Error('CONFLICT');
   if(!valid(r.snapshot))throw Error('SYNC_INVALID_REMOTE');
   // Save all pre-existing local data before changing this device's primary cache.
   const saved=localStorage.getItem(KEY);
   if(saved!==null)localStorage.setItem(ORIGINAL_KEY,saved);
   // Confirm the old local cache can safely be replaced; restore it on any remote failure.
   const proposed=JSON.stringify(r.snapshot);
   localStorage.setItem(KEY,proposed);
   let result;
   try{result=await api('claim',{expectedRevision:r.revision});}
   catch(err){if(saved===null)localStorage.removeItem(KEY);else localStorage.setItem(KEY,saved);throw err;}
   data=clone(r.snapshot);applyMode('primary',result.revision);connected=true;
   lastSeen=null;dirty=false;localStorage.setItem(DIRTY_KEY,'0');issue='';render();
   notify('当前设备已接管主收银；其他设备需刷新才能看到只读状态');
  }catch(e){showIssue(String(e.message));notify(ERRORS[issue]||issue);}
  finally{inFlight=false;draw();}
 }
 async function manual(){
  if(inFlight)return;
  if(state.mode==='primary'){
   if(dirty){issue='';await push();}
   else{issue='';await pull(true);}
  }else await pull(true);
 }
 function panel(){
  const buttons=state.mode==='local'?
   '<button type="button" class="btn light" data-yd-sync-btn="inspect">检查云端连接</button>'+
   '<button type="button" class="btn" data-yd-sync-btn="init">从本设备建立共享账本</button>'+
   '<button type="button" class="btn light" data-yd-sync-btn="connect">只读连接已有账本</button>':
   state.mode==='viewer'?
   '<button type="button" class="btn light" data-yd-sync-btn="refresh">立即刷新</button>'+
   '<button type="button" class="btn" data-yd-sync-btn="claim">接管主收银权限</button>':
   '<button type="button" class="btn light" data-yd-sync-btn="refresh">立即检查/同步</button>'+ 
   '<button type="button" class="btn light" data-yd-sync-btn="viewer">转为云端只读（原本机账目保留）</button>';
  return '<section class="panel yd-sync-panel"><h3>华为与 iPhone 共享账本</h3>'+
   '<p id="ydSyncState" class="panel-sub">'+esc(status())+'</p>'+
   '<div class="yd-sync-buttons">'+buttons+'</div>'+
   '<p class="panel-sub" style="margin-top:14px">只允许一台设备负责开台与收银。苹果手机可只读查看房态、订单和报表。联网时约25秒刷新一次；断网时主机先本地保存，恢复网络后同步。旧的本机记录不会被自动删除。</p>'+
   '<p class="panel-sub">第一次建立共享账本，请在保存原有正确账目的设备上操作；之后才在华为平板连接并接管主收银权限。</p></section>';
 }
 window.YouduSharedModeV10=()=>state.mode;
 window.YouduSharedSyncV12={
  getState:()=>({mode:state.mode,revision:state.revision,dirty,issue,connected,latestCloudTime,lastContactAt,
   orders:data.orders.length,rooms:data.rooms.length}),
  refresh:manual,viewer:connectViewer
 };
 const prevSettings=settingsPage;
 settingsPage=function(){return prevSettings()+panel();};
 const prevReports=reportsPage;
 reportsPage=function(){return prevReports().replace('数据只来自本设备。',state.mode==='local'?'数据来自本设备。':'数据来自共享账本。');};
 const prevRender=render;
 render=function(){
  prevRender();
  if(!document.getElementById('ydSyncBadge')){
   const host=document.querySelector('.top-right')||document.querySelector('.topbar');
   if(host)host.insertAdjacentHTML('beforeend','<span id="ydSyncBadge" class="yd-sync-badge"></span>');
  }
  draw();
 };
 const css=document.createElement('style');
 css.textContent='.yd-sync-panel{margin-top:24px}.yd-sync-buttons{display:flex;gap:9px;flex-wrap:wrap}.yd-sync-panel p{line-height:1.8}.yd-sync-badge{font-size:12px;color:#41694c;white-space:nowrap;background:#edf1e9;border-radius:20px;padding:7px 11px}.yd-sync-panel button{min-height:42px}@media(max-width:640px){.yd-sync-badge{font-size:10px;padding:5px 7px}.yd-sync-buttons button{flex:1 1 100%;font-size:14px}}';
 document.head.appendChild(css);
 const ALLOW_VIEW=new Set(['choose-floor','room-filter','category','stock-tab','stock-category','period','report-period',
  'view-order','yd-print-order','yd-print-test','yd-check-update','yd-download-update','open-room','correction-open','correction-switch','correction-history','correction-back',
  'close-modal','export-json','export-csv','offline-help','stock-filter','close','view-stock','stock-search']);
 document.addEventListener('click',e=>{
  const syncBtn=e.target.closest('[data-yd-sync-btn]');
  if(syncBtn){
   e.preventDefault();e.stopImmediatePropagation();
   const name=syncBtn.getAttribute('data-yd-sync-btn');
   if(name==='inspect')inspect();
   else if(name==='init')initialize();
   else if(name==='connect')connectViewer();
   else if(name==='claim')claim();
   else if(name==='refresh')manual();
   else if(name==='viewer')connectViewer();
   return;
  }
  if(state.mode!=='viewer'&&!(state.mode==='primary'&&['CONFLICT','READ_ONLY'].includes(issue)))return;
  const btn=e.target.closest('[data-action]');
  if(!btn)return;
  if(ALLOW_VIEW.has(btn.dataset.action))return;
  e.preventDefault();e.stopImmediatePropagation();
  notify('此设备目前只读；请在华为主收银设备操作');
 },true);
 document.addEventListener('submit',e=>{
  if(state.mode==='viewer'||(state.mode==='primary'&&['CONFLICT','READ_ONLY'].includes(issue))){e.preventDefault();e.stopImmediatePropagation();notify('当前账本处于只读保护状态，不能提交修改');}
 },true);
 document.addEventListener('change',e=>{
  if((state.mode==='viewer'||['CONFLICT','READ_ONLY'].includes(issue))&&e.target.matches('input[type=file]')){
   e.preventDefault();e.stopImmediatePropagation();notify('只读设备不能导入覆盖账本');
  }
 },true);
 document.getElementById('offlineHelp')?.addEventListener('click',e=>{if(state.mode!=='local'){e.preventDefault();e.stopImmediatePropagation();alert('已连接共享账本。当前只有主收银设备可以修改；其他设备只读。断网时主设备保存在本机，联网后检查版本再同步。请在「房间与收费设置」查看共享状态。');}},true);
 window.addEventListener('online',()=>{if(state.mode==='primary'&&dirty)schedulePush();else pull();});
 window.addEventListener('offline',draw);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.mode!=='local')pull();});
 setInterval(()=>{if(state.mode==='viewer'||state.mode==='primary'){if(state.mode==='primary'&&dirty)push();else pull();}},10000);
 if(state.mode==='viewer'){
  try{const cached=JSON.parse(localStorage.getItem(VIEW_KEY)||'null');
   if(valid(cached)){data=clone(cached);connected=true;render();}
  }catch{}
 }
 if(state.mode!=='local')setTimeout(()=>pull(true),800);
 if(state.mode==='local'&&IS_IPHONE&&!IS_NATIVE)setTimeout(autoConnectIPhone,950);
 render();
})();