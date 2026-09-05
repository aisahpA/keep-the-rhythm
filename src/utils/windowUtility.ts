interface InternalPluginInstance {
	enabled: boolean;
	instance?: { options?: DailyNotesSettings };
}

interface DailyNotesSettings {
	folder?: string;
	format?: string;
}

export function getCorePluginSettings(
	pluginId: string,
): DailyNotesSettings | undefined {
	const app = window.app as {
		internalPlugins?: { getPluginById: (id: string) => InternalPluginInstance | null };
	};
	const plugin = app?.internalPlugins?.getPluginById(pluginId);
	if (plugin?.enabled) {
		return plugin.instance?.options;
	}
	return undefined;
}