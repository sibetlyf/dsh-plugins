import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rpc, discover, scrub, validateArguments, ENDPOINTS } from '../client.js';
const reply = result => new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }));
const tool = { name: 'maps_textsearch', inputSchema: { type: 'object', properties: { keywords: { type: 'string' }, city: { type: 'string' } }, required: ['keywords', 'city'] } };
test('missing key never sends request', async () => { await assert.rejects(rpc({ method: 'tools/list', fetchImpl: () => assert.fail() }), /Configure/); });
test('sandbox default and fixed official destination, encoded key, redirects disabled', async () => {
  await rpc({ key: 'test&secret', method: 'tools/list', fetchImpl: async (url, init) => {
    assert.equal(url, `${ENDPOINTS.sandbox}?key=test%26secret`); assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Accept, 'application/json, text/event-stream'); assert.equal(JSON.parse(init.body).method, 'tools/list'); return reply({ tools: [] });
  } });
});
test('production requires explicit environment', async () => { await rpc({ key: 'test', environment: 'production', method: 'tools/list', fetchImpl: async url => { assert.equal(url, `${ENDPOINTS.production}?key=test`); return reply({}); } }); });
test('invalid environment and timeout never send request', async () => {
  await assert.rejects(rpc({ key: 'test', environment: 'https://evil.test', fetchImpl: () => assert.fail() }), /environment/);
  await assert.rejects(rpc({ key: 'test', timeoutMs: 0, fetchImpl: () => assert.fail() }), /timeout/);
});
test('key redaction covers encoded values and query strings', () => { assert.deepEqual(scrub({ text: 'a&b a%26b https://x/?key=other', api_key: 'x' }, 'a&b'), { text: '[REDACTED] [REDACTED] https://x/?key=[REDACTED]', api_key: '[REDACTED]' }); });
test('network errors never leak key', async () => { await assert.rejects(rpc({ key: 'secret', fetchImpl: () => { throw Error('secret'); } }), e => !e.message.includes('secret')); });
test('RPC error redacts key', async () => { await assert.rejects(rpc({ key: 'secret', fetchImpl: async () => new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { message: 'secret' } })) }), e => e.message.includes('[REDACTED]') && !e.message.includes('secret')); });
test('tool errors are failures', async () => { await assert.rejects(rpc({ key: 'test', fetchImpl: async () => reply({ isError: true }) }), /tool error/); });
test('HTTP errors do not echo body', async () => { await assert.rejects(rpc({ key: 'secret', fetchImpl: async () => new Response('secret', { status: 401 }) }), /HTTP 401/); });
test('invalid JSON and response IDs fail', async () => {
  await assert.rejects(rpc({ key: 'test', fetchImpl: async () => new Response('invalid') }), /invalid JSON/);
  await assert.rejects(rpc({ key: 'test', fetchImpl: async () => new Response('{"jsonrpc":"2.0","id":2,"result":{}}') }), /Invalid DiDi/);
});
test('SSE response supports notifications, CRLF and multiline data', async () => {
  const text = 'event: message\r\ndata: {"jsonrpc":"2.0","method":"note"}\r\n\r\nevent: message\r\ndata: {"jsonrpc":"2.0",\r\ndata: "id":1,"result":{"ok":true}}\r\n\r\n';
  assert.deepEqual(await rpc({ key: 'test', fetchImpl: async () => new Response(text, { headers: { 'content-type': 'text/event-stream' } }) }), { ok: true });
});
test('oversized declared and streamed responses fail', async () => {
  await assert.rejects(rpc({ key: 'test', fetchImpl: async () => new Response('{}', { headers: { 'content-length': '5000000' } }) }), /4 MiB/);
  await assert.rejects(rpc({ key: 'test', fetchImpl: async () => new Response('x'.repeat(4194305)) }), /4 MiB/);
});
test('pagination follows cursors', async () => { let n = 0; const tools = await discover({ key: 'test', fetchImpl: async () => reply(++n === 1 ? { tools: [tool], nextCursor: 'next' } : { tools: [{ ...tool, name: 'b' }] }) }); assert.equal(tools.length, 2); });
test('duplicate tools and repeated cursors fail', async () => {
  await assert.rejects(discover({ key: 'test', fetchImpl: async () => reply({ tools: [tool, tool] }) }), /duplicate/);
  await assert.rejects(discover({ key: 'test', fetchImpl: async () => reply({ tools: [], nextCursor: 'repeat' }) }), /cursor/);
});
test('arguments reject absent, unknown and wrong types', () => {
  validateArguments(tool, { keywords: '国贸', city: '北京市' });
  assert.throws(() => validateArguments(tool, {}), /Missing/);
  assert.throws(() => validateArguments(tool, { keywords: 1, city: '北京' }), /must be string/);
  assert.throws(() => validateArguments(tool, { keywords: 'x', city: 'x', key: 'x' }), /Unknown/);
});
test('coordinates must be strings within bounds', () => {
  const t = { inputSchema: { properties: { from_lat: { type: 'string' }, origin: { type: 'string' } } } };
  validateArguments(t, { from_lat: '39.9', origin: '116.4,39.9' });
  for (const args of [{ from_lat: 39.9 }, { from_lat: '91' }, { from_lat: '' }, { origin: '39.9,181' }, { origin: 'bad' }]) assert.throws(() => validateArguments(t, args));
});
