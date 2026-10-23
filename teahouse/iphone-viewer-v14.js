/* 有度茶舍 iPhone V14：只读共享账本安全护栏。
 * 本文件仅由 iPhone/iPad PWA 加载，不进入华为离线 APK。
 * 未取得共享账本数据前绝不将旧手机本机记录伪装为实时数据。
 */
(()=>{
 'use strict';
 const isApple=/iPhone|iPad|iPod/.test(navigator.userAgent)||
   (navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 if(!isApple||window.YouduNative)return;
 const SAFE_ACTIONS=new Set(['room-tab','picker-category','choose-floor','room-filter','category','stock-tab','stock-category',
   'period','report-period','view-order','yd-print-order','close-modal','close','open-room','view-stock',
   'stock-search','stock-filter','correction-open','correction-switch',
   'correction-history','correction-back','export-json','export-csv','offline-help']);
 const getState=()=>{
   try{return window.YouduSharedSyncV12?.getState()||null;}catch{return null;}
 };
 const VIEW_ONLY_BUTTONS=new Set(['inspect','connect','refresh','viewer']);
 const alertLocal=()=>{
   const s=getState();
   const msg=s?.mode==='primary'&&s?.dirty?
     '此 iPhone 曾经保留未同步记录。请先在「设置」导出 JSON 备份，再以只读模式连接华为账本。':
     'iPhone 仅用于云端查看。请先登录，然后点击「连接华为共享账本」；开台、收款、修改商品请使用华为平板。';
   if(typeof notify==='function')notify(msg);
   else alert(msg);
 };
 // Installed before sync-client-v12.js so a stale iPhone primary cannot
 // accidentally trigger "接管主收银权限" or "从本机建立共享账本".
 document.addEventListener('click',e=>{
   const sync=e.target.closest('[data-yd-sync-btn]');
   if(sync&&!VIEW_ONLY_BUTTONS.has(sync.getAttribute('data-yd-sync-btn'))){
     e.preventDefault();e.stopImmediatePropagation();alertLocal();return;
   }
   const a=e.target.closest('[data-action]');
   if(a&&!SAFE_ACTIONS.has(a.dataset.action)){
     e.preventDefault();e.stopImmediatePropagation();alertLocal();
   }
 },true);
 document.addEventListener('submit',e=>{
   e.preventDefault();e.stopImmediatePropagation();alertLocal();
 },true);
 document.addEventListener('change',e=>{
   if(e.target?.matches('input[type=file]')){
     e.preventDefault();e.stopImmediatePropagation();alertLocal();
   }
 },true);
 const bar=document.createElement('section');
 bar.id='ydIphoneCloudBar';bar.setAttribute('aria-live','polite');
 bar.className='yd-iphone-cloud-bar';
 bar.innerHTML='<span id="ydIphoneCloudStatus"></span><span class="yd-iphone-cloud-actions">'+
   '<button type="button" data-yd-iphone="connect">连接共享账本</button>'+
   '<button type="button" data-yd-iphone="refresh">刷新</button>'+
   '<a href="/login" data-yd-iphone="login">云端登录</a></span>';
 const anchor=document.getElementById('offlineBar');
 if(anchor)anchor.insertAdjacentElement('afterend',bar);
 const css=document.createElement('style');
 css.textContent='.yd-iphone-cloud-bar{display:flex;gap:8px;align-items:center;justify-content:space-between;'+
  'padding:10px 15px;background:#eff4ed;border-bottom:1px solid #d6e2d2;font-size:12px;line-height:1.55;'+
  'color:#234b3a;flex-wrap:wrap}.yd-iphone-cloud-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}'+
  '.yd-iphone-cloud-actions button,.yd-iphone-cloud-actions a{appearance:none;text-decoration:none;color:#234b3a;'+
  'background:white;border:1px solid #b7cdbb;border-radius:10px;padding:6px 10px;'+
  'font-size:12px;font-weight:600}.yd-iphone-cloud-bar.yd-needs-login{background:#fff3dd;color:#774a16}';
 document.head.appendChild(css);
 function draw(){
   const s=getState();const status=bar.querySelector('#ydIphoneCloudStatus');
   const connected=s?.mode==='viewer'&&s.connected&&!s.issue;
   const offline=!navigator.onLine;
   if(!s)status.textContent='iPhone V15 · 正在准备云端账本';
   else if(connected)
     status.textContent='iPhone V15 · 云端只读 · 第 '+s.revision+' 版 · '+s.orders+
        ' 笔订单'+(offline?' · 当前离线，只显示上次缓存':' · 自动检查约10秒/次');
   else if(s.mode==='viewer'&&offline)
     status.textContent='iPhone V15 · 当前离线 · 上一次共享快照（非实时数据）';
   else if(s.issue)
     status.textContent='iPhone V15 · 云端未连接，不能作为营业实时数据 · '+s.issue;
   else
     status.textContent='iPhone V15 · 尚未确认云端同步 · 本机旧记录不是华为共享账本';
   bar.classList.toggle('yd-needs-login',!connected);
   const btn=bar.querySelector('[data-yd-iphone="connect"]');
   if(btn)btn.hidden=connected;
   const login=bar.querySelector('[data-yd-iphone="login"]');
   if(login)login.hidden=connected;
 }
 bar.addEventListener('click',e=>{
  const btn=e.target.closest('[data-yd-iphone]');
  if(!btn||btn.tagName==='A')return;
  e.preventDefault();
  const client=window.YouduSharedSyncV12;
  if(!client){alertLocal();return;}
  if(btn.dataset.ydIphone==='refresh'){
    if(getState()?.mode==='local')client.viewer();
    else client.refresh();
  }else if(btn.dataset.ydIphone==='connect')client.viewer();
  draw();
 });
 window.addEventListener('online',draw);
 window.addEventListener('offline',draw);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)draw();});
 setInterval(draw,1400);
 draw();
})();

