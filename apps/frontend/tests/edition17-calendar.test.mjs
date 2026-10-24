import test from 'node:test';
import assert from 'node:assert/strict';
import { CALENDAR_GROUPS, EDITION17_CALENDAR, calendarFor } from '../data/edition17-calendar.ts';

test('every 第十七届 calendar entry is a dated, page-cited span from the general notice', () => {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  for (const e of EDITION17_CALENDAR.entries) {
    assert.match(e.end, iso, e.id);
    if (e.start) { assert.match(e.start, iso, e.id); assert.ok(e.start <= e.end, e.id); }
    assert.ok(e.page >= 3 && e.page <= 6, e.id);
    assert.ok(e.groups.length > 0 && e.groups.every(g => g in CALENDAR_GROUPS), e.id);
  }
  assert.equal(new Set(EDITION17_CALENDAR.entries.map(e => e.id)).size, EDITION17_CALENDAR.entries.length);
  assert.equal(EDITION17_CALENDAR.source.documentNumber, '中商统〔2026〕33号');
});

test('each group sees its own registration, campus round and final, in date order', () => {
  for (const group of Object.keys(CALENDAR_GROUPS)) {
    const rows = calendarFor(group, '2026-10-10');
    for (const prefix of ['signup', 'practice-notice', 'campus', 'final']) assert.equal(rows.filter(r => r.id.startsWith(prefix)).length, 1, `${group} ${prefix}`);
    const keys = rows.map(r => r.start ?? r.end);
    assert.deepEqual(keys, [...keys].sort());
  }
  assert.ok(!calendarFor('international', '2026-10-10').some(r => r.id.startsWith('knowledge') || r.id.startsWith('provincial')));
  assert.equal(calendarFor('undergrad', '2026-10-10').find(r => r.id.startsWith('final')).end, '2027-05-30');
});

test('states and day counts follow the visitor date', () => {
  const rows = Object.fromEntries(calendarFor('undergrad', '2026-10-25').map(r => [r.id, r]));
  assert.equal(rows.signup.state, 'upcoming'); assert.equal(rows.signup.daysLeft, 6);
  assert.equal(rows['mock-exam'].state, 'current'); assert.equal(rows['mock-exam'].daysLeft, 16);
  assert.equal(rows.knowledge.state, 'upcoming'); assert.equal(rows.knowledge.daysLeft, 7);
  const later = Object.fromEntries(calendarFor('undergrad', '2026-11-21').map(r => [r.id, r]));
  assert.equal(later.signup.state, 'past'); assert.equal(later.knowledge.state, 'past'); assert.equal(later['topic-briefing'].state, 'current');
});
