/**
 * sitePassword.js
 * Auth gate + SP menu (wave) + Display Name (IndexedDB)
 *
 * Session: Cookie 3 days
 * Display Name: IndexedDB per user id
 * BAN (live): popup → logout
 */

(function () {
  "use strict";

  const DB_NAME = "SitePasswordDB";
  const DB_STORE = "sessions";
  const DB_DN_STORE = "displayNames"; // profile objects keyed by user id
  const DB_VERSION = 3;
  const SESSION_KEY = "current";
  const COOKIE_NAME = "sp_session";
  const COOKIE_DAYS = 3;

  let config = { allowsExpr: "", basePath: "/", users: [] };
  let currentUser = null; // { id, roles }
  let profile = { displayName: "", className: "", title: "" };

  // ===== Utils =====
  function getOwnScript() {
    if (document.currentScript) return document.currentScript;
    const scripts = document.querySelectorAll('script[src*="sitePassword.js"]');
    return scripts[scripts.length - 1] || null;
  }

  function resolveBasePath(scriptEl) {
    if (!scriptEl || !scriptEl.src) return "/";
    try {
      const url = new URL(scriptEl.src, location.href);
      const path = url.pathname;
      return path.substring(0, path.lastIndexOf("/") + 1) || "/";
    } catch {
      return "/";
    }
  }

  async function sha256(str) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function sha512(str) {
    const buf = await crypto.subtle.digest("SHA-512", new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function isBanned(user) {
    return user && Array.isArray(user.roles) && user.roles.includes("BAN");
  }

  // ===== Cookie =====
  function setCookieSession(user, days) {
    const exp = Date.now() + days * 24 * 60 * 60 * 1000;
    const payload = btoa(unescape(encodeURIComponent(JSON.stringify({ id: user.id, roles: user.roles, exp }))));
    document.cookie = COOKIE_NAME + "=" + payload + "; path=/; max-age=" + days * 24 * 60 * 60 + "; SameSite=Lax";
  }

  function getCookieSession() {
    const match = document.cookie.match(new RegExp("(?:^|; )" + COOKIE_NAME + "=([^;]*)"));
    if (!match) return null;
    try {
      const data = JSON.parse(decodeURIComponent(escape(atob(match[1]))));
      if (!data || !data.id || !Array.isArray(data.roles)) return null;
      if (data.exp && Date.now() > data.exp) {
        clearCookieSession();
        return null;
      }
      return { id: data.id, roles: data.roles };
    } catch {
      return null;
    }
  }

  function clearCookieSession() {
    document.cookie = COOKIE_NAME + "=; path=/; max-age=0; SameSite=Lax";
  }

  // ===== YAML =====
  function parseSimpleYaml(text) {
    const users = [];
    let current = null;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.replace(/#.*$/, "").trimEnd();
      if (!line.trim()) continue;
      const idMatch = line.match(/^\s*-\s*id_hash:\s*["']?([a-f0-9]+)["']?\s*$/i);
      if (idMatch) {
        current = { id_hash: idMatch[1].toLowerCase(), pass_hash: "", roles: [] };
        users.push(current);
        continue;
      }
      if (!current) continue;
      const passMatch = line.match(/^\s*pass_hash:\s*["']?([a-f0-9]+)["']?\s*$/i);
      if (passMatch) {
        current.pass_hash = passMatch[1].toLowerCase();
        continue;
      }
      if (/^\s*roles:\s*$/.test(line)) continue;
      const roleMatch = line.match(/^\s*-\s*(.+?)\s*$/);
      if (roleMatch) current.roles.push(roleMatch[1].trim());
    }
    return users;
  }

  // ===== allows DSL =====
  function tokenize(expr) {
    const tokens = [];
    let i = 0;
    const s = (expr || "").replace(/\s+/g, "");
    while (i < s.length) {
      if (s.startsWith("!!", i)) { tokens.push({ type: "NOT" }); i += 2; continue; }
      if (s[i] === "%") { tokens.push({ type: "OR" }); i++; continue; }
      if (s[i] === "&") { tokens.push({ type: "AND" }); i++; continue; }
      if (s[i] === "(") { tokens.push({ type: "LPAREN" }); i++; continue; }
      if (s[i] === ")") { tokens.push({ type: "RPAREN" }); i++; continue; }
      const m = s.slice(i).match(/^(role:|ID:)?([A-Za-z0-9_\-\.]+)/i);
      if (m) {
        let kind = "role";
        if (m[1]) kind = m[1].toLowerCase().startsWith("id") ? "id" : "role";
        tokens.push({ type: "ATOM", kind, value: m[2] });
        i += m[0].length;
        continue;
      }
      i++;
    }
    return tokens;
  }

  function parseAllows(expr) {
    const tokens = tokenize(expr);
    let pos = 0;
    const peek = () => tokens[pos];
    const consume = (t) => (peek() && peek().type === t ? tokens[pos++] : null);
    function parseOr() {
      let left = parseAnd();
      while (peek() && peek().type === "OR") {
        consume("OR");
        const right = parseAnd();
        const l = left;
        left = (u) => l(u) || right(u);
      }
      return left;
    }
    function parseAnd() {
      let left = parseNot();
      while (peek() && peek().type === "AND") {
        consume("AND");
        const right = parseNot();
        const l = left;
        left = (u) => l(u) && right(u);
      }
      return left;
    }
    function parseNot() {
      if (peek() && peek().type === "NOT") {
        consume("NOT");
        const inner = parseNot();
        return (u) => !inner(u);
      }
      return parsePrimary();
    }
    function parsePrimary() {
      if (peek() && peek().type === "LPAREN") {
        consume("LPAREN");
        const inner = parseOr();
        consume("RPAREN");
        return inner;
      }
      if (peek() && peek().type === "ATOM") {
        const atom = consume("ATOM");
        return (u) => {
          if (!u) return false;
          if (atom.kind === "id") return u.id === atom.value;
          return Array.isArray(u.roles) && u.roles.includes(atom.value);
        };
      }
      return () => false;
    }
    return parseOr() || (() => false);
  }

  function userMatchesAllows(user) {
    if (!config.allowsExpr) return true;
    return parseAllows(config.allowsExpr)(user);
  }

  // ===== IndexedDB =====
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
        if (!db.objectStoreNames.contains(DB_DN_STORE)) db.createObjectStore(DB_DN_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbGet(store, key) {
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(store, "readonly");
        const r = tx.objectStore(store).get(key);
        r.onsuccess = () => resolve(r.result || null);
        r.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  async function idbPut(store, key, value) {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn("[sitePassword] idbPut", e);
    }
  }

  async function idbDel(store, key) {
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {
      /* ignore */
    }
  }

  function normalizeProfile(v, fallbackId) {
    if (v && typeof v === "object") {
      return {
        displayName: typeof v.displayName === "string" ? v.displayName : (fallbackId || ""),
        className: typeof v.className === "string" ? v.className : "",
        title: typeof v.title === "string" ? v.title : "",
      };
    }
    if (typeof v === "string" && v) {
      return { displayName: v, className: "", title: "" };
    }
    return { displayName: fallbackId || "", className: "", title: "" };
  }

  async function loadProfile(userId) {
    const v = await idbGet(DB_DN_STORE, userId);
    return normalizeProfile(v, userId);
  }

  async function saveProfile(userId, p) {
    await idbPut(DB_DN_STORE, userId, {
      displayName: p.displayName || userId,
      className: p.className || "",
      title: p.title || "",
    });
  }

  async function clearSessionStorage() {
    clearCookieSession();
    await idbDel(DB_STORE, SESSION_KEY);
  }

  // ===== Auth =====
  async function tryLogin(id, password) {
    const idHash = await sha256(id);
    const passHash = await sha512(password);
    const matched = config.users.find((u) => u.id_hash === idHash && u.pass_hash === passHash);
    if (!matched) return null;
    return { id, roles: matched.roles.slice() };
  }

  /** Re-resolve roles from current YAML by id (for BAN live check) */
  async function refreshRolesFromYaml(userId) {
    const idHash = await sha256(userId);
    const matched = config.users.find((u) => u.id_hash === idHash);
    if (!matched) return null;
    return { id: userId, roles: matched.roles.slice() };
  }

  // ===== Styles =====
  function ensureStyles() {
    if (document.getElementById("site-password-css")) return;
    const link = document.createElement("link");
    link.id = "site-password-css";
    link.rel = "stylesheet";
    link.href = config.basePath + "sitePassword.css";
    document.head.appendChild(link);
  }

  // ===== Login overlay =====
  function createLoginOverlay() {
    let overlay = document.getElementById("site-password-overlay");
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.id = "site-password-overlay";
    overlay.innerHTML = `
      <div class="sp-card">
        <div class="sp-logo">SP</div>
        <h1 class="sp-title">Access Required</h1>
        <p class="sp-subtitle">このページは認証が必要です</p>
        <form class="sp-form" id="sp-login-form" autocomplete="on">
          <div class="sp-field">
            <label class="sp-label" for="sp-id">ID</label>
            <input class="sp-input" type="text" id="sp-id" name="id" required autocomplete="username" spellcheck="false" />
          </div>
          <div class="sp-field">
            <label class="sp-label" for="sp-pass">Password</label>
            <input class="sp-input" type="password" id="sp-pass" name="password" required autocomplete="current-password" />
          </div>
          <div class="sp-error" id="sp-error"></div>
          <button type="submit" class="sp-btn" id="sp-submit">ログイン</button>
        </form>
        <div class="sp-save-prompt" id="sp-save-prompt">
          <p class="sp-save-text">このブラウザにログイン情報を長く保存しますか？<br><small style="opacity:.7">（どちらを選んでも3日間は自動で維持されます）</small></p>
          <div class="sp-save-actions">
            <button type="button" class="sp-btn sp-btn-secondary" id="sp-save-no">3日間のみ</button>
            <button type="button" class="sp-btn" id="sp-save-yes">長く保存</button>
          </div>
        </div>
        <div class="sp-success-msg" id="sp-success">認証に成功しました</div>
      </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
  }

  function showLoginOverlay() {
    ensureStyles();
    const overlay = createLoginOverlay();
    document.body.classList.add("sp-locked");
    requestAnimationFrame(() => overlay.classList.add("sp-visible"));

    const form = document.getElementById("sp-login-form");
    const errorEl = document.getElementById("sp-error");
    const submitBtn = document.getElementById("sp-submit");
    const savePrompt = document.getElementById("sp-save-prompt");
    const successMsg = document.getElementById("sp-success");

    form.style.display = "";
    savePrompt.classList.remove("sp-active");
    successMsg.classList.remove("sp-active");
    errorEl.textContent = "";
    errorEl.classList.remove("sp-show");
    submitBtn.disabled = false;
    submitBtn.textContent = "ログイン";

    form.onsubmit = async (e) => {
      e.preventDefault();
      errorEl.classList.remove("sp-show");
      submitBtn.disabled = true;
      submitBtn.textContent = "確認中…";

      const id = document.getElementById("sp-id").value.trim();
      const pass = document.getElementById("sp-pass").value;

      try {
        const user = await tryLogin(id, pass);
        if (!user) {
          errorEl.textContent = "ID または Password が違います";
          errorEl.classList.add("sp-show");
          submitBtn.disabled = false;
          submitBtn.textContent = "ログイン";
          return;
        }
        if (isBanned(user)) {
          errorEl.textContent = "このアカウントは現在凍結されております。";
          errorEl.classList.add("sp-show");
          submitBtn.disabled = false;
          submitBtn.textContent = "ログイン";
          return;
        }
        if (!userMatchesAllows(user)) {
          errorEl.textContent = "このアカウントではこのページにアクセスできません";
          errorEl.classList.add("sp-show");
          submitBtn.disabled = false;
          submitBtn.textContent = "ログイン";
          return;
        }

        currentUser = user;
        setCookieSession(user, COOKIE_DAYS);
        profile = await loadProfile(user.id);

        form.style.display = "none";
        savePrompt.classList.add("sp-active");

        document.getElementById("sp-save-yes").onclick = async () => {
          await idbPut(DB_STORE, SESSION_KEY, { id: user.id, roles: user.roles, savedAt: Date.now() });
          finishLogin();
        };
        document.getElementById("sp-save-no").onclick = () => finishLogin();
      } catch (err) {
        console.error(err);
        errorEl.textContent = "エラーが発生しました";
        errorEl.classList.add("sp-show");
        submitBtn.disabled = false;
        submitBtn.textContent = "ログイン";
      }
    };

    setTimeout(() => document.getElementById("sp-id")?.focus(), 120);
  }

  function finishLogin() {
    const overlay = document.getElementById("site-password-overlay");
    const successMsg = document.getElementById("sp-success");
    const savePrompt = document.getElementById("sp-save-prompt");
    if (savePrompt) savePrompt.classList.remove("sp-active");
    if (successMsg) successMsg.classList.add("sp-active");

    setTimeout(() => {
      if (overlay) {
        overlay.classList.add("sp-hiding");
        overlay.classList.remove("sp-visible");
      }
      document.body.classList.remove("sp-locked");
      setTimeout(() => {
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        mountSpChrome();
      }, 400);
    }, 500);
  }

  // ===== BAN popup =====
  function showBanPopup() {
    ensureStyles();
    if (document.getElementById("sp-ban-popup")) return;
    const el = document.createElement("div");
    el.id = "sp-ban-popup";
    el.innerHTML = `
      <div class="sp-ban-card">
        <div class="sp-ban-icon">⚠</div>
        <p class="sp-ban-text">このアカウントは凍結されたため、ログアウトします。</p>
        <button type="button" class="sp-btn" id="sp-ban-ok">ログアウト</button>
      </div>
    `;
    document.body.appendChild(el);
    document.body.classList.add("sp-locked");
    requestAnimationFrame(() => el.classList.add("sp-visible"));
    document.getElementById("sp-ban-ok").onclick = async () => {
      currentUser = null;
      await clearSessionStorage();
      location.reload();
    };
  }

  // ===== SP chrome: charge edge + menu =====
  function mountSpChrome() {
    if (!currentUser) return;
    ensureStyles();
    if (document.getElementById("sp-edge-frame")) return;

    const frame = document.createElement("div");
    frame.id = "sp-edge-frame";
    frame.innerHTML = `
      <svg class="sp-charge-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="spChargeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#3b9eff" stop-opacity="0"/>
            <stop offset="35%" stop-color="#7cc4ff" stop-opacity="0.55"/>
            <stop offset="50%" stop-color="#e8f4ff" stop-opacity="1"/>
            <stop offset="65%" stop-color="#7cc4ff" stop-opacity="0.55"/>
            <stop offset="100%" stop-color="#3b9eff" stop-opacity="0"/>
          </linearGradient>
          <filter id="spChargeBlur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="0.6"/>
          </filter>
        </defs>
        <rect class="sp-charge-track" x="0.6" y="0.6" width="98.8" height="98.8" rx="2.2" ry="2.2"
              fill="none" stroke="rgba(59,158,255,0.18)" stroke-width="0.35"/>
        <rect class="sp-charge-flow" x="0.6" y="0.6" width="98.8" height="98.8" rx="2.2" ry="2.2"
              fill="none" stroke="url(#spChargeGrad)" stroke-width="0.55"
              stroke-linecap="round" filter="url(#spChargeBlur)"/>
        <rect class="sp-charge-core" x="0.6" y="0.6" width="98.8" height="98.8" rx="2.2" ry="2.2"
              fill="none" stroke="#cfe9ff" stroke-width="0.22"
              stroke-linecap="round"/>
      </svg>
            <button type="button" class="sp-edge-hit sp-edge-hit-bottom" aria-label="SPメニューを開く"></button>
      <button type="button" class="sp-edge-hit sp-edge-hit-left" aria-label="SPメニューを開く"></button>
      <button type="button" class="sp-edge-hit sp-edge-hit-right" aria-label="SPメニューを開く"></button>
      <button type="button" class="sp-edge-fab" id="sp-edge-fab" aria-label="SPメニューを開く">
        <span class="sp-fab-dot"></span>
        <span class="sp-fab-txt">SP</span>
      </button>
    `;

    const panel = document.createElement("div");
    panel.id = "sp-menu-panel";
    panel.innerHTML = `
      <div class="sp-menu-card">
        <header class="sp-menu-head">
          <div class="sp-menu-identity">
            <div class="sp-menu-dn" id="sp-menu-dn"></div>
            <div class="sp-menu-meta">
              <span class="sp-menu-id" id="sp-menu-id"></span>
              <span class="sp-menu-roles" id="sp-menu-roles"></span>
            </div>
          </div>
          <button type="button" class="sp-menu-close" id="sp-menu-close" aria-label="閉じる">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
            </svg>
          </button>
        </header>
        <nav class="sp-menu-list">
          <button type="button" class="sp-menu-item" id="sp-menu-manage">
            <span class="sp-menu-item-label">ユーザー情報</span>
            <span class="sp-menu-item-hint">名前・クラス・肩書</span>
          </button>
          <button type="button" class="sp-menu-item sp-menu-item-danger" id="sp-menu-logout">
            <span class="sp-menu-item-label">ログアウト</span>
            <span class="sp-menu-item-hint">セッション終了</span>
          </button>
        </nav>
        <div class="sp-manage-form" id="sp-manage-form" hidden>
          <div class="sp-field">
            <label class="sp-label" for="sp-dn-input">Display Name</label>
            <input class="sp-input" type="text" id="sp-dn-input" maxlength="40" autocomplete="nickname" placeholder="表示名" />
          </div>
          <div class="sp-field">
            <label class="sp-label" for="sp-class-input">学年クラス</label>
            <select class="sp-input sp-select" id="sp-class-input">
              <option value="">未設定</option><option value="4A">4A</option><option value="4B">4B</option><option value="4C">4C</option><option value="4D">4D</option><option value="4E">4E</option><option value="4F">4F</option><option value="4G">4G</option><option value="4H">4H</option><option value="4I">4I</option><option value="5A">5A</option><option value="5B">5B</option><option value="5C">5C</option><option value="5D">5D</option><option value="5E">5E</option><option value="5F">5F</option><option value="5G">5G</option><option value="5H">5H</option><option value="5I">5I</option><option value="6A">6A</option><option value="6B">6B</option><option value="6C">6C</option><option value="6D">6D</option><option value="6E">6E</option><option value="6F">6F</option><option value="6G">6G</option><option value="6H">6H</option><option value="6I">6I</option>
            </select>
          </div>
          <div class="sp-field">
            <label class="sp-label" for="sp-title-input">役職・肩書等</label>
            <input class="sp-input" type="text" id="sp-title-input" maxlength="60" placeholder="例: 委員長 / 顧問" />
          </div>
          <div class="sp-save-actions">
            <button type="button" class="sp-btn sp-btn-secondary" id="sp-dn-cancel">キャンセル</button>
            <button type="button" class="sp-btn" id="sp-dn-save">保存</button>
          </div>
        </div>
      </div>
    `;

    const backdrop = document.createElement("div");
    backdrop.id = "sp-menu-backdrop";

    document.body.appendChild(backdrop);
    document.body.appendChild(panel);
    document.body.appendChild(frame);

    // perimeter length in viewBox units (approx for rounded rect)
    // set dash so only a bright segment is visible, then animate offset
    requestAnimationFrame(() => {
      const flow = frame.querySelector(".sp-charge-flow");
      const core = frame.querySelector(".sp-charge-core");
      [flow, core].forEach((el, i) => {
        if (!el) return;
        try {
          const len = el.getTotalLength();
          const seg = i === 0 ? len * 0.18 : len * 0.08;
          el.style.strokeDasharray = seg + " " + (len - seg);
          el.style.strokeDashoffset = "0";
          el.style.setProperty("--sp-len", String(len));
        } catch (_) {
          /* getTotalLength may fail on some engines with % viewBox — fallback CSS handles */
        }
      });
    });

    function refreshMenuLabels() {
      const dn = profile.displayName || (currentUser && currentUser.id) || "";
      document.getElementById("sp-menu-dn").textContent = dn;
      const metaBits = [];
      if (currentUser) metaBits.push('<span class="sp-menu-id-text">@' + currentUser.id + "</span>");
      if (profile.className) metaBits.push('<span class="sp-menu-tag">' + profile.className + "</span>");
      if (profile.title) metaBits.push('<span class="sp-menu-tag">' + profile.title + "</span>");
      document.getElementById("sp-menu-id").innerHTML = metaBits.join(" ");
      const rolesEl = document.getElementById("sp-menu-roles");
      if (currentUser && currentUser.roles.length) {
        rolesEl.innerHTML = currentUser.roles
          .map((r) => '<span class="sp-role-chip">' + r + "</span>")
          .join("");
      } else {
        rolesEl.innerHTML = "";
      }
    }

    function openMenu() {
      refreshMenuLabels();
      document.getElementById("sp-manage-form").hidden = true;
      backdrop.classList.add("sp-open");
      panel.classList.add("sp-open");
      frame.classList.add("sp-open");
    }

    function closeMenu() {
      backdrop.classList.remove("sp-open");
      panel.classList.remove("sp-open");
      frame.classList.remove("sp-open");
    }

    frame.querySelectorAll(".sp-edge-hit, #sp-edge-fab").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        openMenu();
      });
    });
    backdrop.addEventListener("click", closeMenu);
    document.getElementById("sp-menu-close").onclick = closeMenu;

    document.getElementById("sp-menu-logout").onclick = async () => {
      currentUser = null;
      await clearSessionStorage();
      location.reload();
    };

    document.getElementById("sp-menu-manage").onclick = () => {
      const form = document.getElementById("sp-manage-form");
      form.hidden = false;
      document.getElementById("sp-dn-input").value =
        profile.displayName || (currentUser && currentUser.id) || "";
      document.getElementById("sp-class-input").value = profile.className || "";
      document.getElementById("sp-title-input").value = profile.title || "";
      document.getElementById("sp-dn-input").focus();
    };

    document.getElementById("sp-dn-cancel").onclick = () => {
      document.getElementById("sp-manage-form").hidden = true;
    };

    document.getElementById("sp-dn-save").onclick = async () => {
      if (!currentUser) return;
      const name = document.getElementById("sp-dn-input").value.trim();
      const className = document.getElementById("sp-class-input").value;
      const title = document.getElementById("sp-title-input").value.trim();
      profile = {
        displayName: name || currentUser.id,
        className: className || "",
        title: title || "",
      };
      await saveProfile(currentUser.id, profile);
      refreshMenuLabels();
      document.getElementById("sp-manage-form").hidden = true;
    };
  }

  // ===== Public API =====
  window.SitePassword = {
    getUser: () => currentUser,
    getDisplayName: () => profile.displayName || (currentUser && currentUser.id) || "",
    getProfile: () => ({ ...profile }),
    logout: async () => {
      currentUser = null;
      await clearSessionStorage();
      location.reload();
    },
    hasRole: (role) => currentUser && currentUser.roles.includes(role),
  };

  // ===== Bootstrap =====
  async function restoreSession() {
    let saved = getCookieSession();
    if (!saved) {
      const idb = await idbGet(DB_STORE, SESSION_KEY);
      if (idb && idb.id && Array.isArray(idb.roles)) {
        saved = { id: idb.id, roles: idb.roles };
        setCookieSession(saved, COOKIE_DAYS);
      }
    }
    if (!saved) return null;

    // Live refresh roles from YAML (detect BAN / role changes)
    const live = await refreshRolesFromYaml(saved.id);
    if (!live) {
      // user removed from yaml
      await clearSessionStorage();
      return null;
    }
    if (isBanned(live)) {
      return { banned: true, user: live };
    }
    if (!userMatchesAllows(live)) {
      return null;
    }
    // keep cookie roles in sync
    setCookieSession(live, COOKIE_DAYS);
    return { banned: false, user: live };
  }

  async function bootstrap() {
    const scriptEl = getOwnScript();
    config.allowsExpr = (scriptEl && scriptEl.getAttribute("data-allows")) || "";
    config.basePath = resolveBasePath(scriptEl);
    ensureStyles();

    try {
      const res = await fetch(config.basePath + "sitePassword.yml", { cache: "no-cache" });
      if (!res.ok) throw new Error("yml fetch failed");
      config.users = parseSimpleYaml(await res.text());
    } catch (e) {
      console.error("[sitePassword] Failed to load sitePassword.yml", e);
    }

    const result = await restoreSession();
    if (result && result.banned) {
      // clear session but show popup first
      await clearSessionStorage();
      if (document.body) showBanPopup();
      else document.addEventListener("DOMContentLoaded", showBanPopup, { once: true });
      return;
    }
    if (result && result.user) {
      currentUser = result.user;
      profile = await loadProfile(currentUser.id);
      const mount = () => mountSpChrome();
      if (document.body) mount();
      else document.addEventListener("DOMContentLoaded", mount, { once: true });
      return;
    }

    if (document.body) showLoginOverlay();
    else document.addEventListener("DOMContentLoaded", showLoginOverlay, { once: true });
  }

  bootstrap().catch((e) => {
    console.error("[sitePassword] bootstrap error", e);
    if (document.body) showLoginOverlay();
  });
})();
