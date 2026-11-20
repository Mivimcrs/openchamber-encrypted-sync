# 加密同步（encrypted-sync）

在多台机器之间增量同步 OpenChamber 的会话、设置、扩展与插件，**内容端到端加密**，存储可以是任意网盘文件夹、WebDAV、S3，或一个 GitHub 私有仓库。

同步库是一串加密提交：每次同步只上传变化的文件，读取方按内容哈希校验，冲突按更新时间判定、会话按消息并集合并。恢复口令只在本机，存储端拿到的只有密文和哈希目录。

## 安装

**从仓库安装（推荐，能跟着线上更新）**

设置 → 扩展 → 添加扩展 → **URL**，填：

```
https://github.com/Mivimcrs/openchamber-encrypted-sync
```

安装后需要批准「本地服务」权限（以及它声明的 `opencode`、`powershell`）。左栏出现「加密同步」面板，首次使用设置恢复口令（≥12 位）与存储位置。

**离线安装**：下载 Release 里的 `encrypted-sync-<版本>.zip`，在扩展页拖入安装。

## 更新

从 URL 安装的扩展是 git 源：OpenChamber 会读仓库根目录 `package.json` 的 `version`，与已安装版本做 semver 比较，发现新版本就在扩展页提示。点更新会重新 clone 并替换安装副本，授权、同步库口令与数据都按扩展 id 保留，不用重新批准。

- 检查频率：每个扩展每小时最多一次，也可以手动刷新。
- 安装副本在 OpenChamber 自己的目录里，**不是**这个仓库；直接改仓库文件不会影响已安装的那份。
- 回滚就是装回旧 tag：`https://github.com/Mivimcrs/openchamber-encrypted-sync#v0.2.6`。

## 发布流程（维护者）

```bash
# 1. 改版本号 + 写 CHANGELOG
npm run check     # 清单、入口、语法、本机路径泄漏自检
npm run test      # 单元测试
npm run package   # 生成 dist/encrypted-sync-<version>.zip

# 2. 提交并打 tag
git add -A && git commit -m "release: v0.2.7"
git tag v0.2.7 && git push origin main --tags
```

打 tag 会触发 `.github/workflows/release.yml`：跑自检与测试、打包、把 zip 传到 Release。**版本号必须与 tag 一致**，否则扩展页认不出更新。

## 同步什么

| 类别 | 内容 | 说明 |
|---|---|---|
| 会话 | 会话 JSON（含子会话） | 需要可用的 OpenCode CLI，见「已知限制」 |
| 设置 | `settings.json`、`preferences.json`、分类、路由 | `settings.json` 只同步共享键，项目登记与主目录保留本机 |
| 扩展 | `extensions/<id>/…`，可另存 zip 备份 | 远端有、本机没有时会自动登记 |
| 插件与技能 | `opencode/agents|commands|skills|plugins` | 符号链接与 `__pycache__` 一律跳过 |
| 凭据（可选） | `secrets/opencode-auth.json` | 默认关闭 |

**目录映射**：另一台机器的会话目录写成本机路径，格式 `原路径=>新路径`，每行一条，例如

```
C:\Users\Mivimcrs=>C:\Users\Fanyi
```

映射后路径存在就落到原项目；不存在就统一落「未知目录位置/跨机同步」。

**自动同步**：默认空闲 60 秒、启动 30 秒后各对齐一次，可关。手动同步在面板里随时可用。

## 存储与加密

- 口令经 scrypt（N=32768, r=8, p=1）派生 32 字节密钥；每个对象用 AES-256-GCM 单独加密，AAD 绑定对象上下文；≥512 字节先 gzip。
- 对象以明文内容的 HMAC-SHA256 命名，读取时重新校验，缺一个字节都会被发现。
- 目录里只暴露对象哈希；`packs/extensions/<id>.zip.oc` 会暴露扩展 id（这是备份包的命名）。
- 后端：文件夹（含各类同步盘）、WebDAV（仅 HTTPS）、S3、GitHub 私有仓库（单对象 ≤700 KB）。
- 口令忘了就没了：`vault.json` 里的 check 只能验证口令，不能恢复。

## 已知限制

- **会话导入/导出依赖 OpenCode CLI**。OpenChamber 2.7.x 桌面版不再随包 `resources/opencode-cli`（换成了只跑 `serve` 的 `opencode-server`）。检测不到 CLI 时本扩展会跳过会话同步（日志一行、`/state` 里 `sessionsAvailable=false`），其余文件照常同步；装好 CLI 后在面板里填 `cli` 路径即可恢复。
- 同步库放在「按需下载」的网盘目录时，读对象会先触发云端下发，速度可能是 1 MB/s。0.2.7 起有下载协调层：单轮预算内推进，没下完的自动续轮，不会把整次同步卡死。
- 单对象上限：GitHub 700 KB，其它后端 64 MiB。过大的会话会被跳过并记日志。

## 版本

见 [CHANGELOG.md](CHANGELOG.md)。最近的 0.2.7 修掉了一个关键问题：宿主对扩展服务请求有 **20 秒硬上限**，长任务必须「立刻返回 + 轮询」，否则会被判超时并连带杀掉服务进程。

## 许可

MIT，见 [LICENSE](LICENSE)。
