import z from '@deepseek-ai/schemastery';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ACTIONS, SENSITIVE, validate, MeituanBrowser } from './browser.js';
export const name = 'meituan';
export const inject = ['tools', 'approval', 'skills'];
export const Config = z.object({ channel: z.union(['chromium', 'chrome', 'msedge']).default('msedge'), headless: z.boolean().default(false), longitude: z.number(), latitude: z.number() });
const output = { schema: {}, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] };
export async function apply(ctx, config = {}) {
  const browser = new MeituanBrowser(config);
  ctx.on('dispose', () => browser.close());
  const content = await readFile(new URL('./guide.md', import.meta.url), 'utf8');
  ctx.effect(() => ctx.skills.register({ name: 'meituan', description: '美团外卖浏览器插件：搜索、浏览菜单、进店及审批后加购。不支付、不下单。使用前加载。', content, source: 'runtime', resourceBase: { kind: 'directory', path: fileURLToPath(new URL('.', import.meta.url)) } }));
  ctx.effect(() => ctx.tools.register({
    name: 'meituan_discover', description: '返回美团本地工具的参数和审批要求，不启动浏览器。',
    parameters: { type: 'object', properties: { action: { type: 'string' } }, additionalProperties: false }, output,
    async execute(args) {
      const tools = Object.entries(ACTIONS).map(([name, spec]) => ({ name, description: spec.description, inputSchema: { type: 'object', properties: spec.properties, required: spec.required ?? [], additionalProperties: false }, approvalRequired: SENSITIVE.has(name) }));
      if (args.action) { const tool = tools.find(item => item.name === args.action); if (!tool) throw new Error('Unknown Meituan action'); return tool; }
      return { tools, ordersSupported: false, savesCookies: false, geolocationConfigured: config.longitude !== undefined };
    },
  }));
  ctx.effect(() => ctx.tools.register({
    name: 'meituan_call', description: '调用美团浏览器动作。进店/点击及加购需要 DSH 审批；never 拒绝。禁止支付、结算、提交订单和任意脚本。',
    parameters: { type: 'object', properties: { action: { type: 'string' }, arguments: { type: 'object', additionalProperties: true }, confirmationSummary: { type: 'string', description: '已展示的商家、菜品、规格、数量及金额；不得包含 Cookie、手机号或住址。' } }, required: ['action', 'arguments'], additionalProperties: false }, output,
    async execute(args, exec) {
      validate(args.action, args.arguments);
      if (SENSITIVE.has(args.action)) {
        if (!exec.agent || !args.confirmationSummary?.trim()) throw new Error('Sensitive action requires Agent and confirmation summary');
        const outcome = await ctx.approval.request({ agent: exec.agent, toolName: 'meituan_call', callId: exec.callId, signal: exec.signal, reason: `美团 ${args.action}: ${args.confirmationSummary}` });
        if (outcome !== 'allowed-once') throw new Error('Meituan action not approved; browser was not accessed');
      }
      try { return await browser.run(args.action, args.arguments, exec.signal); }
      catch { throw new Error('Meituan action failed or cancelled; inspect page manually. No automatic retry. Browser diagnostics suppressed to protect session data.'); }
    },
  }));
}
