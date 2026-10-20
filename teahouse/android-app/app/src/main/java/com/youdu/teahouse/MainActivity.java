package com.youdu.teahouse;

import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.net.Uri;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.ValueCallback;
import android.webkit.WebResourceError;
import android.app.AlertDialog;
import android.widget.LinearLayout;
import android.widget.Button;
import android.widget.Toast;
import org.json.JSONObject;
import org.json.JSONTokener;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    private static final String HOME = "https://youdu-teahouse-private.onrender.com/";
    private static final String HOST = "youdu-teahouse-private.onrender.com";
    private static final int FILE_CHOOSER = 907;
    private static final int SAVE_DOCUMENT = 908;
    private WebView browser;
    private ValueCallback<Uri[]> fileCallback;
    private byte[] pendingExport;

    private boolean trusted(Uri uri) {
        return uri != null && "https".equalsIgnoreCase(uri.getScheme()) &&
            HOST.equalsIgnoreCase(uri.getHost()) && (uri.getPort()==-1 || uri.getPort()==443);
    }
    private boolean ledgerPage() {
        Uri uri=Uri.parse(browser.getUrl()==null?"":browser.getUrl());
        return trusted(uri) && ("/".equals(uri.getPath()) || "/index.html".equals(uri.getPath()));
    }
    private void exportDocument() {
        if(!ledgerPage() || pendingExport!=null)return;
        browser.evaluateJavascript("JSON.stringify(window.__youduExport||null)", value->{
            try {
                Object decoded=new JSONTokener(value).nextValue();
                if(!(decoded instanceof String))return;
                JSONObject payload=new JSONObject((String)decoded);
                String name=payload.getString("name").replaceAll("[\\\\/:*?\"<>|]","_");
                if(name.length()>100)name=name.substring(name.length()-100);
                if(!(name.endsWith(".json")||name.endsWith(".csv")))return;
                byte[] bytes=payload.getString("text").getBytes(StandardCharsets.UTF_8);
                if(bytes.length>20*1024*1024)throw new Exception("Too large");
                pendingExport=bytes;
                Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType(name.endsWith(".json")?"application/json":"text/csv");
                intent.putExtra(Intent.EXTRA_TITLE,name);
                startActivityForResult(intent,SAVE_DOCUMENT);
            } catch(Exception ex) {
                pendingExport=null;
                Toast.makeText(this,"无法导出，请重试或检查文件管理器",Toast.LENGTH_LONG).show();
            }
            browser.evaluateJavascript("delete window.__youduExport",null);
        });
    }

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(0xfff8f7f1);
        getWindow().setNavigationBarColor(0xfff8f7f1);
        getWindow().getDecorView().setSystemUiVisibility(android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR |
            android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        browser = new WebView(this);
        browser.setBackgroundColor(0xfff8f7f1);
        LinearLayout root=new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        Button reconnect=new Button(this);
        reconnect.setText("有度茶舍 V10  ·  连接 / 重新登录");
        reconnect.setTextSize(12);
        reconnect.setOnClickListener(v->new AlertDialog.Builder(this)
            .setMessage("重新连接云端登录页面？本机账目会保留。")
            .setPositiveButton("连接",(d,w)->browser.loadUrl(HOME+"login"))
            .setNegativeButton("取消",null).show());
        root.addView(reconnect,new LinearLayout.LayoutParams(-1,(int)(40*getResources().getDisplayMetrics().density)));
        root.addView(browser,new LinearLayout.LayoutParams(-1,0,1));
        setContentView(root);
        WebSettings settings = browser.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        // Only user-selected documents can be imported via the system picker.
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setTextZoom(100);
        if(android.os.Build.VERSION.SDK_INT >= 26) {
            settings.setSafeBrowsingEnabled(true);
        }
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(browser, false);
        browser.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request){
                Uri uri=request.getUrl();
                if("youdu-export".equals(uri.getScheme())){
                    if(request.isForMainFrame())exportDocument();
                    return true;
                }
                if(trusted(uri))return false;
                if("https".equalsIgnoreCase(uri.getScheme())){
                    try{startActivity(new Intent(Intent.ACTION_VIEW,uri));}catch(Exception ignored){}
                }
                return true;
            }
            @Override public void onPageFinished(WebView view,String url){
                CookieManager.getInstance().flush();
                if(ledgerPage())view.evaluateJavascript(
                    "if(typeof exportFile==='function'){exportFile=function(name,content,type){"+
                    "window.__youduExport={name:String(name),text:'\\ufeff'+String(content)};"+
                    "location.href='youdu-export://save';};}",null);
            }
            @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error){
                if(!request.isForMainFrame())return;
                new AlertDialog.Builder(MainActivity.this).setTitle("暂时无法连接")
                    .setMessage("首次登录需要联网。已有账目不会因连接失败被清除，请检查网络后重试。")
                    .setPositiveButton("重试",(d,w)->browser.loadUrl(HOME))
                    .setNegativeButton("取消",null).show();
            }
        });
        browser.setWebChromeClient(new WebChromeClient(){
            @Override public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> cb,
               FileChooserParams params) {
                if(fileCallback!=null)fileCallback.onReceiveValue(null);
                fileCallback=cb;
                try {
                    Intent intent=params.createIntent();
                    startActivityForResult(intent,FILE_CHOOSER);
                    return true;
                } catch(Exception ex) {
                    fileCallback=null;
                    return false;
                }
            }
        });
        if(savedInstanceState != null){if(browser.restoreState(savedInstanceState)==null)browser.loadUrl(HOME);}
        else browser.loadUrl(HOME);
    }
    @Override protected void onActivityResult(int req,int result,Intent data){
        super.onActivityResult(req,result,data);
        if(req==FILE_CHOOSER&&fileCallback!=null){
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result,data));
            fileCallback=null;
        }
        if(req==SAVE_DOCUMENT){
            byte[] bytes=pendingExport;pendingExport=null;
            if(result==RESULT_OK&&data!=null&&data.getData()!=null&&bytes!=null){
                try(OutputStream out=getContentResolver().openOutputStream(data.getData())){
                    if(out==null)throw new Exception("No output stream");
                    out.write(bytes);
                    Toast.makeText(this,"文件已保存",Toast.LENGTH_SHORT).show();
                }catch(Exception ex){Toast.makeText(this,"保存失败，请重新导出",Toast.LENGTH_LONG).show();}
            }
        }
    }
    @Override protected void onSaveInstanceState(Bundle state){
        super.onSaveInstanceState(state);
        if(browser!=null)browser.saveState(state);
    }
    @Override public void onBackPressed(){
        if(browser!=null&&browser.canGoBack())browser.goBack();else super.onBackPressed();
    }
    @Override protected void onDestroy(){
        if(fileCallback!=null){fileCallback.onReceiveValue(null);fileCallback=null;}
        pendingExport=null;
        if(browser!=null){browser.destroy();browser=null;}
        super.onDestroy();
    }
}

