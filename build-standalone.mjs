// build-standalone.mjs - bundles the app into a single self-contained HTML file.
// Inlines CSS + all JS so the result runs from file:// with no server or network.
// Usage: node build-standalone.mjs  (or: npm run build)
import { readFileSync, writeFileSync } from "node:fs";

const css = readFileSync("css/styles.css", "utf8");
const data = readFileSync("js/data.js", "utf8");
const audio = readFileSync("js/audio.js", "utf8");
const game = readFileSync("js/game.js", "utf8");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no" />
  <meta name="theme-color" content="#f3ece2" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="default" />
  <title>The Imposter - Party Game</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..700;1,9..144,400..600&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <style>
${css}
  </style>
</head>
<body>
  <div class="backdrop" aria-hidden="true">
    <div class="grain"></div>
  </div>
  <header class="topbar">
    <button class="icon-btn" id="backBtn" aria-label="Back" hidden>‹</button>
    <div class="brand" id="brandHome" role="button" tabindex="0">
      <span class="brand-mark"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.6 15.6 21 21"/></svg></span>
      <span class="brand-text">The&nbsp;Imposter</span>
    </div>
    <button class="icon-btn" id="muteBtn" aria-label="Toggle sound"></button>
  </header>
  <main id="app" class="app"></main>
  <div id="toast" class="toast" role="status" aria-live="polite"></div>
  <script>
${data}
  </script>
  <script>
${audio}
  </script>
  <script>
${game}
  </script>
</body>
</html>
`;

writeFileSync("imposter-standalone.html", html);
console.log(`Wrote imposter-standalone.html (${(html.length / 1024).toFixed(1)} KB)`);
