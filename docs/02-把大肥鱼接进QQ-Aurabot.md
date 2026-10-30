# 接手文档 · 大肥鱼 QQ（Aurabot 版）

> 这份是 2026-10-30 换架构之后的**现状文档**。`README.md` §6.3 描述的是**旧方案**（`dsh-qq-onebot` 跑在 `qqbot` profile），
> 那套代码和配置还完整保留着、随时能回滚，但**日常不用了**。两者不要同时开（会抢同一个 WS 端口，出现双回复）。

---

## 0. 一句话说清变化

| | 旧方案（README §6.3） | 现在（本文档） |
|---|---|---|
| 宿主 | `qqbot` profile 里的 `dsh-qq-onebot` 插件 | `desktop` profile 里的 **`dsh-aurabot-qq` 1.1.22** |
| QQ 是什么 | 唯一通道，插件就是为 QQ 写的 | 只是她的**第一个通道**；B站/抖音/小黑盒/空间是别的通道 |
| 记忆 | 聊天记录目录 + 人设文件 | 记忆库（11 条）+ 主人人物小档案 + 每天 04:00/16:00 自动整理 |
| 主动 | 定时说句话（配置里 8 次/天） | 主动搭话模块（闲置 40 分钟触发）+ 目的引擎（实验，默认关） |
| 面板 | `http://127.0.0.1:34569/api/dsh-qq` | `http://127.0.0.1:<DSH端口>/aurabot/api`（**端口每次启动都变**，看 DSH 窗口/启动日志） |
| 人格 | `D:\aaa_dsh_data_storage\napcat-bridge\大肥鱼人设.md`（1083 字，旧桥读它） | `%USERPROFILE%\.dsh\plugins-data\aurabot\personas\dafeiyu.md`（1443 字，插件自带，热加载） |

**QQ 传输层没换**：还是 NapCat（`1000000001`），还是 OneBot v11 WebSocket `127.0.0.1:3001`。
换的只是「谁连上去说话」。所以 NapCat 那些坑（扫码、掉线、风控）一个没少 —— 见 §8。

---

## 1. 拓扑与端口

```
手机/电脑 QQ  ──消息──>  1000000001（NapCat 4.18.41 登录的号，昵称「甯」/对外叫「大肥鱼」）
                              │  OneBot v11 WebSocket  127.0.0.1:3001
                              ▼
                   DSH 桌面端（desktop profile，Web GUI 端口每次都变，例：62707）
                              │  插件 dsh-aurabot-qq 1.1.22
                              ├─ 每个聊天一个 DSH 会话（preset：aurabot-private / aurabot-social）
├─ 工具按会话注册（私聊 full 37 个 / 群聊 social 15 个）
                              ├─ 记忆库 + 小档案 + 心情 + 空间日记 + 主动搭话
                              └─ /aurabot/api  ← 面板和 curl 都打这里
```

| 端口 | 谁 | 说明 |
|---|---|---|
| 3001 | NapCat | OneBot WS，`token` 为空，只允许 `127.0.0.1` |
| 6099 | NapCat WebUI | 扫码登录：`http://127.0.0.1:6099/webui?token=910c14be34b8` |
| DSH 端口 | DSH 桌面端 | Web GUI + `/aurabot/api`，**每次启动可能变** |
| 19300 | 模型转发器 | `yonyou` provider 的 baseURL（`http://127.0.0.1:19300/v1`），没有它她就不说话 |

> 3000 是空的：NapCat 的 `onebot11.json` 里 `httpServers: []`，只有 WS。想加 HTTP 得自己改配置。

---

## 2. 目录速查

| 路径 | 是什么 |
|---|---|
| `%USERPROFILE%\.dsh\plugins-data\aurabot\` | **插件数据根**：`config.json`（全部设置）、`personas\dafeiyu.md`（人设）、`modules\`（扩展模块）、`local\`（本地接口脚本）、`logs\aurabot-YYYY-MM-DD.log`、`stickers\`、`memory\`、`profiles\` |
| `%USERPROFILE%\Aurabot\qq-chats\` | **她的工作区**（DSH 工作区名 `Aurabot · QQ`）：所有 QQ 会话的 cwd 都在这一个目录，**不按聊天分子目录**（现在里面是空的）；旧方案那套 `私聊_<QQ号>\{AGENTS.md,记忆区,聊天记录,图片缓存}` 已经不用了 |
| `%USERPROFILE%\Aurabot\pyenv\` | 语音用的 Python 3.13.2：edge-tts 7.3.1 + faster-whisper 1.2.1（不要动，`/voice/install` 建的） |
| `%USERPROFILE%\Aurabot\ffmpeg\ffmpeg-9.0.2-full_build\bin\` | ffmpeg/ffprobe 9.0.2（抽帧、抖音、翻唱都用它） |
| `%USERPROFILE%\Aurabot\rvc\` | 翻唱引擎根目录（Applio + 分离模型 + 预训练权重） |
| `D:\aaa_dsh_data_storage\napcat-bridge\` | NapCat 本体 + 旧桥代码 + 工具脚本 + 旧文档 |
| `D:\aaa_dsh_data_storage\napcat-bridge\启动-NapCat.ps1` | **只启动 NapCat**（不启 DSH 桥），带 `-Stop` / `-Account` / `-NoWait` |
| `D:\aaa_dsh_data_storage\napcat-bridge\tools\onebot-call.mjs` | 手搓 OneBot 调用：`node onebot-call.mjs get_login_info '{}'` |

---

## 3. 启动 / 停止（日常）

```powershell
# 1) 先把 QQ 传输层拉起来（会自动等 3001 监听）
D:\aaa_dsh_data_storage\napcat-bridge\启动-NapCat.ps1

# 1.5) 她的音色服务（可选，但要「她自己的声音」就得起；不起会自动退回机械音）
D:\aaa_dsh_data_storage\napcat-bridge\启动-GPT-SoVITS.ps1        # 加载模型约 60～70 秒

# 2) 打开 DSH 桌面端。Aurabot 总开关是开的，它自己连 3001
#    确认连上了（端口换成当前 DSH 的）：
Invoke-RestMethod http://127.0.0.1:62707/aurabot/api/state | Select-Object -ExpandProperty onebot
#    要看到 state=connected、login.uin=1000000001

# 停止
D:\aaa_dsh_data_storage\napcat-bridge\启动-NapCat.ps1 -Stop
```

- **不要再跑 `napcat-bridge\start.ps1`**：它除了 NapCat 还会 `dsh --profile qqbot`，等于把旧桥又拉起来 → 两个客户端抢 3001 → 她一句话回两遍。
- **看门狗会自动帮你保活（2026-10-30 重做过）**：计划任务 `DshQqWatchdog` 登录时拉起，跑的是 `watchdog.ps1`，**无窗口**（VBS 里 `Run(..., 0, False)`），每 20 秒检查一次，只做两件事：
  1. NapCat 进程或 3001 没了 → 用 `启动-NapCat.ps1` 风格把它拉回来；
  2. **看到旧桥（`--profile qqbot` 的 DeepSeek Harness 进程）就杀掉** —— 这正是「一句话回两遍」的病根，老版看门狗反而会把它拉起来。
  它还会顺手把 Aurabot 的 `/onebot/reconnect` 调一下（只在 `onebot` 不是 connected 且 3001 在听时）。日志：`napcat-bridge\logs\watchdog-<日期>.log`；手动体检 `powershell -NoProfile -ExecutionPolicy Bypass -File napcat-bridge\watchdog.ps1 -Status`。
- DSH 侧没有「启动 Aurabot」这回事：桌面端一起来，插件就挂着；面板里关掉总开关才会真的哑火。

---

## 4. 面板与 API 速查

所有接口都在 `http://127.0.0.1:<DSH端口>/aurabot/api` 下，**本机免鉴权**。

| 接口 | 干什么 |
|---|---|
| `GET /state` | 全量快照（配置+连接+统计+记忆条数+心情+日记+主动+模块+会话），排查第一步 |
| `POST /save` | 改配置，body 可只传要改的那一层（深合并）。改完**立即生效**，不用重启 |
| `GET /memories` `POST /memory/add` `/memory/update` `/memory/delete` | 记忆库 |
| `POST /memory/import` + `/memory/import/commit` | **从旧聊天记录批量提炼记忆**（两步：先出候选，再确认入库） |
| `GET /profiles` `POST /profiles/save` | 人物小档案（每个联系人一份） |
| `POST /sticker/upload`（base64 data URL）、`/sticker/import-qq`、`GET /stickers` | 表情包库 |
| `GET /voice/test` `POST /voice/install` `/voice/asr-status` | 语音合成自测、装 edge-tts、看语音识别是否可用 |
| `GET /diary/history` `POST /diary/run` `/qzone/delete` | 空间日记 |
| `POST /speakup/fire` | 手动让她主动搭一次话（会真的发出去） |
| `GET /purpose/preview` `POST /purpose/fire` | 目的引擎（实验功能，默认关） |
| `GET /modules` `POST /modules/reload` `POST /modules/create` `POST /modules/fork` `POST /modules/simulate` `GET /modules/tools` | 扩展模块、热重载、**不用上 QQ 的模拟测试** |
| `GET /local/status` `POST /local/template` `GET /local/open` `POST /local/test` | 本地接口（脚本接管 TTS/生图/翻唱/ASR） |
| `GET /bili/state` `POST /bili/account` `/bili/run` | B站 |
| `GET /douyin/state` `POST /douyin/login` `/douyin/run` | 抖音 |
| `GET /heybox/state` `POST /heybox/run` | 小黑盒 |
| `GET /song/status` `POST /song/install` `/song/import` `/song/request` | 翻唱 |

---

## 5. 十二项设计要点：现在的真实状态

### 5.1 人格注入 ✅
- 两个 preset：`aurabot-private`（order 60，主人私聊，全工具）、`aurabot-private-long`（62，多挂 `dsh-tool-jobs`+`dsh-tool-schedule`）、`aurabot-social`（61，**一个本地工具都不给**）。
- 人格走 `@deepseek-ai/dsh-persona`，变量 `{{aurabot_persona}}`，`complete: true` 覆盖 DSH 默认人设。
- 文件：`~\.dsh\plugins-data\aurabot\personas\dafeiyu.md`（65 行/1443 字，含心情值、`<voice>`、`<sticker:标签>`、群管规矩）。**改完保存即生效**。

### 5.2 每轮上下文 ✅
- 心情、召回的记忆、当前时间这些**每轮会变**的东西，走 `agent.ctx.systemPrompt.context()` 追加在对话**末尾**；
- 人设和规矩放**前缀**。这样前缀缓存不被打破，长对话也不烧钱。
- **工作区与会话落在哪（2026-10-30 核实，别再按旧方案理解）**：
  - 「每个聊天一个目录」实际是「**每个聊天一个 DSH 会话**」：会话标题形如 `QQ · 主人私聊` / `QQ · 后台`，全部跑在**同一个工作区** `Aurabot · QQ` = `%USERPROFILE%\Aurabot\qq-chats`（首次收到消息时插件 `ensureWorkspace()` 建目录 + 在 DSH 工作区注册表登记，日志 `[chat] 建好了工作区「Aurabot · QQ」…`）；已核对 `~\.dsh\storages\workspace.json` 里 `"path": "%USERPROFILE%\\Aurabot\\qq-chats"`、`"title": "Aurabot · QQ"`，她私聊会话的 `"cwd"` 就是这个目录。
  - 这个目录**不会**给每个聊天再建子目录（现在是空的），也**没有** AGENTS.md —— 旧方案的 `napcat-bridge\QQ会话\私聊_1000000002\`（`AGENTS.md` / `记忆区\` / `图片缓存\` / `聊天记录\`）**不再是她的工作区**，那套「写日记进记忆区」的约定已失效：记忆现在在插件库里（`/memories`，召回 6 条），日记/说说由 `diary` 模块自己发，表情库也在插件里。

### 5.3 群聊上下文 ⚠️ 无法验证
- 逻辑都在（按「段」合并、新消息带编号可引用、`decideGroupReply` 的 must/engaged/interject、`group.wakeWords` 唤醒、`quietHours: [1,8]`、`maxPerHour 6`、`minRecentMessages 3`）；`decideGroupReply` 已 11 用例单测全对（被@ / 叫「大肥鱼」/ 叫「肥鱼」/ 引用她 → must；相关 0.80/0.60 → interject；0.05 → 「话题和她关系不大」；群没在聊 → none；03:00 → 静默时段；刚插话 → 冷却；burst 8 → 「刚说了太多」）；
- **但这个 QQ 号一个群都没有**（`get_group_list` → `[]`），所以群聊白名单、群管、群内插话全部**无从验证**。拉进一个群之后才能试。
- 进群后一条命令验收：`node D:\aaa_dsh_data_storage\tools\check-group.mjs`（只读：网关/群策略/白名单/群列表/要发什么测/群档工具清单，未白名单的群会标 ⚠）。
- 群档工具实测（`/modules/tools?as=other&kind=group`）是 **15 个**：5 个表情 + 2 个记忆 + `qq_chat_history`/`qq_group_admin`/`bili_watch`/`bili_comment`/`qq_send_shot`/`qq_list_shots`/`qq_song_cover`/`rice_log` —— `qq_send_message`、`qq_send_file`、`qq_set_*` 都不在，**她在群里不能冒名给别人发东西**。

### 5.4 记忆 + 迁移旧档案 ✅
- 已从两份旧聊天记录（2905 字）提炼 **10 条**入库：
  真名主人 / QQ 1000000002 / 主人关系 / 要大肥鱼头像 / 答应主动说话 / 唱歌跑调 / 想要夏茉.的真人女音 / 抖音链接打不开需音频 / 嫌合成音难听 / 拒绝叫爸爸。
- 主人的人物小档案已写（含「对声音很挑」「不喜欢贫嘴过头」）。
- 每日自动整理：`memory.consolidateTimes = ['04:00','16:00']`，`recallCount 6`。**空间日记写完后也会自动被收成记忆**（现在库里 11 条，多的那条就是她的日记）。

### 5.5 心情 ✅（配置生效，机制见代码）
`mood.halfLifeHours 3`、`judge: false`（= 不额外调模型判定，省 token）、当前 `65 / 平平常常`。影响：表情和语音的频率、回复快慢。

### 5.6 B站 ✅ 看视频（不用登录）/ ⚠️ 评论点赞（要 Cookie）
- 现状：`enabled: true`、`autoBrowse: false`、`vision: true`、`visionFrames: 4`；`/bili/state` 显示 `isLogin: false`、`canPost: false`、`vision.ready: true`；
- **不用登录就能做**（2026-10-30 实测，走插件自己的 `src/bili/api.js`，没填任何 Cookie）：
  - `popular(3)` → 20 条热门正常返回；
  - `view({bvid})` → `不 看 尾 巴 挑 战 💃` / UP 兔总裁s / 播放 938536 / 85 秒；
  - `comments(aid)` → 热评三条正常；
  - `search('白米饭 吃播')` → 搜到「煮米饭别只放水，教你5星饭店秘诀…」等；
  - 所以**别人丢链接、让她去搜、读热评、抽帧看图（ffmpeg 已就绪）都能用**；
- **要登录才能做**：发评论 / 点赞 / 改B站头像签名 → 面板填 `SESSDATA` + `bili_jct`。
  - **写入姿势**（2026-10-30 复核修正）：`POST /save {"bili":{"sessdata":"…","biliJct":"…","cookie":"SESSDATA=…; bili_jct=…;"}}`。`POST /bili/account` **只是只读刷新，写不了 Cookie** —— 本文档早先写成「用 `/bili/account` 写入」是错的。
  - 现成脚本：`node D:\aaa_dsh_data_storage\tools\bili-login.mjs --sessdata "<SESSDATA>" --jct "<bili_jct>"`
    - 不给参数 = 打印怎么抄那两条；`--clear` = 清空回到「只能读」；会自动回读 `/bili/state` 报 `isLogin` 吓人还是成功。
  - **两个坑**：
    1. `canPost` 只代表「Cookie 串里有 `bili_jct`」，**不代表登录有效**。真判断看 `/bili/state` 的 `account.isLogin`：Cookie 填错会出现 `canPost:true` + `isLogin:false`（我填假值实测过，之后用 `null` 清干净）。
    2. 密钥类字段（`bili.cookie/sessdata/biliJct`、`heybox.cookie`、`snowluma.*Token`、`song.neteaseCookie`、`imageGen.apiKey`、`bridge.token`）在 `mergeFromPanel` 里 **空串 = 保留原值，只有 `null` 才清空**；`/state` 回传时这些值一律抹成 `''`，只给 `xxxSet`（有没有填）和 `xxxHint`（结尾 4 位）。所以别把 `/state` 里读到的空串当成「没配」。
  - 想让我**自动**从浏览器里抠这两条？可行，但有硬条件：Chrome / Edge 运行时会**独占锁住 `Cookies` 数据库**，实测 `[IO.File]::Open(..., FileShare.ReadWrite)` 也报「正由另一进程使用」→ 必须**先完全退出浏览器**，我才能拷出来解密（`Local State` 里 `encrypted_key` 是 DPAPI，可解）；
  - 不想关浏览器就手抄：F12 → Application → Cookies → `https://www.bilibili.com` → 复制 `SESSDATA`、`bili_jct` 两条值给我（**只进本机插件配置，不外传**）；
- `autoBrowse` 故意关着：开了她会每 4 小时自己刷 3 条视频，等于自动烧 token；想让她自己刷就打开；
- 工具随之出现：主人档多了 `bili_watch` / `bili_comment` / `qq_send_shot` / `qq_list_shots` / `bili_set_avatar` / `bili_set_sign`（owner 工具总数 20 → 28）。

### 5.7 刷抖音 ⚠️ 要扫码登录
- `browserPath` 已设为 `C:\Program Files\Google\Chrome\Application\chrome.exe`；
- 登录要走它自己的浏览器 profile：`POST /douyin/login` 打开窗口 → **你扫码** → `/douyin/login/status` 查；
- 现成脚本（推荐）：`node D:\aaa_dsh_data_storage\tools\douyin-login.mjs` —— 打开登录页、把二维码存成 `dsh-handover\douyin-qr.png`、每 3 秒盯一次状态，扫上了直接 `exit 0` 并打印账号名；`--wait 180` 改等多久，`--api` 换端口。
- 二维码会过期（约 1~2 分钟）：**过期了别只重跑** `douyin-login`，要用下面那个 `douyin-qr-refresh.mjs` 真刷新；
- **坑：二维码过期时「重跑 douyin-login」也可能拍到一张「二维码失效」的图**。原因在 `src/douyin/site.js:604 loginStart()`：它只「点右上角登录 → 等二维码元素 → 截图」，登录弹窗本来就开着的时候再点没用，元素还在、图还是过期的。
- 解法（新写，实测有效）：`node D:\aaa_dsh_data_storage\tools\douyin-qr-refresh.mjs` —— 挂到插件浏览器的 CDP 端口（`<edge-profile>\DevToolsActivePort`，由 `douyin\browser.js:144-173` 启动时写入）上，点「点击刷新」再 `Page.captureScreenshot` 截登录面板；输出 `二维码元素=true 仍显示失效=false` 就是真的刷新好了，退出码 2 = 还是失效。
- 二维码有效期约 1~2 分钟，扫之前**先跑一次刷新脚本**最稳。
- **扫上之后怎么开**（一键）：`node D:\aaa_dsh_data_storage\tools\douyin-enable.mjs` —— 先查登录态（没登上就 `exit 2` 并提示去扫码），登上了按**保守上限**开：`enabled:true`、`autoBrowse:true`、`intervalHours 4`、`maxRunsPerDay 2`、`perRun 3`、`maxWatchPerDay 20`、`caps{like:5, comment:1, share:2, atOwner:0}`、`gate{maxWritesPerDay:8}`、`shareTo:"qq"`。想用插件默认的激进档：加 `--caps-full`；只想看不想开：`--dry`。
  - 为什么默认这么保守：抖音的点赞/评论是**用你的号公开发出去**的，`atOwner:0` 保证她不会在评论区 @ 你；`shareTo:"qq"` 让「分享」只落在你们私聊里（要发到抖音私信得先核对你的抖音号，没核对也会自动改发 QQ）。
- 风控闸门已配好：`caps{like30,comment3,share5,atOwner3}`、`gate{maxWritesPerDay 40, minWriteGapSec 20, newAccountDays 3}`。

### 5.8 改资料 ✅（头像 + 签名都实测过）
- 私聊 full 档有 `qq_get_profile` / `qq_send_avatar` / `qq_set_nickname` / `qq_set_signature` / `qq_set_avatar`；
- 三个写接口都是**薄封装**（`src/modules/profile/index.js:143/157` + `:161` 起），底下直接调 NapCat 的同名动作：`set_qq_profile {nickname}`、`set_self_longnick {longNick}`、`set_qq_avatar {file:'base64://…'}`；
- **实测（2026-10-30）**：`set_self_longnick` → `{"status":"ok","retcode":0,"data":{"result":0,"errMsg":""}}`；回读 `get_stranger_info {user_id:1000000001}` → `nickname=大肥鱼`、`longNick=吃白饭的蓝色大肥鱼，一碗接一碗` ✅；
- 头像也换过并核对：`/avatar/upload` → `/avatar/sync-qq`，`q1.qlogo.cn/g?b=qq&nk=1000000001&s=640` 拿到的新图就是插件自带的 1272×1272 大肥鱼 chibi；
- 注意 `get_profile` 在 NapCat 上返回 `retcode 1404`（不支持），能用的读接口是 `get_login_info` / `get_stranger_info`。

### 5.9 按聊天选模型 ✅ 已配 + 单测过 + 两档都现场 ping 通
```
chatModels.privateDefault = yonyou / deepseek-v4.1-flash / low
chatModels.groupDefault   = yonyou / DeepSeek-V4-Pro / low
```
查找顺序：**这个私聊号 > 这个群号 > 私聊/群默认 > 全局**；模型在 DSH 里已不存在时自动退到全局（单测已验证四种情况）。想给某个群单独指定，写 `chatModels.groups['群号']`。

现场验证（2026-10-30 12:08，`POST /model/ping` 真调模型、不是看配置）：
- `yonyou / deepseek-v4.1-flash` → `ok=true`、985ms、回「在呢」（= 私聊默认档）
- `yonyou / DeepSeek-V4-Pro` → `ok=true`、1026ms、回「在呢」（= 群聊默认档）
- `GET /models` 里两个都在（都是 vision），所以不会出现"配了但模型不存在"的静默降级；
- `GET /commands` 实测 15 条内置命令 + 模块命令 `/rice`、`/ricebowl` 都挂上了（合计 17 条）。

### 5.10 模块热插拔 ✅ 现成例子「白米饭账本」
- 位置：`~\.dsh\plugins-data\aurabot\modules\rice\index.mjs`，**存盘即热重载**（按 mtime），插件升级不动它；
- 提供：命令 `/饭`（默认记一碗）、`/饭碗`（查账）、工具 `rice_log`（她自己记/查）、路由 `/aurabot/api/ext/rice/rice/today`、数据 `rice.json` 按天分桶留 60 天；
- 坑：`parseCommand` 会先用**中文别名前缀**匹配，所以「`/饭碗` 撞上 `/饭`」——注册顺序要把精确度高的放前面（这个模块已按此修好）。
- 内置 17 个模块都能单独开关（面板「扩展」页），也能 `fork` 成自己的改。

### 5.11 本地接口 ✅ 已用自写脚本接管 TTS + ASR
- 目录 `~\.dsh\plugins-data\aurabot\local\`；槽位 `tts.mjs` / `image.mjs` / `song-convert.mjs` / `asr.mjs`，开关是 `config.local.{tts,image,song,asr}`；
- **`tts.mjs` 现在说的是「本机训练出来的大肥鱼音色」**（GPT-SoVITS，v2Pro 底模 + `GPT_weights_v2Pro/dafeiyu-e10.ckpt` + `SoVITS_weights_v2Pro/dafeiyu_e8_s392.pth`）：
  - 链路：`tts.mjs` → `POST http://127.0.0.1:9880/tts`（`GPT-SoVITS/api_v2.py`）→ 返回 wav；参考音频固定用训练集那条 `GPT-SoVITS/dataset/dafeiyu-raw/dafeiyu-001.wav` + 它的原文 `第一次见你的我`（换参考音频音色就飘，别乱改）；`speed_factor 0.95`；
  - **服务没起来会自动退回 edge-tts 晓伊**（先 `log.warn` 一句 `GPT-SoVITS 没成（…），退回 edge-tts`），所以她不会哑；
  - 起服务：`D:\aaa_dsh_data_storage\napcat-bridge\启动-GPT-SoVITS.ps1`（`-Stop` 停，`-NoWait` 不等就绪；模型加载约 60～70 秒、吃 1.6 GB 内存）；参数在同目录 `tts-config.json`（`engine: 'gsv' | 'edge'`、`gsv.url`、`gsv.refAudio`、`gsv.promptText`、`gsv.speed`）；
  - 实测：`/local/test` → `念好了：…local-tts-<ts>.wav`，**534 KB / 9.8 秒**；同一条 wav 用 `{type:'record',data:{file:'base64://…'}}` 发给主人，网关 `retcode 0`（NapCat 自己转 silk），**QQ 里听到的就是她的音色**；
  - 坑：`Start-Process` 直接起 python 会挂在调用方的作业对象上 —— 调用方一结束（比如后台作业被终止）python 跟着死，现象是「端口刚才还在听，一测却 `ECONNREFUSED`」。脚本里改成 `cmd /c start` 彻底脱钩才对；
  - 旧的 edge-tts 通道保留作兜底：`pyenv` 里 `edge_tts`，音色 `zh-CN-XiaoyiNeural`、`-8%`；
- **本机已实现 `asr.mjs`**（听语音条）：调 `%USERPROFILE%\Aurabot\pyenv` 里的 **faster-whisper 1.2.1 + small 模型（CPU / int8，模型 463MB 在 `%USERPROFILE%\Aurabot\asr\models`）**，识别脚本 `%USERPROFILE%\Aurabot\asr\asr_cli.py`；
  - 解码不走 faster-whisper 自带的 `av`（py3.13 上会和 av 版本打架，报 `open() got an unexpected keyword argument 'metadata_errors'`），改成先用 ffmpeg 解成 16k 单声道 f32 裸流再用 numpy 喂模型；
  - 用 `initial_prompt` 喂了「大肥鱼 / 白米饭 / 主人主人」这些上下文，`大肥鱼` 不再被听成「大肥的生」；输出再用 `zhconv` 转简体；
  - 实测：真实 QQ 语音条 11 秒 → `主人,我是大肥鱼的蓝色鱼,听着还习惯吗?`（9.2 秒，含每次冷启动加载模型约 3～5 秒）；TTS 样本 → `主人你好,我是大肥鱼,今天中午想吃两大碗白米饭。`；
  - 走插件自己的 `local.call('asr', {file})` 通道复测通过（`active(asr)=true`、`status.last = 用时 9.2 秒`）；
- `/local/test` 验证 TTS：`28.3 KB mp3`、`用时 3.3 秒`（ASR 槽位没有单独试的按钮，面板提示「发条语音条试试」）；
- 想换 GPT-SoVITS / CosyVoice / Fish-Speech / FunASR，只改这两个文件，插件本体不用碰；
- 坑：`--rate=-8%` 必须写等号（`--rate -8%` 会被 argparse 当成选项）；插件 `local.js` 的 catch 里调了不存在的 `log.warn`，脚本报错会被吞成 `log.warn is not a function`——真因要到 `/local/status` 的 `last.message` 里看。

### 5.12 QQ 命令 / 工具 / 网关 / SnowLuma
- **内置命令**（只认主人）：`/help` `/silent [分钟]` `/active` `/quiet` `/chatty` `/normal` `/model` `/sing` `/status` `/mood` `/diary` `/remember` `/reset` `/on` `/off`；中文别名：闭嘴/安静/静音/说话/醒醒/少说/多说/正常/模型/唱/点歌/状态/心情/日记/记住/重开/开机/关机/帮助。
- **扩展命令**：`/饭`、`/饭碗`（白米饭账本模块）。
- **工具按会话注册**（已验证）：主人私聊 `full` = **37 个**（含 `qq_send_message`/`qq_send_file`/`qq_set_avatar`/`qq_send_qzone`/`qq_group_admin`/`qq_whitelist`/`bili_watch`/`bili_comment`/`qq_send_shot`…）；群聊/别人 `social` = **15 个**（表情 5 + 记忆 2 + `qq_chat_history`/`qq_group_admin`/`bili_watch`/`bili_comment`/`qq_send_shot`/`qq_list_shots`/`qq_song_cover`/`rice_log`），**`qq_send_message`/`qq_send_file`/`qq_set_*` 一个都不给**（她不能在群里冒名给别人发东西）。
- **网关**：`onebot`（NapCat WS）。SnowLuma 那条路**故意没装**：EULA §5.4 禁止自动部署，且它只是另一个 OneBot 实现，随时可换。
  - 三条闸门实测（2026-10-30，只读调用，没装任何东西）：`/state.snowluma` → `installed=false`、`reason="在 C:\Aurabot\snowluma 里没找到 index.mjs，请确认解压位置"`、`downloadPage=https://github.com/SnowLuma/SnowLuma/releases/latest`；`/snowluma/agreements` → `{ok:false, message:"还没在面板里填 SnowLuma 控制台密码"}`；`/snowluma/login-check` → `running=false`。`/snowluma/start` 不是下载器（没装就只回「没找到 index.mjs」），所以**不会偷偷装**。
- **语音识别（ASR）**：Aurabot 的 `transcribe()` 是三段式兜底 —— ①**本地接口 `asr.mjs`**（已用 faster-whisper 实现，见 §5.11）→ ②OneBot `fetch_ptt_text`（QQ 自己的语音转文字）→ ③DSH 的 `speechToText` 服务。
  - NapCat **实现了** `fetch_ptt_text`（`napcat.mjs` L33242 映射 / L74671 schema / L81075 `_handle` → `translatePtt2Text`），但本机这个号调它返回 `retcode 1200 获取语音转文字结果失败`（账号没这个服务）；
  - DSH 侧仍没有 `speechToText`：市面只有 `@deepseek-ai/dsh-experimental-speech-to-text*` 0.1.7-alpha.1，peer 是 `^0.1.7-alpha.1` 的核心包，强装会落第二套核心实例 —— **不装**；
  - 所以现在真正干活的是第①段：本地 faster-whisper。面板里 `/voice/asr-status` 仍会显示「DSH 里没有开启语音输入」，那说的是第③段，**不代表听不了语音**。

---

### 5.13 翻唱 🚧 引擎好了，只缺一个音色模型
- 引擎现状：`GET /song/status` → `install.ok=true message="装好了，用时 19 分钟"`，`parts` 六项全 true（`python/applio/separator/ffmpeg/weights/separatorModel`），`rootCheck.freeGB=43`；`song.enabled=true`、`maxVoiceSec=120`。
- 2026-10-30 12:34 我扫过整台机器找现成模型：`%USERPROFILE%\Aurabot\rvc` 递归 `.pth` 只有 `torchcrepe\assets\{full,tiny}.pth` 这类库文件，`models\` 是空的；`D:\aaa_dsh_data_storage\napcat-bridge\GPT-SoVITS\SoVITS_weights_v2Pro\dafeiyu_e8_s392.pth` 是 **SoVITS** 权重（给 TTS 用的），**RVC 用不了**（两套模型结构不同）。所以 `voices: []`、`ready: false` 是真的没素材，不是我漏配。
- **素材也不够**：现在能拿来训的只有 `D:\aaa_dsh_data_storage\napcat-bridge\GPT-SoVITS\dataset\dafeiyu-raw\` 里 **7 个 wav / 2.2 MB（约 2 分钟）**；RVC 一般要 10 分钟以上干净人声才像样，用这 2 分钟硬训只会更不像她。
- 两条补齐路径：
  1. **用已经装好的 Applio 自己训**（她有 10 分钟以上干净录音时）：`%USERPROFILE%\Aurabot\rvc\Applio\run-applio.bat`（或 `%USERPROFILE%\Aurabot\rvc\env\Scripts\python.exe %USERPROFILE%\Aurabot\rvc\Applio\app.py`）→ 浏览器 `http://127.0.0.1:6969`（`app.py:42 DEFAULT_PORT = 6969`）→ 训练页选数据集、采样率对齐、训完把 `*.pth`（大文件）拖进 Aurabot 面板「音色模型」或 `POST /song/import`。**CPU 训练会很久**（这机器没 GPU），建议先用 10 分钟素材试小步数。
  2. **直接给我一个你有权使用的 `.pth`**（别人训练的模型涉及授权，我不能替你下），丢进 `%USERPROFILE%\Aurabot\rvc\models\` 或面板导入即可，立刻可用。
- 补齐之后怎么验：`POST /song/request` 点歌 → 等它出 `<歌曲>.wav` → 用 `tools\test-voice-send.mjs` 那套方式发回 QQ 听。
## 6. 能力矩阵（现状）

| 能力 | 状态 | 证据 / 原因 |
|---|---|---|
| 收到 QQ 消息并回复 | ✅ | `/state.stats` = `received 2 / sent 10 / voice 1 / stickers 3 / errors 0`（2026-10-30 12:35 复核）；最近会话里能看到她那条「主人呀，我主人，还能有谁」 |
| 发语音 | ✅ | **本机训练的大肥鱼音色**（GPT-SoVITS v2Pro `dafeiyu-e10`+`dafeiyu_e8_s392`）；服务没起时自动退回 edge-tts 晓伊 |
| 空间说说 | ✅ | 10:37 发过一条，`tid 3ce7d695da02e46ac6730700`，配图是表情库里那张 |
| 主动搭话 | ✅ | 手动 `/speakup/fire` 触发过，日志 `主动搭话（手动）` |
| 记忆 / 小档案 / 每日整理 | ✅ | 11 条 + 1 份小档案；`lastConsolidate` 有记录 |
| 扩展模块 | ✅ | `rice` 模块 `running=user`，命令/工具/路由全通 |
| 本地接口 | ✅ | `tts`/`asr` 槽位 `active=true`；`/local/test` 出 534KB wav（她的音色，9.8 秒） |
| 按聊天选模型 | ✅ | 配置已写 + 单测四例 + `POST /model/ping` 两档实调：`yonyou/deepseek-v4.1-flash` 985ms「在呢」、`yonyou/DeepSeek-V4-Pro` 1026ms「在呢」 |
| 换头像 / 改资料 | ✅ | 2026-10-30 11:1x 用插件自带的 `assets/dafeiyu.jpg`（1272² 大肥鱼 chibi）走了 `/avatar/upload` → `/avatar/sync-qq`，从 `q1.qlogo.cn` 拉回来核对过，640² 新头像已生效。改签名也实测过：`set_self_longnick` → `retcode 0`，回读 `longNick=吃白饭的蓝色大肥鱼，一碗接一碗`（NapCat 直接支持 `set_qq_profile`/`set_self_longnick`，插件 `src/modules/profile/index.js:143/157` 是薄封装，**不依赖 SnowLuma**） |
| 群聊 / 群管 / 群内插话 | ⚠️ | 账号**没有群**（`get_group_list` 返回 `[]`）。逻辑层已单测：白名单闸门（私聊只放主人或 `allow.private`、群只放 `allow.groups`）+ **群回复决策 11 个用例全对**（被 @ / 叫「大肥鱼」/ 叫「肥鱼」/ 引用她的消息 → `must`；相关度高 → `interject`；不相关 / 群里没在聊 / 静默时段 / 冷却中 / 刚说太多 → `none`）；只差一个真群 |
| 心情 | ✅ | `createMood` 单测：`nudge(+6)` 65→80（心情不错）、`nudge(-12)` →68（平平常常）、`observe("今天好想你呀")` 74；`effects` 会影响表情/语音频率与回复快慢。（顺手把线上的心情值从 65 试到 68，无副作用） |
| B站 | ✅ 看 / ⚠️ 发 | 匿名实测通：热门 20 条、`view` 出标题/UP/播放/时长、热评、搜索都正常；`vision.ready=true`（ffmpeg 9.0.2）。发评论/点赞仍需 `SESSDATA`+`bili_jct`。`autoBrowse` 故意关着（开了每 4 小时自动刷 3 条，烧 token） |
| 抖音 | ⚠️ | 要扫码登录：`douyin.browserPath` 已指 Chrome、浏览器常驻、`/douyin/login` 能出图、`douyin-qr-refresh.mjs` 能真刷新，只差手机扫一下 |
| 小黑盒 | ✅ 读 / ⚠️ 写 | **不用 Cookie 就能读**（2026-10-30 实测）：`GET /heybox/hot` 回「黑盒热议」10 条（Viper采访爆雷、TES 2:1 胜 BLG…）；`heybox_search{query:"影之刃零"}` 回 8 条（《影之刃零》3DM评测10分…）；`/heybox/topics` 回盒友杂谈/数码硬件/AI。点赞/评论/发帖才要 `pkey`+`x_xhh_tokenid`（`heybox\api.js:167` 写操作无 cookie 直接抛「写操作需要登录」）。模块已开、`autoBrowse:false`（不自动逛，省 token） |
| 翻唱 | ⚠️ | **引擎已装好**（2026-10-30 11:12，用时 19 分钟，`python/applio/separator/ffmpeg/weights/separatorModel` 全 true，模块已开），**只缺你自己有权使用的 `.pth` 音色模型** | 2026-10-30 12:34 复查过整台机：`%USERPROFILE%\Aurabot\rvc` 递归 `.pth` 只有 `torchcrepe\assets\{full,tiny}.pth`（库自带权重的无关文件），`GPT-SoVITS\SoVITS_weights_v2Pro\dafeiyu_e8_s392.pth` 是 **SoVITS** 权重、RVC 用不了 ⇒ 确实得你给/训一个。
| 表情包库 | ✅ | **7 张**（从 `dsh-pet` 的 meme 资产批量导入：吃白饭的大肥鱼/可爱/吃饱饱摸肚子/压力/厉害了我的鲸/哦鲸鲸）+ 原来的「太难听了」= **7 张**；`stickers.collect: true` 你在私聊里发的图她也会自己收 |
| QQ 命令 | ✅ | 解析层单测通过：`/status /silent 30 /quiet /chatty /normal /model 2 /sing 小幸运 田馥甄 +12 /remember /mood /diary /reset /on /off /help` + 中文别名（`/闭嘴 /记住我不吃香菜 /饭 /饭碗`）全部正确命中，模块命令优先级也对。**注意**：`/modules/simulate` 里内置命令只回「模拟里不执行」——它们会真改设置，别拿 simulate 当沙盒 |
| 记忆检索 | ✅ | `/modules/tool recall_memory{query:"主人 主人 声音"}` 捞回了「主人是主人」「拒绝叫爸爸」「嫌合成音」「要夏茉声音但链接打不开」四条 |
| 逛别人的空间 | ❌ | NapCat **不支持 `get_qzone_msg_list`**（只有发送和删除），模块已关 |
| 语音识别（听你的语音条） | ✅ | 本地接口 `asr.mjs` + faster-whisper small（CPU int8，模型 463MB）。真实 QQ 语音条 11 秒 → `主人,我是大肥鱼的蓝色鱼,听着还习惯吗?`，全程 9.2 秒；走插件 `local.call('asr')` 复测通过。DSH 的 `speechToText` 仍然没有，但已经不需要它了（§5.12） |

---

## 7. 排障

| 症状 | 先看 | 常见原因 / 处置 |
|---|---|---|
| 她不回话 | `/state.onebot.state` | `disconnected` → NapCat 没起来（§3）；`connected` 但没动静 → 总开关 `enabled`、`dryRun`、`/state.allow`（私聊白名单为空时只认主人） |
| 一句话回两遍 | 3001 上有几个 Established | 旧桥又跑起来了：`Get-CimInstance Win32_Process` 找 `--profile qqbot` 杀掉；别用 `start.ps1`。新看门狗会主动清掉它，但日志里能看到 `已清掉旧桥宿主` |
| 看门狗死没死 | `napcat-bridge\logs\watchdog-<日期>.log` | 正常每 10 分钟一条「心跳」；没心跳就 `Get-ScheduledTask DshQqWatchdog` 看状态、`Start-ScheduledTask DshQqWatchdog` 重拉；注意 `watchdog.lock` 里的 PID 必须是活的，死了会自动接管 |
| 看门狗弹黑窗 | 计划任务 Action | 只允许走 `wscript.exe watchdog-hidden.vbs`（`Run(...,0,False)`）。如果谁把 Action 改成直接跑 powershell，就会闪窗口 |
| `⚠️ agent has no provider/model` | DSH 里的 provider | `yonyou` 的转发器（19300）没起，或者 `/state` 里的 model/chatModels 指向了不存在的模型 |
| 回复很慢 | `merge` 配置 + 心情 | 私聊会等 2.5 秒合并（上限 8 秒）；`model.reasoningEffort` 是 `low` 就别指望秒回 |
| 日志看不懂 / 一片乱码 | `logs\aurabot-YYYY-MM-DD.log` | 是 UTF-8：`Get-Content -Encoding UTF8`；**日志行里会夹巨大 base64**，用 `Select-String` 过滤，别整段打印 |
| 面板 API 打不开 | DSH 端口 | 端口每次启动都变，从 DSH 窗口/日志拿；`/aurabot/api/state` 是健康检查 |
| 语音变成机械音 | 看插件日志 `GPT-SoVITS 没成（…）` | 那是一句话：音色服务没起/刚被杀 → 跑 `启动-GPT-SoVITS.ps1`；`fetch failed` = 9880 没人听 |
| 表情发不出来 | `/stickers` | 她只会发库里有的；标签对不上就跳过（日志 `没找到「xx」这张表情`） |

**回退到旧方案**（一切照 README §6.3）：
```powershell
D:\aaa_dsh_data_storage\napcat-bridge\start.ps1      # 会起 NapCat + dsh --profile qqbot
# 同时在 DSH 面板里把 Aurabot 总开关关掉，否则两个客户端抢 3001
```
配置快照：`undo_list` 里 `20261030-101052-ca6b`（装 Aurabot 之前，6 个文件）。

---

## 8. NapCat 的老坑（没变，照旧）

- 掉线/换号要在 WebUI 扫码：`http://127.0.0.1:6099/webui?token=910c14be34b8`；
- 它 hook 的是本机 QQNT，客户端升级可能要重装；
- 违反腾讯 ToS，**用小号**（现在这个 1000000001 是常用号，风险自担）；
- `EPERM ... mkdir NapCat\temp` → `cmd /c "icacls "D:\aaa_dsh_data_storage" /setintegritylevel M /T /C /Q"`。

---

## 9. 下一步（按价值排序）

1. ~~给一张大肥鱼头像图~~ → **已换成插件自带的大肥鱼 chibi**（11:15，`q1.qlogo.cn` 上确认生效）。想换梗图版说一声（「吃白饭的大肥鱼」已在表情库里，一条 `POST /avatar/upload` 就换）；
2. ~~表情库从 1 张长起来~~ → 已长到 7 张（`dsh-pet` 的 meme 资产 + 你发的「太难听了」），你在私聊里发图她也会自己收（上限 300）；
3. ~~B站 Cookie 才能用~~ → **看视频/搜/读热评其实不用登录**（已实测），`bili.enabled` 已开；只差 `SESSDATA`+`bili_jct` 才能**发评论、点赞**。现在一条命令就能灌：`node tools\bili-login.mjs --sessdata "<…>" --jct "<…>"`（不给参数它会把怎么抄讲一遍）；
4. **抖音扫码** → 一条命令出码：`node tools\douyin-login.mjs`（二维码存 `dsh-handover\douyin-qr.png`，扫上自动 `exit 0`），扫完跟我说一声，我把 `douyin.enabled` 打开；
5. **翻唱**：引擎已经装好了（19 分钟跑完），只差一个你有权使用的 `.pth`（夏茉.那个音色得自己训/RVC 制作，别人的模型不能用）→ 面板「翻唱」页 `/song/import` 导入即可；
6. **拉她进一个群** → 群聊那套（唤醒、插话、群管、零本地工具）才有得验；
7. ~~ASR 等 DSH 官方~~ → **已用本地 faster-whisper 自己实现**（§5.11）；想更准可以换 `medium` 模型或接 FunASR，只改 `asr_cli.py`。

---

## 10. 这一轮改过的东西（便于回溯）

- 装插件：`dsh plugin --profile desktop add github:accomplish07zrh-eng/dsh-aurabot-qq`（→ 1.1.22）
- 装语音组件：`POST /voice/install`（建了 `%USERPROFILE%\Aurabot\pyenv`）
- 装 ffmpeg 9.0.2（winget 失败 → GitHub 直下）
- 装翻唱引擎：`POST /song/install`（19 分钟，`python/applio/separator/ffmpeg/weights/separatorModel` 六项全 true）
- 写/改：`local\tts.mjs`（**改成优先调本机 GPT-SoVITS 她的音色，服务不在就退回 edge-tts**）、`local\tts-config.json`、`local\asr.mjs`（本地 ASR 接管）、`%USERPROFILE%\Aurabot\asr\asr_cli.py`（faster-whisper）、`modules\rice\index.mjs`（白米饭账本）、`napcat-bridge\启动-NapCat.ps1`、`napcat-bridge\启动-GPT-SoVITS.ps1`（起/停音色服务，`cmd /c start` 脱钩）、`napcat-bridge\tools\onebot-call.mjs`、`tools\test-local-asr.mjs`、`tools\test-bili-anon.mjs`、(`tools\\test-voice-send.mjs`（把 wav 当 QQ 语音发出去验证）)、`tools\\aurabot-selfcheck.mjs`（25 项只读自检）、`tools\\douyin-login.mjs`（出二维码+盯登录）、`tools\\bili-login.mjs`（灌 SESSDATA/bili_jct 并回读验证）
- 音色：把 GPT-SoVITS 训练好的 `dafeiyu-e10`/`dafeiyu_e8_s392` 接进插件；实测 `/local/test` → 534KB wav / 9.8 秒，且以 QQ 语音条形式发出成功（`retcode 0`）
- ASR：`pip install faster-whisper` 进 `pyenv`（+`ctranslate2 4.8.4`、`zhconv`），下载 small 模型 463MB 到 `%USERPROFILE%\Aurabot\asr\models`（走 `hf-mirror.com` 镜像）；B站：`bili.enabled/vision` 打开、`autoBrowse` 保持关
- 记忆迁移 10 条 + 小档案；**表情入库 7 张**（6 张 `dsh-pet` meme + 「太难听了」）；`chatModels` 已配；`douyin.browserPath` 已配；**QQ 头像已换成大肥鱼**（`/avatar/upload` → `/avatar/sync-qq`）
- 关掉：`qzoneSocial`（NapCat 不支持）、旧 `qqbot` 桥进程
- **重写 `napcat-bridge\watchdog.ps1`（2026-10-30 13:10）**：从「保活旧 qqbot 桥」改成「保活 NapCat + 清理旧桥」；加了心跳日志（每 10 分钟一条）、`-Status` 体检模式、锁文件死实例自动接管；旧的滞留实例（PID 19260，10:17 起跑老代码）连同它拉起来的旧桥宿主（PID 35560）一起清掉
- 已单测/接口验证：QQ 命令解析（15 条 + 中文别名 + 模块命令优先级）、记忆检索 `recall_memory`、白名单闸门 `checkAllowed`、群回复决策 `decideGroupReply`（11 用例）、心情 `createMood`（nudge/observe/label/effects）、按会话工具分级、回复分段、模块热插拔/重载、本地接口 `/local/test`（TTS）、本地接口 ASR（真实 QQ 语音条 9.2 秒）、B站匿名读（热门/播放页/热评/搜索）、空间日记、主动搭话、端到端收发


---

## 11. 验收证据表（谁验的、怎么验的、看到什么）

> 说明：全部证据都是在本机**跑出来的输出**，不是"按文档应该能行"。时间统一 2026-10-30。想自己复验，命令列那一列直接抄。

| 能力 | 验收命令 / 手法 | 看到的输出 | 结论 |
| --- | --- | --- | --- |
| 网关连接 | `Invoke-RestMethod "$api/state"` | `onebot.state=connected`、`login.uin=1000000001` | ✅ |
| 端到端收发 | `/state.stats` + `get_recent_contact` | `received=1 sent=10 voice=1 stickers=2 errors=0`；成功发出语音条 | ✅ |
| 人格注入 | 插件 `cordis.patch.yml` + `/state.persona` | 两个 preset（`aurabot-private`/`aurabot-social`）都挂 `@deepseek-ai/dsh-persona`，变量 `{{aurabot_persona}}` | ✅ |
| 每轮上下文 | 读 `src/chat/hub.js:346-359` + `/state.sessions` | `agent.ctx.systemPrompt.context({name:'aurabot-context',order:905,text:()=>…})` 每轮求值；`private:1000000002 → session-2a495c11…` 一直复用 | ✅ |
| 工作区落位 | `~\.dsh\storages\workspace.json` + 会话 projcache | `"path": "%USERPROFILE%\\Aurabot\\qq-chats"`、`"title": "Aurabot · QQ"`；`session-2a495c11….json` 的 `"cwd"` 同路径；目录本身为空（不按聊天建子目录） | ✅ |
| 群聊上下文 | `node tools/check-group.mjs` | `这个号在 0 个群里` | ⚠️ 无群可验 |
| 记忆 + 迁移 | `POST /memory/import` → `/memory/import/commit` → `/memories` | `存进记忆库 10 条`（主人/QQ/主人关系/头像/唱歌跑调/夏茉真音…） | ✅ |
| 记忆检索 | `recall_memory`（工具级） | 命中带相关度的记忆条目 | ✅ |
| 心情 | `src/modules/mood` 单测 + `/state.mood` | 65→`observe("今天好想你呀")`→74→`nudge(+6)`→80→`nudge(-12)`→68 | ✅ |
| B站（读） | `tools/test-bili-anon.mjs`（无 Cookie） | `popular` 20 条、`view` 938536 播放、`comments` 3 条、`search` 3 条 | ✅ |
| B站（写） | `tools/bili-login.mjs`（假值→清空全流程跑通） | 写 `/save` 成功；假 Cookie → `canPost:true` 但 `account.isLogin:false`；`--clear` 后 `cookieSet:false`、`canPost:false` | ⚠️ 需你的 Cookie |
| 抖音 | `tools/douyin-login.mjs`（= `/douyin/login` + 存图 + 轮询状态） | 二维码已存 `dsh-handover\douyin-qr.png`；`loggedIn=false`、`browserOpen=true`，超时 `exit 2` | ⚠️ 需扫码 |
| 改资料 | `set_self_longnick` → `get_stranger_info` | `retcode 0`；回读 `longNick=吃白饭的蓝色大肥鱼，一碗接一碗` | ✅ |
| 看门狗保活 | 计划任务 `DshQqWatchdog` + `watchdog.ps1` | 2026-10-30 13:09:53 起单实例 `PID=32488`、`MainWindowHandle=0`（无窗口）、`watchdog.lock=32488`；日志无异常；旧桥 `--profile qqbot` 为 0 个；同一时刻 `/onebot/test` → `连上了：甯（1000000001）` | ✅ |
| 换头像 | `/avatar/upload` → `/avatar/sync-qq` → `q1.qlogo.cn` | 640×640 已是新图，`avatar.custom=true` | ✅ |
| 按聊天选模型 | `src/chat/chat-model.js` 单测 4 例 + `POST /model/ping` ×2 | 四例全对；`yonyou/deepseek-v4.1-flash` 985ms「在呢」、`yonyou/DeepSeek-V4-Pro` 1026ms「在呢」 | ✅ |
| 模块热插拔 | `/modules/create` → 改写 → `/modules/reload` → `/modules/simulate` | `/ricebowl` → `今天吃了 4 碗白米饭` | ✅ |
| 本地接口 TTS | `/local/template` → 改脚本 → `/save` → `/local/test` | 534 KB wav / 9.8 秒（GPT-SoVITS 音色）；停服退回 mp3 | ✅ |
| 本地接口 ASR | `tools/test-local-asr.mjs` + 真实语音条 | `{"text":"主人你好,我是大肥鱼…"}`、`用时 9.2 秒` | ✅ |
| QQ 命令 | `src/chat/commands.js` 单测 | 15 条内置 + 中文别名 + 模块命令优先级全对 | ✅ |
| 工具分级 | `GET /modules/tools?as=owner` / `as=other&kind=group` | owner 37 个、群/他人 15 个（无 `qq_send_message`） | ✅ |
| 回复分段 | `/modules/simulate` | 私聊拆 2 条、群聊 1 条 | ✅ |
| 空间日记 | `/diary/run` + NapCat `send_qzone_msg` | `发了一条说说（所有人可见，tid 3ce7d695…）` | ✅ |
| 逛别人空间 | `get_qzone_msg_list` | `不支持的API` | ❌ NapCat 不支持 |
| 主动搭话 | `/speakup/fire` + `/purpose/preview` | 生成动机素材 8 条、选中「想找主人说说话」、真发了 | ✅ |
| 翻唱 | `/song/status` | 六项 parts 全 true，`ready=false`、`voices=[]` | ⚠️ 缺 `.pth` |
| 小黑盒 | `GET /heybox/hot` + `/modules/tool` 跑 `heybox_search` | 热搜 10 条 / 搜「影之刃零」8 条，全程无 Cookie | ✅ 读 |
| 表情包 | `/sticker/upload` ×7 + `/stickers` | 7 张，`qq_faces`/`qq_mface` 可用 | ✅ |
| 群聊决策 | `src/chat/group-policy.js` 11 用例 | 被@/叫名字/引用→must，相关 0.8/0.6→interject，静默/冷却/没在聊→none | ✅（逻辑层） |

**仍未闭合的 4 项，全部卡在"需要你本人"**：抖音扫码、B站 Cookie（发评论用）、翻唱 `.pth` 音色、拉她进群。


---

## 12. 一键自检（新写，随时可跑）

```powershell
# 最省事：什么都不带
& '%USERPROFILE%\AppData\Local\Programs\DeepSeek Harness\resources\runtime\primary-runtime\dependencies\node\bin\node.exe' `
  D:\aaa_dsh_data_storage\tools\aurabot-selfcheck.mjs

# DSH 端口换了就显式指定；想要 JSON 给程序读就加 --json
node tools\aurabot-selfcheck.mjs --api http://127.0.0.1:62707/aurabot/api --ws ws://127.0.0.1:3001 --tts-port 9880 --json
```

它**只读**，不改配置；✅ 全绿说明链路都好，❌ 有问题时退出码是 1（可以挂到计划任务里当巡检）。共 25 项，覆盖：

| 分组 | 检查内容 |
| --- | --- |
| 面板 | `/state` 通不通、总开关、试运行、初始化、全局模型、分档模型 |
| QQ | 网关 `connected` + 登录号、收发/语音/表情计数、好友数、群数 |
| 人格 / 记忆 | `config.persona.current`、会话是否复用（`/state.sessions`） |
| 内容侧 | 表情库张数、头像是否自定义、心情值、空间日记下次时间、主动搭话下次时间 |
| 能力 | B站（能不能写）、抖音（登没登）、小黑盒、翻唱（六件套 + 有没有音色） |
| 本地接口 | `tts`/`asr` 的 `active`、最近一次调用信息 |
| 外部服务 | NapCat WS 直连 `get_login_info`、GPT-SoVITS 9880 端口探活（TCP，不发业务请求） |

实测输出（2026-10-30 12:35 复跑，仍是 **✅ 20 / ⚠️ 5 / ❌ 0**）：五个 ⚠️ 正好就是待办里那几项（B站缺 cookie、抖音没扫码、翻唱缺 `.pth`、群里没群、全局模型跟随默认）；同一次里看到 `received 2 / sent 10 / voice 1 / stickers 3 / errors 0`，说明真 QQ 聊天又跑通了几轮。

写这个脚本时踩到的字段坑（以后调 API 别再猜）：
- `/bili/state`、`/heybox/state` 里**没有 `enabled`** 字段，开关在 `/state.config.bili.enabled`；
- `/diary.next` 是 `"15:12"` 这种**纯时间字符串**，不是时间戳（`new Date()` 会得到 Invalid Date）；
- `/local/status` 的数据在 `list[]` 里（每项 `slot/exists/enabled/active/last`），不是按槽位名的对象；
- 人格在 `config.persona.current`，不是顶层 `persona`；
- GPT-SoVITS 的 `api_v2` 只吃 `POST /tts`，`GET /tts` 会 500 —— 探活用 TCP 连端口最稳。
- `/state` 里**密钥字段永远读不到原文**：`publicConfig()` 把它们抹成 `''`，另给 `xxxSet`（有没有填）和 `xxxHint`（结尾 4 位）；而 `/save` 时**空串 = 保留原值，只有 `null` 才清空**（`src/core/config.js` `mergeFromPanel`）。想判断「配没配」看 `xxxSet`，想清空传 `null`。

### 12.1 五个「你只需要配合一下」的助手脚本

| 脚本 | 干什么 | 用法 | 现在的状态 |
| --- | --- | --- | --- |
| `tools\douyin-login.mjs` | 开抖音登录页、把二维码存成 `dsh-handover\douyin-qr.png`、每 3 秒盯登录状态 | `node tools\douyin-login.mjs`（`--wait 180`、`--api …`） | 已验证：出图成功、未登录时 `loggedIn=false`、超时 `exit 2`；**等手机扫码** |
| `tools\bili-login.mjs` | 把 `SESSDATA` + `bili_jct` 写进配置并当场回读验证 | `node tools\bili-login.mjs --sessdata "…" --jct "…"`；不带参数看怎么抄；`--clear` 清空 | 已验证写入/清空全链路（用假值跑过：`canPost:true` 但 `isLogin:false`，说明 `canPost` 不可信）；**等你抄两条 Cookie** |
| `tools\douyin-qr-refresh.mjs` | 二维码过期时**真点「点击刷新」**再截图（CDP 直连插件浏览器） | `node tools\douyin-qr-refresh.mjs` | 已验证：`刷新按钮：clicked` → `仍显示失效=false`，截到干净二维码 |
| `tools\douyin-enable.mjs` | 扫上后一键开张（保守上限），没登上就 `exit 2` | `node tools\douyin-enable.mjs`（`--caps-full` 激进、`--dry` 只看） | 已验证未登录分支：`loggedIn=false` → `exit 2`；开张分支等扫码后跑 |
| `tools\douyin-qr-keepalive.mjs` | 二维码保鲜：没登录就每 45 秒重刷一次，刷到登上了自动退出（`--max` 控制次数） | `node tools\douyin-qr-keepalive.mjs --max 10` | 实测：10 轮每轮都刷出干净新码、8 分钟后仍未登录 → `exit 2`；**登录成功分支还没跑过**（等你扫）|

这些脚本都只做「把面板按钮点一遍」的事，没有任何隐藏写操作；退出码 0 = 成了，2 = 还没好（可重跑），1 = 面板端口不对。

