import React from "react";
import { setIcon } from "obsidian";
import { Unit, UnitDisplay } from "@/defs/types";
import { useStore } from "@/core/store";
import { t } from "@/ui/i18n";

/**
 * Renders a count's unit, either as its localized name ("字", "words", …) or
 * as the icon chosen in settings, per the `unitDisplay` setting. Each unit
 * (words / characters) has its own customizable text and icon.
 */
export function UnitLabel({ unit }: { unit: Unit }) {
	const display = useStore((s) => s.settings.unitDisplay);
	const icon = useStore((s) => s.settings.unitIcons[unit]);
	const text = useStore((s) => s.settings.unitTexts[unit]);

	if (display === UnitDisplay.ICON) {
		return (
			<span
				className="KTR-unit-icon"
				ref={(el) => {
					if (!el || el.dataset.icon === icon) return;
					setIcon(el, icon || "type");
					el.dataset.icon = icon;
				}}
			/>
		);
	}

	if (text) return <>{text}</>;

	return <>{unit === Unit.CHAR ? t("common.chars") : t("common.words")}</>;
}
