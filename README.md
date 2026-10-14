# DSH Plugins

DeepSeek Harness 第三方插件集合，各插件为独立可安装的 Cordis bundle，不修改 DSH 核心。

| 插件 | 能力 | 测试 |
|---|---|---|
| [滴滴打车](plugins/dsh-plugin-didi/README.md) | 地点搜索、路线、价格预估、App 链接、审批后订单管理 | 22 项自动化测试；官方 Sandbox 只读联调通过 |
| [美团外卖](plugins/dsh-plugin-meituan/README.md) | 独立浏览器搜索、菜单读取、审批后点击/加购 | 10 项自动化测试；真实登录/加购尚未验证 |
| [腾讯会议](plugins/dsh-plugin-tencent-meeting/README.md) | 会议、录制、转写、纪要及审批后敏感操作 | 10 项客户端自动化测试 |

## 安装

克隆仓库后，在 DSH 插件管理器分别选择相应 `plugins/dsh-plugin-*` 目录安装。每个目录都有独立 package.json 和 bundle patch；仓库根目录不是单一 bundle。需要匹配的 DSH peerDependencies，详见插件各自文档。

也可在插件目录运行 `npm pack` 生成安装包。美团依赖 Playwright，默认使用系统 Edge，首次由用户人工登录，不保存/导入 Cookie。

## 安全

不含测试 key、Token、Cookie、用户地址或登录状态。滴滴默认 Sandbox；三个插件的敏感操作受 DSH 审批，never 策略拒绝。美团不支持订单提交或支付。

这些是第三方适配插件，不代表滴滴、美团或腾讯官方授权。尚未完成所有插件的 DSH GUI 安装激活验证，不将本地自动化测试等同于生产业务验证。

验证日期：2026-10-14。总计 42 项自动化测试通过。
