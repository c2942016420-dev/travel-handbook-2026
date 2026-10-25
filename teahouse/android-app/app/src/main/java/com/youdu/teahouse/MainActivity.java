package com.youdu.teahouse;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.IntentFilter;
import android.database.Cursor;
import android.os.Environment;
import android.print.PrintManager;
import android.print.PrintAttributes;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.AtomicFile;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

/**
 * 有度茶舍 V14 production identity - bundled offline POS, optional online cloud sync.
 * UI, data, timers and inventory are loaded from APK assets, not from Render.
 * Authenticated /api/ requests only attempt the online service when available.
 * Kept as a distinct applicationId so the previous app's data is not overwritten.
 */
public class MainActivity extends Activity {
    private static final String HOME = "https://youdu-teahouse-private.onrender.com/index.html";
    private static final String HOST = "youdu-teahouse-private.onrender.com";
    private static final int FILE_CHOOSER = 907;
    private static final int EXPORT_DOCUMENT = 908;
    private static final int MAX_LEDGER_BYTES = 1800000;
    private static final Map<String,String> LOCAL_MIME = buildMimeMap();

    private WebView browser;
    private ValueCallback<Uri[]> fileCallback;
    private byte[] pendingExport;
    private final Object ledgerLock = new Object();
    private AtomicFile snapshotFile;
    private WebView receiptView;
    private ThermalPrinter thermalPrinter;
    private long currentApkDownloadId=-1;
    private BroadcastReceiver downloadReceiver;

    private static Map<String,String> buildMimeMap(){
        Map<String,String> m = new HashMap<>();
        m.put("index.html", "text/html");
        m.put("enhancements-v6.js", "application/javascript");
        m.put("enhancements-v7.js", "application/javascript");
        m.put("backup-client-v7.js", "application/javascript");
        m.put("corrections-v8.js", "application/javascript");
        m.put("sync-client-v12.js", "application/javascript");
        m.put("receipt-client-v14_1.js", "application/javascript");
        m.put("native-offline-v14_1.js", "application/javascript");
        m.put("theme-v9.css", "text/css");
        m.put("manifest.webmanifest", "application/manifest+json");
        m.put("assets/brand-logo.png", "image/png");
        m.put("assets/theme-bamboo.svg", "image/svg+xml");
        m.put("assets/theme-leaf.svg", "image/svg+xml");
        m.put("assets/app-icon.svg", "image/svg+xml");
        return Collections.unmodifiableMap(m);
    }

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        snapshotFile=new AtomicFile(new File(getFilesDir(),"youdu-ledger-checkpoint.json"));
        downloadReceiver=new BroadcastReceiver(){
            @Override public void onReceive(Context c,Intent i){
                long finished=i.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID,-1);
                if(finished!=-1 && finished==currentApkDownloadId)
                    openDownloadedInstaller(finished);
            }
        };
        IntentFilter completed=new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if(android.os.Build.VERSION.SDK_INT>=33)
            registerReceiver(downloadReceiver,completed,Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(downloadReceiver,completed);
        getWindow().setStatusBarColor(0xfff8f7f1);
        getWindow().setNavigationBarColor(0xfff8f7f1);
        getWindow().getDecorView().setSystemUiVisibility(
          View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        browser = new WebView(this);
        browser.setBackgroundColor(0xfff8f7f1);
        setContentView(browser);
        WebSettings settings = browser.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        // Needed for the Android document picker to import a user-selected JSON backup.
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setTextZoom(100);
        if(android.os.Build.VERSION.SDK_INT >= 26)settings.setSafeBrowsingEnabled(true);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(browser, false);

        // Only the local bundled app is displayed inside this WebView.
        // Other navigation opens the OS browser; unknown subresources are blocked.
        thermalPrinter=new ThermalPrinter(this,browser);
        browser.addJavascriptInterface(new NativeFileBridge(), "YouduNative");
        browser.setWebViewClient(new WebViewClient(){
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request){
                Uri uri=request.getUrl();
                if(!"https".equalsIgnoreCase(uri.getScheme()) ||
                    !HOST.equalsIgnoreCase(uri.getHost())){
                    if("data".equalsIgnoreCase(uri.getScheme()) ||
                        "blob".equalsIgnoreCase(uri.getScheme()))return null;
                    return forbiddenResponse();
                }
                if(!"GET".equalsIgnoreCase(request.getMethod()))return null;
                String rel=uri.getPath();
                if(rel==null || rel.equals("/"))rel="/index.html";
                if(!rel.startsWith("/"))return forbiddenResponse();
                rel=rel.substring(1);
                final String mime=LOCAL_MIME.get(rel);
                if(mime!=null){
                    try{
                        InputStream input=getAssets().open("youdu/"+rel);
                        return new WebResourceResponse(mime,mime.startsWith("image/")?null:"UTF-8",input);
                    }catch(IOException e){
                        return forbiddenResponse();  // Never silently fall back to a live web file.
                    }
                }
                // Online-only endpoints. Offline UI remains usable when they fail.
                if(rel.startsWith("api/") || rel.startsWith("downloads/") ||
                   rel.equals("login") || rel.equals("logout"))
                    return null;
                return forbiddenResponse();
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request){
                if(!request.isForMainFrame())return false;
                Uri uri=request.getUrl();
                if("https".equalsIgnoreCase(uri.getScheme()) &&
                   HOST.equalsIgnoreCase(uri.getHost()) &&
                   ("/".equals(uri.getPath()) || "/index.html".equals(uri.getPath())))
                    return false;
                if("https".equalsIgnoreCase(uri.getScheme())){
                    try{startActivity(new Intent(Intent.ACTION_VIEW,uri));}
                    catch(Exception ignored){}
                }else{
                    Toast.makeText(MainActivity.this,"请在设置中操作云端连接",Toast.LENGTH_LONG).show();
                }
                return true;
            }
        });
        browser.setWebChromeClient(new WebChromeClient(){
            @Override public boolean onShowFileChooser(WebView webView,ValueCallback<Uri[]> cb,
                    FileChooserParams params) {
                if(fileCallback!=null)fileCallback.onReceiveValue(null);
                fileCallback=cb;
                try{
                    startActivityForResult(params.createIntent(),FILE_CHOOSER);
                    return true;
                }catch(Exception e){
                    fileCallback=null;return false;
                }
            }
        });
        if(savedInstanceState!=null)browser.restoreState(savedInstanceState);
        else browser.loadUrl(HOME);
    }

    private static WebResourceResponse forbiddenResponse(){
        WebResourceResponse r=new WebResourceResponse("text/plain","UTF-8",
          new java.io.ByteArrayInputStream(new byte[0]));
        r.setStatusCodeAndReasonPhrase(403,"Forbidden");
        return r;
    }

    // This bridge is only for the bundled HTML. All third-party content is blocked.
    public final class NativeFileBridge {
        @JavascriptInterface public String appVersion(){return "170";}
        @JavascriptInterface public String printerInfo(){
            return thermalPrinter!=null?thermalPrinter.info():"{\"ok\":false}";
        }
        @JavascriptInterface public String printerSelect(
            String mode,String id,String host,int port,int paperWidth){
            return thermalPrinter!=null?thermalPrinter.select(mode,id,host,port,paperWidth):
                "{\"ok\":false,\"message\":\"打印服务尚未启动\"}";
        }
        @JavascriptInterface public String printerUsbPermission(String deviceId){
            return thermalPrinter!=null?thermalPrinter.requestUsb(deviceId):
                "{\"ok\":false,\"message\":\"USB 服务未启动\"}";
        }
        @JavascriptInterface public String printerBluetoothPermission(){
            return thermalPrinter!=null?thermalPrinter.requestBluetooth():
                "{\"ok\":false,\"message\":\"蓝牙服务未启动\"}";
        }
        @JavascriptInterface public void printerProbe(){
            if(thermalPrinter!=null)thermalPrinter.probe();
        }
        @JavascriptInterface public void printerTest(){
            if(thermalPrinter!=null)thermalPrinter.test();
        }
        @JavascriptInterface public void printerPrint(
            String orderJSON,boolean reprint,boolean trial){
            if(thermalPrinter!=null)thermalPrinter.enqueue(orderJSON,reprint,trial);
        }


        @JavascriptInterface public void printReceipt(String markup){
            if(markup==null||markup.length()>200000 || !markup.startsWith("<!doctype html>"))return;
            new Handler(Looper.getMainLooper()).post(()->{
                try{
                    final WebView ticket=new WebView(MainActivity.this);
                    receiptView=ticket;
                    ticket.getSettings().setJavaScriptEnabled(true);
                    ticket.setWebViewClient(new WebViewClient(){
                        @Override public void onPageFinished(WebView page,String url){
                            try{
                                PrintManager mgr=(PrintManager)getSystemService(Context.PRINT_SERVICE);
                                PrintAttributes attrs=new PrintAttributes.Builder()
                                    .setColorMode(PrintAttributes.COLOR_MODE_MONOCHROME).build();
                                mgr.print("有度茶舍结账小票",
                                  page.createPrintDocumentAdapter("有度茶舍小票"),attrs);
                            }catch(Exception e){
                                Toast.makeText(MainActivity.this,
                                 "未能打开系统打印；请在订单详情重试",Toast.LENGTH_LONG).show();
                            }
                        }
                    });
                    ticket.loadDataWithBaseURL(HOME,markup,"text/html","UTF-8",null);
                }catch(Exception e){
                    Toast.makeText(MainActivity.this,
                     "打印服务暂不可用，不影响已保存的订单",Toast.LENGTH_LONG).show();
                }
            });
        }

        @JavascriptInterface public void downloadInstaller(String relativePath){
            if(!"/downloads/youdu-huawei.apk".equals(relativePath))return;
            new Handler(Looper.getMainLooper()).post(()->{
                try{
                    String cookie=CookieManager.getInstance().getCookie(HOME);
                    if(cookie==null||!cookie.contains("yd_session=")){
                        Toast.makeText(MainActivity.this,
                            "请先登录云端再下载新版",Toast.LENGTH_LONG).show();
                        return;
                    }
                    DownloadManager manager=(DownloadManager)getSystemService(DOWNLOAD_SERVICE);
                    DownloadManager.Request request=new DownloadManager.Request(
                      Uri.parse("https://"+HOST+relativePath));
                    request.addRequestHeader("Cookie",cookie);
                    request.setMimeType("application/vnd.android.package-archive");
                    request.setTitle("有度茶舍 · 离线版更新");
                    request.setDescription("下载完成后由 Android 系统确认安装");
                    request.setNotificationVisibility(
                      DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                    request.setDestinationInExternalFilesDir(MainActivity.this,
                      Environment.DIRECTORY_DOWNLOADS,"youdu-huawei-update.apk");
                    currentApkDownloadId=manager.enqueue(request);
                    Toast.makeText(MainActivity.this,
                        "已开始下载新版，下载完成后将请求安装",Toast.LENGTH_LONG).show();
                }catch(Exception e){
                    Toast.makeText(MainActivity.this,
                       "下载失败，请使用聊天中的 APK 链接更新",Toast.LENGTH_LONG).show();
                }
            });
        }
        @JavascriptInterface public void checkpoint(String value){
            if(value==null || value.length()>MAX_LEDGER_BYTES)return;
            try{
                JSONObject j=new JSONObject(value);
                if(j.optInt("version")!=3 || j.optJSONArray("orders")==null ||
                   j.optJSONArray("inventory")==null || j.optJSONArray("products")==null)return;
            }catch(Exception e){return;}
            synchronized(ledgerLock){
                FileOutputStream output=null;
                try{
                    output=snapshotFile.startWrite();
                    output.write(value.getBytes(StandardCharsets.UTF_8));
                    snapshotFile.finishWrite(output);
                }catch(Exception e){
                    if(output!=null)snapshotFile.failWrite(output);
                }
            }
        }

        @JavascriptInterface public String recoverCheckpoint(){
            synchronized(ledgerLock){
                try(InputStream in=snapshotFile.openRead()){
                    ByteArrayOutputStream out=new ByteArrayOutputStream();
                    byte[] buf=new byte[8192];
                    int len;
                    while((len=in.read(buf))!=-1){
                        if(out.size()+len>MAX_LEDGER_BYTES)return "";
                        out.write(buf,0,len);
                    }
                    String body=out.toString("UTF-8");
                    JSONObject j=new JSONObject(body);
                    return j.optInt("version")==3 && j.optJSONArray("orders")!=null ? body : "";
                }catch(Exception e){return "";}
            }
        }

        @JavascriptInterface public void exportFileBase64(String name,String value,String mime){
            if(value==null || value.length()>MAX_LEDGER_BYTES*2)return;
            try{
                byte[] bytes=android.util.Base64.decode(value,android.util.Base64.DEFAULT);
                if(bytes.length>MAX_LEDGER_BYTES || bytes.length<4 || bytes[0]!=80 || bytes[1]!=75)return;
                queueExport(name,bytes,"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            }catch(Exception ignored){}
        }
        private void queueExport(String name,byte[] bytes,String finalMime){
            final String filename=name==null?"有度茶舍_库存.xlsx":name.replaceAll("[/\\\\\\u0000-\\u001f]","_").substring(0,Math.min(name.length(),128));
            new Handler(Looper.getMainLooper()).post(()->{
                if(pendingExport!=null){Toast.makeText(MainActivity.this,"请先保存上一份文件",Toast.LENGTH_SHORT).show();return;}
                pendingExport=bytes;
                Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType(finalMime);intent.putExtra(Intent.EXTRA_TITLE,filename);
                try{startActivityForResult(intent,EXPORT_DOCUMENT);}catch(Exception e){pendingExport=null;}
            });
        }
        @JavascriptInterface public void exportFile(String name,String value,String mime){
            if(value==null || value.length()>MAX_LEDGER_BYTES)return;
            final String filename=name==null?"有度茶舍_备份.json":
                name.replaceAll("[/\\\\\\u0000-\\u001f]","_").substring(0,Math.min(name.length(),128));
            final boolean csv=filename.toLowerCase().endsWith(".csv");
            final String finalMime=csv?"text/csv":filename.toLowerCase().endsWith(".json")?
                "application/json":"text/plain";
            byte[] bytes=(csv?"\uFEFF"+value:value).getBytes(StandardCharsets.UTF_8);
            if(bytes.length>MAX_LEDGER_BYTES)return;
            new Handler(Looper.getMainLooper()).post(()->{
                if(pendingExport!=null){
                    Toast.makeText(MainActivity.this,"请先保存上一份文件",Toast.LENGTH_SHORT).show();
                    return;
                }
                pendingExport=bytes;
                Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType(finalMime);
                intent.putExtra(Intent.EXTRA_TITLE,filename);
                try{startActivityForResult(intent,EXPORT_DOCUMENT);}
                catch(Exception e){pendingExport=null;}
            });
        }
    }

    private void openDownloadedInstaller(long id){
        try{
            DownloadManager mgr=(DownloadManager)getSystemService(DOWNLOAD_SERVICE);
            try(Cursor c=mgr.query(new DownloadManager.Query().setFilterById(id))){
                if(c==null || !c.moveToFirst() ||
                   c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
                    !=DownloadManager.STATUS_SUCCESSFUL){
                    Toast.makeText(this,"下载未完成；请检查网络或通知栏",Toast.LENGTH_LONG).show();
                    return;
                }
            }
            Uri downloaded=mgr.getUriForDownloadedFile(id);
            if(downloaded==null)throw new IOException("Missing downloaded URI");
            Intent installer=new Intent(Intent.ACTION_VIEW);
            installer.setDataAndType(downloaded,"application/vnd.android.package-archive");
            installer.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(installer);
        }catch(Exception e){
            Toast.makeText(this,"安装程序未打开，可从下载文件中手动安装",Toast.LENGTH_LONG).show();
        }
    }

    @Override protected void onActivityResult(int req,int result,Intent incoming){
        super.onActivityResult(req,result,incoming);
        if(req==FILE_CHOOSER && fileCallback!=null){
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result,incoming));
            fileCallback=null;
        }
        if(req==EXPORT_DOCUMENT){
            final byte[] bytes=pendingExport;pendingExport=null;
            if(result==RESULT_OK && incoming!=null && incoming.getData()!=null && bytes!=null){
                try(OutputStream output=getContentResolver().openOutputStream(incoming.getData())){
                    if(output==null)throw new IOException("Cannot open output");
                    output.write(bytes);
                    output.flush();
                    Toast.makeText(this,"有度茶舍文件已保存",Toast.LENGTH_SHORT).show();
                }catch(Exception e){
                    Toast.makeText(this,"保存失败，请重试",Toast.LENGTH_LONG).show();
                }
            }
        }
    }

    @Override protected void onSaveInstanceState(Bundle state){
        super.onSaveInstanceState(state);
        if(browser!=null)browser.saveState(state);
    }
    @Override public void onBackPressed(){
        if(browser!=null && browser.canGoBack())browser.goBack();
        else super.onBackPressed();
    }
    @Override protected void onDestroy(){
        try{if(downloadReceiver!=null)unregisterReceiver(downloadReceiver);}catch(Exception ignored){}
        if(thermalPrinter!=null){thermalPrinter.close();thermalPrinter=null;}
        if(receiptView!=null){receiptView.destroy();receiptView=null;}
        if(browser!=null){browser.destroy();browser=null;}
        super.onDestroy();
    }
}


