// Haba mark: lets another app of Alpha's add or remove a Haba mark (Iker, 2026-10-21).
// Medi marks "meditate", Cismo "problem", Trani "jog" and "core", DeViDa and Rebo "read".
//
// The master copy is haba/shared/haba-mark.ts. Medi, Trani and Cismo keep the same file in src/.
// DeViDa and Rebo are not TypeScript projects, so they keep a JavaScript copy, haba-mark.js inside their
// haba-read.js (see haba/shared/README.md). Change the master, then copy it to all five.
//
// It talks to Haba's Firestore database (Google) through its plain web address, with no Firebase library,
// so it adds almost nothing to a page. A Haba record is {t: "2026-10-21T22:10:00+07:00", item: "read"}.
// The Firestore rules allow exactly that, so no rules change is needed.
// Like in Haba, an item is marked at most once per day, and a day starts at 04:00, not midnight.

export type HabaItem = 'core' | 'jog' | 'read' | 'meditate' | 'problem';

const BASE = 'https://firestore.googleapis.com/v1/projects/habits-433f8/databases/(default)/documents';
const KEY = 'AIzaSyDtkJvnZLPIkIAJzj9w3F486bX2E8T5kuU'; // public by design, the same as in Haba's page
const DAY_START_HOUR = 4;

const pad = (n: number): string => String(n).padStart(2, '0');
const ymd = (d: Date): string => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

/** Haba's day for a moment: "2026-10-21". Times before 04:00 count for the day before. */
export function habaDay(t: Date | string): string {
  const d = new Date(t instanceof Date ? t.getTime() : t);
  d.setHours(d.getHours() - DAY_START_HOUR);
  return ymd(d);
}

/** "2026-10-21T22:10:05+07:00", the time format Haba stores (25 characters). */
export function isoLocal(d: Date): string {
  const off = -d.getTimezoneOffset();
  const a = Math.abs(off);
  return ymd(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
    + (off >= 0 ? '+' : '-') + pad(Math.floor(a / 60)) + ':' + pad(a % 60);
}

/** The full names of the records of this item on this Haba day. */
async function recordsOf(item: HabaItem, day: string): Promise<string[]> {
  const res = await fetch(`${BASE}:runQuery?key=${KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: 'records' }],
      where: { fieldFilter: { field: { fieldPath: 'item' }, op: 'EQUAL', value: { stringValue: item } } },
    } }),
  });
  if (!res.ok) throw new Error(`Haba answered ${res.status}`);
  const rows = (await res.json()) as { document?: { name: string; fields?: { t?: { stringValue?: string } } } }[];
  return rows
    .filter(r => r.document && habaDay(r.document.fields?.t?.stringValue ?? '') === day)
    .map(r => r.document!.name);
}

/**
 * Mark the item in Haba, once per day. Without `day` it marks today, at this moment.
 * With `day` ("2026-10-20", for a day in the past) it marks that day at 12:00.
 * Answers 'added', or 'already' when the item was already marked that day.
 */
export async function markHaba(item: HabaItem, day?: string): Promise<'added' | 'already'> {
  const when = day ? new Date(`${day}T12:00:00`) : new Date();
  const key = habaDay(when);
  if ((await recordsOf(item, key)).length) return 'already';
  const res = await fetch(`${BASE}/records?key=${KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { t: { stringValue: isoLocal(when) }, item: { stringValue: item } } }),
  });
  if (!res.ok) throw new Error(`Haba answered ${res.status}`);
  return 'added';
}

/** Remove the item's marks on that Haba day. Answers how many were removed. */
export async function unmarkHaba(item: HabaItem, day: string): Promise<number> {
  const names = await recordsOf(item, day);
  for (const name of names) {
    const res = await fetch(`https://firestore.googleapis.com/v1/${name}?key=${KEY}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Haba answered ${res.status}`);
  }
  return names.length;
}
