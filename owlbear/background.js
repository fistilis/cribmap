import {
  OBR, buildLabel, ID, ALARM_KEY, HUD_KEY, BADGE_KEY, ALARM_STATES, BROADCAST,
  getState, patchState, hudText, currentTier, url, cycleAlarm
} from "./shared.js";

OBR.onReady(async () => {
  setupContextMenus();
  OBR.broadcast.onMessage(BROADCAST, (e) => OBR.notification.show(e.data.text, e.data.variant || "INFO"));
  OBR.room.onMetadataChange(() => syncAll());
  OBR.scene.onReadyChange((ready) => { if (ready) syncAll(); });
  OBR.scene.items.onChange(() => syncAlarmBadges());
  if (await OBR.scene.isReady()) syncAll();
});

function setupContextMenus() {
  // GM: open / create notes for any item
  OBR.contextMenu.create({
    id: `${ID}/notes`,
    icons: [{
      icon: url("icon.svg"),
      label: "Cribmap: GM notes",
      filter: { roles: ["GM"], max: 1 }
    }],
    onClick(context) {
      const item = context.items[0];
      OBR.popover.open({
        id: `${ID}/notes-popover`,
        url: url(`notes.html?item=${encodeURIComponent(item.id)}`),
        height: 520,
        width: 420
      });
    }
  });

  // GM: toggle alarm device
  OBR.contextMenu.create({
    id: `${ID}/alarm-toggle`,
    icons: [
      {
        icon: url("icon.svg"),
        label: "Cribmap: make alarm device",
        filter: { roles: ["GM"], every: [{ key: ["metadata", ALARM_KEY], value: undefined }] }
      },
      {
        icon: url("icon.svg"),
        label: "Cribmap: remove alarm device",
        filter: { roles: ["GM"], some: [{ key: ["metadata", ALARM_KEY], value: undefined, operator: "!=" }] }
      }
    ],
    async onClick(context) {
      const adding = context.items.every((i) => i.metadata[ALARM_KEY] === undefined);
      if (adding) {
        const w = Number(window.prompt("Alarm points added when tripped?", "2")) || 2;
        await OBR.scene.items.updateItems(context.items, (items) => {
          for (const it of items) it.metadata[ALARM_KEY] = { key: it.id, state: "armed", weight: w, title: it.name || "Alarm" };
        });
      } else {
        const ids = context.items.map((i) => i.id);
        await OBR.scene.items.updateItems(context.items, (items) => {
          for (const it of items) delete it.metadata[ALARM_KEY];
        });
        const badges = await OBR.scene.items.getItems((i) => ids.includes(i.metadata?.[BADGE_KEY]));
        if (badges.length) await OBR.scene.items.deleteItems(badges.map((b) => b.id));
      }
    }
  });

  // GM: cycle alarm state (armed -> tripped -> disabled -> armed). Tripping adds alarm points.
  OBR.contextMenu.create({
    id: `${ID}/alarm-cycle`,
    icons: [{
      icon: url("icon.svg"),
      label: "Cribmap: cycle alarm state",
      filter: { roles: ["GM"], max: 1, every: [{ key: ["metadata", ALARM_KEY], value: undefined, operator: "!=" }] }
    }],
    async onClick(context) {
      await cycleAlarm(context.items[0].id);
    }
  });
}

let syncing = false;
async function syncAll() {
  if (syncing) return;
  syncing = true;
  try {
    const state = await getState(OBR);
    const tier = currentTier(state);
    // Action badge visible to everyone
    await OBR.action.setBadgeText(`${state.intel}·${state.alarm}`);
    await OBR.action.setBadgeBackgroundColor(tier.color);
    if ((await OBR.player.getRole()) !== "GM") return;
    if (!(await OBR.scene.isReady())) return;
    const huds = await OBR.scene.items.getItems((i) => i.metadata?.[HUD_KEY]);
    const text = hudText(state);
    const stale = huds.filter((h) => h.text?.plainText !== text);
    if (stale.length) {
      await OBR.scene.items.updateItems(stale.map((h) => h.id), (items) => {
        for (const it of items) it.text.plainText = text;
      });
    }
    await syncAlarmBadges();
  } finally {
    syncing = false;
  }
}

let badgeSyncing = false;
async function syncAlarmBadges() {
  if (badgeSyncing) return;
  if ((await OBR.player.getRole()) !== "GM") return;
  badgeSyncing = true;
  try {
    const devices = await OBR.scene.items.getItems((i) => i.metadata?.[ALARM_KEY]);
    const badges = await OBR.scene.items.getItems((i) => i.metadata?.[BADGE_KEY]);
    const byParent = new Map(badges.map((b) => [b.metadata[BADGE_KEY], b]));
    const toAdd = [];
    const toFix = [];
    const selfLabels = [];
    for (const d of devices) {
      const want = `${ALARM_STATES[d.metadata[ALARM_KEY].state]} · ${d.metadata[ALARM_KEY].title}`;
      // Loader-created devices are labels themselves: just rewrite their text.
      if (d.type === "LABEL") { if (d.text?.plainText !== want) selfLabels.push({ id: d.id, want }); continue; }
      const b = byParent.get(d.id);
      if (!b) {
        toAdd.push(
          buildLabel()
            .plainText(want)
            .position({ x: d.position.x, y: d.position.y + 80 })
            .attachedTo(d.id)
            .layer("TEXT")
            .locked(true)
            .disableHit(true)
            .visible(d.visible)
            .metadata({ [BADGE_KEY]: d.id })
            .build()
        );
      } else if (b.text?.plainText !== want || b.visible !== d.visible) {
        toFix.push({ id: b.id, want, visible: d.visible });
      }
    }
    // orphaned badges
    const deviceIds = new Set(devices.filter((d) => d.type !== "LABEL").map((d) => d.id));
    const orphans = badges.filter((b) => !deviceIds.has(b.metadata[BADGE_KEY]));
    if (toAdd.length) await OBR.scene.items.addItems(toAdd);
    if (toFix.length) {
      await OBR.scene.items.updateItems(toFix.map((f) => f.id), (items) => {
        for (const it of items) {
          const f = toFix.find((x) => x.id === it.id);
          it.text.plainText = f.want;
          it.visible = f.visible;
        }
      });
    }
    if (orphans.length) await OBR.scene.items.deleteItems(orphans.map((o) => o.id));
    if (selfLabels.length) {
      await OBR.scene.items.updateItems(selfLabels.map((s) => s.id), (items) => {
        for (const it of items) it.text.plainText = selfLabels.find((s) => s.id === it.id).want;
      });
    }
  } finally {
    badgeSyncing = false;
  }
}
