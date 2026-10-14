import assert from 'node:assert/strict';
import { discover, rpc, validateArguments, READ_ACTIONS } from '../client.js';
const options = { key: process.env.DSH_DIDI_API_KEY, environment: 'sandbox' };
const tools = await discover(options);
async function call(name, args) {
  assert.ok(READ_ACTIONS.has(name), 'Integration script only permits read-only actions');
  const tool = tools.find(item => item.name === name); assert.ok(tool, `Missing ${name}`);
  validateArguments(tool, args);
  return rpc({ ...options, method: 'tools/call', params: { name, arguments: args } });
}
function parsed(result) {
  if (result.structuredContent) return result.structuredContent;
  for (const item of result.content ?? []) if (item.type === 'text') { try { return JSON.parse(item.text); } catch {} }
  throw new Error('Missing structured or JSON content');
}
function pois(value) {
  if (Array.isArray(value)) return value.flatMap(pois);
  if (!value || typeof value !== 'object') return [];
  const name = value.display_name ?? value.name;
  if (typeof name === 'string' && typeof value.location === 'string') return [{ name, location: value.location }];
  if (typeof name === 'string' && Number.isFinite(value.location?.lng) && Number.isFinite(value.location?.lat)) return [{ name, location: `${value.location.lng},${value.location.lat}` }];
  return Object.values(value).flatMap(pois);
}
const from = pois(parsed(await call('maps_textsearch', { keywords: '国贸', city: '北京市' })))[0];
const to = pois(parsed(await call('maps_textsearch', { keywords: '三里屯', city: '北京市' })))[0];
assert.ok(from && to, 'Expected sandbox POIs');
const [from_lng, from_lat] = from.location.split(',');
const [to_lng, to_lat] = to.location.split(',');
const estimate = parsed(await call('taxi_estimate', { from_lng, from_lat, from_name: from.name, to_lng, to_lat, to_name: to.name }));
assert.ok(estimate.traceId); assert.ok(estimate.items?.length);
await call('maps_direction_driving', { origin: from.location, destination: to.location });
await call('taxi_generate_ride_app_link', { from_lng, from_lat, to_lng, to_lat });
console.log(JSON.stringify({ environment: 'sandbox', discoveredTools: tools.length, checks: ['tools/list', 'maps_textsearch x2', 'taxi_estimate', 'maps_direction_driving', 'taxi_generate_ride_app_link'], availableProducts: estimate.items.length, createdOrders: 0, cancelledOrders: 0 }, null, 2));
