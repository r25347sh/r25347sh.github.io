/**
 * 一総通モールス信号練習
 * Web Audio API による正確なトーン生成
 * 和文・欧文・数字・記号対応
 *
 * キーイング: ITU 1:3:7 比率対応 + 文字間・単語間の自動間隔検出 + 適応単位長推定
 * スペース / Enter 対応、高速 (1ms unit) 対応
 */

// ========== Morse Tables ==========
const INTERNATIONAL = {
  A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.",
  G: "--.", H: "....", I: "..", J: ".---", K: "-.-", L: ".-..",
  M: "--", N: "-.", O: "---", P: ".--.", Q: "--.-", R: ".-.",
  S: "...", T: "-", U: "..-", V: "...-", W: ".--", X: "-..-",
  Y: "-.--", Z: "--..",
  "0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-",
  "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----.",
  ".": ".-.-.-", ",": "--..--", "?": "..--..", "'": ".----.",
  "!": "-.-.--", "/": "-..-.", "(": "-.--.", ")": "-.--.-",
  "&": ".-...", ":": "---...", ";": "-.-.-.", "=": "-...-",
  "+": ".-.-.", "-": "-....-", "_": "..--.-", '"': ".-..-.",
  "$": "...-..-", "@": ".--.-.", " ": " "
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
  "（": "-.--.-", "）": ".-..-.",
  ホレ: "-..---", ラタ: "...-.",
  " ": " "
};

const HIRA_TO_KATA = {
  あ: "ア", い: "イ", う: "ウ", え: "エ", お: "オ",
  か: "カ", き: "キ", く: "ク", け: "ケ", こ: "コ",
  さ: "サ", し: "シ", す: "ス", せ: "セ", そ: "ソ",
  た: "タ", ち: "チ", つ: "ツ", て: "テ", と: "ト",
  な: "ナ", に: "ニ", ぬ: "ヌ", ね: "ネ", の: "ノ",
  は: "ハ", ひ: "ヒ", ふ: "フ", へ: "ヘ", ほ: "ホ",
  ま: "マ", み: "ミ", む: "ム", め: "メ", も: "モ",
  や: "ヤ", ゆ: "ユ", よ: "ヨ",
  ら: "ラ", り: "リ", る: "ル", れ: "レ", ろ: "ロ",
  わ: "ワ", ゐ: "ヰ", ゑ: "ヱ", を: "ヲ", ん: "ン",
  が: "ガ", ぎ: "ギ", ぐ: "グ", げ: "ゲ", ご: "ゴ",
  ざ: "ザ", じ: "ジ", ず: "ズ", ぜ: "ゼ", ぞ: "ゾ",
  だ: "ダ", ぢ: "ヂ", づ: "ヅ", で: "デ", ど: "ド",
  ば: "バ", び: "ビ", ぶ: "ブ", べ: "ベ", ぼ: "ボ",
  ぱ: "パ", ぴ: "ピ", ぷ: "プ", ぺ: "ペ", ぽ: "ポ",
  ぁ: "ァ", ぃ: "ィ", ぅ: "ゥ", ぇ: "ェ", ぉ: "ォ",
  ゃ: "ャ", ゅ: "ュ", ょ: "ョ", っ: "ッ", ー: "ー"
};

const DAKUTEN_MAP = {
  ガ: "カ", ギ: "キ", グ: "ク", ゲ: "ケ", ゴ: "コ",
  ザ: "サ", ジ: "シ", ズ: "ス", ゼ: "セ", ゾ: "ソ",
  ダ: "タ", ヂ: "チ", ヅ: "ツ", デ: "テ", ド: "ト",
  バ: "ハ", ビ: "ヒ", ブ: "フ", ベ: "ヘ", ボ: "ホ"
};
const HANDAKUTEN_MAP = {
  パ: "ハ", ピ: "ヒ", プ: "フ", ペ: "ヘ", ポ: "ホ"
};

const WORDS_WABUN = ["デンパ", "ムセン", "ツウシン", "デンシン", "ソウシン", "ジュシン", "アンテナ", "デンアツ", "デンリュウ", "シュウハスウ", "デンパホウ", "ムセンキ", "ソウチ", "キカイ", "デンゲン", "カイセン", "カイガンキョク", "センパク", "センスイカン", "コクサイ", "ツウシンシ", "ソウゴウ", "デンキ", "ツウシンジュツ", "モルス", "フゴウ", "オンキョウ", "ワブン", "オウブン", "アング", "フツウゴ", "テガミ", "デンポウ", "ハッシン", "ジュシンキョク", "ジコク", "ニチジ", "キゴウ", "タンテン", "チョウテン", "スペース", "キード", "デンケン", "シケン", "ゴウカク", "レンシュウ", "ソクド", "セイカク", "カイジョウ", "リクジョウ", "クウチュウ", "エイセイ", "タンパ", "チョウハ", "チュウハ", "タンチョウハ", "マイクロ", "イチソウツウ", "ニソウツウ", "サンソウツウ", "アマチュア", "ギジュツ", "ホウキ", "エイゴ", "チリ", "デンキコウガク", "キソ", "エイ", "ビー", "ソウナン", "キュウジョ", "エスイーオー", "メイワク", "ボウガイ", "カンシ", "カンソク", "ジッケン", "ケンキュウ", "カイハツ", "セイノウ", "シンライセイ", "アンゼン", "ヒジョウ", "ヨビ", "ホンブン", "シュウセイ", "シュウリョウ", "カイシ", "オワリ", "アリガトウ", "オハヨウ", "コンニチハ", "サヨウナラ", "オイデ", "キテ", "イキマス", "カエリマス", "ワカリマシタ", "チガイマス", "セイカイ", "フセイカイ", "マチガイ", "タダシイ", "ハヤイ", "オソイ", "ヨイ", "ワルイ", "オオキイ", "チイサイ"];

const WORDS_INTERNATIONAL = ["RADIO", "MORSE", "CODE", "SIGNAL", "CQ", "DX", "QSO", "QTH", "QRZ", "QSL", "QRM", "QRN", "QSB", "QSY", "QRT", "QRV", "SHIP", "COAST", "STATION", "OPERATOR", "LICENSE", "EXAM", "PRACTICE", "SPEED", "ACCURACY", "FREQUENCY", "ANTENNA", "TRANSMIT", "RECEIVE", "POWER", "VOLTAGE", "CURRENT", "AMPLIFIER", "OSCILLATOR", "FILTER", "MIXER", "DETECTOR", "HELLO", "WORLD", "TEST", "MESSAGE", "URGENT", "SOS", "MAYDAY", "PAN", "SECURITE", "WEATHER", "POSITION", "LATITUDE", "LONGITUDE", "COURSE", "SPEED", "ETA", "ARRIVAL", "DEPARTURE", "CARGO", "PASSENGER", "CREW", "CAPTAIN", "ENGINEER", "NAVIGATOR", "RADIOMAN", "TOKYO", "OSAKA", "YOKOHAMA", "KOBE", "NAGOYA", "PACIFIC", "ATLANTIC", "INDIAN", "OCEAN", "SEA", "WAVE", "BAND", "CHANNEL", "CALLSIGN", "PREFIX", "SUFFIX", "NUMBER", "LETTER", "SYMBOL", "GROUP", "FIVE", "LETTER", "CIPHER", "PLAIN", "TEXT", "COPY", "SOLID", "RPT", "AGAIN", "CONFIRM", "ROGER", "WILCO", "OVER", "OUT", "BREAK", "STAND", "BY", "WAIT", "READY", "GO", "AHEAD"];

const GROUPS_SAMPLE = ["ABCDE", "FGHIJ", "KLMNO", "PQRST", "UVWXY", "Z1234", "56789", "QWERTY", "ASDFG", "ZXCVB", "12345", "67890", "SOSOS", "CQDX", "TEST1", "TEST2", "AAAAA", "EEEEE", "アカサタナ", "ハマヤラワ", "イキシチニ", "ヒミリヰ", "ウクスツヌ", "フムユルン", "エケセテネ", "ヘメレヱ", "オコソトノ", "ホモヨロン"];

class MorseAudio {
  constructor() {
    this.ctx = null;
    this.gain = null;
    this.playing = false;
    this.abort = false;
    this.freq = 700;
    this.volume = 0.4;
  }
  ensureCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.gain = this.ctx.createGain();
      this.gain.gain.value = 0;
      this.gain.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  }
  setFreq(f) { this.freq = f; }
  setVolume(v) { this.volume = v; }
  stop() {
    this.abort = true;
    this.playing = false;
    if (this.gain && this.ctx) {
      this.gain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.gain.gain.setValueAtTime(0, this.ctx.currentTime);
    }
  }
  async playTone(durationMs) {
    this.ensureCtx();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = this.freq;
    osc.connect(this.gain);
    this.gain.gain.setValueAtTime(0, now);
    this.gain.gain.linearRampToValueAtTime(this.volume, now + 0.005);
    this.gain.gain.setValueAtTime(this.volume, now + durationMs / 1000 - 0.005);
    this.gain.gain.linearRampToValueAtTime(0, now + durationMs / 1000);
    osc.start(now);
    osc.stop(now + durationMs / 1000 + 0.01);
    await sleep(durationMs);
  }
  async playSilence(durationMs) { await sleep(durationMs); }
  async playMorse(text, unitMs, onChar) {
    this.ensureCtx();
    this.abort = false;
    this.playing = true;
    const chars = normalizeText(text);
    for (let i = 0; i < chars.length; i++) {
      if (this.abort) break;
      const ch = chars[i];
      if (onChar) onChar(ch, i);
      if (ch === " " || ch === "　") { await this.playSilence(unitMs * 7); continue; }
      const code = charToMorse(ch);
      if (!code) { await this.playSilence(unitMs * 3); continue; }
      const parts = code.split(" ");
      for (let p = 0; p < parts.length; p++) {
        if (this.abort) break;
        const part = parts[p];
        for (let j = 0; j < part.length; j++) {
          if (this.abort) break;
          const symbol = part[j];
          if (symbol === ".") await this.playTone(unitMs);
          else if (symbol === "-") await this.playTone(unitMs * 3);
          if (j < part.length - 1) await this.playSilence(unitMs);
        }
        if (p < parts.length - 1) await this.playSilence(unitMs * 3);
      }
      if (i < chars.length - 1) await this.playSilence(unitMs * 3);
    }
    this.playing = false;
  }
  async testTone(ms = 500) { this.ensureCtx(); await this.playTone(ms); }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function toKata(ch) { return HIRA_TO_KATA[ch] || ch; }
function normalizeText(text) {
  let s = text.toUpperCase().replace(/　/g, " ");
  return [...s].map(toKata);
}
function charToMorse(ch) {
  if (DAKUTEN_MAP[ch]) return (WABUN[DAKUTEN_MAP[ch]] || "") + " " + WABUN["゛"];
  if (HANDAKUTEN_MAP[ch]) return (WABUN[HANDAKUTEN_MAP[ch]] || "") + " " + WABUN["゜"];
  if (WABUN[ch]) return WABUN[ch];
  if (INTERNATIONAL[ch]) return INTERNATIONAL[ch];
  const smallMap = { ァ: "ア", ィ: "イ", ゥ: "ウ", ェ: "エ", ォ: "オ", ャ: "ヤ", ュ: "ユ", ョ: "ヨ", ッ: "ツ" };
  if (smallMap[ch] && WABUN[smallMap[ch]]) return WABUN[smallMap[ch]];
  return null;
}
function textToMorseVisual(text) {
  return normalizeText(text).map(c => c === " " ? "/" : (charToMorse(c) || "?")).join(" ");
}
function morseToChar(code, preferWabun = true) {
  const tables = preferWabun ? [WABUN, INTERNATIONAL] : [INTERNATIONAL, WABUN];
  for (const table of tables) {
    for (const [k, v] of Object.entries(table)) if (v === code) return k;
  }
  return null;
}
function speedToUnitMs(speed, isWabun = true) {
  // 高速対応: 最小1ms（理論上1000単位/秒級）
  if (isWabun) return Math.max(1, Math.round(6500 / speed));
  const wpm = speed / 5;
  return Math.max(1, Math.round(1200 / wpm));
}
function randomFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randomChar(charset) {
  let pool = [];
  if (["wabun", "mixed", "all"].includes(charset)) pool = pool.concat(Object.keys(WABUN).filter(k => k.length === 1 && k !== " " && k !== "゛" && k !== "゜"));
  if (["international", "mixed", "all"].includes(charset)) pool = pool.concat("ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""));
  if (["numbers", "all"].includes(charset)) pool = pool.concat("0123456789".split(""));
  if (["symbols", "all"].includes(charset)) pool = pool.concat([".", ",", "?", "/", "-", "(", ")", "ー", "、", "。"]);
  if (!pool.length) pool = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  return randomFrom(pool);
}
function randomWord(charset) {
  if (charset === "wabun") return randomFrom(WORDS_WABUN);
  if (charset === "international") return randomFrom(WORDS_INTERNATIONAL);
  if (charset === "numbers") { let s = ""; for (let i = 0; i < 5; i++) s += Math.floor(Math.random() * 10); return s; }
  if (charset === "symbols") return randomFrom(["SOS", "CQ", "？", "ーーー", "...---..."]);
  return Math.random() < 0.5 ? randomFrom(WORDS_WABUN) : randomFrom(WORDS_INTERNATIONAL);
}
function randomGroup(charset) {
  if (charset === "wabun") {
    let s = ""; const kana = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン";
    for (let i = 0; i < 5; i++) s += kana[Math.floor(Math.random() * kana.length)];
    return s;
  }
  let s = ""; const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
function generatePrompt(mode, charset, customText) {
  if (mode === "custom" && customText && customText.trim()) return customText.trim();
  if (mode === "random-char") {
    let s = ""; const n = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) { s += randomChar(charset); if (i < n - 1 && Math.random() < 0.15) s += " "; }
    return s;
  }
  if (mode === "random-word") {
    const n = 1 + Math.floor(Math.random() * 3); const words = [];
    for (let i = 0; i < n; i++) words.push(randomWord(charset));
    return words.join(" ");
  }
  if (mode === "random-group") {
    const n = 3 + Math.floor(Math.random() * 3); const groups = [];
    for (let i = 0; i < n; i++) groups.push(randomGroup(charset));
    return groups.join(" ");
  }
  return randomWord(charset);
}

const audio = new MorseAudio();
let currentListenPrompt = "";
let currentSendPrompt = "";
let correctCount = 0;
let tryCount = 0;

// ========== Improved Keying (ITU 1:3:7 + auto interval + adaptive unit) ==========
let isKeyDown = false;
let keyDownTime = 0;
let currentSymbols = [];
let decodedText = "";
let lastReleaseTime = 0;
let silenceTimer = null;
let keyOsc = null;
let keyGain = null;
window._keyedHistory = "";

// Adaptive unit estimation (from recent dits)
let adaptiveDitBuffer = []; // recent estimated dit lengths (ms)
const ADAPTIVE_BUF_SIZE = 12;
let adaptiveUnitMs = null; // current estimated unit

const $ = id => document.getElementById(id);

function getManualUnitMs() {
  const speedEl = $("send-speed") || $("free-speed");
  const speed = speedEl ? (parseInt(speedEl.value) || 75) : 75;
  return speedToUnitMs(speed, true);
}

function isAdaptiveEnabled() {
  const el = $("adaptive-unit");
  return el ? el.checked : false;
}

function getCurrentUnitMs() {
  if (isAdaptiveEnabled() && adaptiveUnitMs && adaptiveUnitMs > 0) {
    return Math.max(1, adaptiveUnitMs); // allow very high speed (1ms unit)
  }
  return getManualUnitMs();
}

function getAdaptiveUnitMs() {
  return adaptiveUnitMs;
}

function resetAdaptive() {
  adaptiveDitBuffer = [];
  adaptiveUnitMs = null;
  updateAdaptiveDisplay();
}

function updateAdaptiveFromDuration(duration, isDit) {
  if (!isAdaptiveEnabled()) return;
  let ditEst = isDit ? duration : duration / 3;
  // clamp extreme outliers
  if (ditEst < 1) ditEst = 1;
  if (ditEst > 800) return; // ignore ridiculous holds
  adaptiveDitBuffer.push(ditEst);
  if (adaptiveDitBuffer.length > ADAPTIVE_BUF_SIZE) adaptiveDitBuffer.shift();
  // median for robustness
  const sorted = [...adaptiveDitBuffer].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  adaptiveUnitMs = sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
  updateAdaptiveDisplay();
}

function updateAdaptiveDisplay() {
  const elUnit = $("est-unit");
  const elSpeed = $("est-speed");
  const elDit = $("dit-avg");
  if (!elUnit) return;
  if (adaptiveUnitMs && adaptiveUnitMs > 0) {
    elUnit.textContent = adaptiveUnitMs.toFixed(1);
    // 和文近似: unit ≈ 6500 / speed
    const estSpd = Math.round(6500 / adaptiveUnitMs);
    elSpeed.textContent = String(estSpd);
    const avg = adaptiveDitBuffer.reduce((a, b) => a + b, 0) / adaptiveDitBuffer.length;
    if (elDit) elDit.textContent = avg.toFixed(1);
  } else {
    elUnit.textContent = "—";
    if (elSpeed) elSpeed.textContent = "—";
    if (elDit) elDit.textContent = "—";
  }
}

// expose for free.html
window.getAdaptiveUnitMs = getAdaptiveUnitMs;
window.resetAdaptive = resetAdaptive;

function updateKeyedDisplays() {
  const morseEl = $("keyed-morse") || $("free-keyed-morse");
  const textEl = $("keyed-text") || $("free-keyed-text");
  if (morseEl) {
    const building = currentSymbols.join("");
    morseEl.textContent = (window._keyedHistory || "") + (building ? ((window._keyedHistory ? " " : "") + building) : "") || "";
  }
  if (textEl) textEl.textContent = decodedText + (currentSymbols.length ? "…" : "");
}

function decodeCurrentChar() {
  if (currentSymbols.length === 0) return;
  const code = currentSymbols.join("");
  let ch = morseToChar(code, true) || morseToChar(code, false) || "?";
  decodedText += ch;
  if (!window._keyedHistory) window._keyedHistory = "";
  if (window._keyedHistory) window._keyedHistory += " ";
  window._keyedHistory += code;
  currentSymbols = [];
  updateKeyedDisplays();
}

function scheduleSilenceCheck() {
  if (silenceTimer) clearTimeout(silenceTimer);
  const unit = getCurrentUnitMs();
  silenceTimer = setTimeout(() => {
    const silence = performance.now() - lastReleaseTime;
    const u = getCurrentUnitMs();
    if (silence >= u * 5.5) {
      if (currentSymbols.length > 0) decodeCurrentChar();
      if (decodedText.length > 0 && !decodedText.endsWith(" ")) {
        decodedText += " ";
        if (window._keyedHistory) window._keyedHistory += " / ";
      }
      updateKeyedDisplays();
    } else if (silence >= u * 2.2) {
      decodeCurrentChar();
      silenceTimer = setTimeout(() => {
        const s2 = performance.now() - lastReleaseTime;
        if (s2 >= getCurrentUnitMs() * 5.5) {
          if (decodedText.length > 0 && !decodedText.endsWith(" ")) {
            decodedText += " ";
            if (window._keyedHistory) window._keyedHistory += " / ";
          }
          updateKeyedDisplays();
        }
      }, u * 3.5);
    } else {
      scheduleSilenceCheck();
    }
  }, unit * 2.2);
}

function startKey() {
  if (isKeyDown || audio.playing) return;
  isKeyDown = true;
  if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
  audio.ensureCtx();
  const now = audio.ctx.currentTime;
  keyOsc = audio.ctx.createOscillator();
  keyGain = audio.ctx.createGain();
  keyOsc.type = "sine";
  keyOsc.frequency.value = audio.freq;
  keyGain.gain.setValueAtTime(0, now);
  keyGain.gain.linearRampToValueAtTime(audio.volume, now + 0.003);
  keyOsc.connect(keyGain);
  keyGain.connect(audio.ctx.destination);
  keyOsc.start(now);
  keyDownTime = performance.now();
  const btn = $("key-button") || $("free-key-button");
  if (btn) btn.classList.add("pressed");
}

function endKey() {
  if (!isKeyDown) return;
  isKeyDown = false;
  const duration = performance.now() - keyDownTime;
  const now = audio.ctx ? audio.ctx.currentTime : 0;
  if (keyGain) {
    try {
      keyGain.gain.cancelScheduledValues(now);
      keyGain.gain.setValueAtTime(keyGain.gain.value, now);
      keyGain.gain.linearRampToValueAtTime(0, now + 0.008);
    } catch (e) {}
  }
  if (keyOsc) {
    try { keyOsc.stop(now + 0.02); } catch (e) {}
  }
  keyOsc = null;
  keyGain = null;
  const btn = $("key-button") || $("free-key-button");
  if (btn) btn.classList.remove("pressed");
  const unit = getCurrentUnitMs();
  // 短点判定をやや敏感に (2.0単位未満)
  const isDit = duration < unit * 2.0;
  const symbol = isDit ? "." : "-";
  currentSymbols.push(symbol);
  updateAdaptiveFromDuration(duration, isDit);
  lastReleaseTime = performance.now();
  updateKeyedDisplays();
  scheduleSilenceCheck();
}

function clearKey() {
  if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
  if (isKeyDown) endKey();
  currentSymbols = [];
  decodedText = "";
  window._keyedHistory = "";
  if (typeof resetAdaptive === "function") resetAdaptive();
  updateKeyedDisplays();
  const morseEl = $("keyed-morse") || $("free-keyed-morse");
  const textEl = $("keyed-text") || $("free-keyed-text");
  if (morseEl) morseEl.textContent = "";
  if (textEl) textEl.textContent = "";
}

function setupKeying() {
  let keyHeld = { Space: false, Enter: false };
  function isInputFocused() {
    const ae = document.activeElement;
    return ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable);
  }
  document.addEventListener("keydown", e => {
    if (e.code !== "Space" && e.code !== "Enter") return;
    if (isInputFocused()) return;
    e.preventDefault();
    if (!keyHeld[e.code]) {
      keyHeld[e.code] = true;
      startKey();
    }
  }, { passive: false });
  document.addEventListener("keyup", e => {
    if (e.code !== "Space" && e.code !== "Enter") return;
    if (isInputFocused()) return;
    e.preventDefault();
    if (keyHeld[e.code]) {
      keyHeld[e.code] = false;
      endKey();
    }
  }, { passive: false });
  document.addEventListener("keydown", e => {
    if ((e.code === "Space" || e.code === "Enter") && !isInputFocused()) e.preventDefault();
  }, { passive: false });
  function bindButton(id) {
    const btn = $(id);
    if (!btn) return;
    btn.addEventListener("mousedown", e => { e.preventDefault(); startKey(); });
    btn.addEventListener("mouseup", e => { e.preventDefault(); endKey(); });
    btn.addEventListener("mouseleave", () => { if (isKeyDown) endKey(); });
    btn.addEventListener("touchstart", e => { e.preventDefault(); startKey(); }, { passive: false });
    btn.addEventListener("touchend", e => { e.preventDefault(); endKey(); });
    btn.addEventListener("touchcancel", e => { e.preventDefault(); endKey(); });
  }
  bindButton("key-button");
  bindButton("free-key-button");
}

function initTabs() {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
      tab.classList.add("active");
      $(tab.dataset.tab).classList.add("active");
    });
  });
  document.querySelectorAll(".table-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".table-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      renderTable(tab.dataset.table);
    });
  });
}

function updateUnitDisplay() {
  const speed = parseInt($("listen-speed")?.value) || 75;
  const unit = speedToUnitMs(speed, true);
  if ($("unit-ms-display")) $("unit-ms-display").textContent = unit + " ms";
}

function nextListenPrompt() {
  const mode = $("listen-mode")?.value;
  const charset = $("listen-charset")?.value;
  const custom = $("custom-text")?.value;
  currentListenPrompt = generatePrompt(mode, charset, custom);
  if ($("listen-prompt")) {
    $("listen-prompt").textContent = "（再生後に表示）";
    $("listen-prompt").dataset.hidden = "1";
  }
  if ($("listen-answer")) $("listen-answer").value = "";
  if ($("listen-result")) { $("listen-result").textContent = ""; $("listen-result").className = "result"; }
}

function revealListen() {
  if ($("listen-prompt")) {
    $("listen-prompt").textContent = currentListenPrompt;
    $("listen-prompt").dataset.hidden = "0";
  }
}

async function playListen() {
  if (audio.playing) { audio.stop(); return; }
  if (!currentListenPrompt) nextListenPrompt();
  const speed = parseInt($("listen-speed")?.value) || 75;
  const charset = $("listen-charset")?.value;
  const isWabun = charset === "wabun" || charset === "mixed";
  const unit = speedToUnitMs(speed, isWabun);
  audio.setFreq(parseInt($("freq")?.value) || 700);
  audio.setVolume(parseFloat($("volume")?.value) || 0.4);
  if ($("listen-prompt")) $("listen-prompt").textContent = "再生中...";
  try { await audio.playMorse(currentListenPrompt, unit, null); } catch (e) { console.error(e); }
}

function checkAnswer() {
  const ans = ($("listen-answer")?.value || "").trim().toUpperCase().replace(/\s+/g, " ");
  const expected = currentListenPrompt.toUpperCase().replace(/\s+/g, " ");
  const normAns = normalizeText(ans).join("");
  const normExp = normalizeText(expected).join("");
  tryCount++;
  if ($("try-count")) $("try-count").textContent = tryCount;
  if (normAns === normExp || ans === expected) {
    correctCount++;
    if ($("correct-count")) $("correct-count").textContent = correctCount;
    if ($("listen-result")) { $("listen-result").textContent = "正解！"; $("listen-result").className = "result correct"; }
    revealListen();
    if ($("auto-next")?.checked) setTimeout(() => { nextListenPrompt(); $("listen-answer")?.focus(); }, 800);
  } else {
    if ($("listen-result")) { $("listen-result").textContent = `不正解。正解: ${currentListenPrompt}`; $("listen-result").className = "result wrong"; }
    revealListen();
  }
  if ($("accuracy")) $("accuracy").textContent = tryCount ? Math.round((correctCount / tryCount) * 100) + "%" : "—";
}

function nextSendPrompt() {
  const mode = $("send-mode")?.value;
  const charset = $("send-charset")?.value;
  const custom = $("send-custom-text")?.value;
  currentSendPrompt = generatePrompt(mode, charset, custom);
  if ($("send-prompt")) $("send-prompt").textContent = currentSendPrompt;
  if ($("send-morse-visual")) $("send-morse-visual").textContent = textToMorseVisual(currentSendPrompt);
  clearKey();
}

async function playModel() {
  if (audio.playing) { audio.stop(); return; }
  if (!currentSendPrompt) nextSendPrompt();
  const speed = parseInt($("send-speed")?.value) || 75;
  const charset = $("send-charset")?.value;
  const isWabun = charset === "wabun" || charset === "mixed";
  const unit = speedToUnitMs(speed, isWabun);
  audio.setFreq(parseInt($("freq")?.value) || 700);
  audio.setVolume(parseFloat($("volume")?.value) || 0.4);
  await audio.playMorse(currentSendPrompt, unit, null);
}

function renderTable(type) {
  const container = $("morse-table-container");
  if (!container) return;
  container.innerHTML = "";
  let entries = [];
  if (type === "wabun") entries = Object.entries(WABUN).filter(([k]) => k.length === 1 && k !== " ");
  else if (type === "international") entries = Object.entries(INTERNATIONAL).filter(([k]) => /^[A-Z]$/.test(k));
  else entries = [...Object.entries(INTERNATIONAL).filter(([k]) => /[0-9]/.test(k) || k.length > 1), ...Object.entries(WABUN).filter(([k]) => ["ー", "、", "。", "（", "）", "゛", "゜"].includes(k))];
  entries.forEach(([ch, code]) => {
    const div = document.createElement("div");
    div.className = "table-item";
    div.innerHTML = `<span class="char">${ch}</span><span class="code">${code}</span>`;
    div.addEventListener("click", async () => {
      audio.setFreq(parseInt($("freq")?.value) || 700);
      audio.setVolume(parseFloat($("volume")?.value) || 0.4);
      await audio.playMorse(ch, speedToUnitMs(60, true), null);
    });
    container.appendChild(div);
  });
}

function bindEvents() {
  $("listen-mode")?.addEventListener("change", () => {
    $("custom-area")?.classList.toggle("hidden", $("listen-mode").value !== "custom");
    nextListenPrompt();
  });
  $("send-mode")?.addEventListener("change", () => {
    $("send-custom-area")?.classList.toggle("hidden", $("send-mode").value !== "custom");
    nextSendPrompt();
  });
  $("play-listen")?.addEventListener("click", playListen);
  $("next-listen")?.addEventListener("click", nextListenPrompt);
  $("reveal-listen")?.addEventListener("click", revealListen);
  $("check-answer")?.addEventListener("click", checkAnswer);
  $("listen-answer")?.addEventListener("keydown", e => { if (e.key === "Enter") checkAnswer(); });
  $("stop-audio")?.addEventListener("click", () => audio.stop());
  $("play-model")?.addEventListener("click", playModel);
  $("next-send")?.addEventListener("click", nextSendPrompt);
  $("clear-key")?.addEventListener("click", clearKey);
  $("test-tone")?.addEventListener("click", () => {
    audio.setFreq(parseInt($("freq")?.value) || 700);
    audio.setVolume(parseFloat($("volume")?.value) || 0.4);
    audio.testTone(600);
  });
  $("listen-speed")?.addEventListener("input", updateUnitDisplay);
  $("freq")?.addEventListener("change", () => audio.setFreq(parseInt($("freq").value) || 700));
  $("volume")?.addEventListener("input", () => audio.setVolume(parseFloat($("volume").value) || 0.4));
  ["listen-charset", "listen-mode"].forEach(id => $(id)?.addEventListener("change", nextListenPrompt));
  ["send-charset", "send-mode"].forEach(id => $(id)?.addEventListener("change", nextSendPrompt));
}

document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  bindEvents();
  setupKeying();
  updateUnitDisplay();
  nextListenPrompt();
  nextSendPrompt();
  renderTable("wabun");
});
