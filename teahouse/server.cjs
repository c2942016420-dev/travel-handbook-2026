'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=__dirname,PORT=Number(process.env.PORT||10000),USER=process.env.YOUDU_LOGIN_USER,PASS=process.env.YOUDU_LOGIN_PASSWORD,SECRET=process.env.YOUDU_SESSION_SECRET;
if(!USER||!PASS||!SECRET||SECRET.length<32){console.error('Missing authentication environment variables');process.exit(1);}
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
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8'};
function staticFile(req,res,pathname){
 let u;try{u=decodeURIComponent(pathname);}catch{return reply(res,400,'Bad request');}
 if(u==='/')u='/index.html';
 if(u.includes('\\')||u.includes('\0')||u.split('/').includes('..')||u.split('/').slice(1).some(p=>p.startsWith('.')))return reply(res,403,'Forbidden');
 const f=path.resolve(ROOT,'.'+u),ext=path.extname(f).toLowerCase();
 if(!f.startsWith(ROOT+path.sep)||!Object.hasOwn(types,ext))return reply(res,404,'Not found');
 fs.stat(f,(err,st)=>{if(err||!st.isFile())return reply(res,404,'Not found');common(res);res.setHeader('Content-Type',types[ext]);res.setHeader('Cache-Control','private, no-store');res.setHeader('Service-Worker-Allowed','/');res.writeHead(200);const stream=fs.createReadStream(f);stream.on('error',()=>res.destroy());stream.pipe(res);});
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
 if(req.method==='GET'||req.method==='HEAD')return staticFile(req,res,p);
 return reply(res,405,'Method not allowed','text/plain');
}).listen(PORT,'0.0.0.0',()=>console.log('YOUDU protected app listening on '+PORT));