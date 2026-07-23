// 捞鱼工作室导流入口 · promo.js
// 原生 JS，无依赖。在每个页面 <body> 末尾引入 promo.css + promo.js 即可。
// 四大入口：作者介绍 + QQ群 + 赞赏 + 微信表情包
(function () {
  "use strict";

  // —— 配置（按 skill 默认值，可改）——
  // 站点根路径：本仓库部署在 https://lyzbcy.github.io/weshoto-study/（GitHub 项目站）。
  // promo.js 被根目录、trainee/、tools/ 三类页面共用，图片必须用"根相对路径"
  // （即 /weshoto-study/ 开头），否则在子目录页（trainee/*.html、tools/*.html）
  // 会解析成 trainee/img/... → 404 裂图。
  var BASE = "/weshoto-study/";
  var CONFIG = {
    studio: "捞鱼工作室",
    author: "捞鱼",
    tagline: "一个弱小但有梦想的开发者",   // 作者一句话签名
    home: "https://lyzbcy.github.io/",
    about: "https://lyzbcy.github.io/about/", // 作者主页（更详细介绍）
    // 作者头像（固定 URL，imgtu 图床）
    avatar: "https://s41.ax1x.com/2025/12/05/pZmPZPH.png",
    // QQ群二维码（自托管，根相对路径）
    qqGroupImg: BASE + "img/qq-group.jpg",
    qqGroupTip: "📱 长按或扫码加群 · 也可以直接搜索群号",
    // 赞赏二维码（自托管，根相对路径）
    rewardImg: BASE + "img/reward-qr.jpg",
    rewardTip: "📱 长按或扫码赞赏 · 金额随意，心意到就好",
    // 微信表情包下载二维码（自托管，根相对路径）
    stickerQr: BASE + "img/sticker/sticker-qr.png",
    stickerTip: "📱 长按或扫码 · 微信里也能用这些表情"
  };

  // 注入顶部浮条
  function injectBar() {
    if (document.getElementById("promoBar")) return;
    var bar = document.createElement("div");
    bar.id = "promoBar";
    bar.className = "promo-bar";
    bar.innerHTML =
      '<button class="promo-btn" id="promoAboutBtn"><span class="emoji">🐟</span>关于捞鱼</button>';
    document.body.appendChild(bar);
    document.getElementById("promoAboutBtn").addEventListener("click", openModal);
  }

  // 注入模态框（4 区块：作者介绍 + QQ群 + 赞赏 + 表情包）
  function injectModal() {
    if (document.getElementById("promoOverlay")) return;
    var ov = document.createElement("div");
    ov.id = "promoOverlay";
    ov.className = "promo-overlay";
    ov.innerHTML =
      '<div class="promo-card">' +
        '<button class="promo-close" id="promoClose" aria-label="关闭">×</button>' +

        // —— ① 作者介绍 ——
        '<div class="promo-author">' +
          '<img class="promo-avatar" src="' + CONFIG.avatar + '" alt="捞鱼头像">' +
          '<div class="promo-author-info">' +
            '<span class="promo-tag">由 ' + CONFIG.studio + ' 制作</span>' +
            '<h2>🐟 捞鱼</h2>' +
            '<p class="promo-tagline">' + CONFIG.tagline + '</p>' +
          '</div>' +
        '</div>' +
        '<p class="promo-desc">这个备考网站由<strong>捞鱼</strong>独立制作。捞鱼还在做更多好玩的东西——趣味测试、微信表情包、学习工具。</p>' +
        '<a class="promo-link promo-link-hero" href="' + CONFIG.about + '" target="_blank" rel="noopener">' +
          '<span class="icon">🏠</span><span>了解更多关于捞鱼<small>个人主页 · ' + CONFIG.home.replace(/^https?:\/\//, '') + '</small></span>' +
        '</a>' +

        // —— ② ③ ④ 三入口卡片网格 ——
        '<div class="promo-grid">' +

          // QQ群
          '<div class="promo-cell">' +
            '<div class="promo-cell-head"><span class="icon">💬</span>加入 QQ 群</div>' +
            '<p class="promo-cell-sub">反馈建议、找作者补数据、单纯想认识捞鱼？扫码进群一起玩 🎉</p>' +
            '<img src="' + CONFIG.qqGroupImg + '" alt="QQ群二维码">' +
            '<p class="promo-cell-tip">' + CONFIG.qqGroupTip + '</p>' +
          '</div>' +

          // 赞赏
          '<div class="promo-cell">' +
            '<div class="promo-cell-head"><span class="icon">☕</span>请作者喝咖啡</div>' +
            '<p class="promo-cell-sub">如果这个网站对你有帮助，欢迎请捞鱼喝杯咖啡 ☕</p>' +
            '<img src="' + CONFIG.rewardImg + '" alt="赞赏二维码">' +
            '<p class="promo-cell-tip">' + CONFIG.rewardTip + '</p>' +
          '</div>' +

          // 表情包
          '<div class="promo-cell">' +
            '<div class="promo-cell-head"><span class="icon">😺</span>微信表情包</div>' +
            '<p class="promo-cell-sub">星星布丁系列，扫码即可在微信使用 ✨</p>' +
            '<div class="promo-sticker-preview">' +
              '<img src="' + BASE + 'img/sticker/stars/snicker.png" alt="偷笑">' +
              '<img src="' + BASE + 'img/sticker/stars/cheer.png" alt="加油">' +
              '<img src="' + BASE + 'img/sticker/stars/thanks.png" alt="谢谢">' +
            '</div>' +
            '<img src="' + CONFIG.stickerQr + '" alt="微信表情包二维码">' +
            '<p class="promo-cell-tip">' + CONFIG.stickerTip + '</p>' +
          '</div>' +

        '</div>' +

        '<p class="promo-thanks">感谢每一份支持 🙏</p>' +
      '</div>';
    document.body.appendChild(ov);
    document.getElementById("promoClose").addEventListener("click", closeModal);
    ov.addEventListener("click", function (e) {
      if (e.target === ov) closeModal();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeModal();
    });
  }

  function openModal() {
    var ov = document.getElementById("promoOverlay");
    if (ov) ov.classList.add("show");
  }
  function closeModal() {
    var ov = document.getElementById("promoOverlay");
    if (ov) ov.classList.remove("show");
  }

  // 暴露（方便 onclick 调用）
  window.Promo = { open: openModal, close: closeModal };

  // DOM 就绪后注入
  function init() { injectBar(); injectModal(); }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
