/* 有度茶舍 V18 安卓离线壳：只修改安装版行为，不修改网页版。
 * 资产文件来自 APK，自动数据检查点在本机，联网可选择云端授权。
 */
(function(){
  'use strict';
  const bar=document.getElementById('offlineBar');
  const label=document.getElementById('offlineLabel');
  const help=document.getElementById('offlineHelp');
  const native=window.YouduNative;
  const MUTATING_ACTIONS=new Set([
    'add-to-cart','qty','toggle-product','renew','save-memo',
    'delete-room','import-json','restore-json','correction-save',
    'correction-submit','expense-save','new-session','close-session',
    'expense-new','expense-edit','expense-categories','expense-category-rename','expense-category-delete','entry-void'
  ]);
  const MUTATING_FORMS=new Set([
    'startForm','checkoutForm','productForm','stockForm',
    'purchaseForm','adjustForm','roomEditForm','rateForm','ydV15TemporaryForm','ydV17ProductForm',
    'v6ExpenseForm','v6EntryVoidForm','v16ExpenseCategoryForm'
  ]);
  function primaryReady(){return window.YouduSharedModeV10?.()==='primary';}
  function notInitializedYet(){
    const current=window.YouduSharedModeV10?.()||'local';
    const action=current==='viewer'
      ? '当前是「只读查看」。进入「设置」→「多设备共享账本」，点击「接管主收银权限」。'
      : '此版本尚未成为华为主收银。请联网登录，在「设置」→「多设备共享账本」先点击「只读连接已有账本」，再点击「接管主收银权限」。';
    alert(action+'\\n\\n这是为了防止两台设备各自记账。原房台数据不会因这条提醒而清空。接管成功后可断网结账。');
    // Keep the current modal and its unsubmitted values intact.
  }
  // Prevent a fresh install from accumulating a second disconnected real-money ledger.
  document.addEventListener('submit',e=>{
    if(MUTATING_FORMS.has(e.target?.id) && !primaryReady()){
      e.preventDefault();e.stopImmediatePropagation();notInitializedYet();
    }
  },true);
  document.addEventListener('click',e=>{
    const b=e.target.closest('[data-action]');
    if(!b || !MUTATING_ACTIONS.has(b.dataset.action) || primaryReady())return;
    e.preventDefault();e.stopImmediatePropagation();notInitializedYet();
  },true);
  let updateStatus='尚未检查新版',updateDownloadUrl='',updatePending=false;
  if(!native){label.textContent='本机离线资源未准备好';return;}
  document.title='有度茶舍 · 店务管理 V18 安卓版';
  const buildLabel=document.querySelector('.top-state');
  if(buildLabel)buildLabel.textContent='V18 · 离线收银';

  function drawOffline(){
    const online=navigator.onLine;
    bar.classList.toggle('offline',!online);
    bar.classList.toggle('ready',online);
    const mode=window.YouduSharedModeV10?.()||'local';
    const owned=mode==='primary';
    label.textContent=owned
      ? (online?'华为主收银 · 可结账 · 联网同步请查看共享账本状态':
                '华为主收银 · 当前离线 · 结账先保存在本机')
      : '当前尚未接管主收银，结账受保护 · 请前往设置 → 多设备共享账本';
    if(help)help.textContent='离线说明';
  }

  const originalExport=exportFile;
  exportFile=function(filename,content,type){
    try{native.exportFile(String(filename),String(content),String(type||'text/plain'));}
    catch(e){originalExport(filename,content,type);}
  };

  const previousSettings=settingsPage;
  settingsPage=function(){
    return previousSettings()+
     '<section class="panel yd-native-panel"><h3>华为平板离线版 V18</h3>'+
     '<p class="panel-sub">无需网络即可打开本 APP，开台、点单、结账、超时计费与库存都保存在本机。可以在上方导出 JSON 备份，或导入之前的备份文件。</p>'+
     '<p class="panel-sub">正式版 V18 与早期测试版 V11/V12/V13 独立安装，不会覆盖旧版账目。请先确认旧版记录已同步至共享账本；再在 V18 连接已有共享账本并接管主收银。迁移前建议导出完整 JSON 备份。</p>'+
     '<section class="yd-version-panel"><h3>APP 功能更新</h3>'+
     '<p id="ydNativeUpdateStatus" class="panel-sub">'+
     updateStatus.replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</p>'+
     '<div class="form-actions">'+
     '<button class="btn light" type="button" data-action="yd-check-update">检查新版</button>'+
     (updateDownloadUrl?
       '<button class="btn" type="button" data-action="yd-download-update">下载并安装新版本</button>':'')+
     '</div><p class="panel-sub">联网时检查，确认后由 Android 系统安装。离线功能不受影响；本机订单请定期导出 JSON。旧测试版不能保证原位覆盖安装。</p>'+
     '</section>'+
     '<details class="yd-native-online"><summary>联网后连接 iPhone 共享账本（可选）</summary>'+
     '<p class="panel-sub">离线收银不需要登录。只有使用云端备份或共享时才需要登录。共享功能还需要 Google Drive 同步脚本完成升级。</p>'+
     '<form id="ydNativeCloudLogin" class="form-grid">'+
     '<div class="field"><label>云端登录账号</label><input name="username" type="text" autocomplete="username" required></div>'+
     '<div class="field"><label>云端登录密码</label><input name="password" type="password" autocomplete="current-password" required></div>'+
     '<div class="field wide"><button class="btn light" type="submit">联网登录云端</button></div>'+
     '</form><p id="ydNativeCloudStatus" class="panel-sub" aria-live="polite"></p>'+
     '</details></section>';
  };

  const previousRender=render;
  render=function(){previousRender();drawOffline();};

  document.addEventListener('submit',async function(e){
    const form=e.target;
    if(form.id!=='ydNativeCloudLogin')return;
    e.preventDefault();e.stopImmediatePropagation();
    const status=document.getElementById('ydNativeCloudStatus');
    if(!navigator.onLine){status.textContent='当前未联网；请联网后再进行云端登录。';return;}
    const button=form.querySelector('button[type=submit]');
    button.disabled=true;status.textContent='正在验证云端登录…';
    try{
      const body=new URLSearchParams({
        username:form.elements.username.value,password:form.elements.password.value
      });
      const login=await fetch('/login',{
        method:'POST',credentials:'same-origin',redirect:'follow',
        headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:body.toString()
      });
      if(!login.ok)throw Error('账号或密码不正确');
      const statusResponse=await fetch('/api/backup-status',{
        credentials:'same-origin',cache:'no-store'
      });
      if(!statusResponse.ok||!(statusResponse.headers.get('content-type')||'').includes('application/json'))
        throw Error('没有取得云端授权，请核对账号和密码');
      const state=await statusResponse.json();
      if(typeof state.configured!=='boolean')throw Error('云端状态格式不正确');
      form.elements.password.value='';
      status.textContent='云端登录成功。请在设置中的「多设备共享账本」中操作同步。';
    }catch(err){
      status.textContent=String(err.message||'云端连接失败');
    }finally{button.disabled=false;}
  },true);

  async function checkUpdate(){
    if(!navigator.onLine){updateStatus='当前离线：不影响使用，联网后可检查更新';render();return;}
    updateStatus='正在检查服务器上的安装版本…';render();
    try{
      const r=await fetch('/api/app-version',{credentials:'same-origin',cache:'no-store'});
      const typ=r.headers.get('content-type')||'';
      if(!r.ok||!typ.includes('application/json'))throw Error('尚未登录云端，请先登录');
      const j=await r.json();
      if(!Number.isSafeInteger(j.androidVersion)||j.androidVersion<=0)throw Error('云端版本配置异常');
      const mine=Number(native.appVersion());
      updateDownloadUrl='';
      if(j.androidVersion>mine&&j.apkAvailable&&j.downloadUrl){
        updateStatus='发现新版本 '+(j.versionName||j.androidVersion)+'，可下载安装。';
        updateDownloadUrl=j.downloadUrl;
      }else if(j.androidVersion>mine){
        updateStatus='新版安装包正在发布，请稍后检查';
      }else updateStatus='当前已是最新正式安装版，离线功能正常';
    }catch(e){updateStatus=String(e.message||'检查新版失败');updateDownloadUrl='';}
    if(document.getElementById('ydNativeUpdateStatus'))render();
  }
  document.addEventListener('click',e=>{
    const b=e.target.closest('[data-action="yd-check-update"],[data-action="yd-download-update"]');
    if(!b)return;
    e.preventDefault();e.stopImmediatePropagation();
    if(b.dataset.action==='yd-check-update')checkUpdate();
    else if(updateDownloadUrl){
      try{native.downloadInstaller(updateDownloadUrl);updateStatus='已交给 Android 下载管理器。下载完成后会提示安装，请确认。';render();}
      catch(err){updateStatus='下载调用失败，请稍后重试';render();}
    }
  },true);
  window.addEventListener('online',()=>{setTimeout(checkUpdate,3200);});
  setTimeout(()=>{if(navigator.onLine)checkUpdate();},9000);
  help?.addEventListener('click',function(){
    alert('有度茶舍华为离线版：安装包已经包含界面与业务代码，关闭 Wi-Fi 和移动数据后仍可开台、计时、点单、结账、进货、查看本机报表。\n\n账目在本平板保存；更换设备或卸载之前，请到「设置」导出完整 JSON 备份。\n\n苹果手机不会在断网时实时看到华为的新操作，只有联网并完成云端同步设置后才可查看。');
  });
  window.addEventListener('online',drawOffline);
  window.addEventListener('offline',drawOffline);
  drawOffline();
  render();
})();

