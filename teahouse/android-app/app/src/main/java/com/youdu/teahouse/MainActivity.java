package com.youdu.teahouse;

import android.app.Activity;
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
 * 有度茶舍 V11 - completely bundled offline app shell.
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

    private static Map<String,String> buildMimeMap(){
        Map<String,String> m = new HashMap<>();
        m.put("index.html", "text/html");
        m.put("enhancements-v6.js", "application/javascript");
        m.put("enhancements-v7.js", "application/javascript");
        m.put("backup-client-v7.js", "application/javascript");
        m.put("corrections-v8.js", "application/javascript");
        m.put("sync-client-v10.js", "application/javascript");
        m.put("native-offline-v11.js", "application/javascript");
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
                if(rel.startsWith("api/") || rel.equals("login") || rel.equals("logout"))
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
        if(browser!=null){browser.destroy();browser=null;}
        super.onDestroy();
    }
}
