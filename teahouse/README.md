# 有度茶舍 · 受登录保护的离线网页 APP

此分支仅放演示代码，不包含收银订单和库存数据，也不包含密码。业务数据保存在每台设备的浏览器 localStorage，未实现云同步、服务器数据库和自动备份。

运行方式：Node.js 22+，设置 YOUDU_LOGIN_USER、YOUDU_LOGIN_PASSWORD、YOUDU_SESSION_SECRET 后启动 node teahouse/server.cjs。

访问受服务器身份验证保护。联网登录并缓存后，离线访问仅针对已经安装的本机设备。任何接触到未锁定设备的人仍可能看见本地数据，此版本不具备正式 POS 所需的强数据安全与权限控制。
