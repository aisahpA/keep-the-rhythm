import { App, Modal, getIconIds, setIcon } from "obsidian";
import { t } from "@/ui/i18n";

const MAX_RESULTS = 300;

/** Grid picker over Obsidian's Lucide icon set, with a text filter. */
export class IconPickerModal extends Modal {
	constructor(
		app: App,
		private current: string,
		private onChoose: (icon: string) => void,
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("KTR-icon-picker");
		contentEl.createEl("h3", { text: t("iconPicker.title") });

		const search = contentEl.createEl("input", {
			type: "text",
			cls: "KTR-icon-picker__search",
			attr: { placeholder: t("iconPicker.search") },
		});
		const grid = contentEl.createDiv({ cls: "KTR-icon-picker__grid" });

		const render = (query: string) => {
			grid.empty();
			const q = query.trim().toLowerCase();
			const ids = getIconIds().filter(
				(id) => !q || id.toLowerCase().includes(q),
			);

			ids.slice(0, MAX_RESULTS).forEach((id) => {
				const button = grid.createEl("button", {
					cls: "KTR-icon-picker__item" + (id === this.current ? " is-selected" : ""),
					attr: { "aria-label": id, title: id },
				});
				setIcon(button, id);
				button.addEventListener("click", () => {
					this.onChoose(id);
					this.close();
				});
			});

			if (ids.length === 0) {
				grid.createDiv({
					cls: "KTR-icon-picker__empty",
					text: t("iconPicker.empty"),
				});
			}
		};

		search.addEventListener("input", () => render(search.value));
		render("");
		search.focus();
	}

	onClose() {
		this.contentEl.empty();
	}
}
