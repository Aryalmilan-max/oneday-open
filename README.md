# OneDay Open

**One input. Useful next steps.** OneDay Open is a mobile-first, open-source browser workspace for everyday words, links, money, plans, and files. It brings focused actions into one place and lets you move a result to a related action. There is no account requirement for the core tools.

> Public beta, v0.1.0. This is a real tool collection, not a general AI assistant. Some actions require a network connection or browser support, and none should be treated as professional advice or a guarantee of safety.

## Try it

Open **[the live app](https://aryalmilan-max.github.io/oneday-open/)** or run locally:

```sh
git clone https://github.com/Aryalmilan-max/oneday-open.git
cd oneday-open
python3 -m http.server 8000
```

Visit `http://localhost:8000`. A local server is needed for modules and the service worker.

### Three quick examples

1. Paste a message that contains an amount. Choose **Find key details → Split a bill → Expense log**.
2. Paste a URL. Choose **Inspect a link → Clean a link → Quick notes**.
3. Scan an image or extract PDF text, then choose **Quick summary** or **Translate text**.

The home input suggests actions. Every tool also works on its own.

## 27 actions in one repository

| Area | Actions |
| --- | --- |
| Understand | Quick summary, reading stats, find key details, compare text, translate text, scan image text, voice to text, read aloud |
| Communicate | Clean up text, reply starter |
| Trust | Inspect a link, clean a link, check a quote, password generator |
| Money | Split a bill, percentage calculator, unit converter, currency estimate, expense log |
| Organize | Quick notes, task list, due-date reminder, calendar event |
| Files | Compress an image, combine PDFs, extract PDF text, share a text card |

The summary is extractive, the reply starter uses editable templates, link inspection checks visible URL signals, and quote checking searches exact words in text supplied by the user. They do not claim to understand or verify everything. The due-date reminder is visible only while the page is open; it also downloads an `.ics` calendar file so your calendar app can handle notifications.

## Privacy and external services

Most actions run in the browser. Notes, tasks, expenses, and reminders use this browser's `localStorage`; use **Export my saved data** to keep a copy. Browser storage is not encrypted. OneDay does not have a user account, analytics, or a server collecting your inputs.

The following actions have explicit online dependencies:

| Action | What happens |
| --- | --- |
| Translate text | Sends the entered text to [MyMemory](https://mymemory.translated.net/doc/spec.php). Do not submit secrets or sensitive text. |
| Currency estimate | Requests a dated reference rate from [ExchangeRate-API](https://www.exchangerate-api.com/docs/free). It is not a payment quote. |
| Scan image text | Downloads [Tesseract.js](https://github.com/naptha/tesseract.js) and language data; image processing stays in the browser. |
| Combine PDFs | Downloads [pdf-lib](https://pdf-lib.js.org/); PDFs stay in the browser. |
| Extract PDF text | Downloads [PDF.js](https://mozilla.github.io/pdf.js/); PDF processing stays in the browser. |
| Voice to text | Uses the browser's speech recognition, which may process audio through a browser vendor. |

See [PRIVACY.md](PRIVACY.md) for details and limits.

## Why one repo?

OneDay has a shared input and a shared result flow. The same text can become a summary, note, task, calendar event, or share card. The code is intentionally buildless HTML, CSS, and JavaScript so anyone can inspect, fork, and host it without a paid service. The service worker caches first-party app files for offline use after the first visit. Online-dependent actions still need connectivity.

## Test and contribute

```sh
npm run check
```

Node.js 20+ is needed only for checks, not for running the app. See [CONTRIBUTING.md](CONTRIBUTING.md) and [ROADMAP.md](ROADMAP.md). Security issues should follow [SECURITY.md](SECURITY.md).

## Adoption

Stars are welcome, but the useful signals are people completing real tasks, returning, reporting bugs, and contributing translations or improvements. There is no claim that publication will reach a particular number of users.

MIT licensed. See [LICENSE](LICENSE).
