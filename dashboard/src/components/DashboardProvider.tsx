"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

import type { KpiConfig, QualificationCheckId } from "@/config/kpi";
import { monthOf, monthRange } from "@/lib/kpi";
import type { Annotation, DashboardData, MarketingEvent, SpendEntry } from "@/lib/types";

export interface DashboardContextValue {
  data: DashboardData;
  config: KpiConfig;
  /** Loaded spend plus anything entered this session. */
  spend: SpendEntry[];
  addSpend: (entry: Omit<SpendEntry, "id">) => void;
  removeSpend: (id: string) => void;
  importSpend: (entries: Omit<SpendEntry, "id">[]) => void;
  /** Loaded events plus those added this session, with this session's edits applied. */
  events: MarketingEvent[];
  addEvent: (event: Omit<MarketingEvent, "id">) => void;
  /** Change an event's details or its hand-entered cost (null clears the cost). */
  updateEvent: (id: string, patch: Partial<Omit<MarketingEvent, "id">>) => void;
  /** Only events added this session can be removed. */
  removeEvent: (id: string) => void;
  /** Loaded notes plus those added this session. */
  annotations: Annotation[];
  addAnnotation: (note: Omit<Annotation, "id">) => void;
  removeAnnotation: (id: string) => void;
  /**
   * Targets anyone can change from the Setup page; the config file holds the
   * defaults. Each changed value is logged with who changed it.
   */
  setTargets: (targets: Partial<Pick<KpiConfig, TargetField>>, who: string) => void;
  /** Every target change this session, newest first, until the backend stores them. */
  targetLog: TargetChange[];
  /** Switch one of the draft qualification checks on or off; every page recalculates. */
  setCheck: (id: QualificationCheckId, on: boolean) => void;
  /** Monthly report delivery settings, read by the backend scheduler once it exists. */
  schedule: ReportSchedule;
  setSchedule: (schedule: ReportSchedule) => void;
  /** The twelve months a user can pick as the report month, oldest first. */
  months: string[];
  /** Last complete month at sync time: a monthly meeting reviews a finished month. */
  defaultMonth: string;
  /** "As of" instant for cohort maturity: the data's own sync time. */
  today: string;
}

export type TargetField = "targetQualifiedPerMonth" | "brandSearchTargetPerMonth" | "aiMentionShareTarget" | "qualifiedRamp";

export interface TargetChange {
  id: string;
  /** ISO date-time of the change. */
  at: string;
  who: string;
  field: TargetField;
  from: number;
  to: number;
}

/** The one number a target field holds; for the ramp, its start value. */
function targetValue(config: KpiConfig, field: TargetField): number {
  return field === "qualifiedRamp" ? config.qualifiedRamp.fromValue : config[field];
}

export interface ReportSchedule {
  enabled: boolean;
  /** Day of the month the summary goes out, 1-28. */
  dayOfMonth: number;
  recipients: string[];
}

const DEFAULT_SCHEDULE: ReportSchedule = { enabled: false, dayOfMonth: 1, recipients: [] };

const DashboardContext = createContext<DashboardContextValue | null>(null);

/**
 * Holds the loaded records for every page under the shell, so the layout
 * fetches once and the pages share one copy. Spend entered by hand lives here
 * too until the backend persists it, so the Spend page and the Overview agree.
 */
export function DashboardProvider({ data, config: baseConfig, children }: { data: DashboardData; config: KpiConfig; children: React.ReactNode }) {
  const counter = useRef(0);
  const [targets, setTargetState] = useState<Partial<Pick<KpiConfig, TargetField>>>({});
  const [checks, setChecks] = useState<Partial<Record<QualificationCheckId, boolean>>>({});
  const config = useMemo<KpiConfig>(
    () => ({ ...baseConfig, ...targets, qualificationChecks: { ...baseConfig.qualificationChecks, ...checks } }),
    [baseConfig, targets, checks],
  );
  const [targetLog, setTargetLog] = useState<TargetChange[]>([]);
  const setTargets = useCallback(
    (next: Partial<Pick<KpiConfig, TargetField>>, who: string) => {
      const before = { ...baseConfig, ...targets };
      const after = { ...before, ...next };
      const changes = (Object.keys(next) as TargetField[])
        .filter((field) => targetValue(before, field) !== targetValue(after, field))
        .map((field) => ({ id: `target-${(counter.current += 1)}`, at: new Date().toISOString(), who, field, from: targetValue(before, field), to: targetValue(after, field) }));
      if (changes.length === 0) return;
      setTargetState((t) => ({ ...t, ...next }));
      setTargetLog((log) => [...changes.reverse(), ...log]);
    },
    [baseConfig, targets],
  );
  const setCheck = useCallback((id: QualificationCheckId, on: boolean) => setChecks((c) => ({ ...c, [id]: on })), []);
  const [notes, setNotes] = useState<Annotation[]>([]);
  const [removedNotes, setRemovedNotes] = useState<Set<string>>(() => new Set());
  const [schedule, setSchedule] = useState<ReportSchedule>(DEFAULT_SCHEDULE);
  const addAnnotation = useCallback((note: Omit<Annotation, "id">) => {
    const id = `note-local-${(counter.current += 1)}`;
    setNotes((n) => [...n, { ...note, id }]);
  }, []);
  const removeAnnotation = useCallback((id: string) => setRemovedNotes((r) => new Set(r).add(id)), []);
  const [addedEvents, setAddedEvents] = useState<MarketingEvent[]>([]);
  const addEvent = useCallback((event: Omit<MarketingEvent, "id">) => {
    const id = `event-local-${(counter.current += 1)}`;
    setAddedEvents((e) => [...e, { ...event, id }]);
  }, []);
  const removeEvent = useCallback((id: string) => setAddedEvents((e) => e.filter((x) => x.id !== id)), []);
  const [eventEdits, setEventEdits] = useState<Record<string, Partial<Omit<MarketingEvent, "id">>>>({});
  const updateEvent = useCallback((id: string, patch: Partial<Omit<MarketingEvent, "id">>) => setEventEdits((c) => ({ ...c, [id]: { ...c[id], ...patch } })), []);
  const [added, setAdded] = useState<SpendEntry[]>([]);
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const addSpend = useCallback((entry: Omit<SpendEntry, "id">) => {
    const id = `local-${(counter.current += 1)}`;
    setAdded((s) => [...s, { ...entry, id }]);
  }, []);
  const importSpend = useCallback((entries: Omit<SpendEntry, "id">[]) => {
    const withIds = entries.map((e) => ({ ...e, id: `local-${(counter.current += 1)}` }));
    setAdded((s) => [...s, ...withIds]);
  }, []);
  const removeSpend = useCallback((id: string) => {
    setRemoved((r) => new Set(r).add(id));
  }, []);

  const value = useMemo<DashboardContextValue>(() => {
    const defaultMonth = monthRange(monthOf(data.syncedAt), 2)[0];
    return {
      data,
      config,
      spend: [...data.spend, ...added].filter((e) => !removed.has(e.id)),
      addSpend,
      removeSpend,
      importSpend,
      events: [...data.events, ...addedEvents].map((e) => (e.id in eventEdits ? { ...e, ...eventEdits[e.id] } : e)),
      addEvent,
      updateEvent,
      removeEvent,
      annotations: [...data.annotations, ...notes].filter((n) => !removedNotes.has(n.id)).sort((a, b) => a.month.localeCompare(b.month)),
      addAnnotation,
      removeAnnotation,
      setTargets,
      targetLog,
      setCheck,
      schedule,
      setSchedule,
      months: monthRange(defaultMonth, 12),
      defaultMonth,
      today: data.syncedAt,
    };
  }, [data, config, added, removed, addSpend, removeSpend, importSpend, addedEvents, addEvent, removeEvent, eventEdits, updateEvent, notes, removedNotes, addAnnotation, removeAnnotation, setTargets, targetLog, setCheck, schedule]);

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard(): DashboardContextValue {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard must be used inside DashboardProvider");
  return ctx;
}
