import * as fs from 'node:fs/promises';
import path from 'node:path';
import { atomicWrite } from './files.mjs';

export const MAX_SNIPPET = 4000;

export async function safePreview(key, data) {
  if (key.startsWith('secrets/')) return { redacted: true, text: '凭据内容已加密，预览不显示。' };
  if (key.startsWith('sessions/')) {
    try {
      const doc = JSON.parse(data.toString());
      const title = String(doc?.info?.title || '');
      const first = (doc?.messages || []).find(m => m?.text && !String(m.text).startsWith('<system-reminder>'));
      const text = first ? String(first.text).replace(/\s+/g, ' ').slice(0, 600) : '';
      return { redacted: false, title, text, messages: (doc?.messages || []).length };
    } catch { return { redacted: false, text: '会话数据无法预览' }; }
  }
  return { redacted: false, text: data.toString('utf8', 0, MAX_SNIPPET), truncated: data.length > MAX_SNIPPET };
}

export async function writeBackup({ backupDir, key, data }) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const name = key.replaceAll('/', '_');
  await atomicWrite(path.join(backupDir, stamp, `${name}.bak`), data);
  return path.join(backupDir, stamp, `${name}.bak`);
}

export async function readBackup({ backupDir, key, stamp }) {
  if (!/^[\dTZ-]+$/.test(stamp)) throw new Error('备份标识无效');
  const file = path.join(backupDir, stamp, `${key.replaceAll('/', '_')}.bak`);
  return fs.readFile(file);
}

export async function listBackups({ backupDir }) {
  const dirs = await fs.readdir(backupDir).catch(() => []);
  const rows = [];
  for (const stamp of dirs.sort().reverse().slice(0, 20)) {
    const files = await fs.readdir(path.join(backupDir, stamp)).catch(() => []);
    rows.push({ stamp, count: files.length, files: files.slice(0, 8) });
  }
  return rows;
}
