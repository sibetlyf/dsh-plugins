# DSH Plugins

DeepSeek Harness 第三方插件集合，各插件为独立可安装的 Cordis bundle，不修改 DSH 核心。

| 插件 | 能力 | 测试 |
|---|---|---|
| [滴滴打车](plugins/dsh-plugin-didi/README.md) | 地点搜索、路线、价格预估、App 链接、审批后订单管理 | 22 项自动化测试；官方 Sandbox 只读联调通过 |
| [美团外卖](plugins/dsh-plugin-meituan/README.md) | 独立浏览器搜索、菜单读取、审批后点击/加购 | 10 项自动化测试；真实登录/加购尚未验证 |
| [腾讯会议](plugins/dsh-plugin-tencent-meeting/README.md) | 会议、录制、转写、纪要及审批后敏感操作 | 10 项客户端自动化测试 |
| [跨端中枢（网关）](plugins/dsh-plugin-gateway/README.md) | nanoMuse 网关长连接、对话内 @设备（候选菜单 + 高亮胶囊 + 自动投递）、侧边栏跨端面板、消息/任务双向转发、审批回传、远程截屏/命令/打开链接 | DSH 0.2.1-alpha.1 Web 实测：@ 设备候选/投递、手机→电脑 task、电脑→手机 notify/task、设置页与侧边栏渲染通过；`shell`/`open` 默认关闭 |

## 让 DSH AI 帮你安装

将以下请求发给目标 DSH 的 AI（按需删去不需要的插件）：

> 请读取 https://github.com/sibetlyf/dsh-plugins/blob/main/AI-INSTALL.md ，按照该指南为当前 DSH 安装和配置滴滴、美团、腾讯会议插件。先确认实际 DSH 版本、profile、可用工具和权限，再执行。凭据请用安全输入，不要索要聊天明文；如必须由我重启或手动登录，请明确给出步骤。最后分别报告安装、激活、配置与只读连通状态，不要测试真实订单或其他敏感操作。

完整 Agent 执行规范见 [AI 安装配置指南](AI-INSTALL.md)。该指南支持不同系统和工具可用性的分支，但不能绕过版本不兼容、用户权限、审批或缺少凭据等限制，不承诺所有 DSH 版本都能无人值守完成。

## 安装

### 前置条件

- Node.js >=22、Git，以及已安装且能运行的 `dsh` 和 `pnpm`。
- 当前插件声明兼容 **DSH 0.2.1-alpha.1 至 0.2.1-rc.2**。先执行 `dsh --version` 检查；更旧的测试版本之外不要强行绕过。
- 下列命令安装到 `web` profile；使用其他 profile 时，将所有 `--profile web` 和最后的 `dsh web` 改成实际名称。

### 安装跨端中枢（main 根 bundle）

`main` 根目录现在就是跨端中枢这个 bundle，直接安装：

```sh
dsh plugin --profile web add "github:sibetlyf/dsh-plugins#main"
```

固定版本：

```sh
dsh plugin --profile web add "github:sibetlyf/dsh-plugins#dsh-plugin-gateway-v0.3.1"
```

其他插件仍放在 `plugins/` 下，用各自的发布分支安装：

```sh
dsh plugin --profile web add "github:sibetlyf/dsh-plugins#publish/dsh-plugin-didi"
dsh plugin --profile web add "github:sibetlyf/dsh-plugins#publish/dsh-plugin-tencent-meeting"
```

整段 spec 要加引号，因为 `#` 在 PowerShell 中会被当作注释。安装器会处理 profile 依赖与 bundle 选择，无需手动编辑 profile 配置。

> `main` 安装的是跨端中枢；它不会自动安装 `plugins/` 下的其他插件。私有仓库需要配置 Git token。

维护者更新发布分支：

```sh
git subtree split --prefix=plugins/dsh-plugin-gateway -b publish/dsh-plugin-gateway
git push --force origin publish/dsh-plugin-gateway
```

### 本地源码安装（可选）

需要改代码时：

```sh
git clone https://github.com/sibetlyf/dsh-plugins.git
cd dsh-plugins
dsh plugin --profile web add ./plugins/dsh-plugin-gateway
```

本地目录安装会链接源码，安装后不要移动或删除克隆目录。

安装成功后，若 DSH 已在运行，请先正常停止现有进程，再重新启动同一个 profile：

```sh
dsh web
```

不要同时启动第二个 Web 实例来替换正在使用的页面。重新连接/刷新现有页面后，在插件管理器确认插件已启用且无激活错误。若安装器报告错误、待审批构建脚本或版本不兼容，应先处理该状态，不能仅凭命令退出就认定可用。本仓库自身没有安装/构建脚本。

### 安装后的必要配置

| 插件 | 必须完成的配置 | 首次验证 |
|---|---|---|
| 滴滴 | 通过实例支持的安全凭据输入，或在启动终端设置 `DSH_DIDI_API_KEY`；默认保持 `environment: sandbox` | 请 Agent 调用 `didi_discover`，参数 `{"statusOnly":true}`，随后发现官方工具 |
| 美团 | 默认使用系统 Edge；在独立浏览器中人工登录、选择配送地址。不需要 API Key | 请 Agent 调用 `meituan_discover`；实际浏览功能需要可启动的浏览器 |
| 腾讯会议 | 通过实例支持的安全凭据输入，或在启动终端设置 `DSH_TENCENT_MEETING_TOKEN`；个人 Token 从 [腾讯会议](https://meeting.tencent.com/ai-skill) 获取 | 请 Agent 调用 `tencent_meeting_discover`，参数 `{"statusOnly":true}` |
| 跨端中枢 | 在 **设置 → 跨端中枢** 填写网关地址、账号、密码；手机用同一账号登录 | 侧边栏出现「跨端」；输入 `@` 出现在线设备候选 |

**滴滴和腾讯会议 0.1.1 新增专用凭据界面。** 新版安装激活后，在 Web 设置的插件配置区域查找「滴滴打车凭据」或「腾讯会议凭据」，可隐藏输入、保存、删除和刷新配置状态。使用 DSH 凭据接口，不把密钥提交到 AI 对话或浏览器存储。页面中的引用名称必须与 Host 插件的 `keyRef`/`tokenRef` 一致；默认无需修改。DSH 默认保存到 `$DSH_HOME/.credentials.yaml`，不是加密保险库。启动环境变量优先且只读，需移除同名环境变量并重启后才能在界面保存。

该界面依赖 Web 设置插槽和 `remote.credentials`；未支持这些能力的实例仍需以下回退方式。尚未完成真实 GUI 渲染/持久存储端到端验收，不将模拟测试等同于该验收。本插件的 `keyRef`/`tokenRef` 只存引用名称，不能填真实密钥。缺少安全输入工具时，请在启动 DSH 的终端隐藏输入凭据；Windows PowerShell 和 Bash 命令见 [凭据配置步骤](AI-INSTALL.md#4-安全配置凭据)。已经运行的 DSH 不会收到另一个临时 shell 中新增的环境变量，需要用户从输入凭据的终端正常重新启动。

不要将 key、Token 或 Cookie 写入仓库、命令参数或发到聊天。美团安装会解析 Playwright 运行依赖，默认不下载浏览器；没有 Edge 时可改插件配置 `channel: chrome` 使用已安装的 Chrome。建议先使用这两个系统浏览器之一。若选择 `channel: chromium`，需要另行安装与插件所用 Playwright 版本匹配的 Chromium，参见 [Playwright 浏览器安装文档](https://playwright.dev/docs/browsers)。美团不导入或保存现有 Cookie。

### 更新与卸载

GitHub ref 更新（跨端中枢跟随 `main`；固定 tag 时把 `main` 换成新 tag）：

```sh
dsh plugin --profile web remove dsh-plugin-gateway
dsh plugin --profile web add "github:sibetlyf/dsh-plugins#main"
```

其他插件把 `#main` 换成各自的 `#publish/<插件>` 分支。本地源码更新：

```sh
git pull --ff-only
dsh plugin --profile web remove dsh-plugin-gateway
dsh plugin --profile web add ./plugins/dsh-plugin-gateway
```

更新后正常停止并重新启动对应 DSH profile。卸载某个插件（按需选择）：

```sh
dsh plugin --profile web remove dsh-plugin-didi
dsh plugin --profile web remove dsh-plugin-meituan
dsh plugin --profile web remove dsh-plugin-tencent-meeting
dsh plugin --profile web remove dsh-plugin-gateway
```

也可通过 DSH 插件管理器分别安装各插件目录的绝对路径。每个目录都有独立 manifest 和 bundle patch；本地目录安装可能链接到源码，安装后不要随意移动或删除克隆目录。需要可搬移包时，可在相应插件目录运行 `npm pack`，再用 `dsh plugin --profile web add <生成的.tgz绝对路径>` 安装。

## 安全

不含测试 key、Token、Cookie、用户地址或登录状态。滴滴默认 Sandbox；各插件的敏感操作受 DSH 审批，never 策略拒绝。美团不支持订单提交或支付；跨端插件的 `shell` 与 `open` 默认关闭。

这些是第三方适配插件，不代表滴滴、美团或腾讯官方授权。尚未完成所有插件的 DSH GUI 安装激活验证，不将本地自动化测试等同于生产业务验证。

验证日期：2026-10-21。总计 42 项自动化测试通过；跨端插件的手机↔电脑双向通知/任务另做了实测。
