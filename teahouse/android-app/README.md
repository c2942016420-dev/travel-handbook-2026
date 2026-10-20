# 有度茶舍 Android 安装版 V10

应用 ID：`com.youdu.teahouse`；版本：`10.0.1`（versionCode 2）。
支持 Android 7 / API 24 及以上，包括 Android 10 设备；无需 Google Play 服务。
此安装版使用 Android WebView 加载已有 HTTPS 店务系统，有独立图标、应用数据和系统文件保存入口；不是从零重写的原生收银界面。

## 使用

1. 在华为平板下载并安装 `Youdu-TeaHouse-V10.apk`，首次启动联网登录现有工作台账号。
2. 房间与收费设置 → 多设备共享账本 → 只读连接已有账本。
3. 等待读入共享数据后，点击接管主收银权限。不要再建立一个新账本。
4. 手机只读连接同一账本。App、浏览器与其他设备有各自独立的本地存储。
5. 顶部连接按钮用于会话过期后重新登录，不会清空本机账目。
6. JSON / CSV 导出会打开系统文件保存窗口。导入使用系统文件选择器。

首次登录和云端同步需要网络。已有网站的 service worker 负责离线缓存；尚未完成目标平板的断网冷启动实测，不承诺安装即离线可用。不要清除 App 数据或卸载来处理同步问题。

## 构建和更新

Gradle 8.7、JDK 17、Android SDK 34 / build-tools 34.0.0。
也可运行 `build-apk.sh` 直接使用官方 aapt、javac、d8、zipalign、apksigner 构建。
脚本需要环境变量 `ANDROID_HOME`、`JAVA_HOME`、`YOUDU_KEYSTORE`、`YOUDU_STOREPASS_FILE`。
发布签名不进入 Git。后续覆盖安装必须使用同一个签名与应用 ID，并递增 versionCode。

## 本次验证

- Java 编译、DEX 转换、资源与 Manifest 打包通过。
- APK v2 / v3 签名验证及 zipalign 校验通过。
- 核对应用名、启动 Activity、最低 SDK、目标 SDK 与仅网络相关权限。
- 未持有 AGS3-AL00 真机，尚未进行真机安装、收银、文件导入导出和离线实测。
- 未生成测试订单或修改云端账本。
