# 更新日志

## 0.2.7 — 2026-11-20

修掉「点同步 20 秒后报 `Host did not answer in time.`」：不是同步失败，是被宿主掐死。

- **长接口改后台任务**：`POST /sync`、`/join`、`/repair`、`/extensions/pack` 立刻返回 `{started, job}`，干活留在后台；`GET /state` 增加 `job`（阶段/进度/轮次/错误）与 `downloads`。
- **面板改轮询**：同步、应用、加入、备份四处调用改为「发起 → 轮询 `/state` → 取结果」，期间显示 `同步中：done/total（等待网盘下载 N 项）`。
- **下载协调层**（新增 `service/downloads.mjs`）：针对「按需下载」的网盘，流式读 + 字节数比对 + 哈希校验，四态 `downloading / stalled / missing / corrupt`；停顿 30 秒断开重试（5/15/45 秒退避），状态落盘 `downloads.json`。
- **单轮预算**：每轮 120 秒 / 60 MB / 6 个对象，超了留到下一轮，基线只为真正落地的项推进；小对象优先。
- **自动续轮**：还有 `downloading/stalled` 就 60 秒后再来一轮，最多 5 次。
- **性能**：`/preview` 不再拉远端对象（1113 ms，原来 85 秒级）；`/state` 不再每次读 1374 个提交（省 347 ms/次）；`/doctor` 只 stat 不读对象。
- **会话**：`resolveCli` 改多候选（配置 → `OPENCODE_CLI` → 旧内置路径 → PATH），都没有就整体跳过会话同步，避免每轮白拉 86 MB 后全部导入失败。
- **修复**：关掉「会话」勾选时台账侧未过滤，生成 `record` 为 null 的推送项导致 `/preview` 崩溃。

## 0.2.6 — 2026-11-17

- 会话跨机可见性：`archiveImported` 默认 false，导入不再归档；会话落地目录用 `fs.realpath` 规范磁盘真实大小写，映射路径不存在时统一落「跨机同步」。
- 导出追赶预算 10 → 30；`/state` 增加 `sessionCacheCount`。

## 0.2.5 — 2026-11-17

- `settings.json` 改投影式同步：哈希、上传、比对只看共享键；应用时合并，项目按路径求并集，`activeProjectId` 不再被另一台机器覆盖。
- 不再同步 Python 产物（`__pycache__`、`*.pyc`）。

## 0.2.4 — 2026-11-16

- 对象文件乱序到达时单条挂起（`deferred`），不再中断整次同步；基线只推进成功项。
- 冲突自动取舍遇远端对象缺失且记录过期（>1 小时）时改判本机胜出并重新上传，避免永久挂起。
- 子会话先于父会话时抛 `PARENT_MISSING`，父会话落地后最多重试 3 轮。

## 0.2.3 — 2026-11-16

- `spawn` 前校验 `cwd` 与 CLI，把 Windows 的 ENOENT 报清楚（「会话目录不存在」/「找不到 OpenCode 可执行文件」）。
- 导入 404（`SessionNotFoundError`）不再中断同步。

## 0.2.0 — 2026-11

- 提交式增量同步：`commits/` + 内容寻址 `objects/`，按 baseline 三方比对，支持删除提案与冲突解决。
