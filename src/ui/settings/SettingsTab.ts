import {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  SettingDefinitionItem,
  FuzzySuggestModal,
  TFolder,
  TFile,
  Modal,
  Notice,
} from "obsidian";
import { Settings, HeatmapColorModes, Unit, UnitDisplay } from "@/defs/types";
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
  createUnitIconSetting,
} from "./CustomSettings";
import { t } from "@/ui/i18n";

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
        heading: t("group.counting"),
        items: [
          {
            name: t("settings.enabledLanguages.name"),
            desc: t("settings.enabledLanguages.desc"),
            render: (s: Setting) => {
              createLanguageDropdown(s);
            },
          },
          {
            name: t("settings.ignoreComments.name"),
            desc: t("settings.ignoreComments.desc"),
            control: {
              type: "toggle",
              key: "ignoreComments",
            },
          },
          {
            name: t("settings.ignoreTasks.name"),
            desc: t("settings.ignoreTasks.desc"),
            control: {
              type: "toggle",
              key: "ignoreTasks",
            },
          },
          {
            name: t("settings.ignoreDeletedFiles.name"),
            desc: t("settings.ignoreDeletedFiles.desc"),
            control: {
              type: "toggle",
              key: "ignoreDeletedFiles",
            },
          },
        ],
      },
      {
        type: "group",
        heading: t("group.units"),
        items: [
          {
            name: t("settings.preferredUnit.name"),
            desc: t("settings.preferredUnit.desc"),
            control: {
              type: "dropdown",
              key: "preferredUnit",
              options: {
                WORD: t("settings.preferredUnit.options.word"),
                CHAR: t("settings.preferredUnit.options.char"),
              },
            },
          },
          {
            name: t("settings.unitDisplay.name"),
            desc: t("settings.unitDisplay.desc"),
            control: {
              type: "dropdown",
              key: "unitDisplay",
              options: {
                TEXT: t("settings.unitDisplay.options.text"),
                ICON: t("settings.unitDisplay.options.icon"),
              },
            },
          },
          {
            name: t("settings.unitIcon.word.name"),
            desc: t("settings.unitIcon.desc"),
            visible: () => this.settings.unitDisplay === UnitDisplay.ICON,
            render: (s: Setting) => {
              createUnitIconSetting(s, Unit.WORD);
            },
          },
          {
            name: t("settings.unitIcon.char.name"),
            desc: t("settings.unitIcon.desc"),
            visible: () => this.settings.unitDisplay === UnitDisplay.ICON,
            render: (s: Setting) => {
              createUnitIconSetting(s, Unit.CHAR);
            },
          },
          {
            name: t("settings.unitText.word.name"),
            desc: t("settings.unitText.desc"),
            visible: () => this.settings.unitDisplay === UnitDisplay.TEXT,
            control: {
              type: "text",
              key: "unitTexts.WORD",
              placeholder: t("common.words"),
            },
          },
          {
            name: t("settings.unitText.char.name"),
            desc: t("settings.unitText.desc"),
            visible: () => this.settings.unitDisplay === UnitDisplay.TEXT,
            control: {
              type: "text",
              key: "unitTexts.CHAR",
              placeholder: t("common.chars"),
            },
          },
        ],
      },
      {
        type: "group",
        heading: t("group.goals"),
        items: [
          {
            name: t("settings.writingGoal.name"),
            desc: t("settings.writingGoal.desc"),
            control: {
              type: "number",
              key: "dailyWritingGoal",
              placeholder: "500",
              min: 0,
            },
          },
          {
            type: "page",
            name: t("settings.trackedFolders.name"),
            desc: t("settings.trackedFolders.desc"),
            displayValue: () => {
							const folders = this.settings.trackedFolders;
							if (folders.length === 0)
								return t('settings.trackedFolders.none');
							if (folders.length <= 3)
								return folders.join(', ');
							return folders.slice(0, 3).join(', ') + t('settings.trackedFolders.more', folders.length - 3);
						},
            items: [
              {
                type: "list",
                heading: t('settings.trackedFolders.name'),
                emptyState: t("settings.trackedFolders.emptyState"),
                items: this.settings.trackedFolders.map((folder) => ({
									name: folder,
								})),
                addItem: {
                  name: t("settings.trackedFolders.add"),
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
        heading: t("group.heatmaps"),
        items: [
          {
            name: t("settings.heatmapNavigation.name"),
            desc: t("settings.heatmapNavigation.desc"),
            control: {
              type: "toggle",
              key: "heatmapNavigation",
            },
          },
          {
            name: t("settings.roundCells.name"),
            control: {
              type: "toggle",
              key: "heatmapConfig.roundCells",
            },
          },
          {
            name: t("settings.hideMonthLabels.name"),
            control: {
              type: "toggle",
              key: "heatmapConfig.hideMonthLabels",
            },
          },
          {
            name: t("settings.hideWeekdayLabels.name"),
            control: {
              type: "toggle",
              key: "heatmapConfig.hideWeekdayLabels",
            },
          },
          {
            name: t("settings.alignLeft.name"),
            desc: t("settings.alignLeft.desc"),
            control: {
              type: "toggle",
              key: "heatmapConfig.alignLeft",
            },
          },
          {
            name: t("settings.startDate.name"),
            desc: t("settings.startDate.desc"),
            render: (s: Setting) => {
              createStartDateSetting(s);
            },
          },
          {
            name: t("settings.numberOfWeeks.name"),
            desc: t("settings.numberOfWeeks.desc"),
            control: {
              type: "number",
              key: "heatmapConfig.numberOfWeeks",
            },
          },
          {
            name: t("settings.cellSize.name"),
            desc: t("settings.cellSize.desc"),
            control: {
              type: "number",
              key: "heatmapConfig.cellSize",
              placeholder: "10",
            },
          },
        ],
      },
      {
        type: "group",
        heading: t("group.colors"),
        items: [
          {
            name: t("settings.coloringMode.name"),
            desc: t("settings.coloringMode.desc"),
            render: (s: Setting) => {
              createColorModeSettings(s);
            },
          },
          {
            name: t("settings.intensityThresholds.name"),
            desc: t("settings.intensityThresholds.desc"),
            render: (s: Setting) => {
              createThresholdSettings(s);
            },
          },
          {
            name: t("settings.lightColors.name"),
            desc: t("settings.themeColors.desc"),
            render: (s: Setting) => {
              createColorSettings(s, "light");
            },
          },
          {
            name: t("settings.darkColors.name"),
            desc: t("settings.themeColors.desc"),
            render: (s: Setting) => {
              createColorSettings(s, "dark");
            },
          },
        ],
      },
      {
        type: "group",
        heading: t("group.interface"),
        items: [
          {
            name: t("settings.showOverview.name"),
            desc: t("settings.showOverview.desc"),
            control: {
              type: "toggle",
              key: "sidebarConfig.visibility.showSlots",
            },
          },
          {
            name: t("settings.showEntries.name"),
            desc: t("settings.showEntries.desc"),
            control: {
              type: "toggle",
              key: "sidebarConfig.visibility.showEntries",
            },
          },
          {
            name: t("settings.showHeatmap.name"),
            desc: t("settings.showHeatmap.desc"),
            control: {
              type: "toggle",
              key: "sidebarConfig.visibility.showHeatmap",
            },
          },
          {
            name: t("settings.statusBar.name"),
            desc: t("settings.statusBar.desc"),
            control: {
              type: "toggle",
              key: "statusBar.enabled",
            },
          },
        ],
      },
      {
        type: "group",
        heading: t("group.data"),
        items: [
          {
            name: t("settings.statsFile.name"),
            desc: (() => {
              const current =
                this.settings.statsFileName || defaultStatsFilePath(this.plugin);
              const frag = createFragment();
              frag.createDiv({ text: t("settings.statsFile.desc") });
              frag.createDiv({
                cls: "mod-muted",
                text: t("settings.statsFile.current", current),
              });
              return frag;
            })(),
            render: (setting: Setting) => {
              setting.addButton((btn) => {
                btn
                  .setButtonText(t("settings.statsFile.change"))
                  .onClick(() => {
                    new StatsFileModal(this.app, this.plugin, () =>
                      this.update(),
                    ).open();
                  });
              });
            },
          },
          {
            name: t("settings.storedHistory.name"),
            render: (setting: Setting) => {
              const days = useStore.getState().days;
              const dayCount = Object.keys(days).length;
              const recordCount = Object.values(days).reduce(
                (sum, day) => sum + Object.keys(day).length,
                0,
              );
              setting.setDesc(
                t(
                  dayCount === 1
                    ? "settings.storedHistory.one"
                    : "settings.storedHistory.other",
                  dayCount,
                  recordCount,
                ),
              );
            },
          },
          {
            name: t("settings.automaticBackups.name"),
            desc: t("settings.automaticBackups.desc"),
            control: {
              type: "toggle",
              key: "backupConfig.enabled",
            },
          },
          {
            name: t("settings.backupFolderPath.name"),
            desc: t("settings.backupFolderPath.desc"),
            visible: () => this.settings.backupConfig.enabled,
            control: {
              type: "text",
              key: "backupConfig.folderPath",
              placeholder: ".keep-the-rhythm2",
            },
          },
          {
            name: t("settings.backupRetained.name"),
            desc: t("settings.backupRetained.desc"),
            visible: () => this.settings.backupConfig.enabled,
            control: {
              type: "number",
              key: "backupConfig.maxNumberOfBackups",
              min: 1,
              step: 1,
              validate: (value: number) => {
                if (!Number.isInteger(value) || value < 1) {
                  return t("settings.backupRetained.validate");
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


// Panel for changing the stats data file path. Built from plain DOM elements
// only — no Setting / TextComponent — because those components are thenable
// (`Setting.then`) and interacting with them inside a modal opened from the
// declarative settings tab can wedge Obsidian. Plain input + buttons keep the
// whole flow synchronous and predictable.
class StatsFileModal extends Modal {
  constructor(
    app: App,
    private plugin: Plugin,
    private onApply: () => void,
  ) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: t("settings.statsFile.modal.title") });
    contentEl.createEl("p", {
      cls: "mod-muted",
      text: t("settings.statsFile.modal.desc"),
    });

    const input = contentEl.createEl("input", {
      type: "text",
      cls: "ktr__stats-file-input",
    });
    input.placeholder = defaultStatsFilePath(this.plugin);
    input.value = useStore.getState().settings.statsFileName || "";

    const submit = async () => {
      const value = input.value.trim();
      if (!(await switchStatsFile(this.plugin, value))) return;
      new Notice(
        value === ""
          ? t("settings.notice.defaultFile")
          : t("settings.notice.fileSet", value),
      );
      this.close();
      this.onApply();
    };

    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") void submit();
    });

    const pickers = contentEl.createDiv({ cls: "ktr__stats-file-row" });
    pickers
      .createEl("button", { text: t("settings.statsFile.pickFolder") })
      .addEventListener("click", () => {
        const current =
          input.value.trim() || defaultStatsFilePath(this.plugin);
        const name = current.substring(current.lastIndexOf("/") + 1);
        new FolderSuggestModal(
          this.app,
          () => false,
          (folder) => {
            input.value = `${folder}${name}`;
          },
        ).open();
      });
    pickers
      .createEl("button", { text: t("settings.statsFile.pickFile") })
      .addEventListener("click", () => {
        new StatsFileSuggestModal(this.app, (file) => {
          input.value = file.path;
        }).open();
      });
    pickers
      .createEl("button", { text: t("settings.statsFile.modal.default") })
      .addEventListener("click", () => {
        input.value = "";
      });

    const actions = contentEl.createDiv({
      cls: "ktr__stats-file-row is-actions",
    });
    actions
      .createEl("button", { text: t("settings.statsFile.modal.cancel") })
      .addEventListener("click", () => this.close());
    actions
      .createEl("button", {
        text: t("settings.statsFile.apply"),
        cls: "mod-cta",
      })
      .addEventListener("click", () => void submit());
  }

  onClose() {
    this.contentEl.empty();
  }
}

// Fuzzy picker over every JSON file already in the vault. Lets a device that
// joins an existing sync setup point straight at the stats file another device
// created, instead of typing its path by hand.
class StatsFileSuggestModal extends FuzzySuggestModal<TFile> {
  constructor(
    app: App,
    private onSelect: (file: TFile) => void,
  ) {
    super(app);
    this.setPlaceholder(t("settings.statsFile.search.placeholder"));
    this.limit = 50;
    this.emptyStateText = t("settings.statsFile.search.empty");
  }

  getItems(): TFile[] {
    return this.app.vault
      .getFiles()
      .filter((f) => f.extension === "json")
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  getItemText(file: TFile): string {
    return file.path;
  }

  onChooseItem(file: TFile): void {
    this.onSelect(file);
  }
}

class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
	constructor(
		app: App,
		private isExcluded: (path: string) => boolean,
		private onSelect: (path: string) => void
	) {
		super(app);
		this.setPlaceholder(t('folderSuggest.placeholder'));
		this.limit = 50;
		this.emptyStateText = t('folderSuggest.empty');
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
