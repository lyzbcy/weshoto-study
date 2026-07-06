/**
 * build-search.cjs — 从各章节详情页自动生成 SEARCH_INDEX
 *
 * 用法: node build-search.cjs
 * 输出: 打印生成的 SEARCH_INDEX JS 代码片段到控制台
 *       （手动/脚本拼进 _plaintext.html 后重新加密）
 *
 * 维护：加/删章节时，改下面 CHAPTERS 配置清单，重跑此脚本即可。
 */
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ===== 章节配置清单（加/删章节只改这里）=====
const CHAPTERS = [
  // Level 1（本地文件）
  { level: 1, ch: 1, file: 'chapter1.html', local: true, title: '企业微信产品全景' },
  { level: 1, ch: 2, file: 'chapter2.html', local: true, title: '企业微信内部协作与效率工具' },
  { level: 1, ch: 3, file: 'chapter3.html', local: true, title: '客户运营与微信互通' },
  { level: 1, ch: 4, file: 'chapter4.html', local: true, title: '企微管家产品体系' },
  { level: 1, ch: 5, file: 'chapter5.html', local: true, title: '会话内容存档与AI能力' },
  { level: 1, ch: 6, file: 'chapter6.html', local: true, title: '销售后端全链路管理' },
  { level: 1, ch: 7, file: 'chapter7.html', local: true, title: '考试通关实战手册' },
  // Level 2（help.wshoto.com 远程URL）
  { level: 2, ch: 8, file: '', url: 'https://help.wshoto.com/resource/a4ddde09072a4c7381285f09d946ee30/ee700db4.html', title: 'CEO宣讲：微盛公司介绍与管培生培养' },
  { level: 2, ch: 9, file: '', url: 'https://help.wshoto.com/resource/e11f25dc55bf44a2beca9d893adee297/99d6dff3.html', title: '合同·工单·收款全链路' },
  { level: 2, ch: 10, file: '', url: 'https://help.wshoto.com/resource/784304c6fde2495386baf332bea55e17/0e679d52.html', title: '工程架构与研发规范' },
  { level: 2, ch: 11, file: '', url: 'https://help.wshoto.com/resource/421f3272d8034456832d8f1728dd586a/b3330cfd.html', title: '生产灰度发布规范' },
  { level: 2, ch: 12, file: '', url: 'https://help.wshoto.com/resource/13f7ed15923547a4b96579a12c77a945/241506c8.html', title: '哇塞智能AI工作流' },
];

function fetch(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, { headers: { 'User-Agent': 'build-search/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetch(res.headers.location).then(resolve, reject);
      }
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function readLocal(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

// 从 HTML 提取搜索数据：h2 标题 + card 内容 + task 题干
function extractSearchData(html, chNum) {
  const sections = [];
  const concepts = [];

  // 提取 h2[id^="sec"] 标题
  const h2Re = /<h2[^>]*id="(sec\d+)"[^>]*>(.*?)<\/h2>/g;
  let m;
  while ((m = h2Re.exec(html)) !== null) {
    const id = m[1];
    const title = m[2].replace(/<[^>]+>/g, '').trim();
    sections.push({ id, title });
  }

  // 提取 card h3 标题（核心判断/概念）
  const h3Re = /<h3>(.*?)<\/h3>/g;
  while ((m = h3Re.exec(html)) !== null) {
    const text = m[1].replace(/<[^>]+>/g, '').trim();
    if (text) concepts.push(text);
  }

  // 提取 task 题干
  const qRe = /<div class="q">(.*?)<\/div>/g;
  while ((m = qRe.exec(html)) !== null) {
    const text = m[1].replace(/<[^>]+>/g, '').trim();
    if (text) concepts.push(text);
  }

  return { sections, concepts };
}

async function main() {
  const repoDir = __dirname;
  const results = [];

  for (const ch of CHAPTERS) {
    try {
      let html;
      if (ch.local) {
        const fp = path.join(repoDir, ch.file);
        html = readLocal(fp);
      } else {
        process.stdout.write(`  fetch ${ch.url.slice(-20)}... `);
        html = await fetch(ch.url);
        process.stdout.write('OK\n');
      }
      const data = extractSearchData(html, ch.ch);
      results.push({
        ch: ch.ch,
        level: ch.level,
        file: ch.local ? ch.file : ch.url,
        title: ch.title,
        sections: data.sections,
        concepts: data.concepts,
      });
      console.log(`  [${ch.level}-${ch.ch}] ${ch.title}: ${data.sections.length}节, ${data.concepts.length}概念/题`);
    } catch (e) {
      console.error(`  [${ch.level}-${ch.ch}] ${ch.title}: 失败 ${e.message}`);
      // 失败的章节跳过，不阻塞其他章节
    }
  }

  // 生成 SEARCH_INDEX JS 代码
  const json = JSON.stringify(results.map(r => ({
    ch: r.ch,
    level: r.level,
    file: r.file,
    title: r.title,
    sections: r.sections,
    concepts: r.concepts,
  })), null, 2);

  console.log('\n========== SEARCH_INDEX ==========');
  console.log('var SEARCH_INDEX = ' + json + ';');
  console.log('========== END ==========\n');
  console.log(`共 ${results.length} 章，${results.reduce((s, r) => s + r.sections.length, 0)} 个小节`);
}

main().catch(e => { console.error(e); process.exit(1); });
