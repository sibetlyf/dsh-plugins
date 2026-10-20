import z from '@deepseek-ai/schemastery';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { rpc, discover, READ_ACTIONS, CONTACT_ACTIONS, validateArguments } from './client.js';

export const name = 'tencent-meeting';
export const inject = ['tools', 'credentials', 'approval', 'skills'];
export const Config = z.object({
  tokenRef: z.string().role('credential-ref').default('DSH_TENCENT_MEETING_TOKEN'),
  timeoutMs: z.number().default(60000),
});
const output = { schema: {}, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] };
const object = { type: 'object', additionalProperties: true };

export async function apply(ctx, config = {}) {
  const tokenRef = config.tokenRef ?? 'DSH_TENCENT_MEETING_TOKEN';
  const timeoutMs = config.timeoutMs ?? 60000;
  if (!/^[A-Z_][A-Z0-9_]*$/.test(tokenRef)) throw new Error('tokenRef must be a credential reference name, never a token value');
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) throw new Error('timeoutMs must be between 1000 and 120000');
  const options = async signal => ({ token: (await ctx.credentials.resolve(tokenRef))?.value, signal, timeoutMs });
  const guide = await readFile(new URL('./guide.md', import.meta.url), 'utf8');
  ctx.effect(() => ctx.skills.register({ name: 'tencent-meeting', description: '腾讯会议原生插件：管理会议、录制、转写及纪要。使用前加载，包含敏感操作与通讯录限制。', content: guide, source: 'runtime', resourceBase: { kind: 'directory', path: fileURLToPath(new URL('.', import.meta.url)) } }));
  ctx.effect(() => ctx.tools.register({
    name: 'tencent_meeting_discover',
    description: '查询腾讯会议插件凭据配置状态或发现官方工具参数。不会返回 Token。调用会议工具前先发现准确 action 和参数。',
    parameters: { type: 'object', properties: { action: { type: 'string', description: '准确的官方工具名；省略返回紧凑索引。' }, statusOnly: { type: 'boolean', description: '为 true 时仅检查本地凭据配置，不连接腾讯会议。' } }, additionalProperties: false },
    output,
    async execute(args, exec) {
      if (args.statusOnly) return { credentialRef: tokenRef, ...(await ctx.credentials.describe(tokenRef)), endpoint: 'mcp.meeting.tencent.com', importsExistingSkillToken: false };
      const tools = await discover(await options(exec.signal));
      if (args.action) {
        const tool = tools.find(item => item.name === args.action);
        if (!tool) throw new Error('Unknown Tencent Meeting action');
        return tool;
      }
      return { tools: tools.map(tool => ({ name: tool.name, description: (tool.description ?? '').slice(0, 180), approvalRequired: !READ_ACTIONS.has(tool.name) })) };
    },
  }));
  ctx.effect(() => ctx.tools.register({
    name: 'tencent_meeting_call',
    description: '执行已发现的腾讯会议官方工具。先加载 tencent-meeting skill 并查准确参数。写入、通讯录和未知操作必须通过 DSH 审批；never 策略会拒绝。无自动反馈、重试或更新。',
    parameters: { type: 'object', properties: { action: { type: 'string' }, arguments: object, meetingIntent: { type: 'string', enum: ['invite', 'call'], description: '仅用于通讯录解析：本轮用户明确要求邀请或呼叫，解析后立即用于该会议动作。' }, confirmationSummary: { type: 'string', description: '写操作的已展示变更摘要，只含昵称和操作影响，不含电话、邮箱、内部 ID、Token；踢人注明 allow_rejoin，权限申请注明预览信息。' } }, required: ['action', 'arguments'], additionalProperties: false },
    output,
    async execute(args, exec) {
      validateArguments(args.action, args.arguments);
      if (CONTACT_ACTIONS.has(args.action) && !['invite', 'call'].includes(args.meetingIntent)) throw new Error('Contact lookup is only allowed for explicit invitation or call intent');
      if (!READ_ACTIONS.has(args.action)) {
        if (!exec.agent || !args.confirmationSummary?.trim()) throw new Error('Sensitive action requires an Agent and a privacy-safe confirmation summary');
        const outcome = await ctx.approval.request({ agent: exec.agent, toolName: 'tencent_meeting_call', callId: exec.callId, signal: exec.signal, reason: `腾讯会议 ${args.action}: ${args.confirmationSummary}` });
        if (outcome !== 'allowed-once') throw new Error('Tencent Meeting action not approved; no request was sent');
      }
      const requestOptions = await options(exec.signal);
      const tools = await discover(requestOptions);
      if (!tools.some(tool => tool.name === args.action)) throw new Error('Action not advertised by Tencent Meeting');
      return rpc({ ...requestOptions, method: 'tools/call', params: { name: args.action, arguments: { ...args.arguments, _client_info: { os: process.platform, agent: 'deepseek-harness', model: 'unspecified' } } } });
    },
  }));
}
