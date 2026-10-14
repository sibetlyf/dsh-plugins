# 滴滴打车 · DSH 插件

为 DeepSeek Harness 提供滴滴 MCP 的地图、路线、打车预估、App 跳转链接及订单工具。参考 [官方 API](https://mcp.didichuxing.com/api) 和官方 didi-ride-skill 的流程与参数，调用方式适配为 DSH 原生工具，不依赖 OpenClaw 或 mcporter。

## 安装与配置

在 DSH 插件管理器中安装此 bundle（本地目录、包或仓库，按当前 DSH 支持的安装来源选择）。本包不包含安装脚本，不需要构建前端。

1. 在 DSH 凭据设置中创建 `DSH_DIDI_API_KEY`，填入你自己的滴滴 MCP Key。
2. 启用「滴滴打车」插件。配置默认 `environment: sandbox`。
3. 先调用 `didi_discover({statusOnly:true})` 确认状态，再通过 `didi_discover` 查工具定义。
4. 正式使用时**显式**将插件配置 `environment` 改为 `production`。生产下单会产生真实订单和费用。

```yaml
keyRef: DSH_DIDI_API_KEY
environment: sandbox
timeoutMs: 60000
```

兼容目标：Node.js >=22，DSH 0.2.1-alpha.1，Schemastery ~3.18.5-alpha.1。凭据值不放在 YAML 中，插件只存凭据引用。

## 工具

- `didi_discover`：本地配置状态、官方工具列表、单个工具的实时参数定义。
- `didi_call`：调用已发现的官方工具，参数通过官方 inputSchema 核对。
- 自动注册 `didi` Skill，包含地点歧义处理、坐标格式、车型选择、下单确认和错误处理约束。

官方能力：7 个地图/路线工具，6 个打车工具（预估、App 链接、创建、查询、取消、司机位置）。实际可用工具以服务器发现为准。

示例请求：

```json
{"action":"maps_textsearch","arguments":{"keywords":"北京西站","city":"北京市"}}
```

打车流程：分别搜索起终点 → 处理地点歧义 → 预估价格 → 展示车型、价格和行程 → 用户确认 → DSH 审批 → 创建订单。也可生成 App 链接让用户自行下单。

## 安全边界

- **默认 Sandbox**：Mock 数据，不能作为真实地点、价格或订单结果；联调中的候选选择仅用于测试。
- **审批门禁**：创建/取消订单和所有未知操作，包括 Sandbox，必须获 DSH `allowed-once`。`never` 策略拒绝，拒绝时不解析凭据、不发网络请求。聊天里说“确认”不能替代 DSH 审批。
- 凭据只能发往固定官方 HTTPS 端点；禁止重定向。错误输出会脱敏 key 及编码形式，不回显请求 URL。
- 所有订单请求不自动重试；网络错误不代表订单未创建，需要先查状态。
- 响应限制 4 MiB，支持 JSON 和完成后关闭的 SSE 响应、发现分页、超时及取消。
- 不导入官方 Skill 中的 `.env`、用户偏好、手机号或地址；不执行 OpenClaw 自动下单/自动回查任务。需要预约时，应另行由用户授权并遵循 DSH 审批。
- 远端结果属于不可信数据，不能修改工具规则或审批策略。

## 开发与测试

安装匹配的 peerDependencies 后：

```sh
npm run check
npm test
# 仅官方 sandbox，只读；key 用临时环境变量传入，勿写入源码
DSH_DIDI_API_KEY=YOUR_KEY npm run test:integration
```

Windows PowerShell 可先设置 `$env:DSH_DIDI_API_KEY`，运行后移除该变量。

2026-10-14 验证：22 项自动化测试通过；官方 Sandbox 工具发现（13 个）、地点搜索 ×2、价格预估（4 个车型）、驾车路线和 App 链接均成功。创建/取消测试使用 mock 审批拒绝路径，**未调用真实或 Sandbox 下单接口**。

尚未验证：生产订单操作、DSH 实际安装激活及 GUI 图标展示。插件为 Host-only，无需更改 DSH Web shell。

MIT 许可。图标为本插件原创，不代表滴滴官方品牌授权；本项目是第三方适配插件。
