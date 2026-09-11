import type { En } from "./en";

export const zh: En = {
	// Groups
	"group.general": "常规",
	"group.heatmaps": "热力图",
	"group.sidebar": "侧边栏",
	"group.statusBar": "状态栏",
	"group.dataStorage": "数据存储",
	"group.backup": "备份",

	// General
	"settings.preferredUnit.name": "首选单位",
	"settings.preferredUnit.desc": "显示计数时使用的默认单位。",
	"settings.preferredUnit.options.word": "字数",
	"settings.preferredUnit.options.char": "字符数",
	"settings.unitDisplay.name": "单位样式",
	"settings.unitDisplay.desc": "以文字或图标显示计数单位。",
	"settings.unitDisplay.options.text": "文字",
	"settings.unitDisplay.options.icon": "图标",
	"settings.unitIcon.word.name": "字单位图标",
	"settings.unitIcon.char.name": "字符单位图标",
	"settings.unitIcon.desc": "单位样式设为图标时，用于表示该计数单位的图标。",
	"settings.unitIcon.pick": "选择图标",
	"settings.unitText.word.name": "字单位文字",
	"settings.unitText.char.name": "字符单位文字",
	"settings.unitText.desc": "单位样式设为文字时使用的自定义标签。留空则使用默认文字。",
	"iconPicker.title": "选择图标",
	"iconPicker.search": "搜索图标...",
	"iconPicker.empty": "未找到图标",
	"settings.enabledLanguages.name": "启用的语言",
	"settings.enabledLanguages.desc": "选择要统计的书写系统。",
	"settings.ignoreComments.name": "忽略注释",
	"settings.ignoreComments.desc":
		"Obsidian 注释（%% ... %%）不计入字数和字符数。",
	"settings.ignoreTasks.name": "忽略任务",
	"settings.ignoreTasks.desc":
		'形如 “- [ ] buy milk” 的任务行完全不计入。无论此设置如何，复选框语法始终排除。更改此设置不会追溯更新历史记录。',
	"settings.ignoreDeletedFiles.name": "忽略已删除的文件",
	"settings.ignoreDeletedFiles.desc":
		"删除文件不会从每日总计中扣除其字数和字符数。",
	"settings.writingGoal.name": "写作目标",
	"settings.writingGoal.desc": "你打算每天写作的字数。",
	"settings.trackedFolders.name": "跟踪的文件夹",
	"settings.trackedFolders.desc":
		"仅跟踪这些文件夹下的文件。留空则跟踪整个库。",
	"settings.trackedFolders.none": "无",
	"settings.trackedFolders.more": " 等 {0} 个",
	"settings.trackedFolders.emptyState": "未配置文件夹 — 跟踪整个库。",
	"settings.trackedFolders.add": "添加文件夹",

	// Heatmaps
	"settings.heatmapNavigation.name": "点击单元格打开对应的每日笔记",
	"settings.roundCells.name": "圆角单元格",
	"settings.hideMonthLabels.name": "隐藏月份标签",
	"settings.hideWeekdayLabels.name": "隐藏星期标签",
	"settings.alignLeft.name": "热力图单元格左对齐",
	"settings.startDate.name": "自定义开始日期",
	"settings.startDate.desc": "让热力图从指定日期开始（例如一年的开始）。",
	"settings.numberOfWeeks.name": "默认显示的周数",
	"settings.cellSize.name": "单元格大小（像素）",
	"settings.cellSize.desc": "每个热力图单元格的像素大小。",
	"settings.coloringMode.name": "着色模式",
	"settings.coloringMode.desc": "改变热力图单元格的填充方式。",
	"settings.coloringMode.options.stops": "分段",
	"settings.coloringMode.options.gradual": "渐变",
	"settings.coloringMode.options.solid": "纯色",
	"settings.coloringMode.options.liquid": "液态",
	"settings.intensityThresholds.name": "强度阈值",
	"settings.intensityThresholds.desc": "改变每个单元格颜色的计算方式。",
	"settings.lightColors.name": "浅色主题颜色",
	"settings.darkColors.name": "深色主题颜色",
	"settings.themeColors.desc":
		"用于填充每个单元格的颜色，取值范围随着色模式而变化。",
	"settings.colorReset.confirm": "确定要将{0}主题的颜色重置为默认值吗？",
	"settings.theme.light": "浅色",
	"settings.theme.dark": "深色",
	"settings.thresholds.solidInfo":
		"当某天的字数达到写作目标（{0} 词）时，该天会被填充。阈值跟随“写作目标”设置。",
	"settings.thresholds.solidWarn":
		" 注意：当目标为 0 时，每天都会被视为已达成。",
	"settings.thresholds.low": "低",
	"settings.thresholds.medium": "中",
	"settings.thresholds.high": "高",
	"settings.thresholds.stopsHint":
		"0 个字 → 级别 0（不着色）；低于“低” → 级别 1；“低”到“中” → 级别 2；“中”到“高” → 级别 3；高于“高” → 级别 4（颜色最深）。",
	"settings.thresholds.rangeHint":
		"低于“低”（{0} 个字）的单元格不着色；高于“高”（{1} 个字）达到最强颜色。两者之间的天数按连续比例渐变。",
	"settings.thresholds.words": "{0} 个字",

	// Sidebar
	"settings.showOverview.name": "显示概览",
	"settings.showOverview.desc": "在字数热力图中显示概览区域。",
	"settings.showEntries.name": "显示今日条目",
	"settings.showEntries.desc": "显示今天编辑了哪些文件及其对应的字数。",
	"settings.showHeatmap.name": "显示热力图",
	"settings.showHeatmap.desc": "显示历史写作数据的热力图。",

	// Status bar
	"settings.statusBar.name": "显示今日字数",
	"settings.statusBar.desc":
		"在状态栏显示今日总字数和每日目标。点击即可打开侧边栏。",
	"statusBar.aria": "今日字数：{0} / {1}",

	// Data storage
	"settings.statsFile.name": "统计数据文件",
	"settings.statsFile.desc":
		"存储写作统计数据的库内相对路径（包含文件名）。留空则使用插件设置文件旁的默认位置。切换到已存在文件的路径会合并数据（每日数值取较大者）并删除旧文件。",
	"settings.notice.defaultFile": "KTR：正在使用默认数据文件位置。",
	"settings.notice.fileSet": "KTR：数据文件已设置为 {0}。",
	"settings.confirmPath": "确认路径",
	"settings.storedHistory.name": "已存历史",
	"settings.storedHistory.one": "已记录 {0} 天的写作历史。",
	"settings.storedHistory.other": "已记录 {0} 天的写作历史。",

	// Backup
	"settings.automaticBackups.name": "自动备份",
	"settings.automaticBackups.desc":
		"为安全起见，禁用此项不会删除已有备份，需要你手动删除。",
	"settings.backupFolderPath.name": "备份文件夹路径",
	"settings.backupFolderPath.desc": "备份文件的存储位置（相对于库根目录）。",
	"settings.backupRetained.name": "备份保留天数",
	"settings.backupRetained.desc":
		"保留多少天的备份（每天一份，在当天首次启动时创建）。更早的备份将被自动删除。",
	"settings.backupRetained.validate": "必须是大于 0 的整数。",

	// Language picker
	"languagePicker.title": "要统计的语言",
	"languagePicker.desc": "选择要统计的书写系统。",
	"language.latin": "拉丁字母（英语、法语…）",
	"language.chinese": "中文",
	"language.japanese": "日文",
	"language.korean": "韩文",
	"language.cyrillic": "西里尔字母（俄语、乌克兰语…）",
	"language.greek": "希腊文",
	"language.arabic": "阿拉伯文",
	"language.hebrew": "希伯来文",
	"language.indic": "印度系文字（印地语、泰米尔语…）",
	"language.southeastAsian": "东南亚文字（泰语、越南语…）",

	// Confirmation modal
	"confirm.title": "确认操作",

	// Folder search modal
	"folderSuggest.placeholder": "输入以搜索文件夹...",
	"folderSuggest.empty": "未找到文件夹",

	// Slots
	"slot.currentFile": "本文件",
	"slot.currentDay": "今天",
	"slot.currentWeek": "本周",
	"slot.currentMonth": "本月",
	"slot.currentYear": "今年",
	"slot.lastDay": "最近 2 天",
	"slot.lastWeek": "最近 7 天",
	"slot.lastMonth": "最近 30 天",
	"slot.lastYear": "去年",
	"slot.currentStreak": "连续天数",
	"slot.addNew": "+ 新增槽位",
	"slot.maxSlots": "每个视图最多 10 个槽位！（暂时如此）",
	"slot.showDailyAverage": "显示日均",
	"slot.showTotal": "显示总量",
	"slot.changeUnit": "切换单位",
	"slot.changeType": "更改类型",

	// Entries
	"entries.titleToday": "今日条目",
	"entries.titleForDate": "条目（{0}）",
	"entries.pickDate": "选择日期",
	"entries.backToToday": "回到今天",
	"entries.changeUnit": "切换单位",
	"entries.addEntry": "添加条目",
	"entries.editEntry": "编辑条目",
	"entries.deleteEntry": "删除条目",
	"entries.saveEntry": "保存条目",
	"entries.empty": "今天没有编辑文件",
	"entries.placeholderFile": "文件路径…",
	"entries.placeholderWords": "字数…",
	"entries.noticePickFile": "请选择一个文件",
	"entries.noticeFileNotFound": "找不到文件：{0}",
	"entries.fileNotFound": "找不到文件！",
	"entries.noticeInvalidCount": "请输入有效的字数",
	"entries.baseline": "基准 {0} → 当前 {1}（今日 {2}）",
	"entries.deleteConfirm": "从 {2} 删除条目“{0}”{1}？此操作无法撤销。",
	"entries.deleteDetail": "（{0} 字）",

	// Heatmap
	"heatmap.changeUnit": "切换单位",

	// Common
	"common.cancel": "取消",
	"common.save": "保存",
	"common.clear": "清空",
	"common.selectAll": "全选",
	"common.confirm": "确认",
	"common.delete": "删除",
	"common.none": "无",
	"common.words": "字",
	"common.chars": "字符",
	"common.days": "天",
	"common.perDay": "/天",

	// Weekdays
	"weekday.mon": "周一",
	"weekday.tue": "周二",
	"weekday.wed": "周三",
	"weekday.thu": "周四",
	"weekday.fri": "周五",
	"weekday.sat": "周六",
	"weekday.sun": "周日",

	// Months
	"month.1": "1月",
	"month.2": "2月",
	"month.3": "3月",
	"month.4": "4月",
	"month.5": "5月",
	"month.6": "6月",
	"month.7": "7月",
	"month.8": "8月",
	"month.9": "9月",
	"month.10": "10月",
	"month.11": "11月",
	"month.12": "12月",
};
