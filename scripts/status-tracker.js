export const MODULE_ID = "foundry-vtt-status-tracker";
const TAB_KEY = "faction-status";
const DEFAULT_FACTION_NAME = "New Faction";
const DEFAULT_GROUP_NAME = "New group";
const DEBUG_SETTING_KEY = "debugLogging";
const PLAYER_VISIBILITY_SETTING_KEY = "visibleToPlayers";
const GROUP_UI_STATE_FLAG = "groupUiState";
let _dragState = null;
const _latestRenderByApp = new WeakMap();

export function initFactionStatusTracker() {
  game.settings.register(MODULE_ID, DEBUG_SETTING_KEY, {
    name: `${MODULE_ID}.debugSettingName`,
    hint: `${MODULE_ID}.debugSettingHint`,
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, PLAYER_VISIBILITY_SETTING_KEY, {
    name: `${MODULE_ID}.playerVisibilitySettingName`,
    hint: `${MODULE_ID}.playerVisibilitySettingHint`,
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  Hooks.on("renderApplicationV1", onRenderApplicationV1);
  Hooks.on("renderApplicationV2", onRenderApplicationV2);
  debugLog("Registered render hooks", {
    hooks: ["renderApplicationV1", "renderApplicationV2"]
  });
}

function isDebugEnabled() {
  return game.settings?.get?.(MODULE_ID, DEBUG_SETTING_KEY) === true;
}

function debugLog(message, context = {}) {
  if (!isDebugEnabled()) return;
  console.info(`${MODULE_ID} | ${message}`, context);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function createUniqueName(existingNames, baseName) {
  const normalizedNames = new Set(
    existingNames
      .filter((name) => typeof name === "string")
      .map((name) => name.trim().toLowerCase())
  );

  if (!normalizedNames.has(baseName.toLowerCase())) {
    return baseName;
  }

  let suffix = 1;
  while (normalizedNames.has(`${baseName.toLowerCase()}(${suffix})`)) {
    suffix += 1;
  }

  return `${baseName}(${suffix})`;
}

function sanitizeFactionEntry(entry, index) {
  const value = Number.parseInt(entry?.value ?? 0, 10);
  return {
    id: typeof entry?.id === "string" && entry.id.trim() ? entry.id : `faction-${index}-${foundry.utils.randomID(6)}`,
    name: typeof entry?.name === "string" && entry.name.trim() ? entry.name.trim() : DEFAULT_FACTION_NAME,
    value: Number.isNaN(value) ? 0 : value
  };
}

function sanitizeGroupEntry(entry, index) {
  const factions = Array.isArray(entry?.factions)
    ? entry.factions.map((faction, factionIndex) => sanitizeFactionEntry(faction, factionIndex))
    : [];

  return {
    id: typeof entry?.id === "string" && entry.id.trim() ? entry.id : `group-${index}-${foundry.utils.randomID(6)}`,
    name: typeof entry?.name === "string" && entry.name.trim() ? entry.name.trim() : DEFAULT_GROUP_NAME,
    factions
  };
}

export function getFactionGroups(actor) {
  const groups = actor.getFlag(MODULE_ID, "groups");
  if (Array.isArray(groups)) {
    return groups.map((entry, index) => sanitizeGroupEntry(entry, index));
  }

  const legacyFactions = actor.getFlag(MODULE_ID, "factions");
  if (Array.isArray(legacyFactions) && legacyFactions.length) {
    const factions = legacyFactions.map((entry, index) => sanitizeFactionEntry(entry, index));
    return [{
      id: `group-legacy-${foundry.utils.randomID(6)}`,
      name: DEFAULT_GROUP_NAME,
      factions
    }];
  }

  return [];
}

export async function setFactionGroups(actor, groups) {
  const sanitized = Array.isArray(groups)
    ? groups.map((entry, index) => sanitizeGroupEntry(entry, index))
    : [];

  await actor.setFlag(MODULE_ID, "groups", sanitized);

  const groupIds = new Set(sanitized.map((group) => group.id));
  const existingUiState = getGroupUiState(actor);
  const prunedUiState = Object.fromEntries(
    Object.entries(existingUiState).filter(([groupId]) => groupIds.has(groupId))
  );

  if (!foundry.utils.isEmpty(prunedUiState) || !foundry.utils.isEmpty(existingUiState)) {
    await actor.setFlag(MODULE_ID, GROUP_UI_STATE_FLAG, prunedUiState);
  }

  if (actor.getFlag(MODULE_ID, "factions") !== undefined) {
    await actor.unsetFlag(MODULE_ID, "factions");
  }
}

function getGroupUiState(actor) {
  const uiState = actor.getFlag(MODULE_ID, GROUP_UI_STATE_FLAG);
  return isPlainObject(uiState) ? uiState : {};
}

async function setGroupCollapsedState(actor, groupId, collapsed) {
  if (!groupId) return;
  const uiState = getGroupUiState(actor);
  uiState[groupId] = { collapsed: collapsed === true };
  await actor.setFlag(MODULE_ID, GROUP_UI_STATE_FLAG, uiState);
}

function applyGroupUiState(groups, actor) {
  const uiState = getGroupUiState(actor);
  return groups.map((group) => ({
    ...group,
    collapsed: uiState[group.id]?.collapsed === true
  }));
}

export function createUniqueFactionName(existingNames, baseName = DEFAULT_FACTION_NAME) {
  return createUniqueName(existingNames, baseName);
}

export function createUniqueGroupName(existingNames, baseName = DEFAULT_GROUP_NAME) {
  return createUniqueName(existingNames, baseName);
}

function localize(key, fallback) {
  const resolved = game.i18n?.localize?.(`${MODULE_ID}.${key}`);
  return resolved && resolved !== `${MODULE_ID}.${key}` ? resolved : fallback;
}

function isPlayerVisibilityEnabled() {
  return game.settings?.get?.(MODULE_ID, PLAYER_VISIBILITY_SETTING_KEY) === true;
}

function canManageStructure(actor) {
  return game.user?.isGM === true;
}

function canEditFactionValues(actor) {
  if (game.user?.isGM) return true;
  return isPlayerVisibilityEnabled() && actor?.isOwner === true;
}

function canViewFactionTab(actor) {
  if (game.user?.isGM) return true;
  return isPlayerVisibilityEnabled() && actor?.isOwner === true;
}

function isSheetEditable(app, html) {
  if (typeof app?.isEditable === "boolean") return app.isEditable;
  if (typeof app?.options?.editable === "boolean") return app.options.editable;
  return html.hasClass("editable") || html.find("form.editable").length > 0;
}

function getSheetActor(app) {
  const actor = app?.actor ?? app?.object ?? app?.document;
  return actor?.documentName === "Actor" ? actor : null;
}

function isSupportedCharacterSheet(app) {
  const actor = getSheetActor(app);
  return actor?.type === "character";
}

function resolveSheetTabContext(html) {
  const navCandidates = html.find("nav.tabs, nav.sheet-navigation.tabs, nav.sheet-tabs");
  debugLog("Resolving tab context", {
    navCandidates: navCandidates.length
  });

  for (const element of navCandidates) {
    const nav = html.find(element);
    if (!nav.length) continue;
    if (nav.find(`[data-tab='${TAB_KEY}']`).length) {
      debugLog("Tab already present in navigation", {
        strategy: "dom-nav-scan"
      });
      return null;
    }

    const navGroup = nav.data("group") || nav.find("[data-group]").first().data("group") || "primary";
    const existingTab = html.find(`.tab[data-group='${navGroup}']`).first();
    const tabContainer = existingTab.parent();

    if (tabContainer.length) {
      debugLog("Resolved tab context", {
        strategy: "dom-nav-scan",
        navGroup
      });
      return { nav, tabContainer, navGroup };
    }
  }

  const fallbackNav = html.find("nav.tabs[data-group='primary'], nav.sheet-navigation.tabs, nav.sheet-tabs").first();
  if (!fallbackNav.length || fallbackNav.find(`[data-tab='${TAB_KEY}']`).length) return null;

  const fallbackTabContainer = html.find(".sheet-body, section.sheet-body, .tab-body").first();
  if (!fallbackTabContainer.length) return null;

  debugLog("Resolved tab context", {
    strategy: "fallback-primary",
    navGroup: "primary"
  });
  return { nav: fallbackNav, tabContainer: fallbackTabContainer, navGroup: "primary" };
}

function onRenderApplicationV1(app, html) {
  if (!isSupportedCharacterSheet(app)) return;
  void onRenderActorSheet(app, html);
}

function onRenderApplicationV2(app, element) {
  if (!isSupportedCharacterSheet(app)) return;
  const html = $(element);
  void onRenderActorSheet(app, html);
}

function removeInjectedFactionTab(html) {
  html.find(`nav [data-tab='${TAB_KEY}']`).remove();
  html.find(`.tab[data-tab='${TAB_KEY}']`).remove();
}

async function onRenderActorSheet(app, html) {
  try {
    const actor = getSheetActor(app);
    if (!actor || actor.type !== "character") return;
    if (!canViewFactionTab(actor)) return;

    const renderNonce = (_latestRenderByApp.get(app) ?? 0) + 1;
    _latestRenderByApp.set(app, renderNonce);

    // Ensure we never keep stale duplicate instances from previous render paths.
    removeInjectedFactionTab(html);

    const context = resolveSheetTabContext(html);
    if (!context) {
      debugLog("Skipping tab injection", {
        reason: "no-tab-context",
        actorId: actor.id,
        sheetClass: app?.constructor?.name ?? "unknown"
      });
      return;
    }

    const { nav, tabContainer, navGroup } = context;

    const groups = applyGroupUiState(getFactionGroups(actor), actor);
    const editable = isSheetEditable(app, html);
    const permissions = {
      canManageStructure: canManageStructure(actor) && editable,
      canEditValues: canEditFactionValues(actor) && editable
    };

    const tabAriaLabel = localize("tabAriaLabel", "Faction Status");
    nav.append(`<a class='item' data-group='${navGroup}' data-tab='${TAB_KEY}' title='${tabAriaLabel}' aria-label='${tabAriaLabel}'><i class='fa-solid fa-layer-group'></i></a>`);

    const tabHtml = await renderTemplate(`modules/${MODULE_ID}/templates/faction-status-tab.hbs`, {
      groups,
      permissions,
      tabGroup: navGroup,
      labels: {
        header: localize("header", "Faction Status"),
        groupsHeader: localize("groupsHeader", "Groups"),
        groupName: localize("groupNameLabel", "Group Name"),
        addGroup: localize("addGroup", "Add Group"),
        actions: localize("actionsLabel", "Actions"),
        toggleGroupAria: localize("toggleGroupAriaLabel", "Toggle group"),
        factionCountLabel: localize("factionCountLabel", "Faction count"),
        deleteGroup: localize("deleteGroupLabel", "Delete Group"),
        deleteGroupAria: localize("deleteGroupAriaLabel", "Delete group"),
        addFaction: localize("addFaction", "Add Faction"),
        addFactionAria: localize("addFactionAriaLabel", "Add faction"),
        name: localize("nameLabel", "Name"),
        status: localize("statusLabel", "Status"),
        decreaseStatusAria: localize("decreaseStatusAriaLabel", "Decrease status"),
        increaseStatusAria: localize("increaseStatusAriaLabel", "Increase status"),
        deleteFaction: localize("deleteLabel", "Delete"),
        deleteFactionAria: localize("deleteAriaLabel", "Delete faction"),
        empty: localize("emptyLabel", "No factions tracked yet."),
        emptyGroups: localize("emptyGroupsLabel", "No groups created yet.")
      }
    });

    // Abort if a newer render already started for this app (avoids async double-injection).
    if (_latestRenderByApp.get(app) !== renderNonce) return;

    tabContainer.append(tabHtml);
    debugLog("Injected faction status tab", {
      actorId: actor.id,
      actorName: actor.name,
      sheetClass: app?.constructor?.name ?? "unknown",
      navGroup,
      groups: groups.length
    });

    initializeTabSwitching(html, navGroup);
    bindFactionStatusListeners(app, html, actor);
  } catch (error) {
    console.error(`${MODULE_ID} | Failed to render faction status tab`, error);
  }
}

function initializeTabSwitching(html, navGroup) {
  // Use Foundry's public Tabs class to manage tab switching for our injected tab
  try {
    const tabs = new foundry.applications.ux.Tabs({
      navSelector: `nav[data-group="${navGroup}"]`,
      contentSelector: `.sheet-body, section.sheet-body, .tab-body, [class*="sheet-content"]`,
      initial: TAB_KEY
    });
    tabs.bind(html[0]);
    debugLog("Initialized tab switching", { navGroup, tabKey: TAB_KEY });
  } catch (error) {
    debugLog("Tab initialization warning (using fallback)", { error: error.message });
    // Fallback: manually handle tab switching
    const navItem = html.find(`nav[data-group="${navGroup}"] a[data-tab="${TAB_KEY}"]`);
    const tabContent = html.find(`.tab[data-group="${navGroup}"][data-tab="${TAB_KEY}"]`);
    
    if (navItem.length && tabContent.length) {
      navItem.on("click", (event) => {
        event.preventDefault();
        // Update active state of nav items in this group
        html.find(`nav[data-group="${navGroup}"] a[data-tab]`).removeClass("active");
        navItem.addClass("active");
        // Hide all tabs and show ours
        html.find(`.tab[data-group="${navGroup}"]`).hide();
        tabContent.show();
      });
    }
  }
}

function bindFactionStatusListeners(app, html, actor) {
  const selectorRoot = `.tab[data-tab='${TAB_KEY}']`;
  const canManage = () => canManageStructure(actor) && isSheetEditable(app, html);
  const canEditValues = () => canEditFactionValues(actor) && isSheetEditable(app, html);

  html.off("click", `${selectorRoot} .faction-group-add-global`);
  html.on("click", `${selectorRoot} .faction-group-add-global`, async (event) => {
    event.preventDefault();
    if (!canManage()) return;

    const groups = getFactionGroups(actor);
    const newGroupName = createUniqueGroupName(groups.map((group) => group.name), DEFAULT_GROUP_NAME);
    groups.push({
      id: foundry.utils.randomID(),
      name: newGroupName,
      factions: []
    });

    await setFactionGroups(actor, groups);
    debugLog("Added group", {
      actorId: actor.id,
      actorName: actor.name,
      addedGroup: newGroupName,
      totalGroups: groups.length
    });
    app.render(true);
  });

  html.off("click", `${selectorRoot} .faction-group-delete`);
  html.on("click", `${selectorRoot} .faction-group-delete`, async (event) => {
    event.preventDefault();
    if (!canManage()) return;

    const groupIndex = Number.parseInt(event.currentTarget.dataset.groupIndex, 10);
    if (Number.isNaN(groupIndex)) return;

    const groups = getFactionGroups(actor);
    if (groupIndex < 0 || groupIndex >= groups.length) return;

    groups.splice(groupIndex, 1);
    await setFactionGroups(actor, groups);
    debugLog("Deleted group", {
      actorId: actor.id,
      actorName: actor.name,
      groupIndex,
      remainingGroups: groups.length
    });
    app.render(true);
  });

  html.off("click", `${selectorRoot} .faction-group-header`);
  html.on("click", `${selectorRoot} .faction-group-header`, async (event) => {
    const interactiveTarget = event.target.closest("input, button, a, select, textarea");
    if (interactiveTarget && !interactiveTarget.classList.contains("faction-group-toggle")) return;

    event.preventDefault();
    const card = event.currentTarget.closest(".faction-group-card");
    if (!card) return;

    const isCollapsed = card.classList.toggle("is-collapsed");
    const toggleButton = card.querySelector(".faction-group-toggle");
    if (toggleButton) toggleButton.setAttribute("aria-expanded", String(!isCollapsed));

    await setGroupCollapsedState(actor, card.dataset.groupId, isCollapsed);
  });

  html.off("change", `${selectorRoot} .faction-group-name`);
  html.on("change", `${selectorRoot} .faction-group-name`, async (event) => {
    if (!canManage()) return;

    const groupIndex = Number.parseInt(event.currentTarget.dataset.groupIndex, 10);
    if (Number.isNaN(groupIndex)) return;

    const groups = getFactionGroups(actor);
    if (groupIndex < 0 || groupIndex >= groups.length) return;

    const nextName = String(event.currentTarget.value ?? "").trim();
    groups[groupIndex].name = nextName || createUniqueGroupName(groups.map((group, i) => (i === groupIndex ? "" : group.name)), DEFAULT_GROUP_NAME);

    await setFactionGroups(actor, groups);
    debugLog("Updated group name", {
      actorId: actor.id,
      actorName: actor.name,
      groupIndex,
      name: groups[groupIndex].name
    });
  });

  html.off("click", `${selectorRoot} .faction-status-add`);
  html.on("click", `${selectorRoot} .faction-status-add`, async (event) => {
    event.preventDefault();
    if (!canManage()) return;

    const groupIndex = Number.parseInt(event.currentTarget.dataset.groupIndex, 10);
    if (Number.isNaN(groupIndex)) return;

    const groups = getFactionGroups(actor);
    if (groupIndex < 0 || groupIndex >= groups.length) return;

    const factions = groups[groupIndex].factions;
    const newName = createUniqueFactionName(factions.map((faction) => faction.name), DEFAULT_FACTION_NAME);

    factions.push({
      id: foundry.utils.randomID(),
      name: newName,
      value: 0
    });

    await setFactionGroups(actor, groups);
    debugLog("Added faction entry", {
      actorId: actor.id,
      actorName: actor.name,
      groupIndex,
      addedName: newName,
      totalFactions: factions.length
    });
    app.render(true);
  });

  html.off("click", `${selectorRoot} .faction-status-delete`);
  html.on("click", `${selectorRoot} .faction-status-delete`, async (event) => {
    event.preventDefault();
    if (!canManage()) return;

    const groupIndex = Number.parseInt(event.currentTarget.dataset.groupIndex, 10);
    const factionIndex = Number.parseInt(event.currentTarget.dataset.factionIndex, 10);
    if (Number.isNaN(groupIndex) || Number.isNaN(factionIndex)) return;

    const groups = getFactionGroups(actor);
    if (groupIndex < 0 || groupIndex >= groups.length) return;

    const factions = groups[groupIndex].factions;
    if (factionIndex < 0 || factionIndex >= factions.length) return;

    factions.splice(factionIndex, 1);
    await setFactionGroups(actor, groups);
    debugLog("Deleted faction entry", {
      actorId: actor.id,
      actorName: actor.name,
      groupIndex,
      factionIndex,
      remainingFactions: factions.length
    });
    app.render(true);
  });

  html.off("change", `${selectorRoot} .faction-status-name`);
  html.on("change", `${selectorRoot} .faction-status-name`, async (event) => {
    if (!canManage()) return;

    const groupIndex = Number.parseInt(event.currentTarget.dataset.groupIndex, 10);
    const factionIndex = Number.parseInt(event.currentTarget.dataset.factionIndex, 10);
    if (Number.isNaN(groupIndex) || Number.isNaN(factionIndex)) return;

    const groups = getFactionGroups(actor);
    if (groupIndex < 0 || groupIndex >= groups.length) return;

    const factions = groups[groupIndex].factions;
    if (factionIndex < 0 || factionIndex >= factions.length) return;

    const nextName = String(event.currentTarget.value ?? "").trim();
    factions[factionIndex].name = nextName || createUniqueFactionName(factions.map((faction, i) => (i === factionIndex ? "" : faction.name)), DEFAULT_FACTION_NAME);

    await setFactionGroups(actor, groups);
    debugLog("Updated faction name", {
      actorId: actor.id,
      actorName: actor.name,
      groupIndex,
      factionIndex,
      name: factions[factionIndex].name
    });
  });

  html.off("change", `${selectorRoot} .faction-status-value`);
  html.on("change", `${selectorRoot} .faction-status-value`, async (event) => {
    if (!canEditValues()) return;

    const groupIndex = Number.parseInt(event.currentTarget.dataset.groupIndex, 10);
    const factionIndex = Number.parseInt(event.currentTarget.dataset.factionIndex, 10);
    if (Number.isNaN(groupIndex) || Number.isNaN(factionIndex)) return;

    const groups = getFactionGroups(actor);
    if (groupIndex < 0 || groupIndex >= groups.length) return;

    const factions = groups[groupIndex].factions;
    if (factionIndex < 0 || factionIndex >= factions.length) return;

    const parsedValue = Number.parseInt(event.currentTarget.value, 10);
    factions[factionIndex].value = Number.isNaN(parsedValue) ? 0 : parsedValue;

    await setFactionGroups(actor, groups);
    debugLog("Updated faction value", {
      actorId: actor.id,
      actorName: actor.name,
      groupIndex,
      factionIndex,
      value: factions[factionIndex].value
    });
  });

  html.off("click", `${selectorRoot} .faction-status-step`);
  html.on("click", `${selectorRoot} .faction-status-step`, async (event) => {
    event.preventDefault();
    if (!canEditValues()) return;

    const groupIndex = Number.parseInt(event.currentTarget.dataset.groupIndex, 10);
    const factionIndex = Number.parseInt(event.currentTarget.dataset.factionIndex, 10);
    const delta = Number.parseInt(event.currentTarget.dataset.delta, 10);
    if (Number.isNaN(groupIndex) || Number.isNaN(factionIndex) || Number.isNaN(delta)) return;

    const groups = getFactionGroups(actor);
    if (groupIndex < 0 || groupIndex >= groups.length) return;

    const factions = groups[groupIndex].factions;
    if (factionIndex < 0 || factionIndex >= factions.length) return;

    const nextValue = Number.parseInt(factions[factionIndex].value, 10) + delta;
    factions[factionIndex].value = Number.isNaN(nextValue) ? delta : nextValue;

    await setFactionGroups(actor, groups);

    const input = html.find(
      `${selectorRoot} .faction-status-value[data-group-index='${groupIndex}'][data-faction-index='${factionIndex}']`
    ).first();
    if (input.length) input.val(factions[factionIndex].value);

    debugLog("Stepped faction value", {
      actorId: actor.id,
      actorName: actor.name,
      groupIndex,
      factionIndex,
      delta,
      value: factions[factionIndex].value
    });
  });

  bindDragAndDropListeners(app, html, actor, canManage);
}

function bindDragAndDropListeners(app, html, actor, canManage = () => canManageStructure(actor) && isSheetEditable(app, html)) {
  if (!canManage()) return;

  const selectorRoot = `.tab[data-tab='${TAB_KEY}']`;

  html.off("dragstart", `${selectorRoot} .faction-group-card`);
  html.on("dragstart", `${selectorRoot} .faction-group-card`, (event) => {
    if (!event.target.closest(".faction-drag-handle")) return;
    const groupIndex = Number.parseInt(event.currentTarget.dataset.groupIndex, 10);
    if (Number.isNaN(groupIndex)) return;
    _dragState = { kind: "group", groupIndex };
    event.originalEvent.dataTransfer.effectAllowed = "move";
    event.originalEvent.dataTransfer.setData("text/plain", "faction-status-group");
    event.currentTarget.classList.add("dragging");
    event.stopImmediatePropagation();
  });

  html.off("dragstart", `${selectorRoot} .faction-status-row`);
  html.on("dragstart", `${selectorRoot} .faction-status-row`, (event) => {
    if (!event.target.closest(".faction-drag-handle")) return;
    const groupIndex = Number.parseInt(event.currentTarget.dataset.groupIndex, 10);
    const factionIndex = Number.parseInt(event.currentTarget.dataset.factionIndex, 10);
    if (Number.isNaN(groupIndex) || Number.isNaN(factionIndex)) return;
    _dragState = { kind: "faction", groupIndex, factionIndex };
    event.originalEvent.dataTransfer.effectAllowed = "move";
    event.originalEvent.dataTransfer.setData("text/plain", "faction-status-faction");
    event.currentTarget.classList.add("dragging");
    event.stopImmediatePropagation();
  });

  html.off("dragover", `${selectorRoot} .faction-status-row`);
  html.on("dragover", `${selectorRoot} .faction-status-row`, (event) => {
    if (_dragState?.kind !== "faction") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    html.find(".drag-over").removeClass("drag-over");
    event.currentTarget.classList.add("drag-over");
  });

  html.off("dragover", `${selectorRoot} .faction-group-card`);
  html.on("dragover", `${selectorRoot} .faction-group-card`, (event) => {
    if (!_dragState) return;
    event.preventDefault();
    html.find(".drag-over").removeClass("drag-over");
    event.currentTarget.classList.add("drag-over");
  });

  html.off("drop", `${selectorRoot} .faction-status-row`);
  html.on("drop", `${selectorRoot} .faction-status-row`, async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    event.currentTarget.classList.remove("drag-over");
    if (_dragState?.kind !== "faction" || !canManage()) {
      _dragState = null;
      return;
    }

    const targetGroupIndex = Number.parseInt(event.currentTarget.dataset.groupIndex, 10);
    const targetFactionIndex = Number.parseInt(event.currentTarget.dataset.factionIndex, 10);
    if (Number.isNaN(targetGroupIndex) || Number.isNaN(targetFactionIndex)) {
      _dragState = null;
      return;
    }

    const { groupIndex: srcGroupIndex, factionIndex: srcFactionIndex } = _dragState;
    _dragState = null;

    if (srcGroupIndex === targetGroupIndex && srcFactionIndex === targetFactionIndex) return;

    const groups = getFactionGroups(actor);
    const [movedFaction] = groups[srcGroupIndex].factions.splice(srcFactionIndex, 1);
    const adjustedTarget = (srcGroupIndex === targetGroupIndex && srcFactionIndex < targetFactionIndex)
      ? targetFactionIndex - 1
      : targetFactionIndex;
    groups[targetGroupIndex].factions.splice(adjustedTarget, 0, movedFaction);

    await setFactionGroups(actor, groups);
    debugLog("Reordered faction", {
      actorId: actor.id,
      actorName: actor.name,
      srcGroupIndex,
      srcFactionIndex,
      targetGroupIndex,
      targetFactionIndex: adjustedTarget
    });
    app.render(true);
  });

  html.off("drop", `${selectorRoot} .faction-group-card`);
  html.on("drop", `${selectorRoot} .faction-group-card`, async (event) => {
    event.preventDefault();
    event.currentTarget.classList.remove("drag-over");
    if (!_dragState || !canManage()) {
      _dragState = null;
      return;
    }

    const targetGroupIndex = Number.parseInt(event.currentTarget.dataset.groupIndex, 10);
    if (Number.isNaN(targetGroupIndex)) {
      _dragState = null;
      return;
    }

    const groups = getFactionGroups(actor);

    if (_dragState.kind === "group") {
      const srcGroupIndex = _dragState.groupIndex;
      _dragState = null;
      if (srcGroupIndex === targetGroupIndex) return;
      const [movedGroup] = groups.splice(srcGroupIndex, 1);
      const adjustedTarget = srcGroupIndex < targetGroupIndex ? targetGroupIndex - 1 : targetGroupIndex;
      groups.splice(adjustedTarget, 0, movedGroup);
      await setFactionGroups(actor, groups);
      debugLog("Reordered group", { actorId: actor.id, actorName: actor.name, from: srcGroupIndex, to: adjustedTarget });
      app.render(true);
    } else if (_dragState.kind === "faction") {
      const { groupIndex: srcGroupIndex, factionIndex: srcFactionIndex } = _dragState;
      _dragState = null;
      if (srcGroupIndex === targetGroupIndex) return;
      const [movedFaction] = groups[srcGroupIndex].factions.splice(srcFactionIndex, 1);
      groups[targetGroupIndex].factions.push(movedFaction);
      await setFactionGroups(actor, groups);
      debugLog("Moved faction to group", { actorId: actor.id, actorName: actor.name, srcGroupIndex, srcFactionIndex, targetGroupIndex });
      app.render(true);
    }
  });

  html.off("dragend", `${selectorRoot} .faction-group-card, ${selectorRoot} .faction-status-row`);
  html.on("dragend", `${selectorRoot} .faction-group-card, ${selectorRoot} .faction-status-row`, () => {
    _dragState = null;
    html.find(".dragging, .drag-over").removeClass("dragging drag-over");
  });
}
