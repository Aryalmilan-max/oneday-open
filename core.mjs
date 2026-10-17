export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

export function textStats(text) {
  const words = text.trim().match(/\S+/g) ?? [];
  return { characters: text.length, words: words.length, sentences: (text.match(/[.!?]+(?=\s|$)/g) ?? []).length, minutes: Math.max(1, Math.ceil(words.length / 200)) };
}

export function summarize(text, count = 3) {
  const sentences = text.match(/[^.!?\n]+[.!?]?/g)?.map(s => s.trim()).filter(Boolean) ?? [];
  if (sentences.length <= count) return sentences.join(' ');
  const stop = new Set('the a an and or but to of in on for with is are was were it this that as at by from you your we they i be have has had not'.split(' '));
  const freq = new Map();
  for (const word of text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []) if (!stop.has(word)) freq.set(word, (freq.get(word) ?? 0) + 1);
  const ranked = sentences.map((sentence, index) => ({ index, sentence, score: (sentence.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []).reduce((n, word) => n + (freq.get(word) ?? 0), 0) / Math.max(5, sentence.length / 15) }));
  return ranked.sort((a, b) => b.score - a.score).slice(0, count).sort((a, b) => a.index - b.index).map(x => x.sentence).join(' ');
}

export function extractDetails(text) {
  const unique = regex => [...new Set(text.match(regex) ?? [])];
  return {
    emails: unique(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi),
    links: unique(/https?:\/\/[^\s<>"']+/gi),
    dates: unique(/\b(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\b/g),
    amounts: unique(/(?:[$€£₹₨]|\b(?:USD|EUR|GBP|NPR|INR)\s?)\s?\d[\d,.]*/gi)
  };
}

export function compareLines(before, after) {
  const left = before.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const right = after.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const lset = new Set(left), rset = new Set(right);
  return { removed: left.filter(x => !rset.has(x)), added: right.filter(x => !lset.has(x)) };
}

export function inspectUrl(value) {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Enter an HTTP or HTTPS link.');
  const host = url.hostname.toLowerCase();
  const flags = [];
  if (url.protocol !== 'https:') flags.push('Connection is not HTTPS.');
  if (url.username || url.password) flags.push('Link contains a username or password.');
  if (host.startsWith('xn--') || host.includes('.xn--')) flags.push('Domain uses internationalized encoding; check its spelling.');
  if (/\d+\.\d+\.\d+\.\d+/.test(host)) flags.push('Link uses an IP address rather than a named domain.');
  if (url.port && !['80', '443'].includes(url.port)) flags.push('Link uses an unusual port.');
  const trackers = [...url.searchParams.keys()].filter(key => /^(utm_|fbclid$|gclid$|mc_|igshid$|si$)/i.test(key));
  if (trackers.length) flags.push(`Tracking parameters: ${trackers.join(', ')}.`);
  return { host, protocol: url.protocol, path: url.pathname, flags, parsed: url };
}

export function cleanUrl(value) {
  const { parsed } = inspectUrl(value);
  for (const key of [...parsed.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$|mc_|igshid$|si$)/i.test(key)) parsed.searchParams.delete(key);
  return parsed.toString();
}

export function verifyQuote(quote, source) {
  const norm = value => value.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
  const q = norm(quote), s = norm(source);
  if (!q) throw new Error('Enter a quote to check.');
  return s.includes(q);
}

export function splitBill(total, people, tipPercent = 0) {
  const amount = Number(total), count = Number(people), tip = Number(tipPercent);
  if (!Number.isFinite(amount) || amount < 0 || !Number.isInteger(count) || count < 1 || !Number.isFinite(tip) || tip < 0 || tip > 1000) throw new Error('Enter a valid total, number of people, and tip.');
  const grandTotal = Math.round((amount + amount * tip / 100) * 100) / 100;
  return { total: grandTotal, each: Math.round(grandTotal / count * 100) / 100 };
}

export function percentOf(value, percent) {
  const n = Number(value), p = Number(percent);
  if (!Number.isFinite(n) || !Number.isFinite(p)) throw new Error('Enter valid numbers.');
  return n * p / 100;
}

const factors = {
  length: { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, mi: 1609.344 },
  mass: { g: 0.001, kg: 1, oz: 0.028349523125, lb: 0.45359237 },
  volume: { ml: 0.001, l: 1, cup: 0.2365882365, gal: 3.785411784 }
};
export const unitGroups = factors;
export function convertUnit(value, from, to) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error('Enter a valid number.');
  if (from === 'c' && to === 'f') return n * 9 / 5 + 32;
  if (from === 'f' && to === 'c') return (n - 32) * 5 / 9;
  for (const group of Object.values(factors)) if (from in group && to in group) return n * group[from] / group[to];
  throw new Error('Choose compatible units.');
}

export function tidyText(text) {
  return text.split(/\r?\n/).map(line => line.trim().replace(/[ \t]+/g, ' ')).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function makeReply(topic, tone) {
  const clean = tidyText(topic).replace(/[.!?]+$/, '');
  if (!clean) throw new Error('Describe what you want to reply about.');
  const templates = {
    friendly: `Hi, thanks for your message about ${clean}. I’ll take a look and get back to you soon.`,
    professional: `Thank you for your message regarding ${clean}. I will review it and follow up with you.`,
    decline: `Thank you for thinking of me regarding ${clean}. I’m unable to take this on right now, but I appreciate the invitation.`
  };
  return templates[tone] ?? templates.friendly;
}

export function makeIcs(title, start, end, details = '') {
  const toIcs = value => {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) throw new Error('Enter valid start and end times.');
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  };
  if (!title.trim()) throw new Error('Enter an event title.');
  if (new Date(end) <= new Date(start)) throw new Error('End time must be after start time.');
  const safe = value => value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//OneDay Open//EN\r\nBEGIN:VEVENT\r\nUID:${crypto.randomUUID()}@oneday-open\r\nDTSTAMP:${toIcs(new Date())}\r\nDTSTART:${toIcs(start)}\r\nDTEND:${toIcs(end)}\r\nSUMMARY:${safe(title)}\r\nDESCRIPTION:${safe(details)}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
}
