# 有度茶舍 Android 正式签名和数据兼容约束

**正式安装包：V14（2026-10-23）**

- Android applicationId：`com.youdu.teahouse.cashier`。
- 起始 `versionCode`：140，后续更新必须严格递增，不得降低。
- SHA-256 签名证书指纹：`f70780886b7132cd6fec2f17ebc4ab5306a4b5f6193c349e6c1cb2c6b474d854`。
- 正式签名私钥（PKCS12）及口令**不得上传至本公开仓库**，不得上传至 GitHub Actions artifact、日志、Release Asset 或源码。
- GitHub Actions 只编译并校验**未签名** APK。正式签名在受控的私有环境完成。
- 验证方法：`apksigner verify --verbose --print-certs signed.apk`；检查 v2/v3 验证、证书指纹、包名及 `versionCode`，确认无误才发布。
- 正式版只能使用相同包名及上述签名证书更新。不得自动生成新签名；找不到原签名时必须停止发布。
- 安装更新前检查共享账本处于已同步状态、导出最新本机 JSON，并验证订单数和库存。新版本不得清理 `youdu_tea_house_v3` 存储。
- V11、V12、V13 使用不同测试包名/签名，**不能作为 V14 正式版的直接升级安装**。必须通过云端现有主账本安全接管。
- 收银账本唯一写入端为华为主收银，iPhone 只读。打印数据传输确认不等于真实出纸，必须实测。
- 后端自动更新 **仅在** 签名 APK、版本号、预期包名、证书指纹和 APK SHA-256 全部匹配时才应发布。旧 V13 APK 不可伪装为 V14 更新包。

正式版通过首次设备迁移后，后续 V15/V16 更新应保留相同 `applicationId` 和正式签名。仅更换网页、清空本机缓存或重装不是有效的数据迁移方式。
