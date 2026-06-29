const http = require('http');
const fs = require('fs');
const path = require('path');

const workspaceRoot = __dirname;
const host = '127.0.0.1';
const port = Number(process.env.LOCAL_PREVIEW_PORT || 8091);
const progressFile = path.join(workspaceRoot, 'progress.json');
const backupFile = path.join(workspaceRoot, 'progress.json.bak');

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.md': 'text/markdown; charset=utf-8'
};

const routeAliases = {
  '/': '/index.html',
  '': '/index.html'
};

function normalizeRequestPath(requestPath) {
  let normalizedPath = decodeURIComponent((requestPath || '/').split('?')[0]);
  if (normalizedPath === '/' || normalizedPath === '') return '/index.html';
  if (routeAliases[normalizedPath]) return routeAliases[normalizedPath];
  return normalizedPath;
}

function resolveFilePath(requestPath) {
  return path.normalize(path.join(workspaceRoot, normalizeRequestPath(requestPath)));
}

function sendJSON(response, statusCode, obj) {
  const body = JSON.stringify(obj);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-cache'
  });
  response.end(body);
}

function sendText(response, statusCode, message) {
  response.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end(message);
}

function sendFile(filePath, response) {
  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendText(response, error.code === 'ENOENT' ? 404 : 500, error.code === 'ENOENT' ? 'Not Found' : 'Server Error');
      return;
    }
    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      'Content-Type': contentTypes[extension] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    response.end(content);
  });
}

// ===== progress.json 读写 =====
function readProgress() {
  try {
    return JSON.parse(fs.readFileSync(progressFile, 'utf-8'));
  } catch (e) {
    console.error('[progress] 读取失败:', e.message);
    return null;
  }
}

function writeProgress(data) {
  // 先备份
  try {
    if (fs.existsSync(progressFile)) {
      fs.copyFileSync(progressFile, backupFile);
    }
  } catch (e) {
    console.warn('[progress] 备份失败:', e.message);
  }
  data.meta = data.meta || {};
  data.meta.lastUpdated = new Date().toISOString();
  fs.writeFileSync(progressFile, JSON.stringify(data, null, 2), 'utf-8');
}

// 深度查找模块（兼容 wecom 的 category->modules 和 os 的 category->modules）
function findModule(data, examId, moduleId) {
  const exam = data.exams[examId];
  if (!exam) return { found: false };
  for (const cat of exam.categories) {
    const mod = (cat.modules || []).find(m => m.id === moduleId);
    if (mod) return { found: true, module: mod, category: cat, exam };
  }
  return { found: false };
}

function collectBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', c => chunks.push(c));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    request.on('error', reject);
  });
}

function todayStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// ===== API 处理 =====
async function handleApi(request, response, pathname) {
  // GET /api/progress —— 返回完整进度
  if (pathname === '/api/progress' && request.method === 'GET') {
    const data = readProgress();
    if (!data) return sendJSON(response, 500, { error: '读取进度失败' });
    return sendJSON(response, 200, data);
  }

  // POST /api/save —— 保存单次改动
  if (pathname === '/api/save' && request.method === 'POST') {
    try {
      const raw = await collectBody(request);
      const payload = JSON.parse(raw);
      const data = readProgress();
      if (!data) return sendJSON(response, 500, { error: '读取进度失败' });

      const { type, examId, moduleId, value } = payload;
      const hit = findModule(data, examId, moduleId);
      if (!hit.found) return sendJSON(response, 404, { error: '模块未找到: ' + moduleId });

      if (type === 'mastery') {
        hit.module.mastery = Number(value);
        hit.module.lastStudied = new Date().toISOString();
      } else if (type === 'minutes') {
        hit.module.minutesToday = Number(value);
      } else if (type === 'note') {
        hit.module.note = String(value || '');
      } else if (type === 'quizRecord') {
        // 本章真题自测记录：{ lastScore, total, wrongIds, attempts }
        // value 可为 null 表示清空错题
        hit.module.quizRecord = (value === null) ? {} : Object.assign({}, hit.module.quizRecord || {}, value);
      } else {
        return sendJSON(response, 400, { error: '未知保存类型: ' + type });
      }

      writeProgress(data);
      return sendJSON(response, 200, { ok: true, module: hit.module });
    } catch (e) {
      console.error('[api/save] 错误:', e);
      return sendJSON(response, 500, { error: String(e.message || e) });
    }
  }

  // POST /api/daily —— 保存每日总时长/笔记（按考试+日期）
  if (pathname === '/api/daily' && request.method === 'POST') {
    try {
      const payload = JSON.parse(await collectBody(request));
      const { examId, minutes, note, date } = payload;
      const data = readProgress();
      if (!data) return sendJSON(response, 500, { error: '读取进度失败' });
      const day = date || todayStr();
      data.dailyLog = data.dailyLog || {};
      data.dailyLog[day] = data.dailyLog[day] || {};
      data.dailyLog[day][examId] = {
        minutes: Number(minutes) || 0,
        note: String(note || (data.dailyLog[day][examId] && data.dailyLog[day][examId].note) || '')
      };
      writeProgress(data);
      return sendJSON(response, 200, { ok: true, day, entry: data.dailyLog[day][examId] });
    } catch (e) {
      return sendJSON(response, 500, { error: String(e.message || e) });
    }
  }

  sendJSON(response, 404, { error: '未知 API: ' + pathname });
}

// ===== 主服务 =====
const server = http.createServer(async (request, response) => {
  const url = request.url || '/';
  const pathname = decodeURIComponent(url.split('?')[0]);

  // API 路由
  if (pathname.startsWith('/api/')) {
    try {
      await handleApi(request, response, pathname);
    } catch (e) {
      sendJSON(response, 500, { error: String(e.message || e) });
    }
    return;
  }

  // 静态文件
  let filePath = resolveFilePath(url);
  if (!path.extname(filePath)) {
    const htmlCandidate = filePath + '.html';
    if (fs.existsSync(htmlCandidate)) filePath = htmlCandidate;
  }
  if (!filePath.startsWith(workspaceRoot)) {
    return sendText(response, 403, 'Forbidden');
  }
  fs.stat(filePath, (error, stats) => {
    if (!error && stats.isDirectory()) {
      return sendFile(path.join(filePath, 'index.html'), response);
    }
    sendFile(filePath, response);
  });
});

server.listen(port, host, () => {
  console.log('========================================');
  console.log('  急速备考 · 学习追踪网站已启动');
  console.log('========================================');
  console.log('  首页:   http://' + host + ':' + port + '/');
  console.log('  进度API: http://' + host + ':' + port + '/api/progress');
  console.log('  数据文件: ' + progressFile);
  console.log('----------------------------------------');
  console.log('  关闭: 双击 zeen-tools\\一键关闭前端.bat');
  console.log('========================================');
});
