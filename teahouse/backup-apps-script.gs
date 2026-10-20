/**
 * 有度茶舍 V10 Google Drive 共享账本 + 原有每日备份接收器。
 * 在原 Apps Script 项目替换代码、保存、部署新版本，沿用原脚本属性 YOUDU_BACKUP_SECRET。
 * 网页/安卓只连接受密码保护的 Render 服务端，不直接访问此脚本。
 */
const BACKUP_FOLDER_ID='1i-XkzClkB4SeWkyupKl1fRJisvkcqgLc';
const MASTER_NAME='有度茶舍_共享主账本_v10.json';
const MAX_LEDGER_CHARS=1700000;
function jsonResponse_(o){return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);}
function hex_(bytes){return bytes.map(b=>('0'+(b<0?b+256:b).toString(16)).slice(-2)).join('');}
function secureEqual_(a,b){
 if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;
 let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);
 return d===0;
}
function validDevice_(x){return typeof x==='string'&&/^[a-f0-9-]{16,50}$/i.test(x);}
function validSnapshot_(s){
 return s&&s.version===3&&Array.isArray(s.rooms)&&Array.isArray(s.inventory)&&
  Array.isArray(s.products)&&s.sessions&&typeof s.sessions==='object'&&!Array.isArray(s.sessions)&&
  Array.isArray(s.orders)&&Array.isArray(s.movements);
}
function doGet(){return jsonResponse_({ok:true,service:'YOUDU Drive backup receiver',readEnabled:false,syncVersion:10});}
function locateMaster_(folder){const files=folder.getFilesByName(MASTER_NAME);return files.hasNext()?files.next():null;}
function readMaster_(file){
 if(!file)return null;
 const value=JSON.parse(file.getBlob().getDataAsString('UTF-8'));
 if(value.kind!=='youdu-shared-master-v1'||!Number.isSafeInteger(value.revision)||
  value.revision<1||!validDevice_(value.ownerDevice)||!validSnapshot_(value.snapshot))
  throw Error('CORRUPT_MASTER');
 return value;
}
function handleSync_(command){
 if(!validDevice_(command.deviceId)||!['read','init','put','claim'].includes(command.op))
  return {ok:false,error:'BAD_REQUEST'};
 const lock=LockService.getScriptLock();
 if(!lock.tryLock(18000))return {ok:false,error:'BUSY'};
 try{
  const folder=DriveApp.getFolderById(BACKUP_FOLDER_ID);
  const file=locateMaster_(folder),current=readMaster_(file);
  if(command.op==='read'){
   return current?{ok:true,initialized:true,revision:current.revision,
    updatedAt:current.updatedAt,ownerDevice:current.ownerDevice,snapshot:current.snapshot}:
    {ok:true,initialized:false,revision:0,ownerDevice:''};
  }
  if(command.op==='init'){
   if(current)return {ok:false,error:'ALREADY_INITIALIZED',revision:current.revision};
   if(!validSnapshot_(command.snapshot))return {ok:false,error:'INVALID_LEDGER'};
   if(JSON.stringify(command.snapshot).length>MAX_LEDGER_CHARS)
    return {ok:false,error:'LEDGER_TOO_LARGE'};
   const next={kind:'youdu-shared-master-v1',revision:1,
    updatedAt:new Date().toISOString(),ownerDevice:command.deviceId,snapshot:command.snapshot};
   folder.createFile(MASTER_NAME,JSON.stringify(next),MimeType.PLAIN_TEXT);
   return {ok:true,initialized:true,revision:1,
    updatedAt:next.updatedAt,ownerDevice:next.ownerDevice};
  }
  if(!current)return {ok:false,error:'NOT_INITIALIZED'};
  if(!Number.isSafeInteger(command.expectedRevision)||command.expectedRevision!==current.revision)
   return {ok:false,error:'CONFLICT',revision:current.revision};
  if(command.op==='claim'){
   const next={...current,revision:current.revision+1,
    updatedAt:new Date().toISOString(),ownerDevice:command.deviceId};
   file.setContent(JSON.stringify(next));
   return {ok:true,revision:next.revision,ownerDevice:next.ownerDevice,updatedAt:next.updatedAt};
  }
  if(current.ownerDevice!==command.deviceId)
   return {ok:false,error:'READ_ONLY',revision:current.revision};
  if(!validSnapshot_(command.snapshot))return {ok:false,error:'INVALID_LEDGER'};
  if(JSON.stringify(command.snapshot).length>MAX_LEDGER_CHARS)
   return {ok:false,error:'LEDGER_TOO_LARGE'};
  const next={...current,revision:current.revision+1,
   updatedAt:new Date().toISOString(),snapshot:command.snapshot};
  file.setContent(JSON.stringify(next));
  return {ok:true,revision:next.revision,ownerDevice:next.ownerDevice,updatedAt:next.updatedAt};
 }catch(err){
  console.error('Sync error',String(err&&err.message||err).slice(0,100));
  return {ok:false,error:'STORAGE_ERROR'};
 }finally{lock.releaseLock();}
}
function handleBackup_(item){
 if(item.source!=='youdu-teahouse'||!validDevice_(item.deviceId)||
  !/^\d{4}-\d{2}-\d{2}$/.test(item.day)||!validSnapshot_(item.snapshot))
  return {ok:false,error:'INVALID_LEDGER'};
 const filename='有度茶舍_自动备份_'+item.day+'_'+item.deviceId+'.json';
 const lock=LockService.getScriptLock();
 if(!lock.tryLock(18000))return {ok:false,error:'BUSY'};
 try{
  const folder=DriveApp.getFolderById(BACKUP_FOLDER_ID),files=folder.getFilesByName(filename);
  if(files.hasNext()){
   const f=files.next(),old=JSON.parse(f.getBlob().getDataAsString('UTF-8'));
   if(Date.parse(old.savedAt)>Date.parse(item.savedAt))
    return {ok:true,file:filename,ignoredStale:true};
   f.setContent(JSON.stringify(item));
  }else folder.createFile(filename,JSON.stringify(item),MimeType.PLAIN_TEXT);
  return {ok:true,file:filename};
 }catch(err){
  console.error('Backup error',String(err&&err.message||err).slice(0,100));
  return {ok:false,error:'WRITE_FAILED'};
 }finally{lock.releaseLock();}
}
function doPost(e){
 const secret=PropertiesService.getScriptProperties().getProperty('YOUDU_BACKUP_SECRET');
 if(!secret||secret.length<48)return jsonResponse_({ok:false,error:'NOT_CONFIGURED'});
 try{
  const raw=e.postData&&e.postData.contents||'';
  if(raw.length>2200000)return jsonResponse_({ok:false,error:'TOO_LARGE'});
  const packet=JSON.parse(raw),stamp=Number(packet.ts),body=String(packet.body||'');
  if(!Number.isFinite(stamp)||Math.abs(Date.now()-stamp)>5*60*1000)
   return jsonResponse_({ok:false,error:'STALE'});
  const expect=hex_(Utilities.computeHmacSha256Signature(
   String(packet.ts)+'.'+body,secret,Utilities.Charset.UTF_8));
  if(!secureEqual_(expect,String(packet.signature||'')))
   return jsonResponse_({ok:false,error:'SIGNATURE'});
  const item=JSON.parse(body);
  return jsonResponse_(item.source==='youdu-teahouse-sync'&&item.op?
   handleSync_(item):handleBackup_(item));
 }catch(err){
  console.error('Receiver error',String(err&&err.message||err).slice(0,100));
  return jsonResponse_({ok:false,error:'BAD_REQUEST'});
 }
}