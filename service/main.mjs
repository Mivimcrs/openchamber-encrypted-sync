import http from 'node:http';
import path from 'node:path';
import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Vault, SyncEngine, mergeRemote } from './engine.mjs';
import { createStore } from './storage.mjs';
import { newVault, unlockVault, seal, open, keyHash } from './crypto.mjs';
import { readJSON, writeJSON, atomicWrite, safeKey, safePath } from './files.mjs';
import { SETTINGS_KEY, projectSettings, mergeSettings } from './settings-guard.mjs';
import { collectFileKeys, fileAdapter, readLocalMap, writeRestoredFile, deleteRestoredFile, roots } from './local.mjs';
import { resolveCli, exportSessions, importSession, deleteSession, listSessions, listSessionsViaApi, archiveSession, mergeSessionPayloads, mapDirectory } from './sessions.mjs';
import { protect, unprotect, dpapiAvailable } from './dpapi.mjs';
import { safePreview, listBackups } from './preview.mjs';
import { Hydrator } from './downloads.mjs';

const dataDir = process.env.OPENCHAMBER_SERVICE_DATA_DIR || path.join(process.cwd(), '.data');
const port = Number(process.env.OPENCHAMBER_SERVICE_PORT || 0);
const token = process.env.OPENCHAMBER_SERVICE_TOKEN || '';
const configFile = path.join(dataDir, 'config.json');
const secretsFile = path.join(dataDir, 'secrets.bin');
const stateFile = path.join(dataDir, 'baseline.json');
const cacheDir = path.join(dataDir, 'cache', 'sessions');
const backupDir = path.join(dataDir, 'backups');
const zipDir = path.join(dataDir, 'zips');
const logFile = path.join(dataDir, 'sync.log');

// 设备本地文件：只属于这台机器，绝不参与同步（含本机绝对路径 / 会话索引）
const LOCAL_ONLY = new Set(['openchamber/sessions-directories.json', 'openchamber/extensions.json']);
const isLocalOnly = key => LOCAL_ONLY.has(key);
const IGNORED_KEY = /(^|\/)__pycache__(\/|$)|\.pyc$/i;
const shouldIgnoreKey = key => isLocalOnly(key) || IGNORED_KEY.test(key);
// 不在本轮同步范围内的键（比如没有 CLI 时的会话）要同时从台账、本机、远端三侧滤掉，
// 否则会生成 record 为 null 的空推送项，直接让 /preview 崩掉。
const outOfScopeKey = key => shouldIgnoreKey(key) || !inScope(key);
const execFileAsync = promisify(execFile);

// 导出失败缓存：避免失效会话每 15 秒重试一次
const exportFailures = new Map();
const FAILURE_TTL = 10 * 60 * 1000;
const hashCache = new Map();

const deviceId = createHash('sha256').update(`${process.env.COMPUTERNAME || 'device'}:${dataDir}`).digest('hex').slice(0, 40);
const defaults = {
  version: 1,
  storage: { type: 'folder', folder: '' },
  selection: { sessions: true, settings: true, extensions: true, providers: false },
  auto: { enabled: true, idleMs: 60000, startupMs: 30000, autoDelete: false },
  directories: {},
  mapDirectories: [],
  fallbackDirectory: '',
  rememberKey: true,
  archiveImported: false,
};
let config = { ...defaults };
let secrets = {};
let vault = null;
let engine = null;
let lastError = '';
let lastResult = null;
let busy = null;
let job = null;
let hydrator = null;
let followUps = 0;
let warnedNoCli = false;
let lastChangeAt = 0;
let signature = '';

// 长任务改造：请求立刻返回，真正干活留在后台，面板轮询 /state 看进度
const PASS_MS = 120_000;
const PASS_BYTES = 60 * 1024 * 1024;
const PASS_OBJECTS = 6;
const JOB_LIMIT_MS = 30 * 60 * 1000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// CLI 解析要扫 PATH，缓 60 秒，避免每个本地键都扫一遍
let cliCache = { at: 0, value: null };
function cliPath() {
  if (Date.now() - cliCache.at > 60_000) cliCache = { at: Date.now(), value: resolveCli(config.cli) };
  return cliCache.value;
}

function jobView() {
  if (!job) return null;
  return {
    id: job.id, kind: job.kind, phase: job.phase, done: job.done, total: job.total,
    round: job.round || 0, running: job.running, startedAt: job.startedAt, updatedAt: job.updatedAt,
    error: job.error || '',
  };
}

function startJob(kind, task) {
  if (job?.running) return false;
  followUps = 0;
  const id = createHash('sha256').update(`${Date.now()}:${Math.random()}`).digest('hex').slice(0, 12);
  const current = { id, kind, phase: 'start', done: 0, total: 0, round: 0, startedAt: Date.now(), updatedAt: Date.now(), running: true, error: '', result: null };
  job = current;
  void Promise.resolve()
    .then(task)
    .then(result => { current.result = result ?? null; current.phase = 'done'; })
    .catch(error => { current.error = error?.message || String(error); current.phase = 'failed'; })
    .finally(() => { current.running = false; current.updatedAt = Date.now(); });
  return true;
}

const log = async (message) => {
  try { await fs.appendFile(logFile, `${new Date().toISOString()} ${message}\n`); } catch { /* 日志失败不阻塞同步 */ }
};

async function loadSecrets() {
  try {
    const raw = await fs.readFile(secretsFile);
    const text = dpapiAvailable() ? await unprotect(raw) : raw.toString('utf8');
    secrets = JSON.parse(text);
  } catch { secrets = {}; }
}
async function saveSecrets() {
  const text = JSON.stringify(secrets);
  const raw = dpapiAvailable() ? await protect(text) : Buffer.from(text);
  await atomicWrite(secretsFile, raw);
}
async function loadConfig() {
  const saved = await readJSON(configFile, null);
  config = { ...defaults, ...(saved || {}), selection: { ...defaults.selection, ...(saved?.selection || {}) }, auto: { ...defaults.auto, ...(saved?.auto || {}) } };
}
const saveConfig = () => writeJSON(configFile, config);

function storageOf() {
  const merged = { ...config.storage, ...(secrets.storage || {}) };
  return createStore(merged);
}
function makeVault(store) {
  return new Vault({ store, key: null, deviceId, stateFile, readJSON, writeJSON, newVault, unlockVault });
}

// 下载协调层只建一次：跨轮、跨请求的下载进度都留在它里面，
// 否则每轮新建会把「正在下载」的对象忘掉、从头再拉一遍。
function ensureHydrator(store) {
  if (!hydrator) {
    hydrator = new Hydrator({
      store,
      getVault: () => vault,
      fileOf: hash => (config.storage.type === 'folder' && config.storage.folder
        ? path.join(config.storage.folder, 'objects', hash.slice(0, 2), hash)
        : null),
      stateFile: path.join(dataDir, 'downloads.json'),
      log: message => log(message),
    });
    void hydrator.load();
  }
  hydrator.store = store;
  return hydrator;
}

let sessionInfo = new Map();

async function localRecords() {
  const cli = cliPath();
  let sessions = [];
  let viaApi = false;
  if (config.selection.sessions) {
    if (!cli) {
      // 2.7.x 起不再随包 opencode-cli：没有可执行文件时整段跳过，
      // 否则远端会话永远导入失败、台账不推进，每轮白拉几十 MB。
      if (!warnedNoCli) {
        warnedNoCli = true;
        await log('未检测到 OpenCode CLI，本轮跳过会话同步（装好后在扩展配置里填 cli 路径即可恢复）');
      }
    } else {
      try { sessions = await listSessionsViaApi({ cli }); viaApi = true; }
      catch (e) { await log(`会话列表改为读取索引：${e.message}`); sessions = await listSessions(roots(config.directories).openchamber); }
      const now = Date.now();
      for (const [id, value] of exportFailures) if (now - value.at >= FAILURE_TTL) exportFailures.delete(id);
      const skip = new Set(exportFailures.keys());
      const { failed, truncated } = await exportSessions({ sessions, cacheDir, cli, changedOnly: true, skip, budget: 30, log: m => log(m) });
      if (truncated) await log('会话导出分批进行中：本轮已导出 10 个，剩余稍后自动继续');
      for (const id of failed) exportFailures.set(id, { at: now });
    }
  }
  const entries = await collectFileKeys({ selection: config.selection, directories: config.directories, dataDir });
  const liveSessions = new Set(sessions.map(s => s.id));
  sessionInfo = new Map(sessions.map(s => [s.id, s]));
  const map = {};
  for (const entry of entries) {
    if (entry.key.startsWith('sessions/')) {
      const id = entry.key.slice('sessions/'.length, -5);
      // 服务端已不存在的会话不再当作本机内容（缓存文件可能残留）
      if (!liveSessions.has(id)) continue;
    }
    const cached = hashCache.get(entry.key);
    if (cached && cached.size === entry.size && cached.mtimeMs === entry.updatedAt) { map[entry.key] = cached.record; continue; }
    const rawData = await fs.readFile(entry.file);
    // 设置只对共享键做哈希：设备本地键（项目/主目录/令牌）不参与跨机比对
    const data = entry.key === SETTINGS_KEY ? Buffer.from(projectSettings(rawData)) : rawData;
    const record = { hash: keyHash(vault.key, data), updatedAt: entry.updatedAt, deviceId, deleted: false };
    hashCache.set(entry.key, { size: entry.size, mtimeMs: entry.updatedAt, record });
    map[entry.key] = record;
  }
  return { map, entries, liveSessions, sessions, viaApi };
}

function inScope(key) {
  if (key.startsWith('sessions/')) return Boolean(config.selection.sessions) && Boolean(cliPath());
  if (key.startsWith('extensions/')) return Boolean(config.selection.extensions);
  if (key.startsWith('secrets/')) return Boolean(config.selection.providers);
  if (key === 'opencode/opencode.json' && !config.selection.settings) return Boolean(config.selection.providers);
  return Boolean(config.selection.settings);
}

// 会话落地目录：本机存在原路径就落原项目（大小写按磁盘真实值），否则统一落到 chats/跨机同步
async function realDirectory(dir) {
  try { return await fs.realpath(dir); } catch { return dir; }
}

async function sessionTarget(payload) {
  const original = payload?.info?.location?.directory || '';
  const mapped = mapDirectory(original, config.mapDirectories) || original;
  if (mapped && existsSync(mapped)) return realDirectory(mapped);
  const base = config.fallbackDirectory || path.join(roots(config.directories).openchamber, 'chats');
  const target = path.join(base, '跨机同步');
  await fs.mkdir(target, { recursive: true }).catch(() => {});
  return realDirectory(target);
}

async function buildEngine() {
  const store = storageOf();
  if (!vault) throw new Error('同步库尚未解锁');
  vault.store = store;
  const { map, entries, liveSessions } = await localRecords();
  const byKey = new Map(entries.map(e => [e.key, e]));
  globalThis.__localIndex = byKey;
  const state = await vault.state();

  // 一次性迁移：设备本地文件从台账移除，不产生删除提交
  let migrated = false;
  for (const key of Object.keys(state.baseline)) {
    if (shouldIgnoreKey(key)) { delete state.baseline[key]; migrated = true; }
  }
  if (migrated) await vault.saveState(state);

  const local = { ...map };
  for (const key of Object.keys(state.baseline)) {
    if (local[key] || !inScope(key)) continue;
    if (key.startsWith('sessions/')) {
      if (liveSessions.has(key.slice(9, -5))) continue;
    }
    // 只是“本机现在找不到”：标记为待确认，绝不自动生成删除提交
    local[key] = { ...state.baseline[key], deleted: true, updatedAt: Date.now() };
  }
  engine = new SyncEngine({
    vault,
    hydrator: ensureHydrator(store),
    ignoreKey: outOfScopeKey,
    mergeSession: (mine, theirs) => mergeSessionPayloads(JSON.parse(mine.toString()), JSON.parse(theirs.toString())),
    readLocal: async () => local,
    readLocalData: async key => {
      const entry = byKey.get(key);
      if (entry) {
        const raw = await fs.readFile(entry.file);
        return key === SETTINGS_KEY ? Buffer.from(projectSettings(raw)) : raw;
      }
      if (!key.startsWith('sessions/')) throw new Error(`本机文件已不存在，无法上传：${key}`);
      return fs.readFile(path.join(cacheDir, key.slice('sessions/'.length)));
    },
    writeLocal: async (key, data) => {
      if (key.startsWith('sessions/')) {
        const payload = JSON.parse(data.toString());
        const id = payload.info.id;
        const isNew = !sessionInfo.has(id);
        const directory = await sessionTarget(payload);
        const result = await importSession({ payload, directory, cli: cliPath() });
        if (result.skipped) await log(`会话 ${id} 已存在，跳过导入`);
        // 缓存保持远端原样：导入不再顺手归档，否则对方会话在主列表里会看不到
        let cached = payload;
        if (isNew && config.archiveImported === true) {
          const stamp = Date.now();
          await archiveSession({ id, cli: cliPath() }).catch(e => log(`会话 ${id} 归档失败：${e.message}`));
          cached = { ...payload, info: { ...payload.info, time: { ...(payload.info.time || {}), archived: stamp } } };
          await log(`会话 ${id} 已导入并放入归档（配置显式开启）`);
        }
        await atomicWrite(path.join(cacheDir, `${id}.json`), JSON.stringify(cached));
        return;
      }
      await backupFile(key, data);
      if (key === SETTINGS_KEY) {
        // 远端设置只覆盖共享键；项目登记、主目录、令牌保留本机，项目按路径求并集
        const target = fileAdapter({ key, file: '', directories: config.directories }).target;
        const localRaw = target ? await fs.readFile(target).catch(() => null) : null;
        const merged = mergeSettings({ localRaw, remoteRaw: data });
        await writeRestoredFile(key, Buffer.from(merged), config.directories);
        let kept = 0;
        try { const doc = JSON.parse(merged); if (Array.isArray(doc.projects)) kept = doc.projects.length; } catch { /* 合并不成 JSON 时只记 0 */ }
        await log(`设置已合并：保留本机项目 ${kept} 个`);
        return;
      }
      await writeRestoredFile(key, data, config.directories);
      if (key.startsWith('extensions/')) await ensureExtensionInstalled(key);
    },
    archiveLocal: async key => {
      const id = key.slice('sessions/'.length, -5);
      if (!/^ses_[A-Za-z0-9]+$/.test(id)) throw new Error('会话缓存无效');
      if (!sessionInfo.has(id)) {
        await log(`会话 ${id} 已不存在，无需归档，直接清理`);
        await fs.rm(path.join(cacheDir, `${id}.json`), { force: true });
        return;
      }
      const result = await archiveSession({ id, cli: cliPath() }).catch(e => { log(`会话 ${id} 归档失败：${e.message}`); return { skipped: false }; });
      const file = path.join(cacheDir, `${id}.json`);
      const payload = await fs.readFile(file, 'utf8').then(JSON.parse).catch(() => null);
      if (payload?.info) {
        payload.info.time = { ...(payload.info.time || {}), archived: payload.info.time?.archived || Date.now() };
        await atomicWrite(file, JSON.stringify(payload));
      }
      await log(result.skipped ? `会话 ${id} 已不存在，忽略归档` : `会话 ${id} 已归档（云端删除）`);
    },
    deleteLocal: async key => {
      if (key.startsWith('sessions/')) {
        const file = path.join(cacheDir, key.slice('sessions/'.length));
        const cached = await fs.readFile(file).catch(() => null);
        const payload = cached ? JSON.parse(cached.toString()) : null;
        const id = payload?.info?.id || key.slice('sessions/'.length, -5);
        if (!/^ses_[A-Za-z0-9]+$/.test(id)) throw new Error('会话缓存无效');
        if (!sessionInfo.has(id)) {
          await log(`会话 ${id} 已不存在，直接清理`);
          await fs.rm(file, { force: true });
          return;
        }
        const known = sessionInfo.get(id) || (await listSessions(roots(config.directories).openchamber)).find(s => s.id === id);
        const directory = known?.directory || payload?.info?.location?.directory || await sessionTarget(payload || {});
        if (!directory) throw new Error(`无法确定会话 ${id} 的所在目录`);
        await deleteSession({ sessionId: id, directory, cli: cliPath() });
        await fs.rm(file, { force: true });
        sessionInfo.delete(id);
        return;
      }
      await backupFile(key, null);
      await deleteRestoredFile(key, config.directories);
    },
  });
  return engine;
}

// 本机原本没有这个扩展：补进扩展清单，让宿主下次扫描时加载
async function ensureExtensionInstalled(key) {
  const id = key.slice('extensions/'.length).split('/')[0];
  if (!id) return;
  const dir = path.join(roots(config.directories).openchamber, 'extensions', id);
  try {
    const stat = await fs.stat(dir);
    if (!stat.isDirectory()) return;
  } catch { return; }
  const file = path.join(roots(config.directories).openchamber, 'extensions.json');
  const doc = await fs.readFile(file, 'utf8').then(JSON.parse).catch(() => ({}));
  const paths = new Set(Array.isArray(doc.paths) ? doc.paths : []);
  if (paths.has(dir)) return;
  paths.add(dir);
  await atomicWrite(file, JSON.stringify({ ...doc, paths: [...paths] }, null, 2));
  await log(`扩展 ${id} 已自动登记，重启宿主后生效`);
}

// 扩展备份：本机留一份可直接安装的 zip，云端留一份加密副本
async function packExtensions() {
  const base = path.join(roots(config.directories).openchamber, 'extensions');
  const zips = await fs.readdir(base).catch(() => []);
  const rows = [];
  await fs.mkdir(zipDir, { recursive: true });
  for (const id of zips) {
    if (id === 'encrypted-sync') continue;
    const src = path.join(base, id);
    const stat = await fs.stat(src).catch(() => null);
    if (!stat?.isDirectory()) continue;
    const target = path.join(zipDir, `${id}.zip`);
    try {
      await fs.rm(target, { force: true });
      const quoted = source => `'${source.replaceAll("'", "''")}'`;
      await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Compress-Archive -Path ${quoted(path.join(src, '*'))} -DestinationPath ${quoted(target)} -Force`], { windowsHide: true, timeout: 180000 });
      const data = await fs.readFile(target);
      if (vault) await storageOf().put(`packs/extensions/${id}.zip.oc`, seal(vault.key, data, `pack:${id}`, { compress: false }));
      rows.push({ id, zip: target, bytes: data.length });
    } catch (e) { rows.push({ id, error: e.message }); }
  }
  return rows;
}

async function backupFile(key, incoming) {
  if (!vault?.key) return;
  const target = fileAdapter({ key, file: '', directories: config.directories }).target;
  if (!target) return;
  try {
    const current = await fs.readFile(target);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    await atomicWrite(path.join(backupDir, stamp, `${key.replaceAll('/', '_')}.oc`), seal(vault.key, current, 'backup'));
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
}

const KIND_LABELS = { session: '会话', extension: '扩展', plugin: '插件与技能', setting: '设置', credential: '凭据' };
const SETTING_LABELS = {
  'openchamber/settings.json': 'OpenChamber 设置',
  'openchamber/preferences.json': 'OpenChamber 首选项',
  'openchamber/classification.json': '会话分类',
  'openchamber/routing.json': '模型路由',
  'openchamber/plugin-switches.json.last-good': '插件开关',
  'opencode/opencode.json': 'OpenCode 配置',
  'opencode/opencode.jsonc': 'OpenCode 配置',
  'opencode/config.json': 'OpenCode 配置',
  'opencode/AGENTS.md': '全局 AGENTS.md',
  'opencode/cli.json': 'CLI 配置',
  'secrets/opencode-auth.json': '登录与 API 凭据',
};
const PLUGIN_DIRS = { agents: '代理', commands: '命令', skills: '技能', plugins: '插件' };

function kindOf(key) {
  if (key.startsWith('sessions/')) return 'session';
  if (key.startsWith('extensions/')) return 'extension';
  if (key.startsWith('secrets/')) return 'credential';
  if (/^opencode\/(agents|commands|skills|plugins)\//.test(key)) return 'plugin';
  return 'setting';
}

const shortTime = ms => {
  if (!ms) return '';
  const d = new Date(Number(ms));
  if (Number.isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

let extensionNames = new Map();
async function loadExtensionNames() {
  const base = path.join(roots(config.directories).openchamber, 'extensions');
  const map = new Map();
  for (const id of await fs.readdir(base).catch(() => [])) {
    const meta = await fs.readFile(path.join(base, id, 'package.json'), 'utf8').then(JSON.parse).catch(() => null);
    map.set(id, { name: meta?.displayName || meta?.name || id, installed: true });
  }
  extensionNames = map;
}

function labelOf(key) {
  if (key.startsWith('sessions/')) {
    const id = key.slice('sessions/'.length, -5);
    const info = sessionInfo.get(id);
    if (!info) return `会话 ${id}`;
    const dir = info.directory ? path.basename(info.directory) : '';
    const state = info.archived ? '（已归档）' : '';
    return `会话「${info.title || '未命名'}」${state} · ${shortTime(info.updated)}${dir ? ` · ${dir}` : ''}`;
  }
  if (key.startsWith('extensions/')) {
    const id = key.slice('extensions/'.length).split('/')[0];
    const meta = extensionNames.get(id);
    if (meta) return `扩展 ${meta.name}（本机已安装）`;
    return `扩展 ${id}（本机未安装）`;
  }
  if (key === 'secrets/opencode-auth.json') return '登录与 API 凭据';
  const setting = SETTING_LABELS[key];
  if (setting) return setting;
  const plugin = key.match(/^opencode\/(agents|commands|skills|plugins)\/(.+)$/);
  if (plugin) {
    const name = plugin[2].split('/')[0].replace(/\.(md|ts|js|json|ya?ml)$/i, '');
    return `${PLUGIN_DIRS[plugin[1]]} ${name}${plugin[2].includes('/') ? '' : ` · ${plugin[2].split('.').pop()}`}`;
  }
  return key;
}

async function preview() {
  if (!vault) throw new Error('同步库尚未解锁');
  const eng = await buildEngine();
  await loadExtensionNames();
  const { plan, heads, missingCommits } = await eng.preview({ autoDelete: config.auto.autoDelete });
  return { plan, heads, missingCommits };
}

function summarize(plan) {
  const rows = [];
  const add = (item, extra) => rows.push({ key: item.key, kind: kindOf(item.key), group: KIND_LABELS[kindOf(item.key)], label: labelOf(item.key), ...extra });
  for (const item of plan.apply) add(item, { action: item.record?.deleted ? 'delete' : 'update', reason: item.reason, updatedAt: item.record?.updatedAt, deviceId: item.record?.deviceId });
  for (const item of plan.push) add(item, { action: item.record?.deleted ? 'delete' : 'update', direction: 'upload', reason: item.reason, updatedAt: item.record?.updatedAt, deviceId: item.record?.deviceId });
  for (const item of plan.deletions) add(item, { action: item.action === 'hold' ? 'delete-pending' : item.action === 'confirm-local' ? 'local-gone' : 'delete', updatedAt: item.record?.updatedAt });
  for (const item of plan.conflicts) add(item, { action: 'conflict', localAt: item.local?.updatedAt, remoteAt: item.remote?.updatedAt, localHash: item.local?.hash, remoteHash: item.remote?.hash });
  return rows;
}

function localEntry(key) {
  if (!globalThis.__localIndex) return null;
  return globalThis.__localIndex.get(key) || null;
}

async function doSync({ autoDelete, conflictChoices, deletionChoices, localDeletionChoices, skipKeys, join, autoResolve, onProgress } = {}) {
  if (busy) throw new Error('已有同步任务在进行');
  busy = (async () => {
    const startedAt = Date.now();
    const totals = {
      applied: new Set(), pushed: new Set(), archived: new Set(),
      autoMerged: new Map(), autoPicked: new Map(), failed: new Map(),
    };
    let rounds = 0, last = null, pending = [];
    try {
      // 网盘按需下载可能慢到分钟级，单轮只做一部分就收尾提交，
      // 后续轮次接着做；基线只为真正落地的项推进，中断不丢进度。
      while (true) {
        rounds += 1;
        if (job) { job.round = rounds; job.phase = 'plan'; job.updatedAt = Date.now(); }
        const store = storageOf();
        const eng = await buildEngine();
        eng.vault.store = store;
        last = await eng.run({
          autoDelete: autoDelete ?? config.auto.autoDelete,
          conflictChoices: conflictChoices || {},
          deletionChoices: deletionChoices || {},
          localDeletionChoices: localDeletionChoices || {},
          skipKeys: Array.isArray(skipKeys) ? skipKeys : [],
          preferRemote: Boolean(join),
          autoResolve: autoResolve ?? true,
          budget: { deadline: Date.now() + PASS_MS, maxBytes: PASS_BYTES, maxObjects: PASS_OBJECTS, objectCapMs: 90000 },
          onProgress: info => {
            if (!job) return;
            job.phase = info.phase;
            job.done = info.done;
            job.total = info.total;
            job.updatedAt = Date.now();
            try { onProgress?.(info); } catch { /* 进度回调失败不影响同步 */ }
          },
        });
        for (const key of last.applied) totals.applied.add(key);
        for (const key of last.pushed) totals.pushed.add(key);
        for (const key of last.archived || []) totals.archived.add(key);
        for (const item of last.autoMerged) totals.autoMerged.set(item.key, item);
        for (const item of last.autoPicked) totals.autoPicked.set(item.key, item);
        for (const item of last.failed || []) totals.failed.set(item.key, item);
        pending = last.pendingDownloads || [];
        if (!last.more) break;
        if (Date.now() - startedAt > JOB_LIMIT_MS) break;
        if (job) { job.phase = 'wait'; job.updatedAt = Date.now(); }
        await sleep(rounds < 3 ? 3000 : 15000);
      }

      lastError = '';
      const watching = pending.length + (last?.missingCommits || []).length;
      lastResult = {
        at: Date.now(),
        applied: totals.applied.size,
        pushed: totals.pushed.size,
        conflicts: (last?.conflicts || []).length,
        deferred: pending.length,
        missingCommits: (last?.missingCommits || []).length,
        merged: totals.autoMerged.size,
        picked: totals.autoPicked.size,
        archived: totals.archived.size,
        failed: totals.failed.size,
        rounds,
        pendingDownloads: pending.map(item => item.reason),
      };
      const failures = [...totals.failed.values()];
      await log(`同步完成 应用 ${totals.applied.size} 上传 ${totals.pushed.size} 合并 ${totals.autoMerged.size} 自动取舍 ${totals.autoPicked.size} 归档 ${totals.archived.size} 冲突 ${(last?.conflicts || []).length}${failures.length ? ` 失败 ${failures.length}` : ''}${watching ? `，云端 ${watching} 项尚未到位` : ''}${rounds > 1 ? `（分 ${rounds} 轮）` : ''}`);
      for (const item of failures) await log(`写入失败：${item.key} → ${item.message}`);
      for (const item of totals.autoPicked.values()) if (item.reason === 'remote-object-missing') await log(`冲突自动改判本机：${item.key}（远端对象缺失且记录已过期）`);
      for (const item of totals.autoMerged.values()) await log(`会话已合并：${item.key} 新增 ${item.added} 条，替换 ${item.replaced} 条`);

      const retrying = pending.filter(item => item.reason === 'downloading' || item.reason === 'stalled' || item.reason === 'queued');
      if (retrying.length) scheduleFollowUp(retrying.length);

      return {
        applied: [...totals.applied], pushed: [...totals.pushed],
        merged: totals.autoMerged.size, picked: totals.autoPicked.size, archived: totals.archived.size,
        conflicts: (last?.conflicts || []).length, deferred: pending.length,
        missingCommits: (last?.missingCommits || []).length, failed: failures.length,
        pendingDownloads: pending, rounds,
      };
    } catch (e) {
      lastError = e.message;
      await log(`同步失败：${e.message}`);
      throw e;
    } finally { busy = null; }
  })();
  return busy;
}

// 网盘还没下完的对象：60 秒后自动再来一轮，最多 5 次，避免无止境重试
function scheduleFollowUp(pendingCount) {
  if (followUps >= 5) return;
  followUps += 1;
  const delay = 60_000;
  void log(`本轮有 ${pendingCount} 项等待网盘下载，${Math.round(delay / 60000)} 分钟后继续（第 ${followUps} 次）`);
  const timer = setTimeout(async () => {
    if (busy || !vault) return;
    try { await doSync({}); } catch { /* 结果由状态展示 */ }
  }, delay);
  timer.unref?.();
}

async function state() {
  const stateDoc = await readJSON(stateFile, null);
  const configured = Boolean(config.storage.folder || config.storage.url || config.storage.repository);
  // 之前每次轮询都全量读一遍 1374 个提交（约 350 ms），面板 10 秒一次、
  // 状态栏 15 秒一次，纯浪费；台账里已经存了上次的远端时间。
  const remote = Number(stateDoc?.remoteUpdatedAt || 0);
  return {
    configured,
    locked: !vault,
    dpapi: dpapiAvailable(),
    storage: { type: config.storage.type, summary: config.storage.type === 'folder' ? config.storage.folder : config.storage.type === 'github' ? config.storage.repository : config.storage.url },
    selection: config.selection,
    auto: config.auto,
    directories: config.directories,
    mapDirectories: config.mapDirectories,
    fallbackDirectory: config.fallbackDirectory,
    rememberKey: config.rememberKey,
    archiveImported: config.archiveImported === true,
    lastSyncAt: stateDoc?.lastSyncAt || 0,
    remoteUpdatedAt: remote || 0,
    localUpdatedAt: stateDoc?.remoteUpdatedAt || 0,
    pendingDeletions: stateDoc?.pendingDeletions || [],
    lastError,
    lastResult,
    remotePending: (lastResult?.deferred || 0) + (lastResult?.missingCommits || 0),
    busy: Boolean(busy) || Boolean(job?.running),
    job: jobView(),
    downloads: hydrator ? hydrator.summary() : null,
    sessionsAvailable: Boolean(cliPath()),
    deviceId,
    cli: cliPath(),
    sessionCount: config.selection.sessions ? sessionInfo.size : 0,
    sessionCacheCount: config.selection.sessions ? await fs.readdir(cacheDir).then(rows => rows.filter(n => n.endsWith('.json')).length).catch(() => 0) : 0,
  };
}

const send = (res, code, body) => {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': data.length, 'Cache-Control': 'no-store' });
  res.end(data);
};

async function body(req) {
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > 1024 * 1024) throw new Error('请求体过大'); chunks.push(chunk); }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString()); } catch { throw new Error('请求 JSON 无效'); }
}

const routes = {
  'GET /health': async () => ({ ok: true }),
  'GET /state': () => state(),
  'POST /setup': async b => {
    if (!b.password && !vault) throw new Error('需要设置恢复口令');
    if (b.storage) {
      config.storage = { type: b.storage.type, ...(b.storage.type === 'folder' ? { folder: String(b.storage.folder || '') } : b.storage.type === 'github' ? { repository: String(b.storage.repository || ''), branch: String(b.storage.branch || 'main') } : { url: String(b.storage.url || ''), username: String(b.storage.username || '') }) };
      createStore({ ...config.storage, ...(b.storage.secrets || {}) });
      secrets.storage = { ...(b.storage.secrets || {}) };
      await saveSecrets();
    }
    if (b.selection) config.selection = { ...config.selection, ...b.selection };
    if (b.auto) config.auto = { ...config.auto, ...b.auto };
    if (b.directories) config.directories = b.directories;
    if (b.mapDirectories) config.mapDirectories = b.mapDirectories;
    if (b.fallbackDirectory !== undefined) config.fallbackDirectory = String(b.fallbackDirectory);
    if (b.rememberKey !== undefined) config.rememberKey = Boolean(b.rememberKey);
    if (b.archiveImported !== undefined) config.archiveImported = Boolean(b.archiveImported);
    if (b.password) {
      const v = makeVault(storageOf());
      const meta = await v.meta();
      if (meta) await v.unlock(b.password); else await v.create(b.password);
      vault = v;
      hashCache.clear();
      if (config.rememberKey) { secrets.vaultKey = vault.key.toString('base64'); await saveSecrets(); }
    }
    await saveConfig();
    return state();
  },
  'POST /unlock': async b => {
    const v = makeVault(storageOf());
    await v.unlock(String(b.password || ''));
    vault = v;
    hashCache.clear();
    if (config.rememberKey) { secrets.vaultKey = v.key.toString('base64'); await saveSecrets(); }
    return state();
  },
  'POST /lock': async () => { vault = null; secrets.vaultKey = undefined; hashCache.clear(); sessionInfo = new Map(); await saveSecrets(); return state(); },
  'POST /config': async b => {
    if (b.selection) config.selection = { ...config.selection, ...b.selection };
    if (b.auto) config.auto = { ...config.auto, ...b.auto };
    if (b.mapDirectories) config.mapDirectories = b.mapDirectories;
    if (b.fallbackDirectory !== undefined) config.fallbackDirectory = String(b.fallbackDirectory);
    if (b.archiveImported !== undefined) config.archiveImported = Boolean(b.archiveImported);
    await saveConfig();
    return state();
  },
  'POST /storage/test': async () => {
    const store = storageOf();
    const probe = `probe-${Date.now()}`;
    await store.put(`health/${probe}`, Buffer.from('ok'));
    const back = await store.get(`health/${probe}`);
    if (!back || back.toString() !== 'ok') throw new Error('存储读写校验失败');
    return { ok: true, writable: true };
  },
  'POST /preview': async () => {
    const { plan, missingCommits } = await preview();
    const rows = summarize(plan);
    // 远端预览要先拉对象，网盘没落地时会卡住整次请求；只保留小体积本地预览，
    // 面板的差异列表本来就没渲染这两个字段。
    for (const row of rows) {
      const entry = localEntry(row.key);
      if (!entry || Number(entry.size || 0) > 512 * 1024) continue;
      try { row.localPreview = await safePreview(row.key, await fs.readFile(entry.file)); } catch { /* 预览失败不影响差异列表 */ }
    }
    return {
      rows,
      counts: {
        apply: plan.apply.length, push: plan.push.length, conflicts: plan.conflicts.length,
        deletions: plan.deletions.filter(d => d.action === 'hold').length,
        localGone: plan.deletions.filter(d => d.action === 'confirm-local').length,
      },
      missingCommits: missingCommits.length,
    };
  },
  'POST /doctor': async () => {
    if (!vault) throw new Error('请先解锁同步库');
    const stateDoc = await vault.state();
    const store = storageOf();
    const missing = [], unreadable = [];
    for (const [key, record] of Object.entries(stateDoc.baseline)) {
      if (isLocalOnly(key) || IGNORED_KEY.test(key) || record?.deleted || !record?.hash) continue;
      const objectKey = vault.objectKey(record.hash);
      // 只确认存在，不读内容：读占位对象会触发整包下载
      const present = store.exists ? await store.exists(objectKey).catch(() => false) : Boolean(await store.get(objectKey).catch(() => null));
      if (!present) missing.push(key);
    }
    const { commits } = await vault.loadCommits();
    const ghosts = [];
    const cacheFiles = await fs.readdir(cacheDir).catch(() => []);
    const live = new Set(sessionInfo.size ? [...sessionInfo.keys()] : []);
    for (const name of cacheFiles) {
      if (!name.endsWith('.json')) continue;
      const id = name.slice(0, -5);
      if (live.size && !live.has(id)) ghosts.push(id);
    }
    return { missingObjects: missing, ghostSessions: ghosts, commits: commits.length, baseline: Object.keys(stateDoc.baseline).length };
  },
  'POST /repair': async () => {
    if (!vault) throw new Error('请先解锁同步库');
    if (job?.running) return { started: false, running: true, job: jobView() };
    startJob('repair', async () => {
      const eng = await buildEngine();
      const report = await eng.repair();
      // 清理已不存在的会话缓存，避免它们继续被当成同步内容
      const ghosts = [];
      if (config.selection.sessions && sessionInfo.size) {
        for (const name of await fs.readdir(cacheDir).catch(() => [])) {
          if (!name.endsWith('.json')) continue;
          const id = name.slice(0, -5);
          if (sessionInfo.has(id)) continue;
          await fs.rm(path.join(cacheDir, name), { force: true });
          ghosts.push(id);
        }
      }
      return { ...report, cleanedCache: ghosts };
    });
    return { started: true, job: jobView() };
  },
  'POST /extensions/pack': async () => {
    if (!vault) throw new Error('请先解锁同步库');
    if (job?.running) return { started: false, running: true, job: jobView() };
    startJob('pack', () => packExtensions());
    return { started: true, job: jobView() };
  },
  'POST /downloads/retry': async () => (hydrator ? hydrator.retryNow() : null),
  'GET /backups': async () => ({ rows: await listBackups({ backupDir }) }),
  'POST /restore-backup': async b => {
    if (!/^[\dTZ-]+$/.test(String(b.stamp || ''))) throw new Error('备份标识无效');
    if (!/^[\w.\-]+\.oc$/.test(String(b.file || ''))) throw new Error('备份文件名无效');
    if (!vault) throw new Error('请先解锁同步库');
    const backupRoot = path.join(backupDir, String(b.stamp));
    const file = await safePath(backupRoot, String(b.file));
    const data = open(vault.key, await fs.readFile(file), 'backup');
    const key = String(b.file).replace(/\.oc$/, '').replaceAll('_', '/');
    await backupFile(key);
    await writeRestoredFile(key, data, config.directories);
    return { ok: true, key };
  },
  'POST /join': async () => {
    if (job?.running) return { started: false, running: true, job: jobView() };
    startJob('join', () => doSync({ join: true }));
    return { started: true, job: jobView() };
  },
  'POST /sync': async b => {
    // 立刻返回，真正同步留在后台：宿主给 service 请求的硬上限就是 20 秒，
    // 网盘按需下载又可能是分钟级，同步等下去只会被宿主 abort 并连带杀掉服务。
    if (job?.running) return { started: false, running: true, job: jobView() };
    startJob('sync', () => doSync(b || {}));
    return { started: true, job: jobView() };
  },
  'POST /sessions/refresh': async () => {
    const cli = cliPath();
    if (!cli) throw new Error('未检测到 OpenCode CLI，无法导出会话');
    const { written } = await exportSessions({ openchamberDir: roots(config.directories).openchamber, cacheDir, cli, log: m => log(m) });
    return { exported: written.length };
  },
};

const server = http.createServer(async (req, res) => {
  try {
    if (token && req.headers.authorization !== `Bearer ${token}`) return send(res, 401, { error: '未授权' });
    const url = new URL(req.url, 'http://127.0.0.1');
    const handler = routes[`${req.method} ${url.pathname}`];
    if (!handler) return send(res, 404, { error: '未知接口' });
    const result = await handler(req.method === 'GET' ? {} : await body(req));
    send(res, 200, result);
  } catch (e) {
    send(res, 400, { error: e.message || '请求失败' });
  }
});

async function bootstrap() {
  await fs.mkdir(dataDir, { recursive: true });
  await loadConfig();
  await loadSecrets();
  if (secrets.vaultKey) {
    try {
      const v = makeVault(storageOf());
      const key = Buffer.from(secrets.vaultKey, 'base64');
      const meta = await v.meta();
      if (!meta) throw new Error('同步库不存在');
      if (open(key, Buffer.from(meta.check, 'base64'), 'check').toString() !== meta.id) throw new Error('本机保存的密钥与同步库不匹配');
      v.key = key;
      vault = v;
    } catch (e) { lastError = `自动解锁失败：${e.message}`; }
  }
  server.listen(port, '127.0.0.1', () => log(`服务已启动，端口 ${port}`));
}

async function fingerprint() {
  const r = roots(config.directories);
  const files = [
    'settings.json', 'preferences.json', 'extensions.json', 'sessions-directories.json',
    'plugin-switches.json.last-good', 'classification.json', 'routing.json',
  ].map(f => path.join(r.openchamber, f)).concat([
    path.join(r.opencode, 'opencode.json'), path.join(r.opencode, 'config.json'), path.join(r.opencode, 'cli.json'), path.join(r.opencode, 'auth.json'),
  ]);
  const parts = [];
  for (const file of files) {
    try { const s = await fs.stat(file); parts.push(`${file}:${s.mtimeMs}:${s.size}`); } catch { parts.push(`${file}:0`); }
  }
  for (const dir of [path.join(r.openchamber, 'extensions'), path.join(r.opencode, 'agents'), path.join(r.opencode, 'commands'), path.join(r.opencode, 'skills'), path.join(r.opencode, 'plugins'), cacheDir]) {
    try { const s = await fs.stat(dir); parts.push(`${dir}:${s.mtimeMs}`); } catch { /* 目录不存在 */ }
  }
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

// 定时对齐：本机有变化就尽快同步；否则每 60 秒无条件双向检查一次。
// 不需要实时，所以不做长轮询；这个频率只保证“坐下来用的时候是最新的”。
const PERIODIC_SYNC_MS = 60000;
setInterval(async () => {
  if (!config.auto.enabled || !vault || busy) return;
  try {
    const next = await fingerprint();
    const changed = Boolean(signature) && next !== signature;
    signature = next;
    const stateDoc = await readJSON(stateFile, null);
    const stale = Date.now() - (stateDoc?.lastSyncAt || 0) >= PERIODIC_SYNC_MS;
    if (!changed && !stale) return;
    const idleFor = Date.now() - (stateDoc?.lastSyncAt || 0);
    if (changed && idleFor < config.auto.idleMs) return;
    await doSync();
  } catch { /* 自动同步失败由状态展示，不中断循环 */ }
}, 15000).unref();

setTimeout(async () => {
  if (!config.auto.enabled || !vault) return;
  try { await doSync(); } catch { /* 启动同步失败保留错误 */ }
}, Math.max(5000, Number(config.auto.startupMs) || 30000)).unref();

process.on('unhandledRejection', e => log(`未处理异常：${e?.message || e}`));
bootstrap();
