import {
	addOrUpdateActivity,
	deleteActivityFromDate,
	getActivityRowsByDate,
	selectHistoricalVersion,
	selectTodayVersion,
} from "@/core/dataQueries";
import { Tooltip } from "./Tooltip";
import * as RadixTooltip from "@radix-ui/react-tooltip";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { getFileNameWithoutExtension } from "@/utils/utils";
import { useStore } from "@/core/store";
import { getPlugin } from "@/core/pluginRegistry";
import { FileView, Notice, setIcon } from "obsidian";
import { FileSuggest } from "./FileSuggest";
import { EntryFilter } from "@/core/codeBlocks";
import { ActivityRecord } from "@/defs/types";

interface EntriesProps {
	date?: string;
	filters?: EntryFilter[];
	onDateChange?: (date: string) => void;
}

interface EntryRowProps {
	entry: ActivityRecord;
	onOpenFile: (filePath: string) => void;
	onDelete: (filePath: string) => void;
	onUpdate: (filePath: string, value: number) => void;
}

/**
 * Memoized row: only re-renders when the entry itself changes (filePath or
 * wordsAdded) or when handlers change.  With React.memo the other rows skip
 * reconciliation entirely on each keystroke, instead of N rows each getting
 * a fresh prop bundle.  Editing state lives inside the row so typing in the
 * number input never re-renders the parent list either.
 */
const EntryRow = React.memo(function EntryRow({
	entry,
	onOpenFile,
	onDelete,
	onUpdate,
}: EntryRowProps) {
	const deleteButtonRef = useRef<HTMLButtonElement | null>(null);
	const editButtonRef = useRef<HTMLButtonElement | null>(null);
	const inputRef = useRef<HTMLInputElement | null>(null);

	const [editing, setEditing] = React.useState(false);
	const [editValue, setEditValue] = React.useState("");
	// Guards the onBlur commit from double-firing after Enter/Escape closed
	// the editor (blur can follow the removal of the focused element).
	const editingClosedRef = useRef(false);

	useEffect(() => {
		const el = deleteButtonRef.current;
		if (el) setIcon(el, "trash-2");
	}, []);

	useEffect(() => {
		const el = editButtonRef.current;
		if (el) setIcon(el, "pencil");
	}, []);

	useEffect(() => {
		if (editing) {
			const el = inputRef.current;
			if (el) {
				el.focus();
				el.select();
			}
		}
	}, [editing]);

	const startEditing = useCallback(() => {
		editingClosedRef.current = false;
		setEditValue(String(entry.wordsAdded));
		setEditing(true);
	}, [entry.wordsAdded]);

	const closeEditing = useCallback(
		(commit: boolean) => {
			if (editingClosedRef.current) return;
			editingClosedRef.current = true;
			if (commit) {
				// An emptied input is treated as cancel, not as 0 (delete).
				const value = Number(editValue);
				if (editValue.trim() !== "" && Number.isFinite(value) && value >= 0) {
					if (value === 0) onDelete(entry.filePath);
					else onUpdate(entry.filePath, value);
				}
			}
			setEditing(false);
		},
		[editValue, onDelete, onUpdate, entry.filePath],
	);

	const delta = entry.wordsAdded;
	const prefix = delta > 0 ? "+" : "";

	return (
		<div className="todayEntires__list-item">
			<span
				className="todayEntries__file-path"
				onClick={() => onOpenFile(entry.filePath)}
			>
				{getFileNameWithoutExtension(entry.filePath)}
			</span>
			<div className="todayEntries__list-item-right">
				{editing ? (
					<input
						ref={inputRef}
						className="todayEntries__edit-input"
						type="number"
						min="0"
						value={editValue}
						onChange={(e) => setEditValue(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") closeEditing(true);
							else if (e.key === "Escape") closeEditing(false);
						}}
						onBlur={() => closeEditing(true)}
					/>
				) : (
					<>
						<span
							className="todayEntries__word-count"
							onDoubleClick={startEditing}
						>
							{prefix}
							{delta.toLocaleString()}
						</span>
						<span className="todayEntries_list-item-unit">
							{" words"}
						</span>
					</>
				)}
				<Tooltip content="Edit entry">
					<button
						ref={editButtonRef}
						className="todayEntries__edit-button"
						onClick={startEditing}
					/>
				</Tooltip>
				<Tooltip content="Delete entry">
					<button
						ref={deleteButtonRef}
						className="todayEntries__delete-button"
						onClick={() => onDelete(entry.filePath)}
					/>
				</Tooltip>
			</div>
		</div>
	);
});

interface QuickAddRowProps {
	date: string;
	onClose: () => void;
}

/**
 * Inline quick-add row at the bottom of the entries list.  The date is
 * snapshotted when the row opens (the viewed date), so backfilling a
 * historical day works by picking the date in the header first.  After a
 * save the fields clear but the row stays open for consecutive entries.
 */
const QuickAddRow = React.memo(function QuickAddRow({
	date,
	onClose,
}: QuickAddRowProps) {
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const wordsInputRef = useRef<HTMLInputElement | null>(null);

	const setSaveIcon = useCallback((el: HTMLButtonElement | null) => {
		if (el && !el.dataset.iconSet) {
			setIcon(el, "check");
			el.dataset.iconSet = "1";
		}
	}, []);

	const setCancelIcon = useCallback((el: HTMLButtonElement | null) => {
		if (el && !el.dataset.iconSet) {
			setIcon(el, "x");
			el.dataset.iconSet = "1";
		}
	}, []);

	useEffect(() => {
		const el = fileInputRef.current;
		if (el) new FileSuggest(getPlugin().app, el);
		// Focus the file input on open so a new entry can be typed right away.
		el?.focus();
	}, []);

	const handleSave = useCallback(async () => {
		const filePath = fileInputRef.current?.value.trim() ?? "";
		if (!filePath) {
			new Notice("Please pick a file");
			return;
		}
		const app = getPlugin().app;
		const file = app.vault.getFileByPath(filePath);
		if (!file) {
			new Notice(`File not found: ${filePath}`);
			return;
		}
		const value = Number(wordsInputRef.current?.value);
		if (!Number.isFinite(value) || value <= 0) {
			new Notice("Please enter a valid word count");
			return;
		}
		await addOrUpdateActivity(file, date, value);
		// Clear fields and keep the row open for consecutive entries.
		if (fileInputRef.current) fileInputRef.current.value = "";
		if (wordsInputRef.current) wordsInputRef.current.value = "";
		wordsInputRef.current?.focus();
	}, [date]);

	const handleWordsKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter") {
				e.preventDefault();
				void handleSave();
			} else if (e.key === "Escape") {
				onClose();
			}
		},
		[handleSave, onClose],
	);

	return (
		<div className="todayEntries__quick-add">
			<input
				ref={fileInputRef}
				className="todayEntries__quick-add-file"
				type="text"
				placeholder="File path…"
			/>
			<input
				ref={wordsInputRef}
				className="todayEntries__quick-add-words"
				type="number"
				min="0"
				placeholder="Words"
				onKeyDown={handleWordsKeyDown}
			/>
			<Tooltip content="Save entry">
				<button
					ref={setSaveIcon}
					className="todayEntries__quick-add-save"
					onClick={() => void handleSave()}
				/>
			</Tooltip>
			<Tooltip content="Cancel">
				<button
					ref={setCancelIcon}
					className="todayEntries__quick-add-cancel"
					onClick={onClose}
				/>
			</Tooltip>
		</div>
	);
});

export const Entries = ({ date: dateProp, filters, onDateChange }: EntriesProps) => {
	// Subscribe to today so the header label + default date stay live when
	// the calendar rolls over.
	const today = useStore((s) => s.today);
	const [selectedDate, setSelectedDate] = React.useState<string>(
		() => dateProp ?? today,
	);

	// Sync internal state when the code-block `date` prop changes (re-render).
	useEffect(() => {
		if (dateProp) setSelectedDate(dateProp);
	}, [dateProp]);

	// Report internal date changes (date picker, "Back to today", rollover)
	// so the sidebar heatmap highlight follows.  The parent setting the same
	// value bails out, so this cannot loop.
	useEffect(() => {
		onDateChange?.(selectedDate);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selectedDate]);

	// Midnight rollover: only follow the calendar when the user is still on
	// the previous "today".  A deliberately picked past date is preserved.
	const prevTodayRef = useRef(today);
	useEffect(() => {
		const prev = prevTodayRef.current;
		prevTodayRef.current = today;
		if (prev !== today && selectedDate === prev) {
			setSelectedDate(today);
		}
	}, [today, selectedDate]);

	const date = selectedDate;
	const historicalVersion = useStore(selectHistoricalVersion);
	const todayVersion = useStore(selectTodayVersion);

	// Subscribe to the version counter, not the map reference.  A single
	// memo keyed on `date` + the version stamp that actually invalidates
	// it: today's entries refresh on every keystroke (todayVersion),
	// historical dates only when historical data changes — typing in
	// another file while a past date is open stays cheap.
	const version = date === today ? todayVersion : historicalVersion;
	const rawEntries = useMemo(() => getActivityRowsByDate(date), [
		date,
		version,
	]);

	const matchesFilters = useCallback(
		(entry: ActivityRecord): boolean => {
			if (entry.wordsAdded === 0) return false;
			// "date" type is resolved upstream into the `date` prop, so only
			// includes/excludes reach this predicate.
			return (filters ?? []).every((f) => {
				if (f.type === "includes") return entry.filePath.includes(f.value);
				if (f.type === "excludes") return !entry.filePath.includes(f.value);
				return true;
			});
		},
		[filters],
	);

	// Filter + sort live in their own useMemo so a `filters` change does
	// not re-fetch data, and a data change does not re-run the filter
	// against the same predicate.  The work is cheap (k < 10) but the
	// reference identity matters for the children below.
	const entries = useMemo(
		() =>
			rawEntries
				.filter(matchesFilters)
				.sort((a, b) => b.wordsAdded - a.wordsAdded),
		[rawEntries, matchesFilters],
	);

	// Quick-add row state.  The date is snapshotted when the row opens so
	// changing the header date afterwards doesn't silently redirect saves.
	const [quickAddOpen, setQuickAddOpen] = React.useState(false);
	const [quickAddDate, setQuickAddDate] = React.useState(today);

	const toggleQuickAdd = useCallback(() => {
		if (quickAddOpen) {
			setQuickAddOpen(false);
		} else {
			setQuickAddDate(date);
			setQuickAddOpen(true);
		}
	}, [quickAddOpen, date]);

	const setManualEntryIcon = useCallback((el: HTMLButtonElement | null) => {
		if (el && !el.dataset.iconSet) {
			setIcon(el, "list-plus");
			el.dataset.iconSet = "1";
		}
	}, []);

	const setDateButtonIcon = useCallback((el: HTMLButtonElement | null) => {
		if (el && !el.dataset.iconSet) {
			setIcon(el, "calendar");
			el.dataset.iconSet = "1";
		}
	}, []);

	const setResetButtonIcon = useCallback((el: HTMLButtonElement | null) => {
		if (el && !el.dataset.iconSet) {
			setIcon(el, "rotate-ccw");
			el.dataset.iconSet = "1";
		}
	}, []);

	// Native date-picker hidden input, same pattern as ManualEntry.tsx.
	const dateInputRef = useRef<HTMLInputElement | null>(null);

	const handleDatePicked = useCallback((value: string) => {
		const m = window.moment(value, "YYYY-MM-DD");
		if (m.isValid()) setSelectedDate(m.format("YYYY-MM-DD"));
	}, []);

	const handleOpenPicker = useCallback(() => {
		dateInputRef.current?.showPicker();
	}, []);

	const handleOpenFile = useCallback(async (filePath: string) => {
		const app = getPlugin().app;
		const file = app.vault.getFileByPath(filePath);

		if (!file) {
			new Notice("File not found!");
			return;
		}

		const leaves = app.workspace.getLeavesOfType("markdown");
		for (const leaf of leaves) {
			if (
				leaf.view instanceof FileView &&
				leaf.view.file?.path == file.path
			) {
				app.workspace.setActiveLeaf(leaf);
				return;
			}
		}

		const newLeaf = app.workspace.getLeaf("tab");
		await newLeaf.openFile(file);
	}, []);

	const handleDelete = useCallback(
		(filePath: string) => {
			void deleteActivityFromDate(filePath, date);
		},
		[date],
	);

	// Commit an in-place edit: 0 deletes, otherwise upserts the new value.
	const handleUpdate = useCallback(
		(filePath: string, value: number) => {
			const app = getPlugin().app;
			const file = app.vault.getFileByPath(filePath);
			if (!file) {
				new Notice("File not found!");
				return;
			}
			void addOrUpdateActivity(file, date, value);
		},
		[date],
	);

	return (
		<div className="todayEntries__section">
			<RadixTooltip.Provider delayDuration={200}>
				<div className="todayEntries__header">
					<div className="todayEntries__section-title">
						{date == today ? "ENTRIES TODAY" : `ENTRIES (${date})`}
					</div>
					<Tooltip content="Pick a date">
						<button
							className="todayEntries__date-button"
							ref={setDateButtonIcon}
							onMouseDown={handleOpenPicker}
						/>
					</Tooltip>
					<input
						ref={dateInputRef}
						type="date"
						className="ktr-hidden-date-input"
						max={today}
						value={date}
						onChange={(e) => handleDatePicked(e.target.value)}
					/>
					{date !== today && (
						<Tooltip content="Back to today">
							<button
								className="todayEntries__today-button"
								ref={setResetButtonIcon}
								onMouseDown={() => setSelectedDate(today)}
							/>
						</Tooltip>
					)}
					<Tooltip content="Add entry">
						<button
							className="todayEntries__manual-entry"
							ref={setManualEntryIcon}
							onMouseDown={toggleQuickAdd}
						/>
					</Tooltip>
				</div>
				{entries && entries.length > 0 ? (
					entries.map((entry) => (
						<EntryRow
							key={entry.filePath}
							entry={entry}
							onOpenFile={handleOpenFile}
							onDelete={handleDelete}
							onUpdate={handleUpdate}
						/>
					))
				) : (
					<div className="empty-data">
						<span>No files edited today</span>
						<button
							className="todayEntries__empty-add"
							onClick={toggleQuickAdd}
						>
							Add entry
						</button>
					</div>
				)}
				{quickAddOpen && (
					<QuickAddRow
						date={quickAddDate}
						onClose={() => setQuickAddOpen(false)}
					/>
				)}
			</RadixTooltip.Provider>
		</div>
	);
};
