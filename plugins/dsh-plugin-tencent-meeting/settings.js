window.__ModuleLoader__.load({
  id: 'dsh-plugin-tencent-meeting',
  factory: require => {
    const React = require('react');
    const { createElement: h, useState, useEffect, useRef } = React;
    const NS = 'plugins.tencentMeetingCredentials';
    const dictionaries = {
      zh: { title: '腾讯会议凭据', ref: '凭据引用名称（必须与插件 tokenRef 一致）', secret: '新的 Token', save: '保存', remove: '删除已保存凭据', refresh: '刷新状态', configured: '已配置', missing: '未配置', unknown: '状态未知', readonly: '启动环境变量提供，只读；移除环境变量并重启后才能修改。', failed: '操作失败。请检查凭据服务是否启用；环境变量来源不可修改。', saved: '已保存到 DSH 本地凭据存储。', removed: '已删除本地凭据。', confirm: '确认删除该引用的本地凭据？这可能影响使用同一引用的其他插件。', note: '密钥不会返回给 AI，不使用浏览器存储。DSH 默认保存到本地凭据文件，不代表加密保险库。', invalid: '请填写有效的引用名称和非空密钥。', busy: '处理中…' },
      en: { title: 'Tencent Meeting credentials', ref: 'Credential reference (must match plugin tokenRef)', secret: 'New Token', save: 'Save', remove: 'Delete stored credential', refresh: 'Refresh status', configured: 'Configured', missing: 'Not configured', unknown: 'Unknown status', readonly: 'Provided by launch environment, read-only. Unset the variable and restart before editing.', failed: 'Operation failed. Check the credential service; environment-supplied values cannot be changed.', saved: 'Saved to DSH local credential storage.', removed: 'Local credential deleted.', confirm: 'Delete this local credential? Other plugins using the same reference may be affected.', note: 'No secret is returned to AI or placed in browser storage. The default local credential file is not an encrypted vault.', invalid: 'Enter a valid reference and a non-empty secret.', busy: 'Working…' },
    };
    function Panel({ ctx, t }) {
      const [ref, setRef] = useState('DSH_TENCENT_MEETING_TOKEN');
      const [info, setInfo] = useState(null);
      const [busy, setBusy] = useState(false);
      const [message, setMessage] = useState('');
      const input = useRef(null); const generation = useRef(0); const mounted = useRef(true);
      const validRef = /^[A-Z_][A-Z0-9_]*$/.test(ref);
      async function refresh() {
        const version = ++generation.current;
        try {
          // 一元 Remote 调用永不 reject：失败在 result.ok 上，结果在 result.value 里。
          const result = await ctx.remote.credentials.describe([ref]);
          if (!result.ok) throw result.error;
          if (!mounted.current || version !== generation.current) return;
          const entry = result.value?.[ref];
          setInfo(entry ?? null);
          if (!entry) setMessage(`${t('failed')} [describe 未返回 ${ref} 的条目]`);
        } catch (error) {
          if (!mounted.current || version !== generation.current) return;
          setInfo(null);
          setMessage(`${t('failed')} [${error?.code ?? error?.message ?? String(error)}]`);
        }
      }
      useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; if (input.current) input.current.value = ''; }; }, []);
      useEffect(() => {
        generation.current++; setInfo(null); setMessage(''); if (input.current) input.current.value = '';
        if (!validRef) return;
        void refresh();
        return ctx.remote.$on('credentials/reference-updated', changed => { if (changed === ref) void refresh(); });
      }, [ref]);
      async function write(remove) {
        if (!validRef || (!remove && !input.current?.value.trim())) { setMessage(t('invalid')); return; }
        if (remove && !window.confirm(t('confirm'))) return;
        setBusy(true); setMessage('');
        try {
          const result = remove
            ? await ctx.remote.credentials.unset(ref)
            : await ctx.remote.credentials.set(ref, input.current.value);
          if (!result.ok) throw result.error;
          if (mounted.current) { if (input.current) input.current.value = ''; setMessage(t(remove ? 'removed' : 'saved')); await refresh(); }
        } catch (error) { if (mounted.current) { if (input.current) input.current.value = ''; setMessage(`${t('failed')} [${error?.code ?? error?.message ?? String(error)}]`); } }
        finally { if (mounted.current) setBusy(false); }
      }
      // 状态没取回来（info === null）时不再锁死输入框：否则 describe 一次失败就永远配不上。
      // 只有明确只读（writable === false，即启动环境变量提供）才锁。
      const locked = busy || !validRef || info?.writable === false;
      return h('section', { style: { maxWidth: 640, display: 'grid', gap: 12, color: 'inherit' } },
        h('h3', null, t('title')),
        h('label', null, t('ref'), h('input', { type: 'text', value: ref, disabled: busy, onChange: e => setRef(e.target.value), style: { display: 'block', width: '100%' } })),
        h('p', { role: 'status' }, t(!info ? 'unknown' : info.configured ? 'configured' : 'missing')),
        info?.writable === false ? h('p', null, t('readonly')) : null,
        h('label', null, t('secret'), h('input', { ref: input, type: 'password', autoComplete: 'new-password', disabled: locked, style: { display: 'block', width: '100%' } })),
        h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
          h('button', { type: 'button', disabled: locked, onClick: () => void write(false) }, t('save')),
          h('button', { type: 'button', disabled: locked || !info?.configured, onClick: () => void write(true) }, t('remove')),
          h('button', { type: 'button', disabled: busy || !validRef, onClick: () => void refresh() }, t('refresh'))),
        h('p', { role: 'status', 'aria-live': 'polite' }, busy ? t('busy') : message),
        h('small', null, t('note')));
    }
    return {
      inject: ['slots', 'locale', 'remote', 'remote.credentials'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, dictionaries));
        const t = ctx.locale.bind(NS);
        ctx.effect(() => ctx.slots.inject('plugins.item', () => ctx.slots.register({ name: 'plugins.item', id: 'tencent-meeting-credentials', order: 60, label: () => t('title'), locale: NS, inject: () => ({ ctx, t }) }, Panel)));
      },
    };
  },
});

