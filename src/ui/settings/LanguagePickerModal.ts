import { App, Modal, Setting } from "obsidian";
import { Language } from "@/defs/types";
import { t } from "@/ui/i18n";

export const LANGUAGE_ORDER: Language[] = [
  "LATIN",
  "CHINESE",
  "JAPANESE",
  "KOREAN",
  "CYRILLIC",
  "GREEK",
  "ARABIC",
  "HEBREW",
  "INDIC",
  "SOUTHEAST_ASIAN",
];

export function getLanguageLabels(): Record<Language, string> {
  return {
    LATIN: t("language.latin"),
    CHINESE: t("language.chinese"),
    JAPANESE: t("language.japanese"),
    KOREAN: t("language.korean"),
    CYRILLIC: t("language.cyrillic"),
    GREEK: t("language.greek"),
    ARABIC: t("language.arabic"),
    HEBREW: t("language.hebrew"),
    INDIC: t("language.indic"),
    SOUTHEAST_ASIAN: t("language.southeastAsian"),
  };
}

export class LanguagePickerModal extends Modal {
  private selected: Set<Language>;
  private onConfirm: (scripts: Language[]) => void;
  private onCloseCallback?: () => void;

  constructor(
    app: App,
    initial: Language[],
    onConfirm: (scripts: Language[]) => void,
    onClose?: () => void,
  ) {
    super(app);
    this.selected = new Set(initial);
    this.onConfirm = onConfirm;
    this.onCloseCallback = onClose;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h3", { text: t("languagePicker.title") });
    contentEl.createEl("p", {
      text: t("languagePicker.desc"),
    });

    const toolbar = contentEl.createDiv({ cls: "modal-button-container" });
    const selectAllButton = toolbar.createEl("button", {
      text: t("common.selectAll"),
      cls: "mod-cta",
    });
    selectAllButton.addEventListener("click", () => {
      for (const lang of LANGUAGE_ORDER) {
        this.selected.add(lang);
      }
      this.renderToggles(contentEl);
    });
    const clearButton = toolbar.createEl("button", {
      text: t("common.clear"),
    });
    clearButton.addEventListener("click", () => {
      this.selected.clear();
      this.renderToggles(contentEl);
    });

    this.renderToggles(contentEl);

    new Setting(contentEl)
      .addButton((button) =>
        button.setButtonText(t("common.cancel")).onClick(() => this.close()),
      )
      .addButton((button) =>
        button
          .setButtonText(t("common.save"))
          .setCta()
          .onClick(() => {
            this.onConfirm([...this.selected]);
            this.close();
          }),
      );
  }

  private renderToggles(container: HTMLElement) {
    const existing = container.querySelector<HTMLElement>(".ktr-language-picker-list");
    const wrapper = existing ?? container.createDiv({ cls: "ktr-language-picker-list" });
    wrapper.empty();

    const labels = getLanguageLabels();
    for (const lang of LANGUAGE_ORDER) {
      new Setting(wrapper)
        .setName(labels[lang])
        .addToggle((toggle) =>
          toggle
            .setValue(this.selected.has(lang))
            .onChange((value) => {
              if (value) {
                this.selected.add(lang);
              } else {
                this.selected.delete(lang);
              }
            }),
        );
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
    this.onCloseCallback?.();
  }
}
