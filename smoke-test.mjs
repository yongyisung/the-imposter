// Headless smoke test: loads the app in jsdom and drives a full round.
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";

const html = readFileSync("./index.html", "utf8");
const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true });
const { window } = dom;
global.window = window;
global.document = window.document;

// Quiet down: stub AudioContext + matchMedia + serviceWorker.
window.AudioContext = class { constructor(){ this.state="running"; this.currentTime=0; this.destination={}; } resume(){} createOscillator(){return {type:"",frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){return{connect(){}}},start(){},stop(){}};} createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){return{connect(){}}}};} };
window.matchMedia = () => ({ matches: false, addEventListener(){}, removeEventListener(){} });
window.confirm = () => true;
window.scrollTo = () => {};

function load(file) {
  const code = readFileSync(file, "utf8");
  window.eval(code);
}
load("./js/data.js");
load("./js/audio.js");
load("./js/game.js");

const doc = window.document;
const $ = (sel) => doc.querySelector(sel);
const byText = (txt) => [...doc.querySelectorAll("button,.chip,.brand")].find((b) => b.textContent.includes(txt));
const click = (el) => { if (!el) throw new Error("element not found to click"); el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); };

let step = 0;
function check(cond, msg) { step++; if (!cond) throw new Error(`FAIL @${step}: ${msg}`); console.log(`  ✓ ${msg}`); }

// Drive the self-serve reveal roster: each player taps their name, flips, hides.
function driveReveal() {
  let guard = 0;
  while (guard++ < 40) {
    const pending = [...doc.querySelectorAll(".roster-item:not(.done)")];
    if (!pending.length) break;
    click(pending[0]);                 // open this player's private card
    const card = $(".flip-card");
    if (!card) throw new Error("flip card did not open from roster");
    click(card);                       // flip to reveal the role
    if (!card.classList.contains("flipped")) throw new Error("card did not flip");
    const hideBtn = $(".reveal-wrap .btn");
    if (hideBtn.disabled) throw new Error("hide button still disabled after reveal");
    click(hideBtn);                    // mark seen, return to roster
  }
  const startBtn = byText("start discussion");
  check(startBtn && !startBtn.disabled, "discussion unlocks once everyone has revealed");
  click(startBtn);
}

console.log("Smoke test: The Imposter");

// Home
check($(".home-title"), "home screen renders");
click(byText("New game"));

// Setup
check($(".chips .chip"), "setup screen renders categories");
check(doc.querySelectorAll(".player-input").length === 4, "4 player inputs by default");
// bump players to 5
const plusBtns = [...doc.querySelectorAll(".stepper button")];
click(plusBtns[1]); // players +
check(doc.querySelectorAll(".player-input").length === 5, "player count increments to 5");
// set a custom name
const firstInput = doc.querySelector(".player-input input");
firstInput.value = "Alice";
firstInput.dispatchEvent(new window.Event("input", { bubbles: true }));
// start
click(byText("Start game"));

// Reveal — self-serve roster
check($(".roster"), "reveal screen shows the player roster");
check(doc.querySelectorAll(".roster-item").length === 5, "roster lists all 5 players");
check(byText("Alice"), "roster shows the custom full name");
const startLocked = byText("still to reveal");
check(startLocked && startLocked.disabled, "start button is locked until everyone reveals");
driveReveal();

// Discuss
check($(".turn-order"), "discuss screen lists the players");
const voteBtn = byText("Go to vote") || byText("Start voting");
click(voteBtn);

// Vote — give all votes to one player (likely catches/misses imposter, both paths valid)
check($(".vote-grid"), "vote screen renders");
const firstPlus = [...doc.querySelectorAll(".vote-counter button")].filter((b) => b.textContent === "+")[0];
click(firstPlus); click(firstPlus); click(firstPlus);
const revealResults = byText("Reveal results");
check(!revealResults.disabled, "reveal results enabled after votes");
click(revealResults);

// Results
check($(".result-banner"), "results banner renders");
check($(".result-title"), "results has a title");
// If imposter caught, a guess box may appear — try it
const guessBox = doc.querySelector('input[placeholder^="Imposter"]');
if (guessBox) {
  console.log("  · imposter was caught — testing guess flow");
  const lockBtn = byText("Lock in guess");
  guessBox.value = "definitely wrong guess";
  guessBox.dispatchEvent(new window.Event("input", { bubbles: true }));
  click(lockBtn);
  check(guessBox.disabled, "guess locks after submission");
}
check($(".panel h3") && [...doc.querySelectorAll(".panel h3")].some(h=>h.textContent.includes("Standings")), "standings shown");

// Next round
click(byText("Next round"));
check($(".roster"), "next round starts a fresh reveal roster");

// Drive a second quick round all the way to the scoreboard.
driveReveal();
click(byText("Go to vote") || byText("Start voting"));
click([...doc.querySelectorAll(".vote-counter button")].filter((b) => b.textContent === "+")[0]);
click(byText("Reveal results"));
const endBtn = byText("End game");
click(endBtn);
check($(".score-table"), "scoreboard renders");
check($(".score-row"), "scoreboard has rows");

console.log("\nALL SMOKE CHECKS PASSED ✅");
