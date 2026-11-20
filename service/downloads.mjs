import * as fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { open, keyHash } from './crypto.mjs';
import { readJSON, writeJSON } from './files.mjs';

// 网盘按需下载：读占位对象会触发云端下发，速度可能是 1 MB/s 甚至更慢，
// 也可能中途停住。这里负责「催下载 → 盯着字节数 → 校验哈希 → 才算到位」，
// 状态跨轮、跨进程保留，不在一次请求里死等。
const STALL_MS = 30_000;
const CAP_MS = 90_000;
const RETRY_DELAYS = [5_000, 15_000, 45_000];
const MAX_ATTEMPTS = 4;
const CACHE_LIMIT = 128 * 1024 * 1024;
const PERSIST_MS = 3_000;
const KEEP_READY_MS = 7 * 24 * 60 * 60 * 1000;
const TIMEOUT = Symbol('timeout');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const fail = (message, code) => Object.assign(new Error(message), { code });

export class Hydrator {
  constructor({ store, getVault, fileOf, stateFile, log = async () => {}, concurrency = 2 }) {
    Object.assign(this, { store, getVault, fileOf, stateFile, log, concurrency });
    this.items = {};
    this.inflight = new Map();
    this.cache = new Map();
    this.cacheBytes = 0;
    this.active = 0;
    this.waiters = [];
    this.persistTimer = null;
    this.loaded = false;
  }

  async load() {
    if (this.loaded) return;
    this.loaded = true;
    const doc = await readJSON(this.stateFile, null).catch(() => null);
    if (doc?.version === 1 && doc.items && typeof doc.items === 'object') this.items = doc.items;
    const now = Date.now();
    for (const [hash, rec] of Object.entries(this.items)) {
      const idle = now - Number(rec?.lastProgressAt || 0);
      if (rec?.state === 'ready' && idle > KEEP_READY_MS) delete this.items[hash];
      else if (rec?.state === 'downloading') rec.state = 'stalled';
      // 「远端根本没有这个对象」的记录只留一天，避免台账被历史噪声撑大
      else if (rec?.state === 'missing' && idle > 24 * 60 * 60 * 1000) delete this.items[hash];
    }
  }

  record(hash) {
    let rec = this.items[hash];
    if (!rec) {
      rec = { key: '', state: 'queued', size: 0, bytes: 0, attempts: 0, firstSeenAt: Date.now(), lastProgressAt: Date.now(), error: '' };
      this.items[hash] = rec;
    }
    return rec;
  }

  touch(rec) {
    rec.lastProgressAt = Date.now();
    if (!this.persistTimer) {
      this.persistTimer = setTimeout(() => { this.persistTimer = null; void this.persist(); }, PERSIST_MS);
      this.persistTimer.unref?.();
    }
  }

  async persist() {
    try { await writeJSON(this.stateFile, { version: 1, items: this.items }); } catch { /* 状态写不进去不影响同步 */ }
  }

  async sizeOf(hash) {
    const file = this.fileOf?.(hash);
    if (!file) return this.items[hash]?.size || null;
    const stat = await fs.stat(file).catch(() => null);
    if (!stat) return null;
    const rec = this.record(hash);
    rec.size = stat.size;
    return stat.size;
  }

  reasonOf(hash) { return this.items[hash]?.state || 'unknown'; }

  summary() {
    const rows = Object.entries(this.items);
    const count = state => rows.filter(([, rec]) => rec?.state === state).length;
    const pending = count('downloading') + count('stalled') + count('missing') + count('queued');
    return {
      pending,
      downloading: count('downloading'),
      stalled: count('stalled'),
      missing: count('missing'),
      corrupt: count('corrupt'),
      ready: count('ready'),
      items: rows
        .filter(([, rec]) => rec && rec.state !== 'ready')
        .slice(0, 8)
        .map(([hash, rec]) => ({ hash: hash.slice(0, 12), key: rec.key, state: rec.state, size: rec.size, bytes: rec.bytes, waitedMs: Date.now() - Number(rec.firstSeenAt || Date.now()) })),
    };
  }

  // 面板上的「催一次」：把卡住/坏件标记复位，下一轮立刻重试
  retryNow() {
    for (const rec of Object.values(this.items)) {
      if (rec?.state === 'stalled' || rec?.state === 'corrupt' || rec?.state === 'missing') {
        rec.state = 'queued';
        rec.attempts = 0;
        rec.error = '';
        rec.firstSeenAt = Date.now();
      }
    }
    void this.persist();
    return this.summary();
  }

  remember(hash, data) {
    this.cache.set(hash, data);
    this.cacheBytes += data.length;
    while (this.cacheBytes > CACHE_LIMIT && this.cache.size > 1) {
      const oldest = this.cache.keys().next().value;
      const old = this.cache.get(oldest);
      this.cache.delete(oldest);
      this.cacheBytes -= old?.length || 0;
    }
  }

  async acquire() {
    if (this.active < this.concurrency) { this.active += 1; return; }
    await new Promise(resolve => this.waiters.push(resolve));
    this.active += 1;
  }

  release() {
    this.active = Math.max(0, this.active - 1);
    const next = this.waiters.shift();
    if (next) next();
  }

  async ensure(hash, { key = '', capMs = CAP_MS } = {}) {
    await this.load();
    if (this.cache.has(hash)) return this.cache.get(hash);
    const rec = this.record(hash);
    if (key) rec.key = key;
    if (rec.state === 'corrupt') return null;

    let task = this.inflight.get(hash);
    if (!task) {
      task = this.fetch(hash).catch(error => {
        const current = this.record(hash);
        current.error = error?.message || String(error);
        return null;
      }).finally(() => { this.inflight.delete(hash); });
      this.inflight.set(hash, task);
    }

    let timer;
    const timed = new Promise(resolve => { timer = setTimeout(() => resolve(TIMEOUT), Math.max(1000, capMs)); });
    const result = await Promise.race([task, timed]);
    clearTimeout(timer);
    if (result === TIMEOUT) { this.touch(this.record(hash)); return null; }
    return result || null;
  }

  async fetch(hash) {
    const vault = this.getVault();
    if (!vault?.key) throw fail('同步库尚未解锁', 'LOCKED');
    const rec = this.record(hash);
    let last = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      rec.attempts = attempt;
      rec.state = 'downloading';
      try {
        const raw = await this.readRaw(hash, rec);
        if (!raw) { rec.state = 'missing'; rec.error = '对象尚未同步到本机'; this.touch(rec); return null; }
        const data = open(vault.key, raw, `object:${hash}`);
        if (keyHash(vault.key, data) !== hash) throw fail('对象内容校验失败，可能还没下载完整', 'OBJECT_CORRUPT');
        rec.state = 'ready';
        rec.bytes = raw.length;
        rec.size = raw.length;
        rec.error = '';
        this.remember(hash, data);
        this.touch(rec);
        return data;
      } catch (error) {
        last = error;
        const code = error?.code || '';
        rec.error = error?.message || String(error);
        if (code === 'ENOENT') { rec.state = 'missing'; this.touch(rec); return null; }
        if (attempt >= MAX_ATTEMPTS) break;
        rec.state = code === 'OBJECT_STALLED' || code === 'OBJECT_PARTIAL' ? 'stalled' : 'downloading';
        this.touch(rec);
        await sleep(RETRY_DELAYS[Math.min(attempt - 1, RETRY_DELAYS.length - 1)]);
      }
    }

    rec.state = last?.code === 'OBJECT_CORRUPT' ? 'corrupt' : 'stalled';
    rec.error = last?.message || '下载未完成';
    this.touch(rec);
    if (rec.state === 'corrupt') await this.log(`对象疑似坏件，已跳过：${rec.key || hash.slice(0, 12)}（连续 ${MAX_ATTEMPTS} 次校验失败）`);
    return null;
  }

  async readRaw(hash, rec) {
    const file = this.fileOf?.(hash);
    if (!file) {
      const raw = await this.store.get(`objects/${hash.slice(0, 2)}/${hash}`);
      if (!raw) { const error = new Error('对象尚未同步到本机'); error.code = 'ENOENT'; throw error; }
      rec.bytes = raw.length;
      return raw;
    }
    const stat = await fs.stat(file).catch(error => {
      if (error?.code === 'ENOENT') return null;
      throw error;
    });
    if (!stat) { const error = new Error('对象尚未同步到本机'); error.code = 'ENOENT'; throw error; }
    rec.size = stat.size;
    if (!rec.firstSeenAt) rec.firstSeenAt = Date.now();
    return this.readStreamed(file, stat.size, rec);
  }

  async readStreamed(file, expected, rec) {
    await this.acquire();
    try {
      return await new Promise((resolve, reject) => {
        const chunks = [];
        let bytes = 0;
        let timer = null;
        const stream = createReadStream(file, { highWaterMark: 1024 * 1024 });
        const arm = () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            stream.destroy(fail(`网盘下载停顿（已 ${Math.round(STALL_MS / 1000)} 秒没有新数据）`, 'OBJECT_STALLED'));
          }, STALL_MS);
          timer.unref?.();
        };
        stream.on('data', chunk => {
          bytes += chunk.length;
          chunks.push(chunk);
          rec.bytes = bytes;
          arm();
          this.touch(rec);
        });
        stream.once('error', error => {
          if (timer) clearTimeout(timer);
          reject(error);
        });
        stream.once('end', () => {
          if (timer) clearTimeout(timer);
          if (expected && bytes !== expected) {
            reject(fail(`对象未下载完整（${bytes}/${expected} 字节）`, 'OBJECT_PARTIAL'));
            return;
          }
          resolve(Buffer.concat(chunks, bytes));
        });
        arm();
      });
    } finally {
      this.release();
    }
  }
}
