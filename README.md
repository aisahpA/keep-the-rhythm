# Keep the Rhythm2

[English](README.md) | [简体中文](README.zh-CN.md)

An Obsidian plugin that tracks your daily writing, helps you set goals, and visualizes progress with a heatmap. A reworked fork of [Keep the Rhythm](https://github.com/benjaminezequiel/keep-the-rhythm).

![image](https://github.com/user-attachments/assets/8acd047d-68da-42d0-835d-6c7ab55b6f65)

## Differences from upstream

Compared with upstream [`benjaminezequiel/keep-the-rhythm`](https://github.com/benjaminezequiel/keep-the-rhythm) `v0.2.16` (this fork branched from `v0.2.12`):

| Area | Upstream | This plugin (`keep-the-rhythm2`) |
| --- | --- | --- |
| Storage | Dexie/IndexedDB; full rewrite into `data.json`; per-file 5-minute deltas; **a permanent row for every file click**, even files never written to | Plain JSON stats file (default `stats.json`, configurable vault path); dictionary-encoded paths, per-day aggregates; files only opened add no row; ~85–94% smaller |
| State | Manual event/refresh | Zustand reactive store with partitioned caches (O(1) slot lookups) |
| Live tracking | 5-minute time entries | Live delta vs. day-start baseline; may go negative and is editable |
| Tracking scope | Whole vault | **Tracked Folders** to restrict tracking to part of the vault |
| Status bar | — | Today's count / goal; click to open the sidebar |
| Languages | 10 scripts, CJK combined | 10 scripts, Chinese / Japanese / Korean split out |
| Slots | `WHOLE_VAULT` present; `CURRENT_FILE` = whole file count | `WHOLE_VAULT` **removed**; `CURRENT_FILE` = today's delta for the active file |
| `LAST_DAY` | Last 24 hours | Last 2 calendar days |
| Heatmap block | `CENTER` option | Adds `CELL_SIZE`, `UNIT`, left-align; also supports `CENTER` |
| Entries | Manual add only | Add, inline edit and delete |
| Backups | Up to 3 | Once per day, keeps 7; auto-restores the newest non-empty backup if the stats file is missing/emptied |
| Multi-device sync | Row merge via Dexie ids | mtime sentinel + row-level max-wins merge + empty-file guard |
| Commands | Open, add manual entry, check streak, 3 insert-block | Open sidebar + 3 insert-block |

> No automatic migration from upstream's Dexie / `data.json` history is implemented. This fork keeps its stats in its own dictionary-encoded file and starts fresh.

## Installation

#### MANUAL INSTALLATION

1. Download `main.js`, `manifest.json` and `styles.css` from this repository's Releases section.
2. Create the folder `<your-vault>/.obsidian/plugins/keep-the-rhythm2/`.
3. Put the three files inside it.
4. Reload Obsidian.
5. Go to Settings → Community plugins and enable **Keep the Rhythm2**.

## Usage

<details>
<summary><strong>Click to expand usage, slots, code blocks and settings</strong></summary>

### Basic Usage

Once enabled, Keep the Rhythm2 tracks your writing automatically. To view your statistics:

1. Click the calendar icon in the ribbon or run the command `Open sidebar view`.
2. The sidebar shows your slots (overview), the heatmap, and today's entries.
3. Hover any heatmap cell to see that day's exact count; click it to open the day's note (uses Obsidian's core _Daily Notes_).
4. The status bar shows `today / goal` (toggle in settings); click it to open the sidebar.

### Writing Goals

1. Set your target in **Writing Goal** in the settings.
2. The plugin tracks a streak of consecutive days meeting the goal.
3. Show it with the `CURRENT_STREAK` slot.

### Tracking Scope

By default every markdown file in the vault is tracked. Add folders under **Settings → General → Tracked Folders** to restrict tracking to a subset. The list uses a folder suggester: press **Add folder** and pick a folder; remove a row with its trash button.

- A file is tracked when its path equals a configured folder or starts with `<folder>/` (so `20-research` matches `20-research/sub/deep.md` but not `20-research-backup/notes.md`).
- An empty list tracks the whole vault (default).
- Files outside the scope are ignored, and renaming a file out of scope removes its history.

### Heatmap Customization

- **Coloring modes**: `gradual` (smooth gradient), `solid` (single color once the day reaches your Writing Goal), `stops` (discrete thresholds) and `liquid` (fills from the bottom up).
- **Cell shape and size**: rounded or squared; configurable pixel size.
- **Labels**: hide month and/or weekday labels; align cells left.
- **Range**: number of weeks displayed and a custom start date.
- **Colors**: separate light/dark palettes, with reset-to-default.
- **Navigation**: click a cell to open that day's note.

### Data Slots

Add up to 10 slots per view. Each is `TARGET, UNIT, CALC`, where `UNIT` is `WORD` or `CHAR` and `CALC` is `TOTAL` or `AVG`.

| Slot | Meaning | AVG |
| --- | --- | --- |
| `CURRENT_FILE` | Today's delta for the active file | no |
| `CURRENT_DAY` | Words written today | no |
| `CURRENT_WEEK` | From Monday of this week to today | yes |
| `CURRENT_MONTH` | From the start of the month to today | yes |
| `CURRENT_YEAR` | From the start of the year to today | yes |
| `LAST_DAY` | Yesterday + today (2 days) | no |
| `LAST_WEEK` | Rolling last 7 days | yes |
| `LAST_MONTH` | Rolling last 30 days | yes |
| `LAST_YEAR` | Rolling last 365 days | yes |
| `CURRENT_STREAK` | Consecutive days meeting the goal (in days) | no |

### Code Blocks

Three embeddable code blocks. Insert them with the commands `Insert Heatmap/Slots/Entries code block` (or type them manually).

#### Heatmap (`ktr-heatmap`)

A filter expression, then an `OPTIONS` section:

````
```ktr-heatmap
filePath starts_with "journal"

OPTIONS
HIDE month_labels, weekday_labels
COLORING_MODE liquid
STOPS 100, 500, 1000
WEEKS 24
CENTER
CELL_SIZE 14
UNIT WORD
```
````

- Query fields: `date`, `filePath`, `wordsAdded`, `charsAdded`. Operators: `starts_with`, `contains`, `==`, `!=`, `>`, `<`, `>=`, `<=`, `&&`, `||`, `!`, plus `AND`/`OR` aliases and parentheses.
- Options: `HIDE month_labels, weekday_labels`; `COLORING_MODE liquid|stops|solid|gradual`; `STOPS a, b, c`; `SQUARED_CELLS` / `ROUNDED_CELLS`; `START_DATE YYYY-MM-DD`; `WEEKS n`; `CELL_SIZE n`; `UNIT WORD|CHAR`; `CENTER` (horizontally center the heatmap in the note).

#### Data Slots (`ktr-slots`)

One slot per line: `TARGET`, `TARGET, UNIT`, or `TARGET, UNIT, CALC`.

````
```ktr-slots
CURRENT_WEEK, WORD
CURRENT_DAY, CHAR
CURRENT_STREAK
CURRENT_MONTH, WORD, AVG
```
````

#### Daily Entries (`ktr-entries`)

An optional date (`YYYY-MM-DD`, defaults to today) plus optional path filters:

````
```ktr-entries
filePath includes "journal"
2026-08-01
```
````

- `filePath includes "..."` / `filePath excludes "..."` filter the listed files.
- Entries can be added manually, edited inline (double-click) and deleted.

### Settings

- **General**: Preferred Unit, Enabled Languages (10 scripts), Ignore Comments, Ignore Tasks, Ignore Deleted Files, Writing Goal, Editor Change Sample Delay, Tracked Folders.
- **Heatmaps**: navigation, shape, labels, alignment, start date, weeks, cell size, coloring mode, intensity stops, light/dark colors.
- **Sidebar**: show/hide overview, entries and heatmap.
- **Status Bar**: show today's count.
- **Data Storage**: stats data file location and history length.
- **Backup**: enable, folder path, days retained.

</details>

## Storage and Privacy

All data stays **local** — nothing is sent to external servers. Settings live in the plugin's `data.json` (Obsidian-managed); writing stats live in a separate JSON file (default `stats.json`, changeable to any vault-relative path under **Settings → Data Storage**).

- **Dictionary encoding**: file paths are stored once as small integer IDs, activity is aggregated per day, and files that are only opened (never written) produce no row. Measured against upstream's `data.json` for a normal user (500-file vault, ~12 files opened and 6 written per day, 500 words/day), the stats file is ~85% smaller after 30 days, ~92% after a year and ~94% after three years. Upstream keeps a permanent starting-count + 5-minute-delta row for every file click, so roughly a third of its history is empty, never-written files.
- **Live deltas**: today's value per file is `current count − count when first touched today`, so it can go negative when a file shrinks. Negative rows are kept and can be corrected.
- **Multi-device**: when the stats file changes behind the plugin's back (Obsidian Sync, Git, etc.), it is detected via mtime and merged row-by-row; the larger value wins. An empty external file never overwrites local data.
- **Backups**: once per calendar day a raw copy is written to the backup folder (default `.keep-the-rhythm2`), keeping the newest 7 days. If the stats file is missing or emptied, the newest non-empty backup is restored automatically.

## Support

If you encounter any issues or have suggestions:

1. Check the GitHub Issues to see if your issue has already been reported.
2. Create a new issue with as much detail as possible.

## FAQ

#### Why is there a separate version (Keep the Rhythm2)?

This fork reworks upstream to address two limitations:

- **Performance** — as history grows, a flat array of fine-grained rows becomes slow to reprocess. This fork uses a Zustand reactive store and dictionary-encoded, per-day aggregates with cache-friendly lookups.
- **Storage efficiency** — upstream duplicates file paths, stores per-5-minute deltas, and keeps a permanent record for every file click (even files never written to). This fork removes all three, cutting the stats file by ~85% after 30 days and ~92–94% after a year or more of normal use.
