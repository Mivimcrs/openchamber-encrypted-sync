import test from 'node:test';
import assert from 'node:assert/strict';
import { projectSettings, mergeSettings, DEVICE_KEYS, SETTINGS_KEY } from '../service/settings-guard.mjs';

const P = (path, id, addedAt = 1) => ({ id, path, label: path.split('\\').pop(), addedAt });

const localDoc = {
  themeVariant: 'dark',
  projects: [
    P('D:\\APPData\\OpenChamber\\梵壹门店抖音文案', 'id-a'),
    P('D:\\APPData\\OpenChamber\\莱·梵壹抖音团购商品页设计', 'id-b'),
  ],
  activeProjectId: 'id-b',
  homeDirectory: 'C:\\Users\\alice',
  lastDirectory: 'C:\\Users\\alice\\x',
  desktopLocalClientToken: 'token-fanyi',
  favoriteModels: [{ providerID: 'a', modelID: 'b' }],
};

// 另一台机器：只有说匠项目，home 是 bob
const remoteDoc = {
  themeVariant: 'light',
  projects: [P('D:\\APPData\\OpenChamber\\说匠随机演讲系统', 'id-c', 2)],
  activeProjectId: 'id-c',
  homeDirectory: 'C:\\Users\\bob',
  lastDirectory: 'C:\\Users\\bob\\y',
  desktopLocalClientToken: 'token-bob',
  favoriteModels: [{ providerID: 'a', modelID: 'c' }],
};

test('投影里没有设备本地键', () => {
  const projected = JSON.parse(projectSettings(JSON.stringify(localDoc)));
  for (const k of DEVICE_KEYS) assert.equal(k in projected, false, `${k} 不应出现在投影里`);
  assert.equal(projected.themeVariant, 'dark');
});

test('两台机器的投影可比较：共享键相同则投影相同', () => {
  const a = projectSettings(JSON.stringify({ ...localDoc, projects: [], activeProjectId: '', homeDirectory: 'A' }));
  const b = projectSettings(JSON.stringify({ ...localDoc, projects: [], activeProjectId: '', homeDirectory: 'B' }));
  assert.equal(a, b);
});

test('应用远端设置时项目只增不删，主目录与令牌保留本机', () => {
  const merged = JSON.parse(mergeSettings({ localRaw: JSON.stringify(localDoc), remoteRaw: JSON.stringify(remoteDoc) }));
  const paths = merged.projects.map((p) => p.path);
  assert.equal(merged.projects.length, 3);
  assert.ok(paths.includes('D:\\APPData\\OpenChamber\\莱·梵壹抖音团购商品页设计'));
  assert.ok(paths.includes('D:\\APPData\\OpenChamber\\说匠随机演讲系统'));
  assert.equal(merged.homeDirectory, 'C:\\Users\\alice');
  assert.equal(merged.desktopLocalClientToken, 'token-fanyi');
  assert.equal(merged.lastDirectory, 'C:\\Users\\alice\\x');
  // 共享键跟随远端
  assert.equal(merged.themeVariant, 'light');
  assert.deepEqual(merged.favoriteModels, remoteDoc.favoriteModels);
  // activeProjectId 仍然指向本机有效项目
  assert.equal(merged.activeProjectId, 'id-b');
});

test('activeProjectId 失效时回落到并集里的第一个', () => {
  const local = { ...localDoc, projects: [], activeProjectId: 'gone' };
  const merged = JSON.parse(mergeSettings({ localRaw: JSON.stringify(local), remoteRaw: JSON.stringify(remoteDoc) }));
  assert.equal(merged.activeProjectId, 'id-c');
});

test('同一路径不重复，保留本机条目', () => {
  const dup = { ...remoteDoc, projects: [{ ...P('D:\\APPData\\OpenChamber\\莱·梵壹抖音团购商品页设计', 'other-id'), color: '#000' }] };
  const merged = JSON.parse(mergeSettings({ localRaw: JSON.stringify(localDoc), remoteRaw: JSON.stringify(dup) }));
  const hit = merged.projects.filter((p) => p.path.includes('商品页设计'));
  assert.equal(hit.length, 1);
  assert.equal(hit[0].id, 'id-b');
});

test('本机没有设置文件时原样落盘；远端损坏时不动本机', () => {
  assert.equal(mergeSettings({ localRaw: null, remoteRaw: Buffer.from('{"a":1}') }).toString(), '{"a":1}');
  assert.equal(mergeSettings({ localRaw: Buffer.from('{"keep":1}'), remoteRaw: Buffer.from('not json') }).toString(), '{"keep":1}');
});

test('settings key 常量保持不变', () => {
  assert.equal(SETTINGS_KEY, 'openchamber/settings.json');
});
