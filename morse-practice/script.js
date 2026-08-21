/**
 * 一総通モールス信号練習
 * Web Audio API による正確なトーン生成
 * 和文・欧文・数字・記号対応
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

// 和文モールス（カタカナ基準。ひらがなも同じ符号）
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
  // 濁点・半濁点は別符号として扱い、基本文字の後に続ける
  ゛: "..", ゜: "..--.",
  // 記号
  ー: ".--.-", "、": ".-.-.-", "。": ".-.-..",
  "（": "-.--.-", "）": ".-..-.",
  // 本文・訂正など
  ホレ: "-..---", ラタ: "...-.",
  " ": " "
};

// ひらがな → カタカナ変換マップ用
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

// 濁音・半濁音を分解するためのマップ
const DAKUTEN_MAP = {
  ガ: "カ", ギ: "キ", グ: "ク", ゲ: "ケ", ゴ: "コ",
  ザ: "サ", ジ: "シ", ズ: "ス", ゼ: "セ", ゾ: "ソ",
  ダ: "タ", ヂ: "チ", ヅ: "ツ", デ: "テ", ド: "ト",
  バ: "ハ", ビ: "ヒ", ブ: "フ", ベ: "ヘ", ボ: "ホ"
};
const HANDAKUTEN_MAP = {
  パ: "ハ", ピ: "ヒ", プ: "フ", ペ: "ヘ", ポ: "ホ"
};

// ========== Word Lists (大量) ==========
const WORDS_WABUN = [
  "デンパ", "ムセン", "ツウシン", "デンシン", "ソウシン", "ジュシン",
  "アンテナ", "デンアツ", "デンリュウ", "シュウハスウ", "デンパホウ",
  "ムセンキ", "ソウチ", "キカイ", "デンゲン", "カイセン", "カイガンキョク",
  "センパク", "センスイカン", "コクサイ", "ツウシンシ", "ソウゴウ",
  "デンキ", "ツウシンジュツ", "モルス", "フゴウ", "オンキョウ",
  "ワブン", "オウブン", "アング", "フツウゴ", "テガミ", "デンポウ",
  "ハッシン", "ジュシンキョク", "ジコク", "ニチジ", "キゴウ",
  "タンテン", "チョウテン", "スペース", "キード", "デンケン",
  "シケン", "ゴウカク", "レンシュウ", "ソクド", "セイカク",
  "カイジョウ", "リクジョウ", "クウチュウ", "エイセイ", "タンパ",
  "チョウハ", "チュウハ", "タンチョウハ", "マイクロ", "イチソウツウ",
  "ニソウツウ", "サンソウツウ", "アマチュア", "ギジュツ", "ホウキ",
  "エイゴ", "チリ", "デンキコウガク", "キソ", "エイ", "ビー",
  "ソウナン", "キュウジョ", "エスイーオー", "メイワク", "ボウガイ",
  "カンシ", "カンソク", "ジッケン", "ケンキュウ", "カイハツ",
  "セイノウ", "シンライセイ", "アンゼン", "ヒジョウ", "ヨビ",
  "ホンブン", "シュウセイ", "シュウリョウ", "カイシ", "オワリ",
  "アリガトウ", "オハヨウ", "コンニチハ", "サヨウナラ", "オイデ",
  "キテ", "イキマス", "カエリマス", "ワカリマシタ", "チガイマス",
  "セイカイ", "フセイカイ", "マチガイ", "タダシイ", "ハヤイ",
  "オソイ", "ヨイ", "ワルイ", "オオキイ", "チイサイ"
];

const WORDS_INTERNATIONAL = [
  "RADIO", "MORSE", "CODE", "SIGNAL", "CQ", "DX", "QSO", "QTH",
  "QRZ", "QSL", "QRM", "QRN", "QSB", "QSY", "QRT", "QRV",
  "SHIP", "COAST", "STATION", "OPERATOR", "LICENSE", "EXAM",
  "PRACTICE", "SPEED", "ACCURACY", "FREQUENCY", "ANTENNA",
  "TRANSMIT", "RECEIVE", "POWER", "VOLTAGE", "CURRENT",
  "AMPLIFIER", "OSCILLATOR", "FILTER", "MIXER", "DETECTOR",
  "HELLO", "WORLD", "TEST", "MESSAGE", "URGENT", "SOS",
  "MAYDAY", "PAN", "SECURITE", "WEATHER", "POSITION",
  "LATITUDE", "LONGITUDE", "COURSE", "SPEED", "ETA",
  "ARRIVAL", "DEPARTURE", "CARGO", "PASSENGER", "CREW",
  "CAPTAIN", "ENGINEER", "NAVIGATOR", "RADIOMAN",
  "TOKYO", "OSAKA", "YOKOHAMA", "KOBE", "NAGOYA",
  "PACIFIC", "ATLANTIC", "INDIAN", "OCEAN", "SEA",
  "WAVE", "BAND", "CHANNEL", "CALLSIGN", "PREFIX",
  "SUFFIX", "NUMBER", "LETTER", "SYMBOL", "GROUP",
  "FIVE", "LETTER", "CIPHER", "PLAIN", "TEXT",
  "COPY", "SOLID", "RPT", "AGAIN", "CONFIRM",
  "ROGER", "WILCO", "OVER", "OUT", "BREAK",
  "STAND", "BY", "WAIT", "READY", "GO", "AHEAD"
];

const GROUPS_SAMPLE = [
  "ABCDE", "FGHIJ", "KLMNO", "PQRST", "UVWXY", "Z1234",
  "56789", "QWERTY", "ASDFG", "ZXCVB", "12345", "67890",
  "SOSOS", "CQDX", "TEST1", "TEST2", "AAAAA", "EEEEE",
  "アカサタナ", "ハマヤラワ", "イキシチニ", "ヒミリヰ",
  "ウクスツヌ", "フムユルン", "エケセテネ", "ヘメレヱ",
  "オコソトノ", "ホモヨロン"
];

// ========== Audio Engine ==========
class MorseAudio {
  constructor() {
    this.ctx = null;
    this.gain = null;
    this.osc = null;
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
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  setFreq(f) {
    this.freq = f;
  }

  setVolume(v) {
    this.volume = v;
  }

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

  async playSilence(durationMs) {
    await sleep(durationMs);
  }

  /**
   * text をモールス再生
   * unitMs: 短点の長さ(ms)
   * onChar: 各文字開始時コールバック
   */
  async playMorse(text, unitMs, onChar) {
    this.ensureCtx();
    this.abort = false;
    this.playing = true;

    const chars = normalizeText(text);
    for (let i = 0; i < chars.length; i++) {
      if (this.abort) break;
      const ch = chars[i];
      if (onChar) onChar(ch, i);

      if (ch === " " || ch === "　") {
        await this.playSilence(unitMs * 7);
        continue;
      }

      const code = charToMorse(ch);
      if (!code) {
        await this.playSilence(unitMs * 3);
        continue;
      }

      // 濁点・半濁点は複数符号になる場合がある
      const parts = code.split(" ");
      for (let p = 0; p < parts.length; p++) {
        if (this.abort) break;
        const part = parts[p];
        for (let j = 0; j < part.length; j++) {
          if (this.abort) break;
          const symbol = part[j];
          if (symbol === ".") {
            await this.playTone(unitMs);
          } else if (symbol === "-") {
            await this.playTone(unitMs * 3);
          }
          if (j < part.length - 1) {
            await this.playSilence(unitMs);
          }
        }
        if (p < parts.length - 1) {
          await this.playSilence(unitMs * 3); // 文字内の濁点など
        }
      }
      // 文字間
      if (i < chars.length - 1) {
        await this.playSilence(unitMs * 3);
      }
    }
    this.playing = false;
  }

  async testTone(ms = 500) {
    this.ensureCtx();
    await this.playTone(ms);
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ========== Text / Morse helpers ==========
function toKata(ch) {
  if (HIRA_TO_KATA[ch]) return HIRA_TO_KATA[ch];
  return ch;
}

function normalizeText(text) {
  // ひらがな→カタカナ、全角英数→半角など簡易
  let s = text.toUpperCase().replace(/　/g, " ");
  const result = [];
  for (const ch of s) {
    const k = toKata(ch);
    result.push(k);
  }
  return result;
}

function charToMorse(ch) {
  // 濁音・半濁音分解
  if (DAKUTEN_MAP[ch]) {
    const base = DAKUTEN_MAP[ch];
    return (WABUN[base] || "") + " " + WABUN["゛"];
  }
  if (HANDAKUTEN_MAP[ch]) {
    const base = HANDAKUTEN_MAP[ch];
    return (WABUN[base] || "") + " " + WABUN["゜"];
  }
  if (WABUN[ch]) return WABUN[ch];
  if (INTERNATIONAL[ch]) return INTERNATIONAL[ch];
  // 小書きなどは親文字に
  const smallMap = { ァ: "ア", ィ: "イ", ゥ: "ウ", ェ: "エ", ォ: "オ", ャ: "ヤ", ュ: "ユ", ョ: "ヨ", ッ: "ツ" };
  if (smallMap[ch] && WABUN[smallMap[ch]]) return WABUN[smallMap[ch]];
  return null;
}

function textToMorseVisual(text) {
  const chars = normalizeText(text);
  return chars.map(c => {
    if (c === " ") return "/";
    const m = charToMorse(c);
    return m || "?";
  }).join(" ");
}

function morseToChar(code, preferWabun = true) {
  // 逆引き（簡易）
  const tables = preferWabun ? [WABUN, INTERNATIONAL] : [INTERNATIONAL, WABUN];
  for (const table of tables) {
    for (const [k, v] of Object.entries(table)) {
      if (v === code) return k;
    }
  }
  return null;
}

// ========== Speed calculation ==========
/**
 * 字/分 → 短点ms
 * 和文: おおよそ1文字あたり平均4〜5単位程度として概算
 * 簡易: unitMs = 60000 / (charsPerMin *  averageUnitsPerChar)
 * ここでは実用的に:
 * 75字/分 和文 ≈ unit 約 80-100ms 程度を目標に調整
 */
function speedToUnitMs(speed, isWabun = true) {
  // 経験的な係数
  // 欧文 WPM: PARIS標準で1語=50単位、1WPM = 50 units/min → unit = 1200/WPM ms
  // 和文は文字数ベースなので別係数
  if (isWabun) {
    // 75字/分で unit ≈ 90ms 前後になるよう
    return Math.max(20, Math.round(6500 / speed));
  } else {
    // 欧文: 100字/分 ≈ 20WPM 程度
    const wpm = speed / 5;
    return Math.max(20, Math.round(1200 / wpm));
  }
}

// ========== Random generators ==========
function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomChar(charset) {
  let pool = [];
  if (charset === "wabun" || charset === "mixed" || charset === "all") {
    pool = pool.concat(Object.keys(WABUN).filter(k => k.length === 1 && k !== " " && k !== "゛" && k !== "゜"));
  }
  if (charset === "international" || charset === "mixed" || charset === "all") {
    pool = pool.concat("ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""));
  }
  if (charset === "numbers" || charset === "all") {
    pool = pool.concat("0123456789".split(""));
  }
  if (charset === "symbols" || charset === "all") {
    pool = pool.concat([".", ",", "?", "/", "-", "(", ")", "ー", "、", "。"]);
  }
  if (pool.length === 0) pool = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  return randomFrom(pool);
}

function randomWord(charset) {
  if (charset === "wabun") return randomFrom(WORDS_WABUN);
  if (charset === "international") return randomFrom(WORDS_INTERNATIONAL);
  if (charset === "numbers") {
    let s = "";
    for (let i = 0; i < 5; i++) s += Math.floor(Math.random() * 10);
    return s;
  }
  if (charset === "symbols") {
    return randomFrom(["SOS", "CQ", "？", "ーーー", "...---..."]);
  }
  // mixed / all
  return Math.random() < 0.5 ? randomFrom(WORDS_WABUN) : randomFrom(WORDS_INTERNATIONAL);
}

function randomGroup(charset) {
  if (charset === "wabun") {
    let s = "";
    const kana = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン";
    for (let i = 0; i < 5; i++) s += kana[Math.floor(Math.random() * kana.length)];
    return s;
  }
  let s = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function generatePrompt(mode, charset, customText) {
  if (mode === "custom" && customText && customText.trim()) {
    return customText.trim();
  }
  if (mode === "random-char") {
    let s = "";
    const n = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      s += randomChar(charset);
      if (i < n - 1 && Math.random() < 0.15) s += " ";
    }
    return s;
  }
  if (mode === "random-word") {
    const n = 1 + Math.floor(Math.random() * 3);
    const words = [];
    for (let i = 0; i < n; i++) words.push(randomWord(charset));
    return words.join(" ");
  }
  if (mode === "random-group") {
    const n = 3 + Math.floor(Math.random() * 3);
    const groups = [];
    for (let i = 0; i < n; i++) groups.push(randomGroup(charset));
    return groups.join(" ");
  }
  return randomWord(charset);
}

// ========== App State ==========
const audio = new MorseAudio();
let currentListenPrompt = "";
let currentSendPrompt = "";
let correctCount = 0;
let tryCount = 0;
let keyDownTime = 0;
let keyedSymbols = [];
let keyTimer = null;

// ========== DOM ==========
const $ = id => document.getElementById(id);

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
  const speed = parseInt($("listen-speed").value) || 75;
  const unit = speedToUnitMs(speed, true);
  $("unit-ms-display").textContent = unit + " ms";
}

function nextListenPrompt() {
  const mode = $("listen-mode").value;
  const charset = $("listen-charset").value;
  const custom = $("custom-text").value;
  currentListenPrompt = generatePrompt(mode, charset, custom);
  $("listen-prompt").textContent = "（再生後に表示）";
  $("listen-prompt").dataset.hidden = "1";
  $("listen-answer").value = "";
  $("listen-result").textContent = "";
  $("listen-result").className = "result";
}

function revealListen() {
  $("listen-prompt").textContent = currentListenPrompt;
  $("listen-prompt").dataset.hidden = "0";
}

async function playListen() {
  if (audio.playing) {
    audio.stop();
    return;
  }
  if (!currentListenPrompt) nextListenPrompt();
  const speed = parseInt($("listen-speed").value) || 75;
  const charset = $("listen-charset").value;
  const isWabun = charset === "wabun" || charset === "mixed";
  const unit = speedToUnitMs(speed, isWabun);
  audio.setFreq(parseInt($("freq").value) || 700);
  audio.setVolume(parseFloat($("volume").value) || 0.4);

  $("listen-prompt").textContent = "再生中...";
  try {
    await audio.playMorse(currentListenPrompt, unit, null);
  } catch (e) {
    console.error(e);
  }
  if (!audio.abort) {
    // 自動では見せない。ユーザーが「お題を表示」か判定で見る
  }
}

function checkAnswer() {
  const ans = $("listen-answer").value.trim().toUpperCase().replace(/\s+/g, " ");
  const expected = currentListenPrompt.toUpperCase().replace(/\s+/g, " ");
  // ひらがな/カタカナ正規化して比較
  const normAns = normalizeText(ans).join("");
  const normExp = normalizeText(expected).join("");
  tryCount++;
  $("try-count").textContent = tryCount;

  if (normAns === normExp || ans === expected) {
    correctCount++;
    $("correct-count").textContent = correctCount;
    $("listen-result").textContent = "正解！";
    $("listen-result").className = "result correct";
    revealListen();
    if ($("auto-next").checked) {
      setTimeout(() => {
        nextListenPrompt();
        $("listen-answer").focus();
      }, 800);
    }
  } else {
    $("listen-result").textContent = `不正解。正解: ${currentListenPrompt}`;
    $("listen-result").className = "result wrong";
    revealListen();
  }
  $("accuracy").textContent = tryCount ? Math.round((correctCount / tryCount) * 100) + "%" : "—";
}

function nextSendPrompt() {
  const mode = $("send-mode").value;
  const charset = $("send-charset").value;
  const custom = $("send-custom-text").value;
  currentSendPrompt = generatePrompt(mode, charset, custom);
  $("send-prompt").textContent = currentSendPrompt;
  $("send-morse-visual").textContent = textToMorseVisual(currentSendPrompt);
  keyedSymbols = [];
  $("keyed-morse").textContent = "";
  $("keyed-text").textContent = "";
}

async function playModel() {
  if (audio.playing) {
    audio.stop();
    return;
  }
  if (!currentSendPrompt) nextSendPrompt();
  const speed = parseInt($("send-speed").value) || 75;
  const charset = $("send-charset").value;
  const isWabun = charset === "wabun" || charset === "mixed";
  const unit = speedToUnitMs(speed, isWabun);
  audio.setFreq(parseInt($("freq").value) || 700);
  audio.setVolume(parseFloat($("volume").value) || 0.4);
  await audio.playMorse(currentSendPrompt, unit, null);
}

// キーイング（簡易：スペース or ボタンでトーン、長さで短点/長点判定）
function startKey() {
  if (audio.playing) return;
  audio.ensureCtx();
  keyDownTime = performance.now();
  // 連続トーン開始
  const osc = audio.ctx.createOscillator();
  const g = audio.ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = audio.freq;
  g.gain.value = audio.volume;
  osc.connect(g);
  g.connect(audio.ctx.destination);
  osc.start();
  audio._keyOsc = osc;
  audio._keyGain = g;
  $("key-button").classList.add("pressed");
}

function endKey() {
  if (!audio._keyOsc) return;
  const duration = performance.now() - keyDownTime;
  audio._keyOsc.stop();
  audio._keyOsc = null;
  audio._keyGain = null;
  $("key-button").classList.remove("pressed");

  // 判定: 短点の目安を現在の速度から
  const speed = parseInt($("send-speed").value) || 75;
  const unit = speedToUnitMs(speed, true);
  const symbol = duration < unit * 2 ? "." : "-";
  keyedSymbols.push(symbol);
  $("keyed-morse").textContent = keyedSymbols.join("");
}

function clearKey() {
  keyedSymbols = [];
  $("keyed-morse").textContent = "";
  $("keyed-text").textContent = "";
}

// キーボード対応
function setupKeying() {
  let spaceDown = false;
  document.addEventListener("keydown", e => {
    if (e.code === "Space" && !spaceDown && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") {
      e.preventDefault();
      spaceDown = true;
      startKey();
    }
  });
  document.addEventListener("keyup", e => {
    if (e.code === "Space" && spaceDown) {
      e.preventDefault();
      spaceDown = false;
      endKey();
    }
  });

  const btn = $("key-button");
  btn.addEventListener("mousedown", e => { e.preventDefault(); startKey(); });
  btn.addEventListener("mouseup", e => { e.preventDefault(); endKey(); });
  btn.addEventListener("mouseleave", () => { if (audio._keyOsc) endKey(); });
  btn.addEventListener("touchstart", e => { e.preventDefault(); startKey(); }, { passive: false });
  btn.addEventListener("touchend", e => { e.preventDefault(); endKey(); });
}

function renderTable(type) {
  const container = $("morse-table-container");
  container.innerHTML = "";
  let entries = [];
  if (type === "wabun") {
    entries = Object.entries(WABUN).filter(([k]) => k.length === 1 && k !== " ");
  } else if (type === "international") {
    entries = Object.entries(INTERNATIONAL).filter(([k]) => /^[A-Z]$/.test(k));
  } else {
    entries = [
      ...Object.entries(INTERNATIONAL).filter(([k]) => /[0-9]/.test(k) || k.length > 1),
      ...Object.entries(WABUN).filter(([k]) => ["ー", "、", "。", "（", "）", "゛", "゜"].includes(k))
    ];
  }
  entries.forEach(([ch, code]) => {
    const div = document.createElement("div");
    div.className = "table-item";
    div.innerHTML = `<span class="char">${ch}</span><span class="code">${code}</span>`;
    div.addEventListener("click", async () => {
      audio.setFreq(parseInt($("freq").value) || 700);
      audio.setVolume(parseFloat($("volume").value) || 0.4);
      const unit = speedToUnitMs(60, true);
      await audio.playMorse(ch, unit, null);
    });
    container.appendChild(div);
  });
}

// ========== Event binding ==========
function bindEvents() {
  $("listen-mode").addEventListener("change", () => {
    $("custom-area").classList.toggle("hidden", $("listen-mode").value !== "custom");
    nextListenPrompt();
  });
  $("send-mode").addEventListener("change", () => {
    $("send-custom-area").classList.toggle("hidden", $("send-mode").value !== "custom");
    nextSendPrompt();
  });

  $("play-listen").addEventListener("click", playListen);
  $("next-listen").addEventListener("click", nextListenPrompt);
  $("reveal-listen").addEventListener("click", revealListen);
  $("check-answer").addEventListener("click", checkAnswer);
  $("listen-answer").addEventListener("keydown", e => {
    if (e.key === "Enter") checkAnswer();
  });
  $("stop-audio").addEventListener("click", () => audio.stop());

  $("play-model").addEventListener("click", playModel);
  $("next-send").addEventListener("click", nextSendPrompt);
  $("clear-key").addEventListener("click", clearKey);

  $("test-tone").addEventListener("click", () => {
    audio.setFreq(parseInt($("freq").value) || 700);
    audio.setVolume(parseFloat($("volume").value) || 0.4);
    audio.testTone(600);
  });

  $("listen-speed").addEventListener("input", updateUnitDisplay);
  $("freq").addEventListener("change", () => audio.setFreq(parseInt($("freq").value) || 700));
  $("volume").addEventListener("input", () => audio.setVolume(parseFloat($("volume").value) || 0.4));

  ["listen-charset", "listen-mode"].forEach(id => {
    $(id).addEventListener("change", nextListenPrompt);
  });
  ["send-charset", "send-mode"].forEach(id => {
    $(id).addEventListener("change", nextSendPrompt);
  });
}

// ========== Init ==========
document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  bindEvents();
  setupKeying();
  updateUnitDisplay();
  nextListenPrompt();
  nextSendPrompt();
  renderTable("wabun");
});
