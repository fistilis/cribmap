#!/usr/bin/env node
// Validate a Cribmap encounter file. No dependencies.
// Usage: node tools/validate.mjs path/to/encounter.json [more.json ...]
import { readFileSync } from "node:fs";

const PALETTE = ["red", "brown", "gold", "green", "teal", "blue", "purple", "gray"];

function validate(enc) {
  const errs = [];
  const warn = [];
  const keys = new Set();
  const checkIds = new Set();
  const num = (v) => typeof v === "number" && Number.isFinite(v);
  const need = (cond, msg) => { if (!cond) errs.push(msg); };
  const uniqueKey = (k, where) => {
    need(typeof k === "string" && k.length > 0, `${where}: missing "key"`);
    if (keys.has(k)) errs.push(`${where}: duplicate key "${k}"`);
    keys.add(k);
  };
  const checks = (list, where) => {
    need(Array.isArray(list ?? []), `${where}.checks must be an array`);
    (list || []).forEach((c, i) => {
      const w = `${where}.checks[${i}]`;
      if (!c.tiers) { warn.push(`${w}: legacy check shape (no tiers)`); return; }
      need(typeof c.id === "string", `${w}: missing "id"`);
      if (checkIds.has(c.id)) errs.push(`${w}: duplicate check id "${c.id}"`);
      checkIds.add(c.id);
      need(typeof c.skill === "string", `${w}: missing "skill"`);
      need(typeof c.any === "string", `${w}: missing "any" (what they learn on a fail)`);
      need(Array.isArray(c.tiers) && c.tiers.length > 0, `${w}: "tiers" must be a non-empty array`);
      let lastDc = -Infinity;
      (c.tiers || []).forEach((t, j) => {
        need(num(t.dc), `${w}.tiers[${j}]: "dc" must be a number`);
        need(num(t.pts) && t.pts >= 0, `${w}.tiers[${j}]: "pts" must be a number >= 0`);
        need(typeof t.gain === "string", `${w}.tiers[${j}]: missing "gain"`);
        if (t.dc <= lastDc) warn.push(`${w}.tiers[${j}]: DCs should increase`);
        lastDc = t.dc;
      });
    });
  };

  need(typeof enc.title === "string", `missing "title"`);
  if (enc.map) {
    need(typeof enc.map.url === "string", `map.url missing`);
    ["width", "height", "dpi"].forEach((k) => need(num(enc.map[k]), `map.${k} must be a number`));
  }
  if (enc.dial) {
    need(typeof enc.dial.name === "string", `dial.name missing`);
    if (enc.dial.start !== undefined) need(num(enc.dial.start) && enc.dial.start >= -5 && enc.dial.start <= 5, `dial.start must be -5..5`);
  }
  (enc.spend || []).forEach((s, i) => need(num(s.pts) && typeof s.name === "string", `spend[${i}] needs pts and name`));
  (enc.labels || []).forEach((l, i) => {
    need(typeof l.text === "string", `labels[${i}]: missing "text"`);
    need(num(l.x) && num(l.y), `labels[${i}]: x and y must be numbers`);
    if (l.key) uniqueKey(l.key, `labels[${i}]`);
  });
  (enc.pins || []).forEach((p, i) => {
    const w = `pins[${i}] (${p.key})`;
    uniqueKey(p.key, w);
    need(typeof p.title === "string", `${w}: missing "title"`);
    need(num(p.x) && num(p.y), `${w}: x and y must be numbers`);
    checks(p.checks, w);
  });
  (enc.tokens || []).forEach((t, i) => {
    const w = `tokens[${i}] (${t.key})`;
    uniqueKey(t.key, w);
    need(typeof t.name === "string", `${w}: missing "name"`);
    need(num(t.x) && num(t.y), `${w}: x and y must be numbers`);
    if (!t.image) {
      need(typeof t.glyph === "string" && t.glyph.length > 0, `${w}: needs "image" or "glyph"`);
      if (!PALETTE.includes(t.color)) warn.push(`${w}: color "${t.color}" not in palette ${PALETTE.join("/")}; gray will be used`);
    }
    checks(t.checks, w);
  });
  (enc.alarms || []).forEach((a, i) => {
    const w = `alarms[${i}] (${a.key})`;
    uniqueKey(a.key, w);
    need(typeof a.title === "string", `${w}: missing "title"`);
  });
  (enc.fog || []).forEach((f, i) => {
    const w = `fog[${i}] (${f.key})`;
    uniqueKey(f.key, w);
    ["x", "y", "w", "h"].forEach((k) => need(num(f[k]), `${w}: "${k}" must be a number`));
  });
  if (enc.tiers) enc.tiers.forEach((t, i) => need(num(t.min) && typeof t.name === "string", `tiers[${i}] needs min and name`));
  return { errs, warn };
}

let failed = false;
for (const path of process.argv.slice(2)) {
  let enc;
  try { enc = JSON.parse(readFileSync(path, "utf8")); }
  catch (e) { console.log(`✗ ${path}: ${e.message}`); failed = true; continue; }
  const { errs, warn } = validate(enc);
  const counts = ["pins", "tokens", "labels", "fog", "alarms"].map((k) => `${(enc[k] || []).length} ${k}`).join(", ");
  console.log(`${errs.length ? "✗" : "✓"} ${path} — ${counts}`);
  errs.forEach((e) => console.log(`   error: ${e}`));
  warn.forEach((w) => console.log(`   warn:  ${w}`));
  if (errs.length) failed = true;
}
process.exit(failed ? 1 : 0);
