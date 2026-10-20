/**
 * dsh-gateway: nanoMuse Gateway & Remote Device Control Plugin
 * 纯粹的 DSH 官方 Web 扩展插件：提供网关长连接与跨设备远程协同调度能力
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'

export const name = 'dsh-plugin-gateway'
export const inject = ['tools']

const API_PREFIX = '/nanomuse/gateway'

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
    this.deviceName = 'DSH Web Client'
    this.ws = null
    this.running = false
    this.connected = false
    this.devices = []
    this.pendingCalls = new Map()
    this.pingTimer = null
    this.reconnectTimer = null
    this.onBadKey = null  // 收到 bad_key 时的回调
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
        ws.send(JSON.stringify({
          type: 'hello',
          key: this.options.token,
          device: {
            id: this.deviceId,
            name: this.deviceName,
            kind: 'computer',
            os: process.platform,
            version: '1.0.0',
            actions: ['ping', 'info', 'notify', 'shell', 'open', 'task'],
          },
        }))

        this.pingTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }))
          }
        }, 25000)
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data))
          if (msg.type === 'welcome') {
            this.connected = true
            if (Array.isArray(msg.devices)) {
              this.devices = msg.devices
            }
          } else if (msg.type === 'error' && msg.code === 'bad_key') {
            // Token 已失效，触发自动重新认证
            this.connected = false
            this.stop()
            if (typeof this.onBadKey === 'function') this.onBadKey()
          } else if (msg.type === 'devices' && Array.isArray(msg.devices)) {
            this.devices = msg.devices
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

              // 异步唤起本地通知弹窗（非阻塞）
              import('node:child_process').then(({ exec }) => {
                if (process.platform === 'win32') {
                  const escapedText = text.replace(/'/g, "''").replace(/"/g, '`"')
                  const escapedTitle = title.replace(/'/g, "''").replace(/"/g, '`"')
                  const psCmd = `powershell -NoProfile -Command "[reflection.assembly]::loadwithpartialname('System.Windows.Forms'); [Windows.Forms.MessageBox]::Show('${escapedText}', '${escapedTitle}')"`
                  exec(psCmd)
                }
              }).catch(() => {})
            } else if (action === 'shell') {
              const cmd = String(body.command || '').trim()
              if (!cmd) return replyError('command 不能为空')
              import('node:child_process').then(({ exec }) => {
                const timeoutMs = (Number(body.timeout) || 30) * 1000
                exec(cmd, { cwd: body.cwd || process.cwd(), timeout: timeoutMs }, (err, stdout, stderr) => {
                  reply({
                    exitCode: err ? (err.code ?? 1) : 0,
                    stdout: stdout ? stdout.toString() : '',
                    stderr: stderr ? stderr.toString() : '',
                    timedOut: Boolean(err && err.killed),
                  })
                })
              }).catch(err => replyError(err?.message || '无法执行 shell'))
            } else if (action === 'open') {
              const url = String(body.url || '')
              if (url) {
                import('node:child_process').then(({ exec }) => {
                  const cmd = process.platform === 'win32' ? `start "" "${url}"` : `open "${url}"`
                  exec(cmd)
                  reply({ ok: true, opened: url })
                }).catch(err => replyError(err?.message))
              } else {
                replyError('缺少 url 参数')
              }
            } else if (action === 'task') {
              const taskText = String(body.text || body.prompt || body.command || '').trim()
              if (!taskText) return replyError('任务内容不能为空')
              const fromName = msg.from?.name || msg.from?.id || '远程设备'

              // 关键设计：立即回复发起端任务已被成功接单（避免大模型推理或异步等待导致超时！）
              reply({
                ok: true,
                accepted: true,
                task: taskText.slice(0, 60),
                message: `[${this.deviceName}] 已成功接收来自 ${fromName} 的任务并开始执行`
              })

              // 异步唤起本地 DSH 会话与 Agent 执行（非阻塞）
              (async () => {
                try {
                  const sc = this.ctx?.get?.('sessionController') || this.ctx?.sessionController
                  if (sc && typeof sc.create === 'function') {
                    // 兼容模式创建会话：不限定不存在的 preset
                    let created = await sc.create({}).catch(() => null)
                    if (!created) {
                      created = await sc.create({ agentPreset: 'default' }).catch(() => null)
                    }
                    if (created && created.sessionId) {
                      const sid = created.sessionId
                      const title = `来自 ${fromName} 的任务`
                      await sc.rename?.({ sessionId: sid, title }).catch(() => {})
                      const resolved = await sc.resolveAgent?.(sid).catch(() => null)
                      if (resolved && resolved.agent) {
                        resolved.agent.followup({
                          role: 'user',
                          content: [{ type: 'text', text: `[来自远程设备 ${fromName} 的任务]\n${taskText}` }]
                        })
                      }
                      return
                    }
                  }

                  // 本地环境无会话控制器时，弹出系统通知提醒
                  import('node:child_process').then(({ exec }) => {
                    if (process.platform === 'win32') {
                      const escaped = `来自 ${fromName} 的远程任务:\n${taskText}`.replace(/'/g, "''").replace(/"/g, '`"')
                      const psCmd = `powershell -NoProfile -Command "[reflection.assembly]::loadwithpartialname('System.Windows.Forms'); [Windows.Forms.MessageBox]::Show('${escaped}', 'DSH 远程任务通知')"`
                      exec(psCmd)
                    }
                  }).catch(() => {})
                } catch (e) {
                  // 捕获异常
                }
              })()
            } else {
              replyError(`不支持的操作 action: ${action}`)
            }
          }
        } catch { }
      }

      ws.onclose = () => {
        this.connected = false
        if (this.running) {
          this.reconnectTimer = setTimeout(() => this.connect(), 4000)
        }
      }

      ws.onerror = () => {
        try { ws.close() } catch { }
      }
    } catch {
      if (this.running) {
        this.reconnectTimer = setTimeout(() => this.connect(), 5000)
      }
    }
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

  // 1. 注册 Agent 跨设备工具
  const tools = ctx.get?.('tools')
  if (tools && typeof tools.register === 'function') {
    const target = (ref) => {
      if (!hub.connected) throw new Error('网关长连接未就绪，请在设置中配置并连接网关')
      const d = hub.find(ref ?? '')
      if (!d) {
        const others = hub.devices.filter((x) => x.id !== hub.deviceId && x.kind !== 'web')
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
      description: '获取当前在 nanoMuse 网关上连接的所有远程设备（手机、远程服务器、其他 PC 等）的列表与在线状态。',
      parameters: {},
      output: defaultOutput,
      isConcurrencySafe: () => true,
      execute: async () => {
        const list = hub.devices.filter((d) => d.id !== hub.deviceId && d.kind !== 'web')
        return {
          connected: hub.connected,
          this_device: hub.deviceId,
          devices: list.map((d) => ({ id: d.id, name: d.name, kind: d.kind, os: d.os, online: d.online, actions: d.actions })),
        }
      },
      presentCall: () => ({ card: 'generic', title: '查询在线设备列表', kind: 'other', rawInput: {} }),
    })

    tools.register({
      name: 'device_shell',
      description: '在指定的远程设备（如远程服务器、另一台电脑或手机）上执行 shell 命令行指令并返回结果。',
      parameters: {
        device: { type: 'string', description: '目标设备名称、ID，或填 "phone" 代表手机。留空使用唯一绑定的其他设备。' },
        command: { type: 'string', required: true, description: '要执行的 shell 命令' },
        cwd: { type: 'string', description: '远程工作目录路径' },
        timeout: { type: 'integer', description: '超时秒数，默认 60' },
      },
      output: defaultOutput,
      timeoutMs: 120_000,
      execute: async (args) => {
        const d = target(args.device)
        const timeout = Math.min(Math.max(args.timeout ?? 60, 1), 180)
        const res = await hub.call(d.id, 'shell', { command: args.command, cwd: args.cwd, timeout }, (timeout + 15) * 1000)
        return { device: d.name, exit_code: res.exit_code ?? 0, stdout: String(res.stdout ?? ''), stderr: String(res.stderr ?? '') }
      },
      presentCall: (args) => ({ card: 'generic', title: `在 ${args.device || '远程设备'} 执行: ${args.command}`, kind: 'other', rawInput: args }),
    })

    tools.register({
      name: 'device_notify',
      description: '向指定的远程设备（如手机或电脑桌面）推送一条系统弹窗提醒通知。',
      parameters: {
        device: { type: 'string', description: '目标设备名称或 ID，留空使用唯一绑定的其他设备。' },
        title: { type: 'string', required: true, description: '通知标题' },
        body: { type: 'string', required: true, description: '通知正文' },
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
      parameters: { device: { type: 'string', description: '目标设备名称或 ID。' } },
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
      name: 'device_task',
      description: '委托另一台远程设备（如另外一台电脑或手机）上的 Agent 执行复杂的长期任务或新建对话。',
      parameters: {
        device: { type: 'string', description: '目标设备名称、ID，或填 "phone"。留空使用唯一绑定的其他设备。' },
        prompt: { type: 'string', required: true, description: '要委托给对端设备执行的具体任务需求或提示词' },
      },
      output: defaultOutput,
      timeoutMs: 60_000,
      execute: async (args) => {
        const d = target(args.device)
        const res = await hub.call(d.id, 'task', { text: args.prompt }, 45_000)
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
              const others = hub.devices.filter((d) => d.id !== hub.deviceId && d.kind !== 'web')
              return sendJson(200, {
                connected: hub.connected,
                this_device: { id: hub.deviceId, name: hub.deviceName, kind: 'computer', os: process.platform, online: hub.connected },
                devices: others,
              })
            }

            if (req.method === 'POST' && route === '/device/call') {
              const body = await readJson()
              const { to, action, args, timeoutMs } = body
              if (!to || !action) return sendJson(400, { error: 'to 和 action 必填' })
              try {
                const result = await hub.call(to, action, args || {}, timeoutMs || 15000)
                return sendJson(200, { ok: true, result })
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
