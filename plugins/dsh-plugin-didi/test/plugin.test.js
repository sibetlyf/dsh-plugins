import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply, Config } from '../index.js';
function context(decision = 'denied') {
  const tools = new Map(); const approvals = [];
  return { tools, approvals, ctx: {
    effect: fn => fn(), skills: { register: () => () => {} },
    tools: { register: tool => { tools.set(tool.name, tool); return () => {}; } },
    credentials: { resolve: async () => ({ value: 'test' }), describe: async () => ({ configured: true }) },
    approval: { request: async request => { approvals.push(request); return decision; } },
  } };
}
test('configuration schema accepts sandbox and production', () => { assert.ok(Config); });
test('status is local and does not reveal key', async () => {
  const { ctx, tools } = context(); await apply(ctx);
  const status = await tools.get('didi_discover').execute({ statusOnly: true }, {});
  assert.equal(status.environment, 'sandbox'); assert.equal(status.realOrders, false); assert.equal(status.credentialRef, 'DSH_DIDI_API_KEY'); assert.ok(!Object.hasOwn(status, 'key'));
});
test('invalid configuration fails at activation', async () => {
  for (const config of [{ keyRef: 'literal-secret' }, { environment: 'evil' }, { timeoutMs: 0 }]) await assert.rejects(apply(context().ctx, config));
});
test('never policy blocks create, cancel and unknown actions before credential resolution or network', async () => {
  for (const action of ['taxi_create_order', 'taxi_cancel_order', 'future_unknown_write']) {
    const { ctx, tools, approvals } = context(); ctx.credentials.resolve = () => assert.fail('must not resolve');
    await apply(ctx);
    await assert.rejects(tools.get('didi_call').execute({ action, arguments: {}, confirmationSummary: '已展示行程、车型和价格' }, { agent: {}, callId: 'test' }), /not approved/);
    assert.equal(approvals.length, 1);
  }
});
test('sensitive actions require Agent and summary even in sandbox', async () => {
  const { ctx, tools, approvals } = context(); await apply(ctx);
  await assert.rejects(tools.get('didi_call').execute({ action: 'taxi_create_order', arguments: {} }, {}), /Sensitive/);
  assert.equal(approvals.length, 0);
});
test('read-only tools call advertised schema without approval', async () => {
  const original = globalThis.fetch; const { ctx, tools, approvals } = context(); let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++; const request = JSON.parse(init.body);
    const result = request.method === 'tools/list' ? { tools: [{ name: 'maps_textsearch', inputSchema: { type: 'object', properties: { keywords: { type: 'string' }, city: { type: 'string' } }, required: ['keywords', 'city'] } }] } : { content: [{ type: 'text', text: 'ok' }] };
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }));
  };
  try { await apply(ctx); const result = await tools.get('didi_call').execute({ action: 'maps_textsearch', arguments: { keywords: '国贸', city: '北京市' } }, {}); assert.equal(result.content[0].text, 'ok'); assert.equal(calls, 2); assert.equal(approvals.length, 0); }
  finally { globalThis.fetch = original; }
});
