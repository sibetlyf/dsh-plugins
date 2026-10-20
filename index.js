/**
 * dsh-gateway: nanoMuse Gateway & Remote Device Control Plugin
 * 纯粹的 DSH 官方 Web 扩展插件：提供网关长连接与跨设备远程协同调度能力
 */
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { exec } from 'node:child_process'

export const name = 'dsh-plugin-gateway'
export const inject = ['tools']

// 全局活跃的远程 DSH 任务映射: sessionId -> { callId, fromId, ws, finalOutput, timer }
const activeTasks = new Map()

const API_PREFIX = '/nanomuse/gateway'

/** 本机设备在网关拓扑中的展示名（@提及的 origin 也用它） */
const SELF_DEVICE_NAME = 'DSH Web Client'

/** @提及转发记录上限（内存环形缓冲，供设置面板与对话 Dock 读取） */
const MAX_MENTION_RECORDS = 60
/** 客户端诊断日志上限（无浏览器控制台时用于验证 UI 注册结果） */
const MAX_CLIENT_LOGS = 120

const mentionRecords = []
const clientLogs = []

function recordMention(entry) {
  mentionRecords.unshift(entry)
  if (mentionRecords.length > MAX_MENTION_RECORDS) mentionRecords.length = MAX_MENTION_RECORDS
  return entry
}

function patchMention(id, patch) {
  const record = mentionRecords.find((item) => item.id === id)
  if (record) Object.assign(record, patch)
  return record
}

function listMentions(limit) {
  const size = Math.max(1, Math.min(Number(limit) || 20, MAX_MENTION_RECORDS))
  return mentionRecords.slice(0, size)
}

function recordClientLog(entry) {
  clientLogs.unshift({ ...entry, time: Date.now() })
  if (clientLogs.length > MAX_CLIENT_LOGS) clientLogs.length = MAX_CLIENT_LOGS
}

/**
 * 生成 @ 提及用的稳定 handle：设备名可能含空格/符号，而 @ 令牌以空白终止，
 * 因此 handle 只保留字母、数字、下划线与连字符。
 */
function sanitizeHandle(name, id) {
  const raw = String(name ?? '').trim()
  let handle = raw.replace(/\s+/gu, '-').replace(/[^\p{L}\p{N}_-]/gu, '').slice(0, 32)
  if (!handle) handle = String(id ?? '').slice(0, 8) || 'device'
  return handle
}

/** 给网关上除本机以外的设备补上唯一 handle，并过滤掉纯 Web 连接。 */
function decorateDevices(list, selfId) {
  const used = new Map()
  const out = []
  for (const device of Array.isArray(list) ? list : []) {
    if (!device || typeof device.id !== 'string') continue
    if (device.id === selfId || device.kind === 'web') continue
    let handle = sanitizeHandle(device.name, device.id)
    const key = handle.toLowerCase()
    const seen = used.get(key) ?? 0
    used.set(key, seen + 1)
    if (seen > 0) handle = `${handle}-${seen + 1}`
    out.push({ ...device, handle })
  }
  return out
}

/** 从消息文本里解析出被 @ 的设备（大小写不敏感，按 handle 匹配）。 */
function parseMentions(text, devices) {
  const map = new Map()
  for (const device of Array.isArray(devices) ? devices : []) map.set(String(device.handle).toLowerCase(), device)
  const found = []
  const pattern = /@([\p{L}\p{N}_-]+)/gu
  for (const match of String(text ?? '').matchAll(pattern)) {
    const device = map.get(match[1].toLowerCase())
    if (device && !found.some((item) => item.id === device.id)) found.push(device)
  }
  return found
}

/** 把转发目标自身的 @handle 令牌从正文里移除，避免对端再次解析成提及。 */
function stripMentionTokens(text, devices) {
  const handles = new Set((Array.isArray(devices) ? devices : []).map((d) => String(d.handle).toLowerCase()))
  if (handles.size === 0) return String(text ?? '')
  return String(text ?? '')
    .replace(/@([\p{L}\p{N}_-]+)/gu, (full, token) => (handles.has(String(token).toLowerCase()) ? ' ' : full))
    .replace(/[ \t]{2,}/gu, ' ')
    .trim()
}

/** 取用户消息中的纯文本内容。 */
function messageText(message) {
  const content = message?.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((block) => (block && block.type === 'text' && typeof block.text === 'string' ? block.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim()
}

/**
 * 以 -EncodedCommand 方式执行 PowerShell 脚本：脚本以 UTF-16LE + Base64 传递，
 * 彻底避开 cmd.exe / PowerShell 的多层引号与 `$` 展开问题。
 */
function runPowerShell(script, timeoutMs = 20000) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  return new Promise((resolve, reject) => {
    exec(
      `powershell -NoProfile -NonInteractive -EncodedCommand ${encoded}`,
      { timeout: timeoutMs, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          error.stderr = String(stderr || '')
          return reject(error)
        }
        resolve(String(stdout || ''))
      },
    )
  })
}

/** 本机通知：Windows 走 MessageBox，其它平台退化为日志。 */
function showLocalNotice(title, text) {
  if (process.platform !== 'win32') return
  const quote = (value) => `'${String(value ?? '').replace(/'/g, "''")}'`
  const script = [
    "[reflection.assembly]::loadwithpartialname('System.Windows.Forms') | Out-Null",
    `[Windows.Forms.MessageBox]::Show(${quote(text)}, ${quote(title)})`,
  ].join('; ')
  runPowerShell(script, 120000).catch(() => {})
}

/** 捕获本机主屏，返回 PNG base64（仅 Windows）。 */
function captureScreen() {
  if (process.platform !== 'win32') return Promise.reject(new Error('当前平台不支持截屏'))
  const file = join(tmpdir(), `dsh-gateway-screen-${randomUUID().slice(0, 8)}.png`)
  const script = [
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    'Add-Type -AssemblyName System.Windows.Forms',
    'Add-Type -AssemblyName System.Drawing',
    '$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds',
    '$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height',
    '$g = [System.Drawing.Graphics]::FromImage($bmp)',
    '$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)',
    // 单引号字符串里反斜杠是字面量，直接写入真实路径
    `$bmp.Save('${file}', [System.Drawing.Imaging.ImageFormat]::Png)`,
    '$g.Dispose()',
    '$bmp.Dispose()',
    "Write-Output ($b.Width.ToString() + 'x' + $b.Height.ToString())",
  ].join('; ')
  return (async () => {
    try {
      const stdout = await runPowerShell(script, 25000)
      const [width, height] = String(stdout).trim().split('x').map((part) => Number(part) || 0)
      const buffer = await readFile(file)
      await unlink(file).catch(() => {})
      return { width, height, mime: 'image/png', data: buffer.toString('base64') }
    } catch (failure) {
      await unlink(file).catch(() => {})
      throw failure
    }
  })()
}

function dshHome() {
  const configured = process.env.DSH_HOME
  if (configured) return configured
  return join(process.env.HOME ?? process.env.USERPROFILE ?? homedir(), '.dsh')
}

function configPath() {
  return join(dshHome(), 'nanomuse', 'gateway-config.json')
}

async function loadStoredConfig() {
  try {
    const data = await readFile(configPath(), 'utf8')
    const parsed = JSON.parse(data)
    if (parsed && typeof parsed === 'object') return parsed
  } catch { }
  return {
    baseURL: process.env.NANOMUSE_CLOUD_URL || 'http://127.0.0.1:8790',
    identifier: 'admin',
    password: 'admin123',
    lastToken: '',
    deviceId: randomUUID(),
  }
}

async function saveStoredConfig(cfg) {
  try {
    await mkdir(join(dshHome(), 'nanomuse'), { recursive: true })
    await writeFile(configPath(), JSON.stringify(cfg, null, 2) + '\n', 'utf8')
  } catch { }
}

class HubClient {
  constructor(options, ctx = null) {
    this.options = options
    this.ctx = ctx
    this.deviceId = options.deviceId || randomUUID()
    this.deviceName = SELF_DEVICE_NAME
    this.ws = null
    this.running = false
    this.connected = false
    this.devices = []
    this.pendingCalls = new Map()
    this.pingTimer = null
    this.reconnectTimer = null
    this.reconnectAttempt = 0
    this.onBadKey = null  // 收到 bad_key 时的回调
  }

  /** 用网关推送的最新拓扑刷新本地设备列表（自动补 @handle 并排除本机）。 */
  setDevices(list) {
    this.devices = decorateDevices(list, this.deviceId)
  }

  /** 除本机之外的所有已连接设备（含 @handle）。 */
  others() {
    return this.devices
  }

  update(opts) {
    const changed = opts.baseURL !== this.options.baseURL || opts.token !== this.options.token
    this.options = { ...this.options, ...opts }
    if (changed && this.running) this.restart()
  }

  start() {
    if (this.running) return
    this.running = true
    this.connect()
  }

  stop() {
    this.running = false
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null }
    if (this.ws) {
      try { this.ws.close(1000, 'stopped') } catch { }
      this.ws = null
    }
    this.connected = false
    this.devices = []
  }

  send(frame) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(typeof frame === 'string' ? frame : JSON.stringify(frame))
        return true
      } catch { }
    }
    return false
  }

  restart() {
    this.stop()
    this.running = true
    this.connect()
  }

  connect() {
    if (!this.running || !this.options.baseURL || !this.options.token) return
    const wsUrl = this.options.baseURL.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:') + '/v1/hub'

    try {
      const ws = new WebSocket(wsUrl)
      this.ws = ws

      ws.onopen = () => {
        this.reconnectAttempt = 0
        const actions = ['ping', 'info', 'notify', 'open', 'shell', 'task']
        if (process.platform === 'win32') actions.push('screen')
        ws.send(JSON.stringify({
          type: 'hello',
          key: this.options.token,
          device: {
            id: this.deviceId,
            name: this.deviceName,
            kind: 'computer',
            os: process.platform,
            version: '1.2.0',
            actions,
          },
        }))

        // 15 秒心跳保活，抵抗 NAT 丢包与 Clash 代理空闲切断
        this.pingTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }))
          }
        }, 15000)
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data))
          if (msg.type === 'pong') {
            // 心跳回执，链路正常
            return
          }
          if (msg.type === 'welcome') {
            this.connected = true
            this.reconnectAttempt = 0
            if (Array.isArray(msg.devices)) this.setDevices(msg.devices)
          } else if (msg.type === 'error' && msg.code === 'bad_key') {
            // Token 已失效，触发自动重新认证
            this.connected = false
            this.stop()
            if (typeof this.onBadKey === 'function') this.onBadKey()
          } else if (msg.type === 'devices' && Array.isArray(msg.devices)) {
            this.setDevices(msg.devices)
          } else if ((msg.type === 'result' || msg.type === 'error') && msg.id) {
            const p = this.pendingCalls.get(msg.id)
            if (p) {
              clearTimeout(p.timer)
              this.pendingCalls.delete(msg.id)
              if (msg.type === 'error') p.reject(new Error(msg.message || '远程调用失败'))
              else p.resolve(msg.body ?? {})
            }
          } else if (msg.type === 'call' && msg.id && ws.readyState === WebSocket.OPEN) {
            const callId = msg.id
            const fromId = msg.from?.id
            const action = msg.action
            const body = msg.body || msg.args || {}

            const reply = (resBody) => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'result', id: callId, to: fromId, body: resBody }))
              }
            }
            const replyError = (errorMsg) => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'error', id: callId, to: fromId, message: String(errorMsg) }))
              }
            }

            if (action === 'ping') {
              reply({ pong: true, time: Date.now(), host: process.env.COMPUTERNAME || 'localhost' })
            } else if (action === 'info') {
              reply({
                name: this.deviceName,
                kind: 'computer',
                os: process.platform,
                arch: process.arch,
                node: process.version,
                time: Date.now(),
              })
            } else if (action === 'notify') {
              const title = String(body.title || 'DSH 远程控制提醒')
              const text = String(body.body || body.message || '跨设备连接正常！')
              // 关键：立即回复已送达，避免因为用户在对端未点击确认导致 15s 超时！
              reply({ ok: true, delivered: true, time: Date.now() })
              // 异步唤起本地通知弹窗（非阻塞，进程级独立窗口）
              showLocalNotice(title, text)
            } else if (action === 'screen') {
              captureScreen().then(
                (shot) => reply({ ok: true, ...shot, time: Date.now() }),
                (error) => replyError(error?.message || '截屏失败'),
              )
            } else if (action === 'shell') {
              const cmd = String(body.command || '').trim()
              if (!cmd) return replyError('command 不能为空')
              const timeoutMs = (Number(body.timeout) || 30) * 1000
              exec(
                cmd,
                { cwd: body.cwd || process.cwd(), timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 },
                (err, stdout, stderr) => {
                  // 同时给出 snake_case 与 camelCase，兼容不同版本的调用方
                  reply({
                    exit_code: err ? (err.code ?? 1) : 0,
                    exitCode: err ? (err.code ?? 1) : 0,
                    stdout: stdout ? stdout.toString() : '',
                    stderr: stderr ? stderr.toString() : '',
                    timedOut: Boolean(err && err.killed),
                  })
                },
              )
            } else if (action === 'open') {
              const url = String(body.url || '')
              if (!url) return replyError('缺少 url 参数')
              const cmd = process.platform === 'win32' ? `start "" "${url}"` : `open "${url}"`
              exec(cmd, () => {})
              reply({ ok: true, opened: url })
            } else if (action === 'task') {
              const taskText = String(body.text || body.prompt || body.command || '').trim()
              if (!taskText) return replyError('任务内容不能为空')
              const fromName = msg.from?.name || msg.from?.id || '远程设备'

              // 先发一个 event 告知发起方已成功接单
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'event',
                  id: callId,
                  to: fromId,
                  body: { stage: 'accepted', message: `[${this.deviceName}] 已接收任务，正在启动 DSH Agent 执行...` }
                }))
              }

              // 尝试使用本地 DSH sessionController 创建新会话并运行 Agent
              const sc = this.sessionController
              if (sc && typeof sc.create === 'function') {
                (async () => {
                  try {
                    let created = await sc.create({ agentPreset: 'nanomuse' }).catch(() => null)
                    if (!created) {
                      created = await sc.create({}).catch(() => null)
                    }
                    if (!created) {
                      created = await sc.create({ agentPreset: 'default' }).catch(() => null)
                    }
                    if (!created || !created.sessionId) {
                      return replyError('无法创建 DSH 会话: sessionController 返回空会话')
                    }

                    const sid = String(created.sessionId)
                    const title = `来自 ${fromName} 的任务`
                    await sc.rename?.({ sessionId: sid, title }).catch(() => {})

                    // 120 秒超时计时器，若 Agent 在超时时间内未结束则返回当前已收集到的输出
                    const taskTimer = setTimeout(() => {
                      if (activeTasks.has(sid)) {
                        const t = activeTasks.get(sid)
                        activeTasks.delete(sid)
                        reply({
                          ok: true,
                          text: t.finalOutput || '(等待 DSH Agent 回答超时，会话仍在本地后台执行)',
                          sessionId: sid,
                          timedOut: true
                        })
                      }
                    }, 120_000)

                    activeTasks.set(sid, {
                      callId,
                      fromId,
                      ws,
                      sessionId: sid,
                      finalOutput: '',
                      tools: new Map(),
                      timer: taskTimer,
                    })

                    const resolved = await sc.resolveAgent?.(sid).catch(() => null)
                    if (resolved && resolved.agent) {
                      let userMsg
                      try {
                        const { createUserMessage } = await import('@deepseek-ai/dsh-llm')
                        userMsg = createUserMessage({
                          content: [{ type: 'text', text: `[来自远程设备 ${fromName} 的任务委托]\n${taskText}` }],
                          source: { kind: 'user' }
                        })
                      } catch {
                        userMsg = {
                          id: randomUUID(),
                          role: 'user',
                          content: [{ type: 'text', text: `[来自远程设备 ${fromName} 的任务委托]\n${taskText}` }],
                          source: { kind: 'user' }
                        }
                      }
                      resolved.agent.followup(userMsg)
                    } else {
                      clearTimeout(taskTimer)
                      activeTasks.delete(sid)
                      replyError('未能成功解析并加载该会话的 Agent')
                    }
                  } catch (err) {
                    replyError(`DSH 任务调度失败: ${err?.message || err}`)
                  }
                })()
              } else {
                // 本地无完整会话控制器时（轻量端点），弹出通知并返回明确说明
                showLocalNotice('DSH 远程任务通知', `来自 ${fromName} 的远程任务:\n${taskText}`)

                reply({
                  ok: true,
                  text: `[本地提示] 目标电脑已成功接收任务: "${taskText}"。当前客户端实例作为轻量端点运行，建议启动完整 DSH 工作区环境以获得 AI Agent 交互。`,
                  device: this.deviceName
                })
              }
            } else {
              replyError(`不支持的操作 action: ${action}`)
            }
          }
        } catch { }
      }

      ws.onclose = () => {
        this.connected = false
        if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null }
        this.ws = null
        if (this.running) this.scheduleReconnect()
      }

      ws.onerror = () => {
        try { ws.close() } catch { }
      }
    } catch {
      if (this.running) this.scheduleReconnect()
    }
  }

  /** 指数退避重连（1s → 2s → 4s → … 上限 30s，带抖动），避免代理恢复瞬间的惊群。 */
  scheduleReconnect() {
    if (!this.running || this.reconnectTimer) return
    const attempt = Math.min(this.reconnectAttempt++, 5)
    const delay = Math.min(30_000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 600)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }

  async call(targetId, action, args = {}, timeoutMs = 30000) {
    if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('未连接到网关长连接通道，请检查网关配置')
    }

    const callId = 'call_' + randomUUID().slice(0, 8)
    const frame = { type: 'call', id: callId, to: targetId, action, body: args }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCalls.delete(callId)
        reject(new Error(`远程设备调用超时 (${timeoutMs / 1000}s)`))
      }, timeoutMs)

      this.pendingCalls.set(callId, { resolve, reject, timer })
      this.ws.send(JSON.stringify(frame))
    })
  }

  find(ref = '') {
    const query = ref.trim().toLowerCase()
    const others = this.devices.filter((d) => d.id !== this.deviceId && d.kind !== 'web')
    if (!query) return others.length === 1 ? others[0] : undefined

    return (
      others.find((d) => d.id.toLowerCase() === query) ??
      others.find((d) => d.name.toLowerCase() === query) ??
      others.find((d) => d.name.toLowerCase().includes(query)) ??
      (query === 'phone' || query === '手机' ? others.find((d) => d.kind === 'phone' && d.online) : undefined)
    )
  }
}

export async function apply(ctx, config = {}) {
  const stored = await loadStoredConfig()
  const cfg = { ...stored, ...config }

  const hub = new HubClient({
    baseURL: cfg.baseURL,
    token: cfg.lastToken || '',
    deviceId: cfg.deviceId,
  }, ctx)

  /**
   * 自动连接：优先复用已保存的 Token；若 Token 被网关拒绝（bad_key），
   * 则自动用已保存的 identifier + password 重新认证并获取新 Token。
   */
  async function autoConnect() {
    if (!cfg.baseURL) return
    const targetUrl = cfg.baseURL.replace(/\/+$/, '')

    // 1. 若有已保存 Token，先尝试直接启动长连接（WebSocket 握手时网关会校验 key）
    if (cfg.lastToken) {
      hub.update({ baseURL: targetUrl, token: cfg.lastToken, deviceId: cfg.deviceId })
      hub.start()
      return
    }

    // 2. 无 Token 但有 identifier + password，自动静默认证
    if (cfg.identifier) {
      const password = cfg.password || ''
      try {
        const resp = await fetch(`${targetUrl}/v1/auth/credentials`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ identifier: cfg.identifier, password, device: 'DSH Web Client' }),
          signal: AbortSignal.timeout(6000),
        })
        if (resp.ok) {
          const data = await resp.json().catch(() => ({}))
          if (data.api_key) {
            cfg.lastToken = data.api_key
            cfg.lastConnectedAt = Date.now()
            await saveStoredConfig(cfg)
            hub.update({ baseURL: targetUrl, token: cfg.lastToken, deviceId: cfg.deviceId })
            hub.start()
          }
        }
      } catch { }
    }
  }

  await autoConnect()

  // 监听 hub 连接错误：若 WebSocket 收到 bad_key，清除旧 Token 并重新认证
  hub.onBadKey = async () => {
    cfg.lastToken = ''
    await saveStoredConfig(cfg)
    await autoConnect()
  }

  // 安全通过 ctx.inject 获得 sessionController，不直接访问 ctx.sessionController 以符合 Cordis 隔离规范
  if (typeof ctx.inject === 'function') {
    try {
      ctx.inject(['sessionController'], (sctx) => {
        hub.sessionController = sctx.sessionController
      })
    } catch {}
  }

  /**
   * 把一个会话消息按 @handle 转发到对应远程设备。
   * 对端支持 task（DSH Agent）时下发给 Agent，否则退化为 notify 通知。
   */
  async function forwardMention({ sessionId, text, origin, targets }) {
    const devices = Array.isArray(targets) ? targets : []
    const body = stripMentionTokens(text, devices) || String(text ?? '')
    const record = recordMention({
      id: 'm_' + randomUUID().slice(0, 8),
      time: Date.now(),
      sessionId: sessionId ? String(sessionId) : '',
      origin: origin || SELF_DEVICE_NAME,
      text: body,
      targets: devices.map((device) => ({ id: device.id, name: device.name, handle: device.handle })),
      results: devices.map((device) => ({ handle: device.handle, name: device.name, status: 'sending' })),
      status: 'sending',
    })

    const settle = (handle, patch) => {
      const result = record.results.find((item) => item.handle === handle)
      if (result) Object.assign(result, patch)
      const states = record.results.map((item) => item.status)
      record.status = states.every((s) => s === 'ok')
        ? 'done'
        : states.some((s) => s === 'sending')
          ? 'sending'
          : states.some((s) => s === 'ok')
            ? 'partial'
            : 'error'
    }

    if (!hub.connected) {
      for (const device of devices) settle(device.handle, { status: 'error', error: '网关未连接' })
      record.status = 'error'
      record.error = '网关未连接'
      return record
    }

    await Promise.all(devices.map(async (device) => {
      const actions = Array.isArray(device.actions) ? device.actions : []
      const action = actions.includes('task') ? 'task' : actions.includes('notify') ? 'notify' : 'task'
      const payload = action === 'task'
        ? { text: body, from: origin || SELF_DEVICE_NAME }
        : { title: `来自 ${origin || SELF_DEVICE_NAME} 的消息`, body }
      const startedAt = Date.now()
      try {
        const response = await hub.call(device.id, action, payload, action === 'task' ? 600_000 : 25_000)
        const reply = typeof response?.text === 'string' ? response.text : ''
        settle(device.handle, {
          status: 'ok',
          action,
          durationMs: Date.now() - startedAt,
          ...(reply ? { reply: reply.slice(0, 2000) } : {}),
        })
      } catch (error) {
        settle(device.handle, {
          status: 'error',
          action,
          durationMs: Date.now() - startedAt,
          error: String(error?.message || error),
        })
      }
    }))
    return record
  }

  // —— @设备提及：用户消息里出现的 @handle 自动转发给对应设备 ——
  if (typeof ctx.on === 'function') {
    const seenUserMessages = new Set()
    ctx.on('session/event', (session, event) => {
      if (!event || event.type !== 'user/message') return
      const message = event.data?.message ?? event.data
      const id = String(message?.id ?? `${session?.id ?? ''}:${event.seq ?? ''}`)
      if (seenUserMessages.has(id)) return
      seenUserMessages.add(id)
      if (seenUserMessages.size > 400) {
        const oldest = seenUserMessages.values().next().value
        if (oldest !== undefined) seenUserMessages.delete(oldest)
      }
      const text = messageText(message)
      if (!text) return
      // 远程委托注入的消息与本插件自身的提示不参与转发，避免跨端回环
      if (text.startsWith('[来自远程设备') || text.startsWith('[本地提示]')) return
      const targets = parseMentions(text, hub.others())
      if (targets.length === 0) return
      void forwardMention({ sessionId: session?.id, text, targets })
    })
  }

  // 提示模型：@handle 已由网关插件自动投递，不要再重复调用 device_task
  const systemPrompt = ctx.get?.('systemPrompt')
  if (systemPrompt && typeof systemPrompt.section === 'function') {
    ctx.effect(() => systemPrompt.section({
      name: 'nanomuse-gateway-devices',
      order: 720,
      text: () => {
        const devices = hub.others()
        if (devices.length === 0) return ''
        const list = devices.map((device) => `@${device.handle} -> ${device.name} (${device.online ? 'online' : 'offline'})`).join('; ')
        return [
          'nanoMuse gateway is connected; remote devices reachable from this machine:',
          list,
          'When a user message contains one of those @handles, the gateway plugin has already forwarded the message to that device before this step. Do not repeat that delivery with device_task.',
          'The device tools accept those devices by name, id, or handle (without the @ prefix).',
        ].join('\n')
      },
    }), 'dsh-plugin-gateway: device mention prompt')
  }

  // 插件卸载/重载时关闭长连接
  ctx.effect(() => () => hub.stop(), 'dsh-plugin-gateway: hub lifetime')

  // 监听 DSH 会话事件流，实时将本地 Agent 思考输出与最终回答完整转送回调用端
  if (typeof ctx.on === 'function') {
    ctx.on('session/event', (session, event) => {
      if (!session || !event) return
      const sid = String(session.id)
      const task = activeTasks.get(sid)
      if (!task) return

      const { callId, fromId, ws } = task

      // 只上报低频的步进信号，避免每个流式分片都产生一条中继帧
      if (event.type === 'step/start') {
        hub.send({
          type: 'event',
          id: callId,
          to: fromId,
          body: { stage: 'stream_event', eventType: event.type }
        })
      }

      // 1. 中间工具调用事件
      if (event.type === 'tool/call') {
        const { callId: toolCallId, name, arguments: args } = event.data || {}
        if (toolCallId) {
          task.tools.set(String(toolCallId), { name, args })
        }
        const shownArgs = typeof args === 'string' ? args.slice(0, 160) : JSON.stringify(args || '').slice(0, 160)
        hub.send({
          type: 'event',
          id: callId,
          to: fromId,
          body: { stage: 'tool', name: name || 'tool', args: shownArgs }
        })
      }
      // 2. 工具返回结果事件 (tool/result)
      else if (event.type === 'tool/result') {
        const message = event.data?.message
        const toolCallId = String(message?.toolCallId || '')
        const toolInfo = task.tools.get(toolCallId)
        const toolName = toolInfo?.name || 'tool'
        let summary = ''
        if (message?.content) {
          if (Array.isArray(message.content)) {
            summary = message.content.map((b) => (b.type === 'text' ? b.text : '')).filter(Boolean).join('\n')
          } else if (typeof message.content === 'string') {
            summary = message.content
          }
        }
        hub.send({
          type: 'event',
          id: callId,
          to: fromId,
          body: {
            stage: 'tool_result',
            name: toolName,
            summary: summary.slice(0, 160),
            ok: message?.isError !== true
          }
        })
      }
      // 3. 中间模型输出事件 (assistant/message)
      else if (event.type === 'assistant/message') {
        const content = event.data?.message?.content
        let text = ''
        if (Array.isArray(content)) {
          text = content.map((b) => (b.type === 'text' ? b.text : '')).filter(Boolean).join('\n')
        } else if (typeof content === 'string') {
          text = content
        }
        if (text) {
          task.finalOutput = text
          hub.send({
            type: 'event',
            id: callId,
            to: fromId,
            body: { stage: 'text', text, interim: true }
          })
        }
      }
      // 4. 模型执行完毕 (turn/end)
      else if (event.type === 'turn/end') {
        clearTimeout(task.timer)
        activeTasks.delete(sid)
        let finalAnswer = task.finalOutput
        const reason = event.data?.reason
        if (!finalAnswer) {
          if (reason?.kind === 'error') {
            finalAnswer = `[DSH 模型异常]: ${reason.error?.message || JSON.stringify(reason.error || '执行出错')}`
          } else if (reason?.kind === 'aborted') {
            finalAnswer = `[DSH 操作中断]: ${reason.reason || '已取消'}`
          } else {
            finalAnswer = `[DSH 执行完成，无文本返回] (原因: ${JSON.stringify(reason || {})})`
          }
        }
        hub.send({
          type: 'result',
          id: callId,
          to: fromId,
          body: {
            ok: !reason || reason.kind !== 'error',
            text: finalAnswer,
            sessionId: sid,
            reason: reason,
            device: hub.deviceName,
            completed: true
          }
        })
      }
    })
  }

  // 监听 DSH 权限审批请求，优先接管远程设备委托任务的审批流
  if (typeof ctx.on === 'function') {
    ctx.on('approval/request', async (req, next) => {
      // 检查当前审批请求是否属于当前正被远程调度的任务会话
      const sid = String(req?.agent?.session?.id || req?.agent?.id || '')
      const task = activeTasks.get(sid)
      if (!task) {
        // 本地用户普通交互，交回默认审批流弹出 UI 卡片
        return next()
      }

      const { callId, fromId } = task
      const toolName = req.toolName || 'tool'
      const reason = req.displayReason?.zh || req.displayReason?.en || req.reason || '远程任务请求调用权限'

      // 向发起方上报审批通知事件
      hub.send({
        type: 'event',
        id: callId,
        to: fromId,
        body: {
          stage: 'approval',
          tool: toolName,
          reason: reason,
          autoApproved: true
        }
      })

      // nanoMuse 远程免打扰自动放行：来自同一受信任账号远程下发的任务，直接授予单次执行权限
      return 'allowed-once'
    }, true)
  }

  // 1. 注册 Agent 跨设备工具
  const tools = ctx.get?.('tools')
  if (tools && typeof tools.register === 'function') {
    const target = (ref) => {
      if (!hub.connected) throw new Error('网关长连接未就绪，请在设置中配置并连接网关')
      const d = hub.find(ref ?? '')
      if (!d) {
        const others = hub.others()
        throw new Error(others.length ? `未找到设备 "${ref}"。在线设备: ${others.map((x) => x.name).join(', ')}` : '当前暂无其他在线设备')
      }
      if (!d.online) throw new Error(`设备 "${d.name}" 当前离线`)
      return d
    }

    const defaultOutput = {
      schema: {},
      render: (_args, value) => [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
    }

    tools.register({
      name: 'devices',
      description: '获取当前在 nanoMuse 网关上连接的所有远程设备（手机、远程服务器、其他 PC 等）的列表、@提及 handle 与在线状态。',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      output: defaultOutput,
      isConcurrencySafe: () => true,
      execute: async () => {
        return {
          connected: hub.connected,
          this_device: { id: hub.deviceId, name: hub.deviceName },
          mention_hint: '用户消息里写 @handle 即可让网关插件把内容直接投递给该设备。',
          devices: hub.others().map((d) => ({
            id: d.id,
            name: d.name,
            handle: d.handle,
            mention: `@${d.handle}`,
            kind: d.kind,
            os: d.os,
            online: d.online,
            actions: d.actions,
          })),
        }
      },
      presentCall: () => ({ card: 'generic', title: '查询在线设备列表', kind: 'other', rawInput: {} }),
    })

    tools.register({
      name: 'device_shell',
      description: '在指定的远程设备（如远程服务器、另一台电脑或手机）上执行 shell 命令行指令并返回结果。',
      parameters: {
        type: 'object',
        properties: {
          device: { type: 'string', description: '目标设备名称、ID，或填 "phone" 代表手机。留空使用唯一绑定的其他设备。' },
          command: { type: 'string', description: '要执行的 shell 命令' },
          cwd: { type: 'string', description: '远程工作目录路径' },
          timeout: { type: 'integer', description: '超时秒数，默认 60' },
        },
        required: ['command'],
        additionalProperties: false,
      },
      output: defaultOutput,
      timeoutMs: 120_000,
      execute: async (args) => {
        const d = target(args.device)
        const timeout = Math.min(Math.max(args.timeout ?? 60, 1), 180)
        const res = await hub.call(d.id, 'shell', { command: args.command, cwd: args.cwd, timeout }, (timeout + 15) * 1000)
        return {
          device: d.name,
          exit_code: res.exit_code ?? res.exitCode ?? 0,
          stdout: String(res.stdout ?? ''),
          stderr: String(res.stderr ?? ''),
          ...(res.timedOut ? { timed_out: true } : {}),
        }
      },
      presentCall: (args) => ({ card: 'generic', title: `在 ${args.device || '远程设备'} 执行: ${args.command}`, kind: 'other', rawInput: args }),
    })

    tools.register({
      name: 'device_notify',
      description: '向指定的远程设备（如手机或电脑桌面）推送一条系统弹窗提醒通知。',
      parameters: {
        type: 'object',
        properties: {
          device: { type: 'string', description: '目标设备名称或 ID，留空使用唯一绑定的其他设备。' },
          title: { type: 'string', description: '通知标题' },
          body: { type: 'string', description: '通知正文' },
        },
        required: ['title', 'body'],
        additionalProperties: false,
      },
      output: defaultOutput,
      timeoutMs: 20_000,
      execute: async (args) => {
        const d = target(args.device)
        const res = await hub.call(d.id, 'notify', { title: args.title, body: args.body }, 15_000)
        return { ok: true, device: d.name, result: res }
      },
      presentCall: (args) => ({ card: 'generic', title: `向 ${args.device || '远程设备'} 发送通知: ${args.title}`, kind: 'other', rawInput: args }),
    })

    tools.register({
      name: 'device_screen',
      description: '获取指定远程设备当前的屏幕截图。',
      parameters: {
        type: 'object',
        properties: {
          device: { type: 'string', description: '目标设备名称或 ID。' },
        },
        additionalProperties: false,
      },
      output: defaultOutput,
      timeoutMs: 45_000,
      execute: async (args) => {
        const d = target(args.device)
        const res = await hub.call(d.id, 'screen', {}, 30_000)
        return { device: d.name, width: res.width ?? 0, height: res.height ?? 0, mime: res.mime ?? 'image/png', data: res.data ?? '' }
      },
      presentCall: (args) => ({ card: 'generic', title: `截取 ${args.device || '远程设备'} 屏幕`, kind: 'other', rawInput: args }),
    })

    tools.register({
      name: 'device_open',
      description: '在指定的远程设备上用默认浏览器打开一个网页 URL，或唤起对应的应用链接。',
      parameters: {
        type: 'object',
        properties: {
          device: { type: 'string', description: '目标设备名称、ID 或 @handle（不含 @）。' },
          url: { type: 'string', description: '要打开的 URL（http/https 或应用深链）' },
        },
        required: ['url'],
        additionalProperties: false,
      },
      output: defaultOutput,
      timeoutMs: 30_000,
      execute: async (args) => {
        const d = target(args.device)
        const res = await hub.call(d.id, 'open', { url: args.url }, 20_000)
        return { ok: true, device: d.name, result: res }
      },
      presentCall: (args) => ({ card: 'generic', title: `在 ${args.device || '远程设备'} 打开: ${args.url}`, kind: 'other', rawInput: args }),
    })

    tools.register({
      name: 'device_task',
      description: '委托另一台远程设备（如另外一台电脑或手机）上的 Agent 执行复杂的长期任务或新建对话。用户消息里的 @handle 已自动投递，无需再用本工具重复发送。',
      parameters: {
        type: 'object',
        properties: {
          device: { type: 'string', description: '目标设备名称、ID、@handle（不含 @），或填 "phone"。留空使用唯一绑定的其他设备。' },
          prompt: { type: 'string', description: '要委托给对端设备执行的具体任务需求或提示词' },
        },
        required: ['prompt'],
        additionalProperties: false,
      },
      output: defaultOutput,
      timeoutMs: 150_000,
      execute: async (args) => {
        const d = target(args.device)
        const res = await hub.call(d.id, 'task', { text: args.prompt }, 140_000)
        return { ok: true, device: d.name, result: res }
      },
      presentCall: (args) => ({ card: 'generic', title: `向 ${args.device || '远程设备'} 委托任务`, kind: 'other', rawInput: args }),
    })
  }

  // 2. 挂载 Web API（监听 webServer 就绪）
  ctx.inject?.(['webServer'], (subCtx) => {
    subCtx.effect(() => {
      return subCtx.webServer.register({
        kind: 'prefix',
        path: API_PREFIX,
        handler: async (req, res) => {
          const url = new URL(req.url ?? '/', 'http://127.0.0.1')
          const route = url.pathname.slice(API_PREFIX.length) || '/'

          const sendJson = (status, data) => {
            res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
            res.end(JSON.stringify(data))
          }

          const readJson = async () => {
            const chunks = []
            for await (const chunk of req) chunks.push(chunk)
            if (chunks.length === 0) return {}
            try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return {} }
          }

          try {
            if (req.method === 'GET' && route === '/config') {
              return sendJson(200, cfg)
            }

            if (req.method === 'POST' && route === '/test') {
              const body = await readJson()
              const targetUrl = String(body.baseURL || cfg.baseURL).replace(/\/+$/, '')
              try {
                // 优先探测标准健康接口 /healthz，其次探测根路径 / 或 /v1/gateway/status
                let resp = await fetch(`${targetUrl}/healthz`, { signal: AbortSignal.timeout(5000) }).catch(() => null)
                if (!resp || !resp.ok) {
                  resp = await fetch(`${targetUrl}/v1/gateway/status`, { signal: AbortSignal.timeout(5000) }).catch(() => null)
                }
                if (!resp || !resp.ok) {
                  resp = await fetch(`${targetUrl}/`, { signal: AbortSignal.timeout(5000) }).catch(() => null)
                }
                if (!resp || !resp.ok) {
                  return sendJson(502, { ok: false, error: resp ? `网关返回 HTTP ${resp.status}` : '无法连接到该网关地址' })
                }
                const info = await resp.json().catch(() => ({}))
                return sendJson(200, { ok: true, info })
              } catch (err) {
                return sendJson(502, { ok: false, error: err?.message || '无法连接到该网关地址' })
              }
            }

            if (req.method === 'POST' && route === '/connect') {
              const body = await readJson()

              // 注销：清除本地 Token，停止长连接
              if (body.__logout) {
                cfg.lastToken = ''
                cfg.password = ''
                await saveStoredConfig(cfg)
                hub.stop()
                return sendJson(200, { ok: true, logged_out: true })
              }

              const targetUrl = String(body.baseURL || cfg.baseURL).trim().replace(/\/+$/, '')
              const identifier = String(body.identifier || cfg.identifier || 'admin').trim()
              const password = String(body.password || cfg.password || '').trim()
              const newPassword = String(body.new_password || '').trim()

              if (!targetUrl) {
                return sendJson(400, { error: '网关地址为必填项' })
              }

              // 向网关认证，必须成功才保存 Token
              const payload = { identifier, password, device: 'DSH Web Client' }
              if (newPassword) payload.new_password = newPassword

              let apiKey = null
              let created = false
              let pwdUpdated = false
              let authError = null

              try {
                const resp = await fetch(`${targetUrl}/v1/auth/credentials`, {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify(payload),
                  signal: AbortSignal.timeout(6000),
                })
                const data = await resp.json().catch(() => ({}))
                if (resp.ok && data.api_key) {
                  apiKey = data.api_key
                  created = Boolean(data.created)
                  pwdUpdated = Boolean(data.password_updated)
                } else {
                  authError = data?.error?.message || data?.detail?.error?.message || `认证失败 (HTTP ${resp.status})`
                }
              } catch (err) {
                return sendJson(502, { error: '无法连接到网关，请检查地址是否正确' })
              }

              if (!apiKey) {
                return sendJson(400, { error: authError || '账号或密码错误，请检查后重试' })
              }

              // 认证成功，持久化保存（包括密码，用于 Token 失效后自动重连）
              cfg.baseURL = targetUrl
              cfg.identifier = identifier
              cfg.password = newPassword || password  // 保存最新有效密码
              cfg.lastToken = apiKey
              cfg.lastConnectedAt = Date.now()
              cfg.deviceId = hub.deviceId
              await saveStoredConfig(cfg)

              hub.update({ baseURL: targetUrl, token: apiKey, deviceId: hub.deviceId })
              hub.restart()

              return sendJson(200, {
                ok: true,
                created,
                password_updated: pwdUpdated,
                config: cfg,
              })
            }

            if (req.method === 'GET' && route === '/devices') {
              return sendJson(200, {
                connected: hub.connected,
                this_device: { id: hub.deviceId, name: hub.deviceName, kind: 'computer', os: process.platform, online: hub.connected },
                mention_prefix: '@',
                devices: hub.others(),
              })
            }

            // —— @提及：解析 / 投递 / 记录 / 客户端诊断 ——
            if (req.method === 'POST' && route === '/mentions/parse') {
              const body = await readJson()
              const text = String(body.text ?? '')
              const targets = parseMentions(text, hub.others())
              return sendJson(200, {
                ok: true,
                targets: targets.map((d) => ({
                  id: d.id,
                  name: d.name,
                  handle: d.handle,
                  online: d.online,
                  action: Array.isArray(d.actions) && d.actions.includes('task') ? 'task' : 'notify',
                })),
                text: stripMentionTokens(text, targets) || text,
              })
            }

            if (req.method === 'GET' && route === '/mentions') {
              const limit = Number(url.searchParams.get('limit')) || 20
              return sendJson(200, { connected: hub.connected, items: listMentions(limit) })
            }

            if (req.method === 'POST' && route === '/mentions/send') {
              const body = await readJson()
              const text = String(body.text ?? '').trim()
              if (!text) return sendJson(400, { error: 'text 不能为空' })
              const devices = hub.others()
              const handles = Array.isArray(body.handles) ? body.handles.map((h) => String(h).toLowerCase()) : []
              const targets = handles.length
                ? devices.filter((d) => handles.includes(String(d.handle).toLowerCase()))
                : parseMentions(text, devices)
              if (targets.length === 0) return sendJson(400, { error: '没有匹配的在线设备' })
              // 立即返回记录，投递在后台完成（task 可能耗时数分钟），状态从 /mentions 轮询
              forwardMention({ sessionId: body.sessionId, text, targets }).catch(() => {})
              const record = mentionRecords[0]
              return sendJson(200, { ok: true, record })
            }

            if (req.method === 'POST' && route === '/mentions/clear') {
              mentionRecords.length = 0
              return sendJson(200, { ok: true })
            }

            if (req.method === 'POST' && route === '/client-log') {
              const body = await readJson()
              recordClientLog({
                event: String(body.event ?? 'unknown'),
                detail: typeof body.detail === 'string' ? body.detail.slice(0, 1200) : body.detail ?? null,
              })
              return sendJson(200, { ok: true })
            }

            if (req.method === 'GET' && route === '/client-log') {
              const limit = Number(url.searchParams.get('limit')) || 40
              return sendJson(200, { items: clientLogs.slice(0, Math.max(1, Math.min(limit, MAX_CLIENT_LOGS))) })
            }

            if (req.method === 'POST' && route === '/device/call') {
              const body = await readJson()
              const { to, action, args, timeoutMs } = body
              if (!to || !action) return sendJson(400, { error: 'to 和 action 必填' })
              try {
                // 允许用 name / handle / id 指定目标
                const device = hub.find(String(to)) ?? hub.others().find((d) => d.id === to)
                const targetId = device?.id ?? to
                const result = await hub.call(targetId, action, args || {}, timeoutMs || 15000)
                return sendJson(200, { ok: true, device: device?.name ?? targetId, result })
              } catch (err) {
                return sendJson(500, { ok: false, error: err?.message || '调用失败' })
              }
            }

            return sendJson(404, { error: 'Not found' })
          } catch (e) {
            return sendJson(500, { error: e?.message || 'Internal error' })
          }
        },
      })
    }, 'dsh-gateway: webServer')
  })
}
