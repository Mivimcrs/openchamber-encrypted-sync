import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { atomicWrite } from './files.mjs';

// 2.7.x 起桌面版不再随包 opencode-cli（换成了只跑 serve 的 opencode-server），
// 所以这里按「配置 → 环境变量 → 旧内置路径 → PATH」逐个试，都没有就返回 null，
// 由调用方整体跳过会话同步，避免每轮把几十 MB 会话对象白拉一遍。
export function resolveCli(override) {
  const candidates = [];
  if (override && String(override).trim()) candidates.push(String(override).trim());
  if (process.env.OPENCODE_CLI) candidates.push(process.env.OPENCODE_CLI);
  candidates.push(path.join(path.dirname(process.execPath), 'resources', 'opencode-cli', process.platform === 'win32' ? 'opencode.exe' : 'opencode'));
  const names = process.platform === 'win32' ? ['opencode.exe', 'opencode.cmd', 'opencode.bat'] : ['opencode'];
  for (const dir of String(process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    for (const name of names) candidates.push(path.join(dir, name));
  }
  for (const candidate of candidates) {
    try { if (existsSync(candidate)) return candidate; } catch { /* 路径不可读继续找 */ }
  }
  return null;
}

function run(cli, args, { cwd, timeout = 120000, input } = {}) {
  return new Promise((resolve, reject) => {
    // Windows 下 spawn 遇到不存在的 cwd 会报 ENOENT，看起来像“找不到 opencode”，先在启动前把话说清楚。
    if (cwd && !existsSync(cwd)) {
      reject(new Error(`会话目录不存在或无法创建：${cwd}`));
      return;
    }
    if (!cli || !existsSync(cli)) {
      const error = new Error(cli ? `找不到 OpenCode 可执行文件：${cli}` : '未检测到 OpenCode CLI');
      error.code = 'NO_CLI';
      reject(error);
      return;
    }
    const child = spawn(cli, args, { cwd, windowsHide: true, env: { ...process.env, OPENCODE_CLI_SILENT: '1' } });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('OpenCode 命令超时')); }, timeout);
    child.stdout.on('data', d => { stdout += d; if (stdout.length > 128 * 1024 * 1024) { child.kill(); reject(new Error('OpenCode 输出过大')); } });
    child.stderr.on('data', d => { stderr = (stderr + d).slice(-8000); });
    child.on('error', e => { clearTimeout(timer); reject(new Error(`无法启动 OpenCode：${e.code || e.message}（cwd=${cwd || '-'}）`)); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(Object.assign(new Error(`OpenCode 返回 ${code}：${stderr.trim().slice(0, 500) || '无错误输出'}`), { code, stderr }));
    });
    if (input) child.stdin.end(input); else child.stdin.end();
  });
}

export async function listSessions(openchamberDir) {
  let index;
  try { index = JSON.parse(await fs.readFile(path.join(openchamberDir, 'sessions-directories.json'), 'utf8')); } catch { return []; }
  const out = new Map();
  for (const [folderKey, folders] of Object.entries(index.foldersMap || {})) {
    const directory = folderKey.replace(/^__archived__:/, '');
    for (const folder of Array.isArray(folders) ? folders : []) {
      for (const id of folder.sessionIds || []) if (/^ses_[A-Za-z0-9]+$/.test(id) && !out.has(id)) out.set(id, { id, directory });
    }
  }
  return [...out.values()];
}

// 从 OpenCode 运行中的服务读取全部会话（含归档、含子会话），比索引文件可靠。
export async function listSessionsViaApi({ cli, limit = 200, runCommand }) {
  const rows = new Map();
  let cursor = '';
  for (let page = 0; page < 20; page++) {
    const query = `/api/session?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const { stdout } = await (runCommand || run)(cli, ['api', 'get', query], { timeout: 60000 });
    const body = JSON.parse(stdout);
    const list = Array.isArray(body?.data) ? body.data : [];
    for (const s of list) {
      if (!/^ses_[A-Za-z0-9]+$/.test(String(s?.id || ''))) continue;
      rows.set(s.id, {
        id: s.id,
        title: String(s.title || ''),
        directory: String(s.location?.directory || ''),
        archived: Boolean(s.time?.archived),
        parentID: String(s.parentID || ''),
        updated: Number(s.time?.updated || 0),
      });
    }
    const next = body?.cursor?.next;
    if (!next || !list.length || next === cursor) break;
    cursor = next;
  }
  return [...rows.values()];
}

// 消息级并集：按消息 id 去重、按创建时间排序。同一 id 内容不同时取更新时间较新的一侧。
export function mergeSessionPayloads(local, remote) {
  if (!local?.info?.id || !remote?.info?.id || local.info.id !== remote.info.id) throw new Error('只能合并同一会话的数据');
  const localNewer = Number(local.info.time?.updated || 0) >= Number(remote.info.time?.updated || 0);
  const base = localNewer ? local : remote;
  const other = localNewer ? remote : local;
  const byId = new Map();
  for (const message of other.messages || []) if (message?.id) byId.set(message.id, message);
  let replaced = 0;
  for (const message of base.messages || []) {
    if (!message?.id) continue;
    const prev = byId.get(message.id);
    if (prev && JSON.stringify(prev.text) !== JSON.stringify(message.text)) replaced++;
    byId.set(message.id, message);
  }
  const messages = [...byId.values()].sort((a, b) => (Number(a.time?.created || 0) - Number(b.time?.created || 0)) || String(a.id).localeCompare(String(b.id)));
  const archived = [local.info.time?.archived, remote.info.time?.archived].filter(Boolean).sort((a, b) => a - b)[0] || null;
  const time = {
    ...base.info.time,
    created: Math.min(Number(local.info.time?.created || 0) || Infinity, Number(remote.info.time?.created || 0) || Infinity),
    updated: Math.max(Number(local.info.time?.updated || 0), Number(remote.info.time?.updated || 0)),
  };
  if (archived) time.archived = archived; else delete time.archived;
  if (!Number.isFinite(time.created)) delete time.created;
  return { payload: { ...base, info: { ...base.info, time }, messages }, replaced, usedNewerSide: localNewer ? 'local' : 'remote', added: messages.length - Math.max((local.messages || []).length, (remote.messages || []).length) };
}

async function exportOne({ session, cacheDir, cli, maxBytes, log }) {
  const target = path.join(cacheDir, `${session.id}.json`);
  try {
    const { stdout } = await run(cli, ['session', 'export', session.id], { cwd: session.directory });
    if (Buffer.byteLength(stdout) > maxBytes) { log(`会话 ${session.id} 超过单对象上限，跳过`); return false; }
    const parsed = JSON.parse(stdout);
    if (!parsed?.info?.id || !Array.isArray(parsed.messages)) throw new Error('导出结构无效');
    await atomicWrite(target, JSON.stringify(parsed));
    return true;
  } catch (e) { log(`会话 ${session.id} 导出失败：${e.message}`); return false; }
}

export async function exportSessions({ sessions, openchamberDir, cacheDir, cli, maxSessions = 2000, maxBytes = 20 * 1024 * 1024, log = () => {}, changedOnly = false, skip = new Set(), budget = 20 }) {
  const list = sessions || await listSessions(openchamberDir);
  const written = [], failed = [];
  let exported = 0, truncated = false;
  for (const session of list.slice(0, maxSessions)) {
    if (skip.has(session.id)) continue;
    const target = path.join(cacheDir, `${session.id}.json`);
    if (changedOnly) {
      const cached = await fs.readFile(target, 'utf8').then(JSON.parse).catch(() => null);
      const cachedAt = cached?.info?.time?.updated || 0;
      // 会话的更新时间来自 OpenCode 服务，避免每个目录再多跑一次 session list
      const remoteAt = Number(session.updated || 0) || cachedAt;
      if (cached && remoteAt <= cachedAt) { written.push(session.id); continue; }
    } else {
      try { const stat = await fs.stat(target); if (stat.size > 0) { written.push(session.id); continue; } } catch { /* 尚未导出 */ }
    }
    if (exported >= budget) { truncated = true; break; }
    if (await exportOne({ session, cacheDir, cli, maxBytes, log })) { written.push(session.id); exported++; }
    else failed.push(session.id);
  }
  return { written, failed, truncated };
}

export function mapDirectory(directory, rules = []) {
  for (const rule of rules) {
    if (!rule?.from || typeof rule.to !== 'string') continue;
    const from = rule.from.replace(/[\\/]+$/, '');
    if (directory === from) return rule.to;
    if (directory.startsWith(`${from}\\`) || directory.startsWith(`${from}/`)) return rule.to + directory.slice(from.length);
  }
  return directory;
}

export async function ensureLocation({ directory, cli }) {
  try { await fs.mkdir(directory, { recursive: true }); }
  catch (e) { throw new Error(`无法创建会话目录 ${directory}：${e.code || e.message}`); }
  const { stdout } = await run(cli, ['api', 'post', '/api/session', '-d', JSON.stringify({ title: '__sync_location__', location: { directory } })], { cwd: directory, timeout: 60000 });
  const data = JSON.parse(stdout)?.data;
  if (!data?.projectID) throw new Error('无法解析目标目录的项目标识');
  try { await run(cli, ['session', 'delete', data.id], { cwd: directory, timeout: 60000 }); }
  catch { /* 清理临时会话失败不影响恢复 */ }
  return { projectID: data.projectID };
}

export async function importSession({ payload, directory, cli, dryRun = false, ensure = ensureLocation, runCommand }) {
  if (!payload?.info?.id || !Array.isArray(payload.messages)) throw new Error('会话数据无效');
  if (dryRun) return { skipped: false, dryRun: true };
  const location = await ensure({ directory, cli });
  return importPayload({ payload, directory, cli, projectID: location.projectID, runCommand });
}

export async function importPayload({ payload, directory, cli, projectID, runCommand }) {
  const tmp = path.join(process.env.OPENCHAMBER_SERVICE_DATA_DIR || process.cwd(), 'tmp');
  await fs.mkdir(tmp, { recursive: true });
  const file = path.join(tmp, `${payload.info.id}-${Date.now()}.json`);
  const doc = {
    info: {
      ...payload.info,
      ...(projectID ? { projectID } : {}),
      location: { directory },
    },
    messages: payload.messages,
  };
  await atomicWrite(file, JSON.stringify(doc));
  try {
    await fs.mkdir(directory, { recursive: true }).catch(() => {});
    const { stdout, stderr } = await (runCommand || run)(cli, ['session', 'import', file, '--directory', directory], { cwd: directory, timeout: 180000 });
    return { skipped: /already exists|已存在/i.test(`${stdout} ${stderr}`) };
  } catch (e) {
    const detail = `${e.message} ${e.stderr || ''}`;
    if (/already exists|已存在/i.test(detail)) return { skipped: true };
    const parentID = payload?.info?.parentID;
    // 服务端 404 SessionNotFoundError：子会话必须先有父会话
    if (parentID && /Failed to import session|SessionNotFound|not found/i.test(detail)) {
      const err = new Error(`父会话 ${parentID} 尚未导入，稍后重试`);
      err.code = 'PARENT_MISSING';
      throw err;
    }
    throw e;
  } finally { await fs.rm(file, { force: true }); }
}

export async function deleteSession({ sessionId, directory, cli, runCommand }) {
  if (!/^ses_[A-Za-z0-9]+$/.test(sessionId)) throw new Error('会话标识无效');
  try {
    await (runCommand || run)(cli, ['session', 'delete', sessionId], { cwd: directory, timeout: 60000 });
    return { skipped: false };
  } catch (e) {
    // 目标状态已达成：会话本来就不存在
    if (isSessionMissing(e)) return { skipped: true };
    throw e;
  }
}

const isSessionMissing = e => /session not found|not found/i.test(`${e?.message || ''} ${e?.stderr || ''}`);

export async function archiveSession({ id, archived = true, cli, runCommand }) {
  if (!/^ses_[A-Za-z0-9]+$/.test(String(id))) throw new Error('会话标识无效');
  try {
    await (runCommand || run)(cli, ['api', 'patch', `/api/session/${id}`, '-d', JSON.stringify({ archived })], { timeout: 60000 });
    return { skipped: false };
  } catch (e) {
    if (isSessionMissing(e)) return { skipped: true };
    throw e;
  }
}
