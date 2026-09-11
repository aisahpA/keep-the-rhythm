import {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  SettingDefinitionItem,
  FuzzySuggestModal,
  TFolder,
  TextComponent,
  Notice,
} from "obsidian";
import { Settings, HeatmapColorModes } from "@/defs/types";
import { useStore } from "@/core/store";
import {
  defaultStatsFilePath,
  switchStatsFile,
} from "@/core/dataPersistence";
import {
  createLanguageDropdown,
  createColorModeSettings,
  createThresholdSettings,
  createColorSettings,
  createStartDateSetting,
} from "./CustomSettings";

let _settingsTab: SettingsTab | null = null;
export function getSettingsTab(): SettingsTab | null {
  return _settingsTab;
}

export class SettingsTab extends PluginSettingTab {

  private plugin: Plugin;

  constructor(app: App, plugin: Plugin) {
    super(app, plugin);
    this.plugin = plugin;
    SettingsTab.register(this);
  }

  private static register(tab: SettingsTab) {
    _settingsTab = tab;
  }

  private get settings(): Settings {
    return useStore.getState().settings;
  }

  getSettingDefinitions(): SettingDefinitionItem[] {

    return [
      {
        type: "group",
        heading: "General",
        items: [
          {
            name: "Preferred Unit",
            desc: "Default unit used when displaying counts.",
            control: {
              type: "dropdown",
              key: "preferredUnit",
              options: { WORD: "Words", CHAR: "Characters" },
            },
          },
          {
            name: "Enabled Languages",
            desc: "Select which writing systems to count.",
            render: (s: Setting) => {
              createLanguageDropdown(s);
            },
          },
          {
            name: "Ignore Comments",
            desc: "Obsidian comments (%% ... %%) are excluded from word and char counts.",
            control: {
              type: "toggle",
              key: "ignoreComments",
            },
          },
          {
            name: "Ignore Tasks",
            desc: 'Task lines like "- [ ] buy milk" won\'t be counted at all. Checkbox syntax is always excluded regardless of this setting. Changing this won\'t retroactively update your history.',
            control: {
              type: "toggle",
              key: "ignoreTasks",
            },
          },
          {
            name: "Ignore Deleted Files",
            desc: "Deleting a file won't subtract its words and characters from your daily totals.",
            control: {
              type: "toggle",
              key: "ignoreDeletedFiles",
            },
          },
          {
            name: "Writing Goal",
            desc: "Amount of words you intend to write on a day.",
            control: {
              type: "number",
              key: "dailyWritingGoal",
              placeholder: "500",
              min: 0,
            },
          },
          {
            type: "page",
            name: "Tracked Folders",
            desc: "Only track files under these folders. Leave empty to track the whole vault.",
            displayValue: () => {
							const folders = this.settings.trackedFolders;
							if (folders.length === 0)
								return 'None';
							if (folders.length <= 3)
								return folders.join(', ');
							return folders.slice(0, 3).join(', ') + ` (+${folders.length - 3} more)`;
						},
            items: [
              {
                type: "list",
                heading: 'Tracked Folders',
                emptyState: "No folders configured — tracking the whole vault.",
                items: this.settings.trackedFolders.map((folder) => ({
									name: folder,
								})),
                addItem: {
                  name: "Add folder",
                  action: () => {
                    new FolderSuggestModal(
											this.app,
											(path) => {
												return this.settings.trackedFolders.some(folder => {
													return path === folder || path.startsWith(folder);
												})
											},
											(path) => {
                        useStore.getState().mutateSettings((draft) => {
                          draft.trackedFolders.push(path);
                        });
                        this.update();
											}
										).open();
                  },
                },
                onDelete: (index: number) => {
                  useStore.getState().mutateSettings((draft) => {
                    draft.trackedFolders.splice(index, 1);
                  });
                  this.update();
                },
              },
            ],
          },
        ],
      },
      {
        type: "group",
        heading: "Heatmaps",
        items: [
          {
            name: "Clicking a Cell Opens its Daily Note",
            control: {
              type: "toggle",
              key: "heatmapNavigation",
            },
          },
          {
            name: "Rounded Cells",
            control: {
              type: "toggle",
              key: "heatmapConfig.roundCells",
            },
          },
          {
            name: "Hide Month Labels",
            control: {
              type: "toggle",
              key: "heatmapConfig.hideMonthLabels",
            },
          },
          {
            name: "Hide Weekday Labels",
            control: {
              type: "toggle",
              key: "heatmapConfig.hideWeekdayLabels",
            },
          },
          {
            name: "Align heatmap cells to the left",
            control: {
              type: "toggle",
              key: "heatmapConfig.alignLeft",
            },
          },
          {
            name: "Custom Start Date",
            desc: "Makes the heatmap start from a specific date (like the start of the year).",
            render: (s: Setting) => {
              createStartDateSetting(s);
            },
          },
          {
            name: "Default number of weeks displayed",
            control: {
              type: "number",
              key: "heatmapConfig.numberOfWeeks",
            },
          },
          {
            name: "Cell size (px)",
            desc: "Size of each heatmap cell in pixels.",
            control: {
              type: "number",
              key: "heatmapConfig.cellSize",
              placeholder: "10",
            },
          },
          {
            name: "Coloring Mode",
            desc: "Changes how the heatmap cells are filled.",
            render: (s: Setting) => {
              createColorModeSettings(s);
            },
          },
          {
            name: "Intensity thresholds",
            desc: "Changes how the color of each cell is calculated.",
            render: (s: Setting) => {
              createThresholdSettings(s);
            },
          },
          {
            name: "Light Theme Colors",
            desc: "Colors used to paint each cell, ranges vary based on coloring mode.",
            render: (s: Setting) => {
              createColorSettings(s, "light");
            },
          },
          {
            name: "Dark Theme Colors",
            desc: "Colors used to paint each cell, ranges vary based on coloring mode.",
            render: (s: Setting) => {
              createColorSettings(s, "dark");
            },
          },
        ],
      },
      {
        type: "group",
        heading: "Sidebar",
        items: [
          {
            name: "Show overview",
            desc: "Display the overview section in the word count heatmap.",
            control: {
              type: "toggle",
              key: "sidebarConfig.visibility.showSlots",
            },
          },
          {
            name: "Show today's entries",
            desc: "Display which files were edited today and their respective word counts.",
            control: {
              type: "toggle",
              key: "sidebarConfig.visibility.showEntries",
            },
          },
          {
            name: "Show heatmap",
            desc: "Displays a heatmap with historic writing data.",
            control: {
              type: "toggle",
              key: "sidebarConfig.visibility.showHeatmap",
            },
          },
        ],
      },
      {
        type: "group",
        heading: "Status Bar",
        items: [
          {
            name: "Show today's word count",
            desc: "Display today's total word count and your daily goal in the status bar. Click it to open the sidebar.",
            control: {
              type: "toggle",
              key: "statusBar.enabled",
            },
          },
        ],
      },
      {
        type: "group",
        heading: "Data Storage",
        items: [
          {
            name: "Stats Data File",
            desc: "Vault-relative path (including the file name) where the writing statistics are stored. Leave empty for the default location next to the plugin's settings file. Switching to a path with an existing file merges it (larger daily values win) and removes the old file.",
            render: (setting: Setting) => {
              let text: TextComponent;
              const confirm = async () => {
                const value = text.getValue().trim();
                if (await switchStatsFile(this.plugin, value)) {
                  new Notice(
                    value === ""
                      ? "Ktr: using the default data file location."
                      : `KTR: data file set to ${value}.`,
                  );
                  this.update();
                }
              };
              setting.addText((t) => {
                text = t;
                t.setPlaceholder(defaultStatsFilePath(this.plugin));
                t.setValue(this.settings.statsFileName || "");
              }).addExtraButton((btn) => {
                btn
                  .setIcon("check")
                  .setTooltip("Confirm path")
                  .onClick(() => {
                    void confirm();
                  });
              });
            },
          },
          {
            name: "Stored History",
            render: (setting: Setting) => {
              const days = Object.keys(useStore.getState().days).length;
              setting.setDesc(
                `${days} day${days === 1 ? "" : "s"} of writing history on record.`,
              );
            },
          },
        ],
      },
      {
        type: "group",
        heading: "Backup",
        items: [
          {
            name: "Automatic Backups",
            desc: "For safety, disabling this does not delete existing back-ups, you have to do it manually.",
            control: {
              type: "toggle",
              key: "backupConfig.enabled",
            },
          },
          {
            name: "Backup Folder Path",
            desc: "Location where backup files will be stored (relative to vault root).",
            visible: () => this.settings.backupConfig.enabled,
            control: {
              type: "text",
              key: "backupConfig.folderPath",
              placeholder: ".keep-the-rhythm2",
            },
          },
          {
            name: "Backup Days Retained",
            desc: "How many days of backups to keep (one backup per day, taken at the first launch of that day). Older backups will be automatically deleted.",
            visible: () => this.settings.backupConfig.enabled,
            control: {
              type: "number",
              key: "backupConfig.maxNumberOfBackups",
              min: 1,
              step: 1,
              validate: (value: number) => {
                if (!Number.isInteger(value) || value < 1) {
                  return "Must be an integer greater than 0.";
                }
              },
            },
          },
        ],
      },
    ];
  }

  getControlValue(key: string): unknown {
    return getByPath(this.settings, key);
  }

  setControlValue(key: string, value: unknown): void {
    let solidGoalSynced = false;
    useStore.getState().mutateSettings((draft) => {
      // In SOLID mode the on/off threshold is the daily writing goal.
      if (
        key === "dailyWritingGoal" &&
        draft.heatmapConfig.intensityMode === HeatmapColorModes.SOLID
      ) {
        draft.heatmapConfig.intensityStops.low = value as number;
        solidGoalSynced = true;
      }
      setByPath(draft, key, value);
    });
    // update() re-runs render callbacks so the SOLID info text stays fresh.
    if (solidGoalSynced) {
      this.update();
    } else {
      this.refreshDomState();
    }
  }

}


class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
	constructor(
		app: App,
		private isExcluded: (path: string) => boolean,
		private onSelect: (path: string) => void
	) {
		super(app);
		this.setPlaceholder('Type to search folders...');
		this.limit = 50;
		this.emptyStateText = 'No folders found';
	}

	getItems(): TFolder[] {
		return this.app.vault.getAllFolders(false)
			.filter((f) => !this.isExcluded(f.path + '/'))
			.sort((a, b) => a.path.localeCompare(b.path));
	}

	getItemText(folder: TFolder): string {
		return folder.path;
	}

	onChooseItem(folder: TFolder): void {
		this.onSelect(folder.path + '/');
	}
}


function getByPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>(
    (acc, key) =>
      acc && typeof acc === "object"
        ? (acc as Record<string, unknown>)[key]
        : undefined,
    obj,
  );
}

function setByPath(obj: unknown, path: string, value: unknown): void {
  const keys = path.split(".");
  const last = keys.pop()!;
  let target = obj as Record<string, unknown> | undefined;
  for (const key of keys) {
    target = target?.[key] as Record<string, unknown> | undefined;
  }
  if (target) {
    target[last] = value;
  }
}
