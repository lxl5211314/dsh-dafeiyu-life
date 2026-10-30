# 给一只 AI 完整的一生：DeepSeek Harness × 蓝色大肥鱼 × QQ

> 这份仓库记录了一次真实的落地过程：**从零装好 DeepSeek Harness（DSH），把桌面端拉满六件套，再把「蓝色大肥鱼」接进 QQ，让她能自己说话、自己发语音、自己发说说、自己来找你。**
>
> 不是「理论上可以」，每一格结论后面都有本机跑出来的输出。也把踩过的坑全留着——包括那些看起来像玄学、实际是 PowerShell 5.1 或 zstd 多帧的坑。

- 环境基线：Windows 11 + DSH `0.2.1-rc.2` + Node 24.21.0 / pnpm 11.28.5
- QQ 传输层：NapCat Shell `4.18.41`（OneBot v11 / WebSocket 3001）
- 她的运行时：`dsh-aurabot-qq 1.1.22`（开源插件，作者 accomplish07zrh-eng）
- 语音：本机训练的 GPT-SoVITS 音色 + faster-whisper 本地识别（都不用联网）
- 全部实测日期：2026-10-30

---

## 30 秒看懂这个仓库

| 你想干的事 | 看这个 |
| --- | --- |
| 从一台干净的 Windows 装上 DSH，并配好上下文/记忆/搜索等六件套 | [docs/01-安装DSH与六件套.md](docs/01-安装DSH与六件套.md) |
| 让她住进 QQ：收发消息、发语音、发说说、主动找你、群聊分档 | [docs/02-把大肥鱼接进QQ-Aurabot.md](docs/02-把大肥鱼接进QQ-Aurabot.md) |
| 看看别人把这套做到了什么水平（6 个开源项目拆解 + 四条路线） | [docs/03-调研-别人怎么把她做得更高级.md](docs/03-调研-别人怎么把她做得更高级.md) |
| 别踩我踩过的坑（30 条，按症状查） | [docs/00-踩坑总账.md](docs/00-踩坑总账.md) |
| 直接抄脚本（安装、启动、看门狗、自检、登录助手） | [scripts/](scripts) · [tools/](tools) |

---

## 一图看懂链路

```
┌──────────────────┐   OneBot v11 / WS    ┌─────────────────────────┐
│  手机 QQ（她）    │◀────────────────────▶│  NapCat Shell 4.18.41    │
│  1000000001      │     127.0.0.1:3001   │  （hook 本机 QQNT）      │
└──────────────────┘                      └───────────┬─────────────┘
                                                      │ WS 3001
                                          ┌───────────▼─────────────┐
                                          │  DSH 桌面端（Electron）  │
                                          │  profile: desktop        │
                                          │  └ dsh-aurabot-qq 1.1.22 │
                                          │     ├ 人格 preset 两档   │
                                          │     ├ 记忆/心情/日记     │
                                          │     ├ 表情包库           │
                                          │     └ local/ 本地接口 ───┼──▶ GPT-SoVITS 9880（她自己的音色）
                                          └───────────┬─────────────┘
                                                      │ HTTP（本机免鉴权）
                                          ┌───────────▼─────────────┐
                                          │ 面板 API /aurabot/api    │
                                          │ 唤醒词·白名单·上限·开关  │
                                          └─────────────────────────┘
```

关键点：**插件是 Host 侧插件，跑在 DSH 里；NapCat 只是传输层，换成 SnowLuma / Lagrange / LLOneBot 也能接**（见 docs/03）。

---

## 目录

```
docs/
  00-踩坑总账.md                    ← 建议先看，省你几小时
  01-安装DSH与六件套.md              ← DSH 本体 + plugins/bundles/patch 三个概念
  02-把大肥鱼接进QQ-Aurabot版.md      ← QQ 接入全流程 + 12 项设计要点 + 验收证据表
  03-调研-别人怎么把她做得更高级.md    ← 四条路线 / 6 个开源项目 / 12 条可借鉴做法
  reference/                        ← 上述项目 README 的抓取快照（出处留档）
scripts/
  install-dafeiyu.ps1               ← 一条命令装六件套（带备份、幂等）
  启动-NapCat.ps1                    ← 只起 NapCat，等 3001 就绪，不碰 DSH
  启动-GPT-SoVITS.ps1               ← 起/停她的音色服务（cmd /c start 脱钩）
  watchdog.ps1 / watchdog-hidden.vbs ← 无窗口看门狗：保活 NapCat + 清掉旧桥
tools/                              ← 全部是可复跑的 Node 小工具（见下表）
```

### tools 一览（都是「只做面板按钮那一下」的薄封装）

| 脚本 | 作用 |
| --- | --- |
| `aurabot-selfcheck.mjs` | 25 项只读自检，一次告诉你哪条链路断了（`--json` 可机器读） |
| `onebot-call.mjs` | 通用 OneBot v11 调用器：`node onebot-call.mjs send_private_msg '{"user_id":123,"message":[...]}'` |
| `check-group.mjs` | 群聊验收清单：白名单、唤醒词、插话上限、群档工具 |
| `test-voice-send.mjs` | 把一段 wav 当 QQ 语音条发出去（验证 silk 转码链路） |
| `test-local-asr.mjs` | 走插件通道验证本地 ASR |
| `test-bili-anon.mjs` | 无 Cookie 验证 B 站匿名读（热门/播放页/评论/搜索） |
| `bili-login.mjs` | 灌 `SESSDATA` + `bili_jct`，并当场回读验证 |
| `douyin-login.mjs` | 开抖音登录页 → 二维码存 PNG → 轮询登录状态 |
| `douyin-qr-refresh.mjs` | 二维码过期时**真点「点击刷新」**再截图（CDP 直连插件浏览器） |
| `douyin-qr-keepalive.mjs` | 保鲜：每 45 秒重刷一次，登上了自动退出 |
| `douyin-enable.mjs` | 登录后一键开张（默认保守上限：点赞 5/天、评论 1/天，分享只落私聊） |

---

## 她能干什么（实测状态）

**已跑通并留证**

- ✅ QQ 私聊双向对话（`stats: received/sent` 有数）
- ✅ 她**自己的音色**发语音条（GPT-SoVITS v2Pro，534KB wav → silk）
- ✅ 听语音条（faster-whisper small，本地，9.2 秒转一条 11 秒的语音）
- ✅ 记忆：10 条迁移 + 人物小档案 + `recall_memory` 检索
- ✅ 心情值（会随对话涨落，影响表情/语音/话多话少）
- ✅ 表情包库（7 张，按 `<sticker:标签>` 发；标签对不上会跳过）
- ✅ 主动搭话（`speakUp`）、空间日记（每天 2 篇，自动配图发说说）
- ✅ 改资料：QQ 头像 + 个性签名都实测成功（走 NapCat 的 `set_qq_avatar` / `set_self_longnick`）
- ✅ B 站**看**视频（完全不用登录：热门、播放页、热评、搜索）
- ✅ 群聊策略层（被@/叫名字/引用 → 必答；插话有冷却、每小时上限、静默时段；11 个用例全过）
- ✅ 工具按会话分档（主人私聊 37 个工具，群里只有 15 个且**没有**发消息/改资料权限）
- ✅ 扩展模块热插拔（自己写了个「白米饭账本」模块，`/rice`、`/ricebowl` 可查）

**差最后一步（需要你本人配合）**

- ⚠️ 抖音：必须手机扫码（且点赞/评论是用**你的号**发出去的，脚本默认保守）
- ⚠️ B 站发评论/点赞：需 `SESSDATA` + `bili_jct`
- ⚠️ 翻唱：引擎装好了（19 分钟，六件套全 true），缺一个你**有权使用**的 RVC `.pth` 音色
- ⚠️ 群聊：这个号一个群都没有，策略层只能单测

**做不了（有明确原因）**

- ❌ 逛别人空间：NapCat 没有 `get_qzone_msg_list` 这个 API
- ❌ 依赖 DSH `speechToText` 的那条路：`0.2.1-rc.2` 没这个服务（已用本地 ASR 绕过）

---

## 我踩到的最贵的 5 个坑（完整版见 00）

1. **PowerShell 5.1 把无 BOM 的 UTF-8 `.ps1` 当 ANSI 读** → 中文把引号吃掉，报 `Unexpected token '}'`。脚本必须存成 **UTF-8 with BOM**。
2. **pnpm 的进度输出走 stderr**，配合 `$ErrorActionPreference='Stop'` 会被当成终止性错误 → 安装脚本里要临时降级 EAP。
3. **`Invoke-WebRequest` 在非交互 PowerShell 里走 IE 引擎** → 抓网页一律 `Invoke-RestMethod` 或 `curl.exe`。
4. **DSH 的会话文件是多帧 zstd**，`zlib.zstdDecompressSync` 只能解出第一行 → 别自己解。
5. **旧桥和新插件会抢同一个 3001** → 一句话回两遍；现在的看门狗会主动清掉旧桥进程。

---

## 这个仓库里不包含什么

- 任何密钥、Cookie、Token、QQ 号密码、`~/.dsh` 里的账号配置
- 训练数据与模型权重（GPT-SoVITS 的 `.ckpt/.pth` 属于个人音色资产，请自行准备并使用你有权使用的声音）
- `reference/` 下的文件是**上游项目 README 的抓取快照**，版权归原作者，仅供离线查阅；请以各项目仓库为准

---

## 合规提醒（重要）

- **NapCat 属于非官方协议实现，与腾讯 ToS 存在冲突**，有封号风险 → 一定用小号跑，别用主号。
- 抖音侧所有点赞/评论/分享都是用**你的账号**在公开发布，脚本默认给了很保守的上限；自己评估再放开。
- 抓取 B 站/抖音数据请遵守对应平台的 robots 与用户协议；RVC/翻唱音色必须是**你有权使用**的声音。

---

## 路线图

- [x] 六件套安装脚本（幂等、可回滚）
- [x] Aurabot 接入 + 12 项设计要点逐项验证 + 验收证据表
- [x] 本地 TTS（GPT-SoVITS）/ 本地 ASR（faster-whisper）
- [x] 无窗口看门狗（保活 NapCat + 清理旧桥）
- [x] 25 项只读自检脚本
- [ ] 抖音扫码 → 保守开张（脚本已就位，等扫）
- [ ] B 站 Cookie → 评论/点赞
- [ ] RVC 音色 → 翻唱
- [ ] 有群之后补群聊实跑证据
