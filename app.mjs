import { escapeHtml, textStats, summarize, extractDetails, compareLines, inspectUrl, cleanUrl, verifyQuote, splitBill, percentOf, convertUnit, tidyText, makeReply, makeIcs } from './core.mjs';

const $ = selector => document.querySelector(selector);
const storageKey = 'oneday-open-v1';
const categories = ['All', 'Understand', 'Communicate', 'Trust', 'Money', 'Organize', 'Files'];
const needsOnlineOrBrowser = new Set(['translate', 'ocr', 'transcribe', 'currency', 'pdf-merge', 'pdf-text']);
const state = readState();
let activeTool = null;
let activeCategory = 'All';
let quickText = '';
let lastAmount = '';
const related = { summary: ['notes','share-card'], details: ['tasks','reminder','expense'], ocr: ['summary','details','translate'], 'pdf-text': ['summary','details','translate'], transcribe: ['tidy','reply','notes'], bill: ['expense','reminder'], url: ['clean-link','notes'], translate: ['read','reply'], compare: ['notes','share-card'], expense: ['reminder'] };

function readState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || '{}');
    return { notes: Array.isArray(parsed.notes) ? parsed.notes : [], tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [], expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [], reminders: Array.isArray(parsed.reminders) ? parsed.reminders : [] };
  } catch { return { notes: [], tasks: [], expenses: [], reminders: [] }; }
}
function saveState() { localStorage.setItem(storageKey, JSON.stringify(state)); }
function field(name, label, type = 'text', extra = {}) { return { name, label, type, ...extra }; }
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
function result(text, copy = text) { return { text, copy }; }
function requireFile(form, name) {
  const file = form.elements.namedItem(name)?.files?.[0];
  if (!file) throw new Error('Choose a file first.');
  return file;
}
function fileList(form, name) {
  const files = [...(form.elements.namedItem(name)?.files ?? [])];
  if (!files.length) throw new Error('Choose files first.');
  return files;
}
async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Online service returned HTTP ${response.status}.`);
    return await response.json();
  } finally { clearTimeout(timeout); }
}
const scripts = new Map();
function loadScript(url) {
  if (!scripts.has(url)) scripts.set(url, new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = url; script.async = true;
    script.onload = resolve; script.onerror = () => reject(new Error('Could not load the browser library. Check your connection.'));
    document.head.append(script);
  }));
  return scripts.get(url);
}
function savedList(kind, format) {
  const entries = [...state[kind]].reverse();
  if (!entries.length) return '<p>No saved items yet.</p>';
  return `<div class="saved-list">${entries.map(item => `<div class="saved-item"><span>${format(item)}</span><div class="saved-actions">${kind === 'tasks' ? `<button type="button" data-toggle-task="${escapeHtml(item.id)}">${item.done ? 'Reopen' : 'Done'}</button>` : ''}<button type="button" data-delete="${kind}" data-id="${escapeHtml(item.id)}" aria-label="Delete item">Delete</button></div></div>`).join('')}</div>`;
}
const savedKinds = new Set(['expenses', 'notes', 'tasks', 'reminders']);
function savedPanel(kind) {
  const label = { expenses: 'Saved expenses', notes: 'Saved notes', tasks: 'Saved tasks', reminders: 'Saved reminders' }[kind];
  const format = {
    expenses: x => `${escapeHtml(x.description)} — ${escapeHtml(x.amount)} ${escapeHtml(x.currency)} <small>${escapeHtml(new Date(x.at).toLocaleDateString())}</small>`,
    notes: x => escapeHtml(x.text),
    tasks: x => `${x.done ? '✓ ' : '○ '}${escapeHtml(x.text)}`,
    reminders: x => `${escapeHtml(x.title)} — ${escapeHtml(new Date(x.when).toLocaleString())}`
  }[kind];
  return `<h3>${label}</h3>${kind === 'notes' ? '<label for="noteSearch">Find saved notes</label><input id="noteSearch" type="search" placeholder="Search your notes">' : ''}${savedList(kind, format)}`;
}
function commonText(f = 'text') { return field(f, 'Your text', 'textarea', { wide: true, required: true, prefill: true }); }

const tools = [
  { id: 'summary', category: 'Understand', icon: '≡', title: 'Quick summary', desc: 'Pull the main sentences from long text.', fields: [commonText(), field('sentences', 'Sentences to keep', 'number', { value: 3, min: 1, max: 8 })], run: async v => result(summarize(v.text, Number(v.sentences))) },
  { id: 'stats', category: 'Understand', icon: '◇', title: 'Reading stats', desc: 'Count words, characters, sentences, and reading time.', fields: [commonText()], run: async v => { const s = textStats(v.text); return result(`${s.words} words · ${s.characters} characters · ${s.sentences} sentences · about ${s.minutes} min read`); } },
  { id: 'details', category: 'Understand', icon: '⌕', title: 'Find key details', desc: 'Find emails, dates, links, and amounts for review.', fields: [commonText()], run: async v => { const d = extractDetails(v.text); return result(Object.entries(d).map(([key, values]) => `${key.toUpperCase()}\n${values.length ? values.join('\n') : 'None found'}`).join('\n\n') + '\n\nCheck extracted values against the original.'); } },
  { id: 'compare', category: 'Understand', icon: '⇄', title: 'Compare text', desc: 'See lines added and removed between two versions.', fields: [field('before', 'Earlier version', 'textarea', { wide: true, required: true }), field('after', 'New version', 'textarea', { wide: true, required: true })], run: async v => { const d = compareLines(v.before, v.after); return result(`ADDED\n${d.added.join('\n') || 'None'}\n\nREMOVED\n${d.removed.join('\n') || 'None'}\n\nLine-based comparison; review moved or rewritten lines manually.`); } },
  { id: 'translate', category: 'Understand', icon: '文', title: 'Translate text', desc: 'Translate a short passage between common languages.', note: 'Online: entered text is sent to MyMemory. Keep private or sensitive text out.', fields: [commonText(), field('from', 'From', 'select', { options: [['en','English'],['es','Spanish'],['fr','French'],['de','German'],['hi','Hindi'],['ne','Nepali']] }), field('to', 'To', 'select', { options: [['es','Spanish'],['en','English'],['fr','French'],['de','German'],['hi','Hindi'],['ne','Nepali']] })], run: async v => { if (v.text.length > 500) throw new Error('Use 500 characters or fewer for this public translation service.'); if (v.from === v.to) return result(v.text); const data = await fetchJson(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(v.text)}&langpair=${encodeURIComponent(v.from + '|' + v.to)}`); if (data.responseStatus !== 200 || !data.responseData?.translatedText) throw new Error('Translation was unavailable. Try again later.'); return result(`${data.responseData.translatedText}\n\nMachine translation may be wrong. Review important wording.`); } },
  { id: 'ocr', category: 'Understand', icon: '▧', title: 'Scan image text', desc: 'Read text from a photo in your browser.', note: 'Online library download: Tesseract.js and language data load from a CDN; your image is processed in the browser. OCR can miss text.', fields: [field('image', 'Image file', 'file', { accept: 'image/*', required: true, wide: true }), field('lang', 'Text language', 'select', { options: [['eng','English'],['nep','Nepali'],['hin','Hindi'],['spa','Spanish']] })], run: async (v, form) => { await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'); const worker = await window.Tesseract.createWorker(v.lang); try { const { data } = await worker.recognize(requireFile(form, 'image')); return result((data.text || '').trim() || 'No readable text found.'); } finally { await worker.terminate(); } } },
  { id: 'transcribe', category: 'Understand', icon: '◖', title: 'Voice to text', desc: 'Dictate with your browser microphone.', note: 'Requires browser speech recognition and microphone permission. Browser vendors may process audio online.', fields: [field('language', 'Speech language', 'select', { options: [['en-US','English'],['ne-NP','Nepali'],['hi-IN','Hindi'],['es-ES','Spanish']] })], run: async v => { const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SpeechRecognition) throw new Error('This browser does not support speech recognition. Try Chrome or Edge.'); return await new Promise((resolve, reject) => { const recognition = new SpeechRecognition(); let finished = false; recognition.lang = v.language; recognition.interimResults = false; recognition.onresult = e => { finished = true; resolve(result(e.results[0][0].transcript)); }; recognition.onerror = e => { finished = true; reject(new Error(`Speech recognition: ${e.error}`)); }; recognition.onend = () => { if (!finished) reject(new Error('No speech was captured. Try again and speak clearly.')); }; recognition.start(); }); } },
  { id: 'read', category: 'Understand', icon: '◉', title: 'Read aloud', desc: 'Listen to text using your device voice.', fields: [commonText()], run: async v => { if (!('speechSynthesis' in window)) throw new Error('Speech playback is unavailable in this browser.'); speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(v.text.slice(0, 5000)); speechSynthesis.speak(utterance); return result('Playing on your device. Use this tool again to start a new reading.'); } },
  { id: 'tidy', category: 'Communicate', icon: '✦', title: 'Clean up text', desc: 'Remove messy spaces and extra blank lines.', fields: [commonText()], run: async v => result(tidyText(v.text)) },
  { id: 'reply', category: 'Communicate', icon: '↩', title: 'Reply starter', desc: 'Get an editable starting point for a response.', fields: [field('topic', 'What is the reply about?', 'textarea', { wide: true, required: true, prefill: true }), field('tone', 'Tone', 'select', { options: [['friendly','Friendly'],['professional','Professional'],['decline','Polite decline']] })], run: async v => result(makeReply(v.topic, v.tone)) },
  { id: 'url', category: 'Trust', icon: '↗', title: 'Inspect a link', desc: 'Reveal the domain and visible URL warning signs.', note: 'This does not visit the site or determine whether it is safe.', fields: [field('link', 'Link to inspect', 'url', { wide: true, required: true, prefill: true })], run: async v => { const d = inspectUrl(v.link); return result(`Domain: ${d.host}\nProtocol: ${d.protocol}\nPath: ${d.path}\n\nVisible signals:\n${d.flags.length ? d.flags.map(x => '• ' + x).join('\n') : 'No visible warning signals detected.'}\n\nA clean URL can still lead to a harmful site.`); } },
  { id: 'clean-link', category: 'Trust', icon: '⌁', title: 'Clean a link', desc: 'Remove common tracking parameters.', fields: [field('link', 'Link to clean', 'url', { wide: true, required: true, prefill: true })], run: async v => result(cleanUrl(v.link)) },
  { id: 'quote', category: 'Trust', icon: '“', title: 'Check a quote', desc: 'Check whether exact words appear in pasted source text.', note: 'Exact match only. A matching quote does not prove a claim is true or fairly represented.', fields: [field('quote', 'Quoted words', 'textarea', { wide: true, required: true }), field('source', 'Source text', 'textarea', { wide: true, required: true })], run: async v => result(verifyQuote(v.quote, v.source) ? 'Exact wording appears in the supplied source. Read the surrounding context before relying on it.' : 'Exact wording was not found in the supplied source. Differences in punctuation or wording may explain this.') },
  { id: 'password', category: 'Trust', icon: '✳', title: 'Password generator', desc: 'Create a strong random password on your device.', fields: [field('length', 'Length (12–64)', 'number', { value: 20, min: 12, max: 64 }), field('symbols', 'Include symbols', 'select', { options: [['yes','Yes'],['no','No']] })], run: async v => { const n = Number(v.length); if (!Number.isInteger(n) || n < 12 || n > 64) throw new Error('Choose 12 to 64 characters.'); const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789' + (v.symbols === 'yes' ? '!@#$%^&*-_+=' : ''); const max = Math.floor(256 / chars.length) * chars.length; let pwd = ''; while (pwd.length < n) { const bytes = crypto.getRandomValues(new Uint8Array(n * 2)); for (const byte of bytes) if (byte < max && pwd.length < n) pwd += chars[byte % chars.length]; } return result(pwd); } },
  { id: 'bill', category: 'Money', icon: '÷', title: 'Split a bill', desc: 'Share a total evenly, with optional tip.', fields: [field('total', 'Bill total', 'number', { step: '0.01', min: 0, required: true }), field('people', 'People', 'number', { value: 2, min: 1, required: true }), field('tip', 'Tip %', 'number', { value: 0, min: 0 })], run: async v => { const d = splitBill(v.total, v.people, v.tip); return result(`Each person: ${d.each.toFixed(2)}\nTotal including tip: ${d.total.toFixed(2)}\nCheck rounding before paying.`); } },
  { id: 'percent', category: 'Money', icon: '%', title: 'Percentage calculator', desc: 'Find a discount, tip, or percentage amount.', fields: [field('value', 'Amount', 'number', { step: 'any', required: true }), field('percent', 'Percent', 'number', { step: 'any', required: true })], run: async v => result(`${v.percent}% of ${v.value} = ${percentOf(v.value, v.percent).toLocaleString(undefined, { maximumFractionDigits: 6 })}`) },
  { id: 'units', category: 'Money', icon: '↔', title: 'Unit converter', desc: 'Convert length, mass, volume, or temperature.', fields: [field('value', 'Value', 'number', { step: 'any', required: true }), field('from', 'From', 'select', { options: [['km','Kilometers'],['mi','Miles'],['m','Meters'],['ft','Feet'],['kg','Kilograms'],['lb','Pounds'],['l','Liters'],['gal','Gallons'],['c','Celsius'],['f','Fahrenheit']] }), field('to', 'To', 'select', { options: [['mi','Miles'],['km','Kilometers'],['ft','Feet'],['m','Meters'],['lb','Pounds'],['kg','Kilograms'],['gal','Gallons'],['l','Liters'],['f','Fahrenheit'],['c','Celsius']] })], run: async v => result(`${v.value} ${v.from} = ${convertUnit(v.value, v.from, v.to).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${v.to}`) },
  { id: 'currency', category: 'Money', icon: '¤', title: 'Currency estimate', desc: 'Convert with a dated reference rate.', note: 'Online: queries ExchangeRate-API. Rates are indicative, not a payment quote.', fields: [field('amount', 'Amount', 'number', { step: 'any', required: true }), field('from', 'From', 'select', { options: [['USD','USD'],['EUR','EUR'],['GBP','GBP'],['NPR','NPR'],['INR','INR'],['JPY','JPY'],['AUD','AUD']] }), field('to', 'To', 'select', { options: [['NPR','NPR'],['USD','USD'],['EUR','EUR'],['GBP','GBP'],['INR','INR'],['JPY','JPY'],['AUD','AUD']] })], run: async v => { const data = await fetchJson(`https://open.er-api.com/v6/latest/${encodeURIComponent(v.from)}`); const rate = data.rates?.[v.to]; if (data.result !== 'success' || !Number.isFinite(rate)) throw new Error('Rate unavailable for this pair.'); return result(`${Number(v.amount).toLocaleString()} ${v.from} ≈ ${(Number(v.amount) * rate).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${v.to}\nRate: ${rate}\nLast updated: ${data.time_last_update_utc ?? 'unknown'}\nProvider: ExchangeRate-API. Check your actual provider rate before paying.`); } },
  { id: 'expense', category: 'Money', icon: '▥', title: 'Expense log', desc: 'Save simple expenses on this device.', fields: [field('description', 'What was it?', 'text', { required: true }), field('amount', 'Amount', 'number', { step: '0.01', min: 0, required: true }), field('currency', 'Currency label', 'text', { value: 'USD' })], run: async v => { if (!Number.isFinite(Number(v.amount)) || Number(v.amount) < 0) throw new Error('Enter a valid amount.'); state.expenses.push({ id: crypto.randomUUID(), description: v.description.trim(), amount: Number(v.amount), currency: v.currency.trim().toUpperCase(), at: new Date().toISOString() }); saveState(); return { html: savedPanel('expenses') }; } },
  { id: 'notes', category: 'Organize', icon: '▤', title: 'Quick notes', desc: 'Capture and find notes stored in this browser.', fields: [field('note', 'Your note', 'textarea', { wide: true, required: true, prefill: true })], run: async v => { state.notes.push({ id: crypto.randomUUID(), text: v.note.trim(), at: new Date().toISOString() }); saveState(); return { html: savedPanel('notes') }; } },
  { id: 'tasks', category: 'Organize', icon: '✓', title: 'Task list', desc: 'Keep your next actions in one place.', fields: [field('task', 'Task', 'text', { required: true, prefill: true })], run: async v => { state.tasks.push({ id: crypto.randomUUID(), text: v.task.trim(), done: false }); saveState(); return { html: savedPanel('tasks') }; } },
  { id: 'reminder', category: 'Organize', icon: '◷', title: 'Due-date reminder', desc: 'Save a due date and download a calendar event.', note: 'Local reminders appear only while this page is open; use the calendar download for device notifications.', fields: [field('title', 'What to remember?', 'text', { required: true, prefill: true }), field('when', 'When', 'datetime-local', { required: true })], run: async v => { const date = new Date(v.when); if (!Number.isFinite(date.getTime()) || date <= new Date()) throw new Error('Choose a future date and time.'); state.reminders.push({ id: crypto.randomUUID(), title: v.title.trim(), when: date.toISOString(), shown: false }); saveState(); const ics = makeIcs(v.title, date, new Date(date.getTime() + 30 * 60_000)); downloadBlob(new Blob([ics], { type: 'text/calendar' }), 'oneday-reminder.ics'); return { html: `<p>Calendar file downloaded. Open it to add device notifications.</p>${savedPanel('reminders')}` }; } },
  { id: 'calendar', category: 'Organize', icon: '▦', title: 'Calendar event', desc: 'Create an .ics event for your calendar app.', fields: [field('title', 'Event title', 'text', { required: true }), field('start', 'Starts', 'datetime-local', { required: true }), field('end', 'Ends', 'datetime-local', { required: true }), field('details', 'Details', 'textarea', { wide: true })], run: async v => { downloadBlob(new Blob([makeIcs(v.title, v.start, v.end, v.details)], { type: 'text/calendar' }), 'oneday-event.ics'); return result('Calendar event downloaded. Open the .ics file in your calendar app to add it.'); } },
  { id: 'image', category: 'Files', icon: '▧', title: 'Compress an image', desc: 'Resize and export a smaller JPEG.', fields: [field('file', 'Image to compress', 'file', { accept: 'image/*', required: true, wide: true }), field('width', 'Maximum width (px)', 'number', { value: 1600, min: 100, max: 6000 }), field('quality', 'JPEG quality 0.1–1', 'number', { value: 0.8, step: 0.1, min: 0.1, max: 1 })], run: async (v, form) => { const file = requireFile(form, 'file'); const bitmap = await createImageBitmap(file); const scale = Math.min(1, Number(v.width) / bitmap.width); const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale)); canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close(); const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', Number(v.quality))); if (!blob) throw new Error('Could not encode this image.'); downloadBlob(blob, file.name.replace(/\.[^.]+$/, '') + '-oneday.jpg'); return result(`Exported ${canvas.width} × ${canvas.height} JPEG. Original ${(file.size / 1024).toFixed(0)} KB; export ${(blob.size / 1024).toFixed(0)} KB.`); } },
  { id: 'pdf-merge', category: 'Files', icon: '▣', title: 'Combine PDFs', desc: 'Join PDFs in the order selected.', note: 'Online library download: pdf-lib loads from a CDN. Your PDFs are processed in this browser.', fields: [field('files', 'Choose 2 or more PDFs', 'file', { accept: 'application/pdf', multiple: true, required: true, wide: true })], run: async (v, form) => { const files = fileList(form, 'files'); if (files.length < 2) throw new Error('Choose at least two PDFs.'); await loadScript('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js'); const merged = await window.PDFLib.PDFDocument.create(); for (const file of files) { const doc = await window.PDFLib.PDFDocument.load(await file.arrayBuffer()); const pages = await merged.copyPages(doc, doc.getPageIndices()); pages.forEach(page => merged.addPage(page)); } const bytes = await merged.save(); downloadBlob(new Blob([bytes], { type: 'application/pdf' }), 'oneday-combined.pdf'); return result(`Combined ${files.length} PDFs into ${merged.getPageCount()} pages. File downloaded.`); } },
  { id: 'pdf-text', category: 'Files', icon: '▤', title: 'Extract PDF text', desc: 'Copy embedded text from a PDF.', note: 'Online library download: PDF.js loads from a CDN. Your PDF is processed in this browser. Scanned PDFs need the image OCR tool.', fields: [field('file', 'PDF file', 'file', { accept: 'application/pdf', required: true, wide: true })], run: async (v, form) => { const pdfjs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs'); pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs'; const pdf = await pdfjs.getDocument({ data: await requireFile(form, 'file').arrayBuffer() }).promise; const pages = []; for (let n = 1; n <= Math.min(pdf.numPages, 100); n++) { const page = await pdf.getPage(n); const content = await page.getTextContent(); pages.push(`PAGE ${n}\n` + content.items.map(x => x.str).join(' ')); } return result(pages.join('\n\n').trim() || 'No embedded text found. Try OCR on page images.'); } },
  { id: 'share-card', category: 'Files', icon: '▣', title: 'Share a text card', desc: 'Turn a short note into a PNG image.', fields: [field('title', 'Heading', 'text', { required: true }), field('body', 'Text to share', 'textarea', { wide: true, required: true, prefill: true })], run: async v => { const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 630; const c = canvas.getContext('2d'); c.fillStyle = '#ecf1e4'; c.fillRect(0, 0, 1200, 630); c.fillStyle = '#253e27'; c.font = 'bold 54px system-ui'; c.fillText(v.title.slice(0, 38), 70, 145); c.font = '32px system-ui'; const words = v.body.split(/\s+/); let line = '', y = 230; for (const word of words) { const next = line ? line + ' ' + word : word; if (c.measureText(next).width > 1050) { c.fillText(line, 70, y); line = word; y += 52; if (y > 510) break; } else line = next; } if (y <= 510) c.fillText(line, 70, y); c.fillStyle = '#648a51'; c.font = 'bold 25px system-ui'; c.fillText('OneDay Open', 70, 580); const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png')); downloadBlob(blob, 'oneday-card.png'); return result('Share card downloaded. Review the image before posting it.'); } }
];

function renderFilters() {
  $('#filters').innerHTML = categories.map(cat => `<button type="button" data-category="${cat}" aria-pressed="${cat === activeCategory}">${cat}</button>`).join('');
}
function renderGrid() {
  const query = $('#toolSearch').value.toLocaleLowerCase().trim();
  const filtered = tools.filter(t => (activeCategory === 'All' || t.category === activeCategory) && `${t.title} ${t.desc} ${t.category}`.toLocaleLowerCase().includes(query));
  $('#toolGrid').innerHTML = filtered.length ? filtered.map(t => `<button type="button" class="tool-card" data-tool="${t.id}"><span class="tool-symbol" aria-hidden="true">${escapeHtml(t.icon)}</span><strong>${escapeHtml(t.title)}</strong><span class="desc">${escapeHtml(t.desc)}</span><small>${escapeHtml(t.category)}${needsOnlineOrBrowser.has(t.id) ? ' · Internet/browser support' : ''}</small></button>`).join('') : '<p>No matching tools. Try a different word.</p>';
}
function renderField(f) {
  const attrs = `${f.required ? ' required' : ''}${f.min !== undefined ? ` min="${f.min}"` : ''}${f.max !== undefined ? ` max="${f.max}"` : ''}${f.step ? ` step="${f.step}"` : ''}${f.accept ? ` accept="${f.accept}"` : ''}${f.multiple ? ' multiple' : ''}`;
  let input;
  if (f.type === 'textarea') input = `<textarea id="f-${f.name}" name="${f.name}"${attrs}></textarea>`;
  else if (f.type === 'select') input = `<select id="f-${f.name}" name="${f.name}">${f.options.map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join('')}</select>`;
  else input = `<input id="f-${f.name}" name="${f.name}" type="${f.type}"${attrs}${f.value !== undefined ? ` value="${escapeHtml(f.value)}"` : ''}>`;
  return `<div class="field${f.wide ? ' wide' : ''}"><label for="f-${f.name}">${escapeHtml(f.label)}</label>${input}</div>`;
}
function openTool(id) {
  const tool = tools.find(t => t.id === id); if (!tool) return;
  activeTool = tool;
  $('#workspaceCategory').textContent = tool.category;
  $('#workspaceTitle').textContent = tool.title;
  $('#workspaceDescription').textContent = tool.desc;
  $('#toolForm').innerHTML = `${tool.note ? `<p class="tool-note">${escapeHtml(tool.note)}</p>` : ''}${tool.fields.map(renderField).join('')}<button class="primary" type="submit">Run ${escapeHtml(tool.title)} →</button>`;
  for (const f of tool.fields) {
    const input = $('#toolForm').elements.namedItem(f.name);
    if (!input || f.type === 'file') continue;
    if (f.prefill && quickText) input.value = f.type === 'url' ? (/^https?:\/\//i.test(quickText) ? quickText.trim() : '') : quickText;
    if (['amount','total'].includes(f.name) && lastAmount) input.value = lastAmount;
    if (['description','title'].includes(f.name) && quickText && ['expense','reminder','share-card'].includes(tool.id)) input.value = quickText.slice(0, 100);
    if (f.name === 'currency' && quickText) { const match = quickText.match(/\b(?:NPR|USD|EUR|GBP|INR|JPY|AUD)\b/i); if (match) input.value = match[0].toUpperCase(); }
  }
  $('#toolResult').hidden = true; $('#workspace').hidden = false;
  if (savedKinds.has(id)) showResult({ html: savedPanel(id) });
  $('#workspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function showResult(output, error = false) {
  const box = $('#toolResult'); box.hidden = false; box.classList.toggle('error', error);
  if (typeof output === 'string') { box.textContent = output; return; }
  if (output.html) box.innerHTML = output.html;
  else box.textContent = output.text || '';
  if (output.copy && !error) {
    const wrap = document.createElement('div'); wrap.className = 'result-actions';
    const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Copy result';
    button.addEventListener('click', async () => { await navigator.clipboard.writeText(output.copy); button.textContent = 'Copied'; });
    wrap.append(button); box.append(wrap);
  }
  if (!error && related[activeTool?.id]) {
    const wrap = document.createElement('div'); wrap.className = 'result-actions';
    for (const id of related[activeTool.id]) { const next = tools.find(t => t.id === id); const button = document.createElement('button'); button.type = 'button'; button.dataset.nextTool = id; button.textContent = `Next: ${next.title} →`; wrap.append(button); }
    box.append(wrap);
  }
}
function checkReminders() {
  let changed = false;
  for (const item of state.reminders) if (!item.shown && new Date(item.when) <= new Date()) { item.shown = true; changed = true; const alertBox = document.createElement('div'); alertBox.className = 'suggestions'; alertBox.setAttribute('role', 'status'); alertBox.textContent = `Reminder: ${item.title}`; $('#suggestions').prepend(alertBox); }
  if (changed) saveState();
}

$('#filters').addEventListener('click', e => { const cat = e.target.closest('[data-category]')?.dataset.category; if (!cat) return; activeCategory = cat; renderFilters(); renderGrid(); });
$('#toolSearch').addEventListener('input', renderGrid);
$('#toolGrid').addEventListener('click', e => { const id = e.target.closest('[data-tool]')?.dataset.tool; if (id) openTool(id); });
$('#quickForm').addEventListener('submit', e => {
  e.preventDefault(); quickText = $('#quickInput').value.trim();
  if (!quickText) { $('#quickInput').focus(); return; }
  const ids = /^https?:\/\//i.test(quickText) ? ['url','clean-link','notes'] : extractDetails(quickText).amounts.length ? ['details','bill','expense','reminder'] : ['summary','details','tidy','notes','tasks'];
  $('#suggestions').innerHTML = `<span class="tool-note">Useful next steps:</span>${ids.map(id => { const t = tools.find(x => x.id === id); return `<button type="button" data-tool="${id}">${escapeHtml(t.title)} →</button>`; }).join('')}`;
});
$('#suggestions').addEventListener('click', e => { const id = e.target.closest('[data-tool]')?.dataset.tool; if (id) openTool(id); });
$('#toolForm').addEventListener('submit', async e => {
  e.preventDefault(); if (!activeTool) return;
  const form = e.currentTarget; const button = form.querySelector('[type=submit]');
  const values = Object.fromEntries(new FormData(form));
  button.disabled = true; button.textContent = 'Working…'; showResult('Working…');
  try {
    const id = activeTool.id;
    const output = await activeTool.run(values, form);
    if (['ocr','pdf-text','transcribe'].includes(id) && output.copy) quickText = output.copy;
    if (id === 'bill') lastAmount = values.total;
    if (id === 'details') { const amount = extractDetails(values.text).amounts[0]?.match(/[\d,.]+/); if (amount) lastAmount = amount[0].replace(/,/g, ''); }
    showResult(output);
  }
  catch (error) { showResult(error instanceof Error ? error.message : 'Something went wrong. Please try again.', true); }
  finally { button.disabled = false; button.textContent = `Run ${activeTool.title} →`; }
});
$('#toolResult').addEventListener('click', e => {
  const next = e.target.closest('[data-next-tool]'); if (next) { openTool(next.dataset.nextTool); return; }
  const toggle = e.target.closest('[data-toggle-task]');
  if (toggle) { const item = state.tasks.find(x => x.id === toggle.dataset.toggleTask); if (item) { item.done = !item.done; saveState(); showResult({ html: savedPanel('tasks') }); } return; }
  const btn = e.target.closest('[data-delete]'); if (!btn) return;
  const arr = state[btn.dataset.delete]; const index = arr.findIndex(x => x.id === btn.dataset.id);
  if (index >= 0) { arr.splice(index, 1); saveState(); showResult({ html: savedPanel(btn.dataset.delete) }); }
});
$('#toolResult').addEventListener('input', e => {
  if (e.target.id !== 'noteSearch') return;
  const query = e.target.value.toLocaleLowerCase().trim();
  for (const row of $('#toolResult').querySelectorAll('.saved-item')) row.hidden = !row.querySelector('span')?.textContent.toLocaleLowerCase().includes(query);
});
$('#closeWorkspace').addEventListener('click', () => { $('#workspace').hidden = true; activeTool = null; $('#tools').scrollIntoView({ behavior: 'smooth' }); });
$('#exportData').addEventListener('click', () => downloadBlob(new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), ...state }, null, 2)], { type: 'application/json' }), 'oneday-data.json'));
$('#clearData').addEventListener('click', () => { if (confirm('Clear all OneDay notes, tasks, reminders, and expenses on this device?')) { localStorage.removeItem(storageKey); for (const key of ['notes','tasks','expenses','reminders']) state[key] = []; alert('Saved data cleared on this device.'); } });
renderFilters(); renderGrid(); checkReminders(); setInterval(checkReminders, 60_000);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
