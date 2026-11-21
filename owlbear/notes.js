import { OBR, ID, PIN_KEY, esc } from "./shared.js";

const itemId = new URLSearchParams(location.search).get("item");
const app = document.getElementById("app");

const TEMPLATE = [{
  id: "new-check", skill: "Persuasion", who: "", approach: "What the players try",
  any: "What they learn even on a fail (0 pts)",
  tiers: [{ dc: 12, pts: 1, gain: "Small reveal" }, { dc: 16, pts: 2, gain: "Big reveal" }, { dc: 20, pts: 3, gain: "Huge reveal" }]
}];

OBR.onReady(async () => {
  const [item] = await OBR.scene.items.getItems([itemId]);
  if (!item) { app.textContent = "Item not found."; return; }
  const pin = { title: item.name || "Untitled", role: "", notes: "", checks: [], ...(item.metadata[PIN_KEY] || {}) };
  if (!pin.key) pin.key = item.id;
  app.innerHTML = `
    <label>Title <input id="title" value="${esc(pin.title)}"></label>
    <label>Role / subtitle <input id="role" value="${esc(pin.role)}"></label>
    <label class="inline"><input type="checkbox" id="hidden" ${item.visible ? "" : "checked"}> Hidden from players</label>
    <label>Crib notes (vibe, voice, what they know)
      <textarea id="notes" rows="8">${esc(pin.notes)}</textarea></label>
    <label>Checks (JSON). Each check has a fail line and DC tiers worth 1/2/3 intel.
      <textarea id="checks" rows="10" spellcheck="false" style="font-family:monospace;font-size:11px">${esc(JSON.stringify(pin.checks?.length ? pin.checks : [], null, 1))}</textarea></label>
    <div class="actions"><button id="tpl" class="small">Insert check template</button></div>
    <div class="actions"><button id="save" class="primary">Save</button><button id="close">Close</button></div>`;

  document.getElementById("tpl").onclick = () => {
    const ta = document.getElementById("checks");
    let cur = [];
    try { cur = JSON.parse(ta.value || "[]"); } catch { /* keep */ }
    ta.value = JSON.stringify([...cur, { ...TEMPLATE[0], id: `${pin.key}-${cur.length + 1}` }], null, 1);
  };
  document.getElementById("close").onclick = () => OBR.popover.close(`${ID}/notes-popover`);
  document.getElementById("save").onclick = async () => {
    let checks;
    try { checks = JSON.parse(document.getElementById("checks").value || "[]"); }
    catch (e) { OBR.notification.show(`Checks JSON error: ${e.message}`, "ERROR"); return; }
    const next = { ...pin, title: document.getElementById("title").value.trim() || "Untitled",
      role: document.getElementById("role").value.trim(), notes: document.getElementById("notes").value, checks };
    const hidden = document.getElementById("hidden").checked;
    await OBR.scene.items.updateItems([item.id], (items) => {
      items[0].metadata[PIN_KEY] = next;
      items[0].visible = !hidden;
      if (items[0].type === "LABEL" && items[0].text) items[0].text.plainText = `📍 ${next.title}`;
    });
    OBR.notification.show("Notes saved", "SUCCESS");
    OBR.popover.close(`${ID}/notes-popover`);
  };
});
