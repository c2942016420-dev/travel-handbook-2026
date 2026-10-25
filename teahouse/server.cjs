'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const MOBILE_VERSION=160,APK_PATH='/downloads/youdu-official.apk';
const OFFICIAL_PACKAGE='com.youdu.teahouse.cashier';
const OFFICIAL_CERT_SHA256='f70780886b7132cd6fec2f17ebc4ab5306a4b5f6193c349e6c1cb2c6b474d854';
const ROOT=__dirname,PORT=Number(process.env.PORT||10000),USER=process.env.YOUDU_LOGIN_USER,PASS=process.env.YOUDU_LOGIN_PASSWORD,SECRET=process.env.YOUDU_SESSION_SECRET;
if(!USER||!PASS||!SECRET||SECRET.length<32){console.error('Missing authentication environment variables');process.exit(1);}
const receiveSyncV10=require('./sync-api-v10.cjs');
const PASS_HASH=crypto.createHash('sha256').update(PASS).digest('hex'),DAYS=30*86400000,attempts=new Map();
const favi=fs.readFileSync(path.join(ROOT,'index.html'),'utf8').match(/<link rel="icon" href="(data:image\/png;base64,[^"]+)"/);
const ICON=favi?favi[1]:'';
function sig(t){return crypto.createHmac('sha256',SECRET).update([USER,PASS_HASH,t].join('|')).digest('hex');}
function newToken(){const t=Date.now().toString(36);return t+'.'+sig(t);}
function checkToken(s){const x=typeof s==='string'&&s.match(/^([a-z0-9]+)\.([a-f0-9]{64})$/);if(!x)return false;const n=parseInt(x[1],36);if(!Number.isSafeInteger(n)||n>Date.now()+60000||Date.now()-n>DAYS)return false;const a=Buffer.from(x[2],'hex'),b=Buffer.from(sig(x[1]),'hex');return a.length===b.length&&crypto.timingSafeEqual(a,b);}
function authed(req){const match=(req.headers.cookie||'').match(/(?:^|;\s*)yd_session=([^;]+)/);return checkToken(match?.[1]);}
function common(res){res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Robots-Tag','noindex,nofollow,noarchive');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');res.setHeader('Content-Security-Policy',"default-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");}
function reply(res,code,data,type='text/html; charset=utf-8'){common(res);res.setHeader('Content-Type',type);res.setHeader('Cache-Control','no-store');res.writeHead(code);res.end(data);}
function redirect(res,url,cookie){common(res);res.setHeader('Location',url);res.setHeader('Cache-Control','no-store');if(cookie)res.setHeader('Set-Cookie',cookie);res.writeHead(303);res.end();}
function loginPage(error){return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>有度茶舍 · 登录</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:linear-gradient(140deg,#e9f0e7,#f7f7f3);font-family:-apple-system,BlinkMacSystemFont,PingFang SC,sans-serif;color:#284432;padding:18px}.card{width:min(420px,100%);padding:34px 29px;background:white;border-radius:24px;box-shadow:0 20px 70px #1c332119;text-align:center}.card img{width:78px;height:78px;object-fit:contain}.card h1{font-size:25px;letter-spacing:3px;margin:15px 0 4px;font-weight:650}.sub{color:#8e9b8b;font-size:11px;letter-spacing:2px;margin:8px 0 25px}.msg{color:#728073;font-size:13px;line-height:1.7;margin:0 0 22px}label{text-align:left;display:block;margin:16px 0;color:#5d7564;font-size:12px}input{display:block;border:1px solid #d5e0d6;background:#fff;border-radius:10px;padding:12px;width:100%;font-size:16px;margin-top:7px;min-height:47px;outline-color:#66896d}button{background:#315440;color:white;border:0;border-radius:10px;width:100%;padding:14px;font-size:15px;font-weight:600;margin-top:11px}.hint{font-size:11px;color:#96a096;line-height:1.7;margin:21px 0 0}.error{font-size:12px;color:#a84732;background:#fff0ea;border-radius:8px;padding:12px}</style></head><body><main class="card">'+(ICON?'<img src="'+ICON+'" alt="有度茶舍标志">':'')+'<h1>有度茶舍</h1><p class="sub">YOUDU · TEA HOUSE</p><p class="msg">茶席 · 棋牌 · 进货库存<br>此工作台仅限授权人员使用</p>'+(error?'<p class="error" role="alert">账号或密码不正确</p>':'')+'<form method="POST" action="/login"><label>登录账号<input name="username" autocomplete="username" maxlength="100" required autofocus></label><label>登录密码<input name="password" type="password" autocomplete="current-password" maxlength="256" required></label><button type="submit">登录工作台</button></form><p class="hint">首次登录需联网验证；首次缓存完成后可在本机断网使用。</p></main></body></html>';}
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8','.apk':'application/vnd.android.package-archive'};
function staticFile(req,res,pathname){
 let u;try{u=decodeURIComponent(pathname);}catch{return reply(res,400,'Bad request');}
 if(u==='/')u='/index.html';
 if(u.includes('\\')||u.includes('\0')||u.split('/').includes('..')||u.split('/').slice(1).some(p=>p.startsWith('.')))return reply(res,403,'Forbidden');
 const f=path.resolve(ROOT,'.'+u),ext=path.extname(f).toLowerCase();
 if(!f.startsWith(ROOT+path.sep)||!Object.hasOwn(types,ext))return reply(res,404,'Not found');
 fs.stat(f,(err,st)=>{if(err||!st.isFile())return reply(res,404,'Not found');common(res);res.setHeader('Content-Type',types[ext]);res.setHeader('Cache-Control','private, no-store');
  if(ext==='.apk')res.setHeader('Content-Disposition','attachment; filename="Youdu-Teahouse-Huawei.apk"');
  res.setHeader('Service-Worker-Allowed','/');res.writeHead(200);const stream=fs.createReadStream(f);stream.on('error',()=>res.destroy());stream.pipe(res);});
}

/* Optional independent Google Drive authorization via Apps Script.
   Backups are sent directly to Drive; Render retains no ledger database. */
const BACKUP_SCRIPT=String(process.env.YOUDU_GOOGLE_BACKUP_URL||'').trim();
const BACKUP_SECRET=String(process.env.YOUDU_BACKUP_SECRET||'').trim();
function backupReady(){
  try{const u=new URL(BACKUP_SCRIPT);return u.protocol==='https:'&&u.hostname==='script.google.com'&&BACKUP_SECRET.length>=48;}
  catch(e){return false;}
}
function replyJSON(res,code,body){return reply(res,code,JSON.stringify(body),'application/json; charset=utf-8');}
async function receiveBackup(req,res){
  if(!backupReady())return replyJSON(res,503,{ok:false,code:'NOT_AUTHORIZED',message:'Google Drive 尚未完成独立授权'});
  if(req.headers.origin&&req.headers.origin!=='https://'+req.headers.host)return replyJSON(res,403,{ok:false,code:'ORIGIN_DENIED'});
  if(!(req.headers['content-type']||'').startsWith('application/json'))return replyJSON(res,415,{ok:false,code:'JSON_REQUIRED'});
  let raw='',exceeded=false;
  for await(const chunk of req){raw+=chunk.toString('utf8');if(raw.length>1800000){exceeded=true;break;}}
  if(exceeded)return replyJSON(res,413,{ok:false,code:'TOO_LARGE'});
  let doc;try{doc=JSON.parse(raw);}catch{return replyJSON(res,400,{ok:false,code:'INVALID_JSON'});}
  const snapshot=doc.snapshot,deviceId=String(doc.deviceId||''),day=String(doc.day||'');
  if(!/^[a-f0-9-]{16,50}$/i.test(deviceId)||!/^\d{4}-\d{2}-\d{2}$/.test(day)||!snapshot||snapshot.version!==3||!Array.isArray(snapshot.orders)||!Array.isArray(snapshot.inventory)||!Array.isArray(snapshot.movements)||!Array.isArray(snapshot.products)||!snapshot.sessions)return replyJSON(res,422,{ok:false,code:'INVALID_LEDGER'});
  const savedAt=new Date().toISOString();
  const body=JSON.stringify({source:'youdu-teahouse',savedAt,day,deviceId,snapshot});
  const ts=String(Date.now());
  const signature=crypto.createHmac('sha256',BACKUP_SECRET).update(ts+'.'+body).digest('hex');
  try{
    const response=await fetch(BACKUP_SCRIPT,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({ts,body,signature}),signal:AbortSignal.timeout(24000)});
    const responseBody=(await response.text()).slice(0,2048);
    let result;
    try{result=JSON.parse(responseBody);}
    catch{
      const host=new URL(response.url).hostname,ct=String(response.headers.get('content-type')||'').split(';')[0];
      const kind=host.includes('accounts.google.com')||/sign in|signin|log in/i.test(responseBody)?'GOOGLE_LOGIN_REQUIRED':/exception|error occurred/i.test(responseBody)?'GOOGLE_SCRIPT_EXCEPTION':ct==='text/html'?'GOOGLE_HTML_RESPONSE':'GOOGLE_INVALID_JSON';
      console.error('[backup-upload-failed]',JSON.stringify({http:response.status,host,type:ct,kind}));
      return replyJSON(res,502,{ok:false,code:kind});
    }
    if(!response.ok||!result.ok){
      const error=String(result.error||'UPSTREAM_ERROR').replace(/[^A-Z0-9_]/g,'').slice(0,40);
      console.error('[backup-upload-failed]',JSON.stringify({http:response.status,code:error}));
      return replyJSON(res,502,{ok:false,code:'DRIVE_'+error});
    }
    return replyJSON(res,200,{ok:true,file:result.file||null,savedAt,day,deviceId});
  }catch(e){return replyJSON(res,502,{ok:false,code:'DRIVE_UNAVAILABLE'});}
}


/* Read-only diagnostic: report status/category only, never response body, tokens or secrets. */
async function diagnoseBackupLink(){
 if(!backupReady()){console.log('[backup-check] NOT_CONFIGURED');return;}
 try{
  const response=await fetch(BACKUP_SCRIPT,{method:'GET',redirect:'follow',signal:AbortSignal.timeout(16000)});
  const ct=String(response.headers.get('content-type')||'');
  const host=new URL(response.url).hostname;
  const body=(await response.text()).slice(0,6000);
  let kind='NOT_JSON';
  try {const parsed=JSON.parse(body);kind=parsed.service==='YOUDU Drive backup receiver'&&parsed.ok===true?'PUBLIC_JSON_OK':parsed.error||'OTHER_JSON';}
  catch {kind=host.includes('accounts.google.com')||/sign in|signin|log in/i.test(body)?'GOOGLE_LOGIN_REQUIRED':/exception|error occurred/i.test(body)?'GOOGLE_SCRIPT_ERROR_PAGE':ct.includes('text/html')?'HTML_RESPONSE':'UNEXPECTED_RESPONSE';}
  const title=String((body.match(/<title[^>]*>([^<]*)<\/title>/i)||[])[1]||'').replace(/[^\p{L}\p{N} .,:!?;()_-]/gu,'').slice(0,100);
  const markers={auth:/authorization|authorize|permission|access denied|sign in|login|log in|not verified/i.test(body),
    notFound:/file not found|script function not found|could not find|does not exist|unable to open|can't open|not available/i.test(body),
    googleError:/google apps script|the script completed|we're sorry|sorry|error/i.test(body)};
  const excerpt=body
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/&[a-z0-9#]+;/gi,' ')
    .replace(/https?:\/\/\S+/gi,'[url]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,'[email]')
    .replace(/\s+/g,' ').trim().slice(0,320);
  console.log('[backup-check]',JSON.stringify({status:response.status,host,contentType:ct.split(';')[0],kind,title,markers,excerpt}));
 }catch(e){console.log('[backup-check]',JSON.stringify({kind:'NETWORK_ERROR',name:e.name||'Error'}));}
}


http.createServer((req,res)=>{
 const p=new URL(req.url,'http://localhost').pathname;
 if(req.method==='GET'&&p==='/healthz')return reply(res,200,'ok','text/plain');
 if(req.method==='GET'&&p==='/login')return authed(req)?redirect(res,'/'):reply(res,200,loginPage(false));
 if(req.method==='POST'&&p==='/login'){
  let s='';req.on('data',b=>{s+=b.toString();if(s.length>4096)req.destroy();});
  req.on('end',()=>{const k=req.socket.remoteAddress||'unknown',now=Date.now();let a=attempts.get(k)||{count:0,until:now+600000};if(a.until<now)a={count:0,until:now+600000};if(a.count>=12)return reply(res,429,'尝试次数过多，请稍后再试');const d=new URLSearchParams(s),user=d.get('username')||'',pass=d.get('password')||'';const v=crypto.createHash('sha256').update(user).digest(),w=crypto.createHash('sha256').update(USER).digest(),x=crypto.createHash('sha256').update(pass).digest(),y=Buffer.from(PASS_HASH,'hex');if(crypto.timingSafeEqual(v,w)&&crypto.timingSafeEqual(x,y)){attempts.delete(k);return redirect(res,'/','yd_session='+newToken()+'; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=2592000');}a.count++;attempts.set(k,a);return reply(res,401,loginPage(true));});return;
 }
 if(req.method==='POST'&&p==='/logout')return redirect(res,'/login','yd_session=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0');
 if(!authed(req)){common(res);res.setHeader('Location','/login');res.setHeader('Cache-Control','no-store');res.writeHead(302);return res.end();}
 if(req.method==='GET'&&p==='/api/app-version'){
  const apkFile=path.join(ROOT,'downloads','youdu-official.apk');
  const manifestFile=path.join(ROOT,'downloads','youdu-official.json');
  let available=false;
  try{
    const meta=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
    const stat=fs.statSync(apkFile);
    if(stat.size>60000 && stat.size<15000000 &&
      meta.androidVersion===MOBILE_VERSION &&
      meta.packageId===OFFICIAL_PACKAGE &&
      meta.signerSHA256===OFFICIAL_CERT_SHA256 &&
      /^[a-f0-9]{64}$/.test(meta.apkSHA256||'')){
      const realHash=crypto.createHash('sha256').update(fs.readFileSync(apkFile)).digest('hex');
      available=realHash===meta.apkSHA256;
    }
  }catch{}
  return replyJSON(res,200,{ok:true,androidVersion:MOBILE_VERSION,
   versionName:'有度茶舍 V16 正式签名版',packageId:OFFICIAL_PACKAGE,
   apkAvailable:available,downloadUrl:available?APK_PATH:null,
   updateRequiresConfirmation:true,
   note:available?'固定包名与签名，Android 确认安装更新':'正式版下载未发布到服务器，请通过已核验的安装包更新'});
 }
 if(req.method==='GET'&&p==='/api/backup-status')return replyJSON(res,200,{configured:backupReady(),destination:'Google Drive',note:backupReady()?'仅设备联网且打开本APP时自动上传':'尚未授权，自动备份未运行'});
 if(req.method==='POST'&&p==='/api/backup'){receiveBackup(req,res).catch(()=>replyJSON(res,500,{ok:false,code:'BACKUP_EXCEPTION'}));return;}
 if(req.method==='POST'&&p==='/api/sync'){receiveSyncV10(req,res,{backupReady,backupUrl:BACKUP_SCRIPT,backupSecret:BACKUP_SECRET,replyJSON}).catch(()=>replyJSON(res,500,{ok:false,code:'SYNC_INTERNAL'}));return;}
 if(req.method==='GET'||req.method==='HEAD')return staticFile(req,res,p);
 return reply(res,405,'Method not allowed','text/plain');
}).listen(PORT,'0.0.0.0',()=>{console.log('YOUDU protected app listening on '+PORT);diagnoseBackupLink();});

