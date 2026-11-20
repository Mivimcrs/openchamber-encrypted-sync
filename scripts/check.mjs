import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// 发布前自检：清单完整、入口存在、脚本能过语法检查、没有把本机路径写进仓库。
const run = promisify(execFile);
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const problems = [];
const notes = [];

const manifest = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(String(manifest.version || ''))) problems.push('package.json 的 version 不是 x.y.z');
if (!manifest.openchamber?.apiVersion) problems.push('package.json 缺少 openchamber.apiVersion');

const contributes = manifest.openchamber?.contributes || {};
if (!contributes.panel?.entry) problems.push('package.json 缺少 contributes.panel.entry');
if (!contributes.service?.entry) problems.push('package.json 缺少 contributes.service.entry');

const entries = [contributes.panel?.entry, contributes.statusSection?.entry, contributes.service?.entry].filter(Boolean);
for (const entry of entries) {
  try { await access(path.join(ROOT, entry)); }
  catch { problems.push(`入口文件不存在：${entry}`); }
}

async function* walk(dir, rel = '') {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    if (item.name === 'node_modules' || item.name === '.git' || item.name === 'dist') continue;
    const relPath = rel ? `${rel}/${item.name}` : item.name;
    if (item.isDirectory()) yield* walk(path.join(dir, item.name), relPath);
    else yield relPath;
  }
}

const codeFiles = [];
for await (const rel of walk(ROOT)) {
  if (!/\.(mjs|js)$/.test(rel)) continue;
  codeFiles.push(rel);
  try { await run(process.execPath, ['--check', path.join(ROOT, rel)]); }
  catch (error) { problems.push(`语法检查失败：${rel}\n${error.stderr || error.message}`); }
}
notes.push(`语法检查通过：${codeFiles.length} 个文件`);

// 本机路径 / 明文密钥泄漏检查（scripts/ 里是检测规则本身，跳过；
// 面板里的 `C:\Users\你\…` 是输入框占位示例，不算泄漏）
const LEAK = [/:\\Users\\(?!你)/i, /:\/Users\/(?!你)/i, /\bMivimcrs\b/, /gh[pousr]_[A-Za-z0-9]{20,}/, /sk-[A-Za-z0-9]{20,}/];
for await (const rel of walk(ROOT)) {
  if (!/\.(mjs|js|json|md|html|yml|yaml)$/.test(rel)) continue;
  if (rel.startsWith('scripts/') || rel.startsWith('tests/') || rel === 'README.md') continue;
  const text = await readFile(path.join(ROOT, rel), 'utf8');
  for (const pattern of LEAK) {
    if (pattern.test(text)) problems.push(`疑似泄漏本机路径或密钥：${rel}（${pattern}）`);
  }
}

const readme = await readFile(path.join(ROOT, 'README.md'), 'utf8').catch(() => '');
const changelog = await readFile(path.join(ROOT, 'CHANGELOG.md'), 'utf8').catch(() => '');
if (!readme) problems.push('缺少 README.md');
if (!changelog.includes(manifest.version)) problems.push(`CHANGELOG.md 里没有当前版本 ${manifest.version}`);

if (problems.length) {
  console.error(`自检失败（${problems.length} 项）`);
  for (const item of problems) console.error(`- ${item}`);
  process.exit(1);
}

console.log(`OK  version=${manifest.version}  files=${codeFiles.length}`);
for (const note of notes) console.log(`- ${note}`);
