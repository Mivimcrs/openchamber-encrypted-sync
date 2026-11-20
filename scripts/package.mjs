import { createHash } from 'node:crypto';
import { deflateRawSync, crc32 as zlibCrc32 } from 'node:zlib';
import { readdir, readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// 仓库根目录就是扩展包本身，所以只打包「宿主需要的东西」。
// 与 .github/workflows/release.yml 用同一份排除规则，避免本地与 CI 产物不一致。
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EXCLUDE_DIRS = new Set(['.git', '.github', 'node_modules', 'dist', 'tmp', '.data', '__pycache__']);
const EXCLUDE_FILES = new Set(['.gitignore', '.gitattributes', 'CHANGELOG.md', 'LICENSE', '踩坑日志.md']);
const EXCLUDE_SUFFIX = ['.zip', '.log', '.DS_Store', 'Thumbs.db'];

// Node 22 才有 zlib.crc32；老一点的运行时用查表实现兜底
const crcTable = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();
const crc32 = typeof zlibCrc32 === 'function'
  ? data => zlibCrc32(data) >>> 0
  : data => {
    let crc = -1;
    for (let i = 0; i < data.length; i += 1) crc = (crc >>> 8) ^ crcTable[(crc ^ data[i]) & 0xff];
    return (crc ^ -1) >>> 0;
  };

const dosTime = date => ((date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)) & 0xffff;
const dosDate = date => (((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff;

async function walk(dir, rel = '') {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isSymbolicLink()) continue;
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      out.push(...await walk(path.join(dir, entry.name), relPath));
      continue;
    }
    if (EXCLUDE_FILES.has(entry.name)) continue;
    if (EXCLUDE_SUFFIX.some(suffix => entry.name.endsWith(suffix))) continue;
    if (relPath === 'package.json' || relPath.startsWith('panel/') || relPath.startsWith('service/') || relPath.startsWith('status/') || relPath.startsWith('tests/') || entry.name === 'icon.svg' || entry.name === 'README.md') {
      out.push(relPath);
    }
  }
  return out;
}

function buildZip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.rel, 'utf8');
    const raw = file.data;
    const packed = deflateRawSync(raw, { level: 9 });
    const useDeflate = packed.length < raw.length;
    const body = useDeflate ? packed : raw;
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);          // 文件名 UTF-8
    local.writeUInt16LE(useDeflate ? 8 : 0, 8);
    local.writeUInt16LE(dosTime(file.mtime), 10);
    local.writeUInt16LE(dosDate(file.mtime), 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    chunks.push(local, name, body);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(useDeflate ? 8 : 0, 10);
    entry.writeUInt16LE(dosTime(file.mtime), 12);
    entry.writeUInt16LE(dosDate(file.mtime), 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(body.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);

    offset += local.length + name.length + body.length;
  }

  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...chunks, directory, end]);
}

const manifest = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
if (!manifest.version) throw new Error('package.json 缺少 version');

const rels = await walk(ROOT);
if (!rels.includes('package.json')) throw new Error('打包列表缺少 package.json');

const files = [];
for (const rel of rels) {
  const full = path.join(ROOT, rel);
  files.push({ rel, data: await readFile(full), mtime: (await stat(full)).mtime });
}

const zip = buildZip(files);
const outDir = path.join(ROOT, 'dist');
await mkdir(outDir, { recursive: true });
const out = path.join(outDir, `encrypted-sync-${manifest.version}.zip`);
await writeFile(out, zip);

const sha = createHash('sha256').update(zip).digest('hex').slice(0, 16);
console.log(`OK  ${out}`);
console.log(`entries=${files.length}  bytes=${zip.length}  version=${manifest.version}  sha256=${sha}…`);
for (const file of files) console.log(`  ${String(file.data.length).padStart(8)}  ${file.rel}`);
