# Faction Status Tracker

A Foundry VTT module for D&D5e that adds a GM-only tab on character sheets to track faction status values.

## Current Features

- Adds a `Faction Status` tab to character sheets for GMs.
- Supports GM-created groups for organizing factions (for example by region).
- New groups default to `New group`, with unique suffixing (`New group(1)`, `New group(2)`, ...).
- Groups are renamable by the GM.
- New faction entries default to `New Faction` with value `0`.
- Automatically ensures unique default faction names inside each group.
- Allows GM editing of faction name and status value.
- Allows GM deleting factions and groups.
- Includes English localization keys for all tab UI labels.
- Uses tab-group detection and tab controller rebind logic for better dnd5e sheet variant compatibility.
- Adds an optional world setting to enable debug logging for hook and tab injection diagnostics.
- Includes backward-compatible migration from legacy flat faction data.

## Data Storage

Faction data is saved as actor flags:

- scope: `foundry-vtt-status-tracker`
- key: `groups` (current)
- key: `factions` (legacy, auto-migrated on save)

## Next Iterations

- Optional player-visible read-only summary.
