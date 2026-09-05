import { Setting } from "obsidian";
import { ColorConfig, HeatmapColorModes } from "@/defs/types";
import { DEFAULT_SETTINGS } from "@/defs/types";
import { ConfirmationModal } from "./ConfirmationModal";
import { LanguagePickerModal, LANGUAGE_LABELS } from "./LanguagePickerModal";
import { getPlugin } from "@/core/pluginRegistry";
import { useStore } from "@/core/store";
import { applyHeatmapColorStyles } from "@/ui/styles/applyColorStyles";
import { getSettingsTab } from "./SettingsTab";

// ------------------------
// Color pickers for light/dark themes
// ------------------------
export function createColorSettings(setting: Setting, theme: "light" | "dark") {
  const settings = useStore.getState().settings;
  if (!settings.heatmapConfig.colors) return;

  const mode = settings.heatmapConfig.intensityMode;
  const colorValues = settings.heatmapConfig.colors[theme];

  let levelsToShow: (keyof ColorConfig)[] = [];

  switch (mode) {
    case HeatmapColorModes.GRADUAL:
    case HeatmapColorModes.LIQUID:
      levelsToShow = [0, 4];
      break;
    case HeatmapColorModes.SOLID:
      levelsToShow = [4];
      break;
    default:
      levelsToShow = [0, 1, 2, 3, 4];
  }

  levelsToShow.forEach((level) => {
    setting.addColorPicker((color) =>
      color.setValue(colorValues[level]).onChange((value) => {
        useStore.getState().mutateSettings((draft) => {
          if (draft.heatmapConfig.colors) {
            draft.heatmapConfig.colors[theme] = {
              ...draft.heatmapConfig.colors[theme],
              [level]: value,
            };
          }
        });
        applyHeatmapColorStyles(getPlugin().app.workspace.containerEl);
        getSettingsTab()?.refreshDomState();
      }),
    );
  });

  setting.addButton((button) => {
    button.setIcon("rotate-ccw");
    button.onClick(() => {
      new ConfirmationModal(
        getPlugin().app,
        `Are you sure you want to reset the ${theme} theme colors to their default values?`,
        () => {
          useStore.getState().mutateSettings((draft) => {
            if (draft.heatmapConfig.colors) {
              draft.heatmapConfig.colors[theme] = {
                ...DEFAULT_SETTINGS.heatmapConfig.colors![theme],
              };
            }
          });
          applyHeatmapColorStyles(getPlugin().app.workspace.containerEl);
          getSettingsTab()?.update();
        },
      ).open();
    });
  });
}

// ------------------------
// Language picker
// ------------------------
export function createLanguageDropdown(setting: Setting) {
  const settings = useStore.getState().settings;
  const enabled = settings.enabledLanguages || [];

  const summary =
    enabled.length === 0
      ? "None"
      : enabled.length === 1
        ? LANGUAGE_LABELS[enabled[0]]
        : `${LANGUAGE_LABELS[enabled[0]]}, ${LANGUAGE_LABELS[enabled[1]]}${enabled.length > 2 ? ` +${enabled.length - 2}` : ""}`;

  setting.addButton((button) => {
    button.setButtonText(summary).onClick(() => {
      const scripts = [...enabled];
      new LanguagePickerModal(
        getPlugin().app,
        scripts,
        (newScripts) => {
          useStore.getState().mutateSettings((draft) => {
            draft.enabledLanguages = newScripts;
          });
          getSettingsTab()?.refreshDomState();
        },
        () => getSettingsTab()?.refreshDomState(),
      ).open();
    });
  });
}

// ------------------------
// Custom start date picker
// ------------------------
export function createStartDateSetting(setting: Setting) {
  const startDate = useStore.getState().settings.heatmapConfig.startDate || "";

  setting.controlEl.createEl("input", {
    type: "date",
    value: startDate,
    cls: "ktr__start-date-picker",
  });

  setting.controlEl
    .querySelector("input.ktr__start-date-picker")
    ?.addEventListener("change", (event) => {
      const value = (event.target as HTMLInputElement).value;
      useStore.getState().mutateSettings((draft) => {
        draft.heatmapConfig.startDate = value || undefined;
      });
      getSettingsTab()?.refreshDomState();
    });
}

// ------------------------
// Coloring mode dropdown
// ------------------------
export function createColorModeSettings(setting: Setting) {
  const settings = useStore.getState().settings;

  setting.addDropdown((dropdown) => {
    dropdown
      .addOptions({ ...HeatmapColorModes })
      .setValue(settings.heatmapConfig.intensityMode.toUpperCase())
      .onChange((value) => {
        changeColorMode(value);
        getSettingsTab()?.update();
      });
  });
}

// ------------------------
// Threshold sliders (log scale)
// ------------------------
const THRESHOLD_MIN = 10;
const THRESHOLD_MAX = 10000;
const THRESHOLD_MIN_LOG = Math.log10(THRESHOLD_MIN);
const THRESHOLD_MAX_LOG = Math.log10(THRESHOLD_MAX);

function thresholdValueToPos(value: number): number {
	return ((Math.log10(value) - THRESHOLD_MIN_LOG) / (THRESHOLD_MAX_LOG - THRESHOLD_MIN_LOG)) * 100;
}

function thresholdPosToValue(pos: number): number {
	const raw = Math.pow(10, THRESHOLD_MIN_LOG + (pos / 100) * (THRESHOLD_MAX_LOG - THRESHOLD_MIN_LOG));
	return Math.max(THRESHOLD_MIN, Math.round(raw / 10) * 10);
}

export function createThresholdSettings(setting: Setting) {
	const settings = useStore.getState().settings;
	const { intensityMode, intensityStops } = settings.heatmapConfig;

	setting.setClass("ktr__threshold-inputs");

	// SOLID: on/off threshold is tied to the daily writing goal.
	if (intensityMode === HeatmapColorModes.SOLID) {
		const goal = settings.dailyWritingGoal;
		const info = setting.controlEl.createSpan({ cls: "ktr__threshold-solid-info" });
		info.createSpan({
			text: `Days are filled when their word count reaches your Writing Goal (${goal} words). The threshold follows the Writing Goal setting.`,
		});
		if (goal <= 0) {
			info.createSpan({
				cls: "ktr__threshold-solid-warn",
				text: " Note: with a goal of 0 every day counts as met.",
			});
		}
		return;
	}

	const thresholds: {
		key: keyof typeof intensityStops;
		label: string;
	}[] = [];

	thresholds.push({ key: "low", label: "Low" });
	if (intensityMode === HeatmapColorModes.STOPS)
		thresholds.push({ key: "medium", label: "Medium" });

	thresholds.push({ key: "high", label: "High" });

	const hint = setting.controlEl.createSpan({ cls: "ktr__threshold-hint" });
	if (intensityMode === HeatmapColorModes.STOPS) {
		hint.setText(
			"0 Words → level 0 (uncolored); under low → level 1; Low–medium → level 2; Medium–high → level 3; above high → level 4 (strongest color).",
		);
	} else {
		hint.setText(
			`Below Low (${intensityStops.low} words) cells stay uncolored; above High (${intensityStops.high} words) they reach full intensity. Days in between blend on a continuous scale.`,
		);
	}

	setting.setClass("ktr__threshold-inputs");

	thresholds.forEach(({ key, label }) => {
		const wrapper = setting.controlEl.createDiv({ cls: "ktr__threshold-slider" });
		wrapper.createSpan({ cls: "ktr__threshold-slider-label", text: label });
		const slider = wrapper.createEl("input", {
			type: "range",
			cls: "ktr__threshold-slider-input",
			attr: { min: "0", max: "100", step: "1" },
		});
		const valueEl = wrapper.createSpan({
			cls: "ktr__threshold-slider-value",
			text: `${intensityStops[key]} words`,
		});

		slider.value = String(thresholdValueToPos(Math.max(THRESHOLD_MIN, intensityStops[key])));

		slider.addEventListener("input", () => {
			let value = thresholdPosToValue(parseFloat(slider.value));
			const { low, medium, high } = useStore.getState().settings.heatmapConfig.intensityStops;

			if (key === "low") {
				value = Math.min(value, Math.max(THRESHOLD_MIN, medium - THRESHOLD_MIN));
			} else if (key === "medium") {
				value = Math.min(value, high - THRESHOLD_MIN);
				value = Math.max(value, low + THRESHOLD_MIN);
			} else if (key === "high") {
				value = Math.max(value, Math.min(THRESHOLD_MAX, medium + THRESHOLD_MIN));
			}

			useStore.getState().mutateSettings((draft) => {
				draft.heatmapConfig.intensityStops = {
					...draft.heatmapConfig.intensityStops,
					[key]: value,
				};
			});
			valueEl.setText(`${value} words`);
		});
	});
}

export function changeColorMode(value: string) {
	const mode = value.toLowerCase() as HeatmapColorModes;
	const prev = useStore.getState().settings.heatmapConfig;
	const stops = prev.intensityStops || {};
	const defaultStops = { low: 100, medium: 500, high: 1000 };

	useStore.getState().mutateSettings((draft) => {
		// Entering SOLID: the on/off threshold follows the daily writing goal.
		// Leaving SOLID: restore the default low so other modes are not
		// skewed by a goal-sized threshold (e.g. low > high in GRADUAL).
		const low =
			mode === HeatmapColorModes.SOLID
				? draft.dailyWritingGoal
				: prev.intensityMode === HeatmapColorModes.SOLID
					? defaultStops.low
					: stops.low ?? defaultStops.low;

		draft.heatmapConfig = {
			...draft.heatmapConfig,
			intensityMode: mode,
			intensityStops: {
				low,
				medium: stops.medium ?? defaultStops.medium,
				high: stops.high ?? defaultStops.high,
			},
		};
	});
}