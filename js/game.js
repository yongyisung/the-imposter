/* =========================================================================
   game.js - The Imposter (pass-and-play party game)

   A self-contained single-page app. No build step, no framework: it renders
   screens into #app with a tiny hyperscript helper and a screen state machine.

   Flow:  home → setup → reveal → discuss → vote → results → scoreboard
   ========================================================================= */
(() => {
  "use strict";

  /* ---------- tiny DOM helper (hyperscript) ---------- */
  function h(tag, props, ...kids) {
    const e = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === "class") e.className = v;
        else if (k === "html") e.innerHTML = v;
        else if (k === "dataset") Object.assign(e.dataset, v);
        else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k in e && k !== "list") { try { e[k] = v; } catch { e.setAttribute(k, v); } }
        else e.setAttribute(k, v);
      }
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return e;
  }

  /* ---------- utilities ---------- */
  const rand = (n) => Math.floor(Math.random() * n);
  const pick = (arr) => arr[rand(arr.length)];
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = rand(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  /* ---------- avatars (warm, muted palette - [bg, ink]) ---------- */
  const AVATARS = [
    ["#ffe2e0", "#c0392b"], // coral
    ["#e4f1ec", "#0f7a63"], // teal
    ["#fbebd2", "#b5791b"], // amber
    ["#e9e6f5", "#5a4b9e"], // plum
    ["#e2eef6", "#2c6e9b"], // sky
    ["#efe9e0", "#6b6258"], // stone
    ["#f6e6ec", "#a23a66"], // rose
    ["#e7f0e2", "#4e7a35"], // sage
  ];
  const avatarColors = (i) => AVATARS[i % AVATARS.length];
  const initials = (nm) =>
    (nm || "").trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "?";

  /* ---------- inline SVG icons (no emoji) ---------- */
  const ICON = {
    mark: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.6 15.6 21 21"/></svg>',
    soundOn: '<svg class="ico" viewBox="0 0 24 24" fill="currentColor"><path d="M4 9.5v5h3.3L12 18.6V5.4L7.3 9.5H4z"/><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M15.6 9a4 4 0 0 1 0 6M18.2 6.6a7.5 7.5 0 0 1 0 10.8"/></svg>',
    soundOff: '<svg class="ico" viewBox="0 0 24 24" fill="currentColor"><path d="M4 9.5v5h3.3L12 18.6V5.4L7.3 9.5H4z"/><path fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" d="m16 9.6 5 4.8M21 9.6l-5 4.8"/></svg>',
  };

  /* ---------- persistence ---------- */
  const LS = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  /* ---------- global state ---------- */
  const DEFAULT_SETTINGS = {
    numPlayers: 4,
    numImposters: 1,
    categories: GAME_DATA.categories.map((c) => c.id), // all selected by default
    imposterMode: "category", // 'blind' | 'category' | 'hint'
    timerMinutes: 2,           // 0 = off
    names: [],
  };

  const state = {
    settings: { ...DEFAULT_SETTINGS, ...LS.get("imposter.settings", {}) },
    scores: {},        // name -> points (cumulative across rounds)
    round: 0,
    inGame: false,
    // per-round:
    players: [],       // [{name, role:'crew'|'imposter'}]
    secret: null,      // {word, hint, category}
    turnOrder: [],     // indices into players
    votes: {},         // index -> count
  };

  // Normalise persisted settings (categories may reference removed ids).
  state.settings.categories = state.settings.categories.filter((id) =>
    GAME_DATA.categories.some((c) => c.id === id));
  if (state.settings.categories.length === 0) state.settings.categories = DEFAULT_SETTINGS.categories.slice();

  /* ---------- mount points ---------- */
  const app = document.getElementById("app");
  const backBtn = document.getElementById("backBtn");
  const muteBtn = document.getElementById("muteBtn");
  const toastEl = document.getElementById("toast");

  /* ---------- sound / mute ---------- */
  let muted = LS.get("imposter.muted", false);
  SFX.setMuted(muted);
  const syncMute = () => { muteBtn.innerHTML = muted ? ICON.soundOff : ICON.soundOn; };
  syncMute();
  muteBtn.addEventListener("click", () => {
    muted = !muted; SFX.setMuted(muted); LS.set("imposter.muted", muted);
    if (!muted) SFX.tap();
    syncMute();
  });
  // Unlock audio on first interaction.
  document.addEventListener("pointerdown", () => SFX.unlock(), { once: true });

  /* ---------- toast ---------- */
  let toastT;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.remove("show"), 2200);
  }

  /* ---------- confetti ---------- */
  function confetti(count = 90) {
    const wrap = h("div", { class: "confetti" });
    const colors = ["#f5287b", "#0fb29b", "#ff6b35", "#f0a830", "#7c5cff"];
    for (let i = 0; i < count; i++) {
      const c = h("i");
      c.style.left = Math.random() * 100 + "vw";
      c.style.background = pick(colors);
      c.style.animationDuration = 2 + Math.random() * 2 + "s";
      c.style.animationDelay = Math.random() * 0.6 + "s";
      c.style.transform = `rotate(${rand(360)}deg)`;
      wrap.append(c);
    }
    document.body.append(wrap);
    setTimeout(() => wrap.remove(), 4200);
  }

  /* ---------- navigation ---------- */
  let current = "home";
  let cleanup = null; // teardown for screen-scoped timers/listeners

  function go(screen, opts) {
    if (cleanup) { cleanup(); cleanup = null; }
    current = screen;
    SFX.nav();
    render(screen, opts);
  }

  backBtn.addEventListener("click", () => {
    SFX.tap();
    if (backHandlers[current]) backHandlers[current]();
  });
  const backHandlers = {
    setup: () => go("home"),
    howto: () => go("home"),
    reveal: () => { if (revealView === "card") go("reveal", { view: "roster" }); else confirmAbort(); },
    discuss: () => go("reveal", { view: "roster" }),
    vote: () => go("discuss"),
    results: () => {},
  };
  function setBack(show) { backBtn.hidden = !show; }

  document.getElementById("brandHome").addEventListener("click", () => {
    if (state.inGame && current !== "home" && current !== "scoreboard") {
      if (!confirm("Leave the current game? Scores will be lost.")) return;
    }
    state.inGame = false;
    go("home");
  });

  function confirmAbort() {
    if (confirm("Abandon this round and return to setup?")) { state.inGame = false; go("setup"); }
  }

  /* =======================================================================
     SCREEN: HOME
     ===================================================================== */
  function renderHome() {
    setBack(false);
    const hasScores = Object.keys(state.scores).length > 0;
    return h("div", { class: "screen center" },
      h("div", { class: "home-hero" },
        h("div", { class: "home-logo", html: ICON.mark }),
        h("h1", { class: "home-title", html: "<span class=\"the\">The</span><span class=\"em\">Imposter</span>" }),
        h("p", { class: "subtitle" }, "Everyone gets the secret word - except the imposter. Drop clues, sniff out the faker, and don't blow your cover."),
      ),
      h("div", { class: "stack" },
        h("button", { class: "btn", onClick: () => go("setup") }, "New game"),
        hasScores && h("button", { class: "btn secondary", onClick: () => go("scoreboard") }, "Scoreboard"),
        h("button", { class: "btn ghost", onClick: () => go("howto") }, "How to play"),
      ),
      h("p", { class: "muted center", style: "margin-top:28px;font-size:13px;font-weight:600" },
        GAME_DATA.categories.length + " word packs · pass-and-play · 3–12 players"),
    );
  }

  /* =======================================================================
     SCREEN: HOW TO PLAY
     ===================================================================== */
  function renderHowto() {
    setBack(true);
    return h("div", { class: "screen" },
      h("p", { class: "eyebrow" }, "How to play"),
      h("h2", { class: "title", style: "font-size:32px" }, "Bluff. Deduce. Survive."),
      h("div", { class: "panel" },
        h("h3", null, "The setup"),
        h("ul", { class: "list" },
          h("li", null, h("b", null, "Crew"), " members all see the same ", h("b", null, "secret word"), "."),
          h("li", null, "One or more ", h("b", null, "imposters"), " do not - they must fake it."),
          h("li", null, "Pass the device around so each player privately sees their card."),
        )),
      h("div", { class: "panel" },
        h("h3", null, "The round"),
        h("ul", { class: "list" },
          h("li", null, "Going in turn order, everyone says ", h("b", null, "one word"), " related to the secret word."),
          h("li", null, "Crew: prove you know it - but don't be so obvious the imposter guesses it."),
          h("li", null, "Imposter: blend in. Stay vague, then steal a real clue and echo it."),
        )),
      h("div", { class: "panel" },
        h("h3", null, "The vote"),
        h("ul", { class: "list" },
          h("li", null, "Discuss, then vote for who you think is the imposter."),
          h("li", null, "Most votes gets ejected. A tie means nobody is ejected."),
        )),
      h("div", { class: "panel" },
        h("h3", null, "Scoring"),
        h("ul", { class: "list" },
          h("li", null, "Eject an imposter → every ", h("b", null, "crew"), " member scores ", h("b", null, "+1"), "."),
          h("li", null, "Caught imposter gets one guess at the word - nail it for a ", h("b", null, "+2"), " steal."),
          h("li", null, "Imposter survives (wrong eject or tie) → each ", h("b", null, "imposter"), " scores ", h("b", null, "+2"), "."),
        )),
      h("button", { class: "btn", style: "margin-top:8px", onClick: () => go("setup") }, "Let's play"),
    );
  }

  /* =======================================================================
     SCREEN: SETUP
     ===================================================================== */
  function maxImposters(n) { return Math.max(1, n - 2); } // keep at least 2 crew

  function renderSetup() {
    setBack(true);
    const s = state.settings;
    s.numPlayers = clamp(s.numPlayers, 3, 12);
    s.numImposters = clamp(s.numImposters, 1, maxImposters(s.numPlayers));

    const screen = h("div", { class: "screen" });

    // --- Players ---
    const playersStepperVal = h("span", { class: "value" }, s.numPlayers);
    const impStepperVal = h("span", { class: "value" }, s.numImposters);

    function refreshNumbers() {
      playersStepperVal.textContent = s.numPlayers;
      impStepperVal.textContent = s.numImposters;
      impMinus.disabled = s.numImposters <= 1;
      impPlus.disabled = s.numImposters >= maxImposters(s.numPlayers);
      pMinus.disabled = s.numPlayers <= 3;
      pPlus.disabled = s.numPlayers >= 12;
      renderNameInputs();
    }

    const pMinus = h("button", { onClick: () => { s.numPlayers = clamp(s.numPlayers - 1, 3, 12); s.numImposters = clamp(s.numImposters, 1, maxImposters(s.numPlayers)); SFX.tap(); refreshNumbers(); } }, "–");
    const pPlus = h("button", { onClick: () => { s.numPlayers = clamp(s.numPlayers + 1, 3, 12); SFX.tap(); refreshNumbers(); } }, "+");
    const impMinus = h("button", { onClick: () => { s.numImposters = clamp(s.numImposters - 1, 1, maxImposters(s.numPlayers)); SFX.tap(); refreshNumbers(); } }, "–");
    const impPlus = h("button", { onClick: () => { s.numImposters = clamp(s.numImposters + 1, 1, maxImposters(s.numPlayers)); SFX.tap(); refreshNumbers(); } }, "+");

    const playersPanel = h("div", { class: "panel" },
      h("div", { class: "field" },
        h("div", null, h("div", { class: "label" }, "Players"), h("div", { class: "hint" }, "3 to 12")),
        h("div", { class: "stepper" }, pMinus, playersStepperVal, pPlus)),
      h("div", { class: "field" },
        h("div", null, h("div", { class: "label" }, "Imposters"), h("div", { class: "hint" }, "the fakers")),
        h("div", { class: "stepper" }, impMinus, impStepperVal, impPlus)),
    );

    // --- Names (optional) ---
    const namesList = h("div", { class: "players-list" });
    function renderNameInputs() {
      namesList.innerHTML = "";
      for (let i = 0; i < s.numPlayers; i++) {
        const input = h("input", {
          type: "text", maxlength: 16, placeholder: "Player " + (i + 1),
          value: s.names[i] || "",
          oninput: (e) => { s.names[i] = e.target.value; },
        });
        namesList.append(h("div", { class: "player-input" },
          h("div", { class: "num" }, i + 1), input));
      }
    }
    const namesPanel = h("div", { class: "panel" },
      h("h3", null, "Player names ", h("span", { class: "muted", style: "font-weight:500;font-size:13px" }, "(optional)")),
      namesList);

    // --- Categories ---
    const chips = h("div", { class: "chips" });
    GAME_DATA.categories.forEach((c, ci) => {
      const on = s.categories.includes(c.id);
      const chip = h("div", { class: "chip" + (on ? " on" : ""), dataset: { id: c.id } },
        h("span", { class: "dot", style: `background:${avatarColors(ci)[1]}` }),
        h("span", { class: "name" }, c.name),
        h("span", { class: "tick" }, "✓"));
      chip.addEventListener("click", () => {
        SFX.tap();
        const idx = s.categories.indexOf(c.id);
        if (idx >= 0) {
          if (s.categories.length === 1) { toast("Pick at least one pack"); return; }
          s.categories.splice(idx, 1); chip.classList.remove("on");
        } else { s.categories.push(c.id); chip.classList.add("on"); }
      });
      chips.append(chip);
    });
    const catPanel = h("div", { class: "panel" },
      h("h3", null, "Word packs"),
      h("div", { class: "badge-row", style: "margin-bottom:12px" },
        h("button", { class: "btn ghost small", onClick: () => { s.categories = GAME_DATA.categories.map((c) => c.id); SFX.tap(); reSelectChips(); } }, "Select all"),
      ),
      chips);
    function reSelectChips() {
      chips.querySelectorAll(".chip").forEach((ch) => ch.classList.toggle("on", s.categories.includes(ch.dataset.id)));
    }

    // --- Imposter difficulty ---
    const modes = [["blind", "Blind", "knows nothing"], ["category", "Category", "knows the topic"], ["hint", "Hint", "gets a clue"]];
    const seg = h("div", { class: "segmented" });
    modes.forEach(([val, label]) => {
      const b = h("button", { class: s.imposterMode === val ? "on" : "" }, label);
      b.addEventListener("click", () => { s.imposterMode = val; SFX.tap(); seg.querySelectorAll("button").forEach((x, i) => x.classList.toggle("on", modes[i][0] === val)); modeHint.textContent = modes.find((m) => m[0] === val)[2]; });
      seg.append(b);
    });
    const modeHint = h("div", { class: "hint", style: "margin-top:8px" }, modes.find((m) => m[0] === s.imposterMode)[2]);
    const modePanel = h("div", { class: "panel" },
      h("h3", null, "What the imposter sees"), seg, modeHint);

    // --- Timer ---
    const timerVal = h("span", { class: "value" }, s.timerMinutes === 0 ? "Off" : s.timerMinutes + "m");
    const tMinus = h("button", { onClick: () => { s.timerMinutes = clamp(s.timerMinutes - 1, 0, 9); SFX.tap(); timerVal.textContent = s.timerMinutes === 0 ? "Off" : s.timerMinutes + "m"; } }, "–");
    const tPlus = h("button", { onClick: () => { s.timerMinutes = clamp(s.timerMinutes + 1, 0, 9); SFX.tap(); timerVal.textContent = s.timerMinutes + "m"; } }, "+");
    const timerPanel = h("div", { class: "panel" },
      h("div", { class: "field", style: "padding:0" },
        h("div", null, h("div", { class: "label" }, "Discussion timer"), h("div", { class: "hint" }, "0 turns it off")),
        h("div", { class: "stepper" }, tMinus, timerVal, tPlus)));

    const startBtn = h("button", { class: "btn", style: "margin-top:4px", onClick: startGame }, "Start game");

    screen.append(
      h("p", { class: "eyebrow" }, "Game setup"),
      h("h2", { class: "title", style: "font-size:30px" }, "Set up your round"),
      playersPanel, namesPanel, catPanel, modePanel, timerPanel, startBtn,
    );

    renderNameInputs();
    refreshNumbers();
    return screen;
  }

  /* =======================================================================
     GAME - assignment & round lifecycle
     ===================================================================== */
  function startGame() {
    LS.set("imposter.settings", state.settings);
    state.scores = {};
    state.round = 0;
    state.inGame = true;
    SFX.reveal();
    nextRound();
  }

  function nextRound() {
    const s = state.settings;
    state.round += 1;

    // Build player list with names.
    const names = [];
    for (let i = 0; i < s.numPlayers; i++) {
      const nm = (s.names[i] || "").trim() || "Player " + (i + 1);
      names.push(nm);
    }
    // Ensure unique score keys even if names duplicate.
    const seen = {};
    const uniqueNames = names.map((nm) => {
      if (seen[nm]) { seen[nm]++; return nm + " (" + seen[nm] + ")"; }
      seen[nm] = 1; return nm;
    });
    if (state.round === 1) uniqueNames.forEach((nm) => { state.scores[nm] = 0; });

    // Pick the secret word from a random selected category.
    const cats = GAME_DATA.categories.filter((c) => s.categories.includes(c.id));
    const cat = pick(cats);
    const w = pick(cat.words);
    state.secret = { word: w.word, hint: w.hint || cat.name, category: cat.name, icon: cat.icon };

    // Assign roles.
    const impCount = clamp(s.numImposters, 1, maxImposters(s.numPlayers));
    const order = shuffle([...Array(s.numPlayers).keys()]);
    const impSet = new Set(order.slice(0, impCount));
    state.players = uniqueNames.map((nm, i) => ({ name: nm, role: impSet.has(i) ? "imposter" : "crew" }));

    // Suggested opener for discussion (a gentle nudge, not a dictated order).
    state.turnOrder = shuffle([...Array(s.numPlayers).keys()]);

    // Track who has privately viewed their card (self-serve, any order).
    state.revealed = new Set();

    // Reset votes.
    state.votes = {};
    state.players.forEach((_, i) => (state.votes[i] = 0));

    go("reveal", { view: "roster" });
  }

  /* =======================================================================
     SCREEN: REVEAL (self-serve pass-and-play)

     A roster lists every player by full name. Each person taps their OWN name -
     in any order - to privately reveal their card, then returns to the list,
     which marks them "Seen". Discussion unlocks once everyone has revealed.
     ===================================================================== */
  let revealView = "roster"; // tracked so the back button knows where to go

  function renderReveal(opts) {
    revealView = opts.view || "roster";
    return revealView === "card" ? renderRevealCard(opts.idx) : renderRevealRoster();
  }

  function renderRevealRoster() {
    setBack(true);
    const total = state.players.length;
    const done = state.revealed.size;
    const allDone = done === total;
    const left = total - done;

    const fill = h("span", { class: "reveal-fill", style: `width:${Math.round((done / total) * 100)}%` });

    const roster = h("div", { class: "roster" });
    state.players.forEach((p, i) => {
      const seen = state.revealed.has(i);
      const [bg, ink] = avatarColors(i);
      const item = h("button", { class: "roster-item" + (seen ? " done" : ""), type: "button" },
        h("span", { class: "avatar", style: `background:${bg};color:${ink}` }, initials(p.name)),
        h("span", { class: "r-name" }, p.name),
        seen
          ? h("span", { class: "r-status" }, "Seen", h("span", { class: "r-check" }, "✓"))
          : h("span", { class: "r-status" }, "Tap to reveal →"));
      item.addEventListener("click", () => { SFX.tap(); go("reveal", { view: "card", idx: i }); });
      roster.append(item);
    });

    const startBtn = h("button", { class: "btn good", disabled: !allDone },
      allDone ? "Everyone's in - start discussion" : `${left} ${left === 1 ? "player" : "players"} still to reveal`);
    startBtn.addEventListener("click", () => { if (!allDone) return; SFX.reveal(); go("discuss"); });

    return h("div", { class: "screen" },
      h("p", { class: "eyebrow" }, `Round ${state.round} · Pass & reveal`),
      h("h2", { class: "title" }, "Tap your name"),
      h("p", { class: "subtitle" }, "Pass the phone around the table. Each player taps their own name - in any order - to see their secret in private, then hands it on."),
      h("div", { class: "reveal-head" },
        h("span", null, `${done} of ${total} revealed`),
        h("span", { class: "reveal-bar" }, fill)),
      roster,
      startBtn);
  }

  function renderRevealCard(idx) {
    setBack(true);
    const p = state.players[idx];
    const isImp = p.role === "imposter";
    const [bg, ink] = avatarColors(idx);

    let backFace;
    if (isImp) {
      const extras = [];
      if (state.settings.imposterMode === "category") extras.push(h("div", { class: "imposter-hint" }, "Topic · " + state.secret.category));
      if (state.settings.imposterMode === "hint") extras.push(h("div", { class: "imposter-hint" }, "Clue · " + state.secret.hint));
      backFace = h("div", { class: "flip-face flip-back imposter" },
        h("div", { class: "imposter-mark" }, "?"),
        h("div", { class: "role-label" }, "You're the imposter"),
        h("div", { class: "secret-word" }, "?????"),
        ...extras,
        h("div", { class: "tap-to-hide" }, "Blend in. Don't get caught."));
    } else {
      backFace = h("div", { class: "flip-face flip-back crew" },
        h("div", { class: "role-label" }, "The secret word is"),
        h("div", { class: "secret-word" }, state.secret.word),
        h("div", { class: "secret-cat" }, state.secret.category),
        h("div", { class: "tap-to-hide" }, "Memorise it, then hand the phone on."));
    }

    const front = h("div", { class: "flip-face flip-front" },
      h("div", { class: "lock-ava", style: `background:${bg};color:${ink}` }, initials(p.name)),
      h("div", { class: "who" }, "This card is for"),
      h("div", { class: "name" }, p.name),
      h("div", { class: "tap-hint" }, "Tap to reveal - keep it hidden from everyone else"));

    const card = h("div", { class: "flip-card" }, h("div", { class: "flip-inner" }, front, backFace));

    let revealed = false;
    const doneBtn = h("button", { class: "btn", style: "margin-top:16px", disabled: true }, "Hide & pass on");

    card.addEventListener("click", () => {
      if (revealed) return;
      revealed = true;
      card.classList.add("flipped");
      SFX.reveal();
      doneBtn.disabled = false;
    });
    doneBtn.addEventListener("click", () => {
      if (!revealed) return;
      SFX.hide();
      state.revealed.add(idx);
      go("reveal", { view: "roster" });
    });

    return h("div", { class: "screen reveal-wrap" },
      h("div", { class: "reveal-progress" }, p.name + (state.revealed.has(idx) ? " · already seen" : "")),
      card,
      doneBtn);
  }

  /* =======================================================================
     SCREEN: DISCUSS (timer + turn order)
     ===================================================================== */
  function renderDiscuss() {
    setBack(true);
    const s = state.settings;
    const R = 90, C = 2 * Math.PI * R;

    const order = state.turnOrder;
    const opener = state.players[order[0]];
    // No dictated order - just a suggested opener, then the room goes however it likes.
    const turnPills = h("div", { class: "turn-order" },
      order.map((pi, i) => h("div", { class: "turn-pill" + (i === 0 ? " first" : "") },
        i === 0 ? h("span", { class: "order-no" }, "Opener · ") : null, state.players[pi].name)));

    const screen = h("div", { class: "screen center" },
      h("p", { class: "eyebrow" }, "Discussion"),
      h("h2", { class: "title", style: "font-size:28px" }, "Drop your clues"),
      h("p", { class: "subtitle" },
        "One word each that proves you know the secret - without handing it to the imposter. ",
        h("b", null, opener.name), " could kick things off; after that, go round however you like."));

    if (s.timerMinutes > 0) {
      let remaining = s.timerMinutes * 60;
      const ring = h("div", { class: "timer-ring" });
      const fmt = (t) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
      const label = h("div", { class: "timer-label" }, fmt(remaining));
      ring.innerHTML = `
        <svg width="220" height="220" viewBox="0 0 220 220">
          <defs><linearGradient id="tg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#f5287b"/><stop offset="100%" stop-color="#ff6b35"/>
          </linearGradient></defs>
          <circle class="track-c" cx="110" cy="110" r="90" fill="none" stroke-width="14"/>
          <circle class="prog-c" cx="110" cy="110" r="90" fill="none" stroke-width="14"
            stroke-dasharray="${C}" stroke-dashoffset="0"/>
        </svg>`;
      const prog = ring.querySelector(".prog-c");
      const ringWrap = h("div", { style: "position:relative;display:grid;place-items:center" }, ring,
        h("div", { style: "position:absolute;text-align:center" }, label, h("div", { class: "timer-sub" }, "remaining")));

      const total = remaining;
      let paused = false;

      const pauseBtn = h("button", { class: "btn secondary" }, "Pause");
      const voteBtn = h("button", { class: "btn good" }, "Go to vote");
      pauseBtn.addEventListener("click", () => {
        paused = !paused; SFX.tap();
        pauseBtn.textContent = paused ? "Resume" : "Pause";
      });
      voteBtn.addEventListener("click", () => go("vote"));

      const tick = setInterval(() => {
        if (paused) return;
        remaining = Math.max(0, remaining - 1);
        label.textContent = fmt(remaining);
        prog.setAttribute("stroke-dashoffset", String(C * (1 - remaining / total)));
        if (remaining <= 10 && remaining > 0) { SFX.tick(); ring.classList.add("low"); }
        if (remaining === 0) {
          clearInterval(tick); SFX.warn(); toast("Time! Head to the vote.");
          pauseBtn.disabled = true;
        }
      }, 1000);
      cleanup = () => clearInterval(tick);

      screen.append(ringWrap, turnPills,
        h("div", { class: "btn-row", style: "margin-top:8px" }, pauseBtn, voteBtn));
    } else {
      screen.append(turnPills,
        h("button", { class: "btn good", onClick: () => go("vote") }, "Start voting"));
    }
    return screen;
  }

  /* =======================================================================
     SCREEN: VOTE
     ===================================================================== */
  function renderVote() {
    setBack(true);
    state.players.forEach((_, i) => { if (state.votes[i] == null) state.votes[i] = 0; });

    const totalLabel = h("div", { class: "vote-total" });
    const revealBtn = h("button", { class: "btn", disabled: true }, "Reveal results");

    function refresh() {
      const total = Object.values(state.votes).reduce((a, b) => a + b, 0);
      totalLabel.textContent = `${total} vote${total === 1 ? "" : "s"} cast`;
      revealBtn.disabled = total === 0;
    }

    const grid = h("div", { class: "vote-grid" });
    state.players.forEach((p, i) => {
      const n = h("span", { class: "n" }, state.votes[i]);
      const minus = h("button", { onClick: () => { state.votes[i] = Math.max(0, state.votes[i] - 1); n.textContent = state.votes[i]; SFX.tap(); refresh(); } }, "–");
      const plus = h("button", { onClick: () => { state.votes[i]++; n.textContent = state.votes[i]; SFX.vote(); refresh(); } }, "+");
      grid.append(h("div", { class: "vote-row" },
        h("span", { class: "pname" }, p.name),
        h("div", { class: "vote-counter" }, minus, n, plus)));
    });

    revealBtn.addEventListener("click", () => { SFX.drumroll(); go("results"); });

    refresh();
    return h("div", { class: "screen" },
      h("p", { class: "eyebrow" }, "The vote"),
      h("h2", { class: "title", style: "font-size:28px" }, "Who's the imposter?"),
      h("p", { class: "subtitle" }, "Tally everyone's votes. Most votes gets ejected - a tie ejects nobody."),
      grid, totalLabel, revealBtn);
  }

  /* =======================================================================
     SCREEN: RESULTS
     ===================================================================== */
  function computeEjected() {
    let max = -1, leaders = [];
    Object.entries(state.votes).forEach(([i, c]) => {
      i = Number(i);
      if (c > max) { max = c; leaders = [i]; }
      else if (c === max) leaders.push(i);
    });
    if (max <= 0) return { ejected: null, tie: false };
    if (leaders.length > 1) return { ejected: null, tie: true };
    return { ejected: leaders[0], tie: false };
  }

  function renderResults() {
    setBack(false);
    const { ejected, tie } = computeEjected();
    const imposters = state.players.map((p, i) => ({ ...p, i })).filter((p) => p.role === "imposter");
    const caughtImposter = ejected != null && state.players[ejected].role === "imposter";

    const screen = h("div", { class: "screen" });

    // Apply scoring (only once per render of results - guard via flag on state).
    // We recompute fresh each time results is shown for a round; guard with a key.
    const stealState = { used: false, won: false };

    function applyBaseScoring() {
      if (caughtImposter) {
        // Crew each +1
        state.players.forEach((p) => { if (p.role === "crew") state.scores[p.name] += 1; });
      } else {
        // Imposters survive → each +2
        imposters.forEach((p) => { state.scores[p.name] += 2; });
      }
    }

    // Banner
    let bannerClass, emblem, title, sub;
    if (caughtImposter) {
      bannerClass = "crew"; emblem = "✓"; title = "Imposter caught!";
      sub = `${state.players[ejected].name} was an imposter. Crew scores +1 each.`;
      SFX.crewWin(); confetti();
    } else {
      bannerClass = "imposter"; emblem = "?"; title = tie ? "Tie - imposter escapes!" : "Wrong call!";
      sub = tie ? "Nobody was ejected. Imposters score +2 each."
                : `${state.players[ejected].name} was innocent crew. Imposters score +2 each.`;
      SFX.imposterWin();
    }
    applyBaseScoring();

    screen.append(h("div", { class: "result-banner " + bannerClass },
      h("div", { class: "result-emblem" }, emblem),
      h("div", { class: "result-title" }, title),
      h("p", { class: "muted", style: "margin:4px 0 0" }, sub)));

    // The reveal panel
    const panel = h("div", { class: "panel" });
    panel.append(h("div", { class: "reveal-line" },
      h("span", { class: "k" }, "Secret word"),
      h("span", { class: "v" }, state.secret.word)));
    panel.append(h("div", { class: "reveal-line" },
      h("span", { class: "k" }, "Category"),
      h("span", { class: "v" }, state.secret.category)));
    panel.append(h("div", { class: "reveal-line" },
      h("span", { class: "k" }, imposters.length > 1 ? "Imposters" : "Imposter"),
      h("span", { class: "v" }, imposters.map((p) => p.name).join(", "))));
    if (ejected != null)
      panel.append(h("div", { class: "reveal-line" },
        h("span", { class: "k" }, "Ejected"),
        h("span", { class: "v" }, state.players[ejected].name + " ",
          h("span", { class: "tag " + (caughtImposter ? "imp" : "crew") }, caughtImposter ? "Imposter" : "Crew"))));
    screen.append(panel);

    // Imposter's last-chance guess (only if caught).
    const actions = h("div", { class: "stack" });
    if (caughtImposter) {
      const guessPanel = h("div", { class: "panel" });
      const input = h("input", { type: "text", placeholder: "Imposter, type your guess…",
        style: "width:100%;background:var(--surface);border:1px solid var(--border);color:var(--text);padding:12px 14px;border-radius:12px;font-size:16px;font-family:inherit" });
      const guessBtn = h("button", { class: "btn small good" }, "Lock in guess");
      const skipBtn = h("button", { class: "btn small ghost" }, "Skip");
      const resultMsg = h("div", { class: "muted", style: "margin-top:10px;text-align:center" });

      function resolveGuess(text) {
        if (stealState.used) return;
        stealState.used = true;
        const correct = norm(text) === norm(state.secret.word);
        const imp = state.players[ejected];
        if (correct) {
          state.scores[imp.name] += 2;
          stealState.won = true;
          resultMsg.innerHTML = `<b>${imp.name}</b> nailed it - <b>“${state.secret.word}”</b>! Steal bonus +2.`;
          SFX.crewWin(); confetti(60);
        } else {
          resultMsg.innerHTML = text ? `“${text}” was wrong. No steal.` : "Guess skipped.";
          SFX.warn();
        }
        input.disabled = true; guessBtn.disabled = true; skipBtn.disabled = true;
        renderScoreSummary();
      }
      guessBtn.addEventListener("click", () => resolveGuess(input.value));
      skipBtn.addEventListener("click", () => resolveGuess(""));

      guessPanel.append(
        h("h3", null, "Imposter's last chance"),
        h("p", { class: "muted", style: "margin:0 0 12px;font-size:14px" }, "Guess the secret word for a +2 steal."),
        input,
        h("div", { class: "btn-row", style: "margin-top:12px" }, skipBtn, guessBtn),
        resultMsg);
      screen.append(guessPanel);
    }

    // Live mini score summary + navigation.
    const summary = h("div", { class: "panel" });
    function renderScoreSummary() {
      summary.innerHTML = "";
      summary.append(h("h3", null, "Standings"));
      const ranked = Object.entries(state.scores).sort((a, b) => b[1] - a[1]);
      ranked.forEach(([nm, pts], idx) => {
        summary.append(h("div", { class: "reveal-line" },
          h("span", { class: "k" }, (idx + 1) + ".  " + nm),
          h("span", { class: "v" }, pts + " pts")));
      });
    }
    renderScoreSummary();
    screen.append(summary);

    actions.append(
      h("button", { class: "btn", onClick: () => nextRound() }, "Next round"),
      h("button", { class: "btn secondary", onClick: () => go("scoreboard") }, "End game & scores"));
    screen.append(actions);

    return screen;
  }

  /* =======================================================================
     SCREEN: SCOREBOARD
     ===================================================================== */
  function renderScoreboard() {
    setBack(false);
    state.inGame = false;
    const ranked = Object.entries(state.scores).sort((a, b) => b[1] - a[1]);
    const topScore = ranked.length ? ranked[0][1] : 0;

    if (ranked.length && topScore > 0) confetti(70);

    const table = h("div", { class: "score-table" });
    ranked.forEach(([nm, pts], i) => {
      const lead = pts === topScore && topScore > 0;
      table.append(h("div", { class: "score-row" + (lead ? " lead" : "") },
        h("span", { class: "score-rank" }, i + 1),
        h("span", { class: "score-name" }, nm),
        h("span", { class: "score-pts" }, pts)));
    });

    return h("div", { class: "screen" },
      h("p", { class: "eyebrow center" }, `${state.round} round${state.round === 1 ? "" : "s"} played`),
      h("h2", { class: "title center", style: "font-size:34px" },
        topScore > 0 ? ranked[0][0] + " wins!" : "Game over"),
      h("div", { class: "card", style: "margin:10px 0 18px" }, table),
      h("div", { class: "stack" },
        h("button", { class: "btn", onClick: () => { state.inGame = true; nextRound(); } }, "Play another round"),
        h("button", { class: "btn secondary", onClick: () => go("setup") }, "New game"),
        h("button", { class: "btn ghost", onClick: () => go("home") }, "Home")));
  }

  /* =======================================================================
     RENDER DISPATCH
     ===================================================================== */
  function render(screen, opts = {}) {
    let node;
    switch (screen) {
      case "home": node = renderHome(); break;
      case "howto": node = renderHowto(); break;
      case "setup": node = renderSetup(); break;
      case "reveal": node = renderReveal(opts); break;
      case "discuss": node = renderDiscuss(); break;
      case "vote": node = renderVote(); break;
      case "results": node = renderResults(); break;
      case "scoreboard": node = renderScoreboard(); break;
      default: node = renderHome();
    }
    app.innerHTML = "";
    app.append(node);
    app.scrollTop = 0;
    window.scrollTo(0, 0);
  }

  // Boot.
  render("home");

  // Optional: register service worker for offline/PWA when served over http(s).
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
