# dsh-plugin-gateway

> nanoMuse Gateway & Remote Device Control Plugin for DeepSeek Harness (DSH) Web.

本插件为 DeepSeek Harness (DSH) Web 官方运行环境提供专注、纯粹的 **中转网关长连接** 与 **跨端远程设备协同调度** 功能。

---

## 核心功能

1. **网关长连接与自适应连通**
   - 支持连接自建或云端 Python nanoMuse Gateway。
   - 优先探测标准 `/healthz` 健康端点，自适应兼容免密直连模式与带密鉴权模式。
   - 自动向网关建立 WebSocket (`/v1/hub`) 全双工中继长连接，内置心跳守护与断线重连。

2. **跨设备远程操作工具 (Agent Tools)**
   - `devices`：查看当前网关拓扑中所有在线的手机、服务器或电脑设备。
   - `device_shell`：在指定的远程设备上执行命令行指令并回传结果。
   - `device_screen`：获取指定远程设备的实时屏幕截图。
   - `device_notify`：向指定的远程设备（如手机桌面）推送弹窗提醒。
   - `device_open`：在远程设备上打开特定网页 URL 或唤起应用。

3. **原生内嵌设置面板 (DSH Web UI)**
   - 无外部独立前端或端口依赖，完全融入 DSH Web 原生界面。
   - 同时挂载于 **插件列表 (Plugins)** 与 **系统设置 (Settings)**，支持即时探测网关、管理账号密码，并实时查看拓扑设备与一键快捷测试。

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
- 输入您的网关地址（例如 `http://<服务器IP>:8790`）；
- 点击 **测试连接** 与 **保存并连接网关** 即可一键就绪。
