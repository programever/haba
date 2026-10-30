// Tests for src/report.ts. Run: node --test test/report.test.ts
process.env.TZ = 'Asia/Ho_Chi_Minh'; // the test data is in Vietnam time
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../src/report.ts';

test('the 04:00 rule', () => {
  assert.equal(R.dayKey('2026-09-22T01:00:00+07:00'), '2026-09-21', '01:00 belongs to the day before');
  assert.equal(R.dayKey('2026-09-22T04:00:00+07:00'), '2026-09-22', '04:00 is the new day');
  assert.equal(R.dayKey('2026-09-21T22:10:00+07:00'), '2026-09-21', '22:10 is the same day');
});

test('thirteen items, four groups', () => {
  assert.equal(R.ITEMS.length, 13);
  assert.deepEqual(R.ITEMS.filter(i => i.group === 'day').map(i => i.id), ['work', 'problem']);
  assert.deepEqual(R.ITEMS.filter(i => i.group === 'mood').map(i => i.id), ['happy', 'normal', 'sad']);
  assert.deepEqual(R.ITEMS.filter(i => i.group === 'mood').map(i => i.short), ['😃', '🙂', '😞'], 'mood buttons show only the face');
  assert.equal(R.streaks([]).length, 6, 'only the good habits have streaks');
});

test('day maths', () => {
  assert.equal(R.addDays('2026-09-30', 1), '2026-10-01');
  assert.equal(R.addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(R.weekStart('2026-09-21'), '2026-09-21', '21 Sep 2026 is a Monday');
  assert.equal(R.weekStart('2026-09-27'), '2026-09-21', 'a Sunday belongs to the Monday before');
  assert.deepEqual(R.dayRange('2026-09-29', '2026-10-02'), ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
});

// A small log. "now" is Wednesday 23 Sep 2026, 20:00 local.
const now = new Date(2026, 8, 23, 20, 0, 0);
const recs: R.Rec[] = [
  { t: '2026-09-15T07:00:00+07:00', item: 'jog' },      // last week (Tue)
  { t: '2026-09-20T07:00:00+07:00', item: 'jog' },      // last week (Sun)
  { t: '2026-09-21T07:00:00+07:00', item: 'jog' },      // this week Mon
  { t: '2026-09-22T07:00:00+07:00', item: 'jog' },      // Tue
  { t: '2026-09-23T07:00:00+07:00', item: 'jog' },      // Wed (today)
  { t: '2026-09-23T09:00:00+07:00', item: 'spend' },
  { t: '2026-09-23T10:00:00+07:00', item: 'spend' },
  { t: '2026-09-24T01:30:00+07:00', item: 'spend' },    // still 23 Sep by the 04:00 rule
  { t: '2026-09-22T21:00:00+07:00', item: 'read' },
  { t: '2026-08-30T21:00:00+07:00', item: 'read' },     // last month
  { t: '2026-09-23T21:00:00+07:00', item: 'nonsense' }, // unknown item, ignored
];
const row = (c: R.Compare, id: R.ItemId) => c.rows.find(r => r.id === id)!;

test('this week against last week', () => {
  const w = R.weekCompare(recs, now);
  assert.deepEqual(w.current, { from: '2026-09-21', to: '2026-09-23' });
  assert.deepEqual(w.previous, { from: '2026-09-14', to: '2026-09-20' });
  assert.deepEqual([row(w, 'jog').current, row(w, 'jog').previous], [3, 2]);
  assert.equal(row(w, 'spend').current, 3, 'the 01:30 press counts for the 23rd');
});

test('this month against last month', () => {
  const m = R.monthCompare(recs, now);
  assert.deepEqual(m.current, { from: '2026-09-01', to: '2026-09-23' });
  assert.deepEqual(m.previous, { from: '2026-08-01', to: '2026-08-31' });
  assert.deepEqual([row(m, 'read').current, row(m, 'read').previous], [1, 1]);
});

test('daily series', () => {
  const s = R.dailySeries(recs, 4, now);
  assert.deepEqual(s.days, ['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23']);
  assert.deepEqual(s.rows.find(r => r.id === 'jog')!.values, [1, 1, 1, 1]);
  assert.deepEqual(s.rows.find(r => r.id === 'spend')!.values, [0, 0, 0, 3]);
});

test('days in a row', () => {
  const st = R.streaks(recs, now);
  assert.deepEqual(st.find(r => r.id === 'jog'), { id: 'jog', label: 'Jogging', days: 4, todayDone: true }, '20 to 23 Sep');
  assert.deepEqual(st.find(r => r.id === 'read'), { id: 'read', label: 'Read', days: 1, todayDone: false }, 'yesterday only');
  assert.equal(st.find(r => r.id === 'core')!.days, 0);
});

test('records of one day, newest first', () => {
  const rod = R.recordsOfDay(recs, '2026-09-23');
  assert.deepEqual(rod.map(r => r.item + '@' + r.t.slice(11, 16)),
    ['spend@01:30', 'nonsense@21:00', 'spend@10:00', 'spend@09:00', 'jog@07:00']);
});

test('isoLocal is 25 characters with an offset', () => {
  const s = R.isoLocal(new Date());
  assert.equal(s.length, 25);
  assert.match(s, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/);
});

test('calendar month grid', () => {
  assert.equal(R.monthOf('2026-10-30'), '2026-10');
  assert.equal(R.addMonths('2026-10', 1), '2026-11');
  assert.equal(R.addMonths('2026-01', -1), '2025-12');
  assert.equal(R.addMonths('2026-12', 1), '2027-01');
  const g = R.monthGrid(recs, '2026-09');
  assert.equal(g.weeks.length, 5, 'Sep 2026 starts on a Tuesday and ends on a Wednesday: 5 rows');
  assert.equal(g.weeks[0]?.[0]?.key, '2026-08-31', 'the first row starts on the Monday before the 1st');
  assert.equal(g.weeks[0]?.[0]?.inMonth, false);
  assert.equal(g.weeks[0]?.[1]?.day, 1);
  assert.equal(g.weeks[4]?.[6]?.key, '2026-10-04', 'the last row ends on the Sunday after the 30th');
  const wed = g.weeks[3]?.[2];
  assert.equal(wed?.key, '2026-09-23');
  assert.deepEqual(wed?.items, ['jog', 'spend'], 'items in button order, mood not included, the 01:30 spend counts for the 23rd');
  const sun = g.weeks[2]?.[6];
  assert.equal(sun?.key, '2026-09-20');
  assert.deepEqual(sun?.items, ['jog']);
  assert.equal(sun?.mood, null);
  const withMood = R.monthGrid([...recs, { t: '2026-09-23T21:00:00+07:00', item: 'happy' }], '2026-09');
  assert.equal(withMood.weeks[3]?.[2]?.mood, 'happy');
  assert.deepEqual(withMood.weeks[3]?.[2]?.items, ['jog', 'spend'], 'the mood is a face, not a dot');
  assert.equal(R.monthGrid([], '2027-02').weeks.length, 4, 'Feb 2027 starts on a Monday and has 28 days: four rows');
});
