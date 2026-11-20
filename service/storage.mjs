import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, createHmac } from 'node:crypto';
import { safeKey, safePath, atomicWrite } from './files.mjs';
const hash = b => createHash('sha256').update(b).digest('hex');
const hmac = (k, s) => createHmac('sha256', k).update(s).digest();
export class FolderStore {
  constructor(root) { this.root = path.resolve(root); }
  async get(key) { try { return await fs.readFile(await safePath(this.root, safeKey(key))); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } }
  // 只确认文件在不在，不读内容：百度网盘的占位对象一读就会触发整包下载
  async exists(key) {
    try { await fs.stat(await safePath(this.root, safeKey(key))); return true; }
    catch (e) { if (e.code === 'ENOENT') return false; throw e; }
  }
  async put(key, data) { await atomicWrite(await safePath(this.root, safeKey(key)), data); }
  async list(prefix) {
    safeKey(prefix); const result = [];
    const walk = async (dir, rel) => {
      let entries; try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch (e) { if (e.code === 'ENOENT') return; throw e; }
      for (const entry of entries) { if (entry.isSymbolicLink()) throw new Error('同步目录中不允许符号链接'); const name = `${rel}/${entry.name}`; if (entry.isDirectory()) await walk(path.join(dir, entry.name), name); else if (!name.endsWith('.tmp')) result.push(name); }
    };
    await walk(await safePath(this.root, prefix), prefix); return result.sort();
  }
}
async function request(url, options = {}) {
  const response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(45000) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`存储请求失败 HTTP ${response.status}`);
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length > 64 * 1024 * 1024) throw new Error('远端对象超过 64 MiB');
  return { body, headers: response.headers };
}
export class WebDAVStore {
  constructor(c) { this.base = new URL(c.url.endsWith('/') ? c.url : `${c.url}/`); if (this.base.protocol !== 'https:') throw new Error('WebDAV 必须使用 HTTPS'); this.headers = { Authorization: `Basic ${Buffer.from(`${c.username}:${c.password}`).toString('base64')}` }; }
  url(key) { return new URL(safeKey(key).split('/').map(encodeURIComponent).join('/'), this.base); }
  async get(key) { return (await request(this.url(key), { headers: this.headers }))?.body ?? null; }
  async put(key, data) {
    const parts = safeKey(key).split('/');
    for (let i = 1; i < parts.length; i++) { const r = await fetch(this.url(parts.slice(0, i).join('/')), { method: 'MKCOL', headers: this.headers, redirect: 'error', signal: AbortSignal.timeout(45000) }); if (![201, 405].includes(r.status)) throw new Error(`WebDAV 创建目录失败 HTTP ${r.status}`); }
    await request(this.url(key), { method: 'PUT', headers: this.headers, body: data });
  }
  async list(prefix) {
    const output = [];
    const walk = async key => {
      const r = await request(this.url(key), { method: 'PROPFIND', headers: { ...this.headers, Depth: '1', 'Content-Type': 'application/xml' }, body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>' });
      if (!r) return;
      for (const block of r.body.toString().matchAll(/<(?:\w+:)?response\b[^>]*>([\s\S]*?)<\/(?:\w+:)?response>/g)) {
        const href = block[1].match(/<(?:\w+:)?href[^>]*>([\s\S]*?)<\/(?:\w+:)?href>/)?.[1]; if (!href) throw new Error('WebDAV 响应缺少 href');
        const u = new URL(href.replaceAll('&amp;', '&'), this.base); if (u.origin !== this.base.origin || !u.pathname.startsWith(this.base.pathname)) throw new Error('WebDAV 返回越界路径');
        const rel = decodeURIComponent(u.pathname.slice(this.base.pathname.length)).replace(/\/$/, ''); if (rel === key || !rel.startsWith(`${key}/`)) continue;
        safeKey(rel); if (/<(?:\w+:)?collection\b/.test(block[1])) await walk(rel); else output.push(rel);
      }
    }; await walk(safeKey(prefix)); return [...new Set(output)].sort();
  }
}
export class GitHubStore {
  constructor(c) { if (!/^[\w.-]+\/[\w.-]+$/.test(c.repository)) throw new Error('仓库格式须为 owner/repo'); this.repo = c.repository; this.branch = c.branch || 'main'; this.headers = { Authorization: `Bearer ${c.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }; }
  async verify() { const r = await request(`https://api.github.com/repos/${this.repo}`, { headers: this.headers }); if (!r || !JSON.parse(r.body).private) throw new Error('GitHub 同步必须使用可访问的私有仓库'); }
  url(key) { return `https://api.github.com/repos/${this.repo}/contents/${safeKey(key).split('/').map(encodeURIComponent).join('/')}`; }
  async get(key) { await this.verify(); const r = await request(`${this.url(key)}?ref=${encodeURIComponent(this.branch)}`, { headers: this.headers }); if (!r) return null; const d = JSON.parse(r.body); if (d.encoding !== 'base64') throw new Error('GitHub 对象太大或格式无效'); return Buffer.from(d.content, 'base64'); }
  async put(key, data) { await this.verify(); if (data.length > 700000) throw new Error('GitHub 单对象超过 700 KB，请改用 S3 或文件夹'); const old = await request(`${this.url(key)}?ref=${encodeURIComponent(this.branch)}`, { headers: this.headers }); await request(this.url(key), { method: 'PUT', headers: { ...this.headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Encrypted sync object', branch: this.branch, content: data.toString('base64'), ...(old ? { sha: JSON.parse(old.body).sha } : {}) }) }); }
  async list(prefix) { await this.verify(); const result = []; const walk = async key => { const r = await request(`${this.url(key)}?ref=${encodeURIComponent(this.branch)}`, { headers: this.headers }); if (!r) return; const rows = JSON.parse(r.body); if (!Array.isArray(rows) || rows.length >= 1000) throw new Error('GitHub 目录过大，请迁移存储'); for (const row of rows) { safeKey(row.path); if (!row.path.startsWith(`${key}/`)) throw new Error('仓库返回越界路径'); if (row.type === 'dir') await walk(row.path); else if (row.type === 'file') result.push(row.path); } }; await walk(safeKey(prefix)); return result.sort(); }
}
export class S3Store {
  constructor(c) { this.c = c; this.base = new URL(c.endpoint); if (this.base.protocol !== 'https:' || !/^[a-zA-Z0-9.-]+$/.test(c.bucket)) throw new Error('S3 endpoint 必须 HTTPS 且 bucket 合法'); }
  async send(method, key = '', query = {}, body = Buffer.alloc(0)) {
    const c = this.c; const url = new URL(this.base); url.pathname = `${url.pathname.replace(/\/$/, '')}/${c.bucket}/${key ? safeKey(key).split('/').map(encodeURIComponent).join('/') : ''}`;
    const encode = s => encodeURIComponent(s).replace(/[!'()*]/g, x => `%${x.charCodeAt(0).toString(16).toUpperCase()}`);
    url.search = Object.entries(query).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${encode(k)}=${encode(v)}`).join('&');
    const date = new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''); const day = date.slice(0, 8); const region = c.region || 'us-east-1'; const digest = hash(body);
    const headers = { host: url.host, 'x-amz-content-sha256': digest, 'x-amz-date': date, ...(c.sessionToken ? { 'x-amz-security-token': c.sessionToken } : {}) };
    const names = Object.keys(headers).sort(); const signed = names.join(';'); const canonical = [method, url.pathname, url.search.slice(1), names.map(k => `${k}:${headers[k]}\n`).join(''), signed, digest].join('\n');
    const scope = `${day}/${region}/s3/aws4_request`; const signing = hmac(hmac(hmac(hmac(`AWS4${c.secretKey}`, day), region), 's3'), 'aws4_request');
    headers.Authorization = `AWS4-HMAC-SHA256 Credential=${c.accessKey}/${scope}, SignedHeaders=${signed}, Signature=${hmac(signing, `AWS4-HMAC-SHA256\n${date}\n${scope}\n${hash(canonical)}`).toString('hex')}`;
    return request(url, { method, headers, ...(method === 'PUT' ? { body } : {}) });
  }
  async get(key) { return (await this.send('GET', key))?.body ?? null; }
  async put(key, data) { await this.send('PUT', key, {}, data); }
  async list(prefix) { const keys = []; let token; do { const r = await this.send('GET', '', { 'list-type': '2', prefix: safeKey(prefix) + '/', 'encoding-type': 'url', ...(token ? { 'continuation-token': token } : {}) }); if (!r) throw new Error('S3 bucket 不存在'); const xml = r.body.toString(); for (const m of xml.matchAll(/<Key>([\s\S]*?)<\/Key>/g)) keys.push(safeKey(decodeURIComponent(m[1]))); token = xml.match(/<NextContinuationToken>(.*?)<\/NextContinuationToken>/)?.[1]?.replaceAll('&amp;', '&'); if (token) token = decodeURIComponent(token); if (/<IsTruncated>true<\/IsTruncated>/.test(xml) && !token) throw new Error('S3 分页响应无效'); } while (token); return keys.sort(); }
}
export function createStore(c) { if (c.type === 'folder') return new FolderStore(c.folder); if (c.type === 'webdav') return new WebDAVStore(c); if (c.type === 'github') return new GitHubStore(c); if (c.type === 's3') return new S3Store(c); throw new Error('请选择支持的存储'); }
