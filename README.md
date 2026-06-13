# 🕵️ The Imposter

A **pass-and-play party game** of secret words, bluffing, and deduction — like
Spyfall meets Among Us, built as a fast, polished, offline-capable web app.

Everyone gets the same secret word… except the **imposter(s)**, who must fake it.
Players take turns dropping one-word clues, then vote on who the faker is.

> One device, 3–12 players, no internet required after first load.

## ✨ Features

- **Pass-and-play reveal** — animated flip cards so each player privately sees
  their role; the device gets passed around the table.
- **Configurable rounds** — 3–12 players, 1+ imposters, optional custom names.
- **10 word packs** — Food, Animals, Places, Movies & TV, Sports, Objects, Jobs,
  Technology, Nature, Spooky — mix and match.
- **Three imposter difficulties** — *Blind* (knows nothing), *Category* (knows the
  topic), or *Hint* (gets a clue).
- **Discussion timer** — animated countdown ring with pause/resume, or turn it off.
- **Turn order** — a randomised speaking order is generated each round.
- **Voting + reveal** — tally votes, eject the most-suspected player, with ties
  handled. A caught imposter gets a **last-chance word guess** to steal the win.
- **Cumulative scoreboard** — play multiple rounds, crown a winner, with medals
  and confetti.
- **Procedural sound effects** (WebAudio, mutable) and a **dark neon UI** with
  animated backdrop and confetti.
- **PWA / offline** — installable, works without a network connection.
- **Zero dependencies** — plain HTML/CSS/JS. No build step.

## ▶️ Play it

Because the app uses regular (non-module) scripts, you can simply **open
`index.html`** in any modern browser — no server needed.

To run it as a local server (recommended for the PWA / service worker):

```bash
npm start          # serves on http://localhost:5173 via `npx serve`
# or, with Python:
npm run dev        # python3 -m http.server 5173
```

Then open <http://localhost:5173>. On a phone, "Add to Home Screen" to install it.

### 📄 Single-file build (great for phones / sharing)

```bash
npm run build      # produces imposter-standalone.html
```

`imposter-standalone.html` inlines all CSS and JS into one file with **zero
dependencies** — just open it directly in any browser (including mobile, offline).
Download it to your phone and tap to play; no server required.

## 🎮 How to play

1. **Setup** — choose player count, number of imposters, word packs, imposter
   difficulty, and an optional discussion timer.
2. **Reveal** — pass the device around. Crew see the secret word; imposters see
   their role (and a hint, depending on difficulty). Tap to flip, then pass.
3. **Discuss** — in the shown turn order, each player says **one word** related to
   the secret. Crew prove they know it without making it obvious; imposters bluff.
4. **Vote** — tally votes for the suspected imposter.
5. **Results** — the most-voted player is ejected (a tie ejects nobody):
   - Eject an imposter → **crew +1 each**; the caught imposter may guess the word
     for a **+2 steal**.
   - Imposter survives → **each imposter +2**.
6. **Repeat** — play more rounds; scores accumulate. Highest total wins. 🏆

## 🗂️ Project structure

```
index.html        # app shell
css/styles.css    # dark neon theme, animations
js/data.js        # word packs (categories + words + hints)
js/audio.js       # procedural WebAudio sound engine
js/game.js        # screen state machine + game logic
manifest.json     # PWA manifest
sw.js             # service worker (offline cache)
icon.svg          # app icon
```

## ➕ Adding word packs

Edit `js/data.js` and add a category object to `GAME_DATA.categories`:

```js
{
  id: "music",
  name: "Music",
  icon: "🎸",
  words: [
    { word: "Guitar", hint: "Strings" },
    // ...
  ],
}
```

`hint` is optional and shown to the imposter only in *Hint* difficulty.

## License

MIT
