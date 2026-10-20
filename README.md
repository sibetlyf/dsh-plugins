# 腾讯会议 DSH 插件

标准 Cordis Host 插件/DSH bundle，Node.js 原生实现，无 Python、无安装脚本。不附带任何账号或 Token，不读取原 skill 目录或其 `.env`。

## 安装

首次下载并安装（已克隆仓库则跳过前两行，在仓库根目录执行）：

```sh
git clone https://github.com/sibetlyf/dsh-plugins.git
cd dsh-plugins
dsh plugin --profile web add ./plugins/dsh-plugin-tencent-meeting
```

安装后正常重启对应 DSH profile（停止现有进程后执行 `dsh web`），并在插件管理器确认启用状态。其他 profile 请替换 `web`。亦可在 DSH 插件页输入此插件目录的本地绝对路径安装。当前仅声明兼容 DSH 0.2.1-alpha.1，其他版本需要另行测试，勿绕过兼容性限制。完整更新、卸载及多插件安装见 [仓库安装说明](../../README.md#安装)。

## 用户手动输入 Token

0.1.1 新增 Web「腾讯会议凭据」设置面板：密码输入、保存、删除、配置状态和刷新。保存复用 DSH 本地凭据服务，Token 不进入 AI 对话或浏览器存储。默认引用 `DSH_TENCENT_MEETING_TOKEN` 必须与 Host `tokenRef` 一致；启动环境变量来源只读。参见 [凭据界面与回退配置](../../README.md#安装后的必要配置)。界面依赖 Web 设置服务，真实 GUI 渲染和持久保存端到端仍待用户安装后验收。

1. 用户自行访问 https://meeting.tencent.com/ai-skill 获取个人 Token。
2. 通过当前实例实际支持的安全凭据输入工具配置 `DSH_TENCENT_MEETING_TOKEN`，或在启动终端隐藏输入同名环境变量，再正常启动 DSH。并非所有版本都有通用凭据页面，不能假定插件设置一定带 Token 输入框。
3. `tokenRef` 配置保存的是引用名称，不是 Token。不要将真实 Token 写入该字段、插件包或配置补丁。环境变量模式只在启动终端及子进程中生效，不自动持久保存。
4. 隐藏输入命令、宿主/Agent shell 可见性说明与验证步骤见 [AI 安装配置指南](../../AI-INSTALL.md#4-安全配置凭据)。不应把 Token 发到聊天。

插件不会自动迁移 `TENCENT_MEETING_TOKEN` 或旧 skill 的 `.env`；使用独立的新引用防止误用旧凭据。没有 Token 仍可安装并查看配置状态；首次真正查询才需要鉴权。

## 使用

加载 `tencent-meeting` skill；调用 `tencent_meeting_discover` 列出动作，传 action 获取官方 inputSchema；`tencent_meeting_call` 执行准确 action 和 arguments。`statusOnly: true` 只返回凭据是否配置，不联网，不返回值。

工具参数按需加载，避免每个模型请求都带上几十个完整远端 schema。官方 schema 由服务端负责参数校验，插件额外检查关键批量限制。HTTP POST 格式沿用原 skill 的官方 JSON-RPC 接口，不假装完成了 Streamable HTTP 协议协商。

## 安全

- 请求只能发往代码内固定的腾讯会议官方 HTTPS 地址，禁止重定向；无自定义 endpoint。
- 每次操作通过 DSH 凭据服务重新读取凭据，不缓存、不输出、不写日志。
- 返回中 Token、授权、密码字段以及当前 Token 明文会脱敏。
- 写入、通讯录及未知操作必须通过 DSH approval；`never` 策略下拒绝，不发送业务请求。确认摘要不得含个人电话、邮箱、内部 ID、Token。
- 录制申请的 prepare/commit、参与者校验及通讯录意图等多步业务约束在 skill 中明确要求；插件并未通过持久状态机器证明模型已执行这些前置步骤。通讯录 meetingIntent 是模型声明，不是意图鉴别器。
- 不自动反馈、更新或重试；网络错误不打印请求头。响应最多 4 MiB、超时最多 120 秒。
- 工具结果可能包含私人会议内容并进入当前会话历史；请保护 DSH 本地数据。

## 开发与发布

```powershell
npm run check
npm test
npm pack --dry-run
npm pack
```

包文件白名单排除 `.env`、测试、缓存、node_modules。图标为本项目原创通用摄像机图形，不是腾讯商标。插件实现及说明重新编写；未复制官方 skill 源码或参考文件。依赖采用 DSH 已提供的 peer package，无 build scripts。

统一源码仓库：[sibetlyf/dsh-plugins](https://github.com/sibetlyf/dsh-plugins/tree/main/plugins/dsh-plugin-tencent-meeting)。尚未发布到 npm；dsh.so 市场收录状态以平台审核结果为准。真实腾讯接口仅在用户手动配置 Token 后验证；自动测试只使用模拟响应，不读取用户秘密。
