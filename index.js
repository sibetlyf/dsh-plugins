// src/index.ts
import { randomUUID as randomUUID4 } from "node:crypto";
import { Service } from "@deepseek-ai/cordis";

// src/activity.ts
var ActivityLog = class {
  constructor(limit = 240) {
    this.limit = limit;
  }
  items = [];
  next = 0;
  get seq() {
    return this.next;
  }
  add(input) {
    const seq = ++this.next;
    const item = {
      id: input.id ?? `a${seq}`,
      seq,
      at: Date.now(),
      direction: input.direction,
      action: input.action,
      status: input.status ?? "info",
      title: input.title,
      ...input.detail ? { detail: input.detail } : {},
      ...input.deviceId ? { deviceId: input.deviceId } : {},
      ...input.deviceName ? { deviceName: input.deviceName } : {},
      ...input.callId ? { callId: input.callId } : {}
    };
    this.items.push(item);
    this.trim();
    return item;
  }
  update(id, patch) {
    const item = this.items.find((entry) => entry.id === id);
    if (!item) return void 0;
    Object.assign(item, patch, { updatedAt: Date.now() });
    return item;
  }
  /** Rows newer than the caller's cursor, oldest first. */
  since(seq) {
    if (!Number.isFinite(seq) || seq <= 0) return [...this.items];
    return this.items.filter((item) => item.seq > seq);
  }
  recent(limit = 60) {
    return this.items.slice(-limit);
  }
  clear() {
    this.items = [];
  }
  trim() {
    const overflow = this.items.length - this.limit;
    if (overflow > 0) this.items.splice(0, overflow);
  }
};

// src/actions.ts
import { execFile, spawn } from "node:child_process";
import { readFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
var execFileAsync = promisify(execFile);
var DeviceActions = class {
  constructor(host) {
    this.host = host;
  }
  async handle(call) {
    const prefs = this.host.prefs();
    try {
      switch (call.action) {
        case "info":
          call.result(this.info());
          return;
        case "notify":
          await this.notify(call, prefs);
          return;
        case "task":
          if (!prefs.allowTask) return call.fail("not_allowed", "\u8FD9\u53F0\u7535\u8111\u5F53\u524D\u4E0D\u63A5\u53D7\u8FDC\u7A0B\u4EFB\u52A1");
          call.result(await this.host.taskRunner().task(call, call.args));
          return;
        case "approve":
          call.result(this.host.taskRunner().approve(call, call.args));
          return;
        case "stop":
          call.result(await this.host.taskRunner().stop(call, call.args));
          return;
        case "screen":
          await this.screen(call, prefs);
          return;
        case "open":
          await this.open(call, prefs);
          return;
        case "shell":
          await this.shell(call, prefs);
          return;
        default:
          call.fail("unknown_action", `\u8FD9\u53F0\u7535\u8111\u4E0D\u652F\u6301\u52A8\u4F5C ${call.action || "(\u7A7A)"}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.host.log("warn", `${call.action} \u5904\u7406\u5931\u8D25: ${message}`);
      call.fail("failed", message);
    }
  }
  info() {
    return {
      name: this.host.deviceName(),
      kind: "computer",
      os: prettyPlatform(),
      app: "DeepSeek Harness Web",
      node: process.version,
      actions: this.actions(),
      note: "task \u4F1A\u5728\u8FD9\u53F0\u7535\u8111\u7684 DSH \u4E2D\u65B0\u5EFA\u4F1A\u8BDD\uFF1Bshell\u3001open\u3001screen \u9700\u8981\u5728\u672C\u673A\u8BBE\u7F6E\u4E2D\u6253\u5F00"
    };
  }
  actions() {
    const prefs = this.host.prefs();
    const actions = ["info"];
    if (prefs.allowNotify) actions.push("notify");
    if (prefs.allowTask) actions.push("task");
    if (prefs.allowTask) actions.push("approve", "stop");
    if (prefs.allowScreen && screenSupported()) actions.push("screen");
    if (prefs.allowOpen) actions.push("open");
    if (prefs.allowShell) actions.push("shell");
    return actions;
  }
  async notify(call, prefs) {
    if (!prefs.allowNotify) return call.fail("not_allowed", "\u8FD9\u53F0\u7535\u8111\u5F53\u524D\u4E0D\u63A5\u53D7\u8FDC\u7A0B\u63D0\u9192");
    const title = String(call.args.title ?? "nanoMuse").trim().slice(0, 120) || "nanoMuse";
    const text = String(call.args.body ?? call.args.text ?? call.args.message ?? "").trim();
    if (!text) return call.fail("usage", "\u901A\u77E5\u5185\u5BB9\u4E0D\u80FD\u4E3A\u7A7A");
    this.host.activity().add({
      direction: "in",
      action: "notify",
      status: "ok",
      deviceId: call.from.id,
      deviceName: call.from.name,
      callId: call.id,
      title,
      detail: text.slice(0, 500)
    });
    this.host.log("info", `\u6765\u81EA ${call.from.name} \u7684\u63D0\u9192: ${text.slice(0, 80)}`);
    void systemNotify(title, text);
    call.result({ ok: true, shown: true, title, text });
  }
  async screen(call, prefs) {
    if (!prefs.allowScreen) return call.fail("not_allowed", "\u8FD9\u53F0\u7535\u8111\u5F53\u524D\u4E0D\u5141\u8BB8\u8FDC\u7A0B\u622A\u5C4F");
    const shot = await captureScreen();
    this.host.activity().add({
      direction: "in",
      action: "screen",
      status: "ok",
      deviceId: call.from.id,
      deviceName: call.from.name,
      callId: call.id,
      title: "\u8FDC\u7A0B\u622A\u5C4F",
      detail: `${shot.width}\xD7${shot.height} \xB7 ${Math.round(shot.bytes / 1024)} KB`
    });
    call.result({ mime: shot.mime, width: shot.width, height: shot.height, bytes: shot.bytes, data: shot.data });
  }
  async open(call, prefs) {
    if (!prefs.allowOpen) return call.fail("not_allowed", "\u8FD9\u53F0\u7535\u8111\u5F53\u524D\u4E0D\u5141\u8BB8\u8FDC\u7A0B\u6253\u5F00\u94FE\u63A5");
    const url = String(call.args.url ?? "").trim();
    if (!/^https?:\/\//i.test(url)) return call.fail("usage", "\u53EA\u5141\u8BB8\u6253\u5F00 http(s) \u94FE\u63A5");
    openUrl(url);
    this.host.activity().add({
      direction: "in",
      action: "open",
      status: "ok",
      deviceId: call.from.id,
      deviceName: call.from.name,
      callId: call.id,
      title: "\u8FDC\u7A0B\u6253\u5F00\u94FE\u63A5",
      detail: url
    });
    call.result({ ok: true, url });
  }
  async shell(call, prefs) {
    if (!prefs.allowShell) return call.fail("not_allowed", "\u8FD9\u53F0\u7535\u8111\u5F53\u524D\u4E0D\u5141\u8BB8\u8FDC\u7A0B\u6267\u884C\u547D\u4EE4");
    const command = String(call.args.command ?? "").trim();
    if (!command) return call.fail("usage", "command \u4E0D\u80FD\u4E3A\u7A7A");
    const timeout = clamp(Number(call.args.timeout ?? 60) || 60, 1, 900);
    const cwd = String(call.args.cwd ?? "").trim() || this.host.workingDirectory();
    const result = await runShell(command, cwd, timeout);
    this.host.activity().add({
      direction: "in",
      action: "shell",
      status: result.exit_code === 0 ? "ok" : "error",
      deviceId: call.from.id,
      deviceName: call.from.name,
      callId: call.id,
      title: `\u8FDC\u7A0B\u547D\u4EE4: ${command.slice(0, 100)}`,
      detail: `\u9000\u51FA\u7801 ${result.exit_code}${result.timed_out ? " \xB7 \u8D85\u65F6" : ""}`
    });
    call.result({ ...result });
  }
};
function screenSupported() {
  return process.platform === "win32" || process.platform === "darwin";
}
async function captureScreen() {
  if (process.platform === "win32") return captureWindows();
  if (process.platform === "darwin") return captureMac();
  throw new Error("\u8FD9\u4E2A\u5E73\u53F0\u6682\u4E0D\u652F\u6301\u622A\u5C4F");
}
async function captureWindows() {
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$graphics = [System.Drawing.Graphics]::FromImage($bmp)
$graphics.CopyFromScreen($bounds.Left, $bounds.Top, 0, 0, $bmp.Size)
$width = $bmp.Width
$height = $bmp.Height
if ($width -gt 1600) {
  $height = [int]($height * 1600 / $width)
  $width = 1600
  $scaled = New-Object System.Drawing.Bitmap $width, $height
  $g2 = [System.Drawing.Graphics]::FromImage($scaled)
  $g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g2.DrawImage($bmp, 0, 0, $width, $height)
  $g2.Dispose()
  $bmp.Dispose()
  $bmp = $scaled
}
$stream = New-Object System.IO.MemoryStream
$encoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$params = New-Object System.Drawing.Imaging.EncoderParameters 1
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, 72)
$bmp.Save($stream, $encoder, $params)
$data = [Convert]::ToBase64String($stream.ToArray())
$graphics.Dispose()
$bmp.Dispose()
$stream.Dispose()
[PSCustomObject]@{ width = $width; height = $height; data = $data } | ConvertTo-Json -Compress
`;
  const stdout = await runPowerShell(script, 2e4);
  const parsed = JSON.parse(stdout.trim());
  const bytes = Buffer.from(parsed.data, "base64").length;
  return { mime: "image/jpeg", width: parsed.width, height: parsed.height, bytes, data: parsed.data };
}
async function captureMac() {
  const file = join(tmpdir(), `dsh-gateway-${randomUUID()}.jpg`);
  try {
    await execFileAsync("screencapture", ["-x", "-t", "jpg", file], { timeout: 15e3 });
    const data = await readFile(file);
    return { mime: "image/jpeg", width: 0, height: 0, bytes: data.length, data: data.toString("base64") };
  } finally {
    await unlink(file).catch(() => void 0);
  }
}
function openUrl(url) {
  try {
    if (process.platform === "win32") {
      const child = spawn("cmd.exe", ["/d", "/s", "/c", "start", "", url], { detached: true, stdio: "ignore", windowsHide: true });
      child.unref();
    } else if (process.platform === "darwin") {
      const child = spawn("open", [url], { detached: true, stdio: "ignore" });
      child.unref();
    } else {
      const child = spawn("xdg-open", [url], { detached: true, stdio: "ignore" });
      child.unref();
    }
  } catch {
  }
}
var OUTPUT_LIMIT = 2e5;
function runShell(command, cwd, timeoutSeconds) {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd: cwd || process.cwd(),
      shell: true,
      windowsHide: true,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
    }, timeoutSeconds * 1e3);
    child.stdout?.on("data", (chunk) => {
      if (stdout.length < OUTPUT_LIMIT) stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk) => {
      if (stderr.length < OUTPUT_LIMIT) stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        exit_code: 127,
        stdout,
        stderr: `${stderr}${error.message}`.trim(),
        timed_out: false,
        duration_ms: Date.now() - started
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        exit_code: timedOut ? 124 : Number(code ?? 0),
        stdout: stdout.slice(0, OUTPUT_LIMIT),
        stderr: stderr.slice(0, OUTPUT_LIMIT),
        timed_out: timedOut,
        duration_ms: Date.now() - started
      });
    });
  });
}
function killTree(pid) {
  if (!pid) return;
  if (process.platform === "win32") {
    try {
      spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    } catch {
    }
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
    }
  }
}
async function systemNotify(title, body) {
  try {
    if (process.platform === "win32") {
      const safeTitle = psString(title);
      const safeBody = psString(body.slice(0, 400));
      const script = `
$ErrorActionPreference = 'Stop'
$title = ${safeTitle}
$body = ${safeBody}
try {
  [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
  $xml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
  $nodes = $xml.GetElementsByTagName('text')
  [void]$nodes.Item(0).AppendChild($xml.CreateTextNode($title))
  [void]$nodes.Item(1).AppendChild($xml.CreateTextNode($body))
  $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('DeepSeek Harness').Show($toast)
} catch {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  $icon = New-Object System.Windows.Forms.NotifyIcon
  $icon.Icon = [System.Drawing.SystemIcons]::Information
  $icon.Visible = $true
  $icon.ShowBalloonTip(5000, $title, $body, [System.Windows.Forms.ToolTipIcon]::Info)
  Start-Sleep -Seconds 6
  $icon.Dispose()
}
`;
      await runPowerShell(script, 15e3);
      return;
    }
    if (process.platform === "darwin") {
      const script = `display notification ${appleString(body.slice(0, 400))} with title ${appleString(title)}`;
      await execFileAsync("osascript", ["-e", script], { timeout: 8e3 });
      return;
    }
    await execFileAsync("notify-send", [title, body.slice(0, 400)], { timeout: 8e3 });
  } catch {
  }
}
function runPowerShell(script, timeout) {
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  return execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
    { timeout, maxBuffer: 40 * 1024 * 1024, windowsHide: true }
  ).then((result) => result.stdout);
}
function psString(value) {
  return `'${value.replace(/'/g, "''")}'`;
}
function appleString(value) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
function prettyPlatform() {
  if (process.platform === "win32") return `Windows ${process.arch}`;
  if (process.platform === "darwin") return `macOS ${process.arch}`;
  return `${process.platform} ${process.arch}`;
}

// src/config.ts
import { readFile as readFile2, writeFile, mkdir, chmod } from "node:fs/promises";
import { hostname } from "node:os";
import { join as join2 } from "node:path";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";
var DEFAULT_BASE_URL = "http://127.0.0.1:8790";
var STATE_FILE = "gateway.json";
var STATE_VERSION = 1;
var DEFAULT_PREFS = {
  autoConnect: true,
  autoSyncToNanomuse: true,
  allowTask: true,
  allowNotify: true,
  allowScreen: true,
  allowOpen: false,
  allowShell: false,
  relayApprovals: true
};
function dshHome() {
  const configured = process.env.DSH_HOME;
  if (configured) return configured;
  return join2(process.env.HOME ?? process.env.USERPROFILE ?? homedir(), ".dsh");
}
function stateDir() {
  return join2(dshHome(), "nanomuse");
}
function statePath() {
  return join2(stateDir(), STATE_FILE);
}
function cleanUrl(input) {
  return input.trim().replace(/\/+$/, "");
}
function normalizeBaseURL(input) {
  const raw = String(input ?? "").trim();
  if (!raw) return "";
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return cleanUrl(url.toString());
  } catch {
    return "";
  }
}
function defaultDeviceName() {
  const host = hostname().trim();
  return (host || "DSH Web Client").slice(0, 60);
}
function newDeviceId() {
  return `pc-dsh-${randomBytes(6).toString("hex")}`;
}
function sanitizeDeviceName(input) {
  return String(input ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
}
async function readState() {
  try {
    const text = await readFile2(statePath(), "utf8");
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { version: STATE_VERSION };
    const value = parsed;
    return {
      version: STATE_VERSION,
      baseURL: typeof value.baseURL === "string" ? normalizeBaseURL(value.baseURL) : void 0,
      identifier: typeof value.identifier === "string" ? value.identifier.trim() : void 0,
      apiKey: typeof value.apiKey === "string" ? value.apiKey.trim() : void 0,
      deviceId: typeof value.deviceId === "string" && value.deviceId.trim() ? value.deviceId.trim() : void 0,
      deviceName: sanitizeDeviceName(value.deviceName) || void 0,
      lastConnectedAt: typeof value.lastConnectedAt === "number" ? value.lastConnectedAt : void 0,
      prefs: value.prefs && typeof value.prefs === "object" && !Array.isArray(value.prefs) ? value.prefs : void 0
    };
  } catch {
    return { version: STATE_VERSION };
  }
}
async function writeState(state) {
  const dir = stateDir();
  await mkdir(dir, { recursive: true });
  const path = statePath();
  const body = `${JSON.stringify({ ...state, version: STATE_VERSION }, null, 2)}
`;
  await writeFile(path, body, { encoding: "utf8", mode: 384 });
  await chmod(path, 384).catch(() => void 0);
}
function resolveEffective(row, state) {
  const envURL = normalizeBaseURL(process.env.NANOMUSE_CLOUD_URL ?? process.env.NANOMUSE_GATEWAY_URL);
  const rowURL = normalizeBaseURL(row.baseURL);
  let baseURL = DEFAULT_BASE_URL;
  let sourceBaseURL = "default";
  if (state.baseURL) {
    baseURL = state.baseURL;
    sourceBaseURL = "state";
  } else if (envURL) {
    baseURL = envURL;
    sourceBaseURL = "env";
  } else if (rowURL) {
    baseURL = rowURL;
    sourceBaseURL = "row";
  }
  const rowIdentifier = String(row.identifier ?? "").trim();
  const identifier = state.identifier || rowIdentifier || "admin";
  const sourceIdentifier = state.identifier ? "state" : rowIdentifier ? "row" : "default";
  const rowName = sanitizeDeviceName(row.deviceName);
  const deviceName = state.deviceName || rowName || defaultDeviceName();
  const sourceDeviceName = state.deviceName ? "state" : rowName ? "row" : "host";
  const prefs = {
    autoConnect: pickBoolean(row.autoConnect, state.prefs?.autoConnect, DEFAULT_PREFS.autoConnect),
    autoSyncToNanomuse: pickBoolean(
      row.autoSyncToNanomuse,
      state.prefs?.autoSyncToNanomuse,
      DEFAULT_PREFS.autoSyncToNanomuse
    ),
    allowTask: pickBoolean(row.allowTask, state.prefs?.allowTask, DEFAULT_PREFS.allowTask),
    allowNotify: pickBoolean(row.allowNotify, state.prefs?.allowNotify, DEFAULT_PREFS.allowNotify),
    allowScreen: pickBoolean(row.allowScreen, state.prefs?.allowScreen, DEFAULT_PREFS.allowScreen),
    allowOpen: pickBoolean(row.allowOpen, state.prefs?.allowOpen, DEFAULT_PREFS.allowOpen),
    allowShell: pickBoolean(row.allowShell, state.prefs?.allowShell, DEFAULT_PREFS.allowShell),
    relayApprovals: pickBoolean(row.relayApprovals, state.prefs?.relayApprovals, DEFAULT_PREFS.relayApprovals)
  };
  return {
    baseURL,
    identifier,
    apiKey: state.apiKey ?? "",
    deviceId: state.deviceId || newDeviceId(),
    deviceName,
    prefs,
    source: { baseURL: sourceBaseURL, identifier: sourceIdentifier, deviceName: sourceDeviceName }
  };
}
function pickBoolean(row, state, fallback) {
  if (typeof state === "boolean") return state;
  if (typeof row === "boolean") return row;
  return fallback;
}
function publicConfig(effective, state, configPath) {
  return {
    baseURL: effective.baseURL,
    identifier: effective.identifier,
    deviceName: effective.deviceName,
    deviceId: effective.deviceId,
    prefs: effective.prefs,
    hasKey: Boolean(effective.apiKey),
    apiKeyPrefix: effective.apiKey ? `${effective.apiKey.slice(0, 7)}\u2026` : "",
    lastConnectedAt: state.lastConnectedAt ?? null,
    configPath,
    source: effective.source
  };
}

// src/hub.ts
import { randomUUID as randomUUID2 } from "node:crypto";
var HubError = class extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "HubError";
  }
};
var PING_EVERY_MS = 2e4;
var SILENCE_LIMIT_MS = 55e3;
var REPLACED_RETRY_MS = 3e4;
var IncomingCall = class {
  constructor(hub, id, from, action, args) {
    this.hub = hub;
    this.id = id;
    this.from = from;
    this.action = action;
    this.args = args;
  }
  answered = false;
  event(body) {
    if (this.answered) return;
    this.hub.send({ type: "event", id: this.id, body });
  }
  result(body = {}) {
    if (this.answered) return;
    this.answered = true;
    this.hub.send({ type: "result", id: this.id, ok: true, body });
  }
  fail(code, message) {
    if (this.answered) return;
    this.answered = true;
    this.hub.send({ type: "result", id: this.id, ok: false, error: code, message });
  }
};
var HubClient = class {
  ws = null;
  options;
  running = false;
  reconnectTimer = null;
  pingTimer = null;
  pingSentAt = 0;
  lastMessageAt = 0;
  backoff = 1e3;
  pending = /* @__PURE__ */ new Map();
  state = "idle";
  detail = "";
  lastError = "";
  connected = false;
  connectedAt = 0;
  latencyMs = null;
  devices = [];
  deviceId;
  deviceName;
  actions;
  constructor(options) {
    this.options = options;
    this.deviceId = options.deviceId;
    this.deviceName = options.deviceName;
    this.actions = options.actions;
  }
  get baseURL() {
    return this.options.baseURL;
  }
  get token() {
    return this.options.token;
  }
  updateOptions(patch) {
    const reconnect = patch.baseURL !== void 0 && patch.baseURL !== this.options.baseURL || patch.token !== void 0 && patch.token !== this.options.token;
    const actionsChanged = patch.actions !== void 0 && !sameActions(this.actions, patch.actions);
    this.options = { ...this.options, ...patch };
    if (patch.deviceId !== void 0) this.deviceId = patch.deviceId;
    if (patch.deviceName !== void 0) this.deviceName = patch.deviceName;
    if (patch.actions !== void 0) this.actions = patch.actions;
    if (this.running && (reconnect || actionsChanged)) this.restart();
  }
  setActions(actions) {
    if (sameActions(this.actions, actions)) return;
    this.actions = actions;
    this.options.actions = actions;
    if (this.running) this.restart();
  }
  setDeviceName(name2) {
    this.deviceName = name2;
    this.options.deviceName = name2;
  }
  start() {
    if (this.running) return;
    if (!this.options.baseURL || !this.options.token) {
      this.setState("idle", "missing-gateway");
      return;
    }
    this.running = true;
    this.connect();
  }
  stop() {
    this.running = false;
    this.clearTimers();
    this.failAll("disconnected", "the hub connection was closed");
    if (this.ws) {
      try {
        this.ws.close(1e3, "stopped");
      } catch {
      }
      this.ws = null;
    }
    this.connected = false;
    this.devices = [];
    this.setState("idle", "stopped");
  }
  restart() {
    this.stop();
    this.running = true;
    this.connect();
  }
  rename(name2) {
    this.setDeviceName(name2);
    this.send({ type: "rename", name: name2 });
  }
  /** Send one raw frame; a closed socket is a no-op reported to the caller. */
  send(frame2) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(JSON.stringify(frame2));
      return true;
    } catch {
      return false;
    }
  }
  sendEvent(callId, body) {
    this.send({ type: "event", id: callId, body });
  }
  /**
   * Call another device and wait for its result. `onEvent` receives the
   * progress frames (tool steps, text, approvals) while the call is open.
   */
  async call(targetId, action, args = {}, timeoutMs = 3e4, onEvent) {
    if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new HubError("disconnected", "\u672A\u8FDE\u63A5\u5230 nanoMuse \u7F51\u5173\u957F\u8FDE\u63A5");
    }
    if (!targetId || targetId === this.deviceId) {
      throw new HubError("self_call", "\u4E0D\u80FD\u5411\u672C\u673A\u53D1\u8D77\u8FDC\u7A0B\u8C03\u7528");
    }
    const callId = `call_${randomUUID2().slice(0, 8)}`;
    const frame2 = { type: "call", id: callId, to: targetId, action, args };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(callId);
        reject(new HubError("timeout", `\u8FDC\u7A0B\u8BBE\u5907\u5728 ${Math.round(timeoutMs / 1e3)} \u79D2\u5185\u6CA1\u6709\u5E94\u7B54`));
      }, Math.max(1e3, timeoutMs));
      this.pending.set(callId, { resolve, reject, timer, onEvent });
      if (!this.send(frame2)) {
        clearTimeout(timer);
        this.pending.delete(callId);
        reject(new HubError("disconnected", "\u957F\u8FDE\u63A5\u5DF2\u65AD\u5F00\uFF0C\u6307\u4EE4\u672A\u53D1\u51FA"));
      }
    });
  }
  /** Other devices of this account, never this computer and never a browser tab. */
  getOtherDevices() {
    return this.devices.filter((device) => device.id !== this.deviceId && device.kind !== "web");
  }
  findDevice(reference) {
    const raw = String(reference ?? "").trim().replace(/^@+/, "").trim();
    const others = this.getOtherDevices();
    if (!raw) return others.length === 1 ? others[0] : void 0;
    const query = raw.toLowerCase();
    const byId = others.find((device) => device.id.toLowerCase() === query);
    if (byId) return byId;
    const byHandle = others.find((device) => String(device.handle ?? "").toLowerCase() === query);
    if (byHandle) return byHandle;
    const byName = others.find((device) => device.name.toLowerCase() === query);
    if (byName) return byName;
    const byPrefix = others.find((device) => device.name.toLowerCase().startsWith(query));
    if (byPrefix) return byPrefix;
    const byPart = others.find((device) => device.name.toLowerCase().includes(query));
    if (byPart) return byPart;
    if (query === "phone" || query === "\u624B\u673A") {
      return others.find((device) => device.kind === "phone" && device.online) ?? others.find((device) => device.kind === "phone");
    }
    if (query === "server" || query === "\u670D\u52A1\u5668" || query === "linux") {
      return others.find(
        (device) => device.online && (device.os.toLowerCase().includes("linux") || device.name.toLowerCase().includes("server"))
      );
    }
    if (query === "pc" || query === "\u7535\u8111" || query === "windows" || query === "mac" || query === "desktop") {
      return others.find((device) => device.online && device.kind === "computer");
    }
    return void 0;
  }
  close() {
    this.stop();
  }
  // ── socket lifecycle ────────────────────────────────────────────────
  connect() {
    if (!this.running || !this.options.baseURL || !this.options.token) return;
    this.clearTimers();
    this.setState("connecting", this.detail || "connecting");
    const wsUrl = this.options.baseURL.replace(/^http:/, "ws:").replace(/^https:/, "wss:") + "/v1/hub";
    let ws;
    try {
      ws = new WebSocket(wsUrl);
    } catch (error) {
      this.failAndRetry(error instanceof Error ? error.message : "WebSocket \u521B\u5EFA\u5931\u8D25");
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.lastMessageAt = Date.now();
      this.send({
        type: "hello",
        key: this.options.token,
        device: {
          id: this.deviceId,
          name: this.deviceName,
          kind: "computer",
          os: prettyPlatform2(),
          version: this.options.version,
          actions: this.actions
        }
      });
      this.pingTimer = setInterval(() => this.tick(), PING_EVERY_MS);
    };
    ws.onmessage = (event) => {
      this.lastMessageAt = Date.now();
      let frame2;
      try {
        frame2 = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (frame2 && typeof frame2 === "object") this.handleFrame(frame2);
    };
    ws.onclose = (event) => {
      this.connected = false;
      this.pingTimer && clearInterval(this.pingTimer);
      this.pingTimer = null;
      this.ws = null;
      this.failAll("disconnected", "\u4E0E nanoMuse \u7F51\u5173\u7684\u957F\u8FDE\u63A5\u5DF2\u65AD\u5F00");
      if (!this.running) return;
      const code = Number(event.code) || 0;
      const reason = String(event.reason || "");
      if (code === 4001 || code === 4002) {
        this.running = false;
        this.lastError = code === 4001 ? "\u7F51\u5173\u62D2\u7EDD\u4E86\u5F53\u524D\u51ED\u636E\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55" : "\u7F51\u5173\u62D2\u7EDD\u4E86\u8FD9\u4E2A\u8BBE\u5907";
        this.setState("unauthorized", this.lastError);
        return;
      }
      if (code === 4003) {
        this.detail = reason === "hub_paused" ? "\u7F51\u5173\u5DF2\u6682\u505C\u4E2D\u7EE7\uFF0C\u7A0D\u540E\u91CD\u8BD5" : "\u540C\u4E00\u8BBE\u5907\u5728\u522B\u5904\u91CD\u65B0\u8FDE\u63A5\uFF0C\u7A0D\u540E\u91CD\u8BD5";
        this.scheduleReconnect(REPLACED_RETRY_MS);
        return;
      }
      this.failAndRetry(reason || `\u8FDE\u63A5\u5173\u95ED (${code || "network"})`);
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch {
      }
    };
  }
  tick() {
    if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (Date.now() - this.lastMessageAt > SILENCE_LIMIT_MS) {
      this.lastError = "\u7F51\u5173\u957F\u65F6\u95F4\u6CA1\u6709\u54CD\u5E94\uFF0C\u6B63\u5728\u91CD\u8FDE";
      try {
        this.ws.close(4e3, "silence");
      } catch {
      }
      return;
    }
    this.pingSentAt = Date.now();
    this.send({ type: "ping", time: this.pingSentAt });
  }
  failAndRetry(message) {
    if (!this.running) return;
    this.lastError = message;
    this.setState("error", message);
    this.scheduleReconnect(this.backoff);
    this.backoff = Math.min(this.backoff * 2, 3e4);
  }
  scheduleReconnect(delay) {
    if (!this.running) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
  clearTimers() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.pingTimer = null;
    this.reconnectTimer = null;
  }
  setState(state, detail) {
    this.state = state;
    this.detail = detail;
    try {
      this.options.onState?.(state, detail);
    } catch {
    }
  }
  failAll(code, message) {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      this.pending.delete(id);
      pending.reject(new HubError(code, message));
    }
  }
  // ── frames ──────────────────────────────────────────────────────────
  handleFrame(frame2) {
    const type = String(frame2.type ?? "");
    if (type === "welcome") {
      this.backoff = 1e3;
      this.connected = true;
      this.connectedAt = Date.now();
      this.lastError = "";
      const list = readDevices(frame2.devices, this.deviceId);
      const changed = !sameDevices(this.devices, list);
      this.devices = list;
      this.setState("connected", String(frame2.device_id ?? ""));
      try {
        this.options.onDevices?.(list, changed);
      } catch {
      }
      return;
    }
    if (type === "devices") {
      const list = readDevices(frame2.devices, this.deviceId);
      const changed = !sameDevices(this.devices, list);
      if (!changed) return;
      this.devices = list;
      try {
        this.options.onDevices?.(list, true);
      } catch {
      }
      return;
    }
    if (type === "pong") {
      if (this.pingSentAt) this.latencyMs = Math.max(0, Date.now() - this.pingSentAt);
      return;
    }
    if (type === "error") {
      const id = String(frame2.id ?? "");
      const code = String(frame2.code ?? "error");
      const message = String(frame2.message ?? "\u7F51\u5173\u8FD4\u56DE\u9519\u8BEF");
      if (id && this.pending.has(id)) {
        const pending = this.pending.get(id);
        clearTimeout(pending.timer);
        this.pending.delete(id);
        pending.reject(new HubError(code, message));
      } else {
        this.lastError = `${code}: ${message}`;
        this.options.onLog?.("warn", `\u7F51\u5173\u9519\u8BEF: ${this.lastError}`);
      }
      return;
    }
    if ((type === "result" || type === "event") && typeof frame2.id === "string") {
      const pending = this.pending.get(frame2.id);
      if (!pending) return;
      if (type === "event") {
        try {
          const body = frame2.body ?? {};
          pending.onEvent?.(body);
        } catch {
        }
        return;
      }
      clearTimeout(pending.timer);
      this.pending.delete(frame2.id);
      if (frame2.ok === false) {
        pending.reject(
          new HubError(String(frame2.error ?? "failed"), String(frame2.message ?? "\u8FDC\u7A0B\u8BBE\u5907\u6267\u884C\u5931\u8D25"))
        );
      } else {
        pending.resolve(frame2.body ?? {});
      }
      return;
    }
    if (type === "call" && typeof frame2.id === "string") {
      const from = frame2.from && typeof frame2.from === "object" ? frame2.from : {};
      const call = new IncomingCall(
        this,
        frame2.id,
        {
          id: String(from.id ?? ""),
          name: String(from.name ?? from.id ?? "\u53E6\u4E00\u53F0\u8BBE\u5907"),
          kind: String(from.kind ?? "computer")
        },
        String(frame2.action ?? ""),
        frame2.args ?? {}
      );
      const handler = this.options.onIncoming;
      if (!handler) {
        call.fail("unknown_action", "\u672C\u673A\u6CA1\u6709\u6CE8\u518C\u8DE8\u7AEF\u52A8\u4F5C\u5904\u7406\u5668");
        return;
      }
      Promise.resolve().then(() => handler(call)).catch((error) => {
        call.fail("failed", error instanceof Error ? error.message : String(error));
      }).finally(() => {
        if (!call.answered) call.fail("failed", "\u52A8\u4F5C\u5904\u7406\u5668\u6CA1\u6709\u8FD4\u56DE\u7ED3\u679C");
      });
      return;
    }
    if (type === "ping") {
      this.send({ type: "pong", time: Number(frame2.time ?? Date.now()) });
      return;
    }
    if (type === "sync" || type === "working" || type === "profile") {
      return;
    }
  }
};
function readDevices(input, selfId) {
  if (!Array.isArray(input)) return [];
  const list = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const value = raw;
    const id = String(value.id ?? "").trim();
    if (!id) continue;
    list.push({
      id,
      name: String(value.name ?? id),
      kind: String(value.kind ?? "computer"),
      os: String(value.os ?? ""),
      version: String(value.version ?? ""),
      online: value.online !== false,
      last_seen: Number(value.last_seen ?? Math.floor(Date.now() / 1e3)),
      controllable: value.controllable !== false,
      actions: Array.isArray(value.actions) ? value.actions.map((action) => String(action)) : []
    });
  }
  return decorateHandles(list, selfId);
}
function sanitizeHandle(name2, id) {
  const raw = String(name2 ?? "").trim();
  const handle = raw.replace(/\s+/gu, "-").replace(/[^\p{L}\p{N}_-]/gu, "").slice(0, 32);
  return handle || String(id ?? "").slice(0, 8) || "device";
}
function decorateHandles(list, selfId) {
  const used = /* @__PURE__ */ new Map();
  return list.map((device) => {
    if (device.id === selfId || device.kind === "web") return device;
    let handle = sanitizeHandle(device.name, device.id);
    const key = handle.toLowerCase();
    const count = used.get(key) ?? 0;
    used.set(key, count + 1);
    if (count > 0) handle = `${handle}-${count + 1}`;
    return { ...device, handle };
  });
}
function sameActions(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
function sameDevices(a, b) {
  if (a.length !== b.length) return false;
  return a.every((left, index) => {
    const right = b[index];
    return left.id === right.id && left.name === right.name && left.online === right.online && left.kind === right.kind && sameActions(left.actions, right.actions);
  });
}
function prettyPlatform2() {
  if (process.platform === "win32") return `Windows ${process.arch}`;
  if (process.platform === "darwin") return `macOS ${process.arch}`;
  return `${process.platform} ${process.arch}`;
}

// src/task-runner.ts
import { randomUUID as randomUUID3 } from "node:crypto";
import { mkdir as mkdir2, readFile as readFile3, writeFile as writeFile2 } from "node:fs/promises";
import { join as join3 } from "node:path";
var TASK_TIMEOUT_MS = 15 * 6e4;
var APPROVAL_TIMEOUT_S = 180;
var TaskUnavailable = class extends Error {
};
var TaskRunner = class {
  constructor(ctx, options) {
    this.ctx = ctx;
    this.options = options;
  }
  bySession = /* @__PURE__ */ new Map();
  byCall = /* @__PURE__ */ new Map();
  byConversation = /* @__PURE__ */ new Map();
  pendingApprovals = /* @__PURE__ */ new Map();
  sessions = /* @__PURE__ */ new Map();
  storePath = join3(stateDir(), "cross-device-sessions.json");
  workspace = join3(stateDir(), "cross-device");
  storeLoaded = false;
  approvalSeq = 0;
  async loadSessions() {
    if (this.storeLoaded) return;
    this.storeLoaded = true;
    try {
      const parsed = JSON.parse(await readFile3(this.storePath, "utf8"));
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === "string" && value) this.sessions.set(key, value);
      }
    } catch {
    }
  }
  async saveSessions() {
    try {
      await mkdir2(stateDir(), { recursive: true });
      await writeFile2(this.storePath, `${JSON.stringify(Object.fromEntries(this.sessions), null, 2)}
`, "utf8");
    } catch (error) {
      this.options.log("warn", `\u8DE8\u7AEF\u4F1A\u8BDD\u6620\u5C04\u4FDD\u5B58\u5931\u8D25: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  attach() {
    const on = this.ctx;
    const offEvent = on.on("session/event", (session, event) => {
      this.onSessionEvent(session, event);
    });
    const offApproval = on.on(
      "approval/request",
      (request, next) => this.onApproval(request, next),
      true
    );
    return () => {
      offEvent();
      offApproval();
      for (const run of this.byCall.values()) {
        run.reject(new Error("this computer stopped taking tasks"));
      }
    };
  }
  get running() {
    return this.byCall.size;
  }
  async task(call, args) {
    if (!this.options.canRun()) {
      throw new Error("\u672C\u673A\u6CA1\u6709\u53EF\u7528\u7684 DSH \u4F1A\u8BDD\u670D\u52A1\uFF0C\u6682\u65F6\u4E0D\u80FD\u63A5\u53D7\u8FDC\u7A0B\u4EFB\u52A1");
    }
    const text = String(args.text ?? "").trim();
    if (!text) throw new Error("\u8FDC\u7A0B\u4EFB\u52A1\u7F3A\u5C11 text");
    const controller = this.controller();
    const conversation = String(args.conversation ?? "").trim() || "cross-device";
    const sessionId = await this.sessionFor(controller, call, conversation);
    const language = String(args.language ?? "").trim();
    const runId = this.options.onStart(call, text);
    this.options.log("info", `\u6765\u81EA ${call.from.name} \u7684\u4EFB\u52A1\u8FDB\u5165\u4F1A\u8BDD ${sessionId}`);
    let resolve;
    let reject;
    const settled = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const abort = new AbortController();
    const run = {
      callId: call.id,
      call,
      sessionId,
      conversation,
      tools: /* @__PURE__ */ new Map(),
      approvals: /* @__PURE__ */ new Set(),
      final: "",
      stopped: false,
      settled: false,
      abort,
      resolve: (answer) => {
        if (run.settled) return;
        run.settled = true;
        resolve(answer);
      },
      reject: (error) => {
        if (run.settled) return;
        run.settled = true;
        reject(error);
      }
    };
    this.bySession.set(sessionId, run);
    this.byCall.set(call.id, run);
    this.byConversation.set(conversationKey(call.from.id, conversation), run);
    const timer = setTimeout(() => {
      abort.abort();
      void Promise.resolve(controller.cancel({ sessionId })).catch(() => void 0);
      run.reject(new Error("\u4EFB\u52A1\u8D85\u8FC7\u4E86 15 \u5206\u949F\u4E0A\u9650\uFF0C\u5DF2\u53D6\u6D88"));
    }, TASK_TIMEOUT_MS);
    try {
      call.event({ stage: "thinking", session: sessionId });
      const prompt = frame(call.from.name, this.options.deviceName(), text, language);
      await controller.prompt(
        {
          requestId: randomUUID3(),
          sessionId,
          mode: "queue",
          content: [{ type: "text", text: prompt }]
        },
        abort.signal
      );
      const answer = (await settled).trim();
      const result = answer || "(\u5B8C\u6210\uFF0C\u6CA1\u6709\u6587\u5B57\u56DE\u7B54)";
      this.options.onFinish(runId, "ok", result);
      return {
        text: result,
        conversation,
        thread: sessionId,
        device: this.options.deviceName()
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.options.onFinish(runId, "error", message);
      throw error;
    } finally {
      clearTimeout(timer);
      this.bySession.delete(sessionId);
      this.byCall.delete(call.id);
      this.byConversation.delete(conversationKey(call.from.id, conversation));
      for (const approval of run.approvals) this.pendingApprovals.delete(approval);
    }
  }
  /** `stop {call?}` or `stop {conversation?}` from the device that asked. */
  async stop(call, args) {
    const byCallId = String(args.call ?? "").trim();
    const conversation = String(args.conversation ?? "").trim() || "cross-device";
    const run = (byCallId ? this.byCall.get(byCallId) : void 0) ?? this.byConversation.get(conversationKey(call.from.id, conversation));
    if (!run || run.call.from.id && run.call.from.id !== call.from.id) return { stopped: false };
    run.stopped = true;
    run.abort.abort();
    await Promise.resolve(this.controller().cancel({ sessionId: run.sessionId })).catch(() => void 0);
    return { stopped: true };
  }
  /** `approve {approval_id, allow}` from the device the card travelled to. */
  approve(call, args) {
    const id = String(args.approval_id ?? "").trim();
    const decide = id ? this.pendingApprovals.get(id) : void 0;
    if (!decide) return { ok: false, approval_id: id };
    decide(args.allow === true || args.allow === "true");
    return { ok: true, approval_id: id, status: args.allow === true ? "approved" : "denied" };
  }
  dispose() {
    for (const run of this.byCall.values()) {
      run.reject(new Error("\u63D2\u4EF6\u5DF2\u505C\u6B62"));
    }
    this.byCall.clear();
    this.bySession.clear();
    this.byConversation.clear();
    this.pendingApprovals.clear();
  }
  controller() {
    const service = this.ctx.get("sessionController");
    if (!service || typeof service.create !== "function") throw new TaskUnavailable("\u672C\u673A\u6CA1\u6709\u53EF\u7528\u7684 DSH \u4F1A\u8BDD\u670D\u52A1");
    return service;
  }
  async sessionFor(controller, call, conversation) {
    const key = conversationKey(call.from.id, conversation);
    const previous = this.byConversation.get(key);
    if (previous) {
      throw new Error("\u8FD9\u4E2A\u8BBE\u5907\u7684\u4E0A\u4E00\u9879\u4EFB\u52A1\u8FD8\u5728\u8FD0\u884C\uFF0C\u8BF7\u7A0D\u540E\u518D\u53D1");
    }
    await this.loadSessions();
    await mkdir2(this.workspace, { recursive: true }).catch(() => void 0);
    const existing = this.sessions.get(key);
    if (existing) {
      try {
        const adopted = await controller.create({ sessionId: existing, cwd: this.workspace });
        return adopted.sessionId;
      } catch {
        this.sessions.delete(key);
        await this.saveSessions();
      }
    }
    const created = await controller.create({ cwd: this.workspace });
    const sessionId = created.sessionId;
    this.sessions.set(key, sessionId);
    await this.saveSessions();
    await controller.rename({ sessionId, title: `\u8DE8\u7AEF \xB7 ${call.from.name || call.from.id}` }).catch(() => void 0);
    return sessionId;
  }
  onSessionEvent(session, event) {
    const sessionId = String(session?.id ?? "");
    const run = this.bySession.get(sessionId);
    if (!run) return;
    const type = String(event?.type ?? "");
    const data = event?.data ?? {};
    if (type === "tool/call") {
      const callId = String(data.callId ?? "");
      const name2 = String(data.name ?? "tool");
      const args = String(data.arguments ?? "");
      run.tools.set(callId, { name: name2, args });
      run.call.event({ stage: "tool", id: callId, name: name2, summary: preview(name2, args) });
      this.options.onEvent(run.callId, "tool", preview(name2, args));
      return;
    }
    if (type === "tool/result") {
      const message = data.message ?? {};
      const callId = String(message.toolCallId ?? "");
      const info = run.tools.get(callId);
      const summary = (data.error?.reason ?? textOf(message.content)).slice(0, 300);
      run.call.event({
        stage: "tool_result",
        id: callId,
        name: info?.name ?? "",
        ok: message.isError !== true,
        summary
      });
      this.options.onEvent(run.callId, "tool_result", summary || info?.name || "tool");
      return;
    }
    if (type === "assistant/message") {
      const text = textOf(data.message?.content);
      if (!text) return;
      run.final = text;
      if (data.interrupted !== true) {
        run.call.event({ stage: "text", text, interim: true });
        this.options.onEvent(run.callId, "text", text.slice(0, 300));
      }
      return;
    }
    if (type === "turn/end") {
      const reason = data.reason ?? {};
      if (reason.kind === "error") {
        const message = String(reason.error?.message ?? "\u6A21\u578B\u6267\u884C\u5931\u8D25");
        run.call.event({ stage: "error", message });
        run.reject(new Error(message));
      } else if (reason.kind === "aborted") {
        if (run.stopped) run.reject(new Error("\u4EFB\u52A1\u5DF2\u88AB\u53D1\u8D77\u8BBE\u5907\u505C\u6B62"));
        else run.resolve(run.final || "(\u5DF2\u505C\u6B62)");
      } else {
        run.resolve(run.final);
      }
    }
  }
  async onApproval(request, next) {
    const agentId = String(request?.agent?.id ?? request?.sessionId ?? "");
    const run = this.bySession.get(agentId);
    if (!run || !this.options.relayApprovals()) return next();
    this.approvalSeq += 1;
    const id = `ap_${Date.now().toString(36)}${this.approvalSeq.toString(36)}`;
    const toolCallId = String(request?.callId ?? "");
    const tool = toolCallId ? run.tools.get(toolCallId) : void 0;
    const display = request?.displayReason?.en ?? request?.displayReason?.zh ?? request?.reason ?? request?.toolName ?? "";
    run.approvals.add(id);
    run.call.event({
      stage: "approval",
      approval_id: id,
      preview: tool ? preview(tool.name, tool.args) : String(request?.toolName ?? "tool"),
      risk: "moderate",
      reason: String(display),
      device: this.options.deviceName(),
      timeout: APPROVAL_TIMEOUT_S
    });
    this.options.onEvent(run.callId, "approval", String(display || request?.toolName || "\u9700\u8981\u6279\u51C6"));
    const decision = await new Promise((resolve) => {
      let done = false;
      const finish = (value) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try {
          request?.signal?.removeEventListener?.("abort", onAbort);
        } catch {
        }
        this.pendingApprovals.delete(id);
        run.approvals.delete(id);
        resolve(value);
      };
      const onAbort = () => finish("cancelled");
      const timer = setTimeout(() => finish("denied"), APPROVAL_TIMEOUT_S * 1e3);
      try {
        request?.signal?.addEventListener?.("abort", onAbort, { once: true });
      } catch {
      }
      this.pendingApprovals.set(id, (allow) => finish(allow ? "allowed" : "denied"));
    });
    if (decision !== "cancelled") {
      run.call.event({ stage: "approval_result", approval_id: id, status: decision === "allowed" ? "approved" : "denied" });
    }
    if (decision === "allowed") return "allowed-once";
    if (decision === "cancelled") return "cancelled";
    return "rejected";
  }
};
function conversationKey(deviceId, conversation) {
  return `${deviceId}
${conversation}`;
}
function frame(from, here, text, language) {
  const lines = [
    `[\u8FD9\u662F\u6765\u81EA ${from} \u7684\u53E6\u4E00\u53F0\u8BBE\u5907\u3001\u901A\u8FC7 nanoMuse \u7F51\u5173\u59D4\u6258\u7684\u4EFB\u52A1\u3002\u4F60\u662F\u8FD0\u884C\u5728 ${here} \u4E0A\u7684 DSH Agent\uFF1A\u8BF7\u5728\u8FD9\u53F0\u7535\u8111\u4E0A\u5B8C\u6210\u5B83\uFF0C\u5E76\u7528\u7B80\u77ED\u7684\u4E2D\u6587\u56DE\u7B54\uFF0C\u56DE\u7B54\u4F1A\u56DE\u4F20\u7ED9 ${from}\u3002]`
  ];
  if (language) lines.push(`[\u56DE\u7B54\u8BED\u8A00\uFF1A${language}]`);
  lines.push(text);
  return lines.join("\n");
}
function textOf(content) {
  if (!Array.isArray(content)) return "";
  return content.map((block) => block && typeof block === "object" && block.type === "text" ? String(block.text ?? "") : "").filter(Boolean).join("\n").trim();
}
function preview(name2, args) {
  let shown = args.trim();
  try {
    const parsed = JSON.parse(args);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const record = parsed;
      const main = record.command ?? record.cmd ?? record.path ?? record.file_path ?? record.url ?? record.query ?? record.pattern ?? record.task ?? record.prompt;
      const first = Object.values(record).find((value) => typeof value === "string");
      shown = typeof main === "string" ? main : typeof first === "string" ? first : JSON.stringify(record);
    }
  } catch {
  }
  shown = shown.replace(/\s+/g, " ").trim();
  if (shown.length > 180) shown = `${shown.slice(0, 179)}\u2026`;
  return shown ? `${name2}: ${shown}` : name2;
}

// src/tools.ts
function registerDeviceTools(ctx, host) {
  const tools = ctx.get?.("tools");
  if (!tools || typeof tools.register !== "function") return;
  const hub = host.hub;
  const target = (reference) => {
    if (!hub.connected) {
      throw new Error("\u5F53\u524D\u672A\u8FDE\u63A5\u5230 nanoMuse \u7F51\u5173\uFF0C\u8BF7\u5728\u300C\u8BBE\u7F6E \u2192 \u8DE8\u7AEF\u4E2D\u67A2\u300D\u4E2D\u8FDE\u63A5");
    }
    const device = hub.findDevice(reference);
    if (device) {
      if (!device.online) {
        throw new Error(`\u76EE\u6807\u8BBE\u5907\u300C${device.name}\u300D\u5F53\u524D\u79BB\u7EBF\uFF0C\u8BF7\u786E\u8BA4\u5B83\u5DF2\u767B\u5F55\u540C\u4E00 nanoMuse \u8D26\u53F7\u5E76\u8054\u7F51`);
      }
      return device;
    }
    const others = hub.getOtherDevices();
    if (others.length === 0) throw new Error("\u5F53\u524D\u8D26\u53F7\u4E0B\u6682\u65E0\u5176\u4ED6\u8BBE\u5907\u8FDE\u63A5\u5230\u7F51\u5173");
    const lines = others.map((item) => `  \u2022 @${item.name} (${item.kind}, ${item.os || "\u672A\u77E5\u7CFB\u7EDF"}, ${item.online ? "\u5728\u7EBF" : "\u79BB\u7EBF"})`).join("\n");
    throw new Error(`\u672A\u627E\u5230\u76EE\u6807\u8BBE\u5907\u300C${reference ?? ""}\u300D\u3002\u5F53\u524D\u53EF\u7528\u7684\u8BBE\u5907\uFF1A
${lines}`);
  };
  tools.register({
    name: "devices",
    description: "\u5217\u51FA\u5F53\u524D nanoMuse \u8D26\u53F7\u4E0B\u8FDE\u63A5\u7684\u6240\u6709\u8BBE\u5907\uFF08\u624B\u673A\u3001\u7535\u8111\u3001\u670D\u52A1\u5668\uFF09\u53CA\u5176\u5728\u7EBF\u72B6\u6001\u3001\u7CFB\u7EDF\u4E0E\u53EF\u7528\u52A8\u4F5C\u3002\u53D1\u9001\u8DE8\u7AEF\u6D88\u606F\u6216\u59D4\u6258\u4EFB\u52A1\u524D\u5148\u7528\u5B83\u786E\u8BA4\u76EE\u6807\u3002",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false
    },
    output: {
      schema: {
        type: "object",
        properties: {
          connected: { type: "boolean" },
          this_device: { type: "string" },
          devices: { type: "array", items: { type: "object" } }
        },
        additionalProperties: false
      },
      render: (_args, value) => {
        const list = value.devices ?? [];
        if (!value.connected) return [{ type: "text", text: "\u672A\u8FDE\u63A5\u5230 nanoMuse \u7F51\u5173\u3002" }];
        if (list.length === 0) return [{ type: "text", text: "\u5F53\u524D\u8D26\u53F7\u4E0B\u6682\u65E0\u5176\u4ED6\u8BBE\u5907\u5728\u7EBF\u3002\u5728\u624B\u673A\u6216\u53E6\u4E00\u53F0\u7535\u8111\u4E0A\u767B\u5F55\u540C\u4E00\u8D26\u53F7\u5373\u53EF\u51FA\u73B0\u5728\u8FD9\u91CC\u3002" }];
        return [
          {
            type: "text",
            text: list.map(
              (device) => `- @${device.handle ?? device.name}\uFF08${device.name}\uFF0C${device.kind}\uFF0C${device.os || "\u672A\u77E5\u7CFB\u7EDF"}\uFF0C${device.online ? "\u{1F7E2} \u5728\u7EBF" : "\u26AA \u79BB\u7EBF"}\uFF09` + (device.actions?.length ? ` \xB7 \u652F\u6301: ${device.actions.join(", ")}` : "")
            ).join("\n")
          }
        ];
      }
    },
    isConcurrencySafe: () => true,
    execute: async () => {
      const list = hub.getOtherDevices();
      return {
        connected: hub.connected,
        this_device: hub.deviceName,
        devices: list.map((device) => ({
          id: device.id,
          name: device.name,
          handle: device.handle,
          mention: device.handle ? `@${device.handle}` : "",
          kind: device.kind,
          os: device.os,
          online: device.online,
          actions: device.actions
        }))
      };
    },
    presentCall: () => ({ card: "generic", title: "\u67E5\u770B\u5728\u7EBF\u8BBE\u5907", kind: "other", rawInput: {} })
  });
  tools.register({
    name: "device_send",
    description: "\u628A\u4E00\u6761\u6D88\u606F\u8F6C\u53D1\u5230\u53E6\u4E00\u53F0\u8BBE\u5907\u3002mode \u4E3A notify \u65F6\u63A8\u9001\u4E00\u6761\u63D0\u9192\uFF08\u9002\u5408\u201C\u544A\u8BC9\u624B\u673A\u2026\u201D\u201C\u63D0\u9192\u7535\u8111\u2026\u201D\uFF09\uFF1Bmode \u4E3A task \u65F6\u628A\u6574\u6BB5\u81EA\u7136\u8BED\u8A00\u4EA4\u7ED9\u90A3\u53F0\u8BBE\u5907\u4E0A\u7684 Agent \u6267\u884C\u5E76\u7B49\u5F85\u56DE\u7B54\uFF08\u9002\u5408\u201C\u8BA9\u624B\u673A\u67E5\u4E00\u4E0B\u2026\u201D\u201C\u8BA9 Ubuntu \u7F16\u8BD1\u2026\u201D\uFF09\u3002",
    parameters: {
      type: "object",
      properties: {
        device: { type: "string", description: "\u76EE\u6807\u8BBE\u5907\u540D\u79F0\u3001ID\u3001@handle\uFF0C\u6216\u5E26 @ \u7684\u8BBE\u5907\u6807\u8BC6\uFF0C\u4F8B\u5982 @\u624B\u673A\u3001@Office-PC\u3002" },
        text: { type: "string", description: "\u8981\u8F6C\u53D1\u7684\u5185\u5BB9\uFF1A\u63D0\u9192\u6B63\u6587\uFF0C\u6216\u59D4\u6258\u7ED9\u76EE\u6807 Agent \u7684\u4EFB\u52A1\u63CF\u8FF0\u3002" },
        mode: { type: "string", enum: ["notify", "task"], description: "notify \u63A8\u9001\u63D0\u9192\uFF08\u9ED8\u8BA4\uFF09\uFF1Btask \u59D4\u6258\u4EFB\u52A1\u5E76\u7B49\u5F85\u56DE\u7B54\u3002" },
        title: { type: "string", description: "notify \u6A21\u5F0F\u4E0B\u7684\u901A\u77E5\u6807\u9898\uFF0C\u9ED8\u8BA4\u201C\u6765\u81EA DSH\u201D\u3002" }
      },
      required: ["device", "text"],
      additionalProperties: false
    },
    output: {
      schema: {
        type: "object",
        properties: {
          device: { type: "string" },
          mode: { type: "string" },
          ok: { type: "boolean" },
          answer: { type: "string" }
        }
      },
      render: (_args, value) => value.mode === "task" ? [{ type: "text", text: `${value.device} \u56DE\u7B54\uFF1A
${value.answer || "(\u6CA1\u6709\u6587\u5B57\u56DE\u7B54)"}` }] : [{ type: "text", text: `\u6D88\u606F\u5DF2\u8F6C\u53D1\u81F3 ${value.device}` }]
    },
    timeoutMs: 66e4,
    execute: async (args) => {
      const device = target(args.device);
      const mode = args.mode === "task" ? "task" : "notify";
      if (mode === "notify") {
        await host.call(
          device.id,
          "notify",
          { title: args.title || "\u6765\u81EA DSH", body: args.text },
          2e4,
          void 0,
          { title: `\u8F6C\u53D1\u6D88\u606F\u5230 ${device.name}`, detail: String(args.text).slice(0, 200) }
        );
        return { device: device.name, mode, ok: true, answer: "" };
      }
      const steps = [];
      const result = await host.call(
        device.id,
        "task",
        { text: args.text, from: host.deviceName(), language: "zh-CN" },
        6e5,
        (event) => {
          const stage = String(event.stage ?? "");
          if (stage === "tool") steps.push(`[\u5DE5\u5177] ${String(event.name ?? "")}: ${String(event.summary ?? "")}`);
          else if (stage === "text") steps.push(`[\u8FC7\u7A0B] ${String(event.text ?? "").slice(0, 120)}`);
        },
        { title: `\u59D4\u6258 ${device.name} \u6267\u884C\u4EFB\u52A1`, detail: String(args.text).slice(0, 200) }
      );
      return {
        device: device.name,
        mode,
        ok: true,
        answer: String(result.text ?? result.answer ?? "").trim(),
        steps
      };
    },
    presentCall: (args) => ({
      card: "generic",
      title: `\u8F6C\u53D1\u5230 ${args.device || "\u8FDC\u7A0B\u8BBE\u5907"}: ${String(args.text ?? "").slice(0, 60)}`,
      kind: "other",
      rawInput: args
    })
  });
  tools.register({
    name: "delegate",
    description: "\u5411\u7F51\u5173\u8FDE\u63A5\u7684\u8FDC\u7A0B\u8BBE\u5907\uFF08\u652F\u6301 @\u8BBE\u5907\u540D\uFF0C\u5982 @Ubuntu\u3001@Office-PC\u3001@\u624B\u673A\uFF09\u59D4\u6258\u5B8C\u6574\u7684 Agent \u4EFB\u52A1\uFF0C\u7531\u76EE\u6807\u7AEF\u81EA\u4E3B\u8FD0\u884C\u5E76\u5B9E\u65F6\u56DE\u4F20\u6267\u884C\u6B65\u9AA4\u4E0E\u6700\u7EC8\u7B54\u590D\u3002",
    parameters: {
      type: "object",
      properties: {
        device: { type: "string", description: "\u76EE\u6807\u8BBE\u5907\u540D\u79F0\u3001ID \u6216 @\u8BBE\u5907\u540D\u3002" },
        task: { type: "string", description: "\u59D4\u6258\u7ED9\u76EE\u6807\u8BBE\u5907\u7684\u5177\u4F53\u4EFB\u52A1\u6216\u81EA\u7136\u8BED\u8A00\u9700\u6C42\u3002" },
        timeout: { type: "integer", description: "\u7B49\u5F85\u79D2\u6570\uFF0C\u9ED8\u8BA4 300\uFF0C\u6700\u5927 600\u3002" }
      },
      required: ["device", "task"],
      additionalProperties: false
    },
    output: {
      schema: {
        type: "object",
        properties: {
          target_device: { type: "string" },
          answer: { type: "string" },
          steps: { type: "array", items: { type: "string" } }
        }
      },
      render: (_args, value) => {
        const parts = [`${value.target_device} \u56DE\u590D\uFF1A
${value.answer}`];
        if (value.steps?.length) parts.push(`
\u6267\u884C\u6B65\u9AA4\uFF1A
${value.steps.join("\n")}`);
        return [{ type: "text", text: parts.join("\n") }];
      }
    },
    timeoutMs: 66e4,
    execute: async (args) => {
      const device = target(args.device);
      const timeout = Math.min(Math.max(Number(args.timeout ?? 300) || 300, 10), 600);
      const steps = [];
      const result = await host.call(
        device.id,
        "task",
        { text: args.task, from: host.deviceName(), language: "zh-CN" },
        timeout * 1e3,
        (event) => {
          const stage = String(event.stage ?? "");
          if (stage === "tool") steps.push(`[\u5DE5\u5177] ${String(event.name ?? "")}: ${String(event.summary ?? "")}`);
          else if (stage === "tool_result") steps.push(`[\u7ED3\u679C] ${String(event.summary ?? "").slice(0, 160)}`);
          else if (stage === "text") steps.push(`[\u8FC7\u7A0B] ${String(event.text ?? "").slice(0, 160)}`);
          else if (stage === "error") steps.push(`[\u9519\u8BEF] ${String(event.message ?? "")}`);
        },
        { title: `\u59D4\u6258 ${device.name} \u6267\u884C\u4EFB\u52A1`, detail: String(args.task).slice(0, 200) }
      );
      return {
        target_device: device.name,
        answer: String(result.text ?? result.answer ?? "\u4EFB\u52A1\u6267\u884C\u5B8C\u6210").trim(),
        steps: steps.slice(-15)
      };
    },
    presentCall: (args) => ({
      card: "generic",
      title: `\u59D4\u6258 ${args.device || "\u8FDC\u7A0B\u8BBE\u5907"} \u6267\u884C\u4EFB\u52A1`,
      kind: "other",
      rawInput: args
    })
  });
  tools.register({
    name: "device_shell",
    description: "\u5728\u6307\u5B9A\u7684\u8FDC\u7A0B\u8BBE\u5907\uFF08\u670D\u52A1\u5668\u3001\u53E6\u4E00\u53F0\u7535\u8111\u6216\u624B\u673A\u6C99\u7BB1\uFF09\u4E0A\u6267\u884C\u4E00\u6761 shell \u547D\u4EE4\u5E76\u8FD4\u56DE stdout/stderr\u3002",
    parameters: {
      type: "object",
      properties: {
        device: { type: "string", description: "\u76EE\u6807\u8BBE\u5907\u540D\u79F0\u3001ID \u6216 @\u8BBE\u5907\u540D\u3002\u7559\u7A7A\u65F6\u4F7F\u7528\u552F\u4E00\u7684\u5176\u4ED6\u8BBE\u5907\u3002" },
        command: { type: "string", description: "\u8981\u6267\u884C\u7684 shell \u547D\u4EE4" },
        cwd: { type: "string", description: "\u8FDC\u7A0B\u5DE5\u4F5C\u76EE\u5F55" },
        timeout: { type: "integer", description: "\u6267\u884C\u8D85\u65F6\u79D2\u6570\uFF0C\u9ED8\u8BA4 60\uFF0C\u6700\u5927 180\u3002" }
      },
      required: ["command"],
      additionalProperties: false
    },
    output: {
      schema: {
        type: "object",
        properties: {
          device: { type: "string" },
          exit_code: { type: "integer" },
          stdout: { type: "string" },
          stderr: { type: "string" },
          timed_out: { type: "boolean" }
        }
      },
      render: (_args, value) => {
        const parts = [`[${value.device}] \u9000\u51FA\u7801: ${value.exit_code}`];
        if (value.stdout) parts.push(value.stdout);
        if (value.stderr) parts.push(`stderr:
${value.stderr}`);
        return [{ type: "text", text: parts.join("\n") }];
      }
    },
    timeoutMs: 2e5,
    execute: async (args) => {
      const device = target(args.device);
      const timeout = Math.min(Math.max(Number(args.timeout ?? 60) || 60, 1), 180);
      const result = await host.call(
        device.id,
        "shell",
        { command: args.command, cwd: args.cwd, timeout },
        (timeout + 15) * 1e3,
        void 0,
        { title: `\u5728 ${device.name} \u6267\u884C\u547D\u4EE4`, detail: String(args.command).slice(0, 200) }
      );
      return {
        device: device.name,
        exit_code: Number(result.exit_code ?? 0),
        stdout: String(result.stdout ?? ""),
        stderr: String(result.stderr ?? ""),
        timed_out: Boolean(result.timed_out)
      };
    },
    presentCall: (args) => ({
      card: "generic",
      title: `\u5728 ${args.device || "\u8FDC\u7A0B\u8BBE\u5907"} \u6267\u884C: ${String(args.command ?? "").slice(0, 80)}`,
      kind: "other",
      rawInput: args
    })
  });
  tools.register({
    name: "device_screen",
    description: "\u83B7\u53D6\u6307\u5B9A\u8FDC\u7A0B\u8BBE\u5907\uFF08\u624B\u673A\u6216\u7535\u8111\uFF09\u5F53\u524D\u7684\u5C4F\u5E55\u622A\u56FE\u3002\u624B\u673A\u4E0A\u9700\u8981\u5F00\u542F\u65E0\u969C\u788D/Hands \u80FD\u529B\u3002",
    parameters: {
      type: "object",
      properties: {
        device: { type: "string", description: "\u76EE\u6807\u8BBE\u5907\u540D\u79F0\u6216 ID\uFF0C\u7559\u7A7A\u65F6\u4F7F\u7528\u552F\u4E00\u7684\u5176\u4ED6\u8BBE\u5907\u3002" }
      },
      additionalProperties: false
    },
    output: {
      schema: {
        type: "object",
        properties: {
          device: { type: "string" },
          width: { type: "integer" },
          height: { type: "integer" },
          mime: { type: "string" },
          bytes: { type: "integer" }
        }
      },
      render: (_args, value) => [
        { type: "text", text: `\u5DF2\u83B7\u53D6 ${value.device} \u7684\u5C4F\u5E55\u622A\u56FE (${value.width}\xD7${value.height}, ${value.mime})` }
      ]
    },
    timeoutMs: 45e3,
    execute: async (args) => {
      const device = target(args.device);
      const result = await host.call(device.id, "screen", {}, 3e4, void 0, {
        title: `\u622A\u53D6 ${device.name} \u5C4F\u5E55`
      });
      return {
        device: device.name,
        width: Number(result.width ?? 0),
        height: Number(result.height ?? 0),
        mime: String(result.mime ?? "image/png"),
        bytes: Number(result.bytes ?? (typeof result.data === "string" ? Math.round(result.data.length * 3 / 4) : 0))
      };
    },
    presentCall: (args) => ({ card: "generic", title: `\u622A\u53D6 ${args.device || "\u8FDC\u7A0B\u8BBE\u5907"} \u5C4F\u5E55`, kind: "other", rawInput: args })
  });
  tools.register({
    name: "device_notify",
    description: "\u5411\u6307\u5B9A\u7684\u8FDC\u7A0B\u8BBE\u5907\uFF08\u624B\u673A\u6216\u7535\u8111\u684C\u9762\uFF09\u63A8\u9001\u4E00\u6761\u7CFB\u7EDF\u63D0\u9192\u3002",
    parameters: {
      type: "object",
      properties: {
        device: { type: "string", description: "\u76EE\u6807\u8BBE\u5907\u540D\u79F0\u3001ID \u6216 @\u8BBE\u5907\u540D\u3002" },
        title: { type: "string", description: "\u901A\u77E5\u6807\u9898" },
        body: { type: "string", description: "\u901A\u77E5\u6B63\u6587" }
      },
      required: ["title", "body"],
      additionalProperties: false
    },
    output: {
      schema: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
          device: { type: "string" }
        }
      },
      render: (_args, value) => [{ type: "text", text: `\u901A\u77E5\u5DF2\u53D1\u9001\u81F3 ${value.device}` }]
    },
    timeoutMs: 25e3,
    execute: async (args) => {
      const device = target(args.device);
      await host.call(device.id, "notify", { title: args.title, body: args.body }, 15e3, void 0, {
        title: `\u901A\u77E5 ${device.name}`,
        detail: String(args.body).slice(0, 200)
      });
      return { ok: true, device: device.name };
    },
    presentCall: (args) => ({
      card: "generic",
      title: `\u5411 ${args.device || "\u8FDC\u7A0B\u8BBE\u5907"} \u53D1\u9001\u901A\u77E5: ${args.title}`,
      kind: "other",
      rawInput: args
    })
  });
  tools.register({
    name: "device_open",
    description: "\u5728\u6307\u5B9A\u8FDC\u7A0B\u8BBE\u5907\u4E0A\u7528\u9ED8\u8BA4\u6D4F\u89C8\u5668\u6253\u5F00 URL \u6216\u542F\u52A8\u5E94\u7528\u3002",
    parameters: {
      type: "object",
      properties: {
        device: { type: "string", description: "\u76EE\u6807\u8BBE\u5907\u540D\u79F0\u3001ID \u6216 @\u8BBE\u5907\u540D\u3002" },
        url: { type: "string", description: "\u8981\u6253\u5F00\u7684\u7F51\u9875 URL" },
        app: { type: "string", description: "\u8981\u542F\u52A8\u7684\u5E94\u7528\u6807\u8BC6\u6216\u5305\u540D" }
      },
      additionalProperties: false
    },
    output: {
      schema: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
          device: { type: "string" }
        }
      },
      render: (_args, value) => [{ type: "text", text: `\u5DF2\u5728 ${value.device} \u6253\u5F00\u76EE\u6807\u94FE\u63A5/\u5E94\u7528` }]
    },
    timeoutMs: 25e3,
    execute: async (args) => {
      const device = target(args.device);
      await host.call(device.id, "open", { url: args.url, app: args.app }, 15e3, void 0, {
        title: `\u5728 ${device.name} \u6253\u5F00`,
        detail: String(args.url ?? args.app ?? "")
      });
      return { ok: true, device: device.name };
    },
    presentCall: (args) => ({
      card: "generic",
      title: `\u5728 ${args.device || "\u8FDC\u7A0B\u8BBE\u5907"} \u6253\u5F00: ${args.url || args.app}`,
      kind: "other",
      rawInput: args
    })
  });
}

// src/index.ts
var name = "dsh-gateway";
var API_PREFIX = "/nanomuse/gateway";
var PLUGIN_VERSION = "0.3.2";
var BODY_LIMIT = 2 * 1024 * 1024;
var JOB_LIMIT = 16;
var ACTIVITY_LIMIT = 240;
var HttpError = class extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.name = "HttpError";
  }
};
var GatewayPluginService = class extends Service {
  static inject = ["webServer"];
  hub;
  row;
  stored = { version: 1 };
  effective;
  feed = new ActivityLog(ACTIVITY_LIMIT);
  runner;
  actions;
  jobs = /* @__PURE__ */ new Map();
  mentionRecords = [];
  seenUserMessages = /* @__PURE__ */ new Set();
  gatewayInfo = null;
  gatewayInfoAt = 0;
  lastHubState = "idle";
  lastDevices = /* @__PURE__ */ new Map();
  initialized = false;
  constructor(ctx, config = {}) {
    super(ctx, "dshGateway");
    this.row = config && typeof config === "object" ? config : {};
    this.effective = resolveEffective(this.row, this.stored);
    this.hub = new HubClient({
      baseURL: this.effective.baseURL,
      token: this.effective.apiKey,
      deviceId: this.effective.deviceId,
      deviceName: this.effective.deviceName,
      actions: [],
      version: PLUGIN_VERSION,
      onState: (state, detail) => this.onHubState(state, detail),
      onDevices: (devices, changed) => this.onDevices(devices, changed),
      onIncoming: (call) => this.onIncoming(call),
      onLog: (level, text) => this.log(level, text)
    });
    this.runner = new TaskRunner(ctx, {
      deviceName: () => this.effective.deviceName,
      relayApprovals: () => this.effective.prefs.relayApprovals,
      canRun: () => Boolean(this.ctx.get("sessionController")),
      log: (level, text) => this.log(level, text),
      onStart: (call, text) => this.taskStarted(call, text),
      onEvent: (id, stage, text) => this.taskEvent(id, stage, text),
      onFinish: (id, status, text) => this.taskFinished(id, status, text)
    });
    this.actions = new DeviceActions({
      deviceName: () => this.effective.deviceName,
      prefs: () => this.effective.prefs,
      taskRunner: () => this.runner,
      activity: () => this.feed,
      log: (level, text) => this.log(level, text),
      workingDirectory: () => process.cwd()
    });
    void this.init();
  }
  async init() {
    this.stored = await readState();
    this.effective = resolveEffective(this.row, this.stored);
    if (!this.stored.deviceId) {
      this.stored.deviceId = this.effective.deviceId;
      await this.persist();
    }
    const actions = this.computeActions();
    this.hub.updateOptions({
      baseURL: this.effective.baseURL,
      token: this.effective.apiKey,
      deviceId: this.effective.deviceId,
      deviceName: this.effective.deviceName,
      actions
    });
    this.hub.setActions(actions);
    const detachRunner = this.runner.attach();
    const detachMentions = this.attachMentionListener();
    registerDeviceTools(this.ctx, {
      hub: this.hub,
      deviceName: () => this.effective.deviceName,
      call: (to, action, args, timeoutMs, onEvent, meta) => this.callDevice(to, action, args, timeoutMs, onEvent, meta)
    });
    this.registerSystemPrompt();
    this.registerRoutes();
    this.ctx.effect(
      () => () => {
        detachRunner();
        detachMentions();
        this.hub.close();
        this.runner.dispose();
      },
      "dsh-gateway: lifecycle"
    );
    if (this.effective.apiKey && this.effective.prefs.autoConnect) this.hub.start();
    if (this.effective.prefs.autoSyncToNanomuse && this.effective.apiKey) this.applyGatewayToNanomuse();
    this.initialized = true;
    this.log("info", `\u8DE8\u7AEF\u4E2D\u67A2\u5DF2\u5C31\u7EEA\uFF0C\u8BBE\u5907\uFF1A${this.effective.deviceName}`);
  }
  // ── agent surface ───────────────────────────────────────────────────
  registerSystemPrompt() {
    this.ctx.inject(["systemPrompt"], (ctx) => {
      ctx.effect(
        () => ctx.systemPrompt.context({
          name: "dsh-gateway-devices",
          order: 55,
          text: () => this.promptText()
        }),
        "dsh-gateway: systemPrompt"
      );
    });
  }
  promptText() {
    if (!this.hub.connected) {
      return [
        "### nanoMuse \u8DE8\u7AEF\u4E2D\u67A2",
        `\u7F51\u5173\uFF1A\u672A\u8FDE\u63A5\uFF08${this.effective.baseURL}\uFF09\u3002\u5728\u672C\u673A\u300C\u8BBE\u7F6E \u2192 \u8DE8\u7AEF\u4E2D\u67A2\u300D\u4E2D\u8FDE\u63A5\u540E\uFF0C\u53EF\u4EE5\u4F7F\u7528 devices\u3001device_send\u3001delegate \u7B49\u5DE5\u5177\u4E0E\u624B\u673A\u548C\u5176\u4ED6\u7535\u8111\u534F\u4F5C\u3002`
      ].join("\n");
    }
    const others = this.hub.getOtherDevices();
    const lines = others.map(
      (device) => `- @${device.handle ?? device.name}\uFF08${device.name}\uFF0CID: ${device.id}\uFF0C${device.kind}\uFF0C${device.os || "\u672A\u77E5\u7CFB\u7EDF"}\uFF0C${device.online ? "\u5728\u7EBF" : "\u79BB\u7EBF"}\uFF0C\u52A8\u4F5C: ${device.actions.join(", ") || "\u65E0"}\uFF09`
    );
    return [
      "### nanoMuse \u8DE8\u7AEF\u4E2D\u67A2",
      `\u7F51\u5173\u5DF2\u8FDE\u63A5\uFF08${this.effective.baseURL}\uFF09\uFF0C\u672C\u673A\u662F\u300C${this.effective.deviceName}\u300D\u3002`,
      others.length ? "\u5F53\u524D\u8D26\u53F7\u4E0B\u7684\u5176\u4ED6\u8BBE\u5907\uFF1A" : "\u5F53\u524D\u8D26\u53F7\u4E0B\u6682\u65E0\u5176\u4ED6\u8BBE\u5907\u3002",
      ...lines,
      "",
      "\u8DE8\u7AEF\u534F\u4F5C\u89C4\u5219\uFF1A",
      "1. \u7528\u6237\u6D88\u606F\u91CC\u5199\u4E86 `@\u8BBE\u5907\u540D`\uFF08\u4F8B\u5982 @\u624B\u673A\u3001@Office-PC\uFF09\u65F6\uFF0C\u63D2\u4EF6\u5728\u6A21\u578B\u770B\u5230\u6D88\u606F\u4E4B\u524D\u5C31\u5DF2\u7ECF\u628A\u5185\u5BB9\u6295\u9012\u5230\u90A3\u53F0\u8BBE\u5907\uFF1B\u4E0D\u8981\u518D\u7528 device_send/delegate \u91CD\u590D\u6295\u9012\u3002",
      '2. \u7528\u6237\u6CA1\u6709\u4F7F\u7528 @\u3001\u800C\u662F\u660E\u786E\u8BF4\u201C\u544A\u8BC9\u624B\u673A\u2026\u201D\u201C\u63D0\u9192\u7535\u8111\u2026\u201D\u65F6\uFF0C\u7528 `device_send`\uFF0Cmode="notify"\uFF1B\u8BF4\u201C\u8BA9\u624B\u673A/\u53E6\u4E00\u53F0\u7535\u8111\u505A\u2026\u201D\u65F6\u7528 mode="task" \u6216 `delegate`\u3002',
      "3. \u9700\u8981\u8FDC\u7A0B\u547D\u4EE4\u3001\u622A\u56FE\u6216\u6253\u5F00\u94FE\u63A5\u65F6\uFF0C\u5206\u522B\u7528 `device_shell`\u3001`device_screen`\u3001`device_open`\uFF0C\u76EE\u6807\u8BBE\u5907\u53EF\u80FD\u56E0\u6743\u9650\u62D2\u7EDD\u3002",
      "4. \u5148\u7528 `devices` \u786E\u8BA4\u8BBE\u5907\u540D\u6216 `@handle`\uFF1B\u5BF9\u65B9\u8BBE\u5907\u79BB\u7EBF\u65F6\u4E0D\u8981\u5047\u88C5\u5DF2\u53D1\u9001\u3002",
      "5. \u5176\u4ED6\u8BBE\u5907\u53D1\u6765\u7684 task \u4F1A\u8FDB\u5165\u672C\u673A\u4E13\u95E8\u7684\u5DE5\u4F5C\u533A `cross-device`\uFF0C\u5E76\u590D\u7528\u540C\u4E00\u53F0\u8BBE\u5907\u7684\u4F1A\u8BDD\u300C\u8DE8\u7AEF \xB7 <\u8BBE\u5907>\u300D\uFF1B\u7B54\u6848\u4F1A\u56DE\u4F20\u7ED9\u5BF9\u65B9\u3002"
    ].join("\n");
  }
  // ── @device mentions ─────────────────────────────────────────────────
  attachMentionListener() {
    const on = this.ctx;
    return on.on(
      "agent/pre-step",
      async (payload, next) => {
        const decision = await next();
        if (!decision || decision.kind === "reject") return decision;
        const messages = Array.isArray(decision.messages) ? decision.messages : [];
        const pending = [];
        for (const message of messages) {
          const id = String(message?.id ?? "");
          if (!id || this.seenUserMessages.has(id)) continue;
          const text = contentText(message?.content);
          if (!text) continue;
          if (text.startsWith("[\u8FD9\u662F\u6765\u81EA") || text.startsWith("[\u6765\u81EA\u8FDC\u7A0B\u8BBE\u5907") || text.startsWith("[\u672C\u5730\u63D0\u793A]") || text.startsWith("[\u8DE8\u7AEF\u8FD4\u56DE") || text.startsWith("Current runtime context") || text.startsWith("### nanoMuse \u8DE8\u7AEF\u4E2D\u67A2")) {
            continue;
          }
          const targets = this.parseMentions(text);
          if (targets.length === 0) continue;
          this.seenUserMessages.add(id);
          if (this.seenUserMessages.size > 500) {
            const first = this.seenUserMessages.values().next().value;
            if (first) this.seenUserMessages.delete(first);
          }
          pending.push({ id, text, targets });
        }
        if (pending.length === 0 || payload.signal?.aborted) return decision;
        const sessionId = String(payload.agent?.session?.id ?? "");
        const answers = [];
        for (const item of pending) {
          try {
            const record = await this.forwardMention({ sessionId, text: item.text, targets: item.targets });
            const lines = record.results.map(
              (result) => `@${result.handle}: ${result.status === "ok" ? result.reply || "\u5DF2\u9001\u8FBE" : result.error || "\u5931\u8D25"}`
            );
            answers.push(`[\u8DE8\u7AEF\u8FD4\u56DE \xB7 ${item.targets.map((target) => `@${target.handle}`).join(" ")}]
${lines.join("\n")}`);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            answers.push(`[\u8DE8\u7AEF\u8FD4\u56DE\u5931\u8D25]
${message}`);
          }
        }
        if (answers.length === 0) return decision;
        const injected = {
          id: randomUUID4(),
          role: "user",
          content: [{ type: "text", text: answers.join("\n\n") }],
          source: { kind: "user", rpcId: `gateway-mention-${Date.now()}` }
        };
        return { ...decision, messages: [...messages, injected] };
      },
      true
    );
  }
  /** The devices a message mentions, matched case-insensitively by their composer handle. */
  parseMentions(text) {
    const devices = this.hub.getOtherDevices();
    const map = new Map(devices.map((device) => [String(device.handle ?? "").toLowerCase(), device]));
    const found = /* @__PURE__ */ new Map();
    const pattern = /@([\p{L}\p{N}_-]+)/gu;
    for (const match of String(text ?? "").matchAll(pattern)) {
      const key = String(match[1] ?? "").toLowerCase();
      if (!key || found.has(key)) continue;
      const device = map.get(key);
      if (!device) continue;
      found.set(key, {
        id: device.id,
        name: device.name,
        handle: device.handle ?? device.name,
        online: device.online,
        action: device.actions.includes("task") ? "task" : "notify"
      });
    }
    return [...found.values()];
  }
  stripMentionTokens(text, targets) {
    const handles = new Set(targets.map((target) => target.handle.toLowerCase()));
    if (handles.size === 0) return text;
    return String(text ?? "").replace(/@([\p{L}\p{N}_-]+)/gu, (full, token) => handles.has(token.toLowerCase()) ? " " : full).replace(/[ \t]{2,}/gu, " ").trim();
  }
  async forwardMention(input) {
    const body = this.stripMentionTokens(input.text, input.targets) || input.text;
    const record = {
      id: `m_${randomUUID4().slice(0, 8)}`,
      time: Date.now(),
      sessionId: input.sessionId,
      origin: this.effective.deviceName,
      text: body,
      targets: input.targets,
      results: input.targets.map((target) => ({
        handle: target.handle,
        name: target.name,
        status: "sending",
        action: target.action
      })),
      status: "sending"
    };
    this.mentionRecords.unshift(record);
    if (this.mentionRecords.length > 60) this.mentionRecords.length = 60;
    const activity = this.feed.add({
      direction: "out",
      action: "mention",
      status: "running",
      deviceId: input.targets[0]?.id,
      deviceName: input.targets.map((target) => `@${target.handle}`).join(" "),
      title: `@\u63D0\u53CA\u6295\u9012 \xB7 ${input.targets.map((target) => `@${target.handle}`).join(" ")}`,
      detail: body.slice(0, 300)
    });
    if (!this.hub.connected) {
      record.status = "error";
      record.error = "\u7F51\u5173\u672A\u8FDE\u63A5";
      for (const result of record.results) Object.assign(result, { status: "error", error: record.error });
      this.feed.update(activity.id, { status: "error", detail: `${body}
${record.error}`.slice(-700) });
      return record;
    }
    const settle = (handle, patch) => {
      const result = record.results.find((item) => item.handle === handle);
      if (result) Object.assign(result, patch);
      const states = record.results.map((item) => item.status);
      if (states.every((status) => status === "ok")) record.status = "done";
      else if (states.every((status) => status === "error")) record.status = "error";
      else if (states.some((status) => status === "ok") && states.some((status) => status === "error")) record.status = "partial";
    };
    await Promise.all(
      input.targets.map(async (target) => {
        const started = Date.now();
        if (!target.online) {
          settle(target.handle, { status: "error", error: "\u8BBE\u5907\u79BB\u7EBF", durationMs: 0 });
          return;
        }
        try {
          const result = target.action === "task" ? await this.hub.call(
            target.id,
            "task",
            { text: body, from: this.effective.deviceName, language: "zh-CN" },
            3e5
          ) : await this.hub.call(target.id, "notify", { title: "\u6765\u81EA DSH", body }, 2e4);
          const reply = target.action === "task" ? String(result.text ?? result.answer ?? "").trim() : String(result.text ?? result.message ?? "").trim();
          settle(target.handle, { status: "ok", reply, durationMs: Date.now() - started });
        } catch (error) {
          settle(target.handle, {
            status: "error",
            error: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - started
          });
        }
      })
    );
    const summary = record.results.map((result) => `@${result.handle}: ${result.status === "ok" ? result.reply || "\u5DF2\u9001\u8FBE" : result.error || "\u5931\u8D25"}`).join("\n");
    this.feed.update(activity.id, {
      status: record.status === "done" ? "ok" : record.status === "partial" ? "error" : "error",
      detail: `${body}
${summary}`.slice(-700)
    });
    this.log("info", `@\u63D0\u53CA\u6295\u9012\u5B8C\u6210\uFF1A${summary.replace(/\n/g, " | ").slice(0, 160)}`);
    return record;
  }
  mentionPayload(limit = 20) {
    const size = Math.max(1, Math.min(Number(limit) || 20, this.mentionRecords.length || 1));
    return { connected: this.hub.connected, items: this.mentionRecords.slice(0, size) };
  }
  // ── incoming ────────────────────────────────────────────────────────
  onHubState(state, detail) {
    if (state === "connected" && this.lastHubState !== "connected") {
      this.feed.add({
        direction: "system",
        action: "connect",
        status: "ok",
        title: "\u5DF2\u8FDE\u63A5 nanoMuse \u7F51\u5173",
        detail: this.effective.baseURL
      });
      this.gatewayInfoAt = 0;
      void this.refreshGatewayInfo();
    } else if (state === "unauthorized" && this.lastHubState !== "unauthorized") {
      this.feed.add({
        direction: "system",
        action: "auth",
        status: "error",
        title: "\u7F51\u5173\u62D2\u7EDD\u4E86\u5F53\u524D\u51ED\u636E",
        detail
      });
    } else if (state === "idle" && this.lastHubState === "connected") {
      this.feed.add({
        direction: "system",
        action: "disconnect",
        status: "info",
        title: "\u5DF2\u65AD\u5F00 nanoMuse \u7F51\u5173",
        detail
      });
    }
    this.lastHubState = state;
  }
  onDevices(devices, changed) {
    if (!changed) return;
    const next = new Map(devices.map((device) => [device.id, device]));
    if (this.lastDevices.size > 0) {
      for (const [id, device] of next) {
        const previous = this.lastDevices.get(id);
        if (previous && previous.online !== device.online) {
          this.feed.add({
            direction: "system",
            action: device.online ? "device-online" : "device-offline",
            status: device.online ? "ok" : "info",
            deviceId: id,
            deviceName: device.name,
            title: `${device.name} ${device.online ? "\u4E0A\u7EBF\u4E86" : "\u79BB\u7EBF\u4E86"}`
          });
        }
      }
    }
    this.lastDevices = next;
  }
  onIncoming(call) {
    this.log("info", `\u6765\u81EA ${call.from.name} \u7684 ${call.action}`);
    return this.actions.handle(call);
  }
  taskStarted(call, text) {
    const item = this.feed.add({
      direction: "in",
      action: "task",
      status: "running",
      deviceId: call.from.id,
      deviceName: call.from.name,
      callId: call.id,
      title: `\u6765\u81EA ${call.from.name} \u7684\u4EFB\u52A1`,
      detail: text.slice(0, 300)
    });
    return item.id;
  }
  taskEvent(id, stage, text) {
    const item = this.feed.since(0).find((entry) => entry.id === id);
    if (!item) return;
    this.feed.update(id, {
      detail: `${item.detail ? `${item.detail.split("\n")[0]}
` : ""}${stage}: ${text}`.slice(-500)
    });
  }
  taskFinished(id, status, text) {
    const item = this.feed.since(0).find((entry) => entry.id === id);
    this.feed.update(id, {
      status,
      detail: `${item?.detail ? `${item.detail.split("\n")[0]}
` : ""}${text}`.slice(-700)
    });
  }
  // ── calls ───────────────────────────────────────────────────────────
  async callDevice(to, action, args, timeoutMs = 3e4, onEvent, meta) {
    const device = this.hub.findDevice(to);
    const targetId = device?.id ?? to;
    const targetName = device?.name ?? to;
    if (!targetId) throw new Error("\u7F3A\u5C11\u76EE\u6807\u8BBE\u5907");
    if (targetId === this.hub.deviceId) throw new Error("\u4E0D\u80FD\u5411\u672C\u673A\u8F6C\u53D1");
    const item = this.feed.add({
      direction: "out",
      action,
      status: "running",
      deviceId: targetId,
      deviceName: targetName,
      title: meta?.title || `\u5411 ${targetName} \u53D1\u9001 ${action}`,
      detail: meta?.detail
    });
    try {
      const result = await this.hub.call(targetId, action, args, timeoutMs, onEvent);
      this.feed.update(item.id, { status: "ok", detail: joinDetail(item.detail, summarizeResult(result)) });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.feed.update(item.id, { status: "error", detail: joinDetail(item.detail, message) });
      throw error;
    }
  }
  startForward(input) {
    if (!this.hub.connected) throw new HttpError(409, "\u7F51\u5173\u672A\u8FDE\u63A5\uFF0C\u8BF7\u5148\u5728\u8BBE\u7F6E\u4E2D\u8FDE\u63A5");
    const device = this.hub.findDevice(input.to);
    if (!device) throw new HttpError(404, `\u672A\u627E\u5230\u8BBE\u5907\u300C${input.to}\u300D`);
    if (!device.online) throw new HttpError(409, `\u8BBE\u5907\u300C${device.name}\u300D\u5F53\u524D\u79BB\u7EBF`);
    const timeout = input.mode === "task" ? Math.min(Math.max(input.timeout ?? 6e5, 1e4), 9e5) : 25e3;
    const job = {
      id: `f_${randomUUID4().slice(0, 8)}`,
      at: Date.now(),
      to: device.id,
      deviceName: device.name,
      mode: input.mode,
      text: input.text,
      title: input.title,
      status: "running",
      events: []
    };
    this.jobs.set(job.id, job);
    this.trimJobs();
    const action = input.mode === "task" ? "task" : "notify";
    const args = input.mode === "task" ? { text: input.text, from: this.effective.deviceName, language: "zh-CN" } : { title: input.title || "\u6765\u81EA DSH", body: input.text };
    const activity = this.feed.add({
      direction: "out",
      action,
      status: "running",
      deviceId: device.id,
      deviceName: device.name,
      callId: job.id,
      title: input.mode === "task" ? `\u59D4\u6258 ${device.name} \u6267\u884C\u4EFB\u52A1` : `\u8F6C\u53D1\u6D88\u606F\u5230 ${device.name}`,
      detail: input.text.slice(0, 300)
    });
    void this.hub.call(device.id, action, args, timeout, (event) => {
      const stage = String(event.stage ?? event.type ?? "event");
      const text = describeEvent(event);
      job.events.push({ at: Date.now(), stage, text });
      if (job.events.length > 80) job.events.splice(0, job.events.length - 80);
    }).then((result) => {
      job.status = "ok";
      job.endedAt = Date.now();
      job.result = summarizeResult(result, 1200);
      this.feed.update(activity.id, { status: "ok", detail: joinDetail(input.text, job.result) });
    }).catch((error) => {
      job.status = "error";
      job.endedAt = Date.now();
      job.error = error instanceof Error ? error.message : String(error);
      this.feed.update(activity.id, { status: "error", detail: joinDetail(input.text, job.error) });
    });
    return job;
  }
  // ── HTTP API ────────────────────────────────────────────────────────
  registerRoutes() {
    this.ctx.effect(
      () => this.ctx.webServer.register({
        kind: "prefix",
        path: API_PREFIX,
        handler: this.handleRequest
      }),
      "dsh-gateway: web routes"
    );
  }
  handleRequest = async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const route = url.pathname.slice(API_PREFIX.length) || "/";
    try {
      if (req.method === "GET" && route === "/config") {
        return this.sendJson(res, 200, this.publicConfig());
      }
      if (req.method === "POST" && route === "/config") {
        return await this.saveConfig(req, res);
      }
      if (req.method === "POST" && route === "/test") {
        return await this.testGateway(req, res);
      }
      if (req.method === "POST" && route === "/connect") {
        return await this.connect(req, res);
      }
      if (req.method === "POST" && route === "/disconnect") {
        return await this.disconnect(res);
      }
      if (req.method === "POST" && route === "/reconnect") {
        return this.reconnect(res);
      }
      if (req.method === "GET" && (route === "/snapshot" || route === "/state")) {
        return this.sendJson(res, 200, this.snapshot(url));
      }
      if (req.method === "GET" && route === "/devices") {
        return this.sendJson(res, 200, this.devicesPayload());
      }
      if (req.method === "GET" && route === "/mentions") {
        return this.sendJson(res, 200, this.mentionPayload(Number(url.searchParams.get("limit") ?? 20)));
      }
      if (req.method === "POST" && route === "/mentions/parse") {
        const body = await this.readJson(req);
        const text = String(body.text ?? "");
        const targets = this.parseMentions(text);
        return this.sendJson(res, 200, {
          ok: true,
          targets: targets.map((target) => ({
            id: target.id,
            name: target.name,
            handle: target.handle,
            online: target.online,
            action: target.action
          })),
          text: this.stripMentionTokens(text, targets) || text
        });
      }
      if (req.method === "POST" && route === "/mentions/send") {
        const body = await this.readJson(req);
        const text = String(body.text ?? "").trim();
        if (!text) throw new HttpError(400, "text \u4E0D\u80FD\u4E3A\u7A7A");
        const devices = this.hub.getOtherDevices();
        const wanted = Array.isArray(body.handles) ? body.handles.map((handle) => String(handle).toLowerCase()) : [];
        const targets = wanted.length > 0 ? devices.filter((device) => wanted.includes(String(device.handle ?? "").toLowerCase())).map((device) => ({
          id: device.id,
          name: device.name,
          handle: device.handle ?? device.name,
          online: device.online,
          action: device.actions.includes("task") ? "task" : "notify"
        })) : this.parseMentions(text);
        if (targets.length === 0) throw new HttpError(400, "\u6CA1\u6709\u5339\u914D\u7684\u8BBE\u5907\uFF0C\u8BF7\u5148\u5199 @\u8BBE\u5907\u540D");
        void this.forwardMention({ sessionId: String(body.sessionId ?? ""), text, targets }).catch((error) => {
          this.log("warn", `@\u63D0\u53CA\u6295\u9012\u5931\u8D25: ${error instanceof Error ? error.message : String(error)}`);
        });
        return this.sendJson(res, 200, { ok: true, record: this.mentionRecords[0] });
      }
      if (req.method === "POST" && route === "/mentions/clear") {
        this.mentionRecords.length = 0;
        return this.sendJson(res, 200, { ok: true });
      }
      if (req.method === "POST" && route === "/device/call") {
        const body = await this.readJson(req);
        const to = String(body.to ?? "");
        const action = String(body.action ?? "");
        if (!to || !action) throw new HttpError(400, "\u53C2\u6570 to \u548C action \u5FC5\u586B");
        const result = await this.callDevice(
          to,
          action,
          body.args ?? {},
          Number(body.timeoutMs ?? 15e3) || 15e3
        );
        return this.sendJson(res, 200, { ok: true, result });
      }
      if (req.method === "POST" && route === "/forward") {
        const body = await this.readJson(req);
        const to = String(body.to ?? "").trim();
        const text = String(body.text ?? "").trim();
        if (!to || !text) throw new HttpError(400, "\u76EE\u6807\u8BBE\u5907\u548C\u6D88\u606F\u5185\u5BB9\u5FC5\u586B");
        const mode = body.mode === "task" ? "task" : "notify";
        const job = this.startForward({
          to,
          mode,
          text,
          title: String(body.title ?? "").trim(),
          timeout: Number(body.timeout ?? 0) || void 0
        });
        return this.sendJson(res, 200, { ok: true, job });
      }
      if (req.method === "POST" && route === "/device/rename") {
        const body = await this.readJson(req);
        return await this.rename(req, res);
      }
      if (req.method === "POST" && route === "/activity/clear") {
        this.feed.clear();
        return this.sendJson(res, 200, { ok: true });
      }
      if (req.method === "GET" && (route === "/" || route === "/ui")) {
        res.writeHead(302, { location: "/", "cache-control": "no-store" });
        res.end();
        return;
      }
      return this.sendJson(res, 404, { error: `Not found: ${route}` });
    } catch (error) {
      if (error instanceof HttpError) return this.sendJson(res, error.status, { error: error.message });
      const message = error instanceof Error ? error.message : String(error);
      this.log("warn", `API ${route} \u5931\u8D25: ${message}`);
      return this.sendJson(res, 500, { error: message });
    }
  };
  async saveConfig(req, res) {
    const body = await this.readJson(req);
    if (body.baseURL !== void 0) {
      const url = normalizeBaseURL(body.baseURL);
      if (!url) throw new HttpError(400, "\u7F51\u5173\u5730\u5740\u9700\u8981\u662F http(s) URL");
      this.effective.baseURL = url;
      this.stored.baseURL = url;
      this.effective.source.baseURL = "state";
    }
    if (body.identifier !== void 0) {
      const identifier = String(body.identifier).trim();
      if (!identifier) throw new HttpError(400, "\u8D26\u53F7\u4E0D\u80FD\u4E3A\u7A7A");
      this.effective.identifier = identifier;
      this.stored.identifier = identifier;
      this.effective.source.identifier = "state";
    }
    if (body.deviceName !== void 0) {
      const name2 = sanitizeDeviceName(body.deviceName);
      if (!name2) throw new HttpError(400, "\u8BBE\u5907\u540D\u4E0D\u80FD\u4E3A\u7A7A");
      this.effective.deviceName = name2;
      this.stored.deviceName = name2;
      this.effective.source.deviceName = "state";
    }
    if (body.prefs !== void 0) {
      this.effective.prefs = mergePrefs(this.effective.prefs, body.prefs);
      this.stored.prefs = { ...this.stored.prefs, ...this.effective.prefs };
    }
    await this.persist();
    this.applyRuntimeConfig();
    return this.sendJson(res, 200, { ok: true, config: this.publicConfig() });
  }
  async testGateway(req, res) {
    const body = await this.readJson(req);
    const url = normalizeBaseURL(body.baseURL ?? this.effective.baseURL);
    if (!url) throw new HttpError(400, "\u8BF7\u8F93\u5165\u7F51\u5173\u5730\u5740");
    const probe = await probeGateway(url);
    if (!probe.ok) return this.sendJson(res, 502, probe);
    this.gatewayInfo = probe.info ?? null;
    this.gatewayInfoAt = Date.now();
    return this.sendJson(res, 200, probe);
  }
  async connect(req, res) {
    const body = await this.readJson(req);
    const baseURL = normalizeBaseURL(body.baseURL ?? this.effective.baseURL);
    const identifier = String(body.identifier ?? this.effective.identifier).trim();
    const password = String(body.password ?? "");
    const newPassword = String(body.new_password ?? "").trim();
    const deviceName = sanitizeDeviceName(body.deviceName ?? this.effective.deviceName) || this.effective.deviceName;
    if (!baseURL) throw new HttpError(400, "\u7F51\u5173\u5730\u5740\u65E0\u6548");
    if (!identifier) throw new HttpError(400, "\u8D26\u53F7\u4E0D\u80FD\u4E3A\u7A7A");
    if (!password) throw new HttpError(400, "\u5BC6\u7801\u4E0D\u80FD\u4E3A\u7A7A");
    const auth = await authenticate(baseURL, identifier, password, newPassword);
    const previousURL = this.effective.baseURL;
    this.effective.baseURL = baseURL;
    this.effective.identifier = identifier;
    this.effective.apiKey = auth.apiKey;
    this.effective.deviceName = deviceName;
    this.effective.prefs.autoConnect = true;
    this.effective.source = { baseURL: "state", identifier: "state", deviceName: "state" };
    this.stored.baseURL = baseURL;
    this.stored.identifier = identifier;
    this.stored.apiKey = auth.apiKey;
    this.stored.deviceName = deviceName;
    this.stored.lastConnectedAt = Date.now();
    this.stored.prefs = { ...this.stored.prefs, ...this.effective.prefs, autoConnect: true };
    await this.persist();
    this.applyRuntimeConfig();
    this.hub.restart();
    this.gatewayInfoAt = 0;
    const probe = await probeGateway(baseURL).catch(() => null);
    if (probe?.ok) {
      this.gatewayInfo = probe.info ?? null;
      this.gatewayInfoAt = Date.now();
    }
    if (this.effective.prefs.autoSyncToNanomuse) this.applyGatewayToNanomuse();
    this.log("info", `\u5DF2\u8FDE\u63A5\u7F51\u5173 ${baseURL}\uFF08\u8D26\u53F7 ${identifier}${previousURL !== baseURL ? "\uFF0C\u5730\u5740\u5DF2\u5207\u6362" : ""}\uFF09`);
    return this.sendJson(res, 200, {
      ok: true,
      created: auth.created,
      password_updated: auth.passwordUpdated,
      gateway: probe?.ok ? probe.info : null,
      config: this.publicConfig()
    });
  }
  async disconnect(res) {
    this.hub.stop();
    this.effective.prefs.autoConnect = false;
    this.stored.prefs = { ...this.stored.prefs, ...this.effective.prefs, autoConnect: false };
    await this.persist();
    this.feed.add({
      direction: "system",
      action: "disconnect",
      status: "info",
      title: "\u5DF2\u624B\u52A8\u65AD\u5F00\u7F51\u5173"
    });
    return this.sendJson(res, 200, { ok: true, config: this.publicConfig() });
  }
  reconnect(res) {
    if (!this.effective.apiKey) throw new HttpError(400, "\u8FD8\u6CA1\u6709\u4FDD\u5B58\u7684\u51ED\u636E\uFF0C\u8BF7\u5148\u7528\u8D26\u53F7\u5BC6\u7801\u8FDE\u63A5");
    this.effective.prefs.autoConnect = true;
    this.stored.prefs = { ...this.stored.prefs, ...this.effective.prefs, autoConnect: true };
    void this.persist();
    this.applyRuntimeConfig();
    this.hub.restart();
    return this.sendJson(res, 200, { ok: true, config: this.publicConfig() });
  }
  async rename(req, res) {
    const body = await this.readJson(req);
    const name2 = sanitizeDeviceName(body.name);
    if (!name2) throw new HttpError(400, "\u8BBE\u5907\u540D\u4E0D\u80FD\u4E3A\u7A7A");
    this.effective.deviceName = name2;
    this.stored.deviceName = name2;
    this.hub.rename(name2);
    await this.persist();
    return this.sendJson(res, 200, { ok: true, config: this.publicConfig() });
  }
  // ── state payloads ──────────────────────────────────────────────────
  publicConfig() {
    return publicConfig(this.effective, this.stored, statePath());
  }
  snapshot(_url) {
    void this.maybeRefreshGatewayInfo();
    const others = this.hub.getOtherDevices();
    const thisDevice = {
      id: this.hub.deviceId,
      name: this.effective.deviceName,
      kind: "computer",
      os: platformName(),
      version: PLUGIN_VERSION,
      online: this.hub.connected,
      last_seen: Math.floor(Date.now() / 1e3),
      controllable: false,
      actions: this.computeActions(),
      isThisDevice: true
    };
    return {
      seq: this.feed.seq,
      at: Date.now(),
      config: this.publicConfig(),
      status: {
        state: this.hub.state,
        connected: this.hub.connected,
        detail: this.hub.detail,
        lastError: this.hub.lastError,
        connectedAt: this.hub.connectedAt || null,
        latencyMs: this.hub.latencyMs,
        baseURL: this.effective.baseURL,
        identifier: this.effective.identifier,
        deviceId: this.hub.deviceId,
        deviceName: this.effective.deviceName,
        actions: this.computeActions(),
        gateway: this.gatewayInfo,
        gatewayInfoAt: this.gatewayInfoAt || null,
        pendingTasks: this.runner.running
      },
      devices: [thisDevice, ...others],
      activity: this.feed.recent(80),
      jobs: this.recentJobs()
    };
  }
  devicesPayload() {
    const others = this.hub.getOtherDevices();
    return {
      connected: this.hub.connected,
      this_device: {
        id: this.hub.deviceId,
        name: this.effective.deviceName,
        kind: "computer",
        os: platformName(),
        online: this.hub.connected
      },
      devices: others
    };
  }
  recentJobs() {
    return [...this.jobs.values()].sort((a, b) => b.at - a.at).slice(0, 8);
  }
  trimJobs() {
    if (this.jobs.size <= JOB_LIMIT) return;
    const keep = [...this.jobs.values()].sort((a, b) => b.at - a.at).slice(0, JOB_LIMIT);
    this.jobs.clear();
    for (const job of keep) this.jobs.set(job.id, job);
  }
  // ── runtime wiring ──────────────────────────────────────────────────
  computeActions() {
    const actions = ["info"];
    const prefs = this.effective.prefs;
    if (prefs.allowNotify) actions.push("notify");
    if (prefs.allowTask) actions.push("task", "approve", "stop");
    if (prefs.allowScreen && screenSupported()) actions.push("screen");
    if (prefs.allowOpen) actions.push("open");
    if (prefs.allowShell) actions.push("shell");
    return actions;
  }
  applyRuntimeConfig() {
    const actions = this.computeActions();
    this.hub.updateOptions({
      baseURL: this.effective.baseURL,
      token: this.effective.apiKey,
      deviceId: this.effective.deviceId,
      deviceName: this.effective.deviceName,
      actions
    });
    this.hub.setDeviceName(this.effective.deviceName);
    this.hub.setActions(actions);
    if (this.effective.apiKey && this.effective.prefs.autoConnect && !this.hub.connected && this.hub.state !== "connecting") {
      this.hub.start();
    }
  }
  applyGatewayToNanomuse() {
    try {
      const cloud = this.ctx.get("nanomuseCloud");
      cloud?.applyGateway?.(this.effective.baseURL);
    } catch {
    }
  }
  async persist() {
    this.stored.baseURL = this.effective.baseURL;
    this.stored.identifier = this.effective.identifier;
    this.stored.deviceId = this.effective.deviceId;
    this.stored.deviceName = this.effective.deviceName;
    this.stored.prefs = { ...this.stored.prefs, ...this.effective.prefs };
    await writeState(this.stored);
  }
  async refreshGatewayInfo() {
    if (!this.effective.baseURL) return;
    try {
      const response = await fetch(`${this.effective.baseURL}/v1/gateway/status`, {
        signal: AbortSignal.timeout(5e3)
      });
      if (!response.ok) return;
      const info = await response.json();
      this.gatewayInfo = info;
      this.gatewayInfoAt = Date.now();
    } catch {
    }
  }
  async maybeRefreshGatewayInfo() {
    if (!this.hub.connected) return;
    if (Date.now() - this.gatewayInfoAt < 3e4) return;
    this.gatewayInfoAt = Date.now();
    await this.refreshGatewayInfo();
  }
  log(level, text) {
    const logger = this.ctx.logger;
    try {
      logger?.[level]?.(text);
    } catch {
    }
  }
  // ── small helpers ───────────────────────────────────────────────────
  sendJson(res, status, data) {
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    });
    res.end(JSON.stringify(data));
  }
  async readJson(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      const buffer = chunk;
      size += buffer.length;
      if (size > BODY_LIMIT) throw new HttpError(413, "\u8BF7\u6C42\u5185\u5BB9\u8FC7\u5927");
      chunks.push(buffer);
    }
    if (chunks.length === 0) return {};
    try {
      const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      return parsed;
    } catch {
      throw new HttpError(400, "\u8BF7\u6C42\u4E0D\u662F\u5408\u6CD5 JSON");
    }
  }
};
async function authenticate(baseURL, identifier, password, newPassword) {
  const first = await postJson(`${baseURL}/v1/auth/credentials`, {
    identifier,
    password,
    ...newPassword ? { new_password: newPassword } : {},
    device: "DSH Web Client"
  });
  if (first.status === 404 || first.status === 405) {
    const login = await postJson(`${baseURL}/v1/auth/login`, {
      identifier,
      password,
      device: "DSH Web Client"
    });
    if (!login.ok) throw new HttpError(login.status === 401 ? 401 : 400, errorMessage(login.data, login.status));
    const key2 = String(login.data?.api_key ?? "");
    if (!key2) throw new HttpError(502, "\u7F51\u5173\u6CA1\u6709\u8FD4\u56DE api_key");
    return { apiKey: key2, created: Boolean(login.data?.created), passwordUpdated: false };
  }
  if (!first.ok) throw new HttpError(first.status === 401 ? 401 : 400, errorMessage(first.data, first.status));
  const key = String(first.data?.api_key ?? "");
  if (!key) throw new HttpError(502, "\u7F51\u5173\u6CA1\u6709\u8FD4\u56DE api_key");
  return {
    apiKey: key,
    created: Boolean(first.data?.created),
    passwordUpdated: Boolean(first.data?.password_updated)
  };
}
async function probeGateway(baseURL) {
  const paths = ["/v1/gateway/status", "/healthz", "/"];
  let lastError = "";
  for (const path of paths) {
    const started = Date.now();
    try {
      const response = await fetch(`${baseURL}${path}`, { signal: AbortSignal.timeout(5e3) });
      if (!response.ok) {
        lastError = `HTTP ${response.status}`;
        continue;
      }
      const data = await response.json().catch(() => ({}));
      return {
        ok: true,
        baseURL,
        endpoint: path,
        latencyMs: Date.now() - started,
        info: { ...data, endpoint: path }
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  return { ok: false, baseURL, error: lastError || "\u65E0\u6CD5\u8FDE\u63A5\u5230\u8FD9\u4E2A\u5730\u5740" };
}
async function postJson(url, body) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12e3)
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    throw new HttpError(502, error instanceof Error ? error.message : "\u65E0\u6CD5\u8FDE\u63A5\u5230\u7F51\u5173");
  }
}
function errorMessage(data, status) {
  const value = data;
  return value?.error?.message || value?.detail?.error?.message || value?.message || value?.detail?.message || `\u7F51\u5173\u8BF7\u6C42\u5931\u8D25 (HTTP ${status})`;
}
function mergePrefs(current, patch) {
  const next = { ...current };
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return next;
  for (const key of Object.keys(DEFAULT_PREFS)) {
    const value = patch[key];
    if (typeof value === "boolean") next[key] = value;
  }
  return next;
}
function describeEvent(event) {
  const stage = String(event.stage ?? "");
  if (stage === "tool") return `\u5DE5\u5177 ${String(event.name ?? "")}: ${String(event.summary ?? "")}`;
  if (stage === "tool_result") return `\u7ED3\u679C ${String(event.name ?? "")}: ${String(event.summary ?? "")}`;
  if (stage === "text") return String(event.text ?? "");
  if (stage === "approval") return `\u9700\u8981\u6279\u51C6: ${String(event.preview ?? event.reason ?? "")}`;
  if (stage === "approval_result") return `\u6279\u51C6\u7ED3\u679C: ${String(event.status ?? "")}`;
  if (stage === "error") return String(event.message ?? "\u6267\u884C\u5931\u8D25");
  if (stage === "thinking") return "\u601D\u8003\u4E2D\u2026";
  return JSON.stringify(event).slice(0, 200);
}
function contentText(content) {
  if (!Array.isArray(content)) return "";
  return content.map(
    (block) => block && typeof block === "object" && block.type === "text" ? String(block.text ?? "") : ""
  ).filter(Boolean).join("\n").trim();
}
function summarizeResult(result, limit = 500) {
  const text = result.text ?? result.answer ?? result.stdout ?? result.message;
  if (typeof text === "string" && text.trim()) return text.trim().slice(0, limit);
  if (typeof result.exit_code === "number") return `\u9000\u51FA\u7801 ${result.exit_code}`;
  try {
    return JSON.stringify(result).slice(0, limit);
  } catch {
    return "";
  }
}
function joinDetail(base, next) {
  if (!base) return next.slice(-700);
  const trimmed = next.trim();
  if (!trimmed) return base.slice(-700);
  if (trimmed === base.trim() || trimmed.length > 20 && base.includes(trimmed)) return base.slice(-700);
  const head = `${base.split("\n")[0]}
`;
  return `${head}${next}`.slice(-700);
}
function platformName() {
  if (process.platform === "win32") return `Windows ${process.arch}`;
  if (process.platform === "darwin") return `macOS ${process.arch}`;
  return `${process.platform} ${process.arch}`;
}
function apply(ctx, config = {}) {
  ctx.plugin(GatewayPluginService, config);
}
export {
  API_PREFIX,
  GatewayPluginService,
  PLUGIN_VERSION,
  apply,
  name
};
//# sourceMappingURL=index.js.map
