/**
 * 有度茶舍每日自动备份 Google Apps Script 接收端
 * 只允许持有服务器 HMAC 签名的请求写入；没有读取文件的接口。
 * 请在 Apps Script「项目设置 → 脚本属性」添加 YOUDU_BACKUP_SECRET。
 * 通过「部署 → 新建部署 → 网页应用」，执行身份：我，访问权限：任何人。
 * 服务器在 Render 上保存同一密钥，不会把 Google 密钥发给浏览器。
 */
const BACKUP_FOLDER_ID = '1i-XkzClkB4SeWkyupKl1fRJisvkcqgLc';
function jsonResponse_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function hex_(bytes) {return bytes.map(b=>('0'+(b<0?b+256:b).toString(16)).slice(-2)).join('');}
function secureEqual_(a,b) {
  if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;
  let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;
}
function doGet() {return jsonResponse_({ok:true,service:'YOUDU Drive backup receiver',readEnabled:false});}
function doPost(e) {
  const secret=PropertiesService.getScriptProperties().getProperty('YOUDU_BACKUP_SECRET');
  if(!secret||secret.length<48)return jsonResponse_({ok:false,error:'NOT_CONFIGURED'});
  try {
    const raw=e.postData&&e.postData.contents||'';
    if(raw.length>2200000)return jsonResponse_({ok:false,error:'TOO_LARGE'});
    const envelope=JSON.parse(raw);
    const stamp=Number(envelope.ts),body=String(envelope.body||''),signature=String(envelope.signature||'');
    if(!Number.isFinite(stamp)||Math.abs(Date.now()-stamp)>5*60*1000)return jsonResponse_({ok:false,error:'STALE'});
    const expect=hex_(Utilities.computeHmacSha256Signature(String(envelope.ts)+'.'+body,secret,Utilities.Charset.UTF_8));
    if(!secureEqual_(expect,signature))return jsonResponse_({ok:false,error:'SIGNATURE'});
    const item=JSON.parse(body);
    if(item.source!=='youdu-teahouse'||!/^[a-f0-9-]{16,50}$/i.test(item.deviceId)||!/^\d{4}-\d{2}-\d{2}$/.test(item.day)||!item.snapshot||item.snapshot.version!==3||!Array.isArray(item.snapshot.orders))return jsonResponse_({ok:false,error:'INVALID_LEDGER'});
    const filename='有度茶舍_自动备份_'+item.day+'_'+item.deviceId+'.json';
    const lock=LockService.getScriptLock();lock.waitLock(20000);
    try {
      const folder=DriveApp.getFolderById(BACKUP_FOLDER_ID);
      const existing=folder.getFilesByName(filename);
      if(existing.hasNext()) {
        const file=existing.next();
        const old=JSON.parse(file.getBlob().getDataAsString('UTF-8'));
        if(Date.parse(old.savedAt)>Date.parse(item.savedAt))return jsonResponse_({ok:true,file:filename,ignoredStale:true});
        file.setContent(body);
      } else {
        folder.createFile(filename,body,MimeType.PLAIN_TEXT);
      }
    } finally {lock.releaseLock();}
    return jsonResponse_({ok:true,file:filename});
  } catch(err) {
    console.error('Backup error',String(err).slice(0,200));
    return jsonResponse_({ok:false,error:'WRITE_FAILED'});
  }
}