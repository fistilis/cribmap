// Shared constants and helpers for Cribmap.
// The Owlbear SDK is loaded from a CDN so the extension needs no build step.
import OBR, { buildLabel, buildImage, buildShape } from "https://esm.sh/@owlbear-rodeo/sdk@3";
export { OBR, buildLabel, buildImage, buildShape };

export const ID = "io.github.fistilis.cribmap";
export const STATE_KEY = `${ID}/state`;   // room metadata: counters, dial, timer, claimed checks
export const PIN_KEY = `${ID}/pin`;       // item metadata: notes + checks (pins and NPC tokens)
export const ALARM_KEY = `${ID}/alarm`;   // item metadata: alarm device
export const HUD_KEY = `${ID}/hud`;       // item metadata: on-map counter banner
export const BADGE_KEY = `${ID}/badge`;   // item metadata: status label attached to an alarm device
export const FOG_KEY = `${ID}/fog`;       // item metadata: named fog zone
export const MAP_KEY = `${ID}/map`;       // item metadata: map image placed by the loader
export const LABEL_KEY = `${ID}/label`;   // item metadata: visible place-name label placed by the loader

// Built-in letter tokens: assets/tokens/letters/<GLYPH>-<color>.png
export const PALETTE = ["red", "brown", "gold", "green", "teal", "blue", "purple", "gray"];
export const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ!?";
export function letterOf(g) {
  const c = String(g || "?").toUpperCase()[0];
  return GLYPHS.includes(c) ? (c === "?" ? "Q-mark" : c === "!" ? "X-mark" : c) : "Q-mark";
}
export const BROADCAST = `${ID}/toast`;

export const DEFAULT_SPEND = [
  { pts: 1, name: "Small flashback", desc: "" },
  { pts: 2, name: "Large flashback", desc: "" },
  { pts: 3, name: "Large flashback + Portent", desc: "" }
];

export const DEFAULT_STATE = {
  intel: 0,
  alarm: 0,
  alarmMax: 10,
  claimed: {},            // checkId -> points already awarded
  log: [],                // recent awards/spends
  spend: DEFAULT_SPEND,
  timer: { running: false, endsAt: 0, remainingMs: 30 * 60000, totalMs: 30 * 60000 },
  dial: {
    value: 0, visible: false, initialized: false,
    name: "Town Mood", minLabel: "Against the party", maxLabel: "With the party", labels: {}
  },
  showOnHud: { intel: true, alarm: true, dial: false, timer: true },
  tiers: [
    { min: 0, name: "Quiet", color: "#3a7d44", gm: "Normal patrols." },
    { min: 3, name: "Uneasy", color: "#c9a227", gm: "Patrols doubled." },
    { min: 6, name: "Alert", color: "#d9731a", gm: "Reinforcements called." },
    { min: 9, name: "Lockdown", color: "#b3261e", gm: "Gates sealed." }
  ]
};

export function normalize(raw) {
  const s = { ...structuredClone(DEFAULT_STATE), ...(raw || {}) };
  s.dial = { ...DEFAULT_STATE.dial, ...(raw?.dial || {}) };
  s.timer = { ...DEFAULT_STATE.timer, ...(raw?.timer || {}) };
  s.showOnHud = { ...DEFAULT_STATE.showOnHud, ...(raw?.showOnHud || {}) };
  if (Array.isArray(s.claimed)) s.claimed = Object.fromEntries(s.claimed.map((id) => [id, 1])); // v0.1 compat
  return s;
}

export function dialLabel(d) {
  return d.labels?.[String(d.value)] ?? (d.value <= -3 ? d.minLabel : d.value >= 3 ? d.maxLabel : "On the fence");
}

export function currentTier(state) {
  const tiers = [...(state.tiers || DEFAULT_STATE.tiers)].sort((a, b) => b.min - a.min);
  return tiers.find((t) => state.alarm >= t.min) || tiers[tiers.length - 1];
}

export function timerRemaining(t) {
  return Math.max(0, t.running ? t.endsAt - Date.now() : t.remainingMs);
}
export function fmtTime(ms) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export async function getState(OBR) {
  const meta = await OBR.room.getMetadata();
  return normalize(meta[STATE_KEY]);
}

export async function patchState(OBR, fn) {
  const state = await getState(OBR);
  const next = fn(state) || state;
  next.alarm = Math.max(0, Math.min(next.alarmMax, next.alarm));
  next.dial.value = Math.max(-5, Math.min(5, next.dial.value));
  next.intel = Math.max(0, next.intel);
  next.log = (next.log || []).slice(-12);
  await OBR.room.setMetadata({ [STATE_KEY]: next });
  return next;
}

export async function toastAll(OBR, text, variant = "INFO") {
  OBR.notification.show(text, variant);
  try { await OBR.broadcast.sendMessage(BROADCAST, { text, variant }, { destination: "REMOTE" }); } catch { /* ignore */ }
}

export function hudText(state) {
  const parts = [];
  if (state.showOnHud?.intel) parts.push(`INTEL ${state.intel}`);
  if (state.showOnHud?.alarm) parts.push(`ALARM ${state.alarm}/${state.alarmMax} · ${currentTier(state).name}`);
  if (state.showOnHud?.dial && state.dial.visible) parts.push(`${state.dial.name.toUpperCase()}: ${dialLabel(state.dial)}`);
  return parts.join("   |   ") || "—";
}

export const ALARM_STATES = { armed: "🔔 ARMED", tripped: "🚨 TRIPPED", disabled: "🔕 DISABLED" };

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function url(path) { return new URL(path, import.meta.url).href; }

export async function cycleAlarm(itemId) {
  const [item] = await OBR.scene.items.getItems([itemId]);
  const a = item?.metadata?.[ALARM_KEY];
  if (!a) return;
  const next = a.state === "armed" ? "tripped" : a.state === "tripped" ? "disabled" : "armed";
  await OBR.scene.items.updateItems([itemId], (items) => { items[0].metadata[ALARM_KEY] = { ...a, state: next }; });
  if (next === "tripped") {
    const s = await patchState(OBR, (st) => { st.alarm += a.weight || 1; st.log.push(`🚨 ${a.title} tripped (+${a.weight})`); return st; });
    await toastAll(OBR, `🚨 ${a.title} tripped! Alarm ${s.alarm} (${currentTier(s).name})`, "ERROR");
  }
}
