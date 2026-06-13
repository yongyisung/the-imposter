/*
 * audio.js - Tiny WebAudio sound engine.
 *
 * Generates all sounds procedurally so the app stays dependency- and asset-free.
 * Respects a global mute flag persisted by the game. The AudioContext is created
 * lazily on first user gesture to satisfy browser autoplay policies.
 */

const SFX = (() => {
  let ctx = null;
  let muted = false;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    }
    if (ctx && ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  // A single tone with an ADSR-ish envelope.
  function tone({ freq = 440, dur = 0.15, type = "sine", gain = 0.2, when = 0, slideTo = null }) {
    const ac = ensure();
    if (!ac || muted) return;
    const t0 = ac.currentTime + when;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function chord(freqs, opts = {}) {
    freqs.forEach((f, i) => tone({ ...opts, freq: f, when: (opts.stagger || 0) * i }));
  }

  return {
    unlock() { ensure(); },
    setMuted(v) { muted = !!v; },
    isMuted() { return muted; },

    tap() { tone({ freq: 320, dur: 0.06, type: "triangle", gain: 0.12 }); },
    nav() { tone({ freq: 480, dur: 0.08, type: "triangle", gain: 0.12, slideTo: 620 }); },
    reveal() { chord([523.25, 659.25], { dur: 0.18, type: "sine", gain: 0.16, stagger: 0.05 }); },
    hide() { tone({ freq: 300, dur: 0.12, type: "sine", gain: 0.12, slideTo: 180 }); },
    tick() { tone({ freq: 900, dur: 0.03, type: "square", gain: 0.05 }); },
    warn() { tone({ freq: 220, dur: 0.18, type: "sawtooth", gain: 0.12 }); },
    vote() { tone({ freq: 600, dur: 0.07, type: "triangle", gain: 0.14, slideTo: 760 }); },
    crewWin() { chord([523.25, 659.25, 783.99, 1046.5], { dur: 0.4, type: "sine", gain: 0.18, stagger: 0.09 }); },
    imposterWin() { chord([440, 415.3, 392], { dur: 0.45, type: "sawtooth", gain: 0.14, stagger: 0.12 }); },
    drumroll() {
      for (let i = 0; i < 18; i++) tone({ freq: 120, dur: 0.04, type: "square", gain: 0.06, when: i * 0.06 });
    },
  };
})();

window.SFX = SFX;
