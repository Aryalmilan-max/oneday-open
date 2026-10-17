import { cleanUrl, convertUnit, extractDetails, inspectUrl, percentOf, splitBill, summarize, textStats } from './core.mjs';

const tool = (id, label, prefill = {}) => ({ id, label, prefill });
const money = value => Number(String(value).replace(/[^\d.-]/g, ''));
const number = value => Number(String(value).replace(/,/g, ''));
const pretty = value => Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
const languages = { english: 'en', spanish: 'es', french: 'fr', german: 'de', hindi: 'hi', nepali: 'ne' };

function findWhen(input, now = new Date()) {
  const iso = input.match(/\b(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})\b/);
  if (iso) {
    const date = new Date(`${iso[1]}T${iso[2].padStart(2, '0')}:${iso[3]}`);
    return Number.isFinite(date.getTime()) && date > now ? date : null;
  }
  const relative = input.match(/\b(today|tomorrow)\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (!relative) return null;
  const date = new Date(now);
  if (relative[1].toLowerCase() === 'tomorrow') date.setDate(date.getDate() + 1);
  let hour = Number(relative[2]);
  if (relative[4]) hour = hour % 12 + (relative[4].toLowerCase() === 'pm' ? 12 : 0);
  const minute = Number(relative[3] ?? 0);
  if (hour > 23 || minute > 59) return null;
  date.setHours(hour, minute, 0, 0);
  return date > now ? date : null;
}

function detailsAnswer(input) {
  const d = extractDetails(input);
  const rows = [
    ['Email', d.emails], ['Link', d.links], ['Date', d.dates], ['Amount', d.amounts]
  ].filter(([, values]) => values.length).map(([label, values]) => `${label}: ${values.join(', ')}`);
  return rows.length ? `I found these details:\n${rows.join('\n')}\nCheck them against the original.` : 'I did not find an email, link, date, or amount. You can still summarize or tidy this text.';
}

export function planGuide(raw, context = {}) {
  const input = String(raw).trim();
  const lower = input.toLocaleLowerCase();
  const saved = context.saved ?? { tasks: [], notes: [], reminders: [], expenses: [] };
  const lastText = context.lastText ?? '';
  const now = context.now ?? new Date();
  if (!input) return { text: 'Tell me what you want to do, or choose an example below.' };
  if (/^(cancel|never mind|nevermind|stop)$/i.test(input)) return { text: 'Okay. What would you like to do next?', pending: null };
  const newRequest = /^(?:add (?:a )?task|(?:make|create) (?:a )?task|to-?do|remember to|note\s*:|save (?:a )?note|show |list |view |open |find |what |how |split |share |convert |translate |summarize|clean |inspect |check |remind me|set (?:a )?reminder|spent |log (?:an? )?expense)/i.test(input);
  const pending = newRequest ? null : context.pending;

  if (pending?.kind === 'split-total') {
    const total = money(input);
    if (!Number.isFinite(total) || total <= 0) return { text: 'What is the bill total? Enter a number, such as 1200.', pending };
    return { text: `Got it: ${pretty(total)}. How many people are sharing it?`, pending: { kind: 'split-people', total } };
  }
  if (pending?.kind === 'split-people') {
    const people = number(input);
    if (!Number.isInteger(people) || people < 1 || people > 10000) return { text: 'How many people? Enter a whole number, such as 4.', pending };
    const share = splitBill(pending.total, people);
    return { text: `${pretty(share.each)} per person for ${people} people. Total: ${pretty(share.total)}. Check rounding before paying.`, pending: null, actions: [tool('bill', 'Adjust tip or shares', { total: pending.total, people }), tool('expense', 'Log this expense', { amount: pending.total })] };
  }
  if (pending?.kind === 'reminder-when') {
    const when = findWhen(input, now);
    if (!when) return { text: 'When should I remind you? Try “tomorrow at 9am” or “2026-10-20 09:00”. You can also say cancel.', pending };
    return { text: `Reminder saved for ${when.toLocaleString()}. I will also download a calendar file so your calendar app can notify you.`, pending: null, effect: { kind: 'reminder', title: pending.title, when: when.toISOString() }, actions: [tool('reminder', 'See reminders')] };
  }
  if (pending?.kind === 'task-text') return { text: `Added to your tasks: ${input}`, pending: null, effect: { kind: 'task', text: input }, rememberText: input, actions: [tool('tasks', 'View tasks')] };
  if (pending?.kind === 'note-text') return { text: `Saved your note: ${input}`, pending: null, effect: { kind: 'note', text: input }, rememberText: input, actions: [tool('notes', 'View notes')] };
  if (pending?.kind === 'reminder-title') return { text: `When should I remind you to ${input}? Try “tomorrow at 9am” or “2026-10-20 09:00”.`, pending: { kind: 'reminder-when', title: input }, actions: [tool('reminder', 'Use date picker', { title: input })] };
  if (pending?.kind === 'link-clean') {
    const url = input.match(/https?:\/\/[^\s<>"']+/i)?.[0];
    if (!url) return { text: 'Paste a full HTTP or HTTPS link to clean.', pending };
    try { return { text: `Clean link:\n${cleanUrl(url)}`, pending: null, rememberText: url, actions: [tool('url', 'Inspect link', { link: url })] }; }
    catch (error) { return { text: error.message, pending }; }
  }

  if (/^(help|what can you do|how does this work|hi|hello|hey)\??$/i.test(input)) return {
    text: 'Tell me a task in plain words. I can split a bill, calculate a percentage, convert units, clean or inspect a link, summarize text, find details, save a task or note, and set a reminder. For files, translation, and more, I will open the right tool.',
    actions: [tool('tasks', 'My tasks'), tool('notes', 'My notes'), tool('pdf-merge', 'Combine PDFs')]
  };

  if (/^(?:add (?:a )?task|(?:make|create) (?:a )?task|to-?do)$/i.test(input)) return { text: 'What task should I add?', pending: { kind: 'task-text' } };
  if (/^(?:note|save (?:a )?note|(?:write|add) (?:a )?note)$/i.test(input)) return { text: 'What should the note say?', pending: { kind: 'note-text' } };
  if (/^(?:remind me(?: to)?|set (?:a )?reminder)$/i.test(input)) return { text: 'What should I remind you about?', pending: { kind: 'reminder-title' } };
  if (/^(?:clean|strip)\s+(?:this\s+)?link\s*:?$/i.test(input)) return { text: 'Paste the link you want to clean.', pending: { kind: 'link-clean' } };

  const task = input.match(/^(?:add (?:a )?task|(?:make|create) (?:a )?task|to-?do|remember to|i need to)\s*:?[\s]+(.+)$/i);
  if (task || /^(?:save|make) (?:that|it) (?:as )?a?\s*task$/i.test(input)) {
    const content = (task?.[1] ?? lastText).trim();
    if (!content) return { text: 'What task should I add? Try “add task call the bank”.' };
    return { text: `Added to your tasks: ${content}`, effect: { kind: 'task', text: content }, rememberText: content, actions: [tool('tasks', 'View tasks')] };
  }
  const note = input.match(/^(?:save (?:a )?note|(?:write|add) (?:a )?note|note)\s*:?[\s]+(.+)$/i);
  if (note || /^(?:save|make) (?:that|it) (?:as )?a?\s*note$/i.test(input)) {
    const content = (note?.[1] ?? lastText).trim();
    if (!content) return { text: 'What should the note say? Try “note: bring the documents”.' };
    return { text: `Saved your note: ${content}`, effect: { kind: 'note', text: content }, rememberText: content, actions: [tool('notes', 'View notes')] };
  }

  if (/^(?:show|list|view|open|what are)\b.*\b(tasks?|to-?dos?)\b/i.test(input)) {
    const open = saved.tasks.filter(x => !x.done);
    return { text: open.length ? `Your open tasks:\n${open.slice(-8).reverse().map(x => `• ${x.text}`).join('\n')}` : 'No open tasks saved on this device.', actions: [tool('tasks', 'Manage tasks')] };
  }
  const complete = input.match(/^(?:mark|finish|complete)\s+(?:task\s+)?(.+?)\s+(?:as\s+)?done$/i) ?? input.match(/^(?:mark|finish|complete)\s+task\s+(.+)$/i);
  if (complete) {
    const query = complete[1].toLocaleLowerCase();
    const matches = saved.tasks.filter(x => !x.done && x.text.toLocaleLowerCase().includes(query));
    if (matches.length === 1) return { text: `Marked done: ${matches[0].text}`, effect: { kind: 'complete-task', id: matches[0].id }, actions: [tool('tasks', 'View tasks')] };
    return { text: matches.length ? 'I found more than one matching task. Open the task list to choose the right one.' : 'I could not find that open task.', actions: [tool('tasks', 'Open task list')] };
  }
  if (/^(?:what(?:'s| is) next|what should i do|plan my day|today(?:'s)? plan)\??$/i.test(input)) {
    const tasks = saved.tasks.filter(x => !x.done).slice(-5).reverse();
    const reminders = saved.reminders.filter(x => new Date(x.when) >= now).sort((a, b) => new Date(a.when) - new Date(b.when)).slice(0, 3);
    return { text: `${tasks.length ? `Open tasks:\n${tasks.map(x => `• ${x.text}`).join('\n')}` : 'No open tasks.'}\n${reminders.length ? `Upcoming reminders:\n${reminders.map(x => `• ${x.title} — ${new Date(x.when).toLocaleString()}`).join('\n')}` : 'No upcoming reminders.'}`, actions: [tool('tasks', 'Manage tasks'), tool('reminder', 'Add reminder')] };
  }
  const findNote = input.match(/^(?:find|search)\s+(?:my\s+)?notes?\s+(?:about|for|containing)\s+(.+)$/i);
  if (findNote) {
    const query = findNote[1].toLocaleLowerCase();
    const matches = saved.notes.filter(x => x.text.toLocaleLowerCase().includes(query)).slice(-5).reverse();
    return { text: matches.length ? `Matching notes:\n${matches.map(x => `• ${x.text}`).join('\n')}` : `No saved note matches “${findNote[1]}”.`, actions: [tool('notes', 'Open note search')] };
  }
  if (/^(?:show|list|view|open|find)\b.*\bnotes?\b/i.test(input)) return { text: saved.notes.length ? `Your latest notes:\n${saved.notes.slice(-5).reverse().map(x => `• ${x.text}`).join('\n')}` : 'No notes saved on this device.', actions: [tool('notes', 'Search notes')] };
  if (/^(?:show|list|view|open)\b.*\breminders?\b/i.test(input)) return { text: saved.reminders.length ? `Your reminders:\n${saved.reminders.slice(-5).reverse().map(x => `• ${x.title} — ${new Date(x.when).toLocaleString()}`).join('\n')}` : 'No reminders saved on this device.', actions: [tool('reminder', 'Manage reminders')] };
  if (/^(?:show|list|view|open)\b.*\bexpenses?\b/i.test(input)) return { text: saved.expenses.length ? `Your latest expenses:\n${saved.expenses.slice(-5).reverse().map(x => `• ${x.description}: ${pretty(x.amount)} ${x.currency}`).join('\n')}` : 'No expenses saved on this device.', actions: [tool('expense', 'Manage expenses')] };
  if (/^(?:how much|total)\b.*\bspent\b/i.test(input)) {
    const totals = new Map();
    for (const item of saved.expenses) totals.set(item.currency, (totals.get(item.currency) ?? 0) + Number(item.amount));
    return { text: totals.size ? `Saved expense totals by currency:\n${[...totals].map(([currency, amount]) => `• ${pretty(amount)} ${currency}`).join('\n')}\nThese are all saved entries, not a bank balance.` : 'No expenses saved on this device.', actions: [tool('expense', 'Review expenses')] };
  }
  const spent = input.match(/^(?:spent|log (?:an? )?expense(?: of)?)\s+(?:(USD|NPR|EUR|GBP|INR)\s*)?([\d,.]+)(?:\s*(USD|NPR|EUR|GBP|INR))?\s+(?:on|for)\s+(.+)$/i);
  if (spent) {
    const amount = money(spent[2]);
    if (Number.isFinite(amount) && amount >= 0) return { text: `I can log ${pretty(amount)} ${spent[1] ?? spent[3] ?? 'in your currency'} for ${spent[4]}. Review the details before saving.`, actions: [tool('expense', 'Review expense', { amount, currency: (spent[1] ?? spent[3] ?? '').toUpperCase(), description: spent[4] })] };
  }

  const split = input.match(/\b(?:split|share)\s+(?:(?:a|the)\s+)?(?:bill\s+(?:of\s+)?)?([€$£₹₨]?\s?[\d,.]+)\s+(?:between|among|for|by)\s+(\d+)/i);
  if (split) {
    const total = money(split[1]), people = number(split[2]);
    const tipMatch = input.match(/\btip\s*(\d+(?:\.\d+)?)\s*%?|\b(\d+(?:\.\d+)?)\s*%\s*tip\b/i);
    const tip = Number(tipMatch?.[1] ?? tipMatch?.[2] ?? 0);
    try { const share = splitBill(total, people, tip); return { text: `${pretty(share.each)} per person. Total ${pretty(share.total)}${tip ? ` including ${tip}% tip` : ''}. Check rounding before paying.`, actions: [tool('bill', 'Adjust the split', { total, people, tip }), tool('expense', 'Log expense', { amount: total })] }; }
    catch (error) { return { text: error.message, actions: [tool('bill', 'Open bill splitter')] }; }
  }
  if (/\b(?:split|share)\s+(?:(?:a|the)\s+)?bill\b/i.test(input)) return { text: 'Sure. What is the bill total?', pending: { kind: 'split-total' }, actions: [tool('bill', 'Use form instead')] };

  const percent = input.match(/\b(-?\d+(?:\.\d+)?)\s*%\s+of\s+([€$£₹₨]?\s?[\d,.]+)/i);
  if (percent) return { text: `${percent[1]}% of ${pretty(money(percent[2]))} is ${pretty(percentOf(money(percent[2]), percent[1]))}.`, actions: [tool('percent', 'Open calculator', { value: money(percent[2]), percent: percent[1] })] };
  const unit = input.match(/\bconvert\s+(-?\d+(?:\.\d+)?)\s*(km|mi|m|ft|kg|lb|l|gal|c|f)\s+(?:to|in)\s+(km|mi|m|ft|kg|lb|l|gal|c|f)\b/i);
  if (unit) {
    const [, value, from, to] = unit;
    try { return { text: `${pretty(number(value))} ${from} = ${pretty(convertUnit(value, from.toLowerCase(), to.toLowerCase()))} ${to}.`, actions: [tool('units', 'Open converter', { value, from: from.toLowerCase(), to: to.toLowerCase() })] }; }
    catch (error) { return { text: error.message, actions: [tool('units', 'Open converter')] }; }
  }

  const reminder = input.match(/^(?:remind me|set (?:a )?reminder)\s+(?:to\s+)?(.+)$/i);
  if (reminder) {
    const when = findWhen(reminder[1], now);
    const title = reminder[1].replace(/\b(?:today|tomorrow)\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/i, '').replace(/\b\d{4}-\d{2}-\d{2}[ T]\d{1,2}:\d{2}\b/, '').trim().replace(/\b(?:on|at)\s*$/i, '').replace(/[,.]$/, '').trim();
    if (!title) return { text: 'What should I remind you about? Try “remind me to call Alex tomorrow at 9am”.', actions: [tool('reminder', 'Open reminder form')] };
    if (when) return { text: `Reminder saved for ${when.toLocaleString()}. I will also download a calendar file so your calendar app can notify you.`, effect: { kind: 'reminder', title, when: when.toISOString() }, actions: [tool('reminder', 'See reminders')] };
    return { text: `When should I remind you to ${title}? Try “tomorrow at 9am” or “2026-10-20 09:00”.`, pending: { kind: 'reminder-when', title }, actions: [tool('reminder', 'Use date picker', { title })] };
  }

  const url = input.match(/https?:\/\/[^\s<>"']+/i)?.[0];
  if (url && /\b(clean|strip|remove tracking|untrack)\b/i.test(input)) {
    try { return { text: `Clean link:\n${cleanUrl(url)}`, actions: [tool('url', 'Inspect link', { link: url }), tool('notes', 'Save as note', { note: cleanUrl(url) })] }; }
    catch (error) { return { text: error.message }; }
  }
  if (url && /\b(check|inspect|look at|safe|trust)\b/i.test(input)) {
    try { const info = inspectUrl(url); return { text: `Domain: ${info.host}\n${info.flags.length ? info.flags.join('\n') : 'No visible warning signs found.'}\nA clean-looking URL can still be harmful. This check does not visit the site.`, actions: [tool('clean-link', 'Remove trackers', { link: url })] }; }
    catch (error) { return { text: error.message }; }
  }

  const translate = input.match(/^translate\s+(.+?)\s+(?:to|into)\s+(english|spanish|french|german|hindi|nepali)$/i);
  if (translate) return { text: 'I can translate that using MyMemory. The entered text is sent to that service when you run the tool.', actions: [tool('translate', `Translate to ${translate[2]}`, { text: /^(that|it)$/i.test(translate[1]) ? lastText : translate[1], to: languages[translate[2].toLowerCase()] })] };
  if (/^translate\b/i.test(input)) return { text: 'Choose the language in the translation tool. Text is sent to MyMemory only when you run it.', actions: [tool('translate', 'Open translator', { text: input.replace(/^translate\s*:?[\s]*/i, '') || lastText })] };

  if (/\b(?:summarize|summary|shorten)\b/i.test(input)) {
    const content = input.replace(/^(?:please\s+)?(?:summarize|summary of|shorten)\s*:?[\s]*/i, '');
    const source = /^(that|it|this)?$/i.test(content) ? lastText : content;
    if (!source) return { text: 'Paste the text after “summarize:” or paste it by itself.', actions: [tool('summary', 'Open summary tool')] };
    return { text: `Short version:\n${summarize(source, 3)}`, rememberText: source, actions: [tool('summary', 'Adjust summary', { text: source }), tool('notes', 'Save the text', { note: source })] };
  }
  if (/^(?:find|extract|show)\s+(?:key\s+)?(?:details?|emails?|dates?|amounts?)\b/i.test(input)) {
    const content = input.replace(/^(?:find|extract|show)\s+(?:key\s+)?(?:details?|emails?|dates?|amounts?)\s*(?:in|from|of)?\s*:?[\s]*/i, '');
    const source = /^(that|it|this)?$/i.test(content) ? lastText : content;
    if (!source) return { text: 'Paste the text to inspect first.', actions: [tool('details', 'Open details tool')] };
    return { text: detailsAnswer(source), rememberText: source, actions: [tool('details', 'Open details tool', { text: source }), tool('tasks', 'Make a task')] };
  }

  if (/\b(?:reply|respond|draft a message|write a message|write an? email|draft an? email)\b/i.test(input)) return { text: 'I can make an editable reply starter. Tell the tool what you are responding to and choose a tone.', actions: [tool('reply', 'Draft a reply', { topic: input })] };
  if (/\b(?:combine|merge|join)\b.*\bpdfs?\b/i.test(input)) return { text: 'Choose two or more PDFs. They will be combined in your browser after the PDF library loads.', actions: [tool('pdf-merge', 'Choose PDFs')] };
  if (/\bpdf\b/i.test(input) && /\b(?:extract|read|text)\b/i.test(input)) return { text: 'Choose a PDF to extract its embedded text. Scanned pages need the image text tool.', actions: [tool('pdf-text', 'Choose PDF')] };
  if (/\b(?:scan|ocr|read)\b.*\b(?:image|photo|picture)\b/i.test(input)) return { text: 'Choose an image. OCR runs in this browser after its library and language data load.', actions: [tool('ocr', 'Choose image')] };
  if (/\b(?:compress|resize)\b.*\b(?:image|photo|picture)\b/i.test(input)) return { text: 'Choose an image to resize and export as a JPEG.', actions: [tool('image', 'Choose image')] };

  if (url) return { text: `I found a link. I can show its domain and visible warning signs or remove common tracking tags. I will not visit it.`, rememberText: url, actions: [tool('url', 'Inspect link', { link: url }), tool('clean-link', 'Clean link', { link: url })] };
  const details = extractDetails(input);
  const stats = textStats(input);
  if (stats.words < 12 && /^(?:what|who|when|where|why|how|can you|do you)\b/i.test(input)) return { text: 'I can help with the focused everyday actions shown here, but I do not have live answers to open-ended questions. Try “what can you do” to see examples.', actions: [tool('reply', 'Draft a reply'), tool('tasks', 'Manage tasks')] };
  const actions = [tool('summary', 'Summarize', { text: input }), tool('details', 'Find details', { text: input }), tool('notes', 'Save note', { note: input }), tool('tasks', 'Make task', { task: input })];
  if (details.amounts.length) {
    const first = details.amounts[0];
    const amount = money(first);
    const currency = first.match(/\b(?:USD|NPR|EUR|GBP|INR)\b/i)?.[0]?.toUpperCase();
    actions.splice(2, 0, tool('bill', 'Split bill', { total: amount }), tool('expense', 'Log expense', { amount, ...(currency ? { currency } : {}) }));
  }
  if (details.dates.length) actions.push(tool('reminder', 'Set reminder', { title: input.slice(0, 100) }));
  return { text: `${stats.words} words received.${details.emails.length || details.dates.length || details.amounts.length ? `\n${detailsAnswer(input)}` : '\nWhat would you like to do with it?'}`, rememberText: input, actions };
}
