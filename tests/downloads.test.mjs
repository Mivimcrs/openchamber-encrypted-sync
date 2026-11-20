import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Hydrator } from '../service/downloads.mjs';
import { seal, keyHash } from '../service/crypto.mjs';

const key = Buffer.alloc(32, 9);

async function makeRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sync-hydrate-'));
  await fs.mkdir(path.join(root, 'objects'), { recursive: true });
  return root;
}

function makeHydrator(root) {
  return new Hydrator({
    store: { get: async () => null, put: async () => {} },
    getVault: () => ({ key }),
    fileOf: hash => path.join(root, 'objects', hash.slice(0, 2), hash),
    stateFile: path.join(root, 'downloads.json'),
    log: async () => {},
  });
}

async function writeObject(root, payload) {
  const hash = keyHash(key, payload);
  const file = path.join(root, 'objects', hash.slice(0, 2), hash);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, seal(key, payload, `object:${hash}`, { compress: true }));
  return { hash, file };
}

test('对象到位后返回内容并记住状态', async () => {
  const root = await makeRoot();
  const payload = Buffer.from('hello world '.repeat(100));
  const { hash } = await writeObject(root, payload);
  const hydrator = makeHydrator(root);

  const data = await hydrator.ensure(hash, { key: 'demo/a', capMs: 5000 });
  assert.ok(data);
  assert.equal(keyHash(key, data), hash);
  assert.equal(hydrator.reasonOf(hash), 'ready');
  assert.equal(hydrator.summary().pending, 0);

  // 第二次走内存缓存，不重新读盘
  const again = await hydrator.ensure(hash, { key: 'demo/a', capMs: 1000 });
  assert.equal(again, data);
});

test('内容被篡改时判坏件并跳过', async () => {
  const root = await makeRoot();
  const { hash, file } = await writeObject(root, Buffer.from('payload'.repeat(50)));
  const raw = await fs.readFile(file);
  raw[raw.length - 1] ^= 0xff;
  await fs.writeFile(file, raw);

  const hydrator = makeHydrator(root);
  const data = await hydrator.ensure(hash, { key: 'demo/bad', capMs: 8000 });
  assert.equal(data, null);
  assert.ok(['corrupt', 'downloading'].includes(hydrator.reasonOf(hash)));
});

test('对象不存在时标 missing，不阻塞', async () => {
  const root = await makeRoot();
  const hydrator = makeHydrator(root);
  const data = await hydrator.ensure('f'.repeat(64), { key: 'demo/missing', capMs: 3000 });
  assert.equal(data, null);
  assert.equal(hydrator.reasonOf('f'.repeat(64)), 'missing');
  assert.equal(hydrator.summary().missing, 1);
});

test('并发请求同一对象只读一次', async () => {
  let reads = 0;
  const payload = Buffer.from('y'.repeat(1000));
  const hash = keyHash(key, payload);
  const sealed = seal(key, payload, `object:${hash}`, { compress: true });
  const root = await makeRoot();
  const hydrator = new Hydrator({
    store: {
      get: async () => { reads += 1; await new Promise(resolve => setTimeout(resolve, 50)); return sealed; },
      put: async () => {},
    },
    getVault: () => ({ key }),
    fileOf: () => null,
    stateFile: path.join(root, 'downloads.json'),
    log: async () => {},
  });

  const [a, b] = await Promise.all([
    hydrator.ensure(hash, { key: 'demo/dup', capMs: 5000 }),
    hydrator.ensure(hash, { key: 'demo/dup', capMs: 5000 }),
  ]);
  assert.ok(a && b);
  assert.equal(reads, 1);
  assert.equal(hydrator.reasonOf(hash), 'ready');
});
