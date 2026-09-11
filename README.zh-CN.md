# Keep the Rhythm2

[English](README.md) | [简体中文](README.zh-CN.md)

一款 Obsidian 插件：记录每日写作量、设定目标，并用热力图展示写作进度。基于 [Keep the Rhythm](https://github.com/benjaminezequiel/keep-the-rhythm) 重写。

![image](https://github.com/user-attachments/assets/8acd047d-68da-42d0-835d-6c7ab55b6f65)

## 与上游插件的区别

对照上游 [`benjaminezequiel/keep-the-rhythm`](https://github.com/benjaminezequiel/keep-the-rhythm) `v0.2.16`（本分支从 `v0.2.12` 分出）：

| 方面 | 上游 | 本插件（`keep-the-rhythm2`） |
| --- | --- | --- |
| 存储 | Dexie/IndexedDB；全量回写 `data.json`；按文件记录 5 分钟增量；**每次点击文件都永久留一条记录**（即使从未写入） | 纯 JSON 统计文件（默认 `stats.json`，可配置 vault 相对路径）；文件路径字典编码、按天聚合；只打开不写入的文件不产生记录；体积约减少 85–94% |
| 状态管理 | 手动事件/刷新 | Zustand 响应式 store + 分区缓存（槽位查询 O(1)） |
| 实时统计 | 5 分钟时间片增量 | 相对当日首次触碰基准的实时增量，可为负且可编辑 |
| 追踪范围 | 整个 vault | **Tracked Folders** 可只统计 vault 的一部分 |
| 状态栏 | — | 显示「今日字数 / 目标」，点击打开侧边栏 |
| 语言 | 10 种脚本，CJK 合并 | 10 种脚本，中文 / 日文 / 韩文拆分 |
| 槽位 | 有 `WHOLE_VAULT`；`CURRENT_FILE` = 文件总量 | **移除** `WHOLE_VAULT`；`CURRENT_FILE` = 当前文件今日增量 |
| `LAST_DAY` | 最近 24 小时 | 最近 2 个自然日 |
| 热力图代码块 | `CENTER` 选项 | 新增 `CELL_SIZE`、`UNIT`、左对齐；同样支持 `CENTER` |
| 条目 | 仅手动新增 | 新增、行内编辑、删除 |
| 备份 | 最多 3 份 | 每天一份、保留 7 天；统计文件丢失/被清空时自动恢复最新非空备份 |
| 多设备同步 | 基于 Dexie id 的行合并 | mtime 哨兵 + 行级 max-wins 合并 + 空文件保护 |
| 命令 | 打开、手动条目、检查连续达标天数、3 个插入代码块 | 打开侧边栏 + 3 个插入代码块 |

> 未实现从上游 Dexie / `data.json` 历史数据的自动迁移。本插件使用自己的字典编码统计文件，从零开始记录。

## 安装

#### BRAT 安装

1. 安装并启用 [BRAT](https://github.com/TfTHacker/obsidian42-brat) 插件。
2. 运行命令 `BRAT: Add a beta plugin for testing`。
3. 输入 `aisahpA/keep-the-rhythm`。
4. 点击 **Add Plugin**，然后在 设置 → 第三方插件 中启用 **Keep the Rhythm2**。

BRAT 会从本仓库的 Releases 自动更新插件。

#### 手动安装

1. 在本仓库 Releases 页面下载 `main.js`、`manifest.json`、`styles.css`。
2. 创建目录 `<你的库>/.obsidian/plugins/keep-the-rhythm2/`。
3. 将三个文件放入该目录。
4. 重启 Obsidian。
5. 进入 设置 → 第三方插件，启用 **Keep the Rhythm2**。

## 使用说明

<details>
<summary><strong>点击展开：基础用法、槽位、代码块与设置</strong></summary>

### 基础用法

启用后即自动记录写作。查看统计：

1. 点击左侧功能区的日历图标，或执行命令「Open sidebar view」。
2. 侧边栏显示槽位概览、热力图和今日条目。
3. 悬停热力图单元格查看当天字数；点击可打开当天的日记（使用 Obsidian 核心插件 _Daily Notes_）。
4. 状态栏显示「今日 / 目标」（可在设置中关闭），点击打开侧边栏。

### 写作目标

1. 在设置中填写 **Writing Goal**。
2. 插件会统计连续达标的天数（连击）。
3. 用 `CURRENT_STREAK` 槽位显示。

### 追踪范围

默认统计 vault 内所有 markdown 文件。在 **设置 → General → Tracked Folders** 中添加目录可只统计部分文件。列表通过目录选择器添加：点击 **Add folder** 选择目录，点击行的垃圾桶按钮移除。

- 当文件路径等于所配置目录，或以 `<目录>/` 开头时被统计（例如 `20-research` 匹配 `20-research/sub/deep.md`，但不匹配 `20-research-backup/notes.md`）。
- 列表为空时统计整个 vault（默认）。
- 范围外的文件被忽略；把文件改名移出范围会删除其历史记录。

### 热力图定制

- **着色模式**：`gradual`（平滑渐变）、`solid`（当天达到写作目标即满色）、`stops`（分级阈值）、`liquid`（自下而上填充）。
- **单元格**：圆角或方形，尺寸可调。
- **标签**：可隐藏月份、星期标签；单元格可左对齐。
- **范围**：显示周数、自定义起始日期。
- **配色**：明暗主题各自配置，支持恢复默认。
- **导航**：点击单元格打开当天日记。

### 数据槽位

每个视图最多 10 个槽位，格式为 `目标, 单位, 计算`，其中单位是 `WORD` 或 `CHAR`，计算是 `TOTAL` 或 `AVG`。

| 槽位 | 含义 | 支持 AVG |
| --- | --- | --- |
| `CURRENT_FILE` | 当前文件今日增量 | 否 |
| `CURRENT_DAY` | 今日字数 | 否 |
| `CURRENT_WEEK` | 本周一至今天 | 是 |
| `CURRENT_MONTH` | 本月 1 号至今天 | 是 |
| `CURRENT_YEAR` | 本年 1 月 1 日至今天 | 是 |
| `LAST_DAY` | 昨天 + 今天（2 天） | 否 |
| `LAST_WEEK` | 最近 7 天 | 是 |
| `LAST_MONTH` | 最近 30 天 | 是 |
| `LAST_YEAR` | 最近 365 天 | 是 |
| `CURRENT_STREAK` | 连续达标天数 | 否 |

### 代码块

三种可嵌入的代码块，可用命令「Insert Heatmap/Slots/Entries code block」插入，也可手动输入。

#### 热力图（`ktr-heatmap`）

先写过滤表达式，再写 `OPTIONS` 段：

````
```ktr-heatmap
filePath starts_with "journal"

OPTIONS
HIDE month_labels, weekday_labels
COLORING_MODE liquid
STOPS 100, 500, 1000
WEEKS 24
CENTER
CELL_SIZE 14
UNIT WORD
```
````

- 查询字段：`date`、`filePath`、`wordsAdded`、`charsAdded`。运算符：`starts_with`、`contains`、`==`、`!=`、`>`、`<`、`>=`、`<=`、`&&`、`||`、`!`，并支持 `AND`/`OR` 别名和括号。
- 选项：`HIDE month_labels, weekday_labels`；`COLORING_MODE liquid|stops|solid|gradual`；`STOPS a, b, c`；`SQUARED_CELLS` / `ROUNDED_CELLS`；`START_DATE YYYY-MM-DD`；`WEEKS n`；`CELL_SIZE n`；`UNIT WORD|CHAR`；`CENTER`（热力图在笔记中水平居中）。

#### 数据槽位（`ktr-slots`）

每行一个槽位：`目标`、`目标, 单位`，或 `目标, 单位, 计算`。

````
```ktr-slots
CURRENT_WEEK, WORD
CURRENT_DAY, CHAR
CURRENT_STREAK
CURRENT_MONTH, WORD, AVG
```
````

#### 每日条目（`ktr-entries`）

可选的日期（`YYYY-MM-DD`，默认今天）以及可选的路径过滤：

````
```ktr-entries
filePath includes "journal"
2026-08-01
```
````

- `filePath includes "..."` / `filePath excludes "..."` 过滤所列文件。
- 条目支持手动新增、双击行内编辑、删除。

### 设置项

- **General**：Preferred Unit、Enabled Languages（10 种脚本）、Ignore Comments、Ignore Tasks、Ignore Deleted Files、Writing Goal、Editor Change Sample Delay、Tracked Folders。
- **Heatmaps**：导航、形状、标签、对齐、起始日期、周数、单元格尺寸、着色模式、强度阈值、明暗配色。
- **Sidebar**：显示/隐藏概览、条目、热力图。
- **Status Bar**：显示今日字数。
- **Data Storage**：统计文件位置与历史天数。
- **Backup**：启用、备份目录、保留天数。

</details>

## 存储与隐私

所有数据都保存在**本地**，不会上传到任何服务器。设置存在插件的 `data.json`（由 Obsidian 管理）；写作统计存在单独的 JSON 文件（默认 `stats.json`，可在 **设置 → Data Storage** 改为任意 vault 相对路径）。

- **字典编码**：文件路径只存一次并映射为小整数 ID，活动按天聚合，只打开而不写入的文件不产生记录。针对普通用户实测（500 个文件的库，每天打开约 12 个、写入约 6 个，每天 500 个字），统计文件体积在 30 天后约减少 85%，一年后约 92%，三年后约 94%。上游为每次点击文件都永久保留一条「起始计数 + 5 分钟增量」记录，其历史中约有三分之一是这类从未写入的空记录。
- **实时增量**：某文件今日的值 = `当前计数 − 当天首次触碰时的计数`，因此文件变短时可以为负。负值会被保留，可手动修正。
- **多设备**：当统计文件被后台改动（Obsidian Sync、Git 等）时，通过 mtime 检测并按行合并，取较大值。外部文件为空时不会覆盖本地数据。
- **备份**：每个自然日把原始文件复制到备份目录（默认 `.keep-the-rhythm2`），保留最新 7 天。若统计文件丢失或被清空，会自动恢复最新的非空备份。

## 支持

如有问题或建议：

1. 先查看 GitHub Issues 是否已有相同问题。
2. 若无，请新建 issue 并尽量提供详细信息。

## 常见问题

#### 为什么有单独的版本（Keep the Rhythm2）？

本分支针对上游的两点不足做了重写：

- **性能**——历史增长后，扁平且细粒度的记录数组每次操作都要重新处理大量数据。本分支改用 Zustand 响应式 store，以及字典编码、按天聚合且对缓存友好的数据结构。
- **存储效率**——上游重复存储文件路径、按 5 分钟记录增量，并且为每次点击文件都永久保留一条记录（即使从未写入）。本分支去掉了这三项开销，正常使用下统计文件体积在 30 天后约减少 85%，一年及以上约减少 92–94%。
