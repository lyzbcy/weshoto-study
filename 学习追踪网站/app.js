// ===== 急速备考学习追踪 · 前端逻辑 =====
let DATA = null;       // 完整 progress.json
let currentExam = 'wecom';
const DOC_BASE = '/doc/';  // 相对静态服务器根，资料在 ../doc 下；暂不直链，仅提示

// ---------- 工具 ----------
function $(sel, root) { return (root || document).querySelector(sel); }
function $$(sel, root) { return [...(root || document).querySelectorAll(sel)]; }
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function escapeHtml(s) {
  return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ===== 本章真题自测子系统 =====
// QUIZ_DATA: 懒加载的 quiz.json 题库（首次加载后缓存）
// QUIZ_MAP:  moduleId/特殊key → 是否有题的映射（renderModuleCard 用它判断是否渲染折叠区）
// QUIZ_SEL:  答题态保护 —— quizSel[mid][qid] = ['A','C']，轮询重渲时从此恢复未提交选项
// QUIZ_LOADED: 已展开加载过题目的 details 集合，重渲后自动恢复展开态并回填
let QUIZ_DATA = null;
let QUIZ_MAP = null;
const QUIZ_SEL = {};          // { mid: { qid: [letters] } }
const QUIZ_OPENED = new Set(); // 已展开过的 mid（含 '_company'）
const QUIZ_SUBMITTED = {};    // { mid: { qid: 'correct'|'wrong' } } 已提交的对错标记，重渲后回填

// 模块 id → quiz.json 的 key 映射（公司区用特殊 key '_company'，不走 module.id）
function quizKeyOf(mid) { return mid; }

// 答案归一化：'A、B' / 'AB' / 'A,B' → ['A','B']
function normAnswer(ans) {
  return String(ans||'').toUpperCase().replace(/[、，,\s]/g, ',').split(',').filter(x => x);
}
function arrEq(a, b) {
  if (a.length !== b.length) return false;
  const A = [...a].sort(), B = [...b].sort();
  return A.every((x,i) => x === B[i]);
}
function LETTERS(n) {
  return ['A','B','C','D','E','F'].slice(0, n);
}

// 折叠区摘要（renderModuleCard 调用）
function renderQuizSection(mid, record) {
  const n = QUIZ_MAP[mid] || 0;
  const rec = record || {};
  const attempted = rec.attempts || 0;
  const scoreTxt = rec.lastScore != null ? `上次 ${rec.lastScore}/${rec.total||n}` : '未测';
  const wrongN = (rec.wrongIds||[]).length;
  return `
    <details class="quiz-section" data-mid="${mid}" ${QUIZ_OPENED.has(mid)?'open':''}>
      <summary class="quiz-summary">
        <span class="quiz-title">📝 本章真题自测</span>
        <span class="quiz-count">${n}题</span>
        <span class="quiz-record">${attempted?`已测${attempted}次 · ${scoreTxt} · 错题${wrongN}`:'点击展开做题'}</span>
      </summary>
      <div class="quiz-body" data-mid="${mid}">
        <button class="btn quiz-load" data-mid="${mid}">加载本章 ${n} 道真题</button>
      </div>
    </details>`;
}

// 公司介绍与内部制度 独立区（wecom tab 末尾，不绑分数）
function renderCompanySection() {
  const n = QUIZ_MAP['_company'] || 0;
  if (!n) return '';
  return `
  <div class="section section-company">
    <div class="section-title">🏛️ 公司介绍与内部制度 <span class="section-weight">（考试占比约15% · 不计入掌握度）</span></div>
    <div class="company-wrap">
      ${renderQuizSection('_company', null)}
    </div>
  </div>`;
}

// 把单题渲染成 HTML（选项、解析、考点、易错点默认隐藏，提交后显示）
function renderQuizItem(mid, q, idx) {
  const letters = LETTERS(q.options.length);
  const multi = q.type === 'multi';
  const judge = q.type === 'judge';
  const inpType = multi ? 'checkbox' : 'radio';
  const inpName = `q-${mid}-${q.id}`;
  const sel = (QUIZ_SEL[mid] && QUIZ_SEL[mid][q.id]) || [];
  const sub = QUIZ_SUBMITTED[mid] && QUIZ_SUBMITTED[mid][q.id];
  const correctAns = normAnswer(q.answer);

  let optsHtml = '';
  letters.forEach((L, i) => {
    const checked = sel.includes(L) ? 'checked' : '';
    let cls = 'quiz-option';
    if (sub) {
      const isCorrect = correctAns.includes(L);
      const isChosen = sel.includes(L);
      if (isCorrect) cls += ' correct';
      else if (isChosen) cls += ' wrong';
    }
    optsHtml += `<label class="${cls}">
      <input type="${inpType}" name="${inpName}" value="${L}" ${checked} ${sub?'disabled':''}>
      <span class="opt-letter">${L}</span>
      <span class="opt-text">${escapeHtml(q.options[i])}</span>
    </label>`;
  });

  const typeLabel = judge ? '判断' : (multi ? '多选' : '单选');
  const explainHtml = sub ? `
    <div class="quiz-explain">
      <div class="qe-row"><b>✅ 正确答案：</b>${correctAns.join('、')}</div>
      <div class="qe-row"><b>💡 解析：</b>${escapeHtml(q.explain)}</div>
      <div class="qe-row"><span class="quiz-tag">🏷️ ${escapeHtml(q.tag)}</span></div>
      <div class="qe-row quiz-pitfall"><b>⚠️ 易错点：</b>${escapeHtml(q.pitfall)}</div>
    </div>` : '';

  return `
    <div class="quiz-item" data-qid="${q.id}">
      <div class="quiz-q"><span class="qidx">${idx+1}.</span>[${typeLabel}] ${escapeHtml(q.q)} <span class="qsrc">(${q.id})</span></div>
      <div class="quiz-opts">${optsHtml}</div>
      ${explainHtml}
    </div>`;
}

// 加载并渲染某模块全部题目到对应 .quiz-body
async function loadQuiz(mid) {
  const body = document.querySelector(`.quiz-body[data-mid="${mid}"]`);
  if (!body) return;
  if (!QUIZ_DATA) {
    body.innerHTML = '<div class="quiz-loading">加载中…</div>';
    try {
      const r = await fetch('/quiz.json', { cache: 'no-cache' });
      QUIZ_DATA = await r.json();
      // 构建 QUIZ_MAP：每个 key 的题数
      QUIZ_MAP = {};
      for (const k of Object.keys(QUIZ_DATA)) {
        if (k === '_meta') continue;
        QUIZ_MAP[k] = (QUIZ_DATA[k]||[]).length;
      }
    } catch (e) {
      body.innerHTML = '<div class="quiz-error">❌ 题库加载失败：' + escapeHtml(e.message) + '</div>';
      return;
    }
  }
  const list = QUIZ_DATA[mid] || [];
  if (!list.length) {
    body.innerHTML = '<div class="empty-hint">本章暂无真题。</div>';
    return;
  }
  let html = '';
  list.forEach((q, i) => { html += renderQuizItem(mid, q, i); });
  const already = QUIZ_SUBMITTED[mid] && Object.keys(QUIZ_SUBMITTED[mid]).length;
  html += `
    <div class="quiz-actions">
      <button class="btn quiz-submit" data-mid="${mid}">提交判分</button>
      <button class="btn btn-ghost quiz-reset" data-mid="${mid}">重做</button>
      ${already ? '<span class="quiz-hint">已提交，点"重做"可清空重答</span>' : '<span class="quiz-hint">选完后点提交</span>'}
    </div>`;
  body.innerHTML = html;
}

// 收集某模块当前选中态
function collectSel(mid) {
  const body = document.querySelector(`.quiz-body[data-mid="${mid}"]`);
  if (!body) return {};
  const out = {};
  const items = body.querySelectorAll('.quiz-item');
  items.forEach(item => {
    const qid = item.dataset.qid;
    const checked = [...item.querySelectorAll('input:checked')].map(i => i.value);
    out[qid] = checked;
  });
  return out;
}

// 提交判分：算分 + 标对错 + 显示解析 + 保存记录
async function submitQuiz(mid) {
  QUIZ_SEL[mid] = collectSel(mid);
  const list = QUIZ_DATA[mid] || [];
  let right = 0, total = list.length;
  QUIZ_SUBMITTED[mid] = QUIZ_SUBMITTED[mid] || {};
  const wrongIds = [];
  list.forEach(q => {
    const sel = QUIZ_SEL[mid][q.id] || [];
    const ok = arrEq(sel, normAnswer(q.answer));
    QUIZ_SUBMITTED[mid][q.id] = ok ? 'correct' : 'wrong';
    if (ok) right++; else wrongIds.push(q.id);
  });
  // 重渲染题目（带对错色+解析）
  loadQuizAlready(mid);
  // 得分反馈条
  const body = document.querySelector(`.quiz-body[data-mid="${mid}"]`);
  const pct = total ? Math.round(right/total*100) : 0;
  const cls = pct >= 80 ? 'score-good' : (pct >= 60 ? 'score-mid' : 'score-bad');
  const banner = document.createElement('div');
  banner.className = 'quiz-result ' + cls;
  banner.innerHTML = `📊 本次得分：<b>${right}/${total}</b>（${pct}%）${wrongIds.length?' · 错题 '+wrongIds.length+' 题（已加入错题本）':' · 全对！🎉'}`;
  body.insertBefore(banner, body.firstChild);
  // 保存 quizRecord（公司区不保存到 progress，仅内存）
  if (mid !== '_company') {
    const record = { lastScore: right, total, wrongIds, attempts: 1, lastAt: new Date().toISOString() };
    // 累加 attempts
    const mod = findModuleLocal(mid);
    if (mod) {
      const prev = mod.quizRecord || {};
      record.attempts = (prev.attempts || 0) + 1;
      mod.quizRecord = Object.assign({}, prev, record);
    }
    try {
      await saveChange({ type:'quizRecord', examId: currentExam, moduleId: mid, value: record });
      refreshTopStats();
    } catch(e) { console.warn('quizRecord保存失败', e); }
  }
  // 更新折叠区摘要
  updateQuizSummary(mid, { lastScore: right, total, wrongIds });
}

// 已加载情况下重渲题目（不重新 fetch，保留对错标记）
function loadQuizAlready(mid) {
  const list = QUIZ_DATA[mid] || [];
  let html = '';
  list.forEach((q, i) => { html += renderQuizItem(mid, q, i); });
  const body = document.querySelector(`.quiz-body[data-mid="${mid}"]`);
  if (!body) return;
  // 保留 banner（得分条）和 actions
  const banner = body.querySelector('.quiz-result');
  html += `
    <div class="quiz-actions">
      <button class="btn quiz-submit" data-mid="${mid}">重新提交</button>
      <button class="btn btn-ghost quiz-reset" data-mid="${mid}">重做</button>
      <span class="quiz-hint">已提交，点"重做"清空重答</span>
    </div>`;
  body.innerHTML = html;
  if (banner) body.insertBefore(banner, body.firstChild);
}

// 重做：清空该模块答题态
function resetQuiz(mid) {
  QUIZ_SEL[mid] = {};
  QUIZ_SUBMITTED[mid] = {};
  loadQuizAlready(mid);
  updateQuizSummary(mid, null);
}

// 更新折叠区 summary 的统计文字
function updateQuizSummary(mid, rec) {
  const det = document.querySelector(`details.quiz-section[data-mid="${mid}"]`);
  if (!det) return;
  const n = QUIZ_MAP[mid] || 0;
  const span = det.querySelector('.quiz-record');
  if (!span) return;
  if (!rec) {
    span.textContent = '点击展开做题';
  } else {
    const attempts = rec.attempts || 1;
    span.textContent = `已测${attempts}次 · 上次 ${rec.lastScore}/${rec.total||n} · 错题 ${(rec.wrongIds||[]).length}`;
  }
}

// 统计全模块错题总数（顶部错题本）
function countAllWrong() {
  let n = 0;
  if (!DATA) return 0;
  for (const cat of (DATA.exams.wecom?.categories||[])) {
    for (const m of (cat.modules||[])) {
      if (m.quizRecord && m.quizRecord.wrongIds) n += m.quizRecord.wrongIds.length;
    }
  }
  return n;
}
function masteryInfo(level) {
  return (DATA.masteryLevels || []).find(m => m.level === level) || { label:'?', color:'#888', weight:0 };
}
function daysBetween(a, b) {
  const ms = new Date(a) - new Date(b);
  return Math.ceil(ms / 86400000);
}

// ---------- 分数计算 ----------
// 对单个 exam 计算预计分数
function calcScore(exam) {
  const total = exam.totalScore || 100;
  let score = 0;
  for (const cat of exam.categories) {
    const mods = cat.modules || [];
    if (!mods.length) continue;
    // 类内均分：判断 OS 用 module.weight，企微用类 weight/模块数
    for (const m of mods) {
      let modShare; // 该模块占考试总分的比例
      if (typeof m.weight === 'number') {
        // OS: 模块自带 weight（百分比）
        modShare = m.weight / 100;
      } else {
        // 企微: 类别 weight / 类内模块数
        modShare = (cat.weight || 0) / 100 / mods.length;
      }
      score += masteryInfo(m.mastery).weight * modShare * total;
    }
  }
  return Math.min(total, Math.round(score));
}

// 总进度（加权掌握度百分比）
function calcProgress(exam) {
  let sum = 0, cnt = 0;
  for (const cat of exam.categories) {
    for (const m of (cat.modules||[])) {
      const w = (typeof m.weight==='number') ? m.weight : (cat.weight||0)/(cat.modules.length);
      sum += masteryInfo(m.mastery).weight * w;
      cnt += w;
    }
  }
  return cnt ? Math.round(sum/cnt*100) : 0;
}

// ---------- 渲染概览 ----------
function renderOverview(exam) {
  const score = calcScore(exam);
  const progress = calcProgress(exam);
  const today = todayStr();
  const days = daysBetween(exam.examDate, today);
  const passScore = exam.passScore || 60;
  const scoreClass = score >= passScore ? 'score-good' : (score >= passScore*0.8 ? 'score-mid' : 'score-bad');
  const dayText = days > 0 ? `还有 ${days} 天` : (days === 0 ? '今天考试！' : `已过 ${-days} 天`);
  const dayClass = days <= 3 ? 'countdown-urgent' : '';
  const todayLog = (DATA.dailyLog && DATA.dailyLog[today] && DATA.dailyLog[today][currentExam]) || {minutes:0, note:''};

  // 统计考试模块掌握情况
  let examMods = 0, examMastered = 0;
  for (const cat of exam.categories)
    for (const m of (cat.modules||[]))
      if (m.isExamModule) { examMods++; if (m.mastery>=3) examMastered++; }

  // 错题本统计（仅企微 tab 显示）
  const wrongTotal = currentExam === 'wecom' ? countAllWrong() : 0;
  const wrongCard = wrongTotal > 0
    ? `<div class="stat-card stat-wrongbook">
        <div class="label">⚠️ 错题本</div>
        <div class="value score-mid">${wrongTotal}<span style="font-size:16px;color:var(--text-dim)">题待复习</span></div>
        <div class="sub">点击下方各模块"本章真题自测"重做错题</div>
      </div>`
    : '';

  return `
  <div class="overview">
    <div class="stat-card">
      <div class="label">📊 如果今天去考试</div>
      <div class="value ${scoreClass}">${score}<span style="font-size:16px;color:var(--text-dim)">/${exam.totalScore}</span></div>
      <div class="sub">及格线 ${passScore}　${exam.subtitle||''}</div>
    </div>
    <div class="stat-card">
      <div class="label">⏰ ${exam.examDate}</div>
      <div class="value ${dayClass}">${dayText}</div>
      <div class="sub">${exam.examEndDate ? '考试期 ' + exam.examDate + ' ~ ' + exam.examEndDate : ''}</div>
    </div>
    <div class="stat-card">
      <div class="label">📈 总掌握进度</div>
      <div class="value">${progress}<span style="font-size:16px;color:var(--text-dim)">%</span></div>
      <div class="progress-wrap"><div class="progress-bar" style="width:${progress}%"></div></div>
      <div class="sub">${examMods ? '考试模块 ' + examMastered + '/' + examMods + ' 已较好掌握' : '今日已学 ' + todayLog.minutes + ' 分钟'}</div>
    </div>
    ${wrongCard}
  </div>`;
}

// ---------- 渲染今日卡片 ----------
function renderToday(exam) {
  const today = todayStr();
  const log = (DATA.dailyLog && DATA.dailyLog[today] && DATA.dailyLog[today][currentExam]) || {minutes:0, note:''};
  return `
  <div class="today-card">
    <h3>📝 今日学习记录 <span style="color:var(--text-dim);font-size:12px;font-weight:400">${today}</span></h3>
    <div class="today-row">
      <label>今日时长</label>
      <input type="number" id="today-min" min="0" max="1440" value="${log.minutes}" placeholder="分钟">
      <span class="min-label" style="color:var(--text-dim);font-size:13px">分钟</span>
      <textarea id="today-note" placeholder="今日学习笔记（学了什么、遇到的问题、明天计划…）">${escapeHtml(log.note)}</textarea>
      <button class="btn" id="today-save">保存今日记录</button>
      <span class="saved-flash" id="today-flash">✓ 已保存</span>
    </div>
  </div>`;
}

// ---------- 渲染图表 ----------
function renderChart() {
  const log = DATA.dailyLog || {};
  const days = Object.keys(log).sort();
  if (!days.length) {
    return `<div class="chart-card"><h3>📅 每日学习时长</h3><div class="empty-hint">还没有每日记录，保存今日记录后这里会显示进度图。</div></div>`;
  }
  // 取最近 14 天
  const recent = days.slice(-14);
  const maxMin = Math.max(60, ...recent.map(d => {
    const e = log[d][currentExam] || log[d].wecom || log[d].os || {};
    return e.minutes || 0;
  }));
  let cols = '';
  for (const d of recent) {
    const entry = log[d][currentExam] || {};
    const wMin = (log[d].wecom && log[d].wecom.minutes) || 0;
    const oMin = (log[d].os && log[d].os.minutes) || 0;
    const min = currentExam === 'wecom' ? wMin : oMin;
    const h = maxMin ? Math.round(min/maxMin*100) : 0;
    const label = d.slice(5);
    cols += `<div class="chart-bar-col">
      <div class="chart-bar ${currentExam}" style="height:${h}%" title="${d}: ${min}分钟"></div>
      <div class="chart-bar-label">${label}</div>
    </div>`;
  }
  return `
  <div class="chart-card">
    <h3>📅 每日学习时长（${currentExam==='wecom'?'企微管家':'操作系统'} · 最近${recent.length}天）</h3>
    <div class="chart-bars">${cols}</div>
    <div class="chart-legend">
      <span><span class="legend-dot" style="background:${currentExam==='wecom'?'#06b6d4':'#f59e0b'}"></span>当日分钟</span>
    </div>
  </div>`;
}

// ---------- 渲染板块 ----------
function renderModules(exam) {
  let html = '';
  for (const cat of exam.categories) {
    const mods = cat.modules || [];
    if (!mods.length) continue;
    html += `<div class="section">
      <div class="section-title">${escapeHtml(cat.name)} <span class="section-weight">（权重 ${cat.weight}%）</span></div>
      <div class="modules-grid">`;
    for (const m of mods) {
      html += renderModuleCard(m);
    }
    html += `</div></div>`;
  }
  // 企微 tab 末尾追加"公司介绍与内部制度"独立真题区（不绑掌握度/分数）
  if (currentExam === 'wecom' && QUIZ_MAP['_company']) {
    html += renderCompanySection();
  }
  return html;
}

function renderModuleCard(m) {
  const levels = DATA.masteryLevels || [];
  const info = masteryInfo(m.mastery);
  const tags = [];
  if (m.isExamModule) tags.push('<span class="tag tag-exam">★考试</span>');
  if (m.week === 1) tags.push('<span class="tag tag-week1">第一周</span>');
  if (m.week === 2) tags.push('<span class="tag tag-week2">第二周</span>');
  if (typeof m.weight === 'number') tags.push(`<span class="tag tag-weight">${m.weight}%</span>`);

  let btns = '';
  for (const lv of levels) {
    const sel = lv.level === m.mastery ? 'selected' : '';
    btns += `<button class="mastery-btn ${sel}" data-level="${lv.level}"
      style="${sel?`border-color:${lv.color};background:${lv.color}22`:''}">
      <span class="dot" style="background:${lv.color}"></span>${lv.label}
    </button>`;
  }
  const docName = m.doc ? m.doc.split('/').pop().replace(/\.md$/,'') : '';
  const lastTxt = m.lastStudied ? `上次学习：${m.lastStudied.slice(0,16).replace('T',' ')}` : '';

  // 本章真题自测折叠区（仅当该模块在 QUIZ_MAP 中有题时显示）
  const quizSection = QUIZ_MAP[m.id]
    ? renderQuizSection(m.id, m.quizRecord)
    : '';

  return `
  <div class="module-card" data-id="${m.id}">
    <div class="module-head">
      <div>
        <div class="module-name">${escapeHtml(m.name)}</div>
        <div class="module-tags">${tags.join('')}</div>
      </div>
    </div>
    <div class="mastery-row">${btns}</div>
    <div class="module-foot">
      <input type="number" class="mod-min" min="0" max="600" value="${m.minutesToday||0}" title="今日学习分钟数">
      <span class="min-label">分/今日</span>
      ${m.doc ? `<a class="doc-link" href="javascript:void(0)" data-doc="${escapeHtml(m.doc)}" title="${escapeHtml(m.doc)}">📖 ${escapeHtml(docName)}</a>` : ''}
    </div>
    ${lastTxt ? `<div class="last-studied">${lastTxt}</div>` : ''}
    ${quizSection}
  </div>`;
}

// ---------- 渲染整体 ----------
function render() {
  if (!DATA) return;
  const exam = DATA.exams[currentExam];
  $('#loading').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#app').innerHTML = renderOverview(exam) + renderToday(exam) + renderChart() + renderModules(exam);
  bindEvents();
}

// ---------- 保存 ----------
async function saveChange(payload) {
  const r = await fetch('/api/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return r.json();
}

function bindEvents() {
  // 掌握度按钮
  $$('.mastery-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('.module-card');
      const moduleId = card.dataset.id;
      const level = Number(btn.dataset.level);
      // 乐观更新
      const mod = findModuleLocal(moduleId);
      if (mod) mod.mastery = level;
      const res = await saveChange({ type:'mastery', examId: currentExam, moduleId, value: level });
      if (res.ok) {
        // 局部刷新该卡片按钮 + 顶部分数
        $$('.mastery-btn', card).forEach(b => {
          const sel = Number(b.dataset.level) === level;
          b.classList.toggle('selected', sel);
          const lv = masteryInfo(Number(b.dataset.level));
          b.style.cssText = sel ? `border-color:${lv.color};background:${lv.color}22` : '';
        });
        refreshTopStats();
      }
    });
  });

  // 模块今日时长（失焦保存）
  $$('.mod-min').forEach(inp => {
    inp.addEventListener('change', async () => {
      const card = inp.closest('.module-card');
      const moduleId = card.dataset.id;
      const val = Number(inp.value) || 0;
      const mod = findModuleLocal(moduleId);
      if (mod) mod.minutesToday = val;
      await saveChange({ type:'minutes', examId: currentExam, moduleId, value: val });
    });
  });

  // 文档链接提示（资料在外部目录，提示路径）
  $$('.doc-link').forEach(a => {
    a.addEventListener('click', () => {
      const p = a.dataset.doc;
      alert('📄 资料路径：\n' + p + '\n\n请在编辑器/资源管理器中打开该 md 文件阅读。\n（路径相对 doc/ 目录）');
    });
  });

  // 今日记录保存
  $('#today-save').addEventListener('click', async () => {
    const btn = $('#today-save');
    const minutes = Number($('#today-min').value) || 0;
    const note = $('#today-note').value;
    btn.disabled = true; btn.textContent = '保存中…';
    const r = await fetch('/api/daily', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ examId: currentExam, minutes, note, date: todayStr() })
    });
    const res = await r.json();
    btn.disabled = false; btn.textContent = '保存今日记录';
    if (res.ok) {
      DATA.dailyLog = DATA.dailyLog || {};
      DATA.dailyLog[todayStr()] = DATA.dailyLog[todayStr()] || {};
      DATA.dailyLog[todayStr()][currentExam] = { minutes, note };
      $('#today-flash').classList.add('show');
      setTimeout(() => $('#today-flash').classList.remove('show'), 1500);
      // 刷新图表
      const chartOld = $('.chart-card');
      if (chartOld) chartOld.outerHTML = renderChart();
    }
  });

  // ===== 本章真题自测交互（事件委托，适配动态内容与重渲染）=====
  const app = $('#app');
  if (app && !app._quizBound) {
    app._quizBound = true; // 仅绑定一次（委托，重渲染不重复绑）
    app.addEventListener('click', async (e) => {
      const t = e.target.closest('.quiz-load, .quiz-submit, .quiz-reset');
      if (!t) return;
      const mid = t.dataset.mid;
      if (t.classList.contains('quiz-load')) {
        QUIZ_OPENED.add(mid);
        await loadQuiz(mid);
      } else if (t.classList.contains('quiz-submit')) {
        await submitQuiz(mid);
      } else if (t.classList.contains('quiz-reset')) {
        resetQuiz(mid);
      }
    });
    // 选项变化时实时记录答题态（防轮询冲掉）
    app.addEventListener('change', (e) => {
      const inp = e.target.closest('.quiz-body input');
      if (!inp) return;
      const body = inp.closest('.quiz-body');
      const mid = body.dataset.mid;
      QUIZ_SEL[mid] = collectSel(mid);
    });
  }
}

function findModuleLocal(moduleId) {
  const exam = DATA.exams[currentExam];
  for (const cat of exam.categories)
    for (const m of (cat.modules||[]))
      if (m.id === moduleId) return m;
  return null;
}

function refreshTopStats() {
  // 用最新 DATA 重算并替换顶部三个卡片 + 图表不动
  const exam = DATA.exams[currentExam];
  const overviewHtml = renderOverview(exam);
  const old = $('.overview');
  if (old) old.outerHTML = overviewHtml;
}

// ---------- Tab 切换 ----------
function bindTabs() {
  $$('.tab').forEach(t => {
    t.addEventListener('click', () => {
      $$('.tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      currentExam = t.dataset.exam;
      render();
    });
  });
}

// ---------- 启动 ----------
// 重渲后恢复已展开的 quiz（轮询/Tab切换重建 DOM 后，把 QUIZ_OPENED 里的模块重新加载并回填答题态）
function restoreOpenQuiz() {
  // 只恢复当前 tab 可见的（_company 仅 wecom）
  for (const mid of QUIZ_OPENED) {
    if (mid === '_company' && currentExam !== 'wecom') continue;
    const det = document.querySelector(`details.quiz-section[data-mid="${mid}"]`);
    if (det) det.open = true;
    const body = document.querySelector(`.quiz-body[data-mid="${mid}"]`);
    if (body && (!body.dataset.loaded)) {
      // 重新加载题目（用缓存的 QUIZ_DATA，回填 QUIZ_SEL/QUIZ_SUBMITTED）
      body.dataset.loaded = '1';
      if (QUIZ_DATA) {
        loadQuizAlready(mid);  // 已有缓存，直接渲染（保留对错标记）
      } else {
        loadQuiz(mid);  // 首次加载
      }
    }
  }
}

async function init() {
  try {
    const r = await fetch('/api/progress', { cache: 'no-cache' });
    DATA = await r.json();
    // 预加载题库元数据（仅读 key→题数映射，决定哪些模块渲染折叠区）
    try {
      const rq = await fetch('/quiz.json', { cache: 'no-cache' });
      QUIZ_DATA = await rq.json();
      QUIZ_MAP = {};
      for (const k of Object.keys(QUIZ_DATA)) {
        if (k === '_meta') continue;
        QUIZ_MAP[k] = (QUIZ_DATA[k]||[]).length;
      }
    } catch (eq) { console.warn('quiz.json 预加载失败，折叠区不显示：', eq); }
    bindTabs();
    render();
    // 每 30s 轮询一次（兼容外部手动改 json）
    setInterval(async () => {
      try {
        const r2 = await fetch('/api/progress', { cache: 'no-cache' });
        const fresh = await r2.json();
        // 仅当 lastUpdated 变化时整体刷新，避免覆盖正在编辑的输入
        if (fresh.meta && DATA.meta && fresh.meta.lastUpdated !== DATA.meta.lastUpdated) {
          DATA = fresh;
          render();
          restoreOpenQuiz();  // 重渲后恢复已展开的题目与答题态
        }
      } catch(e) {}
    }, 30000);
  } catch (e) {
    $('#loading').textContent = '❌ 加载失败：' + e.message + '（请确认 local-preview-server.js 已启动）';
  }
}

init();
