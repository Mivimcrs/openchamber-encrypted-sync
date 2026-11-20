// 设置文件的设备边界：项目登记、主目录、安装令牌只属于本机
//
// 背景：settings.json 原先是整文件同步，谁后写谁赢。另一台机器的设置一旦应用，
// 本机的 projects / activeProjectId / homeDirectory 会被整段覆盖（2026-11-17 事故）。
//
// 现在改为「投影式同步」：
//   - 上传与比对只算共享键（projectSettings），两台机器投影相同 → 不来回覆盖、不来回上传；
//   - 应用远端时用 mergeSettings 合并：共享键跟随远端，设备本地键保留本机，项目按路径求并集。
export const SETTINGS_KEY = 'openchamber/settings.json';

export const DEVICE_KEYS = [
  'projects',
  'activeProjectId',
  'homeDirectory',
  'lastDirectory',
  'desktopLocalClientToken',
];

const norm = (p) => String(p || '').replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();

// 共享投影：去掉设备本地键后的稳定 JSON，用于哈希、比对和上传
export function projectSettings(raw) {
  const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw ?? '');
  let doc;
  try { doc = JSON.parse(text); } catch { return text; }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return text;
  const out = {};
  for (const [k, v] of Object.entries(doc)) {
    if (!DEVICE_KEYS.includes(k)) out[k] = v;
  }
  return JSON.stringify(out);
}

// 应用远端设置：共享键跟随远端，设备本地键永远保留本机，项目只增不删
export function mergeSettings({ localRaw, remoteRaw }) {
  let local = null;
  let remote = null;
  try { local = JSON.parse(Buffer.isBuffer(localRaw) ? localRaw.toString('utf8') : String(localRaw ?? '')); } catch { local = null; }
  try { remote = JSON.parse(Buffer.isBuffer(remoteRaw) ? remoteRaw.toString('utf8') : String(remoteRaw ?? '')); } catch { remote = null; }
  if (!local || typeof local !== 'object' || Array.isArray(local)) return remoteRaw;
  if (!remote || typeof remote !== 'object' || Array.isArray(remote)) return localRaw;

  const out = { ...local, ...remote };
  for (const k of DEVICE_KEYS) {
    if (local[k] !== undefined) out[k] = local[k];
  }

  const merged = [];
  const seen = new Set();
  const push = (p) => {
    if (!p || typeof p !== 'object' || !p.path) return;
    const key = norm(p.path);
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(p);
  };
  const localProjects = Array.isArray(local.projects) ? local.projects : [];
  const remoteProjects = Array.isArray(remote.projects) ? remote.projects : [];
  for (const p of localProjects) push(p);
  for (const p of remoteProjects) push(p);
  if (Array.isArray(local.projects) || Array.isArray(remote.projects)) out.projects = merged;

  const ids = new Set(merged.map((p) => p.id));
  if (!ids.has(out.activeProjectId)) {
    out.activeProjectId = ids.has(local.activeProjectId) ? local.activeProjectId : (merged[0]?.id ?? out.activeProjectId);
  }
  return JSON.stringify(out);
}
