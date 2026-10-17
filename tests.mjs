import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, textStats, summarize, extractDetails, compareLines, inspectUrl, cleanUrl, verifyQuote, splitBill, convertUnit, tidyText, makeReply, makeIcs } from './core.mjs';

test('HTML escaping covers untrusted text', () => assert.equal(escapeHtml('<img onerror="x">'), '&lt;img onerror=&quot;x&quot;&gt;'));
test('text analysis remains bounded and useful', () => {
  assert.equal(textStats('Hello world. Another line!').words, 4);
  assert.match(summarize('Cats sleep. Dogs run. Cats play. Birds fly.', 1), /Cats/);
  const details = extractDetails('Pay NPR 2,500 by 2026-10-18; mail a@example.org.');
  assert.deepEqual(details.dates, ['2026-10-18']);
  assert.deepEqual(details.emails, ['a@example.org']);
});
test('line diff reports additions and removals', () => assert.deepEqual(compareLines('one\ntwo', 'one\nthree'), { removed: ['two'], added: ['three'] }));
test('URL checks reject unsafe schemes and clean tracking only', () => {
  assert.throws(() => inspectUrl('javascript:alert(1)'));
  assert.equal(inspectUrl('http://example.com').flags[0], 'Connection is not HTTPS.');
  assert.equal(cleanUrl('https://example.com/?utm_source=ad&item=7'), 'https://example.com/?item=7');
});
test('quote check is exact after whitespace normalization', () => {
  assert.equal(verifyQuote('A useful fact', 'Here is a   useful fact.'), true);
  assert.equal(verifyQuote('different fact', 'Here is a useful fact.'), false);
});
test('money and units validate inputs', () => {
  assert.equal(splitBill(100, 4, 10).each, 27.5);
  assert.throws(() => splitBill(100, 0));
  assert.equal(convertUnit(0, 'c', 'f'), 32);
  assert.equal(convertUnit(1, 'km', 'm'), 1000);
  assert.throws(() => convertUnit(1, 'km', 'kg'));
});
test('text and calendar output are reviewable', () => {
  assert.equal(tidyText('  Hi   there  \n\n\n more '), 'Hi there\n\nmore');
  assert.match(makeReply('meeting', 'professional'), /meeting/);
  assert.match(makeIcs('Meet', '2026-10-18T10:00', '2026-10-18T11:00'), /BEGIN:VEVENT/);
});
