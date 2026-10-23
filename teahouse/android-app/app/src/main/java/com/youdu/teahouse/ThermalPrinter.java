package com.youdu.teahouse;

import android.Manifest;
import android.app.Activity;
import android.app.PendingIntent;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbEndpoint;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Offline ESC/POS thermal-print transport. No print jobs are routed through
 * the Internet or through Google Drive. Supports connected USB bulk endpoint,
 * previously paired Bluetooth classic SPP, and local TCP port 9100 printers.
 * A successful byte transfer is NOT proof the printer actually fed paper.
 */
public final class ThermalPrinter {
    private static final String USB_PERMISSION="com.youdu.teahouse.USB_THERMAL_PRINTER_PERMISSION";
    private static final String PREF="youdu_thermal_v13";
    private static final UUID SPP=UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private static final int MAX_JOB_CHARS=120000;
    private final MainActivity activity;
    private final WebView webView;
    private final UsbManager usb;
    private final SharedPreferences pref;
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private final Handler main=new Handler(Looper.getMainLooper());
    private boolean destroyed=false;
    private final BroadcastReceiver usbPermissionReceiver=new BroadcastReceiver(){
        @Override public void onReceive(Context context, Intent intent){
            if(!USB_PERMISSION.equals(intent.getAction()))return;
            boolean granted=intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED,false);
            emit("permission",granted,granted?
                "USB 授权成功，请点击检测连接或测试打印":
                "未取得 USB 使用权限，请检查连接并重新授权","",false);
        }
    };

    ThermalPrinter(MainActivity activity,WebView webView){
        this.activity=activity;
        this.webView=webView;
        this.usb=(UsbManager)activity.getSystemService(Context.USB_SERVICE);
        this.pref=activity.getSharedPreferences(PREF,Context.MODE_PRIVATE);
        IntentFilter filter=new IntentFilter(USB_PERMISSION);
        if(Build.VERSION.SDK_INT>=33)activity.registerReceiver(
            usbPermissionReceiver,filter,Context.RECEIVER_NOT_EXPORTED);
        else activity.registerReceiver(usbPermissionReceiver,filter);
    }

    public void close(){
        destroyed=true;
        try{activity.unregisterReceiver(usbPermissionReceiver);}catch(Exception ignored){}
        worker.shutdownNow();
    }

    private static JSONObject ok(boolean value,String message){
        JSONObject o=new JSONObject();
        try{o.put("ok",value);o.put("message",message);}catch(Exception ignored){}
        return o;
    }
    private static String error(String message){return ok(false,message).toString();}
    private String mode(){return pref.getString("mode","system");}
    private String device(){return pref.getString("device","");}
    private String host(){return pref.getString("host","");}
    private int port(){return pref.getInt("port",9100);}
    private int width(){return pref.getInt("width",58)==80?80:58;}

    public String info(){
        JSONObject o=ok(true,"打印设置");
        try{
            o.put("mode",mode());o.put("device",device());
            o.put("host",host());o.put("port",port());o.put("width",width());
            o.put("physicalOutputUnverified",true);
            JSONArray u=new JSONArray();
            if(usb!=null){
                for(UsbDevice d:usb.getDeviceList().values()){
                    JSONObject item=new JSONObject();
                    item.put("id",d.getDeviceName());
                    item.put("label","USB "+hex(d.getVendorId())+":"+hex(d.getProductId())+
                        (d.getProductName()!=null?" · "+d.getProductName():""));
                    item.put("permission",usb.hasPermission(d));
                    item.put("plausibleEscPos",endpoint(d)!=null);
                    u.put(item);
                }
            }
            o.put("usb",u);
            o.put("bluetoothPermission",bluetoothPermission());
            JSONArray b=new JSONArray();
            if(bluetoothPermission()){
                BluetoothAdapter a=BluetoothAdapter.getDefaultAdapter();
                if(a!=null&&a.isEnabled()){
                    Set<BluetoothDevice> paired=a.getBondedDevices();
                    for(BluetoothDevice d:paired){
                        JSONObject item=new JSONObject();
                        item.put("id",d.getAddress());
                        item.put("label",(d.getName()==null?"已配对设备":d.getName())+" · "+d.getAddress());
                        b.put(item);
                    }
                }
            }
            o.put("bluetooth",b);
        }catch(Exception e){return error("无法读取打印机列表："+friendly(e));}
        return o.toString();
    }

    private static String hex(int n){return String.format(Locale.US,"%04X",n);}
    private boolean bluetoothPermission(){
        return Build.VERSION.SDK_INT<31 ||
            activity.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT)==PackageManager.PERMISSION_GRANTED;
    }
    public String requestBluetooth(){
        if(Build.VERSION.SDK_INT>=31&&!bluetoothPermission()){
            main.post(()->activity.requestPermissions(new String[]{
                Manifest.permission.BLUETOOTH_CONNECT},412));
            return ok(true,"请允许附近设备权限，再点击刷新设备列表").toString();
        }
        return ok(true,"已有蓝牙访问权限。请先在系统蓝牙设置中配对打印机。").toString();
    }

    public String requestUsb(String id){
        if(usb==null)return error("平板没有 USB 主机服务");
        final UsbDevice d=usb.getDeviceList().get(id);
        if(d==null)return error("未发现指定 USB 设备，检查 OTG 数据线");
        if(endpoint(d)==null)return error("此 USB 设备未发现可用打印输出接口");
        if(usb.hasPermission(d))return ok(true,"USB 权限已取得，可测试打印").toString();
        main.post(()->{
            try{
                Intent intent=new Intent(USB_PERMISSION).setPackage(activity.getPackageName());
                int flags=PendingIntent.FLAG_UPDATE_CURRENT;
                if(Build.VERSION.SDK_INT>=31)flags|=PendingIntent.FLAG_MUTABLE;
                PendingIntent pi=PendingIntent.getBroadcast(activity,910,intent,flags);
                usb.requestPermission(d,pi);
            }catch(Exception e){emit("permission",false,"USB 授权弹窗无法打开："+friendly(e),"",false);}
        });
        return ok(true,"正在请求 USB 使用权限").toString();
    }

    /** Select, but do not claim, a printer. "Connected" must be independently tested. */
    public String select(String m,String id,String ip,int prt,int mm){
        if(!Arrays.asList("system","usb","bluetooth","lan").contains(m))
            return error("打印方式无效");
        if(mm!=58&&mm!=80)return error("仅支持 58mm 或 80mm 纸宽");
        if(m.equals("usb")){
            if(usb==null||!usb.getDeviceList().containsKey(id))
                return error("没有找到选定的 USB 设备");
            if(endpoint(usb.getDeviceList().get(id))==null)
                return error("该 USB 设备没有兼容的 bulk 输出接口");
        }
        if(m.equals("bluetooth")){
            if(!bluetoothPermission())return error("请先允许蓝牙附近设备权限");
            try{
                BluetoothAdapter b=BluetoothAdapter.getDefaultAdapter();
                if(b==null||!b.isEnabled())return error("请先在系统设置打开蓝牙");
                if(!pairedContains(b.getBondedDevices(),id))return error("先在系统蓝牙设置中配对小票机");
            }catch(Exception e){return error("蓝牙不可用："+friendly(e));}
        }
        if(m.equals("lan")){
            if(!privateIPv4(ip))return error("仅允许店内局域网 IPv4 地址（如 192.168.1.50）");
            if(prt<1||prt>65535)return error("端口范围错误");
        }
        pref.edit().putString("mode",m).putString("device",id==null?"":id)
            .putString("host",ip==null?"":ip.trim()).putInt("port",prt)
            .putInt("width",mm).apply();
        return ok(true,m.equals("system")?"系统打印模式已保存":
            "打印机已选择，但尚未检测连接，请点击连接检测或测试打印").toString();
    }
    private static boolean pairedContains(Set<BluetoothDevice> devices,String address){
        if(address==null)return false;
        for(BluetoothDevice x:devices)if(address.equalsIgnoreCase(x.getAddress()))return true;
        return false;
    }

    private static boolean privateIPv4(String raw){
        if(raw==null||!raw.matches("^[0-9]{1,3}(\\.[0-9]{1,3}){3}$"))return false;
        String[] p=raw.split("\\.");int[] v=new int[4];
        try{for(int i=0;i<4;i++){v[i]=Integer.parseInt(p[i]);if(v[i]>255)return false;}}
        catch(Exception e){return false;}
        return v[0]==10 || v[0]==192&&v[1]==168 ||
            v[0]==172&&v[1]>=16&&v[1]<=31;
    }
    private static InetAddress lanAddress(String raw)throws IOException{
        if(!privateIPv4(raw))throw new IOException("仅允许连接店内局域网打印机");
        String[] p=raw.split("\\.");
        byte[] v=new byte[4];
        for(int i=0;i<4;i++)v[i]=(byte)Integer.parseInt(p[i]);
        return InetAddress.getByAddress(v);
    }

    public void probe(){
        final Config c=config();
        if(c.mode.equals("system")){
            emit("probe",true,"系统打印模式可用，请在测试打印里选打印机","",false);return;
        }
        worker.execute(()->{
            try{send(c,new byte[0],true);emit("probe",true,"连接检测成功，但尚未验证实际出纸","",false);}
            catch(Exception e){emit("probe",false,"连接失败："+friendly(e),"",false);}
        });
    }

    public void test(){
        final Config c=config();
        if(c.mode.equals("system")){
            emit("test",false,"系统模式请使用系统打印测试按钮","",false);
            return;
        }
        enqueue("{\"room\":\"测试房台\",\"floor\":2,\"guests\":2,\"due\":120,\"actual\":120,"
            +"\"roomFee\":100,\"goodsFee\":20,\"payment\":\"测试\",\"items\":[{\"name\":\"测试茶饮\","
            +"\"label\":\"杯\",\"qty\":1,\"price\":20}],\"note\":\"测试样张，不产生营业订单\"}",
            false,true);
    }

    public void enqueue(String json,boolean duplicate,boolean trial){
        if(json==null||json.length()>MAX_JOB_CHARS){
            emit("print",false,"打印内容过长，请检查小票","",duplicate);return;
        }
        final JSONObject order;
        try{order=new JSONObject(json);}catch(Exception e){
            emit("print",false,"小票内容无效","",duplicate);return;
        }
        final String jobId=order.optString("id","");
        final Config c=config();
        if(c.mode.equals("system")){
            emit("print",false,"请选择 USB／蓝牙／局域网打印机，或改用系统打印","",duplicate);return;
        }
        worker.execute(()->{
            try{
                byte[] bytes=rasterJob(order,c.width,duplicate,trial);
                send(c,bytes,false);
                emit(trial?"test":"print",true,
                    trial?"测试数据已发送，请检查是否真正出纸":
                        "小票数据已发送，请检查打印机是否出纸；未出纸可从历史订单补打",
                    jobId,duplicate);
            }catch(Exception e){
                emit(trial?"test":"print",false,
                    "小票未能确认发送："+friendly(e)+"。订单已保存，可补打",jobId,duplicate);
            }
        });
    }

    private static final class Config{
        final String mode,id,ip;final int port,width;
        Config(String mode,String id,String ip,int port,int width){
            this.mode=mode;this.id=id;this.ip=ip;this.port=port;this.width=width;
        }
    }
    private Config config(){return new Config(mode(),device(),host(),port(),width());}

    private static final class UsbPort{
        final UsbInterface iface;final UsbEndpoint endpoint;
        UsbPort(UsbInterface iface,UsbEndpoint endpoint){this.iface=iface;this.endpoint=endpoint;}
    }
    private static UsbPort endpoint(UsbDevice d){
        for(int i=0;i<d.getInterfaceCount();i++){
            UsbInterface iface=d.getInterface(i);
            int cls=iface.getInterfaceClass();
            if(cls!=UsbConstants.USB_CLASS_PRINTER && cls!=UsbConstants.USB_CLASS_VENDOR_SPEC)continue;
            for(int j=0;j<iface.getEndpointCount();j++){
                UsbEndpoint ep=iface.getEndpoint(j);
                if(ep.getDirection()==UsbConstants.USB_DIR_OUT&&
                    ep.getType()==UsbConstants.USB_ENDPOINT_XFER_BULK)return new UsbPort(iface,ep);
            }
        }
        return null;
    }

    private void send(Config c,byte[] bytes,boolean probe)throws Exception{
        switch(c.mode){
            case "usb":sendUsb(c,bytes,probe);break;
            case "bluetooth":sendBluetooth(c,bytes,probe);break;
            case "lan":sendLan(c,bytes,probe);break;
            default:throw new IOException("未选择可直连的小票机");
        }
    }
    private void sendUsb(Config c,byte[] bytes,boolean probe)throws IOException{
        if(usb==null)throw new IOException("系统不支持 USB Host");
        UsbDevice d=usb.getDeviceList().get(c.id);
        if(d==null)throw new IOException("USB 打印机已断开，检查 OTG 线和供电");
        if(!usb.hasPermission(d))throw new IOException("请先在打印机管理中点击 USB 授权");
        UsbPort out=endpoint(d);
        if(out==null)throw new IOException("找不到兼容的 USB 输出通道");
        UsbDeviceConnection connection=usb.openDevice(d);
        if(connection==null)throw new IOException("无法打开 USB 端口");
        try{
            if(!connection.claimInterface(out.iface,true))throw new IOException("USB 接口占用");
            if(!probe){
                int pos=0;
                while(pos<bytes.length){
                    int n=Math.min(2048,bytes.length-pos);
                    int written=connection.bulkTransfer(out.endpoint,bytes,pos,n,3500);
                    if(written<=0)throw new IOException("USB 数据发送中断，已发送 "+pos+" 字节");
                    pos+=written;
                }
            }
        }finally{
            try{connection.releaseInterface(out.iface);}catch(Exception ignored){}
            connection.close();
        }
    }
    private void sendBluetooth(Config c,byte[] bytes,boolean probe)throws IOException{
        if(!bluetoothPermission())throw new IOException("需要附近设备权限");
        BluetoothAdapter adapter=BluetoothAdapter.getDefaultAdapter();
        if(adapter==null||!adapter.isEnabled())throw new IOException("平板蓝牙未打开");
        if(!pairedContains(adapter.getBondedDevices(),c.id))
            throw new IOException("请先在蓝牙设置配对打印机");
        BluetoothDevice d=adapter.getRemoteDevice(c.id);
        try(BluetoothSocket socket=d.createRfcommSocketToServiceRecord(SPP)){
            socket.connect();
            if(!probe){
                OutputStream os=socket.getOutputStream();
                os.write(bytes);os.flush();
            }
        }catch(SecurityException e){throw new IOException("未取得蓝牙权限");}
    }
    private static void sendLan(Config c,byte[] bytes,boolean probe)throws IOException{
        InetAddress address=lanAddress(c.ip);
        try(Socket socket=new Socket()){
            socket.connect(new InetSocketAddress(address,c.port),3000);
            socket.setSoTimeout(4000);
            if(!probe){
                OutputStream out=socket.getOutputStream();
                out.write(bytes);out.flush();
            }
        }
    }

    private static final class Line{
        String left,right;boolean center,big;
        Line(String left,String right,boolean center,boolean big){
            this.left=left==null?"":left;this.right=right;
            this.center=center;this.big=big;
        }
    }
    private static void append(List<Line> v,String s){
        v.add(new Line(s,null,false,false));
    }
    private static void pair(List<Line> v,String left,String right){
        v.add(new Line(left,right,false,false));
    }
    private static String number(double amount){
        return String.format(Locale.CHINA,"¥%.2f",amount);
    }
    private static String date(String value){
        if(value==null||value.isEmpty())return "—";
        try{
            // Android's Date parser handles the ISO strings emitted by the app.
            Date d=new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss",Locale.US)
                .parse(value.length()>=19?value.substring(0,19):value);
            if(d!=null)return new SimpleDateFormat("MM-dd HH:mm",Locale.CHINA).format(d);
        }catch(Exception ignored){}
        return value.length()>19?value.substring(0,19).replace("T"," "):
            value.replace("T"," ");
    }
    private static String trim(String s,int max){
        if(s==null)return "";
        String cleaned=s.replaceAll("[\\r\\n\\t]"," ");
        return cleaned.length()>max?cleaned.substring(0,max)+"…":cleaned;
    }
    private static List<Line> lines(JSONObject o,boolean duplicate,boolean trial){
        List<Line> lines=new ArrayList<>();
        lines.add(new Line("有度茶舍",null,true,true));
        if(trial)lines.add(new Line("测试打印 · 不产生订单",null,true,false));
        else if(duplicate)lines.add(new Line("【补打】 REPRINT",null,true,true));
        else lines.add(new Line("营业小票",null,true,false));
        append(lines,"--------------------------------");
        pair(lines,"房台",o.optInt("floor",2)+"楼 · "+trim(o.optString("room",""),18));
        pair(lines,"开台",date(o.optString("startedAt","")));
        pair(lines,"结账",date(o.optString("closedAt","")));
        pair(lines,"人数",String.valueOf(o.optInt("guests",0)));
        append(lines,"--------------------------------");
        pair(lines,"房间/茶位/超时",number(o.optDouble("roomFee",0)));
        JSONArray items=o.optJSONArray("items");
        if(items!=null){
            for(int i=0;i<Math.min(70,items.length());i++){
                JSONObject item=items.optJSONObject(i);if(item==null)continue;
                pair(lines,trim(item.optString("name","")+" "+item.optString("label",""),25)+
                    " ×"+item.optInt("qty",1),
                    number(item.optDouble("price",0)*item.optDouble("qty",1)));
            }
        }
        append(lines,"--------------------------------");
        pair(lines,"商品合计",number(o.optDouble("goodsFee",0)));
        pair(lines,"系统应收",number(o.optDouble("due",0)));
        lines.add(new Line("实际收款",number(o.optDouble("actual",0)),false,true));
        pair(lines,"支付方式",trim(o.optString("payment","—"),12));
        if(o.has("note"))append(lines,"备注："+trim(o.optString("note",""),100));
        append(lines,"--------------------------------");
        lines.add(new Line("谢谢光临 · 有度茶舍",null,true,false));
        append(lines,"");
        append(lines,"");
        return lines;
    }
    private static Bitmap draw(List<Line> lines,int dots){
        final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setTypeface(Typeface.create("sans-serif",Typeface.NORMAL));
        paint.setColor(Color.BLACK);
        final int normal=dots>=560?27:24;
        final int big=dots>=560?40:32;
        final int pad=12;
        int height=pad+15;
        // Measure wrapped lines before allocating; each glyph is rasterized so
        // Chinese text does not rely on printer-specific GBK code pages.
        for(Line l:lines){
            paint.setTextSize(l.big?big:normal);
            int width=dots-2*pad;
            int n=Math.max(1,wrap(l.left,paint,l.right==null?width:(int)(width*.62)).size());
            height+=n*(l.big?big+12:normal+11)+(l.right==null?0:3);
        }
        height=Math.min(14000,Math.max(100,height+pad));
        Bitmap bitmap=Bitmap.createBitmap(dots,height,Bitmap.Config.ARGB_8888);
        Canvas canvas=new Canvas(bitmap);canvas.drawColor(Color.WHITE);
        int y=pad;
        for(Line l:lines){
            paint.setTextSize(l.big?big:normal);
            paint.setTypeface(Typeface.create("sans-serif",l.big?Typeface.BOLD:Typeface.NORMAL));
            int lh=(l.big?big+12:normal+11);
            int full=dots-2*pad;
            List<String> wrap=wrap(l.left,paint,l.right==null?full:(int)(full*.62));
            for(int i=0;i<wrap.size();i++){
                if(y+lh>=height)break;
                y+=lh;
                String line=wrap.get(i);
                float x=l.center?(dots-paint.measureText(line))/2:pad;
                canvas.drawText(line,Math.max(pad,x),y,paint);
            }
            if(l.right!=null&&y<height-5){
                String right=trim(l.right,32);
                canvas.drawText(right,Math.max(pad,dots-pad-paint.measureText(right)),y,paint);
            }
            y+=3;
            if(y>=height-5)break;
        }
        return bitmap;
    }
    private static List<String> wrap(String s,Paint p,int maxWidth){
        ArrayList<String> out=new ArrayList<>();
        if(s==null||s.isEmpty()){out.add("");return out;}
        StringBuilder line=new StringBuilder();
        for(int off=0;off<s.length();){
            int cp=s.codePointAt(off),size=Character.charCount(cp);
            String glyph=new String(Character.toChars(cp));
            if(line.length()>0&&p.measureText(line.toString()+glyph)>maxWidth){
                out.add(line.toString());line.setLength(0);
            }
            line.append(glyph);off+=size;
        }
        if(line.length()>0)out.add(line.toString());
        return out;
    }
    private static byte[] rasterJob(JSONObject order,int width,boolean duplicate,boolean trial)throws IOException{
        int dots=width==80?576:384;
        Bitmap bitmap=draw(lines(order,duplicate,trial),dots);
        ByteArrayOutputStream out=new ByteArrayOutputStream();
        try{
            out.write(new byte[]{0x1b,0x40,0x1b,0x61,0x00});
            int rowBytes=(dots+7)/8;
            for(int start=0;start<bitmap.getHeight();start+=128){
                int rows=Math.min(128,bitmap.getHeight()-start);
                out.write(new byte[]{0x1d,0x76,0x30,0x00,
                    (byte)(rowBytes&255),(byte)((rowBytes>>8)&255),
                    (byte)(rows&255),(byte)((rows>>8)&255)});
                for(int y=start;y<start+rows;y++){
                    for(int x=0;x<dots;x+=8){
                        int bits=0;
                        for(int b=0;b<8;b++){
                            if(x+b>=dots)break;
                            int argb=bitmap.getPixel(x+b,y);
                            int r=Color.red(argb),g=Color.green(argb),blue=Color.blue(argb);
                            if((r*30+g*59+blue*11)/100<170)bits|=1<<(7-b);
                        }
                        out.write(bits);
                    }
                }
            }
            out.write(new byte[]{0x1b,0x64,0x03}); // Feed 3 lines. No cutter command.
        }finally{bitmap.recycle();}
        return out.toByteArray();
    }

    private static String friendly(Exception e){
        String s=e.getMessage();
        if(s==null||s.isEmpty())return e.getClass().getSimpleName();
        s=s.replaceAll("[\\r\\n]"," ");
        return s.length()>110?s.substring(0,110):s;
    }
    private void emit(String action,boolean success,String message,String id,boolean reprint){
        if(destroyed)return;
        JSONObject payload=ok(success,message);
        try{
            payload.put("event",action);payload.put("orderId",id);
            payload.put("reprint",reprint);
            payload.put("mode",mode());
        }catch(Exception ignored){}
        final String script="window.dispatchEvent(new CustomEvent('youdu-printer', {detail:JSON.parse("
            +JSONObject.quote(payload.toString())+")}));";
        main.post(()->{
            if(!destroyed)try{webView.evaluateJavascript(script,null);}catch(Exception ignored){}
        });
    }
}
