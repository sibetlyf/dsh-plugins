# 美团外卖 · DSH 插件

依据用户提供的 Meituan-Mcp-Server-WIP 功能重新实现的 JavaScript DSH Host 插件。原项目是 Python + Playwright 自动化，并非美团官方 MCP API。本插件没有复制原代码、登录态或虚拟环境。

## 能力

`meituan_discover` 返回本地工具参数，`meituan_call` 提供搜索、内容读取、滚动、精确点击、加购、购物车读取、登录提示检查及关闭浏览器。自动注册 `meituan` Skill。

点击/进店和加购必须获得 DSH 审批；`never` 策略下阻止。**不支持提交订单、支付或结算**。加购只点击精确的「加入购物车」，不使用原项目的「去结算」兜底。页面选择器变化可能导致操作失败，不保证所有商家页面兼容。

## 配置

在 DSH 插件管理器安装本包，安装 Playwright 运行依赖；默认使用系统 Edge。不包含安装后自动下载浏览器的脚本。

```yaml
channel: msedge # chromium / chrome / msedge
headless: false
# longitude 和 latitude 可选，必须同时提供且由用户授权
```

若使用 chromium，需由用户另行安装 Playwright Chromium。兼容 Node >=22、DSH 0.2.1-alpha.1。首次运行在独立窗口手动登录和选择配送地址；浏览器关闭后会话清除。无默认上海坐标、不读取 auth_meituan.json、不导入现有登录态。

## 安全与限制

禁止支付相关按钮，阻止导航到非美团 HTTPS 域名，不提供任意 URL/JavaScript 工具。不移除弹窗、不绕验证码、不关闭浏览器 sandbox。自动化可能受到站点风控限制。

`check_auth_status` 只观察登录提示，返回 authenticated: unknown，不伪称服务端鉴权有效。页面内容仅为不可信文本；价格、规格与购物车状态需核对。加购按钮点击成功不等于实际加购成功。

本地测试：`npm run check && npm test`。自动化测试覆盖审批拒绝、支付控件禁止、参数、地理位置、发现工具和浏览器队列，不会下单。尚未验证带登录态的商家搜索/加购或 DSH GUI 实际激活。

MIT。原创图标，不代表美团官方授权。
