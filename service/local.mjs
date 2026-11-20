import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { keyHash } from './crypto.mjs';
import { safePath, atomicWrite } from './files.mjs';

export const EXCLUDED = new Set(['node_modules', '.git', '.cache', 'cache', 'logs', 'log', '__pycache__']);
export const isExcluded = rel => rel.split('/').some(part => EXCLUDED.has(part));

// Python 产物不参与同步：skills 目录常是 junction，写入会被拒
export const isIgnoredFile = rel => /\.pyc$/i.test(rel) || rel.split('/').includes('__pycache__');

export function roots(overrides = {}) {
  const home = os.homedir();
  return {
    openchamber: overrides.openchamber || path.join(home, '.config', 'openchamber'),
    opencode: overrides.opencode || path.join(home, '.config', 'opencode'),
    opencodeData: overrides.opencodeData || path.join(home, '.local', 'share', 'opencode'),
  };
}

const SETTINGS_FILES = [
  ['settings.json', 'openchamber/settings.json'],
  ['preferences.json', 'openchamber/preferences.json'],
  ['classification.json', 'openchamber/classification.json'],
  ['routing.json', 'openchamber/routing.json'],
  ['plugin-switches.json.last-good', 'openchamber/plugin-switches.json.last-good'],
];

async function walkFiles(root, rel = '', out = []) {
  let entries;
  try { entries = await fs.readdir(path.join(root, rel), { withFileTypes: true }); }
  catch (e) { if (e.code === 'ENOENT') return out; throw e; }
  for (const entry of entries) {
    if (isExcluded(entry.name) || entry.name.endsWith('.tmp')) continue;
    const next = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) await walkFiles(root, next, out);
    else if (entry.isFile()) out.push(next);
  }
  return out;
}

export async function collectFileKeys({ selection, directories, dataDir }) {
  const r = roots(directories);
  const keys = [];
  const add = async (root, rel, key, max = 8 * 1024 * 1024) => {
    try {
      const file = await safePath(root, rel);
      const stat = await fs.stat(file);
      if (!stat.isFile() || stat.size > max) return;
      keys.push({ key, file, size: stat.size, updatedAt: stat.mtimeMs });
    } catch { /* 缺失文件不参与同步 */ }
  };
  if (selection.settings) {
    for (const [rel, key] of SETTINGS_FILES) await add(r.openchamber, rel, key);
    for (const rel of ['opencode.json', 'opencode.jsonc', 'config.json', 'AGENTS.md', 'cli.json']) {
      await add(r.opencode, rel, `opencode/${rel}`);
    }
    for (const dir of ['agents', 'commands', 'skills', 'plugins']) {
      for (const rel of await walkFiles(r.opencode, dir)) await add(r.opencode, rel, `opencode/${rel}`, 4 * 1024 * 1024);
    }
  }
  if (selection.extensions) {
    const base = path.join(r.openchamber, 'extensions');
    for (const id of await fs.readdir(base).catch(() => [])) {
      for (const rel of await walkFiles(base, id)) await add(base, rel, `extensions/${rel}`, 8 * 1024 * 1024);
    }
  }
  if (selection.providers) {
    await add(r.opencode, 'auth.json', 'secrets/opencode-auth.json');
    await add(r.opencode, 'opencode.json', 'opencode/opencode.json');
  }
  if (selection.sessions) {
    const cache = path.join(dataDir, 'cache', 'sessions');
    for (const rel of await walkFiles(cache)) {
      const file = path.join(cache, rel);
      const stat = await fs.stat(file);
      keys.push({ key: `sessions/${rel}`, file, size: stat.size, updatedAt: stat.mtimeMs });
    }
  }
  const seen = new Set();
  return keys.filter(k => !seen.has(k.key) && seen.add(k.key));
}

export function fileAdapter({ key, file, directories }) {
  const r = roots(directories);
  const target = (() => {
    if (key.startsWith('openchamber/')) return path.join(r.openchamber, key.slice('openchamber/'.length));
    if (key.startsWith('opencode/')) return path.join(r.opencode, key.slice('opencode/'.length));
    if (key.startsWith('extensions/')) return path.join(r.openchamber, 'extensions', key.slice('extensions/'.length));
    if (key === 'secrets/opencode-auth.json') return path.join(r.opencode, 'auth.json');
    return null;
  })();
  return { file, target };
}

export async function readLocalMap({ selection, directories, dataDir, deviceId, key }) {
  const records = {};
  const state = await fs.readFile(path.join(dataDir, 'baseline.json'), 'utf8').then(JSON.parse).catch(() => ({ baseline: {} }));
  const entries = await collectFileKeys({ selection, directories, dataDir });
  for (const entry of entries) {
    const data = await fs.readFile(entry.file);
    records[entry.key] = { hash: keyHash(key, data), updatedAt: entry.updatedAt, deviceId, deleted: false };
  }
  return records;
}

export async function writeRestoredFile(key, data, directories) {
  const r = roots(directories);
  const map = [
    ['openchamber/', r.openchamber],
    ['opencode/', r.opencode],
    ['extensions/', path.join(r.openchamber, 'extensions')],
  ];
  if (key === 'secrets/opencode-auth.json') return atomicWrite(path.join(r.opencode, 'auth.json'), data);
  for (const [prefix, root] of map) {
    if (key.startsWith(prefix)) {
      const rel = key.slice(prefix.length);
      const target = await safePath(root, rel);
      await atomicWrite(target, data);
      return target;
    }
  }
  throw new Error(`未知的恢复目标：${key}`);
}

export async function deleteRestoredFile(key, directories) {
  const r = roots(directories);
  const target = key === 'secrets/opencode-auth.json' ? path.join(r.opencode, 'auth.json')
    : key.startsWith('openchamber/') ? path.join(r.openchamber, key.slice('openchamber/'.length))
    : key.startsWith('opencode/') ? path.join(r.opencode, key.slice('opencode/'.length))
    : key.startsWith('extensions/') ? path.join(r.openchamber, 'extensions', key.slice('extensions/'.length)) : null;
  if (!target) throw new Error(`未知的删除目标：${key}`);
  await fs.rm(target, { force: true });
}
