# dsh-plugin-gateway

> nanoMuse Gateway & Remote Device Control Plugin for DeepSeek Harness (DSH) Web.

本插件为 DeepSeek Harness (DSH) Web 官方运行环境提供 **中转网关长连接**、**对话内 @设备** 与 **跨端远程设备协同调度** 能力。

---

## 核心功能

1. **网关长连接与自适应连通**
   - 支持连接自建或云端 Python nanoMuse Gateway。
   - 优先探测标准 `/healthz` 健康端点，自适应兼容免密直连模式与带密鉴权模式。
   - 自动向网关建立 WebSocket (`/v1/hub`) 全双工中继长连接，15s 心跳保活；断线后按 1s→2s→4s…（上限 30s）指数退避重连。

2. **对话内 @设备（本版新增）**
   - 在 DSH 对话输入框键入 `@`，直接弹出在线设备候选菜单（按在线状态分组，显示 `@handle` 与在线/离线）。
   - 选中后以 `@handle` 写回草稿；输入框内该令牌会高亮，发送后消息中显示为**设备高亮胶囊**（品牌色描边 + 在线状态点）。
   - 发送消息时，Host 半自动解析其中的 `@handle`，把对话内容投递给对应设备：对端支持 `task` 时下发给它的 DSH Agent，否则退化为 `notify` 通知；投递前会剥离该目标的 `@handle` 令牌，避免跨端回环。
   - 输入框下方 Dock 实时显示投递状态（投递中 / 已送达 / 部分送达 / 失败）。
   - 设备名含空格等字符时，自动归一化为稳定 `handle`（空格→`-`），规则：只保留字母、数字、`_`、`-`。

3. **跨设备远程操作工具 (Agent Tools)**
   - `devices`：查看网关拓扑中所有设备、其 `@handle` 与在线状态。
   - `device_shell`：在指定远程设备上执行命令行指令并回传结果。
   - `device_screen`：获取指定远程设备的实时屏幕截图（本机为 Windows 时同时对外提供 `screen` 能力）。
   - `device_notify`：向指定远程设备推送系统弹窗提醒。
   - `device_open`：在远程设备上打开网页 URL 或应用深链。
   - `device_task`：把复杂任务委托给对端设备上的 Agent。
   - 模型侧会收到一段提示：用户消息里的 `@handle` 已由插件自动投递，无需再重复 `device_task`。

4. **原生内嵌设置面板 (DSH Web UI)**
   - 无外部独立前端或端口依赖，完全融入 DSH Web 原生界面。
   - 同时挂载于 **插件列表 (Plugins)** 与 **系统设置 (Settings)**：探测网关、管理账号密码、查看设备拓扑与一键 `@handle` 复制、发起 `ping`/通知/截屏/委托测试、查看 @ 提及投递记录并做投递自检。

---

## HTTP 端点（插件自带，便于脚本与自检）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/nanomuse/gateway/config` | 当前配置（含 token，仅本机 Web 可用） |
| POST | `/nanomuse/gateway/test` | 探测网关健康端点 |
| POST | `/nanomuse/gateway/connect` | 认证 + 保存配置 + 建立长连接（`__logout: true` 为注销） |
| GET | `/nanomuse/gateway/devices` | 设备拓扑（含 `handle`） |
| POST | `/nanomuse/gateway/device/call` | 调用设备动作（`to` 支持 name/id/handle） |
| POST | `/nanomuse/gateway/mentions/parse` | 只解析文本中的 `@handle`（不投递，dry-run） |
| GET | `/nanomuse/gateway/mentions` | 最近的 @ 提及投递记录 |
| POST | `/nanomuse/gateway/mentions/send` | 手动投递（`{ text }` 或 `{ text, handles }`） |
| POST | `/nanomuse/gateway/mentions/clear` | 清空投递记录 |
| POST/GET | `/nanomuse/gateway/client-log` | 浏览器侧注册结果与异常回传（无控制台时的自检通道） |

---

## 安装与使用

在 `dsh-plugins` 仓库根目录执行安装：

```bash
dsh plugin --profile web add ./plugins/dsh-plugin-gateway
```

启动 DSH Web 客户端：

```bash
dsh --profile web
```

打开浏览器进入 DSH Web，在 **设置** 或 **插件** 中找到 **nanoMuse 网关与设备**：
- 输入网关地址（例如 `http://<服务器IP>:8790`）；
- 点击 **测试连接** 与 **保存并连接网关** 即可一键就绪；
- 回到对话输入框，键入 `@` 选择设备，直接发送内容即可跨端投递。

> 对端设备若仍是旧版插件（只声明 `ping/info/notify`），@ 投递会自动降级为通知；升级两端插件后即可走对端 Agent。

---

## 自检

```bash
# 设备与 @handle
curl -s http://127.0.0.1:3080/nanomuse/gateway/devices

# 只解析、不投递
curl -s -X POST http://127.0.0.1:3080/nanomuse/gateway/mentions/parse \
  -H 'content-type: application/json' \
  -d '{"text":"@<handle> 帮我看下这个报错"}'

# 浏览器侧注册结果（刷新页面后查看）
curl -s http://127.0.0.1:3080/nanomuse/gateway/client-log
```
