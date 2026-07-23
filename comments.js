// 划选文字评论 · comments.js
// 原生 JS。依赖页面已先引入 supabase-js(CDN)、supabase-config.js、auth.js、auth.css、comments.css。
// 暴露 window.Comments。只作用在章节详情页（正文容器 .main 内）。
//
// 锚点定位策略（务实版）：
//   每条评论记录三件套 [page, section_id, quote]。
//   打开页面时：找到 section_id 对应的 <h2>，在其后的正文文本里搜 quote，
//   命中就包裹成 .cm-highlight 并挂评论气泡角标；搜不到（正文改版）就
//   降级为在该 section 顶部挂一条带 ⚠️「原文已改动」标记的评论。
(function () {
  "use strict";

  var MAIN_SELECTOR = ".main";          // 正文容器（章节页侧边栏之外的正文）
  var SECTION_HEAD = "h2[id^=sec]";     // 章节锚点：<h2 id="sec1">...
  var FLOAT_DEBOUNCE = 120;             // selectionchange 防抖(ms)
  var HIGHLIGHT_MAX_LEN = 140;          // 正文里定位用的原文最长保留长度

  var SUPA = null;
  var ready = false;
  var pageKey = "";                     // 如 "chapter3"
  var mainEl = null;
  var comments = [];                    // 当前页全部评论
  var realtimeChannel = null;

  // ============ 工具 ============
  var escapeHtml = (window.Auth && window.Auth._escapeHtml) || function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  function timeAgo(iso) {
    var t = new Date(iso).getTime();
    var diff = Date.now() - t;
    if (isNaN(diff)) return "";
    var m = Math.floor(diff / 60000);
    if (m < 1) return "刚刚";
    if (m < 60) return m + " 分钟前";
    var h = Math.floor(m / 60);
    if (h < 24) return h + " 小时前";
    var d = Math.floor(h / 24);
    if (d < 30) return d + " 天前";
    return new Date(iso).toLocaleDateString("zh-CN");
  }

  function toast(msg) {
    var t = document.getElementById("cmToast") || (function () {
      var el = document.createElement("div");
      el.id = "cmToast"; el.className = "cm-toast";
      document.body.appendChild(el); return el;
    })();
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.remove("show"); }, 2200);
  }

  // ============ 初始化 ============
  function init() {
    mainEl = document.querySelector(MAIN_SELECTOR);
    if (!mainEl) return; // 非章节页，跳过

    // 推断 pageKey：文件名 chapter3.html → "chapter3"
    var path = location.pathname.split("/").pop() || "";
    var m = path.match(/(chapter\d+)/i);
    pageKey = m ? m[1].toLowerCase() : path.replace(/\.html$/, "");

    waitSupabase(function () {
      SUPA = window.__weshotoSupa;
      ready = true;
      buildUI();
      loadComments();
      bindSelection();
      subscribeRealtime();
    });
  }

  // 等待 auth.js 把 supabase client 挂到 window.__weshotoSupa
  function waitSupabase(cb) {
    if (window.__weshotoSupa) { cb(); return; }
    var n = 0;
    var t = setInterval(function () {
      if (window.__weshotoSupa || ++n > 50) { clearInterval(t); if (window.__weshotoSupa) cb(); }
    }, 100);
  }

  // ============ UI 骨架 ============
  function buildUI() {
    if (document.getElementById("cmPanel")) return;

    // 折叠时的召唤按钮
    var toggle = document.createElement("button");
    toggle.className = "cm-panel-toggle";
    toggle.id = "cmPanelToggle";
    toggle.innerHTML = "💬 评论";
    toggle.addEventListener("click", function () {
      var p = document.getElementById("cmPanel");
      if (p) p.classList.remove("collapsed");
    });
    document.body.appendChild(toggle);

    // 右侧面板
    var panel = document.createElement("div");
    panel.id = "cmPanel";
    panel.className = "cm-panel";
    panel.innerHTML =
      '<div class="cm-panel-head">' +
        '<div class="cm-panel-title">本章评论<span class="count" id="cmCount">0</span></div>' +
        '<div class="cm-panel-actions">' +
          '<button id="cmCollapseBtn" title="收起">›</button>' +
        '</div>' +
      '</div>' +
      '<div class="cm-panel-body" id="cmBody"></div>';
    document.body.appendChild(panel);
    document.getElementById("cmCollapseBtn").addEventListener("click", function () {
      panel.classList.add("collapsed");
    });

    // 输入浮窗
    var compose = document.createElement("div");
    compose.id = "cmCompose";
    compose.className = "cm-compose";
    compose.innerHTML =
      '<div class="cm-compose-card">' +
        '<button class="cm-compose-close" id="cmComposeClose">×</button>' +
        '<div class="cm-compose-title">✏️ 写评论</div>' +
        '<div class="cm-compose-quote" id="cmComposeQuote"></div>' +
        '<textarea id="cmComposeText" placeholder="写下你的理解、疑问或补充…" maxlength="800"></textarea>' +
        '<div class="cm-compose-err" id="cmComposeErr"></div>' +
        '<div class="cm-compose-actions">' +
          '<button class="cancel" id="cmComposeCancel">取消</button>' +
          '<button class="submit" id="cmComposeSubmit">发表</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(compose);
    document.getElementById("cmComposeClose").addEventListener("click", closeCompose);
    document.getElementById("cmComposeCancel").addEventListener("click", closeCompose);
    compose.addEventListener("click", function (e) { if (e.target === compose) closeCompose(); });
    document.getElementById("cmComposeSubmit").addEventListener("click", submitComment);

    renderList();
  }

  // ============ 划选检测 ============
  var selTimer = null;
  function bindSelection() {
    document.addEventListener("mouseup", function (e) {
      clearTimeout(selTimer);
      selTimer = setTimeout(function () { handleSelection(e); }, FLOAT_DEBOUNCE);
    });
    // 触屏
    document.addEventListener("touchend", function (e) {
      clearTimeout(selTimer);
      selTimer = setTimeout(function () { handleSelection(e); }, FLOAT_DEBOUNCE);
    });
    document.addEventListener("scroll", clearFloat, true);
  }

  function removeFloat() {
    var f = document.getElementById("cmFloat");
    if (f) f.parentNode.removeChild(f);
  }
  function clearFloat() { removeFloat(); }

  function handleSelection(e) {
    removeFloat();
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    var text = sel.toString().trim();
    if (!text || text.length < 2) return;

    var range = sel.getRangeAt(0);
    // 必须在正文容器内
    if (!mainEl.contains(range.commonAncestorContainer)) return;
    // 不要在已有评论高亮上重复弹
    var parentEl = range.commonAncestorContainer;
    if (parentEl.nodeType === 3) parentEl = parentEl.parentNode;
    if (parentEl.closest && parentEl.closest(".cm-highlight,.cm-float,.cm-compose,.cm-panel,.auth-overlay,.promo-overlay")) return;

    var rect = range.getBoundingClientRect();
    showFloat(rect.left + rect.width / 2, rect.top + window.scrollY, text);
  }

  function showFloat(x, y, quote) {
    removeFloat();
    var f = document.createElement("button");
    f.id = "cmFloat";
    f.className = "cm-float";
    f.textContent = "💬 评论这段";
    f.style.left = x + "px";
    f.style.top = y + "px";
    f.addEventListener("click", function () {
      removeFloat();
      window.getSelection().removeAllRanges();
      openCompose(quote);
    });
    document.body.appendChild(f);
  }

  // ============ 输入浮窗 ============
  var pendingQuote = "";
  function openCompose(quote) {
    pendingQuote = (quote || "").slice(0, 200);
    var u = window.Auth && window.Auth.current();
    if (!u) {
      // 未登录：先弹登录，登录成功后再开评论框
      window.Auth.requireLogin(function () { openCompose(quote); });
      return;
    }
    if (!document.getElementById("cmCompose")) return;
    document.getElementById("cmComposeQuote").textContent = "「" + pendingQuote + "」";
    document.getElementById("cmComposeText").value = "";
    document.getElementById("cmComposeErr").textContent = "";
    document.getElementById("cmCompose").classList.add("show");
    setTimeout(function () { document.getElementById("cmComposeText").focus(); }, 50);
  }
  function closeCompose() {
    var c = document.getElementById("cmCompose");
    if (c) c.classList.remove("show");
  }

  function submitComment() {
    if (!ready) { toast("评论服务还没就绪"); return; }
    var u = window.Auth && window.Auth.current();
    if (!u) { closeCompose(); window.Auth.open("login"); return; }

    var content = (document.getElementById("cmComposeText").value || "").trim();
    if (!content) { document.getElementById("cmComposeErr").textContent = "写点什么再发表吧"; return; }
    if (content.length > 800) { document.getElementById("cmComposeErr").textContent = "评论最多 800 字"; return; }

    var section = nearestSection();   // { id: "sec4", el: <h2> }
    if (!section) { document.getElementById("cmComposeErr").textContent = "没找到当前所在的小节，换个位置再试"; return; }

    var btn = document.getElementById("cmComposeSubmit");
    btn.disabled = true;
    var row = {
      page: pageKey,
      section_id: section.id,
      quote: pendingQuote,
      content: content,
      user_id: u.id,
      username: u.username
    };
    SUPA.from("comments").insert(row).then(function (res) {
      btn.disabled = false;
      if (res.error) {
        document.getElementById("cmComposeErr").textContent = "发送失败：" + res.error.message;
        return;
      }
      closeCompose();
      toast("评论发表成功 🎉");
      // realtime 会自动把新评论推回来；保险起见手动 reload 一次
      loadComments();
    }).catch(function (err) {
      btn.disabled = false;
      document.getElementById("cmComposeErr").textContent = "网络出错：" + (err.message || err);
    });
  }

  // 找到选区/光标所在最近的 <h2 id="secN">
  function nearestSection() {
    var sel = window.getSelection();
    var node = null;
    if (sel && sel.anchorNode) node = sel.anchorNode;
    if (!node) {
      // 滚动到视口中间的 h2 兜底
      return findSectionByScroll();
    }
    if (node.nodeType === 3) node = node.parentNode;
    var el = node;
    while (el && el !== document.body) {
      if (el.matches && el.matches(SECTION_HEAD)) {
        return { id: el.id, el: el };
      }
      // 向上找：先遇到正文里某元素，再往上找前一个 section h2
      el = el.previousElementSibling || el.parentNode;
    }
    // 兜底：取正文里第一个可见 h2
    return findSectionByScroll();
  }
  function findSectionByScroll() {
    var heads = mainEl.querySelectorAll(SECTION_HEAD);
    var mid = window.scrollY + window.innerHeight / 3;
    var picked = null;
    for (var i = 0; i < heads.length; i++) {
      if (heads[i].offsetTop <= mid) picked = { id: heads[i].id, el: heads[i] };
      else break;
    }
    return picked || (heads[0] ? { id: heads[0].id, el: heads[0] } : null);
  }

  // ============ 加载 & 渲染 ============
  function loadComments() {
    if (!ready) return;
    SUPA.from("comments").select("*").eq("page", pageKey).order("created_at", { ascending: true })
      .then(function (res) {
        if (res.error) { console.warn("[Comments] load error", res.error); return; }
        comments = res.data || [];
        renderList();
        renderHighlights();
      }).catch(function (e) { console.warn("[Comments] load exception", e); });
  }

  function renderList() {
    var body = document.getElementById("cmBody");
    var countEl = document.getElementById("cmCount");
    if (!body) return;
    if (countEl) countEl.textContent = comments.length;

    if (!comments.length) {
      var u = window.Auth && window.Auth.current();
      body.innerHTML =
        '<div class="cm-empty">' +
          '<span class="emoji">💬</span>' +
          (u ? '本章还没有评论。<br>选中正文里的一段文字，就能写下你的理解或疑问。'
             : '本章还没有评论。<br>登录后，选中文字就能发表评论啦。') +
          '<div class="hint">提示：在正文上划选 → 点「评论这段」</div>' +
        '</div>';
      return;
    }

    var me = window.Auth && window.Auth.current();
    var html = "";
    comments.forEach(function (c) {
      var isMine = me && c.user_id === me.id;
      html +=
        '<div class="cm-item' + (isMine ? " mine" : "") + '" data-id="' + c.id + '">' +
          '<div class="cm-item-head">' +
            '<span class="cm-item-author">' + escapeHtml(c.username) + (isMine ? "（我）" : "") + '</span>' +
            '<span class="cm-item-time">' + timeAgo(c.created_at) + '</span>' +
          '</div>' +
          (c.quote ? '<div class="cm-item-quote" data-jump="' + c.id + '">' + escapeHtml(c.quote) + '</div>' : "") +
          '<div class="cm-item-content">' + escapeHtml(c.content) + '</div>' +
          (isMine ? '<button class="cm-item-del" data-del="' + c.id + '">删除</button>' : "") +
        '</div>';
    });
    body.innerHTML = html;

    // 绑定跳转 & 删除
    body.querySelectorAll("[data-jump]").forEach(function (q) {
      q.addEventListener("click", function () { jumpToComment(q.getAttribute("data-jump")); });
    });
    body.querySelectorAll("[data-del]").forEach(function (b) {
      b.addEventListener("click", function () { delComment(b.getAttribute("data-del")); });
    });
  }

  function jumpToComment(id) {
    var c = comments.filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    var head = document.getElementById(c.section_id);
    if (head) head.scrollIntoView({ behavior: "smooth", block: "start" });
    // 高亮该评论对应正文（若有）
    highlightOne(c, true);
    toast("已跳转到「" + (c.quote ? c.quote.slice(0, 16) : c.section_id) + "…」");
  }

  function delComment(id) {
    if (!confirm("删除这条评论吗？")) return;
    var me = window.Auth && window.Auth.current();
    if (!me) return;
    SUPA.from("comments").delete().eq("id", id).eq("user_id", me.id).then(function (res) {
      if (res.error) { toast("删除失败：" + res.error.message); return; }
      toast("已删除");
      loadComments();
    }).catch(function (e) { toast("网络出错"); });
  }

  // ============ 正文高亮 ============
  // 清掉旧标记
  function clearHighlights() {
    mainEl.querySelectorAll(".cm-highlight").forEach(function (el) {
      var parent = el.parentNode;
      parent.replaceChild(document.createTextNode(el.textContent), el);
      parent.normalize();
    });
    mainEl.querySelectorAll(".cm-missing").forEach(function (el) { el.parentNode.removeChild(el); });
  }

  function renderHighlights() {
    clearHighlights();
    // 按 section 分组
    var bySection = {};
    comments.forEach(function (c) {
      if (!bySection[c.section_id]) bySection[c.section_id] = [];
      bySection[c.section_id].push(c);
    });
    Object.keys(bySection).forEach(function (sid) {
      var head = document.getElementById(sid);
      if (!head) return;
      var list = bySection[sid];
      // 统计每个 quote 出现次数（用原文前 40 字做聚合 key）
      var quoteCount = {};
      list.forEach(function (c) {
        if (!c.quote) return;
        var k = c.quote.slice(0, 40);
        quoteCount[k] = (quoteCount[k] || 0) + 1;
      });
      list.forEach(function (c) { highlightOne(c, false, quoteCount); });
    });
  }

  // 在 section 后面的正文里搜 quote 并包裹高亮
  function highlightOne(c, flash, quoteCount) {
    if (!c.quote) return;
    var head = document.getElementById(c.section_id);
    if (!head) return;

    var quote = c.quote;
    var found = wrapTextInSubtree(head, "nextSectionBoundary", quote, c, quoteCount);
    if (!found) {
      // 降级：section 顶部挂缺失标记
      if (!head.dataset.cmMissingShown) {
        head.dataset.cmMissingShown = "1";
        var badge = document.createElement("span");
        badge.className = "cm-missing";
        badge.textContent = "⚠️ 有评论但原文已改动";
        head.appendChild(badge);
      }
    }
    if (flash && found) {
      try { found.classList.add("cm-flash"); } catch (e) {}
      setTimeout(function () { found.classList && found.classList.remove("cm-flash"); }, 1200);
    }
  }

  // 在从 head 到下一个 h2[id^=sec] 之间的文本节点里搜 quote，命中就 wrap
  function wrapTextInSubtree(head, _boundary, quote, comment, quoteCount) {
    var stopAt = nextSectionHead(head);
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    walker.currentNode = head;
    var node = walker.nextNode(); // 先跳到 head 之后
    var lowerQuote = quote.toLowerCase();
    var qlen = quote.length;

    while (node) {
      // 越过下一个 section 头就停
      if (stopAt && (node === stopAt || (stopAt.contains && stopAt.contains(node)))) break;
      // 只在正文容器里找
      if (!mainEl.contains(node)) { node = walker.nextNode(); continue; }
      // 跳过脚本/样式
      var pn = node.parentNode;
      if (pn && (pn.tagName === "SCRIPT" || pn.tagName === "STYLE")) { node = walker.nextNode(); continue; }

      var text = node.nodeValue;
      var idx = text.toLowerCase().indexOf(lowerQuote);
      if (idx !== -1 && idx + qlen <= text.length) {
        // 拆分文本节点并包裹命中段
        var range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, idx + qlen);
        var mark = document.createElement("span");
        mark.className = "cm-highlight";
        var k = quote.slice(0, 40);
        if (quoteCount && quoteCount[k] > 1) {
          mark.classList.add("has-comments");
          mark.setAttribute("data-count", "💬" + quoteCount[k]);
        }
        mark.setAttribute("data-cid", comment.id);
        mark.title = "有评论，点击查看";
        range.surroundContents(mark);
        mark.addEventListener("click", function () { jumpToComment(comment.id); });
        return mark;
      }
      node = walker.nextNode();
    }
    return null;
  }

  function nextSectionHead(head) {
    var heads = mainEl.querySelectorAll(SECTION_HEAD);
    var found = false;
    for (var i = 0; i < heads.length; i++) {
      if (found) return heads[i];
      if (heads[i] === head) found = true;
    }
    return null;
  }

  // ============ 实时推送 ============
  function subscribeRealtime() {
    if (!SUPA || !SUPA.channel) return;
    try {
      realtimeChannel = SUPA.channel("comments-" + pageKey)
        .on("postgres_changes",
          { event: "*", schema: "public", table: "comments", filter: "page=eq." + pageKey },
          function () { loadComments(); })
        .subscribe();
    } catch (e) { /* realtime 不可用就降级，不影响核心功能 */ }
  }

  // ============ 对外 API ============
  window.Comments = {
    reload: loadComments,
    openFor: function (quote) { openCompose(quote); }
  };

  // 启动
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
