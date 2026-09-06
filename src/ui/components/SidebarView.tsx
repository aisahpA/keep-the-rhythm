import React, { useCallback, useEffect, useRef, useState } from "react";
import { Heatmap } from "./Heatmap";
import { SlotWrapper } from "./SlotWrapper";
import { useStore } from "@/core/store";
import { Entries } from "./Entries";

export const KTRView = () => {
  // Each selector subscribes to exactly the slice of settings it cares
  // about.  Zustand's default Object.is equality means the component only
  // re-renders when the selected value actually changes.
  const heatmapConfig = useStore((s) => s.settings.heatmapConfig);
  const preferredUnit = useStore((s) => s.settings.preferredUnit);
  const showHeatmap = useStore(
    (s) => s.settings.sidebarConfig.visibility.showHeatmap,
  );
  const showEntries = useStore(
    (s) => s.settings.sidebarConfig.visibility.showEntries,
  );
  const showSlots = useStore(
    (s) => s.settings.sidebarConfig.visibility.showSlots,
  );
  const today = useStore((s) => s.today);

  // Shared "selected date" linking the heatmap to the Entries list below:
  // clicking a cell shows that day's files, and picking a date in Entries
  // moves the heatmap highlight back.
  const [sidebarDate, setSidebarDate] = useState<string>(today);

  // Midnight rollover: follow the calendar only while the sidebar still
  // points at the previous "today".  A deliberately picked past date is
  // preserved.
  const prevTodayRef = useRef(today);
  useEffect(() => {
    const prev = prevTodayRef.current;
    prevTodayRef.current = today;
    if (prev !== today && sidebarDate === prev) {
      setSidebarDate(today);
    }
  }, [today, sidebarDate]);

  const handleCellClick = useCallback((date: string) => {
    setSidebarDate(date);
  }, []);

  return (
    <div className="sideBarView">
      {showSlots && <SlotWrapper />}
      {showHeatmap && (
        <Heatmap
          heatmapConfig={heatmapConfig}
          preferredUnit={preferredUnit}
          onCellClick={handleCellClick}
          selectedDate={sidebarDate}
        />
      )}
      {showEntries && (
        <Entries
          date={sidebarDate}
          preferredUnit={preferredUnit}
          onDateChange={setSidebarDate}
        />
      )}
    </div>
  );
};
