import {
  OBR, buildLabel, buildImage, buildShape, ID, STATE_KEY, PIN_KEY, ALARM_KEY, HUD_KEY, FOG_KEY, MAP_KEY, LABEL_KEY, PALETTE, letterOf,
  ALARM_STATES, normalize, getState, patchState, currentTier, dialLabel, hudText, timerRemaining, fmtTime,
  cycleAlarm, toastAll, esc, url
} from "./shared.js";

const $ = (id) => document.getElementById(id);
let role = "PLAYER";
let state = normalize();

OBR.onReady(async () => {
  role = await OBR.player.getRole();
  OBR.player.onChange((p) => { if (p.role !== role) { role = p.role; renderAll(); } });
  state = await getState(OBR);
  OBR.room.onMetadataChange((m) => { state = normalize(m[STATE_KEY]); renderCounters(); renderPins(); });
  OBR.scene.items.onChange(() => { renderPins(); renderAlarms(); renderFog(); });
  document.querySelectorAll(".tabs button").forEach((b) => b.onclick = () => {
    document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("on", x === b));
    ["pins", "alarms", "load"].forEach((t) => $(`tab-${t}`).hidden = t !== b.dataset.tab);
  });
  setInterval(tickTimer, 1000);
  renderAll();
});

function renderAll() {
  $("gm").hidden = role !== "GM";
  renderCounters();
  if (role === "GM") { renderPins(); renderAlarms(); renderLoad(); }
}

// ---------- Counters ----------
function tickTimer() {
  const el = $("timerVal");
  if (!el) return;
  const ms = timerRemaining(state.timer);
  el.textContent = fmtTime(ms);
  el.style.color = ms === 0 ? "#b3261e" : ms < 5 * 60000 ? "#d9731a" : "";
}

function renderCounters() {
  const gm = role === "GM";
  const tier = currentTier(state);
  const d = state.dial;
  const btn = (act, label, extra = "") => gm ? `<button data-act="${act}" ${extra}>${label}</button>` : "";
  const dialCells = Array.from({ length: 11 }, (_, i) => {
    const v = i - 5;
    const on = (d.value >= 0 && v >= 0 && v <= d.value) || (d.value < 0 && v < 0 && v >= d.value);
    return `<div style="${on ? `background:${v < 0 ? "#6b3a8b" : v > 0 ? "#c9a227" : "#777"}` : ""}"></div>`;
  }).join("");
  const showDial = gm || d.visible;
  const t = state.timer;

  $("counters").innerHTML = `
    <div class="counter"><div class="top"><span class="name">⏳ Time</span>
      <div class="ctrl"><span class="value" id="timerVal">${fmtTime(timerRemaining(t))}</span>
      ${btn(t.running ? "timer-pause" : "timer-start", t.running ? "Pause" : "Start")}${btn("timer-reset", "Reset")}</div></div></div>

    <div class="counter"><div class="top"><span class="name">🕵️ Intel</span>
      <div class="ctrl">${btn("intel--", "−1")}<span class="value">${state.intel}</span>${btn("intel++", "+1")}</div></div>
      ${(state.spend || []).map((s) => gm
        ? `<button class="small spend" data-pts="${s.pts}" ${state.intel < s.pts ? "disabled" : ""} title="${esc(s.desc)}">Spend ${s.pts}: ${esc(s.name)}</button>`
        : `<div class="sub">${s.pts} pt · ${esc(s.name)}</div>`).join("")}
      ${gm && state.log?.length ? `<div class="sub">${state.log.slice(-3).reverse().map(esc).join("<br>")}</div>` : ""}</div>

    <div class="counter"><div class="top"><span class="name">🚨 Alarm</span>
      <div class="ctrl">${btn("alarm--", "−1")}<span class="value" style="color:${tier.color}">${state.alarm}</span>${btn("alarm++", "+1")}</div></div>
      <div class="bar"><div style="width:${(state.alarm / state.alarmMax) * 100}%;background:${tier.color}"></div></div>
      <div class="sub"><b style="color:${tier.color}">${esc(tier.name)}</b> · ${state.alarm}/${state.alarmMax}${gm ? ` — ${esc(tier.gm)}` : ""}</div></div>

    ${showDial ? `<div class="counter"><div class="top"><span class="name">⚖️ ${esc(d.name)}</span>
      <div class="ctrl">${btn("dial--", "−1")}<span class="value">${gm ? (d.value > 0 ? "+" : "") + d.value : ""}</span>${btn("dial++", "+1")}</div></div>
      <div class="mood-scale">${dialCells}</div>
      <div class="sub" style="display:flex;justify-content:space-between"><span>${esc(d.minLabel)}</span><span>${esc(d.maxLabel)}</span></div>
      <div class="sub"><b>${esc(dialLabel(d))}</b>${gm ? ` · <label class="inline" style="display:inline-flex"><input type="checkbox" id="dialVis" ${d.visible ? "checked" : ""}> players can see</label>` : ""}</div></div>` : ""}`;

  $("counters").querySelectorAll("button[data-act]").forEach((b) => b.onclick = () => act(b.dataset.act));
  $("counters").querySelectorAll(".spend").forEach((b) => b.onclick = () => spend(Number(b.dataset.pts)));
  if ($("dialVis")) $("dialVis").onchange = (e) => patchState(OBR, (s) => { s.dial.visible = e.target.checked; return s; });
  tickTimer();
}

function act(a) {
  return patchState(OBR, (s) => {
    const t = s.timer;
    switch (a) {
      case "intel++": s.intel++; s.log.push("+1 intel (manual)"); break;
      case "intel--": s.intel--; s.log.push("−1 intel (manual)"); break;
      case "alarm++": s.alarm++; break;
      case "alarm--": s.alarm--; break;
      case "dial++": s.dial.value++; break;
      case "dial--": s.dial.value--; break;
      case "timer-start": t.endsAt = Date.now() + t.remainingMs; t.running = true; break;
      case "timer-pause": t.remainingMs = Math.max(0, t.endsAt - Date.now()); t.running = false; break;
      case "timer-reset": t.running = false; t.remainingMs = t.totalMs; break;
    }
    return s;
  });
}

async function spend(pts) {
  const opt = state.spend.find((s) => s.pts === pts);
  let portent = "";
  if (pts >= 3) portent = ` Portent d20: ${1 + Math.floor(Math.random() * 20)}`;
  await patchState(OBR, (s) => { s.intel -= pts; s.log.push(`Spent ${pts}: ${opt?.name || "flashback"}.${portent}`); return s; });
  await toastAll(OBR, `⏪ Flashback! ${opt?.name || ""} (−${pts} intel).${portent}`, "INFO");
}

// ---------- Pins & NPCs (GM) ----------
function checksHtml(checks) {
  return (checks || []).map((c) => {
    // legacy v0.1 shape: { skill, dc, success, fail }
    if (!c.tiers) return `<div class="check"><span class="dcpill">${esc(c.skill)} ${c.dc ?? ""}</span><div>${c.success ? `✅ ${esc(c.success)}` : ""}${c.fail ? `<br>❌ ${esc(c.fail)}` : ""}</div></div>`;
    const got = state.claimed[c.id] || 0;
    return `<div class="tcheck"><div><span class="dcpill">${esc(c.skill)}</span> ${esc(c.approach || "")}${c.who ? ` <span class="muted">· ${esc(c.who)}</span>` : ""}</div>
      <div class="tier"><span class="dc">Fail</span><span>${esc(c.any)}</span></div>
      ${c.tiers.map((t) => `<div class="tier ${got >= t.pts && t.pts > 0 ? "claimed" : ""}">
        <span class="dc">DC ${t.dc}</span><span>${esc(t.gain)}</span>
        ${t.pts > 0 ? `<button class="small award" data-cid="${esc(c.id)}" data-pts="${t.pts}" ${got >= t.pts ? "disabled" : ""}>+${t.pts}</button>` : ""}</div>`).join("")}</div>`;
  }).join("");
}

async function renderPins() {
  if (role !== "GM") return;
  if (!(await OBR.scene.isReady())) { $("tab-pins").innerHTML = `<p class="muted">Open a scene first.</p>`; return; }
  const open = new Set([...document.querySelectorAll("#tab-pins details[open]")].map((d) => d.dataset.id));
  const filter = $("pinFilter")?.value || "";
  const items = await OBR.scene.items.getItems((i) => i.metadata?.[PIN_KEY]);
  items.sort((a, b) => (a.metadata[PIN_KEY].order ?? 999) - (b.metadata[PIN_KEY].order ?? 999));
  const shown = items.filter((it) => !filter || JSON.stringify(it.metadata[PIN_KEY]).toLowerCase().includes(filter.toLowerCase()));
  const rows = shown.map((it) => {
    const p = it.metadata[PIN_KEY];
    const icon = it.type === "IMAGE" ? "👤" : "📍";
    return `<details data-id="${it.id}" ${open.has(it.id) ? "open" : ""}><summary>${icon} ${esc(p.title)}${it.visible ? "" : `<span class="hidden-tag">hidden</span>`}${p.role ? ` <span class="muted">— ${esc(p.role)}</span>` : ""}</summary>
      ${p.notes ? `<div class="body">${esc(p.notes)}</div>` : ""}
      ${checksHtml(p.checks)}
      <div class="actions"><button class="small sel" data-id="${it.id}">Select on map</button><button class="small edit" data-id="${it.id}">Edit</button></div></details>`;
  }).join("");
  $("tab-pins").innerHTML = `<input id="pinFilter" placeholder="Filter (name, skill, word…)" value="${esc(filter)}">` +
    (rows || `<p class="muted">No pins in this scene. Use Setup to load an encounter, or right-click any token → “Cribmap: GM notes”.</p>`);
  const f = $("pinFilter");
  f.oninput = () => renderPins();
  if (filter) { f.focus(); f.setSelectionRange(filter.length, filter.length); }

  $("tab-pins").querySelectorAll(".award").forEach((b) => b.onclick = async () => {
    const cid = b.dataset.cid, pts = Number(b.dataset.pts);
    const s = await patchState(OBR, (s) => {
      const had = s.claimed[cid] || 0;
      if (pts <= had) return s;
      s.intel += pts - had; s.claimed[cid] = pts; s.log.push(`+${pts - had} intel (${cid})`);
      return s;
    });
    toastAll(OBR, `🕵️ Intel gained! Total: ${s.intel}`, "SUCCESS");
  });
  $("tab-pins").querySelectorAll(".sel").forEach((b) => b.onclick = () => OBR.player.select([b.dataset.id]));
  $("tab-pins").querySelectorAll(".edit").forEach((b) => b.onclick = () => OBR.popover.open({
    id: `${ID}/notes-popover`, url: url(`notes.html?item=${encodeURIComponent(b.dataset.id)}`), height: 560, width: 440
  }));
}

// ---------- Alarms & fog (GM) ----------
async function renderAlarms() {
  if (role !== "GM" || !(await OBR.scene.isReady())) return;
  const devices = await OBR.scene.items.getItems((i) => i.metadata?.[ALARM_KEY]);
  $("tab-alarms").innerHTML = `<div id="fogList"></div>` + (devices.length ? devices.map((d) => {
    const a = d.metadata[ALARM_KEY];
    return `<details open><summary>${esc(a.title)} · ${ALARM_STATES[a.state]}</summary>
      <div class="sub">Trips for +${a.weight} alarm.${a.disable ? ` Disable: ${esc(a.disable)}` : ""}</div>
      ${a.notes ? `<div class="body">${esc(a.notes)}</div>` : ""}
      <div class="actions"><button class="small sel" data-id="${d.id}">Select</button><button class="small cyc" data-id="${d.id}">Cycle state</button></div></details>`;
  }).join("") : `<p class="muted">No alarm devices in this scene.</p>`);
  $("tab-alarms").querySelectorAll(".cyc").forEach((b) => b.onclick = () => cycleAlarm(b.dataset.id));
  $("tab-alarms").querySelectorAll(".sel").forEach((b) => b.onclick = () => OBR.player.select([b.dataset.id]));
  renderFog();
}

async function renderFog() {
  if (role !== "GM" || !$("fogList") || !(await OBR.scene.isReady())) return;
  const zones = await OBR.scene.items.getItems((i) => i.metadata?.[FOG_KEY]);
  $("fogList").innerHTML = zones.length ? `<h4>Fog zones</h4>` + zones.map((z) =>
    `<div class="tier"><span>🌫️ ${esc(z.metadata[FOG_KEY].title)}</span><button class="small reveal" data-id="${z.id}">Reveal</button></div>`).join("")
    + `<div class="sub">Revealed zones come back if you re-load the encounter.</div>` : "";
  $("fogList").querySelectorAll(".reveal").forEach((b) => b.onclick = async () => {
    await OBR.scene.items.deleteItems([b.dataset.id]);
    OBR.notification.show("Fog revealed", "SUCCESS");
  });
}

// ---------- Setup (GM) ----------
async function renderLoad() {
  let bundled = [];
  try { bundled = await (await fetch(url("../examples/index.json"))).json(); } catch { /* none */ }
  $("tab-load").innerHTML = `
    <h4>Load encounter</h4>
    <select id="bundled"><option value="">— bundled encounters —</option>${bundled.map((b) => `<option value="${esc(b.file)}">${esc(b.title)}</option>`).join("")}</select>
    <label>…or open a file <input type="file" id="file" accept=".json,application/json"></label>
    <textarea id="json" rows="6" placeholder="…or paste encounter JSON here"></textarea>
    <div class="sub">Places the map, NPC tokens, hidden pins and fog. Loading again updates notes in place (matched by key) and never moves things you've dragged.</div>
    <div class="actions"><button id="place" class="primary">Place on map</button></div>
    <h4>Export</h4>
    <div class="actions"><button id="export">Export scene to box above</button></div>
    <h4>Table display</h4>
    <label class="inline"><input type="checkbox" id="hudIntel" ${state.showOnHud.intel ? "checked" : ""}> Intel on banner</label>
    <label class="inline"><input type="checkbox" id="hudAlarm" ${state.showOnHud.alarm ? "checked" : ""}> Alarm on banner</label>
    <label class="inline"><input type="checkbox" id="hudDial" ${state.showOnHud.dial ? "checked" : ""}> Dial on banner (only if visible to players)</label>
    <div class="actions"><button id="hud">Add counter banner to map</button></div>
    <h4>Timer length</h4>
    <div class="actions"><input id="timerMin" type="number" value="${Math.round(state.timer.totalMs / 60000)}" style="width:80px"> <button id="setTimer">Set minutes</button></div>
    <h4>Reset</h4>
    <div class="actions"><button id="resetIntel">Reset intel</button><button id="resetAlarm">Reset alarm + devices</button></div>`;

  $("bundled").onchange = async (e) => { if (e.target.value) $("json").value = await (await fetch(url(`../examples/${e.target.value}`))).text(); };
  $("file").onchange = async (e) => { const f = e.target.files[0]; if (f) $("json").value = await f.text(); };
  $("place").onclick = () => placeEncounter($("json").value);
  $("export").onclick = exportScene;
  [["hudIntel", "intel"], ["hudAlarm", "alarm"], ["hudDial", "dial"]].forEach(([id, k]) => $(id).onchange = (e) =>
    patchState(OBR, (s) => { s.showOnHud[k] = e.target.checked; return s; }));
  $("hud").onclick = addHud;
  $("setTimer").onclick = () => patchState(OBR, (s) => { const ms = Number($("timerMin").value) * 60000; s.timer = { running: false, endsAt: 0, remainingMs: ms, totalMs: ms }; return s; });
  $("resetIntel").onclick = () => { if (confirm("Reset intel to 0 and un-claim every check?")) patchState(OBR, (s) => { s.intel = 0; s.claimed = {}; s.log = []; return s; }); };
  $("resetAlarm").onclick = async () => {
    if (!confirm("Reset alarm to 0 and re-arm every device?")) return;
    await patchState(OBR, (s) => { s.alarm = 0; return s; });
    const devs = await OBR.scene.items.getItems((i) => i.metadata?.[ALARM_KEY]);
    if (devs.length) await OBR.scene.items.updateItems(devs.map((d) => d.id), (items) => { for (const it of items) it.metadata[ALARM_KEY].state = "armed"; });
  };
}

function setText(builder, text) {
  if (typeof builder.plainText === "function") builder.plainText(text);
  return builder;
}

async function placeEncounter(text) {
  let enc;
  try { enc = JSON.parse(text); } catch (e) { OBR.notification.show(`Bad JSON: ${e.message}`, "ERROR"); return; }
  if (!(await OBR.scene.isReady())) { OBR.notification.show("Open a scene first", "WARNING"); return; }
  const dpi = await OBR.scene.grid.getDpi();
  const keyOf = (i) => (i.metadata[PIN_KEY] || i.metadata[ALARM_KEY] || i.metadata[FOG_KEY] || i.metadata[MAP_KEY] || i.metadata[LABEL_KEY] || {}).key;
  const existing = await OBR.scene.items.getItems((i) => keyOf(i));
  const byKey = new Map(existing.map((i) => [keyOf(i), i]));
  const add = [], upd = [];
  const absUrl = (p) => /^https?:/.test(p) ? p : url(p);
  const tokenImage = (t) => t.image ? absUrl(t.image)
    : url(`../assets/tokens/letters/${encodeURIComponent(letterOf(t.glyph))}-${PALETTE.includes(t.color) ? t.color : "gray"}.png`);

  // Map image
  if (enc.map && !byKey.has(enc.map.url)) {
    const m = enc.map;
    add.push(buildImage({ width: m.width, height: m.height, mime: m.url.endsWith(".png") ? "image/png" : "image/jpeg", url: absUrl(m.url) },
      { dpi: m.dpi, offset: { x: 0, y: 0 } })
      .position({ x: 0, y: 0 }).layer("MAP").locked(true).name(enc.title || "Map")
      .metadata({ [MAP_KEY]: { key: m.url } }).build());
  }

  // Hidden pins (labels)
  (enc.pins || []).forEach((p, idx) => {
    const meta = { key: p.key, order: idx, title: p.title, notes: p.notes || "", checks: p.checks || [] };
    if (byKey.has(p.key)) { upd.push({ id: byKey.get(p.key).id, kind: PIN_KEY, meta, text: `📍 ${p.title}` }); return; }
    add.push(buildLabel().plainText(`📍 ${p.title}`)
      .position({ x: (p.x ?? 1) * dpi, y: (p.y ?? 1 + idx) * dpi })
      .layer("TEXT").visible(!(p.hidden ?? true)).name(p.title)
      .metadata({ [PIN_KEY]: meta }).build());
  });

  // NPC tokens with notes
  (enc.tokens || []).forEach((t, idx) => {
    const meta = { key: t.key, order: 100 + idx, title: t.name, role: t.role, notes: t.notes || "", checks: t.checks || [] };
    if (byKey.has(t.key)) { upd.push({ id: byKey.get(t.key).id, kind: PIN_KEY, meta }); return; }
    const size = t.size || 256;
    const b = buildImage({ width: size, height: size, mime: "image/png", url: tokenImage(t) }, { dpi: size, offset: { x: size / 2, y: size / 2 } })
      .position({ x: (t.x + 0.5) * dpi, y: (t.y + 0.5) * dpi })
      .layer("CHARACTER").visible(!t.hidden).name(t.name)
      .metadata({ [PIN_KEY]: meta });
    add.push(setText(b, t.name).build());
  });

  // Visible map labels (place names players can read)
  (enc.labels || []).forEach((l) => {
    const key = l.key || `label-${l.text}`;
    const meta = { key, title: l.text };
    if (byKey.has(key)) return;
    add.push(buildLabel().plainText(l.text)
      .position({ x: l.x * dpi, y: l.y * dpi })
      .layer("TEXT").visible(!l.hidden).locked(true).name(l.text)
      .metadata({ [LABEL_KEY]: meta }).build());
  });

  // Alarm devices
  (enc.alarms || []).forEach((a, idx) => {
    const meta = { key: a.key, title: a.title, weight: a.weight ?? 2, state: "armed", disable: a.disable || "", notes: a.notes || "" };
    if (byKey.has(a.key)) { const prev = byKey.get(a.key).metadata[ALARM_KEY]; upd.push({ id: byKey.get(a.key).id, kind: ALARM_KEY, meta: { ...meta, state: prev.state } }); return; }
    add.push(buildLabel().plainText(`${ALARM_STATES.armed} · ${a.title}`)
      .position({ x: (a.x ?? 10) * dpi, y: (a.y ?? 1 + idx) * dpi })
      .layer("TEXT").visible(!a.hidden).name(a.title)
      .metadata({ [ALARM_KEY]: meta }).build());
  });

  // Fog zones (rectangles on the FOG layer). Revealed zones are deleted, so re-adding them re-fogs.
  (enc.fog || []).forEach((f) => {
    if (byKey.has(f.key)) return;
    add.push(buildShape().shapeType("RECTANGLE").width(f.w * dpi).height(f.h * dpi)
      .position({ x: f.x * dpi, y: f.y * dpi }).layer("FOG")
      .fillColor("#222222").fillOpacity(1).strokeWidth(0).strokeOpacity(0).locked(true).name(`Fog: ${f.title}`)
      .metadata({ [FOG_KEY]: { key: f.key, title: f.title } }).build());
  });

  if (add.length) await OBR.scene.items.addItems(add);
  if (upd.length) await OBR.scene.items.updateItems(upd.map((u) => u.id), (items) => {
    for (const it of items) {
      const u = upd.find((x) => x.id === it.id);
      it.metadata[u.kind] = u.meta;
      if (u.text && it.text) it.text.plainText = u.text;
    }
  });
  await patchState(OBR, (s) => {
    if (enc.tiers) s.tiers = enc.tiers;
    if (enc.alarmMax) s.alarmMax = enc.alarmMax;
    if (enc.spend) s.spend = enc.spend;
    if (enc.timerMinutes && !s.timer.running && s.timer.remainingMs === s.timer.totalMs) {
      s.timer = { running: false, endsAt: 0, remainingMs: enc.timerMinutes * 60000, totalMs: enc.timerMinutes * 60000 };
    }
    if (enc.dial) {
      const { start, ...cfg } = enc.dial;
      s.dial = { ...s.dial, ...cfg };
      if (!s.dial.initialized) { s.dial.value = start ?? 0; s.dial.initialized = true; }
    }
    return s;
  });
  OBR.notification.show(`${enc.title || "Encounter"}: ${add.length} added, ${upd.length} updated`, "SUCCESS");
}

async function exportScene() {
  const dpi = await OBR.scene.grid.getDpi();
  const r = (n) => Math.round((n / dpi) * 10) / 10;
  const pins = await OBR.scene.items.getItems((i) => i.metadata?.[PIN_KEY]);
  const alarms = await OBR.scene.items.getItems((i) => i.metadata?.[ALARM_KEY]);
  const out = {
    title: "Exported scene",
    pins: pins.filter((i) => i.type !== "IMAGE").map((i) => { const p = i.metadata[PIN_KEY]; return { key: p.key || i.id, title: p.title, x: r(i.position.x), y: r(i.position.y), hidden: !i.visible, notes: p.notes, checks: p.checks }; }),
    tokens: pins.filter((i) => i.type === "IMAGE").map((i) => { const p = i.metadata[PIN_KEY]; return { key: p.key || i.id, name: p.title, role: p.role, x: Math.floor(r(i.position.x)), y: Math.floor(r(i.position.y)), hidden: !i.visible, notes: p.notes, checks: p.checks }; }),
    alarms: alarms.map((i) => { const a = i.metadata[ALARM_KEY]; return { key: a.key || i.id, title: a.title, x: r(i.position.x), y: r(i.position.y), weight: a.weight, disable: a.disable, notes: a.notes }; })
  };
  $("json").value = JSON.stringify(out, null, 2);
  try { await navigator.clipboard.writeText($("json").value); OBR.notification.show("Copied to clipboard", "SUCCESS"); } catch { OBR.notification.show("Exported: copy it from the box", "INFO"); }
}

async function addHud() {
  if (!(await OBR.scene.isReady())) return;
  const existing = await OBR.scene.items.getItems((i) => i.metadata?.[HUD_KEY]);
  if (existing.length) { OBR.notification.show("Banner already on map. Drag it where you want it.", "INFO"); return; }
  const dpi = await OBR.scene.grid.getDpi();
  await OBR.scene.items.addItems([
    buildLabel().plainText(hudText(state)).position({ x: dpi * 9, y: dpi * 0.4 })
      .layer("TEXT").name("Cribmap counters").metadata({ [HUD_KEY]: true }).build()
  ]);
}
