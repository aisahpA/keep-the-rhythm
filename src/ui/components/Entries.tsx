import {
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
import { ManualEntryModal } from "../components/ManualEntry";
import { EntryFilter } from "@/core/codeBlocks";
import { ActivityRecord } from "@/defs/types";

interface EntriesProps {
	date?: string;
	filters?: EntryFilter[];
}

interface EntryRowProps {
	entry: ActivityRecord;
	onOpenFile: (filePath: string) => void;
	onDelete: (filePath: string) => void;
}

/**
 * Memoized row: only re-renders when the entry itself changes (filePath or
 * wordsAdded) or when handlers change.  With React.memo the other rows skip
 * reconciliation entirely on each keystroke, instead of N rows each getting
 * a fresh prop bundle.
 */
const EntryRow = React.memo(function EntryRow({
	entry,
	onOpenFile,
	onDelete,
}: EntryRowProps) {
	const deleteButtonRef = useRef<HTMLButtonElement | null>(null);

	useEffect(() => {
		const el = deleteButtonRef.current;
		if (el) setIcon(el, "trash-2");
	}, []);

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
				<span className="todayEntries__word-count">
					{prefix}
					{delta.toLocaleString()}
				</span>
				<span className="todayEntries_list-item-unit">{" words"}</span>
				<Tooltip content="Delete entry">
					<button
						ref={deleteButtonRef}
						className="todayEntries__delete-button"
						onMouseDown={() => onDelete(entry.filePath)}
					/>
				</Tooltip>
			</div>
		</div>
	);
});

export const Entries = ({ date: dateProp, filters }: EntriesProps) => {
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

	const addManualEntry = useCallback(() => {
		new ManualEntryModal(getPlugin().app).open();
	}, []);

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
					<Tooltip content="Add or Update Entry">
						<button
							className="todayEntries__manual-entry"
							ref={setManualEntryIcon}
							onMouseDown={addManualEntry}
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
						/>
					))
				) : (
					<p className="empty-data">No files edited today</p>
				)}
			</RadixTooltip.Provider>
		</div>
	);
};
