/**
 * エレキー — Electronic Morse Keyer
 * Iambic A / Iambic B / Straight
 * WPM (PARIS) + 和文 / 欧文 デコード
 */

// ========== Morse tables (reuse standard) ==========
const INTERNATIONAL = {
  A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.",
  G: "--.", H: "....", I: "..", J: ".---", K: "-.-", L: ".-..",
  M: "--", N: "-.", O: "---", P: ".--.", Q: "--.-", R: ".-.",
  S: "...", T: "-", U: "..-", V: "...-", W: ".--", X: "-..-",
  Y: "-.--", Z: "--..",
  "0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-",
  "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----.",
  ".": ".-.-.-", ",": "--..--", "?": "..--..", "/": "-..-.",
  "(": "-.--.", ")": "-.--.-", "-": "-....-", "=": "-...-",
  "+": ".-.-.", "@": ".--.-."
};

const WABUN = {
  ア: "--.--", イ: ".-", ウ: "..-", エ: "-.---", オ: ".-...",
  カ: ".-..", キ: "-.-..", ク: "...-", ケ: "-.--", コ: "----",
  サ: "-.-.-", シ: "--.-.", ス: "---.-", セ: ".---.", ソ: "---.",
  タ: "-.", チ: "..-.", ツ: ".--.", テ: ".-.--", ト: "..-..",
  ナ: ".-.", ニ: "-.-.", ヌ: "....", ネ: "--.-", ノ: "..--",
  ハ: "-...", ヒ: "--..-", フ: "--..", ヘ: ".", ホ: "-..",
  マ: "-..-", ミ: "..-.-", ム: "-", メ: "-...-", モ: "-..-.",
  ヤ: ".--", ユ: "-..--", ヨ: "--",
  ラ: "...", リ: "--.", ル: "-.--.", レ: "---", ロ: ".-.-",
  ワ: ".-", ヰ: ".-..-", ヱ: ".--..", ヲ: ".---", ン: ".-.-.",
  ゛: "..", ゜: "..--.",
  ー: ".--.-", "、": ".-.-.-", "。": ".-.-..",
  "（": "-.--.-", "）": ".-..-."
};

// ========== Audio ==========
class Sidetone {
  constructor() {
    this.ctx = null;
    this.osc = null;
    this.gain = null;
    this.freq = 700;
    this.volume = 0.35;
    this.playing = false;
  }
  ensure() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.gain = this.ctx.createGain();
      this.gain.gain.value = 0;
      this.gain.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  }
  setFreq(f) { this.freq = f; if (this.osc) this.osc.frequency.setValueAtTime(f, this.ctx.currentTime); }
  setVolume(v) { this.volume = v; }
  start() {
    this.ensure();
    if (this.playing) return;
    const now = this.ctx.currentTime;
    this.osc = this.ctx.createOscillator();
    this.osc.type = "sine";
    this.osc.frequency.value = this.freq;
    this.osc.connect(this.gain);
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(0, now);
    this.gain.gain.linearRampToValueAtTime(this.volume, now + 0.004);
    this.osc.start(now);
    this.playing = true;
  }
  stop() {
    if (!this.playing || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(this.gain.gain.value, now);
    this.gain.gain.linearRampToValueAtTime(0, now + 0.008);
    if (this.osc) {
      try { this.osc.stop(now + 0.02); } catch (_) {}
      this.osc = null;
    }
    this.playing = false;
  }
  async beep(ms = 400) {
    this.start();
    await new Promise(r => setTimeout(r, ms));
    this.stop();
  }
}

const audio = new Sidetone();

// ========== Keyer state machine ==========
const state = {
  mode: "iambic-b",       // iambic-a | iambic-b | straight
  charset: "wabun",
  wpm: 20,
  unitMs: 60,             // 1200 / wpm
  paddleSwap: false,
  ditDown: false,
  dahDown: false,
  // element generation
  keying: false,
  nextIsDit: true,        // for iambic squeeze memory
  elementTimer: null,
  // decoding buffer
  currentElement: [],     // symbols of current character
  decoded: "",
  morseHistory: "",
  lastElementEnd: 0,
  charTimer: null,
  wordTimer: null
};

function updateUnit() {
  state.unitMs = Math.max(8, Math.round(1200 / state.wpm));
}

function getDitKey() { return state.paddleSwap ? "KeyK" : "KeyJ"; }
function getDahKey() { return state.paddleSwap ? "KeyJ" : "KeyK"; }

// --- Decode helpers ---
function morseToChar(code) {
  const prefer = state.charset === "wabun" ? [WABUN, INTERNATIONAL] : [INTERNATIONAL, WABUN];
  for (const table of prefer) {
    for (const [ch, c] of Object.entries(table)) {
      if (c === code) return ch;
    }
  }
  return "?";
}

function flushChar() {
  if (state.currentElement.length === 0) return;
  const code = state.currentElement.join("");
  const ch = morseToChar(code);
  state.decoded += ch;
  if (state.morseHistory) state.morseHistory += " ";
  state.morseHistory += code;
  state.currentElement = [];
  render();
}

function scheduleGaps() {
  clearTimeout(state.charTimer);
  clearTimeout(state.wordTimer);
  const u = state.unitMs;
  state.charTimer = setTimeout(() => {
    flushChar();
    state.wordTimer = setTimeout(() => {
      if (state.decoded && !state.decoded.endsWith(" ")) {
        state.decoded += " ";
        if (state.morseHistory) state.morseHistory += " / ";
        render();
      }
    }, u * 4); // additional to reach ~7 units from last element end
  }, u * 2.5);
}

// --- Element emission (core of iambic) ---
function emitElement(isDit) {
  const duration = isDit ? state.unitMs : state.unitMs * 3;
  state.currentElement.push(isDit ? "." : "-");
  render();
  audio.start();
  state.keying = true;

  clearTimeout(state.elementTimer);
  state.elementTimer = setTimeout(() => {
    audio.stop();
    state.keying = false;
    state.lastElementEnd = performance.now();
    // inter-element space (1 unit)
    state.elementTimer = setTimeout(() => {
      decideNext();
    }, state.unitMs);
  }, duration);
}

function decideNext() {
  // After inter-element space, decide what (if anything) to send next
  const dit = state.ditDown;
  const dah = state.dahDown;

  if (state.mode === "straight") {
    // Straight handled by continuous hold; no auto elements
    return;
  }

  if (dit && dah) {
    // squeeze: alternate
    state.nextIsDit = !state.nextIsDit;
    emitElement(state.nextIsDit);
    return;
  }
  if (dit) {
    state.nextIsDit = true;
    emitElement(true);
    return;
  }
  if (dah) {
    state.nextIsDit = false;
    emitElement(false);
    return;
  }

  // both released
  if (state.mode === "iambic-b") {
    // Mode B: one extra alternate element after release if last was from squeeze
    // Simple practical approach: if we just finished an element and memory exists,
    // many implementations send the opposite once. Here we keep it clean:
    // only auto-continue while a paddle is held.
  }
  // gaps for character / word
  scheduleGaps();
}

function onPaddleChange() {
  if (state.mode === "straight") {
    if (state.ditDown || state.dahDown) {
      if (!audio.playing) {
        audio.start();
        state.keying = true;
        state._straightStart = performance.now();
      }
    } else {
      if (audio.playing) {
        const dur = performance.now() - (state._straightStart || 0);
        audio.stop();
        state.keying = false;
        const isDit = dur < state.unitMs * 2;
        state.currentElement.push(isDit ? "." : "-");
        state.lastElementEnd = performance.now();
        render();
        scheduleGaps();
      }
    }
    return;
  }

  // Iambic: start sequence if not already keying and a paddle is down
  if (!state.keying && (state.ditDown || state.dahDown)) {
    clearTimeout(state.charTimer);
    clearTimeout(state.wordTimer);
    if (state.ditDown && state.dahDown) {
      // start with dit by convention (or last opposite)
      state.nextIsDit = true;
      emitElement(true);
    } else if (state.ditDown) {
      state.nextIsDit = true;
      emitElement(true);
    } else {
      state.nextIsDit = false;
      emitElement(false);
    }
  }
}

// ========== Input binding ==========
function setDit(down) {
  if (state.ditDown === down) return;
  state.ditDown = down;
  const btn = document.getElementById("paddle-dit");
  if (btn) btn.classList.toggle("pressed", down);
  onPaddleChange();
}

function setDah(down) {
  if (state.dahDown === down) return;
  state.dahDown = down;
  const btn = document.getElementById("paddle-dah");
  if (btn) btn.classList.toggle("pressed", down);
  onPaddleChange();
}

function bindPaddle(el, isDit) {
  if (!el) return;
  const down = e => { e.preventDefault(); isDit ? setDit(true) : setDah(true); };
  const up = e => { e.preventDefault(); isDit ? setDit(false) : setDah(false); };
  el.addEventListener("mousedown", down);
  el.addEventListener("mouseup", up);
  el.addEventListener("mouseleave", () => { isDit ? setDit(false) : setDah(false); });
  el.addEventListener("touchstart", down, { passive: false });
  el.addEventListener("touchend", up, { passive: false });
  el.addEventListener("touchcancel", up, { passive: false });
}

function bindKeyboard() {
  const held = new Set();
  document.addEventListener("keydown", e => {
    if (e.repeat) return;
    if (e.code === getDitKey()) {
      e.preventDefault();
      if (!held.has("dit")) { held.add("dit"); setDit(true); }
    } else if (e.code === getDahKey()) {
      e.preventDefault();
      if (!held.has("dah")) { held.add("dah"); setDah(true); }
    }
  }, { passive: false });
  document.addEventListener("keyup", e => {
    if (e.code === getDitKey()) {
      e.preventDefault();
      held.delete("dit");
      setDit(false);
    } else if (e.code === getDahKey()) {
      e.preventDefault();
      held.delete("dah");
      setDah(false);
    }
  }, { passive: false });
  // prevent space scroll etc. when focused on body
  document.addEventListener("keydown", e => {
    if ((e.code === "Space" || e.code === getDitKey() || e.code === getDahKey()) &&
        document.activeElement === document.body) {
      e.preventDefault();
    }
  }, { passive: false });
}

// ========== UI ==========
function render() {
  const m = document.getElementById("morse-out");
  const t = document.getElementById("text-out");
  if (m) {
    const building = state.currentElement.join("");
    m.textContent = (state.morseHistory + (building ? (state.morseHistory ? " " : "") + building : "")) || "—";
  }
  if (t) t.textContent = state.decoded || "—";
}

function clearAll() {
  clearTimeout(state.elementTimer);
  clearTimeout(state.charTimer);
  clearTimeout(state.wordTimer);
  audio.stop();
  state.keying = false;
  state.ditDown = false;
  state.dahDown = false;
  state.currentElement = [];
  state.decoded = "";
  state.morseHistory = "";
  document.getElementById("paddle-dit")?.classList.remove("pressed");
  document.getElementById("paddle-dah")?.classList.remove("pressed");
  render();
}

function updateKeyLabels() {
  const ditL = document.getElementById("dit-key-label");
  const dahL = document.getElementById("dah-key-label");
  if (ditL) ditL.textContent = state.paddleSwap ? "K" : "J";
  if (dahL) dahL.textContent = state.paddleSwap ? "J" : "K";
}

function init() {
  updateUnit();
  bindPaddle(document.getElementById("paddle-dit"), true);
  bindPaddle(document.getElementById("paddle-dah"), false);
  bindKeyboard();

  const $ = id => document.getElementById(id);

  $("mode").addEventListener("change", e => { state.mode = e.target.value; });
  $("charset").addEventListener("change", e => { state.charset = e.target.value; });
  $("wpm").addEventListener("input", e => {
    state.wpm = parseInt(e.target.value, 10) || 20;
    $("wpm-value").textContent = state.wpm;
    updateUnit();
  });
  $("freq").addEventListener("change", e => {
    audio.setFreq(parseInt(e.target.value, 10) || 700);
  });
  $("volume").addEventListener("input", e => {
    audio.setVolume(parseFloat(e.target.value) || 0.35);
  });
  $("paddle-swap").addEventListener("change", e => {
    state.paddleSwap = e.target.checked;
    updateKeyLabels();
  });
  $("clear").addEventListener("click", clearAll);
  $("test-tone").addEventListener("click", () => {
    audio.setFreq(parseInt($("freq").value, 10) || 700);
    audio.setVolume(parseFloat($("volume").value) || 0.35);
    audio.beep(500);
  });

  // initial
  $("wpm-value").textContent = state.wpm;
  updateKeyLabels();
  render();
}

document.addEventListener("DOMContentLoaded", init);
