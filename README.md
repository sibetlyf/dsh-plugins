# DSH Plugins

DeepSeek Harness 第三方插件集合，各插件为独立可安装的 Cordis bundle，不修改 DSH 核心。

| 插件 | 能力 | 测试 |
|---|---|---|
| [滴滴打车](plugins/dsh-plugin-didi/README.md) | 地点搜索、路线、价格预估、App 链接、审批后订单管理 | 22 项自动化测试；官方 Sandbox 只读联调通过 |
| [美团外卖](plugins/dsh-plugin-meituan/README.md) | 独立浏览器搜索、菜单读取、审批后点击/加购 | 10 项自动化测试；真实登录/加购尚未验证 |
| [腾讯会议](plugins/dsh-plugin-tencent-meeting/README.md) | 会议、录制、转写、纪要及审批后敏感操作 | 10 项客户端自动化测试 |

## 安装

### 前置条件

- Node.js >=22、Git，以及已安装且能运行的 `dsh` 和 `pnpm`。
- 当前插件声明兼容 **DSH 0.2.1-alpha.1**。先执行 `dsh --version` 检查；其他版本尚未测试，遇到兼容性错误不要强行绕过。
- 下列命令安装到 `web` profile；使用其他 profile 时，将所有 `--profile web` 和最后的 `dsh web` 改成实际名称。

### 克隆并安装全部三个插件

以下命令适用于 PowerShell、macOS/Linux 终端。在希望保存源码的目录执行：

```sh
git clone https://github.com/sibetlyf/dsh-plugins.git
cd dsh-plugins

dsh plugin --profile web add ./plugins/dsh-plugin-didi
dsh plugin --profile web add ./plugins/dsh-plugin-meituan
dsh plugin --profile web add ./plugins/dsh-plugin-tencent-meeting
```

只安装其中一个时，仅执行对应的 `add` 命令。相对路径以当前终端所在目录为准，上述命令要求在克隆后的仓库根目录执行。命令由 DSH 管理 profile 依赖与 bundle 选择，无需手动编辑 profile 配置。

> 这是多插件仓库，**不要**执行 `dsh plugin --profile web add https://github.com/sibetlyf/dsh-plugins.git`：仓库根目录不是一个 bundle。这些包目前未发布到 npm，也不能直接用裸包名安装。

安装成功后，若 DSH 已在运行，请先正常停止现有进程，再重新启动同一个 profile：

```sh
dsh web
```

不要同时启动第二个 Web 实例来替换正在使用的页面。重新连接/刷新现有页面后，在插件管理器确认插件已启用且无激活错误。若安装器报告错误、待审批构建脚本或版本不兼容，应先处理该状态，不能仅凭命令退出就认定可用。本仓库自身没有安装/构建脚本。

### 安装后的必要配置

| 插件 | 必须完成的配置 | 首次验证 |
|---|---|---|
| 滴滴 | 在 DSH 凭据设置创建 `DSH_DIDI_API_KEY`，填入自己的 MCP Key；默认保持 `environment: sandbox` | 请 Agent 调用 `didi_discover`，参数 `{"statusOnly":true}`，随后发现官方工具 |
| 美团 | 默认使用系统 Edge；在独立浏览器中人工登录、选择配送地址。不需要 API Key | 请 Agent 调用 `meituan_discover`；实际浏览功能需要可启动的浏览器 |
| 腾讯会议 | 在 DSH 凭据设置创建 `DSH_TENCENT_MEETING_TOKEN`，填入从 [腾讯会议](https://meeting.tencent.com/ai-skill) 获取的个人 Token | 请 Agent 调用 `tencent_meeting_discover`，参数 `{"statusOnly":true}` |

不要将 key、Token 或 Cookie 写入仓库、命令参数或发到聊天。美团安装会解析 Playwright 运行依赖，默认不下载浏览器；没有 Edge 时可改插件配置 `channel: chrome` 使用已安装的 Chrome。建议先使用这两个系统浏览器之一。若选择 `channel: chromium`，需要另行安装与插件所用 Playwright 版本匹配的 Chromium，参见 [Playwright 浏览器安装文档](https://playwright.dev/docs/browsers)。美团不导入或保存现有 Cookie。

### 更新与卸载

在仓库根目录更新源码后，重新执行所需插件的安装命令，再正常重启对应 DSH profile：

```sh
git pull --ff-only
dsh plugin --profile web add ./plugins/dsh-plugin-didi
dsh plugin --profile web add ./plugins/dsh-plugin-meituan
dsh plugin --profile web add ./plugins/dsh-plugin-tencent-meeting
```

卸载某个插件（按需选择）：

```sh
dsh plugin --profile web remove dsh-plugin-didi
dsh plugin --profile web remove dsh-plugin-meituan
dsh plugin --profile web remove dsh-plugin-tencent-meeting
```

也可通过 DSH 插件管理器分别安装各插件目录的绝对路径。每个目录都有独立 manifest 和 bundle patch；本地目录安装可能链接到源码，安装后不要随意移动或删除克隆目录。需要可搬移包时，可在相应插件目录运行 `npm pack`，再用 `dsh plugin --profile web add <生成的.tgz绝对路径>` 安装。

## 安全

不含测试 key、Token、Cookie、用户地址或登录状态。滴滴默认 Sandbox；三个插件的敏感操作受 DSH 审批，never 策略拒绝。美团不支持订单提交或支付。

这些是第三方适配插件，不代表滴滴、美团或腾讯官方授权。尚未完成所有插件的 DSH GUI 安装激活验证，不将本地自动化测试等同于生产业务验证。

验证日期：2026-10-14。总计 42 项自动化测试通过。
