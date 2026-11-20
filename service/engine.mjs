import { seal, open, keyHash, randomId } from './crypto.mjs';
import { safeKey } from './files.mjs';

const same = (a, b) => (a?.hash || null) === (b?.hash || null) && Boolean(a?.deleted) === Boolean(b?.deleted);
// 记录新旧：先比 updatedAt（数值，可能带小数），再比设备标识避免并列时抖动
const newer = (a, b) => {
  if (!b) return true;
  const at = Number(a?.updatedAt || 0), bt = Number(b?.updatedAt || 0);
  if (at !== bt) return at > bt;
  return String(a?.deviceId || '') >= String(b?.deviceId || '');
};
// 远端记录超过这么久还拉不到对象，就视为永久缺失（网盘丢件/坏台账），冲突不再无限 deferred。
const STALE_REMOTE_MS = 60 * 60 * 1000;

export function planSync({ baseline = {}, local = {}, remote = {}, autoDelete = false }) {
  const keys = [...new Set([...Object.keys(baseline), ...Object.keys(local), ...Object.keys(remote)])].sort();
  const push = [], apply = [], conflicts = [], deletions = [], cleanup = [];
  for (const key of keys) {
    safeKey(key);
    const base = baseline[key] || null, mine = local[key] || null, theirs = remote[key] || null;
    const localChanged = !same(mine, base), remoteChanged = !same(theirs, base);
    if (!localChanged && !remoteChanged) continue;

    // 删除类记录单独处理，避免“删除 vs 修改”被误判为并发冲突
    if (mine?.deleted && theirs?.deleted) { cleanup.push(key); continue; }
    // 云端有删除记录，但本机与台账都没有这个键：陈旧墓碑，直接丢弃
    if (theirs?.deleted && !mine && !base) { cleanup.push(key); continue; }
    if (mine?.deleted) {
      if (!theirs) { deletions.push({ key, action: 'confirm-local', record: mine }); continue; }
      // 云端仍有（且可能更新）：以云端为准，不因本机一次扫描失败就抹掉内容
      if (!same(theirs, base)) { apply.push({ key, record: theirs, reason: 'remote-wins-over-delete' }); continue; }
      deletions.push({ key, action: 'confirm-local', record: mine });
      continue;
    }
    if (theirs?.deleted) {
      // 本机改过、云端删了：保留本机内容并重新上传
      if (localChanged) { push.push({ key, record: mine, reason: 'local-wins-over-delete' }); continue; }
      deletions.push({ key, action: autoDelete ? 'apply-delete' : 'hold', record: theirs });
      continue;
    }

    if (localChanged && remoteChanged) {
      if (same(mine, theirs)) continue;
      if (same(mine, base)) { apply.push({ key, record: theirs }); continue; }
      if (same(theirs, base)) { push.push({ key, record: mine }); continue; }
      const winner = compare(mine, theirs) > 0 ? mine : theirs;
      conflicts.push({ key, local: mine, remote: theirs, baseline: base, newer: winner === mine ? 'local' : 'remote', diverged: true });
      continue;
    }
    if (remoteChanged) { apply.push({ key, record: theirs }); continue; }
    push.push({ key, record: mine });
  }
  return { push, apply, conflicts, deletions, cleanup };
}

function compare(a, b) {
  const at = Number(a?.updatedAt || 0), bt = Number(b?.updatedAt || 0);
  if (at !== bt) return at - bt;
  return String(a?.deviceId || '').localeCompare(String(b?.deviceId || ''));
}

export function resolveConflict(conflict, choice, deviceId) {
  if (choice !== 'local' && choice !== 'remote') throw new Error('冲突选择无效');
  const record = choice === 'local' ? conflict.local : conflict.remote;
  if (!record) throw new Error('冲突记录已不存在');
  return { key: conflict.key, record: { ...record, updatedAt: Date.now(), deviceId } };
}

export function mergeRemote(commits, headIds) {
  const byId = new Map(commits.map(c => [c.id, c]));
  const seen = new Set(), order = [], missing = [];
  const visit = id => {
    if (seen.has(id)) return;
    seen.add(id);
    const c = byId.get(id);
    // 父提交还没落到本地（网盘/文件夹后端常见的新旧文件乱序到达）：
    // 当作边界停下，不阻塞其余可用记录；缺失的提交等它到达后自然并入。
    if (!c) { missing.push(id); return; }
    for (const p of c.parents || []) visit(p);
    order.push(c);
  };
  for (const id of headIds) visit(id);
  const records = {};
  for (const c of order) for (const [key, rec] of Object.entries(c.records || {})) {
    safeKey(key);
    if (newer(rec, records[key])) records[key] = rec;
  }
  return { records, order, missing: [...new Set(missing)] };
}

export class Vault {
  constructor({ store, key, deviceId, stateFile, readJSON, writeJSON, newVault, unlockVault }) {
    Object.assign(this, { store, key, deviceId, stateFile, readJSON, writeJSON, newVault, unlockVault });
  }
  objectKey(hash) { return `objects/${hash.slice(0, 2)}/${hash}`; }
  commitKey(id) { return `commits/${id}.oc`; }
  async state() {
    const s = await this.readJSON(this.stateFile, null);
    return s?.version === 1 ? s : { version: 1, baseline: {}, pendingDeletions: [], lastSyncAt: 0, remoteUpdatedAt: 0 };
  }
  async saveState(s) { await this.writeJSON(this.stateFile, { ...s, version: 1 }); }
  async putObject(payload) {
    const data = Buffer.isBuffer(payload) ? payload : Buffer.from(JSON.stringify(payload));
    const h = keyHash(this.key, data);
    await this.store.put(this.objectKey(h), seal(this.key, data, `object:${h}`, { compress: true }));
    return { hash: h, size: data.length };
  }
  async getObject(hash) {
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('对象标识无效');
    const raw = await this.store.get(this.objectKey(hash));
    if (!raw) {
      const e = new Error('同步对象缺失，请稍后重试');
      e.code = 'OBJECT_MISSING';
      throw e;
    }
    const data = open(this.key, raw, `object:${hash}`);
    if (keyHash(this.key, data) !== hash) throw new Error('同步对象校验失败');
    return data;
  }
  async meta() {
    const raw = await this.store.get('vault.json');
    if (!raw) return null;
    let m;
    try { m = JSON.parse(raw.toString()); } catch { throw new Error('同步库元数据损坏'); }
    if (m?.version !== 1 || typeof m.id !== 'string') throw new Error('同步库元数据无效');
    return m;
  }
  async create(password) {
    if (await this.meta()) throw new Error('同步库已存在，请直接解锁');
    const { key, meta } = await this.newVault(password);
    this.key = key;
    await this.store.put('vault.json', Buffer.from(JSON.stringify(meta)));
    return meta;
  }
  async unlock(password) {
    const m = await this.meta();
    if (!m) throw new Error('存储中还没有同步库');
    this.key = await this.unlockVault(m, password);
    return m;
  }
  async loadCommits() {
    const keys = (await this.store.list('commits')).filter(k => k.endsWith('.oc'));
    const commits = [];
    for (const k of keys) {
      const raw = await this.store.get(k);
      if (!raw) continue;
      const id = k.slice(8, -3);
      let c;
      try { c = JSON.parse(open(this.key, raw, `commit:${id}`).toString()); } catch { continue; }
      if (c?.version !== 1 || c.id !== id || !/^[a-f0-9]{40}$/.test(c.id)) continue;
      commits.push(c);
    }
    const heads = commits.map(c => c.id).filter(id => !commits.some(c => (c.parents || []).includes(id)));
    return { commits, heads };
  }
  async commit(records, parents) {
    const id = randomId();
    const c = { version: 1, id, deviceId: this.deviceId, createdAt: Date.now(), parents, records };
    await this.store.put(this.commitKey(id), seal(this.key, Buffer.from(JSON.stringify(c)), `commit:${id}`, { compress: true }));
    return c;
  }
}

export class SyncEngine {
  constructor({ vault, readLocal, readLocalData, writeLocal, deleteLocal, archiveLocal, mergeSession, ignoreKey, hydrator, now = Date.now }) {
    Object.assign(this, { vault, readLocal, readLocalData, writeLocal, deleteLocal, archiveLocal, mergeSession, ignoreKey, hydrator, now });
  }
  async preview({ autoDelete = false } = {}) {
    const state = await this.vault.state();
    const keep = source => {
      if (!this.ignoreKey) return source;
      return Object.fromEntries(Object.entries(source || {}).filter(([key]) => !this.ignoreKey(key)));
    };
    const local = keep(await this.readLocal());
    const { commits, heads } = await this.vault.loadCommits();
    const merged = mergeRemote(commits, heads);
    const plan = planSync({ baseline: keep(state.baseline), local, remote: keep(merged.records), autoDelete });
    return { state, local, remote: merged.records, heads, commits, plan, missingCommits: merged.missing };
  }
  async run({ autoDelete = false, conflictChoices = {}, deletionChoices = {}, localDeletionChoices = {}, preferRemote = false, autoResolve = false, skipKeys = [], budget = {}, onProgress = null } = {}) {
    const { state, local, remote, heads, plan, missingCommits } = await this.preview({ autoDelete });
    if (skipKeys.length) {
      const skip = new Set(skipKeys);
      plan.apply = plan.apply.filter(item => !skip.has(item.key));
      plan.push = plan.push.filter(item => !skip.has(item.key));
      plan.conflicts = plan.conflicts.filter(item => !skip.has(item.key));
      plan.deletions = plan.deletions.filter(item => !skip.has(item.key));
      plan.cleanup = (plan.cleanup || []).filter(key => !skip.has(key));
    }
    if (preferRemote) for (const conflict of plan.conflicts) conflictChoices[conflict.key] = 'remote';
    const applied = [], pushed = [], deferred = [], deferredDetails = [], records = {}, resolved = {}, autoMerged = [], autoPicked = [], kept = [];

    // 单轮预算：网盘按需下载可能慢到分钟级，一轮只做一部分，剩余留给下一轮，
    // 基线只为真正落地的项推进，所以中断也不会丢进度。
    const deadline = Number(budget.deadline) || 0;
    const maxBytes = Number(budget.maxBytes) || 0;
    const maxObjects = Number(budget.maxObjects) || 0;
    const capMs = Number(budget.objectCapMs) || 90000;
    let pulledObjects = 0, pulledBytes = 0;
    const exhausted = () => (deadline > 0 && this.now() >= deadline)
      || (maxObjects > 0 && pulledObjects >= maxObjects)
      || (maxBytes > 0 && pulledBytes >= maxBytes);
    const defer = (key, reason) => {
      if (!deferred.includes(key)) deferred.push(key);
      deferredDetails.push({ key, reason: reason || 'unknown' });
    };
    const report = (phase, done, total) => { try { onProgress?.({ phase, done, total }); } catch { /* 进度上报失败不影响同步 */ } };

    // 小对象先落地：网盘慢的时候也能持续推进，13 MB 的会话排到最后
    if (this.hydrator?.sizeOf) {
      const sized = await Promise.all(plan.apply.map(async item => ({
        item,
        size: (await this.hydrator.sizeOf(item.record.hash).catch(() => null)) ?? Number.MAX_SAFE_INTEGER,
      })));
      sized.sort((a, b) => a.size - b.size);
      plan.apply = sized.map(entry => entry.item);
    }

    // 对象文件与提交文件一样可能乱序到达：拉不到就先挂起，基线不推进，下一轮继续；
    // 有 hydrator 时由它负责「催网盘下载 + 字节数 + 哈希」三重确认。
    const pull = async (key, record) => {
      if (this.hydrator) {
        const data = await this.hydrator.ensure(record.hash, { key, capMs });
        if (!data) { defer(key, this.hydrator.reasonOf(record.hash)); return null; }
        pulledObjects += 1;
        pulledBytes += data.length;
        return { data };
      }
      try { return { data: await this.vault.getObject(record.hash) }; }
      catch (e) { if (e.code === 'OBJECT_MISSING') { defer(key, 'missing'); return null; } throw e; }
    };
    const failed = [];
    const applyOne = async (item, data) => {
      await this.writeLocal(item.key, data, item.record);
      applied.push(item.key);
    };
    let queue = [];
    const applyTotal = plan.apply.length;
    let applyDone = 0;
    for (const item of plan.apply) {
      applyDone += 1;
      if (exhausted()) { defer(item.key, 'budget'); continue; }
      report('apply', applyDone, applyTotal);
      const pulled = await pull(item.key, item.record);
      if (!pulled) continue;
      try { await applyOne(item, pulled.data); }
      catch (e) {
        // 子会话比父会话先排到：挂起，等本轮父会话落地后再补
        if (e?.code === 'PARENT_MISSING') { queue.push({ ...item, data: pulled.data }); continue; }
        failed.push({ key: item.key, message: e?.message || String(e) });
      }
    }
    // 每轮都会让更多父会话落地；三轮仍未就绪的（父在别的设备/尚未上传）留给下次同步。
    for (let round = 0; round < 3 && queue.length; round++) {
      const next = [];
      for (const item of queue) {
        try { await applyOne(item, item.data); }
        catch (e) {
          if (e?.code === 'PARENT_MISSING' && round < 2) next.push(item);
          else failed.push({ key: item.key, message: e?.message || String(e) });
        }
      }
      queue = next;
    }
    for (const { key, action, record } of plan.deletions) {
      if (action === 'apply-delete') {
        if (this.archiveLocal && key.startsWith('sessions/')) { await this.archiveLocal(key, record); kept.push(key); }
        else { await this.deleteLocal(key); applied.push(key); }
        delete state.baseline[key];
      } else if (action === 'hold') {
        state.pendingDeletions = [...new Set([...(state.pendingDeletions || []), key])];
      } else if (action === 'confirm-local') {
        const choice = localDeletionChoices[key];
        if (choice === 'delete') {
          records[key] = { ...record, updatedAt: this.now() };
          pushed.push(key);
        } else if (choice === 'forget') {
          delete state.baseline[key];
        }
        // 未确认：保留记录，下次继续提示；不产生删除提交
      } else if (action === 'skip') {
        state.baseline[key] = record;
      }
    }
    for (const [key, choice] of Object.entries(deletionChoices)) {
      const rec = remote[key];
      if (!rec?.deleted) continue;
      if (choice === 'keep') {
        state.pendingDeletions = (state.pendingDeletions || []).filter(k => k !== key);
        const mine = local[key];
        if (mine) { await this.vault.putObject(await this.readLocalData(key)); records[key] = mine; pushed.push(key); }
        continue;
      }
      if (choice === 'archive' && this.archiveLocal) {
        await this.archiveLocal(key, rec);
        delete state.baseline[key];
        state.pendingDeletions = (state.pendingDeletions || []).filter(k => k !== key);
        kept.push(key);
        continue;
      }
      if (choice !== 'delete') continue;
      await this.deleteLocal(key);
      delete state.baseline[key];
      state.pendingDeletions = (state.pendingDeletions || []).filter(k => k !== key);
      applied.push(key);
    }
    for (const conflict of plan.conflicts) {
      const choice = conflictChoices[conflict.key];
      if (!choice && !autoResolve) continue;
      if (!choice && autoResolve && conflict.local && conflict.remote) {
        // 会话：消息级并集，两边都不丢
        if (conflict.key.startsWith('sessions/') && this.mergeSession) {
          if (exhausted()) { defer(conflict.key, 'budget'); continue; }
          const pulled = await pull(conflict.key, conflict.remote);
          if (!pulled) continue;
          try {
            const mine = await this.readLocalData(conflict.key);
            const merged = this.mergeSession(mine, pulled.data);
            const data = Buffer.from(JSON.stringify(merged.payload));
            const record = { hash: keyHash(this.vault.key, data), updatedAt: this.now(), deviceId: this.vault.deviceId, deleted: false };
            const stored = await this.vault.putObject(data);
            if (stored.hash !== record.hash) throw new Error('合并结果校验失败');
            await this.writeLocal(conflict.key, data, record);
            records[conflict.key] = record;
            resolved[conflict.key] = record;
            pushed.push(conflict.key);
            autoMerged.push({ key: conflict.key, added: merged.added, replaced: merged.replaced });
            continue;
          } catch { /* 合并失败则退回人工选择，不覆盖任何一侧 */ }
        }
        // 其他文件：较新的一方获胜，旧版已在写入前备份
        const remoteWins = compare(conflict.remote, conflict.local) > 0;
        if (remoteWins) {
          if (exhausted()) { defer(conflict.key, 'budget'); continue; }
          const pulled = await pull(conflict.key, conflict.remote);
          if (!pulled) {
            // 远端对象长期拉不到：改判本机胜出并重新上传，避免这一条永远挂在 deferred 上。
            if (this.now() - Number(conflict.remote.updatedAt || 0) > STALE_REMOTE_MS) {
              const stored = await this.vault.putObject(await this.readLocalData(conflict.key));
              const localRecord = { hash: stored.hash, updatedAt: this.now(), deviceId: this.vault.deviceId, deleted: false };
              const at = deferred.indexOf(conflict.key);
              if (at >= 0) deferred.splice(at, 1);
              records[conflict.key] = localRecord;
              resolved[conflict.key] = localRecord;
              pushed.push(conflict.key);
              autoPicked.push({ key: conflict.key, side: 'local', reason: 'remote-object-missing' });
            }
            continue;
          }
          await this.writeLocal(conflict.key, pulled.data, conflict.remote);
          state.baseline[conflict.key] = conflict.remote;
          applied.push(conflict.key);
          autoPicked.push({ key: conflict.key, side: 'remote' });
        } else {
          records[conflict.key] = conflict.local;
          resolved[conflict.key] = conflict.local;
          pushed.push(conflict.key);
          autoPicked.push({ key: conflict.key, side: 'local' });
        }
        continue;
      }
      if (!choice) continue;
      if (preferRemote && choice === 'remote') {
        if (exhausted()) { defer(conflict.key, 'budget'); continue; }
        const pulled = await pull(conflict.key, conflict.remote);
        if (!pulled) continue;
        await this.writeLocal(conflict.key, pulled.data, conflict.remote);
        state.baseline[conflict.key] = conflict.remote;
        applied.push(conflict.key);
        continue;
      }
      const answer = resolveConflict(conflict, choice, this.vault.deviceId);
      if (choice === 'remote') {
        if (exhausted()) { defer(conflict.key, 'budget'); continue; }
        const pulled = await pull(conflict.key, answer.record);
        if (!pulled) continue;
        await this.writeLocal(conflict.key, pulled.data, answer.record);
        applied.push(conflict.key);
      } else {
        // 采用本机时必须先把内容传上去，否则其他设备拉不到对象
        await this.vault.putObject(await this.readLocalData(conflict.key));
      }
      records[conflict.key] = answer.record;
      resolved[conflict.key] = answer.record;
      pushed.push(conflict.key);
    }
    for (const { key, record } of plan.push) {
      const stored = await this.vault.putObject(await this.readLocalData(key));
      if (stored.hash !== record.hash) throw new Error(`本地内容在同步期间发生变化：${key}`);
      records[key] = record;
      pushed.push(key);
    }
    const commit = Object.keys(records).length ? await this.vault.commit(records, heads) : null;
    const failedKeys = new Set(failed.map(f => f.key));
    for (const { key, record } of plan.apply) if (!deferred.includes(key) && !failedKeys.has(key)) state.baseline[key] = record;
    for (const { key, record } of plan.push) state.baseline[key] = record;
    for (const [key, record] of Object.entries(resolved)) state.baseline[key] = record;
    for (const key of plan.cleanup || []) delete state.baseline[key];
    if ((plan.cleanup || []).length) {
      const cleaned = new Set(plan.cleanup);
      state.pendingDeletions = (state.pendingDeletions || []).filter(key => !cleaned.has(key));
    }
    state.lastSyncAt = this.now();
    state.remoteUpdatedAt = Math.max(state.remoteUpdatedAt || 0, ...Object.values(remote).map(r => r.updatedAt || 0), 0);
    await this.vault.saveState(state);
    report('done', applyTotal, applyTotal);
    const more = deferredDetails.some(item => item.reason === 'budget');
    const waiting = deferredDetails.filter(item => ['downloading', 'stalled', 'queued', 'missing'].includes(item.reason));
    return {
      applied, pushed, deferred, deferredDetails, missingCommits, conflicts: plan.conflicts, deletions: plan.deletions,
      autoMerged, autoPicked, archived: kept, failed, commit,
      heads: commit ? [...heads, commit.id] : heads,
      more,
      pendingDownloads: waiting.map(item => ({ key: item.key, reason: item.reason })),
    };
  }

  // 自检修复：把台账里有、云端缺的对象用本机内容重新传一遍
  async repair() {
    const state = await this.vault.state();
    const local = await this.readLocal();
    const reuploaded = [], failed = [];
    for (const [key, record] of Object.entries(state.baseline)) {
      if (!record?.hash || record.deleted || this.ignoreKey?.(key)) continue;
      let present = null;
      try { present = await this.vault.store.get(this.vault.objectKey(record.hash)); } catch { present = null; }
      if (present) continue;
      const mine = local[key];
      if (!mine || mine.deleted) { failed.push(key); continue; }
      try {
        const stored = await this.vault.putObject(await this.readLocalData(key));
        if (stored.hash === record.hash) reuploaded.push(key);
        else failed.push(key);
      } catch { failed.push(key); }
    }
    return { reuploaded, failed };
  }
}
