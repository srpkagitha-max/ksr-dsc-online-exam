KSR EXAMOS PWA VERSION

UPLOAD ALL FILES IN THIS FOLDER TO THE GITHUB REPOSITORY ROOT.

New PWA files:
- manifest.json
- service-worker.js
- pwa-register.js
- icon-192.png
- icon-512.png
- offline.html

Important:
- Firebase/API data is never cached by the service worker.
- HTML and JavaScript use network-first loading to avoid old-code cache problems.
- Exam login, answers and result submission still require internet.
- The old nested ZIP was removed to avoid confusion.

After GitHub Pages deployment:
1. Open the website in Chrome.
2. Menu (three dots) > Install app / Add to Home screen.
3. App name: KSR EXAMOS.
