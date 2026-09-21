// Haba page. Two tabs: Today (buttons) and Report.
// Every press is one small document in a Firestore database (Google).
// Firestore keeps a copy on the phone, so presses made offline are sent later.
// The config block below is public by design; the Firestore rules protect the data.

import { initializeApp } from 'firebase/app';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, addDoc, deleteDoc, onSnapshot, query, orderBy,
  type Firestore, type QuerySnapshot, type DocumentData,
} from 'firebase/firestore';
import * as R from './report.ts';

const firebaseConfig = {
  apiKey: 'AIzaSyDtkJvnZLPIkIAJzj9w3F486bX2E8T5kuU',
  authDomain: 'habits-433f8.firebaseapp.com',
  projectId: 'habits-433f8',
  storageBucket: 'habits-433f8.firebasestorage.app',
  messagingSenderId: '632547558396',
  appId: '1:632547558396:web:5bdf411d492236c5686879',
};
const COLLECTION = 'records';

interface LiveRec extends R.Rec { id: string; pending: boolean }

const app = initializeApp(firebaseConfig);
let db: Firestore;
try {
  db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
} catch {
  db = initializeFirestore(app, {}); // very old browser without local storage: still works, only online
}
const records = collection(db, COLLECTION);

const state = {
  records: [] as LiveRec[],
  loaded: false,
};

// ---------- actions ----------
function press(item: R.ItemId): void {
  addDoc(records, { t: R.isoLocal(new Date()), item }).catch((e: Error) => setStatus('Could not save: ' + e.message, true));
}
function remove(id: string): void {
  deleteDoc(doc(db, COLLECTION, id)).catch((e: Error) => setStatus('Could not remove: ' + e.message, true));
}

// ---------- rendering ----------
function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error('missing element #' + id);
  return el;
}
function setStatus(msg: string, err = false): void {
  const el = $('status');
  el.textContent = msg;
  el.className = 'status' + (err ? ' err' : '');
}
function esc(s: unknown): string {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] ?? c));
}
function dateOf(key: R.DayKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1, 12);
}
function niceDay(key: R.DayKey, withYear = false): string {
  return dateOf(key).toLocaleDateString('en-GB', withYear
    ? { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }
    : { day: 'numeric', month: 'short' });
}
function shortDay(key: R.DayKey): string { return dateOf(key).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); }
function labelOf(item: string): string { return R.ITEMS.find(x => x.id === item)?.label ?? item; }

function render(): void {
  const recs = state.records;
  const todayKey = R.today();
  $('date-line').textContent = niceDay(todayKey, true);

  // buttons
  const byDay = R.countsByDay(recs);
  let html = '';
  let lastGroup: R.Group | null = null;
  for (const it of R.ITEMS) {
    if (lastGroup && it.group !== lastGroup) html += '<div class="divider"></div>';
    lastGroup = it.group;
    const n = byDay[it.id][todayKey] ?? 0;
    html += `<button class="hb ${it.group}" data-item="${it.id}" aria-label="${esc(it.label)}, ${n} today">` +
      `<span>${esc(it.label)}</span><span class="n${n ? ' has' : ''}">${n}</span></button>`;
  }
  $('buttons').innerHTML = html;

  // today's list
  const list = R.recordsOfDay(recs, todayKey);
  $('records').innerHTML = list.length ? list.map(r => {
    const p = r.pending ? '<span class="p">not saved yet</span>' : '';
    return `<li><span class="t">${r.t.slice(11, 16)}</span><span class="l">${esc(labelOf(r.item))}</span>${p}` +
      `<button class="x" data-id="${esc(r.id)}" aria-label="Remove ${esc(labelOf(r.item))} at ${r.t.slice(11, 16)}">×</button></li>`;
  }).join('') : `<li class="empty">${state.loaded ? 'Nothing yet today.' : 'Loading…'}</li>`;

  const plain: R.Rec[] = recs.map(r => ({ t: r.t, item: r.item }));
  ($('download') as HTMLAnchorElement).href = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(plain, null, 2));

  renderReport(recs);
}

function renderReport(recs: readonly R.Rec[]): void {
  const w = R.weekCompare(recs);
  $('week-range').textContent = `${niceDay(w.current.from)} to ${niceDay(w.current.to)}, against ${niceDay(w.previous.from)} to ${niceDay(w.previous.to)}.`;
  $('week-table').innerHTML = compareTable(w, 'This week', 'Last week');

  const m = R.monthCompare(recs);
  $('month-range').textContent = `${niceDay(m.current.from)} to ${niceDay(m.current.to)}, against ${niceDay(m.previous.from)} to ${niceDay(m.previous.to)}.`;
  $('month-table').innerHTML = compareTable(m, 'This month', 'Last month');

  const st = R.streaks(recs);
  $('streak-table').innerHTML = '<tr><th>Habit</th><th class="num">Days in a row</th><th class="num">Today</th></tr>' +
    st.map(s => `<tr><td><span class="dot good"></span>${esc(s.label)}</td><td class="num">${s.days}</td><td class="num">${s.todayDone ? 'done' : 'not yet'}</td></tr>`).join('');

  const series = R.dailySeries(recs, 28);
  $('charts').innerHTML = series.rows.map(row => chart(row, series.days)).join('');

  const n = recs.length;
  $('report-note').textContent = n ? `${n} record${n === 1 ? '' : 's'} in total.` : (state.loaded ? 'No records yet. Press a button on the Today tab.' : 'Loading…');
}

function compareTable(c: R.Compare, la: string, lb: string): string {
  let html = `<tr><th>Item</th><th class="num">${la}</th><th class="num">${lb}</th></tr>`;
  for (const r of c.rows) {
    html += `<tr class="group-${r.group}"><td><span class="dot ${r.group}"></span>${esc(r.label)}</td>` +
      `<td class="num">${r.current}</td><td class="num">${r.previous}</td></tr>`;
  }
  return html;
}

// One small bar chart: 28 days, one bar per day, rounded top, 2px gap, baseline.
function chart(row: R.SeriesRow, days: readonly R.DayKey[]): string {
  const W = 280, H = 56, top = 12, base = H - 2;
  const slot = W / days.length, bw = slot - 2;
  const max = Math.max(1, ...row.values);
  const total = row.values.reduce((s, v) => s + v, 0);
  const maxIdx = row.values.indexOf(max);
  let bars = '';
  row.values.forEach((v, i) => {
    const x = i * slot + 1;
    const h = v ? Math.max(3, (base - top) * v / max) : 0;
    const y = base - h;
    const label = `${shortDay(days[i] ?? '')}: ${v}`;
    if (v) bars += `<rect class="bar ${row.group}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="2"></rect>`;
    bars += `<rect class="hit" x="${(i * slot).toFixed(1)}" y="0" width="${slot.toFixed(1)}" height="${H}" data-tip="${esc(label)}"></rect>`;
    // Direct labels only on the biggest bar and on today, never on every bar.
    if (v && (i === maxIdx || i === days.length - 1)) bars += `<text class="val" x="${(x + bw / 2).toFixed(1)}" y="${(y - 3).toFixed(1)}">${v}</text>`;
  });
  return `<div class="chart"><div class="head"><b>${esc(row.label)}</b><span>${total} in 28 days</span></div>` +
    `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(row.label)}, last 28 days, ${total} in total">` +
    `<line class="base" x1="0" y1="${base}" x2="${W}" y2="${base}"></line>${bars}</svg>` +
    `<div class="foot"><span>${shortDay(days[0] ?? '')}</span><span>Today</span></div></div>`;
}

// ---------- tabs ----------
function showTab(): void {
  const name = location.hash === '#report' ? 'report' : 'today';
  for (const t of ['today', 'report']) {
    $(t).classList.toggle('active', t === name);
    $('tab-' + t).classList.toggle('active', t === name);
    $('tab-' + t).setAttribute('aria-selected', t === name ? 'true' : 'false');
  }
}

// ---------- live data ----------
function onData(snap: QuerySnapshot<DocumentData>): void {
  state.records = snap.docs.map(d => {
    const v = d.data();
    return { id: d.id, t: String(v['t'] ?? ''), item: String(v['item'] ?? ''), pending: d.metadata.hasPendingWrites };
  });
  state.loaded = true;
  const waiting = state.records.filter(r => r.pending).length;
  if (waiting && !navigator.onLine) setStatus(`Offline. ${waiting} press${waiting === 1 ? '' : 'es'} kept on this phone, sent later.`, true);
  else if (waiting) setStatus('Saving…');
  else if (snap.metadata.fromCache && !navigator.onLine) setStatus('Offline. Showing the copy on this phone.', true);
  else setStatus('');
  render();
}

function listen(): void {
  const q = query(records, orderBy('t'));
  onSnapshot(q, { includeMetadataChanges: true }, onData, err => setStatus('Cannot read the database: ' + err.message, true));
}

// ---------- wiring ----------
function isItemId(s: string): s is R.ItemId { return (R.ITEM_IDS as readonly string[]).includes(s); }

function init(): void {
  render();
  showTab();
  window.addEventListener('hashchange', showTab);

  $('buttons').addEventListener('click', e => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button[data-item]');
    const item = b?.dataset['item'];
    if (item && isItemId(item)) press(item);
  });
  $('records').addEventListener('click', e => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button.x');
    const id = b?.dataset['id'];
    if (id) remove(id);
  });

  // tooltips on the chart bars
  const tip = $('tooltip');
  const move = (e: PointerEvent): void => {
    const t = (e.target as Element).closest<HTMLElement>('[data-tip]');
    if (!t) { tip.hidden = true; return; }
    tip.textContent = t.dataset['tip'] ?? '';
    tip.hidden = false;
    const x = Math.min(e.clientX + 12, window.innerWidth - tip.offsetWidth - 8);
    tip.style.left = x + 'px';
    tip.style.top = (e.clientY - 34) + 'px';
  };
  $('charts').addEventListener('pointermove', move);
  $('charts').addEventListener('pointerdown', move);
  $('charts').addEventListener('pointerleave', () => { tip.hidden = true; });
  document.addEventListener('pointerdown', e => { if (!(e.target as Element).closest('#charts')) tip.hidden = true; });

  window.addEventListener('online', () => setStatus(''));
  window.addEventListener('offline', () => setStatus('Offline. Presses are kept on this phone and sent later.', true));

  listen();
}

init();
