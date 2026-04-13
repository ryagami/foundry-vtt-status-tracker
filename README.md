# Faction Status Tracker

A Foundry VTT module for D&D5e that adds a **Faction Status** tab to character sheets for tracking faction relationships and standing.

## Features

- Adds a `Faction Status` tab to D&D5e character sheets.
- **GM-managed structure**: GMs can create, rename, reorder, and delete groups and factions.
- **Player visibility**: an optional world setting lets players view and edit status values on characters they own.
- **Edit-mode gating**: structural changes and value edits are only allowed when the sheet is in edit mode.
- **Groups**: organize factions into collapsible groups (e.g. by region or campaign arc).
  - Groups and factions can be reordered via drag-and-drop.
  - Groups collapse/expand by clicking the header; collapsed state is persisted per actor.
  - Unique name generation for new groups (`New group`, `New group(1)`, …).
- **Factions**: each faction has a name and a numeric status value.
  - Status can be changed via the +/− stepper buttons or by typing directly.
  - Unique name generation for new factions inside each group.
- **Backward-compatible migration** from legacy flat faction data.
- English localization for all UI labels.
- Optional debug logging world setting.

## Installation

Install via Foundry's module manager using the manifest URL:

```
https://raw.githubusercontent.com/ryagami/foundry-vtt-status-tracker/main/module.json
```

## Data Storage

Faction data is saved as actor flags:

- scope: `foundry-vtt-status-tracker`
- key: `groups` (current format)
- key: `factions` (legacy, auto-migrated on first save)
- key: `groupUiState` (collapse state per group ID)

## Compatibility

- Foundry VTT: v13+
- System: D&D5e
