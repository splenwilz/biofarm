"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

import type { Role } from "@/auth/roles";
import type { KpiConfig } from "@/config/kpi";
import { monthOf, monthRange } from "@/lib/kpi";
import { mergeSpend } from "@/lib/spendMerge";
import type { Annotation, DashboardData, EventInput, MarketingEvent, SpendEntry } from "@/lib/types";

/** The event as the lead API takes it: a plain date, snake-free camelCase keys, the match block always present. */
function toApi(event: EventInput) {
  return {
    name: event.name,
    date: event.date.slice(0, 10),
    type: event.type,
    attendees: event.attendees,
    costGbp: event.costGbp ?? null,
    notes: event.notes ?? null,
    match: event.match ?? { labels: [], dealSources: [], titleWords: [], channel: false, windowFrom: event.date.slice(0, 10), windowTo: event.date.slice(0, 10) },
  };
}

async function writeEvent(method: "POST" | "PUT" | "DELETE", url: string, body?: unknown): Promise<{ id: string }> {
  const res = await fetch(url, { method, headers: body === undefined ? {} : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const json = (await res.json()) as { detail?: unknown };
      if (typeof json.detail === "string") detail = json.detail;
      else if (Array.isArray(json.detail)) detail = json.detail.map((d: { msg?: string }) => d.msg ?? "").join("; ");
    } catch {
      /* no JSON body */
    }
    throw new Error(`The event was not saved: ${detail}`);
  }
  const text = await res.text();
  return text ? (JSON.parse(text) as { id: string }) : { id: "" };
}

export interface DashboardContextValue {
  data: DashboardData;
  config: KpiConfig;
  /** What the signed-in password unlocks. The pages show write controls only to an admin; the server refuses writes from anyone else regardless. */
  role: Role;
  canEdit: boolean;
  /** Loaded spend plus anything entered this session. */
  spend: SpendEntry[];
  addSpend: (entry: Omit<SpendEntry, "id">) => void;
  removeSpend: (id: string) => void;
  importSpend: (entries: Omit<SpendEntry, "id">[]) => void;
  /**
   * Events. On the feed every change is written to the lead API through
   * /api/events and the page data is refreshed; the change also shows at once.
   * On demo data changes live for the session only. A rejected write throws
   * with the API's message, so the dialog can show it.
   */
  events: MarketingEvent[];
  addEvent: (event: EventInput) => Promise<void>;
  updateEvent: (id: string, values: EventInput) => Promise<void>;
  removeEvent: (id: string) => Promise<void>;
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
export function DashboardProvider({ data, config: baseConfig, role, children }: { data: DashboardData; config: KpiConfig; role: Role; children: React.ReactNode }) {
  const counter = useRef(0);
  const [targets, setTargetState] = useState<Partial<Pick<KpiConfig, TargetField>>>({});
  const config = useMemo<KpiConfig>(() => ({ ...baseConfig, ...targets }), [baseConfig, targets]);
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
  const [notes, setNotes] = useState<Annotation[]>([]);
  const [removedNotes, setRemovedNotes] = useState<Set<string>>(() => new Set());
  const [schedule, setSchedule] = useState<ReportSchedule>(DEFAULT_SCHEDULE);
  const addAnnotation = useCallback((note: Omit<Annotation, "id">) => {
    const id = `note-local-${(counter.current += 1)}`;
    setNotes((n) => [...n, { ...note, id }]);
  }, []);
  const removeAnnotation = useCallback((id: string) => setRemovedNotes((r) => new Set(r).add(id)), []);
  const router = useRouter();
  const live = data.source !== "demo";
  const [addedEvents, setAddedEvents] = useState<MarketingEvent[]>([]);
  const [eventEdits, setEventEdits] = useState<Record<string, EventInput>>({});
  const [removedEvents, setRemovedEvents] = useState<Set<string>>(() => new Set());
  const addEvent = useCallback(
    async (event: EventInput) => {
      let id = `event-local-${(counter.current += 1)}`;
      if (live) {
        const stored = await writeEvent("POST", "/api/events", toApi(event));
        id = stored.id;
      }
      setAddedEvents((e) => [...e, { ...event, id, leads: 0, qualified: 0 }]);
      if (live) router.refresh();
    },
    [live, router],
  );
  const updateEvent = useCallback(
    async (id: string, values: EventInput) => {
      if (live) await writeEvent("PUT", `/api/events/${encodeURIComponent(id)}`, toApi(values));
      setEventEdits((c) => ({ ...c, [id]: values }));
      if (live) router.refresh();
    },
    [live, router],
  );
  const removeEvent = useCallback(
    async (id: string) => {
      if (live) await writeEvent("DELETE", `/api/events/${encodeURIComponent(id)}`);
      setRemovedEvents((r) => new Set(r).add(id));
      if (live) router.refresh();
    },
    [live, router],
  );
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
    // The month the data was synced in is the default, even part-way through
    // (the user asked to see the month in progress); the pages label it "to
    // date" and the alerts hold their performance verdicts until it closes.
    const defaultMonth = monthOf(data.syncedAt);
    return {
      data,
      config,
      role,
      canEdit: role === "admin",
      spend: mergeSpend(data.spend, added, removed),
      addSpend,
      removeSpend,
      importSpend,
      events: [...data.events, ...addedEvents.filter((a) => !data.events.some((d) => d.id === a.id))]
        .filter((e) => !removedEvents.has(e.id))
        .map((e) => (e.id in eventEdits ? { ...e, ...eventEdits[e.id] } : e)),
      addEvent,
      updateEvent,
      removeEvent,
      annotations: [...data.annotations, ...notes].filter((n) => !removedNotes.has(n.id)).sort((a, b) => a.month.localeCompare(b.month)),
      addAnnotation,
      removeAnnotation,
      setTargets,
      targetLog,
      schedule,
      setSchedule,
      months: monthRange(defaultMonth, 13), // the current month plus the twelve complete ones before it
      defaultMonth,
      today: data.syncedAt,
    };
  }, [data, config, role, added, removed, addSpend, removeSpend, importSpend, addedEvents, removedEvents, addEvent, removeEvent, eventEdits, updateEvent, notes, removedNotes, addAnnotation, removeAnnotation, setTargets, targetLog, schedule]);

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard(): DashboardContextValue {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard must be used inside DashboardProvider");
  return ctx;
}
