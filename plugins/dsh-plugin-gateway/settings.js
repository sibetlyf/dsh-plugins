window.__ModuleLoader__.load({ id: "dsh-plugin-gateway", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(client_exports);
var import_react6 = require("react");

// src/client/GatewayPage.ts
var import_dsh_client_ui_primitives2 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_react4 = require("react");

// src/client/api.ts
var import_react = require("react");
var API = "/nanomuse/gateway";
async function request(path, init) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers ?? {} },
    cache: "no-store"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `\u8BF7\u6C42\u5931\u8D25 (HTTP ${response.status})`);
  return data;
}
var api = {
  snapshot: () => request("/snapshot"),
  config: () => request("/config"),
  saveConfig: (patch) => request("/config", { method: "POST", body: JSON.stringify(patch) }),
  test: (baseURL) => request("/test", { method: "POST", body: JSON.stringify({ baseURL }) }),
  connect: (body) => request(
    "/connect",
    { method: "POST", body: JSON.stringify(body) }
  ),
  disconnect: () => request("/disconnect", { method: "POST", body: "{}" }),
  reconnect: () => request("/reconnect", { method: "POST", body: "{}" }),
  rename: (name2) => request("/device/rename", { method: "POST", body: JSON.stringify({ name: name2 }) }),
  forward: (body) => request("/forward", { method: "POST", body: JSON.stringify(body) }),
  call: (body) => request("/device/call", { method: "POST", body: JSON.stringify(body) }),
  clearActivity: () => request("/activity/clear", { method: "POST", body: "{}" })
};
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}
var GatewayStore = class {
  listeners = /* @__PURE__ */ new Set();
  timer = null;
  refs = 0;
  inFlight = false;
  snapshot = null;
  error = "";
  loading = true;
  updatedAt = 0;
  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  retain = () => {
    this.refs += 1;
    if (this.refs === 1) this.boot();
    return () => {
      this.refs -= 1;
      if (this.refs === 0) this.stop();
    };
  };
  refresh = async () => {
    if (this.inFlight) return;
    if (typeof document !== "undefined" && document.hidden && this.snapshot) return;
    this.inFlight = true;
    try {
      const next = await api.snapshot();
      this.snapshot = next;
      this.error = "";
      this.updatedAt = Date.now();
    } catch (error) {
      this.error = messageOf(error);
    } finally {
      this.inFlight = false;
      this.loading = false;
      for (const listener of this.listeners) {
        try {
          listener();
        } catch {
        }
      }
    }
  };
  boot() {
    void this.refresh();
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.refresh();
    }, 2500);
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
};
var store = new GatewayStore();
function useGatewayStore() {
  const [, force] = (0, import_react.useState)(0);
  (0, import_react.useEffect)(() => {
    const off = store.subscribe(() => force((value) => value + 1));
    const release = store.retain();
    return () => {
      off();
      release();
    };
  }, []);
  return {
    snapshot: store.snapshot,
    error: store.error,
    loading: store.loading,
    updatedAt: store.updatedAt,
    refresh: store.refresh
  };
}

// src/client/SettingsPage.ts
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
var import_react3 = require("react");

// src/client/ui.ts
var import_react2 = require("react");
function svg(size, ...children) {
  return (0, import_react2.createElement)(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.8,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": true
    },
    ...children
  );
}
function IconHub({ size = 18 }) {
  return svg(
    size,
    (0, import_react2.createElement)("rect", { x: 3, y: 4, width: 8, height: 12, rx: 2 }),
    (0, import_react2.createElement)("rect", { x: 13, y: 8, width: 8, height: 12, rx: 2 }),
    (0, import_react2.createElement)("path", { d: "M11 10h2M11 10v6h2" })
  );
}
function IconPhone({ size = 18 }) {
  return svg(size, (0, import_react2.createElement)("rect", { x: 7, y: 2.5, width: 10, height: 19, rx: 2.5 }), (0, import_react2.createElement)("path", { d: "M11 18.5h2" }));
}
function IconLaptop({ size = 18 }) {
  return svg(
    size,
    (0, import_react2.createElement)("rect", { x: 4, y: 4, width: 16, height: 11, rx: 2 }),
    (0, import_react2.createElement)("path", { d: "M2 19h20M9 19l.6-2h4.8l.6 2" })
  );
}
function IconGlobe({ size = 18 }) {
  return svg(
    size,
    (0, import_react2.createElement)("circle", { cx: 12, cy: 12, r: 8.5 }),
    (0, import_react2.createElement)("path", { d: "M3.5 12h17M12 3.5c2.5 2.4 3.8 5.3 3.8 8.5S14.5 18.1 12 20.5c-2.5-2.4-3.8-5.3-3.8-8.5S9.5 5.9 12 3.5Z" })
  );
}
function IconSend({ size = 16 }) {
  return svg(size, (0, import_react2.createElement)("path", { d: "M21 3 10.5 13.5M21 3l-6.6 18-3.9-7.5L3 9.6 21 3Z" }));
}
function IconRefresh({ size = 16 }) {
  return svg(
    size,
    (0, import_react2.createElement)("path", { d: "M20 11a8 8 0 1 0-2.3 6.1" }),
    (0, import_react2.createElement)("path", { d: "M20 4v7h-7" })
  );
}
function IconPencil({ size = 14 }) {
  return svg(size, (0, import_react2.createElement)("path", { d: "M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" }), (0, import_react2.createElement)("path", { d: "M13.5 6.5l4 4" }));
}
function IconCheck({ size = 16 }) {
  return svg(size, (0, import_react2.createElement)("path", { d: "m5 12.5 4.5 4.5L19 7" }));
}
function IconArrowDownLeft({ size = 14 }) {
  return svg(size, (0, import_react2.createElement)("path", { d: "M17 7 7 17M7 9v8h8" }));
}
function IconArrowUpRight({ size = 14 }) {
  return svg(size, (0, import_react2.createElement)("path", { d: "M7 17 17 7M9 7h8v8" }));
}
function IconSettings({ size = 16 }) {
  return svg(
    size,
    (0, import_react2.createElement)("circle", { cx: 12, cy: 12, r: 3 }),
    (0, import_react2.createElement)("path", {
      d: "M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"
    })
  );
}
function IconWarning({ size = 15 }) {
  return svg(size, (0, import_react2.createElement)("path", { d: "M12 3 2.5 20h19L12 3Z" }), (0, import_react2.createElement)("path", { d: "M12 9v5M12 17h.01" }));
}
function Glyph({
  kind,
  online,
  size = 20,
  compact = false
}) {
  const Icon = kind === "phone" ? IconPhone : kind === "web" ? IconGlobe : kind === "computer" ? IconLaptop : IconHub;
  return (0, import_react2.createElement)(
    "span",
    { className: `nmx-glyph${online ? " is-online" : ""}${compact ? " nmx-glyph-sm" : ""}` },
    (0, import_react2.createElement)(Icon, { size })
  );
}
function Logo({ size = 20 }) {
  return (0, import_react2.createElement)("span", { className: "nmx-logo" }, (0, import_react2.createElement)(IconHub, { size }));
}
function Dot({ on }) {
  return (0, import_react2.createElement)("span", { className: `nmx-dot${on ? " is-on" : ""}`, "aria-hidden": true });
}
function ago(t, seconds) {
  if (!seconds) return t("never");
  const delta = Math.max(0, Date.now() / 1e3 - seconds);
  if (delta < 90) return t("justNow");
  if (delta < 3600) return `${Math.round(delta / 60)} ${t("minutesAgo")}`;
  if (delta < 86400) return `${Math.round(delta / 3600)} ${t("hoursAgo")}`;
  return `${Math.round(delta / 86400)} ${t("daysAgo")}`;
}
function presence(t, device) {
  if (device.online) return t("online");
  return device.last_seen ? `${t("lastSeen")} ${ago(t, device.last_seen)}` : t("offline");
}
function capabilities(t, actions) {
  const set = new Set(actions);
  const out = [];
  if (set.has("task")) out.push(t("capTask"));
  if (set.has("notify")) out.push(t("capNotify"));
  if (set.has("screen")) out.push(t("capScreen"));
  if (set.has("shell")) out.push(t("capShell"));
  if (set.has("open")) out.push(t("capOpen"));
  return out;
}
var STYLE_ID = "dsh-plugin-gateway/styles";
var CSS = `
.nmx-page{height:100%;overflow:auto;padding:26px 30px 56px;color:var(--dsw-alias-label-primary);box-sizing:border-box}
.nmx-inner{max-width:1180px;margin:0 auto;display:flex;flex-direction:column;gap:20px}
.nmx-head{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;flex-wrap:wrap}
.nmx-brand{display:flex;gap:13px;align-items:flex-start;min-width:0}
.nmx-logo{width:40px;height:40px;border-radius:12px;display:inline-flex;align-items:center;justify-content:center;color:#fff;background:linear-gradient(135deg,#2563eb,#0891b2);box-shadow:0 6px 18px rgba(37,99,235,.28);flex:none}
.nmx-h1{margin:0;font-size:22px;line-height:1.25;font-weight:650;letter-spacing:-.01em}
.nmx-lead{margin:5px 0 0;font-size:13px;line-height:1.6;color:var(--dsw-alias-label-secondary);max-width:760px}
.nmx-head-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.nmx-status{display:inline-flex;align-items:center;gap:7px;padding:5px 11px;border-radius:999px;font-size:12.5px;font-weight:500;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);white-space:nowrap}
.nmx-status.is-ok{color:var(--dsw-alias-state-success-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 36%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 9%,transparent)}
.nmx-status.is-error{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 36%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 8%,transparent)}
.nmx-status.is-warn{color:var(--dsw-alias-state-warn-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 36%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 8%,transparent)}
.nmx-status-meta{opacity:.65;font-weight:400}
.nmx-dot{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-state-idle-primary);flex:none}
.nmx-dot.is-on{background:var(--dsw-alias-state-success-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-state-success-primary) 18%,transparent)}
.nmx-grid{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(330px,.85fr);gap:20px;align-items:start}
.nmx-col{display:flex;flex-direction:column;gap:20px;min-width:0}
.nmx-card{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:14px;padding:18px;min-width:0}
.nmx-card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:14px}
.nmx-card-title{font-size:15px;font-weight:600;margin:0;display:flex;align-items:center;gap:8px}
.nmx-card-sub{margin:4px 0 0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary)}
.nmx-count{font-size:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.nmx-device-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(248px,1fr));gap:12px}
.nmx-device{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:11px;min-width:0;transition:border-color .15s ease,transform .15s ease}
.nmx-device:hover{border-color:var(--dsw-alias-border-l2)}
.nmx-device.is-self{border-style:dashed}
.nmx-device-top{display:flex;gap:11px;align-items:flex-start;min-width:0}
.nmx-glyph{width:38px;height:38px;border-radius:11px;display:inline-flex;align-items:center;justify-content:center;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l1);flex:none}
.nmx-glyph.is-online{color:var(--dsw-alias-brand-primary);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 30%,transparent)}
.nmx-glyph-sm{width:18px;height:18px;border:none;background:transparent;border-radius:4px;color:inherit}
.nmx-device-main{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}
.nmx-device-name{font-size:13.5px;font-weight:600;display:flex;align-items:center;gap:6px;min-width:0}
.nmx-device-name span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nmx-device-sub{font-size:11.5px;color:var(--dsw-alias-label-secondary);display:flex;align-items:center;gap:6px;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nmx-tag-self{font-size:10.5px;font-weight:500;color:var(--dsw-alias-brand-primary);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 10%,transparent);border-radius:4px;padding:1px 6px;flex:none}
.nmx-chips{display:flex;gap:5px;flex-wrap:wrap}
.nmx-chip{font-size:10.8px;padding:2px 7px;border-radius:999px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l1);white-space:nowrap}
.nmx-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:auto}
.nmx-empty{padding:28px 20px;text-align:center;color:var(--dsw-alias-label-secondary);font-size:12.5px;line-height:1.6;border:1px dashed var(--dsw-alias-border-l2);border-radius:10px}
.nmx-form{display:flex;flex-direction:column;gap:12px}
.nmx-row{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end}
.nmx-field{display:flex;flex-direction:column;gap:6px;flex:1;min-width:150px}
.nmx-label{font-size:12.5px;font-weight:500}
.nmx-hint{font-size:11.5px;line-height:1.5;color:var(--dsw-alias-label-secondary)}
.nmx-textarea{width:100%;min-height:84px;max-height:220px;resize:vertical;padding:10px 12px;border-radius:9px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:1.55;outline:none;box-sizing:border-box}
.nmx-textarea:focus{border-color:var(--dsw-alias-brand-primary)}
.nmx-seg{display:inline-flex;padding:3px;border-radius:9px;background:var(--dsw-alias-bg-layer-2);gap:2px;border:1px solid var(--dsw-alias-border-l1)}
.nmx-seg button{border:none;background:transparent;color:var(--dsw-alias-label-secondary);padding:5px 13px;border-radius:7px;font-size:12.5px;cursor:pointer;font:inherit}
.nmx-seg button.is-active{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:0 1px 3px rgba(0,0,0,.1)}
.nmx-pills{display:flex;gap:6px;flex-wrap:wrap}
.nmx-pill{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:5px 11px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:5px;font:inherit}
.nmx-pill:hover{border-color:var(--dsw-alias-border-l2)}
.nmx-pill.is-active{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 8%,transparent)}
.nmx-activity{display:flex;flex-direction:column;gap:1px;max-height:430px;overflow:auto;margin:0 -6px}
.nmx-activity-row{display:grid;grid-template-columns:24px minmax(0,1fr) auto;gap:9px;padding:9px 6px;border-radius:8px;align-items:start}
.nmx-activity-row:hover{background:var(--dsw-alias-bg-layer-2)}
.nmx-direction{width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);flex:none}
.nmx-direction.in{color:var(--dsw-alias-brand-primary);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 10%,transparent)}
.nmx-direction.out{color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 10%,transparent)}
.nmx-direction.sql{color:var(--dsw-alias-state-warn-primary);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 10%,transparent)}
.nmx-activity-main{min-width:0;display:flex;flex-direction:column;gap:2px}
.nmx-activity-title{font-size:12.5px;font-weight:500;line-height:1.4;display:flex;align-items:center;gap:6px;min-width:0}
.nmx-activity-title span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nmx-activity-meta{font-size:11px;color:var(--dsw-alias-label-secondary);line-height:1.45;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-word}
.nmx-activity-side{display:flex;flex-direction:column;align-items:flex-end;gap:3px;font-size:10.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.nmx-state{display:inline-flex;align-items:center;gap:4px;font-size:10.5px}
.nmx-state.is-error{color:var(--dsw-alias-state-error-primary)}
.nmx-state.is-ok{color:var(--dsw-alias-state-success-primary)}
.nmx-state.is-running{color:var(--dsw-alias-state-warn-primary)}
.nmx-job{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);border-radius:10px;padding:11px 12px;display:flex;flex-direction:column;gap:7px;margin-top:12px}
.nmx-job-head{display:flex;justify-content:space-between;gap:8px;align-items:center;font-size:12px;font-weight:500}
.nmx-job-events{display:flex;flex-direction:column;gap:3px;max-height:180px;overflow:auto;font-size:11.5px;color:var(--dsw-alias-label-secondary);line-height:1.45}
.nmx-job-event{display:flex;gap:7px;min-width:0}
.nmx-job-stage{flex:none;color:var(--dsw-alias-brand-primary);font-family:var(--ds-font-family-code,monospace);font-size:10.5px;padding-top:1px}
.nmx-job-text{min-width:0;word-break:break-word}
.nmx-job-result{font-size:12px;line-height:1.55;white-space:pre-wrap;word-break:break-word;max-height:220px;overflow:auto}
.nmx-banner{display:flex;gap:10px;align-items:flex-start;padding:11px 13px;border-radius:10px;font-size:12.5px;line-height:1.5;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2)}
.nmx-banner.is-error{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 35%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 7%,transparent);color:var(--dsw-alias-state-error-primary)}
.nmx-banner.is-success{border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 35%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 7%,transparent);color:var(--dsw-alias-state-success-primary)}
.nmx-banner.is-warn{border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 35%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 7%,transparent)}
.nmx-kv{display:grid;grid-template-columns:minmax(90px,auto) minmax(0,1fr);gap:7px 14px;font-size:12px;line-height:1.5;align-items:baseline}
.nmx-kv dt{color:var(--dsw-alias-label-secondary)}
.nmx-kv dd{margin:0;min-width:0;word-break:break-all;font-family:var(--ds-font-family-code,monospace);font-size:11.5px}
.nmx-mono{font-family:var(--ds-font-family-code,monospace);font-size:11.5px;word-break:break-all}
.nmx-switch-row{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;padding:11px 0;border-top:1px solid var(--dsw-alias-border-l1)}
.nmx-switch-row:first-child{border-top:none;padding-top:0}
.nmx-switch-text{display:flex;flex-direction:column;gap:3px;min-width:0}
.nmx-switch-title{font-size:12.5px;font-weight:500}
.nmx-switch-sub{font-size:11.5px;line-height:1.5;color:var(--dsw-alias-label-secondary)}
.nmx-empty-hero{display:flex;flex-direction:column;gap:16px;padding:26px;border-radius:14px;border:1px solid var(--dsw-alias-border-l1);background:linear-gradient(140deg,color-mix(in srgb,var(--dsw-alias-brand-primary) 7%,var(--dsw-alias-bg-layer-1)),var(--dsw-alias-bg-layer-1))}
.nmx-empty-hero h2{margin:0;font-size:17px;font-weight:600}
.nmx-empty-hero p{margin:0;font-size:13px;line-height:1.6;color:var(--dsw-alias-label-secondary);max-width:720px}
.nmx-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;font-size:11.5px;color:var(--dsw-alias-label-secondary);padding:2px 2px 0}
.nmx-link{background:none;border:none;padding:0;color:var(--dsw-alias-brand-primary);cursor:pointer;font:inherit;font-size:12px}
.nmx-link:hover{text-decoration:underline}
.nmx-stack{display:flex;flex-direction:column;gap:10px}
.nmx-inline{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.nmx-rename{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.nmx-right{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}
.nmx-toast-wrap{position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:80}
@media (max-width:1000px){.nmx-grid{grid-template-columns:1fr}.nmx-page{padding:20px 18px 44px}}
@media (prefers-reduced-motion:reduce){.nmx-device{transition:none}}
`;
function ensureStyles() {
  if (typeof document === "undefined") return () => void 0;
  const existing = document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`);
  if (existing) return () => void 0;
  const style = document.createElement("style");
  style.dataset.pluginCss = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
  return () => {
    style.remove();
  };
}

// src/client/SettingsPage.ts
function SettingsPage({ t, embedded = false }) {
  const { snapshot, error, refresh } = useGatewayStore();
  const config = snapshot?.config;
  const status = snapshot?.status;
  return (0, import_react3.createElement)(
    "div",
    { style: { display: "flex", flexDirection: "column", gap: 18, maxWidth: 780 } },
    embedded ? null : (0, import_react3.createElement)(
      "div",
      null,
      (0, import_react3.createElement)("div", { style: { fontSize: 18, fontWeight: 650, letterSpacing: "-.01em" } }, t("settingsTitle")),
      (0, import_react3.createElement)("div", { style: { marginTop: 5, fontSize: 13, lineHeight: 1.6, color: "var(--dsw-alias-label-secondary)" } }, t("settingsLead"))
    ),
    error ? (0, import_react3.createElement)(Banner, { tone: "error", text: error }) : null,
    config ? (0, import_react3.createElement)(ConnectionSettings, { t, config, refresh }) : (0, import_react3.createElement)("div", { className: "nmx-empty" }, t("saving")),
    config ? (0, import_react3.createElement)(PermissionsCard, { t, config, refresh }) : null,
    config && status ? (0, import_react3.createElement)(AboutCard, { t, config, status }) : null
  );
}
function ConnectionSettings({
  t,
  config,
  refresh,
  hero = false
}) {
  const [baseURL, setBaseURL] = (0, import_react3.useState)("");
  const [identifier, setIdentifier] = (0, import_react3.useState)("");
  const [password, setPassword] = (0, import_react3.useState)("");
  const [newPassword, setNewPassword] = (0, import_react3.useState)("");
  const [deviceName, setDeviceName] = (0, import_react3.useState)("");
  const [busy, setBusy] = (0, import_react3.useState)("");
  const [notice, setNotice] = (0, import_react3.useState)(null);
  (0, import_react3.useEffect)(() => {
    if (!config) return;
    setBaseURL(config.baseURL || "");
    setIdentifier(config.identifier || "");
    setDeviceName(config.deviceName || "");
  }, [config?.baseURL, config?.identifier, config?.deviceName]);
  const test = async () => {
    if (!baseURL.trim()) return;
    setBusy("test");
    setNotice(null);
    try {
      const result = await api.test(baseURL.trim());
      if (!result.ok) throw new Error(result.error || t("statusError"));
      const version = result.info?.version;
      setNotice({
        type: "ok",
        text: `${t("testOk")}${version ? ` \xB7 v${version}` : ""}${result.latencyMs != null ? ` \xB7 ${result.latencyMs} ms` : ""}`
      });
    } catch (failure) {
      setNotice({ type: "error", text: messageOf(failure) });
    } finally {
      setBusy("");
    }
  };
  const connect = async (event) => {
    event?.preventDefault();
    if (!baseURL.trim() || !identifier.trim() || !password) {
      setNotice({ type: "error", text: `${t("fieldBaseURL")} / ${t("fieldIdentifier")} / ${t("fieldPassword")}` });
      return;
    }
    setBusy("connect");
    setNotice(null);
    try {
      const result = await api.connect({
        baseURL: baseURL.trim(),
        identifier: identifier.trim(),
        password,
        ...newPassword.trim() ? { new_password: newPassword.trim() } : {},
        deviceName: deviceName.trim() || void 0
      });
      setPassword("");
      setNewPassword("");
      let text = t("connectOk");
      if (result.created) text += " \xB7 \u8D26\u53F7\u5DF2\u81EA\u52A8\u767B\u8BB0";
      if (result.password_updated) text += " \xB7 \u7F51\u5173\u5BC6\u7801\u5DF2\u66F4\u65B0";
      setNotice({ type: "ok", text });
      await refresh();
    } catch (failure) {
      setNotice({ type: "error", text: messageOf(failure) });
    } finally {
      setBusy("");
    }
  };
  const reconnect = async () => {
    setBusy("reconnect");
    setNotice(null);
    try {
      await api.reconnect();
      setNotice({ type: "ok", text: t("statusConnecting") });
      await refresh();
    } catch (failure) {
      setNotice({ type: "error", text: messageOf(failure) });
    } finally {
      setBusy("");
    }
  };
  const disconnect = async () => {
    setBusy("disconnect");
    setNotice(null);
    try {
      await api.disconnect();
      setNotice({ type: "warn", text: t("statusDisconnected") });
      await refresh();
    } catch (failure) {
      setNotice({ type: "error", text: messageOf(failure) });
    } finally {
      setBusy("");
    }
  };
  const saveName = async () => {
    if (!deviceName.trim()) return;
    setBusy("name");
    setNotice(null);
    try {
      await api.saveConfig({ deviceName: deviceName.trim() });
      setNotice({ type: "ok", text: t("configSaved") });
      await refresh();
    } catch (failure) {
      setNotice({ type: "error", text: messageOf(failure) });
    } finally {
      setBusy("");
    }
  };
  const body = (0, import_react3.createElement)(
    "div",
    { className: "nmx-form" },
    (0, import_react3.createElement)(
      "div",
      { className: "nmx-row" },
      (0, import_react3.createElement)(
        "div",
        { className: "nmx-field", style: { minWidth: 260 } },
        (0, import_react3.createElement)("span", { className: "nmx-label" }, t("fieldBaseURL")),
        (0, import_react3.createElement)(import_dsh_client_ui_primitives.Input, {
          value: baseURL,
          placeholder: t("phBaseURL"),
          autoComplete: "off",
          onChange: (event) => setBaseURL(event.currentTarget.value)
        })
      ),
      (0, import_react3.createElement)(
        "div",
        { style: { display: "flex", gap: 6, alignItems: "center", paddingBottom: 1, flexWrap: "wrap" } },
        (0, import_react3.createElement)("button", { type: "button", className: "nmx-pill", onClick: () => setBaseURL("http://127.0.0.1:8790") }, t("presetLocal"))
      )
    ),
    (0, import_react3.createElement)(
      "div",
      { className: "nmx-row" },
      (0, import_react3.createElement)(
        "div",
        { className: "nmx-field" },
        (0, import_react3.createElement)("span", { className: "nmx-label" }, t("fieldIdentifier")),
        (0, import_react3.createElement)(import_dsh_client_ui_primitives.Input, {
          value: identifier,
          placeholder: t("phIdentifier"),
          autoComplete: "username",
          onChange: (event) => setIdentifier(event.currentTarget.value)
        })
      ),
      (0, import_react3.createElement)(
        "div",
        { className: "nmx-field" },
        (0, import_react3.createElement)("span", { className: "nmx-label" }, t("fieldPassword")),
        (0, import_react3.createElement)(import_dsh_client_ui_primitives.Input, {
          value: password,
          type: "password",
          placeholder: config?.hasKey ? `${config.apiKeyPrefix} \xB7 ${t("phPassword")}` : t("phPassword"),
          autoComplete: "current-password",
          onChange: (event) => setPassword(event.currentTarget.value)
        })
      )
    ),
    (0, import_react3.createElement)(
      "div",
      { className: "nmx-row" },
      (0, import_react3.createElement)(
        "div",
        { className: "nmx-field" },
        (0, import_react3.createElement)("span", { className: "nmx-label" }, t("fieldNewPassword")),
        (0, import_react3.createElement)(import_dsh_client_ui_primitives.Input, {
          value: newPassword,
          type: "password",
          placeholder: t("phNewPassword"),
          autoComplete: "new-password",
          onChange: (event) => setNewPassword(event.currentTarget.value)
        })
      ),
      (0, import_react3.createElement)(
        "div",
        { className: "nmx-field" },
        (0, import_react3.createElement)("span", { className: "nmx-label" }, t("fieldDeviceName")),
        (0, import_react3.createElement)(
          "div",
          { style: { display: "flex", gap: 6 } },
          (0, import_react3.createElement)(import_dsh_client_ui_primitives.Input, {
            value: deviceName,
            placeholder: t("phDeviceName"),
            maxLength: 60,
            onChange: (event) => setDeviceName(event.currentTarget.value)
          }),
          (0, import_react3.createElement)(import_dsh_client_ui_primitives.Button, { variant: "outline", size: "md", type: "button", disabled: busy !== "" || !deviceName.trim(), onClick: saveName }, t("save"))
        )
      )
    ),
    notice ? (0, import_react3.createElement)(Banner, { tone: notice.type, text: notice.text }) : null,
    (0, import_react3.createElement)(
      "div",
      { className: "nmx-row", style: { justifyContent: "space-between" } },
      (0, import_react3.createElement)(
        "div",
        { className: "nmx-inline" },
        (0, import_react3.createElement)(import_dsh_client_ui_primitives.Button, { variant: "outline", size: "md", type: "button", disabled: busy !== "" || !baseURL.trim(), onClick: test }, busy === "test" ? t("testing") : t("testConnection")),
        (0, import_react3.createElement)(import_dsh_client_ui_primitives.Button, { variant: "primary", size: "md", type: "submit", disabled: busy !== "" || !password }, busy === "connect" ? t("connecting") : t("saveConnect"))
      ),
      (0, import_react3.createElement)(
        "div",
        { className: "nmx-inline" },
        config?.hasKey ? (0, import_react3.createElement)(import_dsh_client_ui_primitives.Button, { variant: "ghost", size: "md", type: "button", disabled: busy !== "", onClick: reconnect, icon: (0, import_react3.createElement)(IconRefresh, { size: 15 }) }, busy === "reconnect" ? t("statusConnecting") : t("reconnect")) : null,
        config?.hasKey ? (0, import_react3.createElement)(import_dsh_client_ui_primitives.Button, { variant: "ghost", size: "md", type: "button", disabled: busy !== "", onClick: disconnect }, busy === "disconnect" ? t("disconnecting") : t("disconnect")) : null
      )
    )
  );
  if (hero) {
    return (0, import_react3.createElement)(
      "div",
      { className: "nmx-empty-hero" },
      (0, import_react3.createElement)("h2", null, t("notConfiguredTitle")),
      (0, import_react3.createElement)("p", null, t("notConfiguredLead")),
      (0, import_react3.createElement)("form", { onSubmit: connect }, body)
    );
  }
  return (0, import_react3.createElement)(
    "div",
    { className: "nmx-card" },
    (0, import_react3.createElement)(
      "div",
      { className: "nmx-card-head" },
      (0, import_react3.createElement)(
        "div",
        null,
        (0, import_react3.createElement)("h3", { className: "nmx-card-title" }, t("connectionCard")),
        (0, import_react3.createElement)("p", { className: "nmx-card-sub" }, `${t("gateway")}: ${config?.baseURL || "\u2014"} \xB7 ${t("account")}: ${config?.identifier || "\u2014"}`)
      )
    ),
    (0, import_react3.createElement)("form", { onSubmit: connect }, body)
  );
}
function PermissionsCard({
  t,
  config,
  refresh
}) {
  const [saving, setSaving] = (0, import_react3.useState)("");
  const [error, setError] = (0, import_react3.useState)("");
  const rows = [
    { key: "autoConnect", title: t("permAutoConnect"), hint: t("permAutoConnectHint") },
    { key: "autoSyncToNanomuse", title: t("permAutoSync"), hint: t("permAutoSyncHint") },
    { key: "allowNotify", title: t("permNotify"), hint: t("permNotifyHint") },
    { key: "allowTask", title: t("permTask"), hint: t("permTaskHint") },
    { key: "relayApprovals", title: t("permRelayApprovals"), hint: t("permRelayApprovalsHint") },
    { key: "allowScreen", title: t("permScreen"), hint: t("permScreenHint") },
    { key: "allowOpen", title: t("permOpen"), hint: t("permOpenHint") },
    { key: "allowShell", title: t("permShell"), hint: t("permShellHint"), danger: true }
  ];
  const toggle = async (key, value) => {
    setSaving(key);
    setError("");
    try {
      await api.saveConfig({ prefs: { [key]: value } });
      await refresh();
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setSaving("");
    }
  };
  return (0, import_react3.createElement)(
    "div",
    { className: "nmx-card" },
    (0, import_react3.createElement)(
      "div",
      { className: "nmx-card-head" },
      (0, import_react3.createElement)(
        "div",
        null,
        (0, import_react3.createElement)("h3", { className: "nmx-card-title" }, t("permissionsCard")),
        (0, import_react3.createElement)("p", { className: "nmx-card-sub" }, t("settingsLead"))
      )
    ),
    error ? (0, import_react3.createElement)(Banner, { tone: "error", text: error }) : null,
    rows.map(
      (row) => (0, import_react3.createElement)(
        "div",
        { className: "nmx-switch-row", key: row.key },
        (0, import_react3.createElement)(
          "div",
          { className: "nmx-switch-text" },
          (0, import_react3.createElement)(
            "span",
            { className: "nmx-switch-title", style: row.danger ? { display: "flex", alignItems: "center", gap: 6 } : void 0 },
            row.danger ? (0, import_react3.createElement)(IconWarning, { size: 14 }) : null,
            row.title
          ),
          (0, import_react3.createElement)("span", { className: "nmx-switch-sub" }, row.hint)
        ),
        (0, import_react3.createElement)(import_dsh_client_ui_primitives.Switch, {
          checked: config.prefs[row.key],
          disabled: saving !== "",
          label: row.title,
          onChange: (next) => void toggle(row.key, next)
        })
      )
    )
  );
}
function AboutCard({
  t,
  config,
  status
}) {
  const gateway = status.gateway ?? {};
  const version = gateway.version ? String(gateway.version) : "\u2014";
  const online = gateway.online_devices_count ?? gateway.accounts_online;
  const caps = capabilities(t, status.actions);
  const source = (kind) => {
    if (kind === "state") return t("sourceState");
    if (kind === "row") return t("sourceRow");
    if (kind === "env") return t("sourceEnv");
    if (kind === "host") return t("sourceHost");
    return t("sourceDefault");
  };
  return (0, import_react3.createElement)(
    "div",
    { className: "nmx-card" },
    (0, import_react3.createElement)(
      "div",
      { className: "nmx-card-head" },
      (0, import_react3.createElement)(
        "div",
        null,
        (0, import_react3.createElement)("h3", { className: "nmx-card-title" }, t("aboutCard")),
        (0, import_react3.createElement)("p", { className: "nmx-card-sub" }, config.deviceName)
      )
    ),
    (0, import_react3.createElement)(
      "dl",
      { className: "nmx-kv" },
      (0, import_react3.createElement)("dt", null, t("deviceId")),
      (0, import_react3.createElement)("dd", null, status.deviceId),
      (0, import_react3.createElement)("dt", null, t("gatewayVersion")),
      (0, import_react3.createElement)("dd", null, version),
      (0, import_react3.createElement)("dt", null, t("onlineDevices")),
      (0, import_react3.createElement)("dd", null, online != null ? String(online) : "\u2014"),
      (0, import_react3.createElement)("dt", null, t("latency")),
      (0, import_react3.createElement)("dd", null, status.latencyMs != null ? `${status.latencyMs} ms` : "\u2014"),
      (0, import_react3.createElement)("dt", null, t("pendingTasks")),
      (0, import_react3.createElement)("dd", null, String(status.pendingTasks)),
      (0, import_react3.createElement)("dt", null, t("configSource")),
      (0, import_react3.createElement)("dd", null, source(config.source.baseURL)),
      (0, import_react3.createElement)("dt", null, t("configPath")),
      (0, import_react3.createElement)("dd", null, config.configPath)
    ),
    caps.length ? (0, import_react3.createElement)("div", { style: { display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 } }, caps.map((cap) => (0, import_react3.createElement)("span", { className: "nmx-chip", key: cap }, cap))) : null
  );
}
function Banner({ tone, text }) {
  const cls = tone === "ok" || tone === "success" ? "is-success" : tone === "error" ? "is-error" : "is-warn";
  return (0, import_react3.createElement)("div", { className: `nmx-banner ${cls}` }, tone === "error" || tone === "warn" ? (0, import_react3.createElement)(IconWarning, { size: 14 }) : null, (0, import_react3.createElement)("span", null, text));
}

// src/client/GatewayPage.ts
function GatewayPage({ t }) {
  const { snapshot, error, loading, refresh } = useGatewayStore();
  const config = snapshot?.config;
  const status = snapshot?.status;
  const devices = snapshot?.devices ?? [];
  const others = devices.filter((device) => !device.isThisDevice);
  const onlineOthers = others.filter((device) => device.online);
  const [target, setTarget] = (0, import_react4.useState)("");
  const [mode, setMode] = (0, import_react4.useState)("notify");
  const [text, setText] = (0, import_react4.useState)("");
  const [title, setTitle] = (0, import_react4.useState)("");
  const [sending, setSending] = (0, import_react4.useState)(false);
  const [sendError, setSendError] = (0, import_react4.useState)("");
  const [showSettings, setShowSettings] = (0, import_react4.useState)(false);
  const [notice, setNotice] = (0, import_react4.useState)(null);
  const [busyAction, setBusyAction] = (0, import_react4.useState)("");
  const [renaming, setRenaming] = (0, import_react4.useState)(false);
  const [nameDraft, setNameDraft] = (0, import_react4.useState)("");
  const [toast, setToast] = (0, import_react4.useState)(null);
  const seen = (0, import_react4.useRef)(/* @__PURE__ */ new Set());
  const composer = (0, import_react4.useRef)(null);
  (0, import_react4.useEffect)(() => {
    if (config) setNameDraft(config.deviceName);
  }, [config?.deviceName]);
  (0, import_react4.useEffect)(() => {
    if (onlineOthers.length === 0) {
      if (target) setTarget("");
      return;
    }
    if (!onlineOthers.some((device) => device.id === target)) setTarget(onlineOthers[0].id);
  }, [onlineOthers, target]);
  (0, import_react4.useEffect)(() => {
    const items = snapshot?.activity ?? [];
    if (seen.current.size === 0) {
      for (const item of items) seen.current.add(item.id);
      return;
    }
    for (const item of items) {
      if (seen.current.has(item.id)) continue;
      seen.current.add(item.id);
      if (item.direction !== "in") continue;
      if (item.action === "notify") {
        setToast({ key: Date.now(), title: item.title, body: item.detail ?? "" });
      } else if (item.action === "task" && item.status === "running") {
        setToast({ key: Date.now(), title: `${t("actTask")} \xB7 ${item.deviceName ?? ""}`, body: item.detail ?? "" });
      }
    }
  }, [snapshot?.activity, t]);
  const choose = (device, nextMode) => {
    setTarget(device.id);
    setMode(nextMode);
    setSendError("");
    setTimeout(() => composer.current?.focus(), 0);
  };
  const send = async () => {
    if (!target || !text.trim()) return;
    setSending(true);
    setSendError("");
    try {
      await api.forward({
        to: target,
        mode,
        text: text.trim(),
        ...mode === "notify" && title.trim() ? { title: title.trim() } : {}
      });
      setText("");
      setTitle("");
      await refresh();
    } catch (failure) {
      setSendError(messageOf(failure));
    } finally {
      setSending(false);
    }
  };
  const screenshot = async (device) => {
    setBusyAction(`screen:${device.id}`);
    setNotice(null);
    try {
      const result = await api.call({ to: device.id, action: "screen", args: {}, timeoutMs: 3e4 });
      const width = Number(result.result?.width ?? 0);
      const height = Number(result.result?.height ?? 0);
      setNotice({ type: "ok", text: `${device.name} \xB7 ${width}\xD7${height}` });
      await refresh();
    } catch (failure) {
      setNotice({ type: "error", text: messageOf(failure) });
    } finally {
      setBusyAction("");
    }
  };
  const rename = async (event) => {
    event?.preventDefault();
    if (!nameDraft.trim()) return;
    setBusyAction("rename");
    setNotice(null);
    try {
      await api.rename(nameDraft.trim());
      setRenaming(false);
      setNotice({ type: "ok", text: t("configSaved") });
      await refresh();
    } catch (failure) {
      setNotice({ type: "error", text: messageOf(failure) });
    } finally {
      setBusyAction("");
    }
  };
  const reconnect = async () => {
    setBusyAction("reconnect");
    setNotice(null);
    try {
      await api.reconnect();
      setNotice({ type: "ok", text: t("statusConnecting") });
      await refresh();
    } catch (failure) {
      setNotice({ type: "error", text: messageOf(failure) });
    } finally {
      setBusyAction("");
    }
  };
  const clearActivity = async () => {
    try {
      await api.clearActivity();
      await refresh();
    } catch (failure) {
      setNotice({ type: "error", text: messageOf(failure) });
    }
  };
  if (loading && !snapshot) {
    return (0, import_react4.createElement)("div", { className: "nmx-page" }, (0, import_react4.createElement)("div", { className: "nmx-inner" }, (0, import_react4.createElement)("div", { className: "nmx-empty" }, t("saving"))));
  }
  if (error && !snapshot) {
    return (0, import_react4.createElement)(
      "div",
      { className: "nmx-page" },
      (0, import_react4.createElement)(
        "div",
        { className: "nmx-inner" },
        (0, import_react4.createElement)(
          "div",
          { className: "nmx-empty-hero" },
          (0, import_react4.createElement)("h2", null, t("statusError")),
          (0, import_react4.createElement)("p", null, error),
          (0, import_react4.createElement)("div", null, (0, import_react4.createElement)(import_dsh_client_ui_primitives2.Button, { variant: "primary", size: "md", onClick: () => void refresh() }, t("refresh")))
        )
      )
    );
  }
  const connected = Boolean(status?.connected);
  const job = snapshot?.jobs?.[0];
  const thisDevice = devices.find((device) => device.isThisDevice);
  return (0, import_react4.createElement)(
    "div",
    { className: "nmx-page" },
    (0, import_react4.createElement)(
      "div",
      { className: "nmx-inner" },
      // ── header ──────────────────────────────────────────────────────
      (0, import_react4.createElement)(
        "div",
        { className: "nmx-head" },
        (0, import_react4.createElement)(
          "div",
          { className: "nmx-brand" },
          (0, import_react4.createElement)(Logo),
          (0, import_react4.createElement)(
            "div",
            null,
            (0, import_react4.createElement)("h1", { className: "nmx-h1" }, t("pageTitle")),
            (0, import_react4.createElement)("p", { className: "nmx-lead" }, t("pageLead"))
          )
        ),
        (0, import_react4.createElement)(
          "div",
          { className: "nmx-head-actions" },
          (0, import_react4.createElement)(StatusPill, { t, status }),
          (0, import_react4.createElement)(import_dsh_client_ui_primitives2.Button, { variant: "outline", size: "sm", icon: (0, import_react4.createElement)(IconRefresh, { size: 14 }), onClick: () => void refresh() }, t("refresh")),
          (0, import_react4.createElement)(import_dsh_client_ui_primitives2.Button, { variant: "ghost", size: "sm", icon: (0, import_react4.createElement)(IconSettings, { size: 14 }), onClick: () => setShowSettings((value) => !value) }, t("seeSettings")),
          config?.hasKey && !connected ? (0, import_react4.createElement)(import_dsh_client_ui_primitives2.Button, { variant: "ghost", size: "sm", disabled: busyAction !== "", onClick: () => void reconnect() }, busyAction === "reconnect" ? t("statusConnecting") : t("reconnect")) : null
        )
      ),
      // ── not configured yet ──────────────────────────────────────────
      !config?.hasKey ? (0, import_react4.createElement)(ConnectionSettings, { t, config: config ?? null, refresh, hero: true }) : null,
      // ── notices ─────────────────────────────────────────────────────
      error ? (0, import_react4.createElement)(Banner2, { tone: "error", text: error }) : null,
      status && !connected && status.lastError ? (0, import_react4.createElement)(Banner2, {
        tone: status.state === "unauthorized" ? "error" : "warn",
        text: `${status.lastError}${status.state === "unauthorized" ? ` \xB7 ${t("unauthorizedHint")}` : ` \xB7 ${t("disconnectedHint")}`}`
      }) : null,
      notice ? (0, import_react4.createElement)(Banner2, { tone: notice.type, text: notice.text }) : null,
      showSettings && config ? (0, import_react4.createElement)(ConnectionSettings, { t, config, refresh }) : null,
      // ── dashboard ───────────────────────────────────────────────────
      config?.hasKey ? (0, import_react4.createElement)(
        "div",
        { className: "nmx-grid" },
        (0, import_react4.createElement)(
          "div",
          { className: "nmx-col" },
          (0, import_react4.createElement)(DevicesCard, {
            t,
            devices,
            thisDevice,
            connected,
            status,
            busyAction,
            renaming,
            nameDraft,
            setNameDraft,
            setRenaming,
            rename,
            choose,
            screenshot,
            refresh
          })
        ),
        (0, import_react4.createElement)(
          "div",
          { className: "nmx-col" },
          (0, import_react4.createElement)(ComposerCard, {
            t,
            devices: onlineOthers,
            target,
            setTarget,
            mode,
            setMode,
            title,
            setTitle,
            text,
            setText,
            sending,
            sendError,
            send,
            composer,
            job
          }),
          (0, import_react4.createElement)(ActivityCard, { t, items: snapshot?.activity ?? [], clearActivity })
        )
      ) : null,
      (0, import_react4.createElement)(
        "div",
        { className: "nmx-foot" },
        (0, import_react4.createElement)("span", null, `${t("gateway")}: ${config?.baseURL ?? status?.baseURL ?? "\u2014"}`),
        (0, import_react4.createElement)(
          "span",
          { className: "nmx-inline" },
          status?.gateway && status.gateway.version ? `v${String(status.gateway.version)}` : null,
          (0, import_react4.createElement)("span", null, `\xB7 ${t("thisDevice")}: ${config?.deviceName ?? "\u2014"}`)
        )
      )
    ),
    toast ? (0, import_react4.createElement)(import_dsh_client_ui_primitives2.Toast, {
      key: toast.key,
      text: `${toast.title}${toast.body ? ` \xB7 ${toast.body}` : ""}`,
      holdMs: 6e3,
      onDone: () => setToast(null)
    }) : null
  );
}
function DevicesCard(props) {
  const { t, devices, thisDevice, connected, status, renaming, nameDraft } = props;
  const others = devices.filter((device) => !device.isThisDevice);
  const online = others.filter((device) => device.online).length;
  return (0, import_react4.createElement)(
    "section",
    { className: "nmx-card" },
    (0, import_react4.createElement)(
      "div",
      { className: "nmx-card-head" },
      (0, import_react4.createElement)(
        "div",
        null,
        (0, import_react4.createElement)("h2", { className: "nmx-card-title" }, t("devicesTitle")),
        (0, import_react4.createElement)("p", { className: "nmx-card-sub" }, t("devicesLead"))
      ),
      (0, import_react4.createElement)(
        "div",
        { className: "nmx-inline" },
        (0, import_react4.createElement)("span", { className: "nmx-count" }, `${online} ${t("devicesOnline")}`),
        (0, import_react4.createElement)(import_dsh_client_ui_primitives2.Button, { variant: "ghost", size: "sm", icon: (0, import_react4.createElement)(IconRefresh, { size: 13 }), onClick: () => void props.refresh() }, null)
      )
    ),
    // this computer
    (0, import_react4.createElement)(
      "div",
      { className: "nmx-device is-self", style: { marginBottom: 12 } },
      (0, import_react4.createElement)(
        "div",
        { className: "nmx-device-top" },
        (0, import_react4.createElement)(Glyph, { kind: "computer", online: connected }),
        (0, import_react4.createElement)(
          "div",
          { className: "nmx-device-main" },
          renaming ? (0, import_react4.createElement)(
            "form",
            { className: "nmx-rename", onSubmit: (event) => void props.rename(event) },
            (0, import_react4.createElement)(import_dsh_client_ui_primitives2.Input, {
              value: nameDraft,
              maxLength: 60,
              autoFocus: true,
              onChange: (event) => props.setNameDraft(event.currentTarget.value),
              "aria-label": t("rename")
            }),
            (0, import_react4.createElement)(import_dsh_client_ui_primitives2.Button, { variant: "primary", size: "sm", type: "submit", disabled: props.busyAction !== "" }, t("save")),
            (0, import_react4.createElement)(import_dsh_client_ui_primitives2.Button, { variant: "ghost", size: "sm", type: "button", onClick: () => props.setRenaming(false) }, t("cancel"))
          ) : (0, import_react4.createElement)(
            "div",
            { className: "nmx-device-name" },
            (0, import_react4.createElement)("span", null, thisDevice?.name ?? t("thisDevice")),
            (0, import_react4.createElement)("span", { className: "nmx-tag-self" }, t("thisComputerTag")),
            (0, import_react4.createElement)(
              import_dsh_client_ui_primitives2.Button,
              {
                variant: "ghost",
                size: "sm",
                icon: (0, import_react4.createElement)(IconPencil, { size: 13 }),
                title: t("rename"),
                "aria-label": t("rename"),
                onClick: () => props.setRenaming(true)
              },
              null
            )
          ),
          (0, import_react4.createElement)(
            "div",
            { className: "nmx-device-sub" },
            (0, import_react4.createElement)(Dot, { on: connected }),
            (0, import_react4.createElement)("span", null, `${connected ? t("statusConnected") : t("statusDisconnected")} \xB7 ${thisDevice?.os ?? ""}`)
          ),
          (0, import_react4.createElement)(
            "div",
            { className: "nmx-chips" },
            capabilities(t, thisDevice?.actions ?? []).map((cap) => (0, import_react4.createElement)("span", { className: "nmx-chip", key: cap }, cap))
          )
        )
      )
    ),
    // others
    others.length === 0 ? (0, import_react4.createElement)("div", { className: "nmx-empty" }, t("noOtherDevices")) : (0, import_react4.createElement)(
      "div",
      { className: "nmx-device-grid" },
      others.map(
        (device) => (0, import_react4.createElement)(DeviceCard, {
          key: device.id,
          t,
          device,
          busyAction: props.busyAction,
          onMessage: () => props.choose(device, "notify"),
          onTask: () => props.choose(device, "task"),
          onScreen: () => void props.screenshot(device)
        })
      )
    ),
    status && !connected && status.lastError ? (0, import_react4.createElement)("div", { className: "nmx-hint", style: { marginTop: 10 } }, status.lastError) : null
  );
}
function DeviceCard({
  t,
  device,
  busyAction,
  onMessage,
  onTask,
  onScreen
}) {
  const caps = capabilities(t, device.actions);
  const canTask = device.actions.includes("task");
  const canScreen = device.actions.includes("screen");
  return (0, import_react4.createElement)(
    "div",
    { className: "nmx-device" },
    (0, import_react4.createElement)(
      "div",
      { className: "nmx-device-top" },
      (0, import_react4.createElement)(Glyph, { kind: device.kind, online: device.online }),
      (0, import_react4.createElement)(
        "div",
        { className: "nmx-device-main" },
        (0, import_react4.createElement)("div", { className: "nmx-device-name" }, (0, import_react4.createElement)("span", { title: device.name }, device.name || t("unnamedDevice")), device.handle ? (0, import_react4.createElement)("span", { className: "nmx-chip" }, `@${device.handle}`) : null),
        (0, import_react4.createElement)(
          "div",
          { className: "nmx-device-sub" },
          (0, import_react4.createElement)(Dot, { on: device.online }),
          (0, import_react4.createElement)("span", null, [presence(t, device), device.os].filter(Boolean).join(" \xB7 "))
        )
      )
    ),
    caps.length ? (0, import_react4.createElement)("div", { className: "nmx-chips" }, caps.map((cap) => (0, import_react4.createElement)("span", { className: "nmx-chip", key: cap }, cap))) : null,
    (0, import_react4.createElement)(
      "div",
      { className: "nmx-actions" },
      (0, import_react4.createElement)(import_dsh_client_ui_primitives2.Button, { variant: "outline", size: "sm", disabled: !device.online, onClick: onMessage, icon: (0, import_react4.createElement)(IconSend, { size: 13 }) }, t("sendMessage")),
      canTask ? (0, import_react4.createElement)(import_dsh_client_ui_primitives2.Button, { variant: "ghost", size: "sm", disabled: !device.online, onClick: onTask, icon: (0, import_react4.createElement)(IconHub, { size: 13 }) }, t("sendTask")) : null,
      canScreen ? (0, import_react4.createElement)(import_dsh_client_ui_primitives2.Button, { variant: "ghost", size: "sm", disabled: !device.online || busyAction === `screen:${device.id}`, onClick: onScreen }, busyAction === `screen:${device.id}` ? t("jobRunning") : t("takeScreenshot")) : null
    )
  );
}
function ComposerCard(props) {
  const { t, devices, target, mode, sending } = props;
  return (0, import_react4.createElement)(
    "section",
    { className: "nmx-card" },
    (0, import_react4.createElement)(
      "div",
      { className: "nmx-card-head" },
      (0, import_react4.createElement)(
        "div",
        null,
        (0, import_react4.createElement)("h2", { className: "nmx-card-title" }, t("composerTitle")),
        (0, import_react4.createElement)("p", { className: "nmx-card-sub" }, t("composerLead"))
      )
    ),
    (0, import_react4.createElement)(
      "div",
      { className: "nmx-form" },
      (0, import_react4.createElement)(
        "div",
        { className: "nmx-field" },
        (0, import_react4.createElement)("span", { className: "nmx-label" }, t("targetDevice")),
        devices.length === 0 ? (0, import_react4.createElement)("div", { className: "nmx-hint" }, t("noTarget")) : (0, import_react4.createElement)(
          "div",
          { className: "nmx-pills" },
          devices.map(
            (device) => (0, import_react4.createElement)(
              "button",
              {
                type: "button",
                key: device.id,
                className: `nmx-pill${target === device.id ? " is-active" : ""}`,
                title: device.handle ? `@${device.handle}` : device.name,
                onClick: () => props.setTarget(device.id)
              },
              (0, import_react4.createElement)(Glyph, { kind: device.kind, online: device.online, size: 14, compact: true }),
              device.name || t("unnamedDevice")
            )
          )
        )
      ),
      (0, import_react4.createElement)(
        "div",
        { className: "nmx-inline", style: { justifyContent: "space-between" } },
        (0, import_react4.createElement)(
          "div",
          { className: "nmx-seg" },
          (0, import_react4.createElement)("button", { type: "button", className: mode === "notify" ? "is-active" : "", onClick: () => props.setMode("notify") }, t("modeNotify")),
          (0, import_react4.createElement)("button", { type: "button", className: mode === "task" ? "is-active" : "", onClick: () => props.setMode("task") }, t("modeTask"))
        ),
        mode === "notify" ? (0, import_react4.createElement)(
          "div",
          { style: { flex: 1, minWidth: 160, maxWidth: 280 } },
          (0, import_react4.createElement)(import_dsh_client_ui_primitives2.Input, {
            value: props.title,
            placeholder: t("messageTitlePlaceholder"),
            maxLength: 120,
            "aria-label": t("messageTitle"),
            onChange: (event) => props.setTitle(event.currentTarget.value)
          })
        ) : null
      ),
      (0, import_react4.createElement)("textarea", {
        ref: props.composer,
        className: "nmx-textarea",
        value: props.text,
        placeholder: mode === "task" ? t("taskPlaceholder") : t("messagePlaceholder"),
        onChange: (event) => props.setText(event.currentTarget.value),
        onKeyDown: (event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void props.send();
          }
        }
      }),
      props.sendError ? (0, import_react4.createElement)(Banner2, { tone: "error", text: props.sendError }) : null,
      (0, import_react4.createElement)(
        "div",
        { className: "nmx-right" },
        (0, import_react4.createElement)(import_dsh_client_ui_primitives2.Button, {
          variant: "primary",
          size: "md",
          icon: (0, import_react4.createElement)(IconSend, { size: 15 }),
          disabled: sending || !target || !props.text.trim(),
          onClick: () => void props.send()
        }, sending ? t("sending") : t("send"))
      )
    ),
    props.job ? (0, import_react4.createElement)(JobCard, { t, job: props.job }) : null
  );
}
function JobCard({ t, job }) {
  const events = job.events.slice(-10).reverse();
  return (0, import_react4.createElement)(
    "div",
    { className: "nmx-job" },
    (0, import_react4.createElement)(
      "div",
      { className: "nmx-job-head" },
      (0, import_react4.createElement)(
        "span",
        { style: { display: "inline-flex", alignItems: "center", gap: 7 } },
        (0, import_react4.createElement)(Dot, { on: job.status === "ok" }),
        `${job.mode === "task" ? t("modeTask") : t("modeNotify")} \u2192 ${job.deviceName}`
      ),
      (0, import_react4.createElement)(
        "span",
        { className: `nmx-state ${job.status === "ok" ? "is-ok" : job.status === "error" ? "is-error" : "is-running"}` },
        job.status === "running" ? t("jobRunning") : job.status === "ok" ? t("jobDone") : t("jobFailed")
      )
    ),
    events.length ? (0, import_react4.createElement)(
      "div",
      { className: "nmx-job-events" },
      events.map(
        (event, index) => (0, import_react4.createElement)(
          "div",
          { className: "nmx-job-event", key: `${event.at}-${index}` },
          (0, import_react4.createElement)("span", { className: "nmx-job-stage" }, stageLabel(t, event.stage)),
          (0, import_react4.createElement)("span", { className: "nmx-job-text" }, event.text)
        )
      )
    ) : null,
    job.result ? (0, import_react4.createElement)("div", { className: "nmx-job-result" }, job.result) : job.error ? (0, import_react4.createElement)("div", { className: "nmx-job-result", style: { color: "var(--dsw-alias-state-error-primary)" } }, job.error) : null
  );
}
function ActivityCard({
  t,
  items,
  clearActivity
}) {
  const ordered = [...items].reverse();
  return (0, import_react4.createElement)(
    "section",
    { className: "nmx-card" },
    (0, import_react4.createElement)(
      "div",
      { className: "nmx-card-head" },
      (0, import_react4.createElement)(
        "div",
        null,
        (0, import_react4.createElement)("h2", { className: "nmx-card-title" }, t("activityTitle")),
        (0, import_react4.createElement)("p", { className: "nmx-card-sub" }, t("activityLead"))
      ),
      items.length ? (0, import_react4.createElement)(import_dsh_client_ui_primitives2.Button, { variant: "ghost", size: "sm", onClick: () => void clearActivity() }, t("clearActivity")) : null
    ),
    ordered.length === 0 ? (0, import_react4.createElement)("div", { className: "nmx-empty" }, t("activityEmpty")) : (0, import_react4.createElement)(
      "div",
      { className: "nmx-activity" },
      ordered.map((item) => (0, import_react4.createElement)(ActivityRow, { key: item.id, t, item }))
    )
  );
}
function ActivityRow({ t, item }) {
  const directionClass = item.direction === "in" ? "in" : item.direction === "out" ? "out" : "sql";
  const Icon = item.direction === "in" ? IconArrowDownLeft : item.direction === "out" ? IconArrowUpRight : IconSettings;
  const actionLabel = item.action === "notify" ? t("actNotify") : item.action === "task" ? t("actTask") : item.action === "screen" ? t("actScreen") : item.action === "shell" ? t("actShell") : item.action === "open" ? t("actOpen") : item.action === "connect" ? t("actConnect") : item.action === "disconnect" ? t("actDisconnect") : item.action === "auth" ? t("actAuth") : item.action === "device-online" ? t("actOnline") : item.action === "device-offline" ? t("actOffline") : item.action;
  const state = item.status === "running" ? "is-running" : item.status === "ok" ? "is-ok" : item.status === "error" ? "is-error" : "";
  return (0, import_react4.createElement)(
    "div",
    { className: "nmx-activity-row" },
    (0, import_react4.createElement)("span", { className: `nmx-direction ${directionClass}` }, (0, import_react4.createElement)(Icon, { size: 13 })),
    (0, import_react4.createElement)(
      "div",
      { className: "nmx-activity-main" },
      (0, import_react4.createElement)(
        "div",
        { className: "nmx-activity-title" },
        item.direction === "in" && item.deviceName ? (0, import_react4.createElement)("span", { title: item.title }, `${item.deviceName} \xB7 ${item.title}`) : (0, import_react4.createElement)("span", { title: item.title }, item.title),
        item.status !== "info" ? (0, import_react4.createElement)("span", { className: `nmx-state ${state}` }, item.status === "running" ? "\xB7\xB7\xB7" : item.status === "ok" ? (0, import_react4.createElement)(IconCheck, { size: 11 }) : null) : null
      ),
      (0, import_react4.createElement)(
        "div",
        { className: "nmx-activity-meta" },
        [actionLabel, item.detail].filter(Boolean).join(" \xB7 ")
      )
    ),
    (0, import_react4.createElement)(
      "div",
      { className: "nmx-activity-side" },
      (0, import_react4.createElement)("span", null, ago(t, item.at / 1e3)),
      item.status === "running" ? (0, import_react4.createElement)("span", { className: "nmx-state is-running" }, t("jobRunning")) : null
    )
  );
}
function Banner2({ tone, text }) {
  const cls = tone === "ok" ? "is-success" : tone === "error" ? "is-error" : "is-warn";
  return (0, import_react4.createElement)("div", { className: `nmx-banner ${cls}` }, tone === "ok" ? (0, import_react4.createElement)(IconCheck, { size: 14 }) : (0, import_react4.createElement)(IconWarning, { size: 14 }), (0, import_react4.createElement)("span", null, text));
}
function StatusPill({ t, status }) {
  const state = status?.state ?? "idle";
  const connected = Boolean(status?.connected);
  const label = connected ? t("statusConnected") : state === "connecting" ? t("statusConnecting") : state === "unauthorized" ? t("statusUnauthorized") : state === "error" ? t("statusError") : t("statusDisconnected");
  const tone = connected ? "is-ok" : state === "unauthorized" || state === "error" ? "is-error" : state === "connecting" ? "is-warn" : "";
  return (0, import_react4.createElement)(
    "span",
    { className: `nmx-status ${tone}` },
    (0, import_react4.createElement)(Dot, { on: connected }),
    (0, import_react4.createElement)("span", null, label),
    connected && status?.latencyMs != null ? (0, import_react4.createElement)("span", { className: "nmx-status-meta" }, `${status.latencyMs} ms`) : null
  );
}
function stageLabel(t, stage) {
  if (stage === "tool") return t("stageTool");
  if (stage === "tool_result") return t("stageToolResult");
  if (stage === "text") return t("stageText");
  if (stage === "approval") return t("stageApproval");
  if (stage === "approval_result") return t("stageApprovalResult");
  if (stage === "error") return t("stageError");
  if (stage === "thinking") return t("stageThinking");
  return stage;
}

// src/client/locales.ts
var en = {
  railTitle: "Cross-device",
  pageTitle: "Cross-device hub",
  pageLead: "Forward messages and tasks between this computer, your phone and your other computers. One nanoMuse account, no ports, no pairing codes.",
  statusConnected: "Connected",
  statusConnecting: "Connecting",
  statusDisconnected: "Not connected",
  statusError: "Connection problem",
  statusUnauthorized: "Sign-in refused",
  gateway: "Gateway",
  account: "Account",
  thisDevice: "This computer",
  online: "online",
  offline: "offline",
  justNow: "just now",
  minutesAgo: "min ago",
  hoursAgo: "h ago",
  daysAgo: "d ago",
  never: "never",
  refresh: "Refresh",
  reconnect: "Reconnect",
  openSettings: "Connection settings",
  notConfiguredTitle: "Connect this computer to your devices",
  notConfiguredLead: "Enter the address of your nanoMuse gateway and the account you use on the phone. The phone signs in with the same account and appears here by itself.",
  setupConnect: "Connect",
  setupTest: "Test address",
  fieldBaseURL: "Gateway address",
  fieldIdentifier: "Account",
  fieldPassword: "Password",
  fieldNewPassword: "New gateway password",
  fieldDeviceName: "This computer\u2019s name",
  phBaseURL: "http://127.0.0.1:8790",
  phIdentifier: "admin",
  phPassword: "Account password",
  phNewPassword: "Optional: change the account password on the gateway",
  phDeviceName: "e.g. Office PC",
  presetLocal: "Local gateway",
  testConnection: "Test connection",
  saveConnect: "Save and connect",
  disconnect: "Disconnect",
  saving: "Saving\u2026",
  testing: "Testing\u2026",
  connecting: "Connecting\u2026",
  devicesTitle: "Devices",
  devicesLead: "Devices of this account that are on the gateway. A message or a task goes to the device you pick.",
  devicesOnline: "devices online",
  otherDevices: "Other devices",
  noOtherDevices: "No other device yet. Open nanoMuse on your phone and sign in with the same account, or connect another computer with this plugin.",
  capabilities: "Can",
  capTask: "Tasks",
  capNotify: "Notifications",
  capScreen: "Screenshots",
  capShell: "Commands",
  capOpen: "Open links",
  lastSeen: "Last seen",
  sendMessage: "Message",
  sendTask: "Task",
  takeScreenshot: "Screenshot",
  rename: "Rename",
  save: "Save",
  cancel: "Cancel",
  composerTitle: "Forward a message",
  composerLead: "A notice appears on the other device. A task runs there in its own agent session and the answer comes back here.",
  targetDevice: "To",
  modeNotify: "Notice",
  modeTask: "Task",
  messageTitle: "Title",
  messageTitlePlaceholder: "e.g. From the office",
  messageText: "Message",
  messagePlaceholder: "Tell the phone what to know\u2026",
  taskPlaceholder: "Tell the other device what to do\u2026",
  send: "Send",
  sending: "Sending\u2026",
  noTarget: "No online device to send to.",
  jobRunning: "Running",
  jobDone: "Done",
  jobFailed: "Failed",
  activityTitle: "Recent activity",
  activityLead: "Messages and tasks in both directions, with their outcome.",
  activityEmpty: "Nothing forwarded yet.",
  clearActivity: "Clear",
  settingsTitle: "Cross-device hub",
  settingsLead: "The gateway, this computer\u2019s name, and what other devices may do here.",
  connectionCard: "Gateway connection",
  permissionsCard: "What other devices may do here",
  aboutCard: "This computer",
  permAutoConnect: "Connect when DSH starts",
  permAutoConnectHint: "The saved key is reused; you do not need to type the password again.",
  permAutoSync: "Also point the nanoMuse core plugin at this gateway",
  permAutoSyncHint: "Only applies when the nanoMuse plugin is installed.",
  permTask: "Run tasks from other devices",
  permTaskHint: "A task opens a session named \u201CFrom <device>\u201D and runs this computer\u2019s agent.",
  permNotify: "Receive notifications",
  permNotifyHint: "A notice from the phone appears here and as a system notification.",
  permScreen: "Let other devices take a screenshot",
  permScreenHint: "The picture goes back over the gateway and is not stored here.",
  permOpen: "Let other devices open links",
  permOpenHint: "Only http(s) links.",
  permShell: "Let other devices run commands",
  permShellHint: "Dangerous: this runs commands on this computer with your permissions. Keep it off unless you need it.",
  permRelayApprovals: "Send approval cards to the device that asked",
  permRelayApprovalsHint: "The person answering a remote task is usually at the other device.",
  configSource: "Where the values come from",
  sourceState: "saved in the Web UI",
  sourceRow: "plugin configuration",
  sourceEnv: "environment",
  sourceDefault: "default",
  sourceHost: "host name",
  configPath: "Configuration file",
  gatewayVersion: "Gateway version",
  onlineDevices: "Online devices",
  latency: "Round trip",
  pendingTasks: "Remote tasks running",
  deviceId: "Device ID",
  actionsLabel: "Advertised actions",
  pluginConfigTitle: "Cross-device hub configuration",
  pluginConfigLead: "Same settings as Settings \u2192 Cross-device hub.",
  copied: "Copied",
  copy: "Copy",
  errorPrefix: "Error",
  noticeTitle: "Message from another device",
  disconnectedHint: "The saved sign-in is still here. Reconnect, or open the settings to change the gateway.",
  unauthorizedHint: "The gateway refused the saved key. Sign in again with the account password.",
  configSaved: "Saved.",
  connectOk: "Connected to the gateway.",
  testOk: "The gateway answered.",
  disconnecting: "Disconnecting\u2026",
  unnamedDevice: "Unnamed device",
  thisComputerTag: "this computer",
  searchPlaceholder: "Filter devices\u2026",
  noResults: "No device matches.",
  tasksRunning: "task(s) running",
  seeSettings: "Settings",
  close: "Close",
  actNotify: "Notice",
  actTask: "Task",
  actScreen: "Screenshot",
  actShell: "Command",
  actOpen: "Link",
  actConnect: "Gateway connected",
  actDisconnect: "Gateway disconnected",
  actAuth: "Sign-in",
  actOnline: "Device online",
  actOffline: "Device offline",
  stageTool: "tool",
  stageToolResult: "result",
  stageText: "text",
  stageApproval: "approval",
  stageApprovalResult: "approval result",
  stageError: "error",
  stageThinking: "thinking",
  fromDevice: "from",
  configLabel: "Config",
  mentionOnline: "online",
  mentionOffline: "offline",
  mentionSectionOnline: "Online",
  mentionSectionOffline: "Offline",
  mentionDockTitle: "Devices",
  mentionDockHint: "Type @ in the composer to pick a device; the message is delivered to it",
  mentionDockSending: "sending",
  mentionDockDone: "delivered",
  mentionDockPartial: "partly delivered",
  mentionDockError: "failed",
  mentionDockCount: "{n} online"
};
var zh = {
  railTitle: "\u8DE8\u7AEF",
  pageTitle: "\u8DE8\u7AEF\u4E2D\u67A2",
  pageLead: "\u5728\u672C\u673A\u3001\u624B\u673A\u548C\u5176\u4ED6\u7535\u8111\u4E4B\u95F4\u8F6C\u53D1\u6D88\u606F\u4E0E\u4EFB\u52A1\u3002\u540C\u4E00\u4E2A nanoMuse \u8D26\u53F7\uFF0C\u4E0D\u7528\u7AEF\u53E3\u6620\u5C04\uFF0C\u4E5F\u4E0D\u7528\u914D\u5BF9\u7801\u3002",
  statusConnected: "\u5DF2\u8FDE\u63A5",
  statusConnecting: "\u8FDE\u63A5\u4E2D",
  statusDisconnected: "\u672A\u8FDE\u63A5",
  statusError: "\u8FDE\u63A5\u5F02\u5E38",
  statusUnauthorized: "\u51ED\u636E\u88AB\u62D2\u7EDD",
  gateway: "\u7F51\u5173",
  account: "\u8D26\u53F7",
  thisDevice: "\u672C\u673A",
  online: "\u5728\u7EBF",
  offline: "\u79BB\u7EBF",
  justNow: "\u521A\u521A",
  minutesAgo: "\u5206\u949F\u524D",
  hoursAgo: "\u5C0F\u65F6\u524D",
  daysAgo: "\u5929\u524D",
  never: "\u4ECE\u672A",
  refresh: "\u5237\u65B0",
  reconnect: "\u91CD\u65B0\u8FDE\u63A5",
  openSettings: "\u8FDE\u63A5\u8BBE\u7F6E",
  notConfiguredTitle: "\u628A\u8FD9\u53F0\u7535\u8111\u63A5\u5165\u4F60\u7684\u8BBE\u5907",
  notConfiguredLead: "\u586B\u5199 nanoMuse \u7F51\u5173\u5730\u5740\u548C\u624B\u673A\u4E0A\u4F7F\u7528\u7684\u540C\u4E00\u8D26\u53F7\u3002\u624B\u673A\u767B\u5F55\u540C\u4E00\u8D26\u53F7\u540E\u4F1A\u81EA\u52A8\u51FA\u73B0\u5728\u8FD9\u91CC\u3002",
  setupConnect: "\u8FDE\u63A5",
  setupTest: "\u6D4B\u8BD5\u5730\u5740",
  fieldBaseURL: "\u7F51\u5173\u5730\u5740",
  fieldIdentifier: "\u8D26\u53F7",
  fieldPassword: "\u5BC6\u7801",
  fieldNewPassword: "\u65B0\u7684\u7F51\u5173\u5BC6\u7801",
  fieldDeviceName: "\u8FD9\u53F0\u7535\u8111\u7684\u540D\u79F0",
  phBaseURL: "http://127.0.0.1:8790",
  phIdentifier: "admin",
  phPassword: "\u8D26\u53F7\u5BC6\u7801",
  phNewPassword: "\u53EF\u9009\uFF1A\u540C\u65F6\u4FEE\u6539\u7F51\u5173\u4E0A\u7684\u8D26\u53F7\u5BC6\u7801",
  phDeviceName: "\u4F8B\u5982\uFF1A\u529E\u516C\u5BA4\u7535\u8111",
  presetLocal: "\u672C\u673A\u7F51\u5173",
  testConnection: "\u6D4B\u8BD5\u8FDE\u63A5",
  saveConnect: "\u4FDD\u5B58\u5E76\u8FDE\u63A5",
  disconnect: "\u65AD\u5F00\u8FDE\u63A5",
  saving: "\u4FDD\u5B58\u4E2D\u2026",
  testing: "\u6D4B\u8BD5\u4E2D\u2026",
  connecting: "\u8FDE\u63A5\u4E2D\u2026",
  devicesTitle: "\u8BBE\u5907",
  devicesLead: "\u8FD9\u4E2A\u8D26\u53F7\u4E0B\u5DF2\u63A5\u5165\u7F51\u5173\u7684\u8BBE\u5907\u3002\u6D88\u606F\u6216\u4EFB\u52A1\u4F1A\u53D1\u5230\u4F60\u9009\u62E9\u7684\u8BBE\u5907\u3002",
  devicesOnline: "\u53F0\u8BBE\u5907\u5728\u7EBF",
  otherDevices: "\u5176\u4ED6\u8BBE\u5907",
  noOtherDevices: "\u8FD8\u6CA1\u6709\u5176\u4ED6\u8BBE\u5907\u3002\u5728\u624B\u673A\u4E0A\u6253\u5F00 nanoMuse \u5E76\u7528\u540C\u4E00\u8D26\u53F7\u767B\u5F55\uFF0C\u6216\u5728\u53E6\u4E00\u53F0\u7535\u8111\u4E0A\u5B89\u88C5\u672C\u63D2\u4EF6\u3002",
  capabilities: "\u80FD\u529B",
  capTask: "\u4EFB\u52A1",
  capNotify: "\u901A\u77E5",
  capScreen: "\u622A\u5C4F",
  capShell: "\u547D\u4EE4",
  capOpen: "\u6253\u5F00\u94FE\u63A5",
  lastSeen: "\u6700\u540E\u5728\u7EBF",
  sendMessage: "\u53D1\u6D88\u606F",
  sendTask: "\u59D4\u6258",
  takeScreenshot: "\u622A\u5C4F",
  rename: "\u91CD\u547D\u540D",
  save: "\u4FDD\u5B58",
  cancel: "\u53D6\u6D88",
  composerTitle: "\u8F6C\u53D1\u6D88\u606F",
  composerLead: "\u901A\u77E5\u4F1A\u5728\u5BF9\u65B9\u8BBE\u5907\u4E0A\u5F39\u51FA\u6765\uFF1B\u4EFB\u52A1\u4F1A\u5728\u5BF9\u65B9\u81EA\u5DF1\u7684\u4F1A\u8BDD\u91CC\u8FD0\u884C\uFF0C\u7B54\u6848\u56DE\u5230\u8FD9\u91CC\u3002",
  targetDevice: "\u53D1\u9001\u5230",
  modeNotify: "\u901A\u77E5",
  modeTask: "\u4EFB\u52A1",
  messageTitle: "\u6807\u9898",
  messageTitlePlaceholder: "\u4F8B\u5982\uFF1A\u6765\u81EA\u529E\u516C\u5BA4",
  messageText: "\u5185\u5BB9",
  messagePlaceholder: "\u544A\u8BC9\u624B\u673A\u4E00\u4EF6\u4E8B\u2026",
  taskPlaceholder: "\u544A\u8BC9\u53E6\u4E00\u53F0\u8BBE\u5907\u8981\u505A\u4EC0\u4E48\u2026",
  send: "\u53D1\u9001",
  sending: "\u53D1\u9001\u4E2D\u2026",
  noTarget: "\u6CA1\u6709\u53EF\u53D1\u9001\u7684\u5728\u7EBF\u8BBE\u5907\u3002",
  jobRunning: "\u8FDB\u884C\u4E2D",
  jobDone: "\u5B8C\u6210",
  jobFailed: "\u5931\u8D25",
  activityTitle: "\u6700\u8FD1\u52A8\u6001",
  activityLead: "\u4E24\u4E2A\u65B9\u5411\u7684\u6D88\u606F\u548C\u4EFB\u52A1\uFF0C\u4EE5\u53CA\u5B83\u4EEC\u7684\u7ED3\u679C\u3002",
  activityEmpty: "\u8FD8\u6CA1\u6709\u8F6C\u53D1\u8BB0\u5F55\u3002",
  clearActivity: "\u6E05\u7A7A",
  settingsTitle: "\u8DE8\u7AEF\u4E2D\u67A2",
  settingsLead: "\u7F51\u5173\u3001\u8FD9\u53F0\u7535\u8111\u7684\u540D\u79F0\uFF0C\u4EE5\u53CA\u5141\u8BB8\u5176\u4ED6\u8BBE\u5907\u5728\u8FD9\u91CC\u505A\u4EC0\u4E48\u3002",
  connectionCard: "\u7F51\u5173\u8FDE\u63A5",
  permissionsCard: "\u5176\u4ED6\u8BBE\u5907\u53EF\u4EE5\u5728\u8FD9\u91CC\u505A\u4EC0\u4E48",
  aboutCard: "\u8FD9\u53F0\u7535\u8111",
  permAutoConnect: "DSH \u542F\u52A8\u65F6\u81EA\u52A8\u8FDE\u63A5",
  permAutoConnectHint: "\u590D\u7528\u5DF2\u4FDD\u5B58\u7684\u51ED\u636E\uFF0C\u4E0D\u9700\u8981\u518D\u6B21\u8F93\u5165\u5BC6\u7801\u3002",
  permAutoSync: "\u540C\u65F6\u8BA9 nanoMuse \u6838\u5FC3\u63D2\u4EF6\u4F7F\u7528\u8FD9\u4E2A\u7F51\u5173",
  permAutoSyncHint: "\u53EA\u6709\u5B89\u88C5\u4E86 nanoMuse \u63D2\u4EF6\u65F6\u624D\u751F\u6548\u3002",
  permTask: "\u63A5\u53D7\u5176\u4ED6\u8BBE\u5907\u7684\u4EFB\u52A1",
  permTaskHint: "\u4EFB\u52A1\u4F1A\u65B0\u5EFA\u6807\u9898\u4E3A\u300C\u6765\u81EA <\u8BBE\u5907>\u300D\u7684\u4F1A\u8BDD\uFF0C\u7531\u672C\u673A Agent \u6267\u884C\u3002",
  permNotify: "\u63A5\u6536\u63D0\u9192",
  permNotifyHint: "\u624B\u673A\u53D1\u6765\u7684\u901A\u77E5\u4F1A\u663E\u793A\u5728\u8FD9\u91CC\uFF0C\u5E76\u5C3D\u91CF\u5F39\u51FA\u7CFB\u7EDF\u901A\u77E5\u3002",
  permScreen: "\u5141\u8BB8\u5176\u4ED6\u8BBE\u5907\u622A\u5C4F",
  permScreenHint: "\u622A\u56FE\u901A\u8FC7\u7F51\u5173\u56DE\u4F20\uFF0C\u4E0D\u4F1A\u4FDD\u5B58\u5728\u672C\u673A\u3002",
  permOpen: "\u5141\u8BB8\u5176\u4ED6\u8BBE\u5907\u6253\u5F00\u94FE\u63A5",
  permOpenHint: "\u53EA\u63A5\u53D7 http(s) \u94FE\u63A5\u3002",
  permShell: "\u5141\u8BB8\u5176\u4ED6\u8BBE\u5907\u6267\u884C\u547D\u4EE4",
  permShellHint: "\u9AD8\u5371\uFF1A\u4F1A\u4EE5\u4F60\u7684\u6743\u9650\u5728\u672C\u673A\u6267\u884C\u547D\u4EE4\u3002\u9664\u975E\u786E\u5B9E\u9700\u8981\uFF0C\u4FDD\u6301\u5173\u95ED\u3002",
  permRelayApprovals: "\u628A\u5BA1\u6279\u5361\u7247\u53D1\u56DE\u53D1\u8D77\u4EFB\u52A1\u7684\u8BBE\u5907",
  permRelayApprovalsHint: "\u8FDC\u7A0B\u4EFB\u52A1\u901A\u5E38\u7531\u53D1\u8D77\u8005\u672C\u4EBA\u5728\u53E6\u4E00\u53F0\u8BBE\u5907\u4E0A\u786E\u8BA4\u3002",
  configSource: "\u914D\u7F6E\u6765\u6E90",
  sourceState: "\u7F51\u9875\u4E2D\u4FDD\u5B58",
  sourceRow: "\u63D2\u4EF6\u914D\u7F6E",
  sourceEnv: "\u73AF\u5883\u53D8\u91CF",
  sourceDefault: "\u9ED8\u8BA4\u503C",
  sourceHost: "\u4E3B\u673A\u540D",
  configPath: "\u914D\u7F6E\u6587\u4EF6",
  gatewayVersion: "\u7F51\u5173\u7248\u672C",
  onlineDevices: "\u5728\u7EBF\u8BBE\u5907",
  latency: "\u5F80\u8FD4\u5EF6\u8FDF",
  pendingTasks: "\u6B63\u5728\u8FD0\u884C\u7684\u8FDC\u7A0B\u4EFB\u52A1",
  deviceId: "\u8BBE\u5907 ID",
  actionsLabel: "\u5BF9\u5916\u516C\u5E03\u7684\u52A8\u4F5C",
  pluginConfigTitle: "\u8DE8\u7AEF\u4E2D\u67A2\u914D\u7F6E",
  pluginConfigLead: "\u4E0E\u300C\u8BBE\u7F6E \u2192 \u8DE8\u7AEF\u4E2D\u67A2\u300D\u76F8\u540C\u3002",
  copied: "\u5DF2\u590D\u5236",
  copy: "\u590D\u5236",
  errorPrefix: "\u9519\u8BEF",
  noticeTitle: "\u6765\u81EA\u5176\u4ED6\u8BBE\u5907\u7684\u6D88\u606F",
  disconnectedHint: "\u5DF2\u4FDD\u5B58\u7684\u767B\u5F55\u8FD8\u5728\u3002\u91CD\u65B0\u8FDE\u63A5\uFF0C\u6216\u6253\u5F00\u8BBE\u7F6E\u4FEE\u6539\u7F51\u5173\u5730\u5740\u3002",
  unauthorizedHint: "\u7F51\u5173\u62D2\u7EDD\u4E86\u4FDD\u5B58\u7684\u51ED\u636E\u3002\u8BF7\u7528\u8D26\u53F7\u5BC6\u7801\u91CD\u65B0\u767B\u5F55\u3002",
  configSaved: "\u5DF2\u4FDD\u5B58\u3002",
  connectOk: "\u5DF2\u8FDE\u63A5\u7F51\u5173\u3002",
  testOk: "\u7F51\u5173\u5DF2\u54CD\u5E94\u3002",
  disconnecting: "\u6B63\u5728\u65AD\u5F00\u2026",
  unnamedDevice: "\u672A\u547D\u540D\u8BBE\u5907",
  thisComputerTag: "\u672C\u673A",
  searchPlaceholder: "\u7B5B\u9009\u8BBE\u5907\u2026",
  noResults: "\u6CA1\u6709\u5339\u914D\u7684\u8BBE\u5907\u3002",
  tasksRunning: "\u4E2A\u4EFB\u52A1\u8FDB\u884C\u4E2D",
  seeSettings: "\u8BBE\u7F6E",
  close: "\u5173\u95ED",
  actNotify: "\u901A\u77E5",
  actTask: "\u4EFB\u52A1",
  actScreen: "\u622A\u5C4F",
  actShell: "\u547D\u4EE4",
  actOpen: "\u94FE\u63A5",
  actConnect: "\u7F51\u5173\u5DF2\u8FDE\u63A5",
  actDisconnect: "\u7F51\u5173\u5DF2\u65AD\u5F00",
  actAuth: "\u767B\u5F55",
  actOnline: "\u8BBE\u5907\u4E0A\u7EBF",
  actOffline: "\u8BBE\u5907\u79BB\u7EBF",
  stageTool: "\u5DE5\u5177",
  stageToolResult: "\u7ED3\u679C",
  stageText: "\u8F93\u51FA",
  stageApproval: "\u5BA1\u6279",
  stageApprovalResult: "\u5BA1\u6279\u7ED3\u679C",
  stageError: "\u9519\u8BEF",
  stageThinking: "\u601D\u8003",
  fromDevice: "\u6765\u81EA",
  configLabel: "\u914D\u7F6E",
  mentionOnline: "\u5728\u7EBF",
  mentionOffline: "\u79BB\u7EBF",
  mentionSectionOnline: "\u5728\u7EBF\u8BBE\u5907",
  mentionSectionOffline: "\u79BB\u7EBF\u8BBE\u5907",
  mentionDockTitle: "\u8DE8\u7AEF\u8BBE\u5907",
  mentionDockHint: "\u5728\u8F93\u5165\u6846\u8F93\u5165 @ \u9009\u62E9\u8BBE\u5907\uFF0C\u6D88\u606F\u4F1A\u76F4\u63A5\u6295\u9012\u5230\u8BE5\u8BBE\u5907",
  mentionDockSending: "\u6295\u9012\u4E2D",
  mentionDockDone: "\u5DF2\u9001\u8FBE",
  mentionDockPartial: "\u90E8\u5206\u9001\u8FBE",
  mentionDockError: "\u5931\u8D25",
  mentionDockCount: "{n} \u53F0\u5728\u7EBF"
};

// src/client/mentions.ts
var import_react5 = require("react");
var API2 = "/nanomuse/gateway";
var SOURCE = "device";
var cache = {
  devices: [],
  connected: false,
  at: 0
};
var inflight = null;
var lexiconListeners = /* @__PURE__ */ new Set();
function notifyLexicon() {
  for (const listener of [...lexiconListeners]) {
    try {
      listener();
    } catch {
    }
  }
}
function refreshDevices() {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const response = await fetch(`${API2}/devices`, { headers: { accept: "application/json" } });
      if (!response.ok) return cache.devices;
      const data = await response.json();
      const next = (Array.isArray(data.devices) ? data.devices : []).map((raw) => raw).filter((item) => item && typeof item.id === "string" && typeof item.handle === "string").map((item) => ({
        id: String(item.id),
        name: String(item.name ?? item.id),
        kind: String(item.kind ?? "computer"),
        handle: String(item.handle),
        online: item.online !== false,
        actions: Array.isArray(item.actions) ? item.actions.map(String) : [],
        os: String(item.os ?? "")
      }));
      const changed = next.length !== cache.devices.length || next.some((item, index) => {
        const previous = cache.devices[index];
        return !previous || previous.handle !== item.handle || previous.online !== item.online || previous.name !== item.name;
      });
      cache.devices = next;
      cache.connected = Boolean(data.connected);
      cache.at = Date.now();
      if (changed) notifyLexicon();
    } catch {
    } finally {
      inflight = null;
    }
    return cache.devices;
  })();
  return inflight;
}
function handles() {
  return cache.devices.map((device) => device.handle);
}
function findByHandle(handle) {
  const key = String(handle ?? "").trim().toLowerCase();
  if (!key) return void 0;
  return cache.devices.find((device) => device.handle.toLowerCase() === key);
}
function DeviceGlyph({ size = 14 }) {
  return (0, import_react5.createElement)(
    "svg",
    { width: size, height: size, viewBox: "0 0 16 16", fill: "none", "aria-hidden": true },
    (0, import_react5.createElement)("rect", { x: 2.4, y: 1.6, width: 11.2, height: 8.6, rx: 1.6, stroke: "currentColor", strokeWidth: 1.2 }),
    (0, import_react5.createElement)("path", { d: "M8 10.4v3M5.4 13.6h5.2", stroke: "currentColor", strokeWidth: 1.2, strokeLinecap: "round" })
  );
}
var chipStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "0 7px",
  margin: "0 2px",
  borderRadius: 999,
  fontSize: "0.92em",
  lineHeight: 1.7,
  fontWeight: 500,
  verticalAlign: "baseline",
  whiteSpace: "nowrap",
  color: "var(--dsw-alias-brand-primary)",
  background: "color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent)",
  border: "1px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 32%, transparent)"
};
function DeviceChip({ node, raw }) {
  const data = node?.data ?? {};
  const online = data.online !== false;
  const label = String(data.name ?? data.handle ?? "");
  return (0, import_react5.createElement)(
    "span",
    {
      style: chipStyle,
      title: data.name && data.handle ? `@${data.handle} \xB7 ${data.name}` : raw || label,
      "data-device-chip": data.handle || true
    },
    (0, import_react5.createElement)("span", {
      "aria-hidden": true,
      style: {
        width: 6,
        height: 6,
        borderRadius: 999,
        flex: "none",
        display: "inline-block",
        background: online ? "var(--dsw-alias-state-success-primary)" : "var(--dsw-alias-state-idle-primary, #9ca3af)"
      }
    }),
    (0, import_react5.createElement)("span", { style: { whiteSpace: "nowrap" } }, `@${label}`)
  );
}
function statusOf(t, status) {
  if (status === "done") return { text: t("mentionDockDone"), color: "var(--dsw-alias-state-success-primary)" };
  if (status === "partial") return { text: t("mentionDockPartial"), color: "var(--dsw-alias-state-warn-primary, #d97706)" };
  if (status === "error") return { text: t("mentionDockError"), color: "var(--dsw-alias-state-error-primary)" };
  return { text: t("mentionDockSending"), color: "var(--dsw-alias-label-secondary)" };
}
function MentionDock({ t, sessionId }) {
  const [state, setState] = (0, import_react5.useState)({ connected: false, items: [] });
  (0, import_react5.useEffect)(() => {
    let alive = true;
    const load = async () => {
      try {
        const response = await fetch(`${API2}/mentions?limit=20`, { headers: { accept: "application/json" } });
        if (!response.ok) return;
        const data = await response.json();
        if (!alive) return;
        setState({ connected: Boolean(data.connected), items: Array.isArray(data.items) ? data.items : [] });
      } catch {
      }
    };
    void load();
    const timer = setInterval(() => void load(), 4e3);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  const items = state.items.filter((item) => !sessionId || !item.sessionId || String(item.sessionId) === String(sessionId)).slice(0, 3);
  if (!state.connected && items.length === 0) return null;
  const onlineCount = cache.devices.filter((device) => device.online).length;
  return (0, import_react5.createElement)(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
        padding: "2px 4px",
        fontSize: 11,
        color: "var(--dsw-alias-label-secondary)"
      }
    },
    (0, import_react5.createElement)(
      "span",
      { style: { display: "inline-flex", alignItems: "center", gap: 4, flex: "none" } },
      (0, import_react5.createElement)("span", { style: { display: "inline-flex", color: "var(--dsw-alias-brand-primary)" } }, (0, import_react5.createElement)(DeviceGlyph, { size: 12 })),
      (0, import_react5.createElement)("span", { style: { fontWeight: 500 } }, t("mentionDockTitle")),
      state.connected && onlineCount > 0 ? (0, import_react5.createElement)("span", { style: { opacity: 0.7 } }, t("mentionDockCount", { n: onlineCount })) : null
    ),
    items.length === 0 ? (0, import_react5.createElement)("span", { style: { opacity: 0.65 } }, t("mentionDockHint")) : (0, import_react5.createElement)(
      "div",
      { style: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", minWidth: 0 } },
      items.map((item) => {
        const status = statusOf(t, item.status);
        const targets = Array.isArray(item.targets) ? item.targets : [];
        const label = targets.map((target) => `@${target.handle}`).join(" ") || item.origin || "";
        const tooltip = [item.text, ...Array.isArray(item.results) ? item.results.map((result) => result.error || result.reply).filter(Boolean) : []].filter(Boolean).join("\n\n");
        return (0, import_react5.createElement)(
          "span",
          { key: item.id, title: tooltip, style: { display: "inline-flex", alignItems: "center", gap: 5, minWidth: 0, maxWidth: 280 } },
          (0, import_react5.createElement)("span", { style: { fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, label),
          (0, import_react5.createElement)("span", { style: { color: status.color, flex: "none" } }, `\xB7 ${status.text}`)
        );
      })
    )
  );
}
function createDeviceSource(t) {
  return {
    trigger: "@",
    name: SOURCE,
    order: 1,
    showGroupTitle: false,
    warm() {
      void refreshDevices();
    },
    async candidates(_session, { query, signal }) {
      if (cache.devices.length === 0) await refreshDevices();
      if (signal?.aborted) return [];
      const needle = String(query ?? "").trim().toLowerCase();
      const rows = cache.devices.filter((device) => {
        if (!needle) return true;
        return device.name.toLowerCase().includes(needle) || device.handle.toLowerCase().includes(needle);
      });
      return rows.slice().sort((a, b) => Number(b.online) - Number(a.online)).map((device) => ({
        name: device.name,
        label: device.name,
        description: `@${device.handle} \xB7 ${device.online ? t("mentionOnline") : t("mentionOffline")}`,
        icon: DeviceGlyph,
        section: device.online ? t("mentionSectionOnline") : t("mentionSectionOffline"),
        value: device.handle
      }));
    },
    lexicon() {
      return handles();
    },
    subscribeLexicon(_session, listener) {
      lexiconListeners.add(listener);
      return () => {
        lexiconListeners.delete(listener);
      };
    },
    onPick({ candidate }) {
      const device = findByHandle(candidate?.value);
      const handle = device ? device.handle : String(candidate?.value ?? "");
      if (!handle) return void 0;
      return { text: `@${handle} ` };
    },
    openReference() {
      return false;
    }
  };
}
var deviceRule = {
  id: SOURCE,
  order: 10,
  match(text, from, context) {
    let names = null;
    try {
      const fromFacts = context?.read?.("deviceHandles");
      if (Array.isArray(fromFacts) && fromFacts.length > 0) names = fromFacts.map(String);
    } catch {
    }
    if (!names) names = handles();
    if (!names || names.length === 0) return void 0;
    const lowered = names.map((name2) => name2.toLowerCase());
    const tokens = /(?<![\p{L}\p{N}_@])@([\p{L}\p{N}_-]+)/gu;
    tokens.lastIndex = from;
    for (let match = tokens.exec(text); match !== null; match = tokens.exec(text)) {
      const handle = match[1] ?? "";
      if (!lowered.includes(handle.toLowerCase())) continue;
      const device = findByHandle(handle);
      return {
        id: SOURCE,
        start: match.index,
        end: match.index + match[0].length,
        data: {
          handle,
          name: device?.name ?? handle,
          online: device ? device.online : true,
          kind: device?.kind
        }
      };
    }
    return void 0;
  }
};
function whenService(ctx, name2, run) {
  const direct = typeof ctx.get === "function" ? ctx.get(name2) : void 0;
  if (direct) return run(direct) ?? (() => void 0);
  if (typeof ctx.inject === "function") {
    let inner;
    let injected = void 0;
    try {
      injected = ctx.inject([name2], (scope) => {
        const service = typeof scope?.get === "function" ? scope.get(name2) : scope?.[name2];
        if (service) inner = run(service);
      });
    } catch {
    }
    if (typeof injected === "function") {
      return () => {
        try {
          if (typeof inner === "function") inner();
        } catch {
        }
        try {
          injected?.();
        } catch {
        }
      };
    }
  }
  let stopped = false;
  let cleanup;
  const timer = setInterval(() => {
    if (stopped) return;
    const service = typeof ctx.get === "function" ? ctx.get(name2) : void 0;
    if (!service) return;
    clearInterval(timer);
    cleanup = run(service) ?? void 0;
  }, 400);
  return () => {
    stopped = true;
    clearInterval(timer);
    cleanup?.();
  };
}
function registerMentions(ctx, t) {
  ctx.effect(() => {
    void refreshDevices();
    const timer = setInterval(() => void refreshDevices(), 15e3);
    return () => clearInterval(timer);
  }, "dsh-gateway: mention device cache");
  ctx.effect(
    () => whenService(ctx, "inputTriggers", (service) => {
      if (!service || typeof service.registerSource !== "function") return;
      const dispose = service.registerSource(createDeviceSource(t));
      return () => {
        try {
          dispose?.();
        } catch {
        }
      };
    }),
    "dsh-gateway: @device source"
  );
  ctx.effect(
    () => whenService(ctx, "uiConversation", (service) => {
      if (!service?.userText || typeof service.userText.register !== "function") return;
      const dispose = service.userText.register(deviceRule);
      return () => {
        try {
          dispose?.();
        } catch {
        }
      };
    }),
    "dsh-gateway: device user text rule"
  );
  ctx.effect(
    () => ctx.slots.inject("conversation.user.text.node", () => {
      try {
        return ctx.slots.register(
          { name: "conversation.user.text.node", key: SOURCE, priority: 100 },
          DeviceChip
        );
      } catch {
        return void 0;
      }
    }),
    "dsh-gateway: device chip"
  );
  ctx.effect(
    () => ctx.slots.inject("conversation.composer.dock", () => {
      try {
        return ctx.slots.register(
          { name: "conversation.composer.dock", id: "gateway-mentions", order: 6 },
          ((props) => (0, import_react5.createElement)(MentionDock, { ...props, t }))
        );
      } catch {
        return void 0;
      }
    }),
    "dsh-gateway: mention dock"
  );
}

// src/client/index.ts
var name = "dsh-gateway-client";
var inject = ["slots", "locale"];
function RailIcon({ size = 18 }) {
  return (0, import_react6.createElement)(IconHub, { size });
}
function apply(ctx) {
  const slots = ctx.slots;
  const locale = ctx.locale;
  ctx.effect(() => locale.register("nanomuse-gateway", { en, zh }), "dsh-gateway: dictionaries");
  const t = locale.bind("nanomuse-gateway");
  ctx.effect(() => ensureStyles(), "dsh-gateway: styles");
  registerMentions(ctx, t);
  slots.inject(
    "sidebar.panellist",
    () => slots.register(
      {
        name: "sidebar.panellist",
        id: "nanomuse-gateway",
        order: 20,
        label: () => t("railTitle")
      },
      RailIcon
    )
  );
  slots.inject(
    "main",
    () => slots.register({ name: "main", key: "nanomuse-gateway" }, (() => (0, import_react6.createElement)(GatewayPage, { t })))
  );
  slots.inject(
    "settings.section",
    () => slots.register(
      {
        name: "settings.section",
        id: "nanomuse-gateway",
        order: 34,
        label: () => t("settingsTitle")
      },
      (() => (0, import_react6.createElement)(SettingsPage, { t }))
    )
  );
  slots.inject(
    "plugins.row.config",
    () => slots.register(
      { name: "plugins.row.config", key: "dsh-plugin-gateway#gateway" },
      (() => (0, import_react6.createElement)(SettingsPage, { t, embedded: true }))
    )
  );
}
return module.exports; } });
//# sourceMappingURL=client.js.map
