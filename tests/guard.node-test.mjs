import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_DECISION_CHARS, clientKey, createRateLimiter } from '../lib/guard.ts';

test('allows up to the limit, then answers 429-style with a retry hint', () => {
  let now = 0;
  const rl = createRateLimiter({ limit: 3, windowMs: 60_000, now: () => now });
  for (let i = 0; i < 3; i++) assert.equal(rl.check('1.2.3.4').ok, true);
  const blocked = rl.check('1.2.3.4');
  assert.equal(blocked.ok, false);
  assert.equal(blocked.retryAfterSeconds, 60);
});

test('20 rapid requests against a limit of 12 reject the last 8', () => {
  const rl = createRateLimiter({ limit: 12, windowMs: 600_000, now: () => 0 });
  const results = Array.from({ length: 20 }, () => rl.check('9.9.9.9').ok);
  assert.equal(results.filter(Boolean).length, 12);
  assert.equal(results.filter((ok) => !ok).length, 8);
});

test('keys are independent and the window resets', () => {
  let now = 0;
  const rl = createRateLimiter({ limit: 1, windowMs: 1_000, now: () => now });
  assert.equal(rl.check('a').ok, true);
  assert.equal(rl.check('a').ok, false);
  assert.equal(rl.check('b').ok, true);
  now = 1_001;
  assert.equal(rl.check('a').ok, true);
});

test('reports the remaining wait as the window ages', () => {
  let now = 0;
  const rl = createRateLimiter({ limit: 1, windowMs: 10_000, now: () => now });
  rl.check('a');
  now = 4_000;
  assert.equal(rl.check('a').retryAfterSeconds, 6);
});

test('clientKey uses the first forwarded address, else a shared bucket', () => {
  assert.equal(clientKey(new Headers({ 'x-forwarded-for': '5.6.7.8, 10.0.0.1' })), '5.6.7.8');
  assert.equal(clientKey(new Headers()), 'unknown');
});

test('the decision cap is a sensible length', () => {
  assert.ok(MAX_DECISION_CHARS >= 200 && MAX_DECISION_CHARS <= 2000);
});
