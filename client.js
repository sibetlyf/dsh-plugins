export const ENDPOINTS = Object.freeze({ sandbox: 'https://mcp.didichuxing.com/mcp-servers-sandbox', production: 'https://mcp.didichuxing.com/mcp-servers' });
export const READ_ACTIONS = new Set(['maps_textsearch', 'maps_regeocode', 'maps_place_around', 'maps_direction_driving', 'maps_direction_transit', 'maps_direction_walking', 'maps_direction_bicycling', 'taxi_estimate', 'taxi_query_order', 'taxi_get_driver_location', 'taxi_generate_ride_app_link']);

export function scrub(value, key) {
  if (typeof value === 'string') {
    for (const secret of [key, key && encodeURIComponent(key)].filter(Boolean)) value = value.split(secret).join('[REDACTED]');
    return value.replace(/([?&]key=)[^\s&"<>]+/gi, '$1[REDACTED]');
  }
  if (Array.isArray(value)) return value.map(item => scrub(item, key));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, /^(key|api_?key|token|authorization|password|secret)$/i.test(name) ? '[REDACTED]' : scrub(item, key)]));
  return value;
}

export function validateArguments(tool, args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('arguments must be an object');
  const schema = tool.inputSchema;
  for (const name of schema.required ?? []) if (!Object.hasOwn(args, name)) throw new Error(`Missing required parameter: ${name}`);
  for (const [name, value] of Object.entries(args)) {
    const property = schema.properties?.[name];
    if (!property) throw new Error(`Unknown parameter: ${name}`);
    if (property.type && typeof value !== property.type) throw new Error(`Parameter ${name} must be ${property.type}`);
    if (property.enum && !property.enum.includes(value)) throw new Error(`Invalid value for ${name}`);
    if (/^(from|to)_(lng|lat)$/.test(name)) {
      const max = name.endsWith('lng') ? 180 : 90;
      if (typeof value !== 'string' || !value.trim() || !Number.isFinite(Number(value)) || Math.abs(Number(value)) > max) throw new Error(`Invalid coordinate: ${name}`);
    }
    if (['origin', 'destination', 'location'].includes(name)) {
      if (typeof value !== 'string' || !/^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/.test(value)) throw new Error(`${name} must be lng,lat`);
      const [lng, lat] = value.split(',').map(Number);
      if (Math.abs(lng) > 180 || Math.abs(lat) > 90) throw new Error(`Invalid coordinate: ${name}`);
    }
  }
}

export async function rpc({ key, environment = 'sandbox', method, params = {}, signal, timeoutMs = 60000, fetchImpl = fetch }) {
  if (typeof key !== 'string' || !key.trim()) throw new Error('Configure DSH_DIDI_API_KEY in DSH credential settings');
  if (!Object.hasOwn(ENDPOINTS, environment)) throw new Error('Invalid DiDi environment');
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) throw new Error('Invalid timeout');
  const abort = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
  let response;
  try {
    response = await fetchImpl(`${ENDPOINTS[environment]}?key=${encodeURIComponent(key)}`, {
      method: 'POST', redirect: 'error', signal: abort,
      headers: { 'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
  } catch { throw new Error('DiDi request failed or was cancelled; credentials and URLs are not logged; do not automatically retry orders'); }
  if (!response.ok) { await response.body?.cancel(); throw new Error(`DiDi HTTP ${response.status}`); }
  if (Number(response.headers.get('content-length')) > 4194304) { await response.body?.cancel(); throw new Error('Response exceeds 4 MiB'); }
  let data;
  try {
    const reader = response.body.getReader(); const chunks = []; let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 4194304) { await reader.cancel(); throw new Error('Response exceeds 4 MiB'); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const text = Buffer.concat(chunks).toString('utf8');
    if ((response.headers.get('content-type') ?? '').includes('text/event-stream')) {
      const events = text.replace(/\r\n/g, '\n').split('\n\n');
      for (const event of events) {
        const payload = event.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
        if (!payload) continue;
        const parsed = JSON.parse(payload);
        if (parsed.id === 1) { data = parsed; break; }
      }
    } else data = JSON.parse(text);
  } catch { throw new Error('DiDi response could not be read (invalid JSON, cancellation, or response exceeds 4 MiB)'); }
  data = scrub(data, key);
  if (!data || data.jsonrpc !== '2.0' || data.id !== 1) throw new Error('Invalid DiDi JSON-RPC response');
  if (data.error) throw new Error(`DiDi RPC error: ${JSON.stringify(data.error)}`);
  if (!Object.hasOwn(data, 'result')) throw new Error('DiDi response has no result');
  if (data.result?.isError) throw new Error(`DiDi tool error: ${JSON.stringify(data.result)}`);
  return data.result;
}

export async function discover(options) {
  const tools = []; const seen = new Set(); const cursors = new Set(); let cursor;
  for (let page = 0; page < 30; page++) {
    const result = await rpc({ ...options, method: 'tools/list', params: cursor ? { cursor } : {} });
    if (!Array.isArray(result.tools)) throw new Error('Invalid tools/list result');
    for (const tool of result.tools) {
      if (!tool || typeof tool.name !== 'string' || tool.inputSchema?.type !== 'object' || seen.has(tool.name)) throw new Error('Invalid or duplicate remote tool');
      seen.add(tool.name); tools.push(tool);
    }
    if (!result.nextCursor) return tools;
    if (typeof result.nextCursor !== 'string' || cursors.has(result.nextCursor)) throw new Error('Repeated or invalid discovery cursor');
    cursors.add(result.nextCursor); cursor = result.nextCursor;
  }
  throw new Error('Discovery exceeded pagination limit');
}
