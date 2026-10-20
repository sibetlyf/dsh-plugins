import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rpc, discover, scrub, validateArguments, ENDPOINT } from '../client.js';
const reply = result => new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }));
test('missing credential does not send a request', async () => {
  await assert.rejects(rpc({ token: '', method: 'tools/list', fetchImpl: () => { throw new Error('must not call'); } }), /Configure your own/);
});
test('official destination, headers and no redirects', async () => {
  const result = await rpc({ token: 'TEST_ONLY_NOT_REAL', method: 'tools/list', fetchImpl: async (url, init) => {
    assert.equal(url, ENDPOINT); assert.equal(init.redirect, 'error');
    assert.equal(init.headers['X-Tencent-Meeting-Token'], 'TEST_ONLY_NOT_REAL');
    assert.equal(JSON.parse(init.body).method, 'tools/list'); return reply({ tools: [] });
  } });
  assert.deepEqual(result, { tools: [] });
});
test('secret and password fields are redacted', () => {
  assert.deepEqual(scrub({ text: 'test-secret', token: 'other', password: 'abc' }, 'test-secret'), { text: '[REDACTED]', token: '[REDACTED]', password: '[REDACTED]' });
});
test('error echo cannot reveal token', async () => {
  await assert.rejects(rpc({ token: 'test-secret', method: 'tools/list', fetchImpl: async () => new Response(JSON.stringify({ error: { message: 'test-secret' } })) }), error => !error.message.includes('test-secret'));
});
test('tool errors are failures', async () => {
  await assert.rejects(rpc({ token: 'test', method: 'tools/call', fetchImpl: async () => reply({ isError: true, content: [] }) }), /tool error/);
});
test('network diagnostics do not leak credentials', async () => {
  await assert.rejects(rpc({ token: 'test-secret', method: 'tools/list', fetchImpl: async () => { throw new Error('test-secret'); } }), error => !error.message.includes('test-secret'));
});
test('discovery follows pagination', async () => {
  let calls = 0;
  const result = await discover({ token: 'test', fetchImpl: async () => reply(++calls === 1 ? { tools: [{ name: 'a', inputSchema: {} }], nextCursor: 'next' } : { tools: [{ name: 'b', inputSchema: {} }] }) });
  assert.equal(result.length, 2); assert.equal(calls, 2);
});
test('duplicate tools fail', async () => {
  await assert.rejects(discover({ token: 'test', fetchImpl: async () => reply({ tools: [{ name: 'a', inputSchema: {} }, { name: 'a', inputSchema: {} }] }) }), /duplicate/);
});
test('batch limits and paired parameters fail closed', () => {
  assert.throws(() => validateArguments('schedule_meeting', { invitees: Array(101).fill('x') }));
  assert.throws(() => validateArguments('update_meeting', { invitees: [] }));
  assert.throws(() => validateArguments('meeting_control_call', { users: [] }));
  assert.throws(() => validateArguments('meeting_control_kick', { users: [''] }));
  assert.throws(() => validateArguments('meeting_control_kick', { users: Array(21).fill('x') }));
  validateArguments('meeting_control_kick', { sip_users: ['a'] });
});
test('large declared response is rejected', async () => {
  await assert.rejects(rpc({ token: 'test', method: 'tools/list', fetchImpl: async () => new Response('{}', { headers: { 'content-length': '5000000' } }) }), /4 MiB/);
});
