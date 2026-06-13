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

console.log("Smoke test: The Imposter");

// Home
check($(".home-title"), "home screen renders");
click(byText("New Game"));

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
click(byText("Start Game"));

// Reveal — flip through all cards
let guard = 0;
while ($(".flip-card") && guard++ < 20) {
  const card = $(".flip-card");
  click(card); // flip
  check(card.classList.contains("flipped"), `card ${guard} flips to reveal role`);
  const nextBtn = $(".reveal-wrap .btn");
  check(!nextBtn.disabled, "next button enabled after reveal");
  click(nextBtn);
  if ($(".timer-ring") || byText("Start Voting")) break;
}

// Discuss
check($(".turn-order"), "discuss screen shows turn order");
const voteBtn = byText("Go to Vote") || byText("Start Voting");
click(voteBtn);

// Vote — give all votes to one player (likely catches/misses imposter, both paths valid)
check($(".vote-grid"), "vote screen renders");
const firstPlus = [...doc.querySelectorAll(".vote-counter button")].filter((b) => b.textContent === "+")[0];
click(firstPlus); click(firstPlus); click(firstPlus);
const revealResults = byText("Reveal Results");
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
click(byText("Next Round"));
check($(".flip-card"), "next round starts a fresh reveal");

// Jump to scoreboard via end game: go back through a quick round to scoreboard
// Drive to results again quickly:
guard = 0;
while ($(".flip-card") && guard++ < 20) {
  click($(".flip-card"));
  click($(".reveal-wrap .btn"));
}
click(byText("Go to Vote") || byText("Start Voting"));
click([...doc.querySelectorAll(".vote-counter button")].filter((b) => b.textContent === "+")[0]);
click(byText("Reveal Results"));
const endBtn = byText("End Game");
click(endBtn);
check($(".score-table"), "scoreboard renders");
check($(".score-row"), "scoreboard has rows");

console.log("\nALL SMOKE CHECKS PASSED ✅");
