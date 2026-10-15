export const ENDPOINT = 'https://mcp.meeting.tencent.com/mcp/wemeet-open/v1';
export const READ_ACTIONS = new Set(['convert_timestamp', 'get_meeting', 'get_meeting_by_code', 'get_meeting_participants', 'get_meeting_invitees', 'get_waiting_room', 'get_job_result', 'get_user_meetings', 'get_user_ended_meetings', 'search_meetings', 'get_records_list', 'search_records', 'get_record_addresses', 'get_transcripts_paragraphs', 'get_transcripts_details', 'search_transcripts', 'get_smart_minutes', 'search_minutes', 'get_minutes', 'apply_record_permission_prepare', 'check_skill_version']);
export const CONTACT_ACTIONS = new Set(['contact_search', 'contact_lookup_by_phone', 'contact_lookup_by_email']);

export function validateArguments(action, args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('arguments must be an object');
  for (const [key, max] of [['invitees', 100], ['phones', 50], ['emails', 50]]) {
    if (args[key] !== undefined && (!Array.isArray(args[key]) || args[key].length > max)) throw new Error(`${key} must be an array of at most ${max} entries`);
  }
  if (action === 'update_meeting' && (Object.hasOwn(args, 'invitees') !== Object.hasOwn(args, 'invitees_operate_type'))) throw new Error('invitees and invitees_operate_type must be supplied together');
  if (action === 'meeting_control_call' && (!Array.isArray(args.users) || !args.users.length || args.users.length > 20)) throw new Error('users must contain 1–20 entries');
  if (action === 'meeting_control_kick') {
    const buckets = ['users', 'sip_users', 'pstn_users'].map(key => args[key] ?? []);
    if (buckets.some(items => !Array.isArray(items) || items.some(id => typeof id !== 'string' || !id.trim()))) throw new Error('Member IDs must be nonempty strings');
    const count = buckets.reduce((total, items) => total + items.length, 0);
    if (count < 1 || count > 20) throw new Error('Kick requires 1–20 members total');
  }
}

export function scrub(value, token) {
  if (typeof value === 'string') return token ? value.split(token).join('[REDACTED]') : value;
  if (Array.isArray(value)) return value.map(item => scrub(item, token));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, /token|authorization|password|secret/i.test(key) ? '[REDACTED]' : scrub(item, token)]));
  return value;
}

export async function rpc({ token, method, params = {}, signal, timeoutMs = 60000, fetchImpl = fetch }) {
  if (!token) throw new Error('Configure your own DSH_TENCENT_MEETING_TOKEN in DSH credential settings. Existing skill credentials are not imported.');
  let response;
  try {
    response = await fetchImpl(ENDPOINT, {
      method: 'POST', redirect: 'error',
      headers: { 'Content-Type': 'application/json', 'X-Tencent-Meeting-Token': token, 'X-Skill-Version': 'v1.0.15' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new Error('Tencent Meeting request failed or was cancelled; no request headers or credentials are logged.');
  }
  if (!response.ok) throw new Error(`Tencent Meeting HTTP ${response.status}`);
  const declared = Number(response.headers.get('content-length'));
  if (declared > 4194304) throw new Error('Response exceeds 4 MiB; narrow the query or paginate');
  const reader = response.body.getReader();
  const chunks = []; let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 4194304) { await reader.cancel(); throw new Error('Response exceeds 4 MiB; narrow the query or paginate'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  let data;
  try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('Tencent Meeting returned an invalid JSON response'); }
  data = scrub(data, token);
  if (data.error) throw new Error(`Tencent Meeting RPC error: ${JSON.stringify(data.error)}`);
  if (!Object.hasOwn(data, 'result')) throw new Error('Tencent Meeting response has no result');
  if (data.result?.isError) throw new Error(`Tencent Meeting tool error: ${JSON.stringify(data.result)}`);
  return data.result;
}

export async function discover(options) {
  const tools = []; const seen = new Set(); let cursor;
  for (let page = 0; page < 30; page++) {
    const result = await rpc({ ...options, method: 'tools/list', params: cursor ? { cursor } : {} });
    if (!Array.isArray(result.tools)) throw new Error('Invalid tools/list result');
    for (const tool of result.tools) {
      if (!tool || typeof tool.name !== 'string' || !tool.inputSchema || seen.has(tool.name)) throw new Error('Invalid or duplicate remote tool');
      seen.add(tool.name); tools.push(tool);
    }
    if (!result.nextCursor) return tools;
    if (result.nextCursor === cursor) throw new Error('Repeated discovery cursor');
    cursor = result.nextCursor;
  }
  throw new Error('Tool discovery exceeded pagination limit');
}
