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

test('ten items, three groups', () => {
  assert.equal(R.ITEMS.length, 10);
  assert.deepEqual(R.ITEMS.filter(i => i.group === 'day').map(i => i.id), ['work', 'problem']);
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
  assert.deepEqual(st.find(r => r.id === 'read'), { id: 'read', label: 'Read book', days: 1, todayDone: false }, 'yesterday only');
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
