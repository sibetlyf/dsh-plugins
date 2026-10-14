# 腾讯会议 DSH 插件

标准 Cordis Host 插件/DSH bundle，Node.js 原生实现，无 Python、无安装脚本。不附带任何账号或 Token，不读取原 skill 目录或其 `.env`。

## 安装

```powershell
dsh plugin --profile web add https://github.com/sibetlyf/dsh-plugin-tencent-meeting.git
```

亦可在 DSH 插件页输入本地绝对路径安装。发布后可将路径替换为实际 npm 包名或 Git 仓库地址。当前仅声明兼容 DSH 0.2.1-alpha.1，其他版本需要另行测试，勿绕过兼容性限制。

## 用户手动输入 Token

1. 用户自行访问 https://meeting.tencent.com/ai-skill 获取个人 Token。
2. 打开 DSH 插件设置中的 **腾讯会议**，在 `tokenRef` 对应的凭据输入控件中输入自己的 Token。默认凭据名称为 `DSH_TENCENT_MEETING_TOKEN`。
3. `tokenRef` 配置保存的是引用名称，不是 Token。Token 保存在 DSH 本地凭据服务管理的存储中，不进入插件包、配置补丁或工具参数。
4. 凭据 UI 若在当前版本不可用，可自行设置同名启动环境变量后重启 DSH。不应把 Token 发到聊天。

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

公开源码仓库：https://github.com/sibetlyf/dsh-plugin-tencent-meeting 。尚未发布到 npm；dsh.so 市场收录状态以平台审核结果为准。真实腾讯接口仅在用户手动配置 Token 后验证；自动测试只使用模拟响应，不读取用户秘密。
