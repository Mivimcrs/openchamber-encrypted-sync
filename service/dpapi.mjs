import { spawn } from 'node:child_process';

function powershell(script) {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { windowsHide: true });
    let out = '', err = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('error', e => reject(new Error(`DPAPI 不可用：${e.code || e.message}`)));
    child.on('close', code => code === 0 ? resolve(out.trim()) : reject(new Error(`DPAPI 调用失败：${err.trim().slice(0, 300)}`)));
  });
}

export const dpapiAvailable = () => process.platform === 'win32';

export async function protect(text) {
  if (!dpapiAvailable()) throw new Error('仅 Windows 支持系统凭据保护');
  const b64 = Buffer.from(text, 'utf8').toString('base64');
  const out = await powershell(`Add-Type -AssemblyName System.Security;[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Convert]::FromBase64String('${b64}'),$null,'CurrentUser'))`);
  if (!out) throw new Error('DPAPI 未返回密文');
  return Buffer.from(out, 'base64');
}

export async function unprotect(buffer) {
  if (!dpapiAvailable()) throw new Error('仅 Windows 支持系统凭据保护');
  const b64 = Buffer.from(buffer).toString('base64');
  const out = await powershell(`Add-Type -AssemblyName System.Security;[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String('${b64}'),$null,'CurrentUser'))`);
  if (!out) throw new Error('DPAPI 无法解密');
  return Buffer.from(out, 'base64').toString('utf8');
}
