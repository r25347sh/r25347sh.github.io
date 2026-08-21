/**
 * 高速タイプ 1000Hz対応 精密計測
 * - performance.now() による高精度タイムスタンプ
 * - スライディングウィンドウ Hz 計算
 * - 目標 Hz との差分フィードバック
 * - 文字間隔の自動判読（閾値ベース）
 * - Space / Enter / 画面タップ 対応
 */

(() => {
  "use strict";

  // ========== DOM ==========
  const $ = (id) => document.getElementById(id);

  const elCurrentHz   = $("current-hz");
  const elAvgHz       = $("avg-hz");
  const elPeakHz      = $("peak-hz");
  const elTotalCount  = $("total-count");
  const elElapsed     = $("elapsed");
  const elTargetHz    = $("target-hz");
  const elWindowMs    = $("window-ms");
  const elCharGapMs   = $("char-gap-ms");
  const elAutoChar    = $("auto-char");
  const elSoundOn     = $("sound-on");
  const elToneFreq    = $("tone-freq");
  const elTapBtn      = $("tap-btn");
  const elTargetFb    = $("target-feedback");
  const elCharDisplay = $("char-display");
  const elLastInterval= $("last-interval");
  const elAvgInterval = $("avg-interval");
  const elCharCount   = $("char-count");
  const elIntervalHist= $("interval-history");
  const elResetBtn    = $("reset-btn");
  const elCopyBtn     = $("copy-btn");
  const elKeyArea     = $("key-area");

  // ========== State ==========
  /** @type {number[]} 打鍵タイムスタンプ (performance.now()) */
  let timestamps = [];
  /** @type {number[]} 打鍵間隔 (ms) */
  let intervals = [];
  /** 総打鍵数 */
  let totalCount = 0;
  /** セッション開始時刻 */
  let sessionStart = 0;
  /** 最後の打鍵時刻 */
  let lastTapTime = 0;
  /** 現在の文字内の打鍵数 */
  let currentCharTaps = 0;
  /** 判読された文字群の表現（例: "●● ● ●●●"） */
  let decodedChars = [];
  /** ピーク Hz */
  let peakHz = 0;
  /** 音用 AudioContext */
  let audioCtx = null;
  let gainNode = null;

  // ========== Audio (短いクリック音) ==========
  function ensureAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      gainNode = audioCtx.createGain();
      gainNode.gain.value = 0;
      gainNode.connect(audioCtx.destination);
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }
  }

  function playClick() {
    if (!elSoundOn.checked) return;
    ensureAudio();
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = parseFloat(elToneFreq.value) || 880;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.25, now + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    osc.connect(g);
    g.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  // ========== Core Metrics (厳密計算) ==========
  /**
   * スライディングウィンドウ内の打鍵数から Hz を計算
   * Hz = (ウィンドウ内の打鍵数 - 1) / (最終 - 最初の時刻) * 1000
   * ただし打鍵が1回以下なら 0
   * ウィンドウ外の古いタイムスタンプは除去
   */
  function computeWindowHz(now) {
    const windowMs = Math.max(50, parseFloat(elWindowMs.value) || 1000);
    // 古いものを捨てる
    const cutoff = now - windowMs;
    while (timestamps.length && timestamps[0] < cutoff) {
      timestamps.shift();
    }
    if (timestamps.length < 2) return 0;

    const first = timestamps[0];
    const last  = timestamps[timestamps.length - 1];
    const durationMs = last - first;
    if (durationMs <= 0) return 0;

    // 打鍵数 n 回なら間隔は n-1 個 → 周波数 = (n-1) / T
    const n = timestamps.length;
    const hz = ((n - 1) / durationMs) * 1000;
    return hz;
  }

  /**
   * 全体平均 Hz
   * セッション開始から現在までの総打鍵に基づく
   * 平均Hz = (総打鍵数 - 1) / 経過時間(s)
   */
  function computeAvgHz(now) {
    if (totalCount < 2 || sessionStart === 0) return 0;
    const elapsedMs = now - sessionStart;
    if (elapsedMs <= 0) return 0;
    return ((totalCount - 1) / elapsedMs) * 1000;
  }

  /**
   * 平均間隔 (ms)
   */
  function computeAvgInterval() {
    if (intervals.length === 0) return null;
    const sum = intervals.reduce((a, b) => a + b, 0);
    return sum / intervals.length;
  }

  // ========== UI Update ==========
  function formatHz(v) {
    if (v >= 100) return v.toFixed(1);
    if (v >= 10)  return v.toFixed(2);
    return v.toFixed(2);
  }

  function updateUI(now) {
    const curHz = computeWindowHz(now);
    const avgHz = computeAvgHz(now);

    if (curHz > peakHz) peakHz = curHz;

    elCurrentHz.textContent = formatHz(curHz);
    elAvgHz.textContent     = formatHz(avgHz);
    elPeakHz.textContent    = formatHz(peakHz);
    elTotalCount.textContent= String(totalCount);

    if (sessionStart > 0) {
      const elapsedSec = (now - sessionStart) / 1000;
      elElapsed.textContent = elapsedSec.toFixed(2);
    } else {
      elElapsed.textContent = "0.00";
    }

    // 目標フィードバック
    const target = parseFloat(elTargetHz.value) || 0;
    if (target > 0 && totalCount >= 2) {
      const diff = curHz - target;
      const absDiff = Math.abs(diff);
      let cls = "bad";
      let msg;
      if (absDiff <= target * 0.05 || absDiff <= 0.5) {
        cls = "good";
        msg = `目標達成 ±${absDiff.toFixed(2)} Hz`;
      } else if (absDiff <= target * 0.15) {
        cls = "warn";
        msg = diff > 0
          ? `やや速い (+${diff.toFixed(2)} Hz)`
          : `やや遅い (${diff.toFixed(2)} Hz)`;
      } else {
        msg = diff > 0
          ? `速すぎ (+${diff.toFixed(2)} Hz)`
          : `遅すぎ (${diff.toFixed(2)} Hz)`;
      }
      elTargetFb.textContent = msg;
      elTargetFb.className = "target-feedback " + cls;
    } else if (target > 0) {
      elTargetFb.textContent = `目標 ${target} Hz まであと…`;
      elTargetFb.className = "target-feedback";
    } else {
      elTargetFb.textContent = "目標未設定";
      elTargetFb.className = "target-feedback";
    }

    // 間隔表示
    if (intervals.length > 0) {
      const last = intervals[intervals.length - 1];
      elLastInterval.textContent = last.toFixed(2);
      const avgInt = computeAvgInterval();
      elAvgInterval.textContent = avgInt !== null ? avgInt.toFixed(2) : "—";
    } else {
      elLastInterval.textContent = "—";
      elAvgInterval.textContent = "—";
    }

    elCharCount.textContent = String(decodedChars.length);

    // 履歴（直近最大40件）
    const recent = intervals.slice(-40);
    elIntervalHist.textContent = recent.length
      ? recent.map(v => v.toFixed(1)).join(" · ")
      : "—";

    // 文字表示
    if (decodedChars.length === 0 && currentCharTaps === 0) {
      elCharDisplay.textContent = "（ここに文字群が自動で入ります）";
    } else {
      let s = decodedChars.join(" ");
      if (currentCharTaps > 0) {
        const building = "●".repeat(currentCharTaps);
        s = s ? s + " " + building : building;
      }
      elCharDisplay.textContent = s || "—";
    }
  }

  // ========== Character interval logic ==========
  function flushCurrentChar() {
    if (currentCharTaps > 0) {
      decodedChars.push("●".repeat(currentCharTaps));
      currentCharTaps = 0;
    }
  }

  // ========== Tap handler ==========
  function onTap() {
    const now = performance.now();

    if (sessionStart === 0) {
      sessionStart = now;
    }

    // 間隔計算
    if (lastTapTime > 0) {
      const gap = now - lastTapTime;
      intervals.push(gap);

      // 文字区切り自動判読
      if (elAutoChar.checked) {
        const threshold = Math.max(20, parseFloat(elCharGapMs.value) || 300);
        if (gap >= threshold) {
          // 新しい文字の開始 → 前の文字を確定
          flushCurrentChar();
          currentCharTaps = 1;
        } else {
          currentCharTaps += 1;
        }
      } else {
        currentCharTaps += 1;
      }
    } else {
      // 最初の打鍵
      currentCharTaps = 1;
    }

    timestamps.push(now);
    lastTapTime = now;
    totalCount += 1;

    playClick();
    elTapBtn.classList.add("pressed");
    setTimeout(() => elTapBtn.classList.remove("pressed"), 40);

    updateUI(now);
  }

  // ========== Input bindings ==========
  let keyHeld = { Space: false, Enter: false };

  function isTypingInInput() {
    const ae = document.activeElement;
    if (!ae) return false;
    const tag = ae.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || ae.isContentEditable;
  }

  document.addEventListener("keydown", (e) => {
    if (isTypingInInput()) return;
    if (e.code === "Space" || e.code === "Enter") {
      e.preventDefault();
      if (!keyHeld[e.code]) {
        keyHeld[e.code] = true;
        onTap();
      }
    }
  }, { passive: false });

  document.addEventListener("keyup", (e) => {
    if (e.code === "Space" || e.code === "Enter") {
      keyHeld[e.code] = false;
    }
  });

  // ボタン / 画面タップ
  function bindPointer(el) {
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      onTap();
    });
  }

  bindPointer(elTapBtn);
  // キーエリア全体もタップ可能に（ボタン以外）
  elKeyArea.addEventListener("pointerdown", (e) => {
    if (e.target === elTapBtn || elTapBtn.contains(e.target)) return;
    // 背景タップも許可
    onTap();
  });

  // ========== Reset / Copy ==========
  function resetAll() {
    timestamps = [];
    intervals = [];
    totalCount = 0;
    sessionStart = 0;
    lastTapTime = 0;
    currentCharTaps = 0;
    decodedChars = [];
    peakHz = 0;
    updateUI(performance.now());
  }

  elResetBtn.addEventListener("click", resetAll);

  elCopyBtn.addEventListener("click", async () => {
    const avgInt = computeAvgInterval();
    const now = performance.now();
    const text = [
      `高速タイプ計測結果`,
      `総打鍵数: ${totalCount}`,
      `平均 Hz: ${formatHz(computeAvgHz(now))}`,
      `ピーク Hz: ${formatHz(peakHz)}`,
      `現在 Hz: ${formatHz(computeWindowHz(now))}`,
      `平均間隔: ${avgInt !== null ? avgInt.toFixed(2) + " ms" : "—"}`,
      `文字数: ${decodedChars.length}`,
      `判読: ${decodedChars.join(" ") || "—"}`,
      `経過: ${sessionStart ? ((now - sessionStart) / 1000).toFixed(2) : "0.00"} s`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(text);
      elCopyBtn.textContent = "コピー完了";
      setTimeout(() => { elCopyBtn.textContent = "結果コピー"; }, 1200);
    } catch {
      elCopyBtn.textContent = "失敗";
      setTimeout(() => { elCopyBtn.textContent = "結果コピー"; }, 1200);
    }
  });

  // 設定変更時に即反映
  [elWindowMs, elTargetHz, elCharGapMs].forEach((el) => {
    el.addEventListener("change", () => updateUI(performance.now()));
    el.addEventListener("input", () => updateUI(performance.now()));
  });

  // 定期的にウィンドウHzを減衰表示（打鍵が止まったとき）
  setInterval(() => {
    if (timestamps.length > 0) {
      updateUI(performance.now());
    }
  }, 80);

  // 初期表示
  updateUI(performance.now());
})();
