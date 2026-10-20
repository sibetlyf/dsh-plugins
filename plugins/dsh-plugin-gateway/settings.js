/**
 * dsh-plugin-gateway · Client half
 *
 * 除了原有的网关设置面板，本文件把「@设备」接入了 DSH Web 的对话输入框：
 *  - 注册 `@` 触发源（inputTriggers），输入 @ 即弹出在线设备候选菜单；
 *  - 通过 lexicon 让输入框里的 `@handle` 直接被高亮；
 *  - 注册 UserText 规则与节点渲染器，让已发送消息中的 `@handle` 显示为设备高亮胶囊；
 *  - 在输入框下方挂一条 Dock，实时显示投递状态。
 * Host 半负责在用户消息里解析 @handle 并把内容真正投递给对应设备。
 */
window.__ModuleLoader__.load({
  id: 'dsh-plugin-gateway',
  factory: require => {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect } = React

    const API = '/nanomuse/gateway'
    const NS = 'gateway'
    /** 触发源名，同时也是 UserText 节点 id 与 slot key */
    const SOURCE = 'device'

    const zh = {
      'section.devices': '远程设备',
      'device.online': '在线',
      'device.offline': '离线',
      'device.sectionOnline': '在线设备',
      'device.sectionOffline': '离线设备',
      'dock.title': '远程设备',
      'dock.hint': '在输入框输入 @ 选择设备，消息会直接投递到该设备',
      'dock.sending': '投递中',
      'dock.done': '已送达',
      'dock.partial': '部分送达',
      'dock.error': '投递失败',
      'dock.count': '{n} 台在线',
    }
    const en = {
      'section.devices': 'Remote devices',
      'device.online': 'online',
      'device.offline': 'offline',
      'device.sectionOnline': 'Online',
      'device.sectionOffline': 'Offline',
      'dock.title': 'Remote devices',
      'dock.hint': 'Type @ in the composer to pick a device; the message is delivered to it',
      'dock.sending': 'sending',
      'dock.done': 'delivered',
      'dock.partial': 'partly delivered',
      'dock.error': 'failed',
      'dock.count': '{n} online',
    }

    /** 无浏览器控制台时，把关键注册结果与异常回传 Host，供 /client-log 检查。 */
    function report(event, detail) {
      try {
        const body = JSON.stringify({
          event,
          detail: detail === undefined || detail === null
            ? null
            : typeof detail === 'string' ? detail : JSON.stringify(detail),
        })
        void fetch(`${API}/client-log`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
        }).catch(() => {})
      } catch {}
    }

    // —— 设备缓存：@ 菜单、lexicon 高亮与消息胶囊都读这一份 ——
    const cache = { devices: [], connected: false, at: 0 }
    let inflight = null
    const lexiconListeners = new Set()

    function notifyLexicon() {
      for (const listener of [...lexiconListeners]) {
        try { listener() } catch {}
      }
    }

    function refreshDevices() {
      if (inflight) return inflight
      inflight = (async () => {
        try {
          const res = await fetch(`${API}/devices`, { headers: { accept: 'application/json' } })
          if (res.ok) {
            const data = await res.json()
            const next = Array.isArray(data.devices) ? data.devices : []
            const changed = next.length !== cache.devices.length
              || next.some((item, index) => item.handle !== cache.devices[index]?.handle
                || item.online !== cache.devices[index]?.online
                || item.name !== cache.devices[index]?.name)
            cache.devices = next
            cache.connected = Boolean(data.connected)
            cache.at = Date.now()
            if (changed) notifyLexicon()
          }
        } catch {}
        finally {
          inflight = null
        }
        return cache.devices
      })()
      return inflight
    }

    function findByHandle(handle) {
      const key = String(handle ?? '').toLowerCase()
      if (!key) return undefined
      return cache.devices.find(item => String(item.handle ?? '').toLowerCase() === key)
    }

    function handles() {
      return cache.devices.map(item => String(item.handle))
    }

    /** 等待某个 Client 服务可用（优先 ctx.inject，其次 ctx.get，最后轮询兜底）。 */
    function whenService(ctx, name, run) {
      const direct = typeof ctx.get === 'function' ? ctx.get(name) : undefined
      if (direct) return run(direct)
      if (typeof ctx.inject === 'function') {
        let inner = null
        let injected = null
        try {
          injected = ctx.inject([name], scope => {
            const service = typeof scope?.get === 'function' ? scope.get(name) : scope?.[name]
            if (service) inner = run(service)
          })
        } catch (error) {
          report('service:inject-failed', `${name}: ${String(error?.message || error)}`)
        }
        if (typeof injected === 'function') {
          return () => {
            try { if (typeof inner === 'function') inner() } catch {}
            try { injected() } catch {}
          }
        }
      }
      let stopped = false
      let cleanup = null
      const timer = setInterval(() => {
        if (stopped) return
        const service = typeof ctx.get === 'function' ? ctx.get(name) : undefined
        if (!service) return
        clearInterval(timer)
        cleanup = run(service)
      }, 400)
      return () => {
        stopped = true
        clearInterval(timer)
        try { if (typeof cleanup === 'function') cleanup() } catch {}
      }
    }

    const chipStyle = {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '0 7px',
      margin: '0 2px',
      borderRadius: 999,
      fontSize: '0.92em',
      lineHeight: 1.7,
      fontWeight: 500,
      verticalAlign: 'baseline',
      whiteSpace: 'nowrap',
      color: 'var(--dsw-alias-brand-primary)',
      background: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent)',
      border: '1px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 32%, transparent)',
    }

    /** @ 菜单与设置面板共用的设备图标。 */
    function DeviceGlyph({ size = 14 }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
        style: { display: 'block' },
      },
        h('rect', { x: 2.4, y: 1.6, width: 11.2, height: 8.6, rx: 1.6, stroke: 'currentColor', strokeWidth: 1.2 }),
        h('path', { d: 'M8 10.4v3M5.4 13.6h5.2', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' }),
      )
    }

    /** 已发送消息里的设备胶囊：高亮底色 + 在线状态点 + 设备名。 */
    function DeviceChip({ node, raw }) {
      const data = node?.data ?? {}
      const online = data.online !== false
      const label = data.name || data.handle || ''
      return h('span', {
        style: chipStyle,
        title: data.name && data.handle ? `@${data.handle} · ${data.name}` : (raw || label),
        'data-device-chip': data.handle || true,
      },
        h('span', {
          'aria-hidden': true,
          style: {
            width: 6, height: 6, borderRadius: 999, flex: 'none', display: 'inline-block',
            background: online
              ? 'var(--dsw-alias-state-success-primary)'
              : 'var(--dsw-alias-state-idle-primary, #9ca3af)',
          },
        }),
        h('span', { style: { whiteSpace: 'nowrap' } }, `@${label}`),
      )
    }

    /** 输入框下方的投递状态条：只在网关已连接或存在记录时显示。 */
    function MentionDock(props) {
      const sessionId = props?.sessionId
      const t = typeof props?.t === 'function' ? props.t : key => zh[key] ?? key
      const [state, setState] = useState({ connected: false, items: [] })

      useEffect(() => {
        let alive = true
        const load = async () => {
          try {
            const res = await fetch(`${API}/mentions?limit=20`, { headers: { accept: 'application/json' } })
            if (!res.ok) return
            const data = await res.json()
            if (!alive) return
            setState({
              connected: Boolean(data.connected),
              items: Array.isArray(data.items) ? data.items : [],
            })
          } catch {}
        }
        void load()
        const timer = setInterval(() => { void load() }, 4000)
        return () => {
          alive = false
          clearInterval(timer)
        }
      }, [])

      const items = state.items
        .filter(item => !sessionId || !item.sessionId || String(item.sessionId) === String(sessionId))
        .slice(0, 3)
      if (!state.connected && items.length === 0) return null

      const statusOf = item => {
        if (item.status === 'done') return { text: t('dock.done'), color: 'var(--dsw-alias-state-success-primary)' }
        if (item.status === 'partial') return { text: t('dock.partial'), color: 'var(--dsw-alias-state-warn-primary, #d97706)' }
        if (item.status === 'error') return { text: t('dock.error'), color: 'var(--dsw-alias-state-error-primary)' }
        return { text: t('dock.sending'), color: 'var(--dsw-alias-label-secondary)' }
      }

      const onlineCount = cache.devices.filter(item => item.online !== false).length

      return h('div', {
        style: {
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          padding: '2px 4px', fontSize: 11, color: 'var(--dsw-alias-label-secondary)',
        },
      },
        h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4, flex: 'none' } },
          h('span', { style: { display: 'inline-flex', color: 'var(--dsw-alias-brand-primary)' } }, h(DeviceGlyph, { size: 12 })),
          h('span', { style: { fontWeight: 500 } }, t('dock.title')),
          state.connected && onlineCount > 0
            ? h('span', { style: { opacity: 0.7 } }, t('dock.count', { n: onlineCount }))
            : null,
        ),
        items.length === 0
          ? h('span', { style: { opacity: 0.65 } }, t('dock.hint'))
          : h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0 } },
            items.map(item => {
              const status = statusOf(item)
              const targets = Array.isArray(item.targets) ? item.targets : []
              const label = targets.map(target => `@${target.handle}`).join(' ') || item.origin
              const tooltip = [item.text, ...(Array.isArray(item.results) ? item.results.map(r => r.error || r.reply).filter(Boolean) : [])]
                .filter(Boolean).join('\n\n')
              return h('span', {
                key: item.id,
                title: tooltip,
                style: { display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0, maxWidth: 280 },
              },
                h('span', { style: { fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, label),
                h('span', { style: { color: status.color, flex: 'none' } }, `· ${status.text}`),
              )
            }),
          ),
      )
    }

    // —— 网关设置面板（插件列表 / 设置中心） ——
    function GatewayPanel() {
      const [baseURL, setBaseURL] = useState('http://127.0.0.1:8790')
      const [identifier, setIdentifier] = useState('admin')
      const [password, setPassword] = useState('')
      const [syncPassword, setSyncPassword] = useState(false)
      const [newPassword, setNewPassword] = useState('')
      const [hasToken, setHasToken] = useState(false)
      const [busy, setBusy] = useState(false)
      const [testing, setTesting] = useState(false)
      const [status, setStatus] = useState(null)
      const [devicesData, setDevicesData] = useState(null)
      const [mentions, setMentions] = useState([])
      const [actionMsg, setActionMsg] = useState(null)
      const [probe, setProbe] = useState('')
      const [copied, setCopied] = useState('')

      const load = async () => {
        try {
          const res = await fetch(`${API}/config`)
          if (res.ok) {
            const data = await res.json()
            if (data.baseURL) setBaseURL(data.baseURL)
            if (data.identifier) setIdentifier(data.identifier)
            setHasToken(Boolean(data.lastToken))
          }
        } catch {}

        try {
          const res = await fetch(`${API}/devices`)
          if (res.ok) setDevicesData(await res.json())
        } catch {}

        try {
          const res = await fetch(`${API}/mentions?limit=10`)
          if (res.ok) {
            const data = await res.json()
            setMentions(Array.isArray(data.items) ? data.items : [])
          }
        } catch {}
      }

      useEffect(() => { void load() }, [])

      const testConnect = async () => {
        setTesting(true)
        setStatus(null)
        try {
          const res = await fetch(`${API}/test`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ baseURL: baseURL.trim() }),
          })
          const data = await res.json()
          if (data.ok) {
            setStatus({ type: 'success', text: `网关连通正常 (版本: ${data.info?.version || '未知'}, 在线设备: ${data.info?.devices ?? 0})` })
          } else {
            setStatus({ type: 'error', text: data.error || '网关连接失败' })
          }
        } catch (error) {
          setStatus({ type: 'error', text: error?.message || '无法连接网关' })
        } finally {
          setTesting(false)
        }
      }

      const saveConnect = async event => {
        if (event) event.preventDefault()
        setBusy(true)
        setStatus(null)
        try {
          const res = await fetch(`${API}/connect`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              baseURL: baseURL.trim(),
              identifier: identifier.trim(),
              password,
              new_password: syncPassword ? newPassword.trim() : undefined,
            }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || '连接失败')
          setPassword('')
          setNewPassword('')
          setSyncPassword(false)
          let tip = '网关连接成功！登录凭证已持久化，下次启动将自动连接。'
          if (data.password_updated) tip += ' 远端网关密码已同步加盐更新。'
          setHasToken(true)
          setStatus({ type: 'success', text: tip })
          setTimeout(() => { void load() }, 1000)
        } catch (error) {
          setStatus({ type: 'error', text: error?.message || '连接失败' })
        } finally {
          setBusy(false)
        }
      }

      const callDevice = async (to, action, args = {}) => {
        setActionMsg(null)
        try {
          const res = await fetch(`${API}/device/call`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ to, action, args }),
          })
          const data = await res.json()
          if (!res.ok || !data.ok) throw new Error(data.error || '调用失败')
          setActionMsg(`[${action}] ${data.device || to} 操作成功: ${JSON.stringify(data.result).slice(0, 240)}`)
        } catch (error) {
          setActionMsg(`[${action}] 失败: ${error?.message || '网络错误'}`)
        }
      }

      const sendMention = async () => {
        const text = probe.trim()
        if (!text) return
        setActionMsg(null)
        try {
          const res = await fetch(`${API}/mentions/send`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || '投递失败')
          setActionMsg(`已提交投递，正在后台送达…`)
          setTimeout(() => { void load() }, 1200)
        } catch (error) {
          setActionMsg(`投递失败: ${error?.message || '网络错误'}`)
        }
      }

      const copyMention = async handle => {
        try {
          await navigator.clipboard.writeText(`@${handle} `)
          setCopied(handle)
          setTimeout(() => setCopied(''), 1500)
        } catch {
          setActionMsg(`请手动复制：@${handle}`)
        }
      }

      const isConnected = Boolean(devicesData?.connected)
      const otherDevices = devicesData?.devices || []
      const statusText = isConnected ? '● 已连接' : (hasToken ? '◑ 已授权 (重连中)' : '○ 未连接')
      const statusColor = isConnected ? 'var(--dsw-alias-state-success-primary)' : (hasToken ? 'var(--dsw-alias-state-warn-primary)' : 'var(--dsw-alias-label-secondary)')

      const disconnect = async () => {
        if (!window.confirm('确认断开当前网关连接？登录凭证将被清除，下次需要重新登录。')) return
        try {
          await fetch(`${API}/connect`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ baseURL, identifier, password: '', __logout: true }),
          })
        } catch {}
        setHasToken(false)
        setDevicesData(null)
        setMentions([])
        setStatus({ type: 'success', text: '已断开连接，下次启动将重新认证' })
      }

      const cardStyle = {
        padding: '16px',
        borderRadius: '8px',
        background: 'var(--dsw-alias-bg-layer-2, rgba(0,0,0,0.03))',
        border: '1px solid var(--dsw-alias-border-l1, rgba(0,0,0,0.08))',
        display: 'grid',
        gap: '12px',
      }

      const inputStyle = {
        display: 'block',
        width: '100%',
        padding: '8px 10px',
        borderRadius: '6px',
        border: '1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.15))',
        background: 'var(--dsw-alias-bg-layer-1, rgba(255,255,255,0.8))',
        color: 'inherit',
        fontSize: '13px',
        boxSizing: 'border-box',
      }

      const btnPrimary = {
        padding: '8px 14px',
        borderRadius: '6px',
        border: 'none',
        background: 'var(--dsw-alias-brand-primary, #2563eb)',
        color: '#fff',
        fontWeight: '500',
        cursor: 'pointer',
        fontSize: '13px',
      }

      const btnOutline = {
        padding: '8px 12px',
        borderRadius: '6px',
        border: '1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.2))',
        background: 'transparent',
        color: 'inherit',
        cursor: 'pointer',
        fontSize: '13px',
      }

      const statusPill = (text, color) => h('span', {
        style: {
          fontSize: '11px',
          padding: '2px 7px',
          borderRadius: 999,
          color,
          background: 'color-mix(in srgb, currentColor 12%, transparent)',
          border: '1px solid color-mix(in srgb, currentColor 26%, transparent)',
        },
      }, text)

      return h('section', { style: { maxWidth: 680, display: 'grid', gap: 20, color: 'inherit' } },
        h('div', null,
          h('h3', { style: { margin: '0 0 6px 0', fontSize: '16px' } }, 'nanoMuse 网关与远程设备'),
          h('p', { style: { margin: 0, fontSize: '13px', opacity: 0.7 } },
            '连接自建或云端中转网关；在对话输入框输入 @ 可直接把消息投递到对应设备。'),
        ),

        h('div', { style: cardStyle },
          h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
            h('span', { style: { fontWeight: 600, fontSize: '14px' } }, '网关长连接配置'),
            h('span', { style: { fontSize: '12px', color: statusColor } }, statusText),
          ),

          h('label', { style: { fontSize: '12px', fontWeight: 500 } }, '网关地址 (Gateway URL)',
            h('div', { style: { display: 'flex', gap: 8, marginTop: 4 } },
              h('input', { type: 'text', value: baseURL, style: { ...inputStyle, flex: 1 }, onChange: event => setBaseURL(event.target.value) }),
              h('button', { type: 'button', style: btnOutline, disabled: testing, onClick: testConnect }, testing ? '测试中…' : '测试连接'),
            ),
          ),

          h('div', { style: { display: 'flex', gap: 10 } },
            h('label', { style: { flex: 1, fontSize: '12px', fontWeight: 500 } }, '账号 (Identifier)',
              h('input', { type: 'text', value: identifier, style: { ...inputStyle, marginTop: 4 }, onChange: event => setIdentifier(event.target.value) }),
            ),
            h('label', { style: { flex: 1, fontSize: '12px', fontWeight: 500 } }, '连接密码 (Password)',
              h('input', {
                type: 'password',
                value: password,
                style: { ...inputStyle, marginTop: 4 },
                placeholder: hasToken ? '留空表示使用上次已保存密码' : '默认: admin123',
                onChange: event => setPassword(event.target.value),
              }),
            ),
          ),

          h('label', { style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: '12px', cursor: 'pointer' } },
            h('input', { type: 'checkbox', checked: syncPassword, onChange: event => setSyncPassword(event.target.checked) }),
            '在网关侧同步修改此账号密码',
          ),

          syncPassword ? h('input', {
            type: 'password',
            value: newPassword,
            style: inputStyle,
            placeholder: '输入要在远端网关数据库更新的新密码',
            onChange: event => setNewPassword(event.target.value),
          }) : null,

          status ? h('div', {
            style: {
              padding: '8px 10px',
              borderRadius: '6px',
              fontSize: '12px',
              background: status.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
              color: status.type === 'success' ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-state-error-primary)',
            },
          }, status.text) : null,

          h('div', { style: { display: 'flex', gap: 8, marginTop: 4 } },
            h('button', { type: 'button', style: btnPrimary, disabled: busy, onClick: saveConnect }, busy ? '保存连接中…' : (hasToken ? '重新连接 / 更新配置' : '登录并连接网关')),
            h('button', { type: 'button', style: btnOutline, onClick: () => { void load() } }, '刷新状态'),
            hasToken ? h('button', {
              type: 'button',
              style: { ...btnOutline, color: 'var(--dsw-alias-state-error-primary)', borderColor: 'var(--dsw-alias-state-error-primary)' },
              onClick: disconnect,
            }, '断开连接') : null,
          ),
        ),

        h('div', { style: cardStyle },
          h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 } },
            h('span', { style: { fontWeight: 600, fontSize: '14px' } }, '账号设备拓扑 (同一账号在线设备)'),
            h('div', { style: { fontSize: '12px', display: 'flex', gap: 8, alignItems: 'center' } },
              statusPill(
                `本机: ${devicesData?.this_device?.name || '电脑'}`,
                isConnected ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-label-secondary)',
              ),
              h('span', { style: { opacity: 0.7 } }, `| 其他在线: ${otherDevices.filter(item => item.online).length} 台`),
            ),
          ),
          h('div', { style: { fontSize: '11px', opacity: 0.55, marginTop: -6, display: 'flex', gap: 10, flexWrap: 'wrap' } },
            h('span', null, `本机设备 ID: ${devicesData?.this_device?.id || '—'}`),
            h('span', null, '输入框键入 @ 即可按 handle 提及设备'),
          ),

          otherDevices.length === 0
            ? h('div', { style: { padding: '16px', textAlign: 'center', opacity: 0.6, fontSize: '13px' } },
              isConnected
                ? '当前账号暂无其他远程设备在线（若有第二台设备，请确认两台设备的网关地址与账号完全一致，且设备 ID 不冲突）。'
                : '网关未连接，请先在上方配置并保存连接。')
            : h('div', { style: { display: 'grid', gap: 10 } },
              otherDevices.map(device => h('div', {
                key: device.id,
                style: {
                  padding: '12px',
                  borderRadius: '6px',
                  border: '1px solid var(--dsw-alias-border-l1, rgba(0,0,0,0.06))',
                  background: 'var(--dsw-alias-bg-layer-1, rgba(0,0,0,0.02))',
                  display: 'grid',
                  gap: 8,
                },
              },
                h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' } },
                  h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                    h('span', { style: { color: device.online ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-label-secondary)' } }, device.online ? '●' : '○'),
                    h('strong', { style: { fontSize: '13px' } }, device.name),
                    h('span', { style: { fontSize: '11px', opacity: 0.6 } }, `(${device.kind} · ${device.os || '未知'})`),
                  ),
                  h('div', { style: { display: 'flex', gap: 6, alignItems: 'center' } },
                    h('button', {
                      type: 'button',
                      title: '复制 @提及',
                      style: {
                        ...btnOutline, padding: '3px 8px', fontSize: '11px', borderRadius: 999,
                        color: 'var(--dsw-alias-brand-primary)',
                        borderColor: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 40%, transparent)',
                        background: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent)',
                      },
                      onClick: () => { void copyMention(device.handle) },
                    }, copied === device.handle ? '已复制' : `@${device.handle}`),
                    h('span', { style: { fontSize: '11px', color: device.online ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-label-secondary)' } },
                      device.online ? '在线' : '离线'),
                  ),
                ),

                device.actions && device.actions.length > 0
                  ? h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
                    device.actions.map(action => h('span', {
                      key: action,
                      style: {
                        fontSize: '10px', padding: '2px 6px', borderRadius: '4px',
                        background: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent)',
                        color: 'var(--dsw-alias-brand-primary)',
                      },
                    }, action)))
                  : null,

                device.online ? h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
                  h('button', { type: 'button', style: { ...btnOutline, padding: '4px 8px', fontSize: '11px' }, onClick: () => { void callDevice(device.id, 'ping') } }, 'Ping 探测'),
                  (device.actions || []).includes('notify')
                    ? h('button', { type: 'button', style: { ...btnOutline, padding: '4px 8px', fontSize: '11px' }, onClick: () => { void callDevice(device.id, 'notify', { title: 'DSH 通知测试', body: '跨设备连接正常！' }) } }, '发送测试提醒')
                    : null,
                  (device.actions || []).includes('screen')
                    ? h('button', { type: 'button', style: { ...btnOutline, padding: '4px 8px', fontSize: '11px' }, onClick: () => { void callDevice(device.id, 'screen') } }, '截取屏幕')
                    : null,
                  h('button', {
                    type: 'button',
                    style: { ...btnOutline, padding: '4px 8px', fontSize: '11px' },
                    onClick: () => { void callDevice(device.id, 'task', { text: `来自 DSH 的连接自检，请回复当前设备名。` }) },
                  }, '委托任务'),
                ) : null,
              )),
            ),

          actionMsg ? h('div', {
            style: {
              fontSize: '12px', padding: '6px 10px', borderRadius: '4px',
              background: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent)',
              color: 'var(--dsw-alias-brand-primary)',
            },
          }, actionMsg) : null,
        ),

        // @ 提及投递记录与自检
        h('div', { style: cardStyle },
          h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
            h('span', { style: { fontWeight: 600, fontSize: '14px' } }, '@ 提及投递记录'),
            h('span', { style: { fontSize: '11px', opacity: 0.6 } }, '在对话输入框输入 @ 选择设备即可自动投递'),
          ),

          h('div', { style: { display: 'flex', gap: 8 } },
            h('input', {
              type: 'text',
              value: probe,
              style: { ...inputStyle, flex: 1 },
              placeholder: otherDevices.length ? `例如：@${otherDevices[0].handle} 你好，收到请回复` : '暂无可用设备',
              onChange: event => setProbe(event.target.value),
              onKeyDown: event => { if (event.key === 'Enter') { event.preventDefault(); void sendMention() } },
            }),
            h('button', { type: 'button', style: btnOutline, disabled: !probe.trim(), onClick: () => { void sendMention() } }, '投递测试'),
          ),

          mentions.length === 0
            ? h('div', { style: { fontSize: '12px', opacity: 0.6 } }, '暂无投递记录。')
            : h('div', { style: { display: 'grid', gap: 6 } },
              mentions.map(item => h('div', {
                key: item.id,
                style: {
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                  fontSize: '12px', padding: '6px 8px', borderRadius: 6,
                  background: 'var(--dsw-alias-bg-layer-1, rgba(0,0,0,0.02))',
                  border: '1px solid var(--dsw-alias-border-l1, rgba(0,0,0,0.06))',
                },
              },
                h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 } },
                  h('span', { style: { fontWeight: 500 } },
                    `${(item.targets || []).map(target => `@${target.handle}`).join(' ')} · ${new Date(item.time).toLocaleTimeString()}`),
                  h('span', { style: { opacity: 0.65, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, item.text || ''),
                ),
                statusPill(
                  item.status === 'done' ? '已送达'
                    : item.status === 'partial' ? '部分送达'
                      : item.status === 'error' ? '失败' : '投递中',
                  item.status === 'done' ? 'var(--dsw-alias-state-success-primary)'
                    : item.status === 'error' ? 'var(--dsw-alias-state-error-primary)'
                      : item.status === 'partial' ? 'var(--dsw-alias-state-warn-primary)' : 'var(--dsw-alias-label-secondary)',
                ),
              )),
            ),
        ),
      )
    }

    /** `@` 触发源：候选来自网关注册表，选中后把 `@handle` 作为文本写入草稿。 */
    function createDeviceSource(t) {
      return {
        trigger: '@',
        name: SOURCE,
        order: 1,
        showGroupTitle: false,
        warm() {
          void refreshDevices()
        },
        async candidates(session, { query, signal }) {
          if (cache.devices.length === 0) await refreshDevices()
          if (signal?.aborted) return []
          const needle = String(query ?? '').trim().toLowerCase()
          const rows = cache.devices.filter(item => {
            if (!needle) return true
            return String(item.name ?? '').toLowerCase().includes(needle)
              || String(item.handle ?? '').toLowerCase().includes(needle)
          })
          return rows
            .slice()
            .sort((a, b) => Number(b.online !== false) - Number(a.online !== false))
            .map(item => ({
              name: item.name,
              label: item.name,
              description: `@${item.handle} · ${item.online !== false ? t('device.online') : t('device.offline')}`,
              icon: DeviceGlyph,
              section: item.online !== false ? t('device.sectionOnline') : t('device.sectionOffline'),
              value: String(item.handle),
            }))
        },
        lexicon() {
          return handles()
        },
        subscribeLexicon(_session, listener) {
          lexiconListeners.add(listener)
          return () => { lexiconListeners.delete(listener) }
        },
        onPick({ candidate }) {
          const device = findByHandle(candidate?.value)
          const handle = device ? device.handle : String(candidate?.value ?? '')
          if (!handle) return undefined
          report('mention:pick', { handle })
          return { text: `@${handle} ` }
        },
        openReference() {
          return false
        },
      }
    }

    /** 已发送文本里的 `@handle` → 设备节点。 */
    const deviceRule = {
      id: SOURCE,
      order: 10,
      match(text, from, context) {
        let names = null
        try {
          const fromFacts = typeof context?.read === 'function' ? context.read('deviceHandles') : undefined
          if (Array.isArray(fromFacts) && fromFacts.length > 0) names = fromFacts
        } catch {}
        if (!names) names = handles()
        if (!names || names.length === 0) return undefined
        const lowered = names.map(name => String(name).toLowerCase())
        const tokens = /(?<![\p{L}\p{N}_@])@([\p{L}\p{N}_-]+)/gu
        tokens.lastIndex = from
        for (let match = tokens.exec(text); match !== null; match = tokens.exec(text)) {
          const handle = match[1]
          if (!lowered.includes(handle.toLowerCase())) continue
          const device = findByHandle(handle)
          return {
            id: SOURCE,
            start: match.index,
            end: match.index + match[0].length,
            data: {
              handle,
              name: device?.name ?? handle,
              online: device ? device.online !== false : true,
              kind: device?.kind,
            },
          }
        }
        return undefined
      },
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'gateway: dictionaries')
        const t = ctx.locale.bind(NS)

        // 设备缓存：立即拉一次，随后 15s 轮询保持与网关联动
        ctx.effect(() => {
          void refreshDevices()
          const timer = setInterval(() => { void refreshDevices() }, 15000)
          return () => clearInterval(timer)
        }, 'gateway: device cache')

        // 1. @ 设备触发源
        ctx.effect(() => whenService(ctx, 'inputTriggers', inputTriggers => {
          let dispose = null
          try {
            dispose = inputTriggers.registerSource(createDeviceSource(t))
            report('source:registered', { name: SOURCE, devices: cache.devices.length })
          } catch (error) {
            report('source:failed', String(error?.message || error))
          }
          return () => {
            try { if (typeof dispose === 'function') dispose() } catch {}
          }
        }), 'gateway: @device source')

        // 2. 已发送消息里的设备高亮胶囊
        ctx.effect(() => whenService(ctx, 'uiConversation', uiConversation => {
          if (!uiConversation?.userText || typeof uiConversation.userText.register !== 'function') {
            report('usertext:unavailable', null)
            return
          }
          let dispose = null
          try {
            dispose = uiConversation.userText.register(deviceRule)
            report('usertext:registered', { id: SOURCE })
          } catch (error) {
            report('usertext:failed', String(error?.message || error))
          }
          return () => {
            try { if (typeof dispose === 'function') dispose() } catch {}
          }
        }), 'gateway: device user text rule')

        ctx.effect(() => ctx.slots.inject('conversation.user.text.node', () => {
          try {
            const dispose = ctx.slots.register({
              name: 'conversation.user.text.node',
              key: SOURCE,
              priority: 100,
              locale: NS,
            }, DeviceChip)
            report('chip:registered', { key: SOURCE })
            return dispose
          } catch (error) {
            report('chip:failed', String(error?.message || error))
            return undefined
          }
        }), 'gateway: device chip renderer')

        // 3. 输入框下方的投递状态条
        ctx.effect(() => {
          try {
            return ctx.slots.inject('conversation.composer.dock', () => {
              try {
                const dispose = ctx.slots.register({
                  name: 'conversation.composer.dock',
                  id: 'gateway-mentions',
                  order: 6,
                  locale: NS,
                }, MentionDock)
                report('dock:registered', null)
                return dispose
              } catch (error) {
                report('dock:failed', String(error?.message || error))
                return undefined
              }
            })
          } catch (error) {
            report('dock:inject-failed', String(error?.message || error))
            return undefined
          }
        }, 'gateway: mention dock')

        // 4. 设置中心 / 插件列表面板
        ctx.effect(() => ctx.slots.inject('plugins.item', () =>
          ctx.slots.register({
            name: 'plugins.item',
            id: 'dsh-plugin-gateway-panel',
            order: 50,
            label: () => 'nanoMuse 网关与设备',
            inject: () => ({ ctx }),
          }, GatewayPanel),
        ))

        ctx.effect(() => {
          try {
            return ctx.slots.inject('settings.section', () =>
              ctx.slots.register({
                name: 'settings.section',
                id: 'dsh-plugin-gateway-settings',
                order: 34,
                label: () => 'nanoMuse 网关与设备',
                inject: () => ({ ctx }),
              }, GatewayPanel),
            )
          } catch {
            return undefined
          }
        })

        report('applied', {
          connected: cache.connected,
          devices: cache.devices.length,
          slots: Boolean(ctx.slots),
        })
      },
    }
  },
})
