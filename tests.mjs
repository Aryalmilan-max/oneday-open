import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, textStats, summarize, extractDetails, compareLines, inspectUrl, cleanUrl, verifyQuote, splitBill, convertUnit, tidyText, makeReply, makeIcs } from './core.mjs';
import { planGuide } from './guide.mjs';

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

test('guide handles a bill as a short conversation', () => {
  const first = planGuide('split a bill');
  assert.equal(first.pending.kind, 'split-total');
  const second = planGuide('1200', { pending: first.pending });
  assert.equal(second.pending.kind, 'split-people');
  const third = planGuide('4', { pending: second.pending });
  assert.match(third.text, /300 per person/);
  assert.equal(third.pending, null);
  assert.equal(planGuide('split 1200 between 4 with 10% tip').text.includes('330 per person'), true);
});

test('guide can save tasks and notes without an online service', () => {
  assert.deepEqual(planGuide('add task call the bank').effect, { kind: 'task', text: 'call the bank' });
  assert.deepEqual(planGuide('note: bring documents').effect, { kind: 'note', text: 'bring documents' });
  assert.deepEqual(planGuide('save that as a task', { lastText: 'Call home' }).effect, { kind: 'task', text: 'Call home' });
  const list = planGuide('show tasks', { saved: { tasks: [{ text: 'Call home', done: false }] } });
  assert.match(list.text, /Call home/);
});

test('guide routes links, calculations, and online translation honestly', () => {
  assert.match(planGuide('clean this link https://example.com/?utm_source=ad&item=1').text, /item=1/);
  assert.doesNotMatch(planGuide('clean this link https://example.com/?utm_source=ad&item=1').text, /utm_source/);
  assert.match(planGuide('check https://example.com').text, /not visit the site/);
  assert.match(planGuide('20% of 350').text, /70/);
  assert.match(planGuide('convert 5 km to mi').text, /3.11/);
  assert.equal(planGuide('translate hello to Spanish').actions[0].prefill.to, 'es');
  assert.match(planGuide('translate hello to Spanish').text, /sent to that service/);
});

test('guide reminder requires a future time and uses local date', () => {
  const now = new Date('2026-10-18T10:00:00');
  const first = planGuide('remind me to call Alex', { now });
  assert.equal(first.pending.kind, 'reminder-when');
  const next = planGuide('tomorrow at 9am', { now, pending: first.pending });
  assert.equal(next.effect.title, 'call Alex');
  assert.equal(new Date(next.effect.when).getDate(), 19);
  assert.equal(new Date(next.effect.when).getHours(), 9);
  const invalid = planGuide('yesterday', { now, pending: first.pending });
  assert.equal(invalid.pending.kind, 'reminder-when');
});

test('guide can switch requests and help with saved work', () => {
  const saved = { tasks: [{ id: '1', text: 'Call the bank', done: false }], notes: [{ text: 'Bank paperwork due Friday' }], expenses: [{ amount: 200, currency: 'NPR', description: 'Lunch' }], reminders: [] };
  assert.deepEqual(planGuide('add task buy milk', { pending: { kind: 'split-total' } }).effect, { kind: 'task', text: 'buy milk' });
  assert.deepEqual(planGuide('mark task bank done', { saved }).effect, { kind: 'complete-task', id: '1' });
  assert.match(planGuide('find notes about bank', { saved }).text, /Bank paperwork/);
  assert.match(planGuide("what's next", { saved }).text, /Call the bank/);
  assert.match(planGuide('how much have I spent', { saved }).text, /200 NPR/);
  assert.equal(planGuide('spent NPR 250 on lunch').actions[0].prefill.currency, 'NPR');
});

test('guide example prompts ask only for missing information', () => {
  const task = planGuide('add task');
  assert.equal(task.pending.kind, 'task-text');
  assert.deepEqual(planGuide('Call home', { pending: task.pending }).effect, { kind: 'task', text: 'Call home' });
  const reminder = planGuide('remind me');
  assert.equal(reminder.pending.kind, 'reminder-title');
  assert.equal(planGuide('pay rent', { pending: reminder.pending }).pending.kind, 'reminder-when');
  const clean = planGuide('clean this link');
  assert.match(planGuide('https://example.org/?utm_source=ad&x=2', { pending: clean.pending }).text, /x=2/);
});

test('pasted details suggest relevant actions without inventing answers', () => {
  const pasted = planGuide('Please pay NPR 2,500 by 2026-10-20. Contact a@example.org.');
  assert.match(pasted.text, /NPR 2,500/);
  assert.equal(pasted.actions.find(x => x.id === 'expense').prefill.amount, 2500);
  assert.equal(pasted.actions.find(x => x.id === 'expense').prefill.currency, 'NPR');
  assert.ok(pasted.actions.some(x => x.id === 'reminder'));
  assert.match(planGuide('What is the weather today?').text, /do not have live answers/);
});
