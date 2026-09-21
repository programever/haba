// Pure counting code for the habit log. No browser things in here, so it can
// also run under node for the tests (see test/report.test.ts).
//
// A record is {t: "2026-09-21T22:10:00+07:00", item: "spend"}.
// A "day" starts at 04:00, not at midnight: a press at 01:00 belongs to the
// evening before. dayKey() does that shift.

export type ItemId = 'core' | 'jog' | 'read' | 'meditate' | 'kid' | 'wife' | 'spend' | 'drink' | 'work' | 'problem';
/** good: habits with streaks. count: only counted. day: what kind of day it was. */
export type Group = 'good' | 'count' | 'day';

export interface Item { id: ItemId; label: string; group: Group }

export interface Rec { t: string; item: string }

/** A day key looks like "2026-09-21". */
export type DayKey = string;

export const ITEMS: readonly Item[] = [
  { id: 'core',     label: 'Core training', group: 'good' },
  { id: 'jog',      label: 'Jogging',       group: 'good' },
  { id: 'read',     label: 'Read book',     group: 'good' },
  { id: 'meditate', label: 'Meditate',      group: 'good' },
  { id: 'kid',      label: 'Kid time',      group: 'good' },
  { id: 'wife',     label: 'Wife time',     group: 'good' },
  { id: 'spend',    label: 'Spend',         group: 'count' },
  { id: 'drink',    label: 'Drink',         group: 'count' },
  { id: 'work',     label: 'Work',          group: 'day' },
  { id: 'problem',  label: 'Problem',       group: 'day' },
];

export const ITEM_IDS: readonly ItemId[] = ITEMS.map(i => i.id);

export const DAY_START_HOUR = 4;

function pad(n: number): string { return String(n).padStart(2, '0'); }

/** Local date of a Date object as "YYYY-MM-DD". */
function ymd(d: Date): DayKey {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function parseKey(key: DayKey): [number, number, number] {
  const p = key.split('-').map(Number);
  return [p[0] ?? 0, p[1] ?? 1, p[2] ?? 1];
}

/** Day key for a record time (ISO string with offset) or a Date. Times before 04:00 count for the previous day. */
export function dayKey(t: string | Date): DayKey {
  const d = t instanceof Date ? new Date(t.getTime()) : new Date(t);
  d.setHours(d.getHours() - DAY_START_HOUR);
  return ymd(d);
}

/** "Today" as a day key, using the same 04:00 rule. */
export function today(now?: Date): DayKey { return dayKey(now ?? new Date()); }

/** Day key shifted by n days (n may be negative). */
export function addDays(key: DayKey, n: number): DayKey {
  const [y, m, d] = parseKey(key);
  return ymd(new Date(y, m - 1, d + n, 12, 0, 0));
}

/** Monday of the week that holds the day key. */
export function weekStart(key: DayKey): DayKey {
  const [y, m, d] = parseKey(key);
  const dt = new Date(y, m - 1, d, 12, 0, 0);
  const dow = (dt.getDay() + 6) % 7; // Monday = 0
  return addDays(key, -dow);
}

/** List of day keys from a to b, both included. */
export function dayRange(a: DayKey, b: DayKey): DayKey[] {
  const out: DayKey[] = [];
  for (let k = a; k <= b; k = addDays(k, 1)) out.push(k);
  return out;
}

export type PerDay = Record<DayKey, number>;
export type CountsByDay = Record<ItemId, PerDay>;

export function countsByDay(records: readonly Rec[]): CountsByDay {
  const out = {} as CountsByDay;
  for (const it of ITEMS) out[it.id] = {};
  for (const r of records) {
    const per = (out as Record<string, PerDay | undefined>)[r.item];
    if (!per) continue; // unknown item: ignored
    const k = dayKey(r.t);
    per[k] = (per[k] ?? 0) + 1;
  }
  return out;
}

function sumDays(perDay: PerDay, keys: readonly DayKey[]): number {
  let s = 0;
  for (const k of keys) s += perDay[k] ?? 0;
  return s;
}

export interface Range { from: DayKey; to: DayKey }
export interface CompareRow { id: ItemId; label: string; group: Group; current: number; previous: number }
export interface Compare { current: Range; previous: Range; rows: CompareRow[] }

function compare(records: readonly Rec[], current: Range, previous: Range): Compare {
  const byDay = countsByDay(records);
  return {
    current, previous,
    rows: ITEMS.map(it => ({
      id: it.id, label: it.label, group: it.group,
      current: sumDays(byDay[it.id], dayRange(current.from, current.to)),
      previous: sumDays(byDay[it.id], dayRange(previous.from, previous.to)),
    })),
  };
}

/** This week (Monday to today) against last week (Monday to Sunday). */
export function weekCompare(records: readonly Rec[], now?: Date): Compare {
  const t = today(now);
  const thisStart = weekStart(t);
  const lastStart = addDays(thisStart, -7);
  return compare(records, { from: thisStart, to: t }, { from: lastStart, to: addDays(thisStart, -1) });
}

/** This month (1st to today) against last month (whole month). */
export function monthCompare(records: readonly Rec[], now?: Date): Compare {
  const t = today(now);
  const thisStart = t.slice(0, 8) + '01';
  const lastEnd = addDays(thisStart, -1);
  const lastStart = lastEnd.slice(0, 8) + '01';
  return compare(records, { from: thisStart, to: t }, { from: lastStart, to: lastEnd });
}

export interface SeriesRow { id: ItemId; label: string; group: Group; values: number[] }
export interface Series { days: DayKey[]; rows: SeriesRow[] }

/** Last n days, one number per day, per item. Oldest first. */
export function dailySeries(records: readonly Rec[], n: number, now?: Date): Series {
  const t = today(now);
  const keys = dayRange(addDays(t, -(n - 1)), t);
  const byDay = countsByDay(records);
  return {
    days: keys,
    rows: ITEMS.map(it => ({
      id: it.id, label: it.label, group: it.group,
      values: keys.map(k => byDay[it.id][k] ?? 0),
    })),
  };
}

export interface Streak { id: ItemId; label: string; days: number; todayDone: boolean }

/** Days in a row, counted back from today. If today has nothing yet, the streak counts back from yesterday. */
export function streaks(records: readonly Rec[], now?: Date): Streak[] {
  const t = today(now);
  const byDay = countsByDay(records);
  return ITEMS.filter(it => it.group === 'good').map(it => {
    const per = byDay[it.id];
    const todayDone = (per[t] ?? 0) > 0;
    let k = todayDone ? t : addDays(t, -1);
    let n = 0;
    while ((per[k] ?? 0) > 0) { n++; k = addDays(k, -1); }
    return { id: it.id, label: it.label, days: n, todayDone };
  });
}

/** Records of one day, newest first. Keeps whatever extra fields the records have (for example an id). */
export function recordsOfDay<T extends Rec>(records: readonly T[], key: DayKey): T[] {
  return records.filter(r => dayKey(r.t) === key).sort((a, b) => (a.t < b.t ? 1 : -1));
}

/** Local time as ISO string with the phone's own offset, e.g. 2026-09-21T22:10:05+07:00 (always 25 characters). */
export function isoLocal(d: Date): string {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const a = Math.abs(off);
  return ymd(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
    + sign + pad(Math.floor(a / 60)) + ':' + pad(a % 60);
}
