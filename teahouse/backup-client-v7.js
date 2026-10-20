/* 有度茶舍 V7：每台设备自动向受保护后端提交 Google Drive 快照。
   后端未获得独立 Google 授权时，不发起上传、不显示备份成功。 */
(()=>{
  'use strict';
  const DEVICE_KEY=KEY+'__device_id';
  const RECEIPT_KEY=KEY+'__last_confirmed_drive_backup';
  let configured=false,onlineChecked=false,uploading=false,lastError='',lastReceipt=null,scheduled=null;
  function deviceId(){
    let saved=localStorage.getItem(DEVICE_KEY);
    if(saved&&/^[a-f0-9-]{16,50}$/i.test(saved))return saved;
    saved=crypto.randomUUID?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16))).map(x=>x.toString(16).padStart(2,'0')).join('');
    localStorage.setItem(DEVICE_KEY,saved);return saved;
  }
  function day(){return inputDate(Date.now()).slice(0,10);}
  function stamp(){
    const v=localStorage.getItem(RECEIPT_KEY);
    try{return JSON.parse(v||'null');}catch{return null;}
  }
  function draw(){
    const txt=!navigator.onLine?'当前离线 · 本机继续记账，云备份等待联网':
      !configured?'Google Drive 尚未独立授权 · 当前仅本机保存':
      uploading?'正在上传本机账目到 Google Drive…':
      lastError?'上次上传未成功：'+lastError:
      stamp()?.savedAt?'Google Drive 已备份此设备 · '+fmtDate(stamp().savedAt):
      'Google Drive 已连接 · 等待首次备份';
    document.querySelectorAll('[data-drive-status]').forEach(x=>{x.textContent=txt});
    const b=document.querySelector('#ydBackupNow');if(b)b.disabled=uploading||!configured||!navigator.onLine;
  }
  async function getStatus(){
    if(!navigator.onLine)return;
    try{
      const r=await fetch('/api/backup-status',{cache:'no-store',credentials:'same-origin'});
      const j=await r.json();
      configured=!!j.configured;onlineChecked=true;
      lastError='';
    }catch(e){lastError='暂时无法连接备份服务';}
    draw();
  }
  async function digest(str){
    const x=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(str));
    return Array.from(new Uint8Array(x)).map(c=>c.toString(16).padStart(2,'0')).join('');
  }
  async function backup(force=false){
    if(uploading||!navigator.onLine)return;
    if(!onlineChecked)await getStatus();
    if(!configured)return draw();
    const raw=JSON.stringify(data),hash=await digest(raw),prev=stamp(),currentDay=day();
    if(!force&&prev?.day===currentDay&&prev?.hash===hash)return draw();
    uploading=true;lastError='';draw();
    try{
      const r=await fetch('/api/backup',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({deviceId:deviceId(),day:currentDay,snapshot:JSON.parse(raw)})});
      const j=await r.json();
      if(!r.ok||!j.ok)throw Error((j.code||'备份未完成'));
      const receipt={day:currentDay,hash,savedAt:j.savedAt||new Date().toISOString(),file:j.file||''};
      localStorage.setItem(RECEIPT_KEY,JSON.stringify(receipt));lastReceipt=receipt;
    }catch(e){lastError=String(e.message||e).slice(0,100);}
    finally{uploading=false;draw();}
  }
  function schedule(){if(scheduled)clearTimeout(scheduled);scheduled=setTimeout(()=>backup(false),18000);}
  const baseSave=save;
  save=function(){baseSave();schedule();};
  const oldSettings=settingsPage;
  settingsPage=function(){
    const html=oldSettings();
    return html+'<section class="panel"><h3>Google Drive 每日备份</h3><p data-drive-status class="yd-v7-backup-status">检查中…</p><p class="panel-sub">只有在本设备联网并打开本 APP 时，才会自动备份本机账本；备份成功以 Google Drive 返回的确认结果为准。关闭设备、断网或尚未授权时无法保证每日备份。此功能不是跨设备实时同步。</p><div class="yd-v7-backup-actions"><button type="button" class="btn light" id="ydBackupNow">立即尝试备份</button><button type="button" class="btn light" data-action="export-json">下载本机 JSON 保底备份</button></div></section>';
  };
  const oldRender=render;
  render=function(){oldRender();draw();};
  document.addEventListener('click',e=>{
    if(e.target.closest('#ydBackupNow')){backup(true);}
  });
  window.addEventListener('online',()=>{getStatus().then(()=>backup());});
  window.addEventListener('offline',draw);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&navigator.onLine)backup(false);});
  setInterval(()=>backup(false),30*60*1000);
  setTimeout(()=>getStatus().then(()=>backup(false)),3500);
  draw();
})();