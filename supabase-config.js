// ============================================================
// weshoto-study · Supabase 配置（URL + anon key）
// ============================================================
// anon key 是「公开 key」，本就是设计给前端用的——它受 RLS（行级安全）
// 保护，别人拿到也只能做被授权的操作（匿名只读、登录后只能改自己的）。
// 真正敏感的 service_role key 我们不会写进前端，始终留在 Supabase 后台。
// 所以这里放 anon key 是 Supabase 官方推荐做法，不是泄露。
//
// ⚠️ 接入步骤：在 Supabase 后台
//   Project Settings → API → 复制 "Project URL" 和 "anon public" key
//   粘贴到下面两个常量，替换占位值。
// ============================================================

window.SUPABASE_CONFIG = {
  url: "https://rahhcidsyeqhzilgpfwo.supabase.co",
  anonKey: "sb_publishable_Vo40V-3DMv4BGywK90HfJQ_2BgK5Fz9"
};
