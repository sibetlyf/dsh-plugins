window.__ModuleLoader__.load({
  id: 'dsh-gateway',
  factory: require => {
    const React = require('react');
    const { createElement: h, useState, useEffect } = React;

    function GatewayPanel() {
      const [baseURL, setBaseURL] = useState('http://127.0.0.1:8790');
      const [identifier, setIdentifier] = useState('admin');
      const [password, setPassword] = useState('');
      const [syncPassword, setSyncPassword] = useState(false);
      const [newPassword, setNewPassword] = useState('');
      const [busy, setBusy] = useState(false);
      const [testing, setTesting] = useState(false);
      const [status, setStatus] = useState(null);
      const [devicesData, setDevicesData] = useState(null);
      const [actionMsg, setActionMsg] = useState(null);

      const load = async () => {
        try {
          const res = await fetch('/nanomuse/gateway/config');
          if (res.ok) {
            const data = await res.json();
            if (data.baseURL) setBaseURL(data.baseURL);
            if (data.identifier) setIdentifier(data.identifier);
          }
        } catch {}

        try {
          const res = await fetch('/nanomuse/gateway/devices');
          if (res.ok) {
            const data = await res.json();
            setDevicesData(data);
          }
        } catch {}
      };

      useEffect(() => { void load(); }, []);

      const testConnect = async () => {
        setTesting(true);
        setStatus(null);
        try {
          const res = await fetch('/nanomuse/gateway/test', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ baseURL: baseURL.trim() }),
          });
          const data = await res.json();
          if (data.ok) {
            setStatus({ type: 'success', text: `网关连通正常 (版本: ${data.info?.version || '未知'}, 在线设备: ${data.info?.devices ?? 0})` });
          } else {
            setStatus({ type: 'error', text: data.error || '网关连接失败' });
          }
        } catch (e) {
          setStatus({ type: 'error', text: e?.message || '无法连接网关' });
        } finally {
          setTesting(false);
        }
      };

      const saveConnect = async (e) => {
        if (e) e.preventDefault();
        setBusy(true);
        setStatus(null);
        try {
          const res = await fetch('/nanomuse/gateway/connect', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              baseURL: baseURL.trim(),
              identifier: identifier.trim(),
              password,
              new_password: syncPassword ? newPassword.trim() : undefined,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || '连接失败');
          setPassword('');
          setNewPassword('');
          setSyncPassword(false);
          let tip = '网关连接成功！';
          if (data.password_updated) tip += ' 远端网关密码已同步加盐更新。';
          setStatus({ type: 'success', text: tip });
          setTimeout(load, 1000);
        } catch (err) {
          setStatus({ type: 'error', text: err?.message || '连接失败' });
        } finally {
          setBusy(false);
        }
      };

      const callDevice = async (to, action, args = {}) => {
        setActionMsg(null);
        try {
          const res = await fetch('/nanomuse/gateway/device/call', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ to, action, args }),
          });
          const data = await res.json();
          if (!res.ok || !data.ok) throw new Error(data.error || '调用失败');
          setActionMsg(`[${action}] 操作成功: ${JSON.stringify(data.result)}`);
        } catch (err) {
          setActionMsg(`[${action}] 失败: ${err?.message || '网络错误'}`);
        }
      };

      const isConnected = !!devicesData?.connected;
      const otherDevices = devicesData?.devices || [];

      const cardStyle = {
        padding: '16px',
        borderRadius: '8px',
        background: 'var(--dsw-alias-layer-2, rgba(0,0,0,0.03))',
        border: '1px solid var(--dsw-alias-border-primary, rgba(0,0,0,0.08))',
        display: 'grid',
        gap: '12px',
      };

      const inputStyle = {
        display: 'block',
        width: '100%',
        padding: '8px 10px',
        borderRadius: '6px',
        border: '1px solid var(--dsw-alias-border-primary, rgba(0,0,0,0.15))',
        background: 'var(--dsw-alias-layer-1, rgba(255,255,255,0.8))',
        color: 'inherit',
        fontSize: '13px',
        boxSizing: 'border-box',
      };

      const btnPrimary = {
        padding: '8px 14px',
        borderRadius: '6px',
        border: 'none',
        background: '#2563eb',
        color: '#fff',
        fontWeight: '500',
        cursor: 'pointer',
        fontSize: '13px',
      };

      const btnOutline = {
        padding: '8px 12px',
        borderRadius: '6px',
        border: '1px solid var(--dsw-alias-border-primary, rgba(0,0,0,0.2))',
        background: 'transparent',
        color: 'inherit',
        cursor: 'pointer',
        fontSize: '13px',
      };

      return h('section', { style: { maxWidth: 640, display: 'grid', gap: 20, color: 'inherit' } },
        h('div', null,
          h('h3', { style: { margin: '0 0 6px 0', fontSize: '16px' } }, 'nanoMuse 网关与远程设备'),
          h('p', { style: { margin: 0, fontSize: '13px', opacity: 0.7 } }, '连接自建或云端中转网关，实现跨设备协同调度与长连接通信')
        ),

        // 网关配置卡片
        h('div', { style: cardStyle },
          h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
            h('span', { style: { fontWeight: 600, fontSize: '14px' } }, '网关长连接配置'),
            h('span', { style: { fontSize: '12px', color: isConnected ? '#16a34a' : '#888' } },
              isConnected ? '● 已连接' : '○ 未连接'
            )
          ),

          h('label', { style: { fontSize: '12px', fontWeight: 500 } }, '网关地址 (Gateway URL)',
            h('div', { style: { display: 'flex', gap: 8, marginTop: 4 } },
              h('input', { type: 'text', value: baseURL, style: { ...inputStyle, flex: 1 }, onChange: e => setBaseURL(e.target.value) }),
              h('button', { type: 'button', style: btnOutline, disabled: testing, onClick: testConnect }, testing ? '测试中…' : '测试连接')
            )
          ),

          h('div', { style: { display: 'flex', gap: 10 } },
            h('label', { style: { flex: 1, fontSize: '12px', fontWeight: 500 } }, '账号 (Identifier)',
              h('input', { type: 'text', value: identifier, style: { ...inputStyle, marginTop: 4 }, onChange: e => setIdentifier(e.target.value) })
            ),
            h('label', { style: { flex: 1, fontSize: '12px', fontWeight: 500 } }, '连接密码 (Password)',
              h('input', { type: 'password', value: password, style: { ...inputStyle, marginTop: 4 }, placeholder: '输入连接密码', onChange: e => setPassword(e.target.value) })
            )
          ),

          h('label', { style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: '12px', cursor: 'pointer' } },
            h('input', { type: 'checkbox', checked: syncPassword, onChange: e => setSyncPassword(e.target.checked) }),
            '在网关侧同步修改此账号密码'
          ),

          syncPassword ? h('input', {
            type: 'password',
            value: newPassword,
            style: inputStyle,
            placeholder: '输入要在远端网关数据库更新的新密码',
            onChange: e => setNewPassword(e.target.value),
          }) : null,

          status ? h('div', {
            style: {
              padding: '8px 10px',
              borderRadius: '6px',
              fontSize: '12px',
              background: status.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
              color: status.type === 'success' ? '#16a34a' : '#dc2626',
            }
          }, status.text) : null,

          h('div', { style: { display: 'flex', gap: 8, marginTop: 4 } },
            h('button', { type: 'button', style: btnPrimary, disabled: busy, onClick: saveConnect }, busy ? '保存连接中…' : '保存并连接网关'),
            h('button', { type: 'button', style: btnOutline, onClick: load }, '刷新状态')
          )
        ),

        // 远程设备列表卡片
        h('div', { style: cardStyle },
          h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 } },
            h('span', { style: { fontWeight: 600, fontSize: '14px' } }, '账号设备拓扑 (同一账号在线设备)'),
            h('div', { style: { fontSize: '12px', display: 'flex', gap: 8 } },
              h('span', { style: { color: isConnected ? '#16a34a' : '#888' } }, `本机: ${devicesData?.this_device?.name || '电脑'} (${isConnected ? '在线' : '离线'})`),
              h('span', { style: { opacity: 0.7 } }, `| 其他在线: ${otherDevices.filter(d => d.online).length} 台`)
            )
          ),
          devicesData?.this_device ? h('div', { style: { fontSize: '11px', opacity: 0.5, marginTop: -6 } },
            `本机设备ID: ${devicesData.this_device.id}`
          ) : null,

          otherDevices.length === 0 ? h('div', { style: { padding: '16px', textAlign: 'center', opacity: 0.6, fontSize: '13px' } },
            isConnected ? '当前账号暂无其他远程设备在线（若有第二台设备，请确认两台设备的网关地址与账号完全一致，且设备ID不冲突）。' : '网关未连接，请先在上方配置并保存连接。'
          ) : h('div', { style: { display: 'grid', gap: 10 } },
            otherDevices.map(d => h('div', {
              key: d.id,
              style: {
                padding: '12px',
                borderRadius: '6px',
                border: '1px solid var(--dsw-alias-border-primary, rgba(0,0,0,0.06))',
                background: 'var(--dsw-alias-layer-1, rgba(0,0,0,0.02))',
                display: 'grid',
                gap: 8,
              }
            },
              h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
                h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                  h('span', { style: { color: d.online ? '#16a34a' : '#888' } }, d.online ? '●' : '○'),
                  h('strong', { style: { fontSize: '13px' } }, d.name),
                  h('span', { style: { fontSize: '11px', opacity: 0.6 } }, `(${d.kind} · ${d.os || '未知'})`)
                ),
                h('span', { style: { fontSize: '11px', color: d.online ? '#16a34a' : '#888' } }, d.online ? '在线' : '离线')
              ),

              d.actions && d.actions.length > 0 ? h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
                d.actions.map(act => h('span', {
                  key: act,
                  style: { fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(37,99,235,0.08)', color: '#2563eb' }
                }, act))
              ) : null,

              d.online ? h('div', { style: { display: 'flex', gap: 6 } },
                h('button', { type: 'button', style: { ...btnOutline, padding: '4px 8px', fontSize: '11px' }, onClick: () => callDevice(d.id, 'ping') }, 'Ping 探测'),
                d.actions.includes('notify') ? h('button', { type: 'button', style: { ...btnOutline, padding: '4px 8px', fontSize: '11px' }, onClick: () => callDevice(d.id, 'notify', { title: 'DSH 通知测试', body: '跨设备连接正常！' }) }, '发送测试提醒') : null,
                d.actions.includes('screen') ? h('button', { type: 'button', style: { ...btnOutline, padding: '4px 8px', fontSize: '11px' }, onClick: () => callDevice(d.id, 'screen') }, '截取屏幕') : null
              ) : null
            ))
          ),

          actionMsg ? h('div', { style: { fontSize: '12px', padding: '6px 10px', borderRadius: '4px', background: 'rgba(37,99,235,0.08)', color: '#2563eb' } }, actionMsg) : null
        )
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        // 1. 注册到 plugins.item (插件管理面板)
        ctx.effect(() => ctx.slots.inject('plugins.item', () =>
          ctx.slots.register({
            name: 'plugins.item',
            id: 'dsh-gateway-panel',
            order: 50,
            label: () => 'nanoMuse 网关与设备',
            inject: () => ({ ctx }),
          }, GatewayPanel)
        ));

        // 2. 注册到 settings.section (设置面板)
        ctx.effect(() => ctx.slots.inject('settings.section', () =>
          ctx.slots.register({
            name: 'settings.section',
            id: 'dsh-gateway-settings',
            order: 34,
            label: () => 'nanoMuse 网关与设备',
            inject: () => ({ ctx }),
          }, GatewayPanel)
        ));
      },
    };
  },
});
