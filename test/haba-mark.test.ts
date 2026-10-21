// Test of shared/haba-mark.ts against a fake Haba database in memory (no real data is touched).
process.env.TZ = 'Asia/Ho_Chi_Minh';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markHaba, unmarkHaba, habaDay, isoLocal } from '../shared/haba-mark.ts';

const PREFIX = 'projects/habits-433f8/databases/(default)/documents/records/';
let db: Map<string, { t: string; item: string }>;
let n = 0;

// The fake answers the three calls the file makes: a query by item, a new record, and a delete.
globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
  const body = init.body ? JSON.parse(String(init.body)) : null;
  const ok = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
  if (url.includes(':runQuery')) {
    const item = body.structuredQuery.where.fieldFilter.value.stringValue;
    const rows = [...db].filter(([, r]) => r.item === item)
      .map(([id, r]) => ({ document: { name: PREFIX + id, fields: { t: { stringValue: r.t }, item: { stringValue: r.item } } } }));
    return ok(rows.length ? rows : [{ readTime: 'x' }]);
  }
  if (init.method === 'POST') {
    const f = body.fields;
    // The same checks as the Firestore rules.
    assert.deepEqual(Object.keys(f).sort(), ['item', 't']);
    assert.equal(f.t.stringValue.length, 25);
    db.set(String(++n), { t: f.t.stringValue, item: f.item.stringValue });
    return ok({});
  }
  if (init.method === 'DELETE') {
    db.delete(url.split(PREFIX)[1]!.split('?')[0]!);
    return ok({});
  }
  return new Response('', { status: 400 });
}) as typeof fetch;

test('Haba day starts at 04:00', () => {
  assert.equal(habaDay('2026-10-21T03:59:00+07:00'), '2026-10-20');
  assert.equal(habaDay('2026-10-21T04:00:00+07:00'), '2026-10-21');
  assert.equal(isoLocal(new Date('2026-10-21T22:10:05+07:00')), '2026-10-21T22:10:05+07:00');
});

test('mark once per day, past days, remove', async () => {
  db = new Map([['old', { t: '2026-10-19T08:00:00+07:00', item: 'jog' }]]);
  assert.equal(await markHaba('jog'), 'added');
  assert.equal(await markHaba('jog'), 'already');
  assert.equal(await markHaba('read'), 'added');
  assert.equal(await markHaba('jog', '2026-10-19'), 'already'); // Iker marked it in Haba that day
  assert.equal(await markHaba('core', '2026-10-18'), 'added');
  assert.equal([...db.values()].find(r => r.item === 'core')!.t, '2026-10-18T12:00:00+07:00');
  assert.equal(db.size, 4);
  assert.equal(await unmarkHaba('jog', habaDay(new Date())), 1);
  assert.equal(await unmarkHaba('jog', habaDay(new Date())), 0);
  assert.equal([...db.values()].filter(r => r.item === 'jog').length, 1); // the old day stays
});
