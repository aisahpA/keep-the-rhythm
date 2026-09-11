export const en = {
	// Groups
	"group.general": "General",
	"group.heatmaps": "Heatmaps",
	"group.sidebar": "Sidebar",
	"group.statusBar": "Status Bar",
	"group.dataStorage": "Data Storage",
	"group.backup": "Backup",

	// General
	"settings.preferredUnit.name": "Preferred Unit",
	"settings.preferredUnit.desc": "Default unit used when displaying counts.",
	"settings.preferredUnit.options.word": "Words",
	"settings.preferredUnit.options.char": "Characters",
	"settings.unitDisplay.name": "Unit Style",
	"settings.unitDisplay.desc": "Show count units as text or as an icon.",
	"settings.unitDisplay.options.text": "Text",
	"settings.unitDisplay.options.icon": "Icon",
	"settings.unitIcon.word.name": "Word Icon",
	"settings.unitIcon.char.name": "Character Icon",
	"settings.unitIcon.desc": "Icon used to represent a count unit when Unit Style is set to Icon.",
	"settings.unitIcon.pick": "Choose icon",
	"settings.unitText.word.name": "Word Text",
	"settings.unitText.char.name": "Character Text",
	"settings.unitText.desc": "Custom label for a count unit when Unit Style is set to Text. Leave empty for the default.",
	"iconPicker.title": "Choose an icon",
	"iconPicker.search": "Search icons...",
	"iconPicker.empty": "No icons found",
	"settings.enabledLanguages.name": "Enabled Languages",
	"settings.enabledLanguages.desc": "Select which writing systems to count.",
	"settings.ignoreComments.name": "Ignore Comments",
	"settings.ignoreComments.desc":
		"Obsidian comments (%% ... %%) are excluded from word and char counts.",
	"settings.ignoreTasks.name": "Ignore Tasks",
	"settings.ignoreTasks.desc":
		'Task lines like "- [ ] buy milk" won\'t be counted at all. Checkbox syntax is always excluded regardless of this setting. Changing this won\'t retroactively update your history.',
	"settings.ignoreDeletedFiles.name": "Ignore Deleted Files",
	"settings.ignoreDeletedFiles.desc":
		"Deleting a file won't subtract its words and characters from your daily totals.",
	"settings.writingGoal.name": "Writing Goal",
	"settings.writingGoal.desc": "Amount of words you intend to write on a day.",
	"settings.trackedFolders.name": "Tracked Folders",
	"settings.trackedFolders.desc":
		"Only track files under these folders. Leave empty to track the whole vault.",
	"settings.trackedFolders.none": "None",
	"settings.trackedFolders.more": " (+{0} more)",
	"settings.trackedFolders.emptyState":
		"No folders configured — tracking the whole vault.",
	"settings.trackedFolders.add": "Add folder",

	// Heatmaps
	"settings.heatmapNavigation.name": "Clicking a Cell Opens its Daily Note",
	"settings.roundCells.name": "Rounded Cells",
	"settings.hideMonthLabels.name": "Hide Month Labels",
	"settings.hideWeekdayLabels.name": "Hide Weekday Labels",
	"settings.alignLeft.name": "Align heatmap cells to the left",
	"settings.startDate.name": "Custom Start Date",
	"settings.startDate.desc":
		"Makes the heatmap start from a specific date (like the start of the year).",
	"settings.numberOfWeeks.name": "Default number of weeks displayed",
	"settings.cellSize.name": "Cell size (px)",
	"settings.cellSize.desc": "Size of each heatmap cell in pixels.",
	"settings.coloringMode.name": "Coloring Mode",
	"settings.coloringMode.desc": "Changes how the heatmap cells are filled.",
	"settings.coloringMode.options.stops": "Stops",
	"settings.coloringMode.options.gradual": "Gradual",
	"settings.coloringMode.options.solid": "Solid",
	"settings.coloringMode.options.liquid": "Liquid",
	"settings.intensityThresholds.name": "Intensity thresholds",
	"settings.intensityThresholds.desc":
		"Changes how the color of each cell is calculated.",
	"settings.lightColors.name": "Light Theme Colors",
	"settings.darkColors.name": "Dark Theme Colors",
	"settings.themeColors.desc":
		"Colors used to paint each cell, ranges vary based on coloring mode.",
	"settings.colorReset.confirm":
		"Are you sure you want to reset the {0} theme colors to their default values?",
	"settings.theme.light": "light",
	"settings.theme.dark": "dark",
	"settings.thresholds.solidInfo":
		"Days are filled when their word count reaches your Writing Goal ({0} words). The threshold follows the Writing Goal setting.",
	"settings.thresholds.solidWarn":
		" Note: with a goal of 0 every day counts as met.",
	"settings.thresholds.low": "Low",
	"settings.thresholds.medium": "Medium",
	"settings.thresholds.high": "High",
	"settings.thresholds.stopsHint":
		"0 Words → level 0 (uncolored); under low → level 1; Low–medium → level 2; Medium–high → level 3; above high → level 4 (strongest color).",
	"settings.thresholds.rangeHint":
		"Below Low ({0} words) cells stay uncolored; above High ({1} words) they reach full intensity. Days in between blend on a continuous scale.",
	"settings.thresholds.words": "{0} words",

	// Sidebar
	"settings.showOverview.name": "Show overview",
	"settings.showOverview.desc":
		"Display the overview section in the word count heatmap.",
	"settings.showEntries.name": "Show today's entries",
	"settings.showEntries.desc":
		"Display which files were edited today and their respective word counts.",
	"settings.showHeatmap.name": "Show heatmap",
	"settings.showHeatmap.desc": "Displays a heatmap with historic writing data.",

	// Status bar
	"settings.statusBar.name": "Show today's word count",
	"settings.statusBar.desc":
		"Display today's total word count and your daily goal in the status bar. Click it to open the sidebar.",
	"statusBar.aria": "Today's word count: {0} of {1}",

	// Data storage
	"settings.statsFile.name": "Stats Data File",
	"settings.statsFile.desc":
		"Vault-relative path (including the file name) where the writing statistics are stored. Leave empty for the default location next to the plugin's settings file. Switching to a path with an existing file merges it (larger daily values win) and removes the old file.",
	"settings.notice.defaultFile": "Ktr: using the default data file location.",
	"settings.notice.fileSet": "KTR: data file set to {0}.",
	"settings.confirmPath": "Confirm path",
	"settings.storedHistory.name": "Stored History",
	"settings.storedHistory.one": "{0} day of writing history on record.",
	"settings.storedHistory.other": "{0} days of writing history on record.",

	// Backup
	"settings.automaticBackups.name": "Automatic Backups",
	"settings.automaticBackups.desc":
		"For safety, disabling this does not delete existing back-ups, you have to do it manually.",
	"settings.backupFolderPath.name": "Backup Folder Path",
	"settings.backupFolderPath.desc":
		"Location where backup files will be stored (relative to vault root).",
	"settings.backupRetained.name": "Backup Days Retained",
	"settings.backupRetained.desc":
		"How many days of backups to keep (one backup per day, taken at the first launch of that day). Older backups will be automatically deleted.",
	"settings.backupRetained.validate": "Must be an integer greater than 0.",

	// Language picker
	"languagePicker.title": "Languages to count",
	"languagePicker.desc": "Pick which writing systems to count.",
	"language.latin": "Latin (English, French…)",
	"language.chinese": "Chinese",
	"language.japanese": "Japanese",
	"language.korean": "Korean",
	"language.cyrillic": "Cyrillic (Russian, Ukrainian…)",
	"language.greek": "Greek",
	"language.arabic": "Arabic",
	"language.hebrew": "Hebrew",
	"language.indic": "Indic (Hindi, Tamil…)",
	"language.southeastAsian": "Southeast Asian (Thai, Vietnamese…)",

	// Confirmation modal
	"confirm.title": "Confirm action",

	// Folder search modal
	"folderSuggest.placeholder": "Type to search folders...",
	"folderSuggest.empty": "No folders found",

	// Slots
	"slot.currentFile": "This File",
	"slot.currentDay": "Today",
	"slot.currentWeek": "This Week",
	"slot.currentMonth": "This Month",
	"slot.currentYear": "This Year",
	"slot.lastDay": "Last 2 Days",
	"slot.lastWeek": "Last 7 Days",
	"slot.lastMonth": "Last 30 Days",
	"slot.lastYear": "Last Year",
	"slot.currentStreak": "Streak",
	"slot.addNew": "+ ADD NEW SLOT",
	"slot.maxSlots": "Maximum of 10 slots per view! (At least for now)",
	"slot.showDailyAverage": "Show daily average",
	"slot.showTotal": "Show total",
	"slot.changeUnit": "Change Unit",
	"slot.changeType": "Change Type",

	// Entries
	"entries.titleToday": "ENTRIES TODAY",
	"entries.titleForDate": "ENTRIES ({0})",
	"entries.pickDate": "Pick a date",
	"entries.backToToday": "Back to today",
	"entries.changeUnit": "Change Unit",
	"entries.addEntry": "Add entry",
	"entries.editEntry": "Edit entry",
	"entries.deleteEntry": "Delete entry",
	"entries.saveEntry": "Save entry",
	"entries.empty": "No files edited today",
	"entries.placeholderFile": "File path…",
	"entries.placeholderWords": "Words",
	"entries.noticePickFile": "Please pick a file",
	"entries.noticeFileNotFound": "File not found: {0}",
	"entries.fileNotFound": "File not found!",
	"entries.noticeInvalidCount": "Please enter a valid word count",
	"entries.baseline": "Baseline {0} → current {1} ({2} today)",
	"entries.deleteConfirm":
		'Delete entry "{0}"{1} from {2}? This cannot be undone.',
	"entries.deleteDetail": " ({0} words)",

	// Heatmap
	"heatmap.changeUnit": "Change Unit",

	// Common
	"common.cancel": "Cancel",
	"common.save": "Save",
	"common.clear": "Clear",
	"common.selectAll": "Select all",
	"common.confirm": "Confirm",
	"common.delete": "Delete",
	"common.none": "None",
	"common.words": "words",
	"common.chars": "chars",
	"common.days": "days",
	"common.perDay": "/day",

	// Weekdays
	"weekday.mon": "Mon",
	"weekday.tue": "Tue",
	"weekday.wed": "Wed",
	"weekday.thu": "Thu",
	"weekday.fri": "Fri",
	"weekday.sat": "Sat",
	"weekday.sun": "Sun",

	// Months
	"month.1": "Jan",
	"month.2": "Feb",
	"month.3": "Mar",
	"month.4": "Apr",
	"month.5": "May",
	"month.6": "Jun",
	"month.7": "Jul",
	"month.8": "Aug",
	"month.9": "Sep",
	"month.10": "Oct",
	"month.11": "Nov",
	"month.12": "Dec",
};

export type En = typeof en;
