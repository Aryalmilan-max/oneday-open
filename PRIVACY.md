# Privacy and data handling

OneDay Open is a static browser app. It has no OneDay account service, analytics script, or backend receiving your inputs.

The conversation guide uses rules in your browser. Its messages are not saved to `localStorage`; they disappear when you reload the page or choose **New conversation**. A task, note, expense, or reminder is stored only when you choose an action that saves it.

## Data stored on this device

Notes, tasks, expenses, and reminders are stored in the browser's `localStorage` for this site. This storage is not encrypted. Anyone with access to the same browser profile may be able to see it. Use **Export my saved data** to download a JSON copy, or **Clear saved data** to remove these records from this browser. Browser clearing or private mode can also remove them.

The service worker caches first-party app code for faster loading and basic offline use. It does not sync personal records.

## Online actions

Only these selected actions contact services outside the site:

- **Translate text:** entered text is sent to the MyMemory translation API. Avoid private or sensitive content.
- **Currency estimate:** the base currency code is sent to ExchangeRate-API. The amount is calculated in the browser.
- **Scan image text:** Tesseract.js code and trained language data are downloaded from a CDN; OCR runs in the browser.
- **Combine PDFs and extract PDF text:** pdf-lib and PDF.js code load from a CDN; selected files are processed in the browser.
- **Voice to text:** browser speech recognition may send microphone audio to a browser vendor depending on the browser.

The guide's **Speak** button has the same browser speech-recognition limitation. It fills the message box for you to review before sending it to the local guide.

The browser still contacts the host of this site to load the application. If you use GitHub Pages, GitHub's hosting policies apply. If you self-host, your host's policies apply.

## Limits

OneDay's link inspector does not visit or certify a website. Quote matching does not validate whether a claim is true. Summaries, OCR, speech recognition, and translation can be wrong. Currency rates are indicative and timestamped. Use the original source and a qualified professional for important decisions.
