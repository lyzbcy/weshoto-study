// 用户登录/注册 · auth.js
// 原生 JS，依赖页面已先引入 supabase-js(CDN) 和 supabase-config.js。
// 用「假邮箱」技巧实现纯用户名登录：注册时把用户名拼成 `用户名@weshoto.local`，
// 用户全程只看到"用户名 + 密码"两个框。Supabase 后台需关闭邮箱验证。
// 暴露 window.Auth：{ open(mode), requireLogin(cb), current(), onLogin(cb), onLogout(cb) }
(function () {
  "use strict";

  // 假邮箱域名（不发给真实邮箱，只做 Auth 账号唯一标识）
  var FAKE_DOMAIN = "weshoto.local";

  var SUPA = null;       // supabase client
  var clientReady = false;
  var onLoginCbs = [];
  var onLogoutCbs = [];
  var currentUser = null; // { id, username }

  // —— 初始化 Supabase 客户端 ——
  // config 由 supabase-config.js 提供；占位 key 时降级为「未就绪」，不报错
  function initClient() {
    if (!window.supabase || !window.SUPABASE_CONFIG) return;
    var cfg = window.SUPABASE_CONFIG;
    if (!cfg.url || cfg.url.indexOf("YOUR-PROJECT") !== -1) return; // 占位值，跳过
    try {
      SUPA = window.supabase.createClient(cfg.url, cfg.anonKey);
      // 共享给 comments.js，避免重复建 client
      window.__weshotoSupa = SUPA;
      clientReady = true;
    } catch (e) {
      console.warn("[Auth] Supabase 初始化失败：", e);
    }
  }

  // —— 用户名 → 假邮箱 ——
  function toFakeEmail(username) {
    return username.trim().toLowerCase() + "@" + FAKE_DOMAIN;
  }

  // —— 用户名校验：2~16 位，字母数字下划线中文（防注入、防拼出非法邮箱）——
  function validUsername(name) {
    if (!name) return false;
    var s = name.trim();
    if (s.length < 2 || s.length > 16) return false;
    // 允许中文、字母、数字、下划线、连字符
    return /^[A-Za-z0-9_\-\u4e00-\u9fa5]{2,16}$/.test(s);
  }

  // —— 从 Supabase session 解析出当前用户 ——
  function parseUser(session) {
    if (!session || !session.user) return null;
    var email = session.user.email || "";
    var username = email.split("@")[0];
    return { id: session.user.id, username: username, session: session };
  }

  // —— 会话恢复 + 监听变化 ——
  function initSession() {
    if (!clientReady) {
      renderBar();
      return;
    }
    SUPA.auth.getSession().then(function (res) {
      currentUser = parseUser(res.data && res.data.session);
      renderBar();
      if (currentUser) fireLogin();
    }).catch(function () { renderBar(); });

    SUPA.auth.onAuthStateChange(function (evt, session) {
      var next = parseUser(session);
      var wasIn = !!currentUser;
      currentUser = next;
      renderBar();
      if (!wasIn && next) fireLogin();
      else if (wasIn && !next) fireLogout();
    });
  }

  function fireLogin() {
    var u = currentUser;
    onLoginCbs.forEach(function (cb) { try { cb(u); } catch (e) {} });
  }
  function fireLogout() {
    onLogoutCbs.forEach(function (cb) { try { cb(); } catch (e) {} });
  }

  // ============ UI：右下角入口浮条 ============
  function renderBar() {
    var bar = document.getElementById("authBar");
    if (!bar) return;
    if (currentUser) {
      bar.innerHTML =
        '<button class="auth-btn" title="当前登录用户">' +
          '<span class="emoji">🙋</span><span class="name">' + escapeHtml(currentUser.username) + '</span>' +
        '</button>' +
        '<button class="auth-btn logout" id="authLogoutBtn">退出登录</button>';
      var lo = document.getElementById("authLogoutBtn");
      if (lo) lo.addEventListener("click", doLogout);
    } else {
      bar.innerHTML =
        '<button class="auth-btn" id="authLoginBtn">' +
          '<span class="emoji">🔑</span><span>登录 / 注册</span>' +
        '</button>';
      var lb = document.getElementById("authLoginBtn");
      if (lb) lb.addEventListener("click", function () { open("login"); });
    }
  }

  function injectBar() {
    if (document.getElementById("authBar")) return;
    var bar = document.createElement("div");
    bar.id = "authBar";
    bar.className = "auth-bar";
    document.body.appendChild(bar);
  }

  // ============ UI：登录/注册浮窗 ============
  function injectOverlay() {
    if (document.getElementById("authOverlay")) return;
    var ov = document.createElement("div");
    ov.id = "authOverlay";
    ov.className = "auth-overlay";
    ov.innerHTML =
      '<div class="auth-card">' +
        '<button class="auth-close" id="authClose" aria-label="关闭">×</button>' +
        '<div class="auth-title" id="authTitle">登录</div>' +
        '<div class="auth-sub" id="authSub">登录后就能划选文字、发表评论啦</div>' +
        '<div class="auth-field">' +
          '<label for="authUser">用户名</label>' +
          '<input type="text" id="authUser" autocomplete="username" placeholder="2~16 位，中文/字母/数字">' +
          '<div class="hint">这是你在评论区显示的名字</div>' +
        '</div>' +
        '<div class="auth-field">' +
          '<label for="authPass">密码</label>' +
          '<input type="password" id="authPass" autocomplete="current-password" placeholder="至少 6 位">' +
        '</div>' +
        '<button class="auth-submit" id="authSubmit">登录</button>' +
        '<div class="auth-switch" id="authSwitch">还没有账号？<a id="authSwitchLink">注册一个</a></div>' +
        '<div class="auth-err" id="authErr"></div>' +
        '<div class="auth-loading" id="authLoading">处理中…</div>' +
      '</div>';
    document.body.appendChild(ov);

    document.getElementById("authClose").addEventListener("click", close);
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
    document.getElementById("authSubmit").addEventListener("click", onSubmit);
    document.getElementById("authPass").addEventListener("keydown", function (e) {
      if (e.key === "Enter") onSubmit();
    });
    document.getElementById("authSwitchLink").addEventListener("click", function () {
      toggleMode();
    });
  }

  var mode = "login";
  function setMode(m) {
    mode = m;
    var title = document.getElementById("authTitle");
    var sub = document.getElementById("authSub");
    var btn = document.getElementById("authSubmit");
    var sw = document.getElementById("authSwitch");
    var passInput = document.getElementById("authPass");
    if (m === "login") {
      title.textContent = "登录";
      sub.textContent = "登录后就能划选文字、发表评论啦";
      btn.textContent = "登录";
      sw.innerHTML = '还没有账号？<a id="authSwitchLink">注册一个</a>';
      passInput.setAttribute("autocomplete", "current-password");
    } else {
      title.textContent = "注册新账号";
      sub.textContent = "注册即登录，马上就能开始评论";
      btn.textContent = "注册并登录";
      sw.innerHTML = '已经有账号了？<a id="authSwitchLink">去登录</a>';
      passInput.setAttribute("autocomplete", "new-password");
    }
    var link = document.getElementById("authSwitchLink");
    if (link) link.addEventListener("click", toggleMode);
    hideErr();
  }
  function toggleMode() { setMode(mode === "login" ? "register" : "login"); }

  function open(m) {
    injectOverlay();
    setMode(m || "login");
    document.getElementById("authOverlay").classList.add("show");
    setTimeout(function () {
      var u = document.getElementById("authUser");
      if (u) u.focus();
    }, 50);
  }
  function close() {
    var ov = document.getElementById("authOverlay");
    if (ov) ov.classList.remove("show");
    document.getElementById("authUser").value = "";
    document.getElementById("authPass").value = "";
    hideErr();
  }

  function showErr(msg) {
    var el = document.getElementById("authErr");
    if (el) { el.textContent = msg; el.classList.add("show"); }
  }
  function hideErr() {
    var el = document.getElementById("authErr");
    if (el) { el.textContent = ""; el.classList.remove("show"); }
  }

  function setLoading(on) {
    var btn = document.getElementById("authSubmit");
    var ld = document.getElementById("authLoading");
    if (btn) btn.disabled = on;
    if (ld) ld.style.display = on ? "block" : "none";
  }

  // —— 把 Supabase 错误码翻译成人话 ——
  function humanizeError(err) {
    var msg = (err && err.message) || "";
    if (msg.indexOf("Invalid login credentials") !== -1)
      return "用户名或密码不对";
    if (msg.indexOf("already registered") !== -1 || msg.indexOf("already been registered") !== -1)
      return "这个用户名已经被人注册啦，换一个试试";
    if (msg.indexOf("User already registered") !== -1)
      return "这个用户名已经被人注册啦，换一个试试";
    if (msg.indexOf("Password should be") !== -1)
      return "密码至少要 6 位";
    if (msg.indexOf("Email rate limit") !== -1)
      return "操作太频繁啦，稍等几秒再试";
    if (msg.indexOf("fetch") !== -1 || msg.indexOf("Failed to fetch") !== -1)
      return "网络连不上 Supabase，检查下网络或梯子";
    return "出错了：" + msg;
  }

  // ============ 提交：登录 or 注册 ============
  function onSubmit() {
    hideErr();
    if (!clientReady) {
      showErr("评论服务还没配置好（占位 key），等填入真实 Supabase 地址后再试");
      return;
    }
    var username = (document.getElementById("authUser").value || "").trim();
    var password = document.getElementById("authPass").value || "";

    if (!validUsername(username)) {
      showErr("用户名要 2~16 位，只能中文/字母/数字/下划线");
      return;
    }
    if (password.length < 6) {
      showErr("密码至少 6 位");
      return;
    }

    setLoading(true);
    var email = toFakeEmail(username);

    var promise;
    if (mode === "login") {
      promise = SUPA.auth.signInWithPassword({ email: email, password: password });
    } else {
      promise = SUPA.auth.signUp({ email: email, password: password });
    }

    promise.then(function (res) {
      setLoading(false);
      if (res.error) { showErr(humanizeError(res.error)); return; }
      // 注册：若后台没关邮箱验证，res.user 会存在但没 session
      if (mode === "register" && res.data && res.data.user && !res.data.session) {
        showErr("注册成功，但 Supabase 开了邮箱验证。去 Authentication→Providers→Email 关掉 Confirm email 即可免验证登录");
        return;
      }
      close();
    }).catch(function (err) {
      setLoading(false);
      showErr(humanizeError(err));
    });
  }

  function doLogout() {
    if (!clientReady) return;
    if (!confirm("确定退出登录吗？")) return;
    SUPA.auth.signOut().catch(function () {});
  }

  // ============ 对外 API ============
  window.Auth = {
    open: open,
    close: close,
    // 需登录才能做的操作：已登录直接执行，未登录弹登录框
    requireLogin: function (cb) {
      if (currentUser) { cb(currentUser); return; }
      open("login");
      onLoginCbs.push(function once(u) {
        // 登录成功后执行一次就移除
        var i = onLoginCbs.indexOf(once);
        if (i !== -1) onLoginCbs.splice(i, 1);
        cb(u);
      });
    },
    current: function () { return currentUser; },
    isReady: function () { return clientReady; },
    onLogin: function (cb) { onLoginCbs.push(cb); },
    onLogout: function (cb) { onLogoutCbs.push(cb); }
  };

  // —— 转义，防注入到 innerHTML ——
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  window.Auth._escapeHtml = escapeHtml; // comments.js 复用

  // —— 启动 ——
  function init() {
    initClient();
    injectBar();
    initSession();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
