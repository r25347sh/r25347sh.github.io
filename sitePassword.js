/**
 * sitePassword.js
 * Highest-priority client-side auth gate for static sites.
 *
 * Session:
 *   - Always: Cookie for 3 days after successful login
 *   - Optional: IndexedDB when user chooses "長く保存"
 *
 * Special role BAN → frozen message
 */

(function () {
  "use strict";

  const DB_NAME = "SitePasswordDB";
  const DB_STORE = "sessions";
  const DB_VERSION = 1;
  const SESSION_KEY = "current";
  const COOKIE_NAME = "sp_session";
  const COOKIE_DAYS = 3;

  let config = {
    allowsExpr: "",
    basePath: "/",
    users: [],
  };
  let currentUser = null;

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
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  async function sha512(str) {
    const buf = await crypto.subtle.digest("SHA-512", new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function isBanned(user) {
    return user && Array.isArray(user.roles) && user.roles.includes("BAN");
  }

  // ===== Cookie helpers =====
  function setCookieSession(user, days) {
    const exp = Date.now() + days * 24 * 60 * 60 * 1000;
    const payload = btoa(
      unescape(
        encodeURIComponent(
          JSON.stringify({ id: user.id, roles: user.roles, exp: exp })
        )
      )
    );
    const maxAge = days * 24 * 60 * 60;
    document.cookie =
      COOKIE_NAME +
      "=" +
      payload +
      "; path=/; max-age=" +
      maxAge +
      "; SameSite=Lax";
  }

  function getCookieSession() {
    const match = document.cookie.match(
      new RegExp("(?:^|; )" + COOKIE_NAME + "=([^;]*)")
    );
    if (!match) return null;
    try {
      const raw = decodeURIComponent(escape(atob(match[1])));
      const data = JSON.parse(raw);
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
    document.cookie =
      COOKIE_NAME + "=; path=/; max-age=0; SameSite=Lax";
  }

  // ===== YAML parser =====
  function parseSimpleYaml(text) {
    const users = [];
    let current = null;
    const lines = text.split(/\r?\n/);

    for (const raw of lines) {
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
      if (roleMatch && current) {
        current.roles.push(roleMatch[1].trim());
      }
    }
    return users;
  }

  // ===== allows DSL =====
  function tokenize(expr) {
    const tokens = [];
    let i = 0;
    const s = expr.replace(/\s+/g, "");
    while (i < s.length) {
      if (s.startsWith("!!", i)) {
        tokens.push({ type: "NOT" });
        i += 2;
        continue;
      }
      if (s[i] === "%") {
        tokens.push({ type: "OR" });
        i++;
        continue;
      }
      if (s[i] === "&") {
        tokens.push({ type: "AND" });
        i++;
        continue;
      }
      if (s[i] === "(") {
        tokens.push({ type: "LPAREN" });
        i++;
        continue;
      }
      if (s[i] === ")") {
        tokens.push({ type: "RPAREN" });
        i++;
        continue;
      }
      const rest = s.slice(i);
      const m = rest.match(/^(role:|ID:)?([A-Za-z0-9_\-\.]+)/i);
      if (m) {
        let kind = "role";
        let value = m[2];
        if (m[1]) {
          kind = m[1].toLowerCase().startsWith("id") ? "id" : "role";
        }
        tokens.push({ type: "ATOM", kind, value });
        i += m[0].length;
        continue;
      }
      i++;
    }
    return tokens;
  }

  function parseAllows(expr) {
    const tokens = tokenize(expr || "");
    let pos = 0;
    function peek() {
      return tokens[pos];
    }
    function consume(type) {
      if (peek() && peek().type === type) return tokens[pos++];
      return null;
    }
    function parseOr() {
      let left = parseAnd();
      while (peek() && peek().type === "OR") {
        consume("OR");
        const right = parseAnd();
        const l = left;
        left = (user) => l(user) || right(user);
      }
      return left;
    }
    function parseAnd() {
      let left = parseNot();
      while (peek() && peek().type === "AND") {
        consume("AND");
        const right = parseNot();
        const l = left;
        left = (user) => l(user) && right(user);
      }
      return left;
    }
    function parseNot() {
      if (peek() && peek().type === "NOT") {
        consume("NOT");
        const inner = parseNot();
        return (user) => !inner(user);
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
        return (user) => {
          if (!user) return false;
          if (atom.kind === "id") return user.id === atom.value;
          return Array.isArray(user.roles) && user.roles.includes(atom.value);
        };
      }
      return () => false;
    }
    return parseOr() || (() => false);
  }

  // ===== IndexedDB =====
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DB_STORE)) {
          db.createObjectStore(DB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function loadIdbSession() {
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(DB_STORE, "readonly");
        const req = tx.objectStore(DB_STORE).get(SESSION_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  async function saveIdbSession(user) {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readwrite");
        tx.objectStore(DB_STORE).put(
          { id: user.id, roles: user.roles, savedAt: Date.now() },
          SESSION_KEY
        );
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn("[sitePassword] saveIdbSession failed", e);
    }
  }

  async function clearIdbSession() {
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(DB_STORE, "readwrite");
        tx.objectStore(DB_STORE).delete(SESSION_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {
      /* ignore */
    }
  }

  async function clearAllSessions() {
    clearCookieSession();
    await clearIdbSession();
  }

  function userMatchesAllows(user) {
    if (!config.allowsExpr) return true;
    return parseAllows(config.allowsExpr)(user);
  }

  async function tryLogin(id, password) {
    const idHash = await sha256(id);
    const passHash = await sha512(password);
    const matched = config.users.find(
      (u) => u.id_hash === idHash && u.pass_hash === passHash
    );
    if (!matched) return null;
    return { id: id, roles: matched.roles.slice() };
  }

  // ===== UI =====
  function ensureStyles() {
    if (document.getElementById("site-password-css")) return;
    const link = document.createElement("link");
    link.id = "site-password-css";
    link.rel = "stylesheet";
    link.href = config.basePath + "sitePassword.css";
    document.head.appendChild(link);
  }

  function createOverlay() {
    if (document.getElementById("site-password-overlay")) {
      return document.getElementById("site-password-overlay");
    }
    const overlay = document.createElement("div");
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

  function showOverlay() {
    ensureStyles();
    const overlay = createOverlay();
    document.body.classList.add("sp-locked", "sp-auth-pending");
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

        form.style.display = "none";
        savePrompt.classList.add("sp-active");

        document.getElementById("sp-save-yes").onclick = async () => {
          await saveIdbSession(user);
          finishAuth();
        };
        document.getElementById("sp-save-no").onclick = () => {
          finishAuth();
        };
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

  function finishAuth() {
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
      document.body.classList.remove("sp-locked", "sp-auth-pending");
      setTimeout(() => {
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 400);
    }, 500);
  }

  window.SitePassword = {
    getUser: () => currentUser,
    logout: async () => {
      currentUser = null;
      await clearAllSessions();
      location.reload();
    },
    hasRole: (role) => currentUser && currentUser.roles.includes(role),
  };

  async function restoreSession() {
    let saved = getCookieSession();
    if (!saved) {
      const idb = await loadIdbSession();
      if (idb && idb.id && Array.isArray(idb.roles)) {
        saved = { id: idb.id, roles: idb.roles };
        setCookieSession(saved, COOKIE_DAYS);
      }
    }
    if (!saved) return null;
    if (isBanned(saved)) {
      await clearAllSessions();
      return null;
    }
    if (!userMatchesAllows(saved)) {
      return null;
    }
    return saved;
  }

  async function bootstrap() {
    const scriptEl = getOwnScript();
    config.allowsExpr = (scriptEl && scriptEl.getAttribute("data-allows")) || "";
    config.basePath = resolveBasePath(scriptEl);

    try {
      const res = await fetch(config.basePath + "sitePassword.yml", {
        cache: "no-cache",
      });
      if (!res.ok) throw new Error("yml fetch failed");
      config.users = parseSimpleYaml(await res.text());
    } catch (e) {
      console.error("[sitePassword] Failed to load sitePassword.yml", e);
    }

    const saved = await restoreSession();
    if (saved) {
      currentUser = saved;
      document.body.classList.remove("sp-auth-pending");
      return;
    }

    if (document.body) {
      showOverlay();
    } else {
      document.addEventListener("DOMContentLoaded", showOverlay, { once: true });
    }
  }

  bootstrap().catch((e) => {
    console.error("[sitePassword] bootstrap error", e);
    if (document.body) showOverlay();
  });
})();
