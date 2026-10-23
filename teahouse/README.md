# 有度茶舍 · V15

华为平板安装版负责收银，iPhone 网页只读查看同一个 Google Drive 主账本。沿用原 Render 服务、账户、正式 Android 包名及签名。

- 订单商品保留菜单原价、当前单价、改价历史；支持菜单外临时商品。
- 账单、订单、小票及订单 CSV 分别记录原价应收、商品改价、应收与实收。
- 库存页和 XLSX 只纳入已登记库存；待录入项目在 APP 内单独显示。按克进价保留小数精度。
- 客户库存与业务记录只在受认证保护的共享账本中；源代码和安装包不附带客户库存、凭据或正式签名私钥。

运行：Node.js，配置既有 YOUDU_LOGIN_USER、YOUDU_LOGIN_PASSWORD、YOUDU_SESSION_SECRET、YOUDU_GOOGLE_BACKUP_URL 和 YOUDU_BACKUP_SECRET，执行 node teahouse/server.cjs。

构建：GitHub Actions 编译未签名安装包，受控环境用原正式签名签署；原包名 com.youdu.teahouse.cashier，versionCode 150。
