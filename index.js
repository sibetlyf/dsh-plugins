import z from '@deepseek-ai/schemastery';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { rpc, discover, READ_ACTIONS, ENDPOINTS, validateArguments } from './client.js';
export const name = 'didi';
export const inject = ['tools', 'credentials', 'approval', 'skills'];
export const Config = z.object({
  keyRef: z.string().role('credential-ref').default('DSH_DIDI_API_KEY'),
  environment: z.union(['sandbox', 'production']).default('sandbox'),
  timeoutMs: z.number().default(60000),
});
const output = { schema: {}, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] };
export async function apply(ctx, config = {}) {
  const keyRef = config.keyRef ?? 'DSH_DIDI_API_KEY';
  const environment = config.environment ?? 'sandbox';
  const timeoutMs = config.timeoutMs ?? 60000;
  if (!/^[A-Z_][A-Z0-9_]*$/.test(keyRef)) throw new Error('keyRef must be a credential reference, not an API key');
  if (!Object.hasOwn(ENDPOINTS, environment)) throw new Error('Invalid environment');
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) throw new Error('Invalid timeout');
  const options = async signal => ({ key: (await ctx.credentials.resolve(keyRef))?.value, environment, timeoutMs, signal });
  const content = await readFile(new URL('./guide.md', import.meta.url), 'utf8');
  ctx.effect(() => ctx.skills.register({ name: 'didi', description: '滴滴打车和地图：地点搜索、路线、价格预估、App 打车链接及订单管理。使用前加载；下单和取消必须审批。', content, source: 'runtime', resourceBase: { kind: 'directory', path: fileURLToPath(new URL('.', import.meta.url)) } }));
  ctx.effect(() => ctx.tools.register({
    name: 'didi_discover', description: '查看滴滴凭据状态或发现官方工具及准确参数；不返回 key。',
    parameters: { type: 'object', properties: { action: { type: 'string' }, statusOnly: { type: 'boolean' } }, additionalProperties: false }, output,
    async execute(args, exec) {
      if (args.statusOnly) return { credentialRef: keyRef, ...(await ctx.credentials.describe(keyRef)), environment, endpoint: ENDPOINTS[environment], realOrders: environment === 'production' };
      const tools = await discover(await options(exec.signal));
      if (args.action) { const tool = tools.find(item => item.name === args.action); if (!tool) throw new Error('Unknown DiDi action'); return { ...tool, approvalRequired: !READ_ACTIONS.has(tool.name), environment }; }
      return { environment, tools: tools.map(tool => ({ name: tool.name, description: (tool.description ?? '').slice(0, 240), approvalRequired: !READ_ACTIONS.has(tool.name) })) };
    },
  }));
  ctx.effect(() => ctx.tools.register({
    name: 'didi_call', description: '调用已发现的滴滴工具。订单创建、取消和未知操作必须审批，never 策略拒绝。禁止自动下单或重试。',
    parameters: { type: 'object', properties: { action: { type: 'string' }, arguments: { type: 'object', additionalProperties: true }, confirmationSummary: { type: 'string', description: '已经向用户展示的起终点、车型、预估价格和操作影响；取消注明可能的费用。不含手机号、key 或订单内部 ID。' } }, required: ['action', 'arguments'], additionalProperties: false }, output,
    async execute(args, exec) {
      if (typeof args.action !== 'string' || !args.action.trim() || !args.arguments || typeof args.arguments !== 'object' || Array.isArray(args.arguments)) throw new Error('Invalid action or arguments');
      if (!READ_ACTIONS.has(args.action)) {
        if (!exec.agent || !args.confirmationSummary?.trim()) throw new Error('Sensitive action requires Agent and user-visible confirmation summary');
        const decision = await ctx.approval.request({ agent: exec.agent, toolName: 'didi_call', callId: exec.callId, signal: exec.signal, reason: `滴滴 ${environment} ${args.action}: ${args.confirmationSummary}` });
        if (decision !== 'allowed-once') throw new Error('DiDi action not approved; no request was sent');
      }
      const opts = await options(exec.signal);
      const tools = await discover(opts); const tool = tools.find(item => item.name === args.action);
      if (!tool) throw new Error('Action not advertised by DiDi');
      validateArguments(tool, args.arguments);
      return rpc({ ...opts, method: 'tools/call', params: { name: args.action, arguments: args.arguments } });
    },
  }));
}
