// _inject_comments.cjs
// 给 trainee/chapter1~7.html 批量注入「登录 + 划选评论」所需的 link/script 标签。
// 幂等：已注入过会先清掉再重新注入，可反复运行。
// 用法：node _inject_comments.cjs
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const FILES = [1, 2, 3, 4, 5, 6, 7].map(function (n) {
  return path.join(ROOT, "trainee", "chapter" + n + ".html");
});

// 注入块：根相对路径（章节页在 trainee/ 子目录，用 ../ 回根）
// 顺序很重要：supabase-js(CDN) → config → auth → comments
const MARK_BEGIN = "<!-- weshoto-comments-inject-begin -->";
const MARK_END = "<!-- weshoto-comments-inject-end -->";
const BLOCK =
  MARK_BEGIN + "\n" +
  "<!-- 登录 + 划选文字评论（依赖顺序：supabase-js → config → auth → comments） -->\n" +
  '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>\n' +
  '<link rel="stylesheet" href="../auth.css">\n' +
  '<link rel="stylesheet" href="../comments.css">\n' +
  '<script src="../supabase-config.js"></script>\n' +
  '<script src="../auth.js"></script>\n' +
  '<script src="../comments.js"></script>\n' +
  MARK_END;

function injectOne(file) {
  var src = fs.readFileSync(file, "utf8");
  var changed = false;

  // 1) 先删旧注入块（幂等）
  if (src.indexOf(MARK_BEGIN) !== -1) {
    var re = new RegExp("[\\s\\n]*" + escRe(MARK_BEGIN) + "[\\s\\S]*?" + escRe(MARK_END) + "[\\s\\n]*", "g");
    src = src.replace(re, "\n");
    changed = true;
  }

  // 2) 在 </body> 前插入
  //    找 promo.js 那行，紧跟其后插（保持"共享脚本集中在底部"的现有结构）
  var hook = '<script src="../promo.js"></script>';
  var idx = src.indexOf(hook);
  if (idx === -1) {
    // 兜底：插到 </body> 前
    idx = src.indexOf("</body>");
    if (idx === -1) { console.warn("[" + path.basename(file) + "] 找不到插入点，跳过"); return false; }
    src = src.slice(0, idx) + BLOCK + "\n" + src.slice(idx);
  } else {
    var after = idx + hook.length;
    src = src.slice(0, after) + "\n" + BLOCK + src.slice(after);
  }
  changed = true;

  fs.writeFileSync(file, src, "utf8");
  console.log("[OK] " + path.basename(file) + (changed ? " 已注入" : ""));
  return true;
}

function escRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

console.log("开始注入 chapter1~7 ...");
var ok = 0;
FILES.forEach(function (f) { if (injectOne(f)) ok++; });
console.log("完成：" + ok + "/7");
