import { randomBytes, scrypt as scryptCallback, createCipheriv, createDecipheriv, createHmac } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
export const randomId = () => randomBytes(20).toString('hex');
export async function derive(password, salt) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 1024) throw new Error('恢复口令须为 12–1024 个字符');
  if (!/^[a-f0-9]{32}$/.test(salt)) throw new Error('同步库盐值无效');
  return Buffer.from(await scrypt(password, Buffer.from(salt, 'hex'), 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }));
}
export const keyHash = (key, data) => createHmac('sha256', key).update(data).digest('hex');
// OCS1 = 未压缩密文（0.1.x 写入的旧对象），OCS2 = gzip 后加密
export function seal(key, data, context, { compress = false } = {}) {
  const raw = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const packed = compress && raw.length >= 512;
  const magic = packed ? 'OCS2' : 'OCS1';
  const body = packed ? gzipSync(raw, { level: 6 }) : raw;
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(`ocsync-v1:${context}`));
  const enc = Buffer.concat([cipher.update(body), cipher.final()]);
  return Buffer.concat([Buffer.from(magic), nonce, cipher.getAuthTag(), enc]);
}
export function open(key, data, context) {
  if (!Buffer.isBuffer(data) || data.length < 32) throw new Error('密文格式无效');
  const magic = data.subarray(0, 4).toString();
  if (magic !== 'OCS1' && magic !== 'OCS2') throw new Error('密文格式无效');
  const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(4, 16));
  decipher.setAAD(Buffer.from(`ocsync-v1:${context}`));
  decipher.setAuthTag(data.subarray(16, 32));
  let plain;
  try { plain = Buffer.concat([decipher.update(data.subarray(32)), decipher.final()]); }
  catch { throw new Error('解密失败：口令不正确或同步数据被篡改'); }
  return magic === 'OCS2' ? gunzipSync(plain) : plain;
}
export async function newVault(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt);
  const id = randomId();
  return { key, meta: { version: 1, id, salt, check: seal(key, Buffer.from(id), 'check').toString('base64') } };
}
export async function unlockVault(meta, password) {
  if (meta?.version !== 1 || !/^[a-f0-9]{40}$/.test(meta.id)) throw new Error('不支持的同步库');
  const key = await derive(password, meta.salt);
  if (open(key, Buffer.from(meta.check, 'base64'), 'check').toString() !== meta.id) throw new Error('同步库验证失败');
  return key;
}
