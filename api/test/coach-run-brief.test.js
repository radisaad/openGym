// RadiGym: a chat question carries the runner's log (frontend lib/run-coach-brief.js) to the model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as payloadLib from '../coach/core/payload.js';
import { PROMPTS } from '../coach/core/prompts.js';

test('a question carries the running brief, cut to its cap', () => {
  const p = payloadLib.build({}, { handle: 'h', kind: 'ask', note: 'How should I run this week?', run: 'Readiness 70/100.\n- 2026-11-18 run 5.2 km' });
  assert.equal(p.running, 'Readiness 70/100.\n- 2026-11-18 run 5.2 km');
  const long = payloadLib.build({}, { handle: 'h', kind: 'ask', note: 'x', run: 'a'.repeat(payloadLib.RUN_BRIEF_MAX + 50) });
  assert.equal(long.running.length, payloadLib.RUN_BRIEF_MAX);
});

test('no brief, no running field; other jobs never carry one', () => {
  assert.equal('running' in payloadLib.build({}, { handle: 'h', kind: 'ask', note: 'x' }), false);
  assert.equal('running' in payloadLib.build({}, { handle: 'h', kind: 'review', run: 'x' }), false);
});

test('the ask prompt tells the model to coach the runner from it', () => {
  const ask = Object.values(PROMPTS).find(p => typeof p === 'string' && p.includes('Task: answer a question')) || PROMPTS.ask;
  assert.match(String(ask), /RadiGym, a running app/);
});
