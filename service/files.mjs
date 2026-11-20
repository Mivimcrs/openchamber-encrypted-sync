import * as fs from 'node:fs/promises';
import path from 'node:path';
import { randomId } from './crypto.mjs';
export async function readJSON(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT' && fallback !== undefined) return fallback; throw e; }
}
export async function atomicWrite(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomId()}.tmp`;
  try { await fs.writeFile(temp, value, { flag: 'wx', mode: 0o600 }); await fs.rename(temp, file); }
  finally { await fs.rm(temp, { force: true }); }
}
export const writeJSON = (file, data) => atomicWrite(file, JSON.stringify(data, null, 2));
export function safeKey(key) {
  // 同步键允许 Unicode（中文文件名等），但仍拒绝空段、`.`/`..`、反斜杠、绝对路径与盘符
  if (typeof key !== 'string' || key.length === 0 || key.length > 512) throw new Error('非法存储路径：长度无效');
  if (key.includes('\0') || key.includes('\\') || key.includes(':')) throw new Error('非法存储路径：包含保留字符');
  if (key.startsWith('/') || /^[a-zA-Z]:/.test(key)) throw new Error('非法存储路径：不能是绝对路径');
  if (key.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('非法存储路径：包含无效路径段');
  return key;
}
export async function safePath(root, relative) {
  if (typeof relative !== 'string' || relative.includes('\\') || relative.includes(':') || relative.includes('\0') || relative.split('/').some(p => !p || p === '.' || p === '..') || path.isAbsolute(relative)) throw new Error('拒绝越界文件路径');
  const target = path.resolve(root, relative);
  const rel = path.relative(path.resolve(root), target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('拒绝越界文件路径');
  let current = path.resolve(root);
  for (const part of ['', ...relative.split('/')]) {
    if (part) current = path.join(current, part);
    try { if ((await fs.lstat(current)).isSymbolicLink()) throw new Error('拒绝符号链接或目录联接'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  return target;
}
