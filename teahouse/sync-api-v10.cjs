'use strict';
/* V10 authenticated two-device sync relay. No server-side ledger storage. */
const crypto=require('node:crypto');
const OPERATIONS=new Set(['read','init','put','claim']);
const VALID_ID=/^[a-f0-9-]{16,50}$/i;
function validLedger(s){
 return !!(s&&s.version===3&&Array.isArray(s.rooms)&&Array.isArray(s.products)&&
  Array.isArray(s.inventory)&&Array.isArray(s.orders)&&Array.isArray(s.movements)&&
  s.sessions&&typeof s.sessions==='object'&&!Array.isArray(s.sessions));
}
module.exports=async function receiveSync(req,res,opt){
 const respond=opt.replyJSON;
 if(!opt.backupReady())return respond(res,503,{ok:false,code:'SYNC_NOT_CONFIGURED'});
 if(req.headers.origin&&req.headers.origin!=='https://'+req.headers.host)
  return respond(res,403,{ok:false,code:'ORIGIN_DENIED'});
 if(!(req.headers['content-type']||'').startsWith('application/json'))
  return respond(res,415,{ok:false,code:'JSON_REQUIRED'});
 let raw='',oversized=false;
 try{
  for await(const chunk of req){
   raw+=chunk.toString('utf8');
   if(raw.length>1900000){oversized=true;break;}
  }
 }catch{return respond(res,400,{ok:false,code:'REQUEST_INTERRUPTED'});}
 if(oversized)return respond(res,413,{ok:false,code:'TOO_LARGE'});
 let request;
 try{request=JSON.parse(raw);}catch{return respond(res,400,{ok:false,code:'INVALID_JSON'});}
 if(!request||!OPERATIONS.has(request.op)||!VALID_ID.test(request.deviceId||''))
  return respond(res,400,{ok:false,code:'BAD_REQUEST'});
 if(['put','claim'].includes(request.op)&&
  (!Number.isSafeInteger(request.expectedRevision)||request.expectedRevision<1))
  return respond(res,400,{ok:false,code:'BAD_REVISION'});
 if(['put','init'].includes(request.op)&&!validLedger(request.snapshot))
  return respond(res,422,{ok:false,code:'INVALID_LEDGER'});
 if(request.snapshot&&JSON.stringify(request.snapshot).length>1700000)
  return respond(res,413,{ok:false,code:'LEDGER_TOO_LARGE'});
 const body=JSON.stringify({source:'youdu-teahouse-sync',op:request.op,
  deviceId:request.deviceId,expectedRevision:request.expectedRevision,
  snapshot:['put','init'].includes(request.op)?request.snapshot:undefined});
 const ts=String(Date.now());
 const signature=crypto.createHmac('sha256',opt.backupSecret).update(ts+'.'+body).digest('hex');
 try{
  const response=await fetch(opt.backupUrl,{method:'POST',
   headers:{'Content-Type':'text/plain;charset=utf-8'},
   body:JSON.stringify({ts,body,signature}),signal:AbortSignal.timeout(29000)});
  const text=(await response.text());
  if(text.length>1900000)return respond(res,502,{ok:false,code:'SYNC_RESPONSE_TOO_LARGE'});
  let result;
  try{result=JSON.parse(text);}catch{return respond(res,502,{ok:false,code:'SYNC_PROVIDER_RESPONSE'});}
  if(!response.ok)return respond(res,502,{ok:false,code:'SYNC_PROVIDER_ERROR'});
  if(!result||result.ok!==true){
   const code=String(result&&result.error||'PROVIDER_ERROR').replace(/[^A-Z0-9_]/g,'').slice(0,45);
   const status=['CONFLICT','ALREADY_INITIALIZED','READ_ONLY'].includes(code)?409:
    ['BUSY'].includes(code)?423:code==='INVALID_LEDGER'?422:
    code==='INVALID_LEDGER'||code==='BAD_REQUEST'?400:
    503;
   return respond(res,status,{ok:false,code:code==='INVALID_LEDGER'?'SYNC_UPGRADE_REQUIRED':code,
    revision:Number.isSafeInteger(result&&result.revision)?result.revision:undefined});
  }
  if(request.op==='read'){
   if(result.initialized&&!validLedger(result.snapshot))
    return respond(res,502,{ok:false,code:'SYNC_INVALID_REMOTE'});
   return respond(res,200,{ok:true,initialized:!!result.initialized,
    revision:result.revision||0,ownerDevice:result.ownerDevice||'',
    updatedAt:result.updatedAt||'',snapshot:result.initialized?result.snapshot:undefined});
  }
  return respond(res,200,{ok:true,initialized:!!result.initialized,revision:result.revision,
   ownerDevice:result.ownerDevice,updatedAt:result.updatedAt||''});
 }catch(e){
  console.error('[sync-error]',e&&e.name||'FAILED');
  return respond(res,502,{ok:false,code:'SYNC_UNAVAILABLE'});
 }
};
