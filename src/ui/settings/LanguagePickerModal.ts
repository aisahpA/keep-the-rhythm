import { App, Modal, Setting } from "obsidian";
import { Language } from "@/defs/types";

export const LANGUAGE_LABELS: Record<Language, string> = {
  LATIN: "Latin (English, French, German, Spanish…)",
  CJK: "Chinese (CJK)",
  JAPANESE: "Japanese",
  KOREAN: "Korean",
  CYRILLIC: "Cyrillic (Russian, Ukrainian…)",
  GREEK: "Greek",
  ARABIC: "Arabic",
  HEBREW: "Hebrew",
  INDIC: "Indic (Hindi, Tamil…)",
  SOUTHEAST_ASIAN: "Southeast Asian (Thai, Vietnamese…)",
};

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

    contentEl.createEl("h3", { text: "Languages to count" });
    contentEl.createEl("p", {
      text: "Pick which writing systems to count.",
    });

    const toolbar = contentEl.createDiv({ cls: "modal-button-container" });
    const selectAllButton = toolbar.createEl("button", {
      text: "Select all",
      cls: "mod-cta",
    });
    selectAllButton.addEventListener("click", () => {
      for (const lang of Object.keys(LANGUAGE_LABELS) as Language[]) {
        this.selected.add(lang);
      }
      this.renderToggles(contentEl);
    });
    const clearButton = toolbar.createEl("button", {
      text: "Clear",
    });
    clearButton.addEventListener("click", () => {
      this.selected.clear();
      this.renderToggles(contentEl);
    });

    this.renderToggles(contentEl);

    new Setting(contentEl)
      .addButton((button) =>
        button.setButtonText("Cancel").onClick(() => this.close()),
      )
      .addButton((button) =>
        button
          .setButtonText("Save")
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

    for (const lang of Object.keys(LANGUAGE_LABELS) as Language[]) {
      new Setting(wrapper)
        .setName(LANGUAGE_LABELS[lang])
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
