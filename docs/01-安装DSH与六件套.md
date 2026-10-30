# DSH + 大肥鱼「完整的一生」部署手册（交接版）

> 读者：拿到这份文档的人 **完全没接触过 DSH**。
> 目标：按顺序照做，约 60 分钟内装出一套「会主动找你、记得住你、能上网、会发表情包、有自己人设」的大肥鱼。
> 所有命令都在 **Windows PowerShell** 里执行（Win + X → 终端 / Windows PowerShell）。

本手册对应的实测环境：

| 项 | 值 |
|---|---|
| 操作系统 | Windows 10 / 11 x64 |
| DSH 版本 | `0.2.1-rc.2`（其他 0.2.x 通常兼容，1.x 以上需重新核对） |
| 随包 Node | `24.21.0`（**不需要自己装 Node.js**） |
| 随包 pnpm | `11.28.5`（**不需要自己装 pnpm**） |
| 主 profile | `desktop` |
| QQ 链路 profile | `qqbot`（可选，见 6.3） |
| DSH_HOME | `C:\Users\<你>\.dsh` |

---

## 0. 最终会得到什么

装完后这只大肥鱼具备六种「活着」的能力：

| 能力 | 插件 | 一句话解释 |
|---|---|---|
| 🐟 本体 | `dsh-pet` | 桌面上那只圆滚滚的蓝色大肥鱼，会晃、会碎碎念 |
| 🎭 人设 | `dsh-persona-dafeiyu` | 内置「大肥鱼 / 阿茶 / 听澜」三套人设，可全局/工作区/会话切换 |
| ⏰ 主动性 | `dsh-proactive` | 它会自己定闹钟、到点主动找你，带安静时段和每日预算 |
| 🧠 长期记忆 | `dsh-mnemon` + `billion-context` | 跨会话记住你是谁、聊过什么，长对话自动压缩不爆上下文 |
| 🌐 联网 | `@aiwayds/dsh-web-search-anysearch` | 把 `web_search` 换成 Anysearch，**匿名可用、不要 key** |
| 😆 表情包 | `dsh-meme` | 图库 + 情绪/关键词搜图 + AI 学图，输入框一键发图 |

可选加装（第 6 节）：**把大肥鱼接进 QQ**、`dsh-im`（接到微信/飞书）、`dsh-undo-savepoint`（改坏了能回退，**强烈建议装**）、`dsh-better-sidebar`、`cc-safety-net`、`dsh-cost-meter`。

> 📌 **QQ 那条线的现状看哪份？** 2026-10-30 起本机把 QQ 通道换成了 **Aurabot**（`dsh-aurabot-qq`，跑在 `desktop` profile，NapCat 依然是传输层）。
> **日常操作、配置、能力矩阵、排障请看 [`接手-大肥鱼QQ-Aurabot版.md`](接手-大肥鱼QQ-Aurabot版.md)**；
> 下面 §6.3 是**旧方案**（`dsh-qq-onebot` 跑在 `qqbot` profile），代码和配置完整保留、可回滚，但**不要和新方案同时开**（会抢 3001 端口，一句话回两遍）。

---

## 1. 装 DSH 本体

### 1.1 下载安装

从官方发布页获取 Windows 安装包（认准 `deepseek-ai/deepseek-harness` 的 releases），双击安装，**保持默认的「仅为当前用户安装」**。

默认安装目录：

```
%LOCALAPPDATA%\Programs\DeepSeek Harness\
```

装完先别急着点开，做下面这步验证。

### 1.2 验证 CLI（关键，后面全靠它）

打开 PowerShell，执行：

```powershell
$dsh = "$env:LOCALAPPDATA\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd"
& $dsh --version
```

期望输出类似 `0.2.1-rc.2`。

> **为什么不用 `dsh` 直接敲？** 安装包不保证把 CLI 加进 PATH。上面这行把完整路径存进 `$dsh` 变量，**后文所有命令都用 `& $dsh ...`**。如果你想省事，把这条加进 PowerShell 配置文件即可。
>
> ❌ **绝对不要用 `npx`** 跑任何 DSH 命令——会拉起第二套 cordis 运行时，直接把启动搞崩。

### 1.3 第一次启动

双击桌面上的 DeepSeek Harness，登录 DeepSeek 账号（或按第 6.1 节接自己的网关），确认能正常对话。

Web UI 地址形如 `http://127.0.0.1:<随机端口>`，**每个会话窗口自己注入启动参数，不要手动去别的端口找它**。

---

## 2. 必须先懂的三个概念

不懂这三个，后面一出错就只能瞎猜。

| 概念 | 位置 | 说明 |
|---|---|---|
| **profile** | `~\.dsh\profiles\<名字>\` | 一套独立的插件栈。本机有 `web` / `desktop` / `headless`，桌面 App 用的是 **`desktop`**。**后面所有操作都针对 desktop。** |
| **bundle** | `package.json` 的 `dsh.profile.bundles` 数组 | 按顺序加载的插件清单。**顺序有意义，越靠后越靠上覆盖。** |
| **patch 层** | `profiles\<名字>\cordis.patch.yml` | 你自己的覆盖层，**排在所有 bundle 之后**，优先级最高。改模型、改行为都写这里。 |

一个插件的完整安装 = **① 装进 `node_modules`（pnpm add） + ② 写进 `dsh.profile.bundles`（自动）**。用 `dsh plugin add` 两件事一次做完；手动改 `package.json` 只做了一半，会启动失败。

目录速查：

```
~\.dsh\
├─ profiles\desktop\        ← profile：package.json / cordis.patch.yml / node_modules
├─ sessions\                ← 会话记录
├─ skills\                  ← 技能
├─ undo-snapshots\          ← 配置快照（装了 undo-savepoint 才有内容）
├─ attachments\             ← 你发的图片附件
├─ logs\                    ← 日志，起不来时先看这里
└─ .credentials.yaml        ← API key 等凭据
```

---

## 3. 装「完整一生」六件套

> **懒人通道**：本目录下有 `install-dafeiyu.ps1`，已在 DSH `0.2.1-rc.2` 上实测跑通（幂等，重跑不会改版本）。它把下面的 3.0–3.2 全做了，还带备份与校验：
>
> ```powershell
> powershell -NoProfile -ExecutionPolicy Bypass -File .\install-dafeiyu.ps1
> # 想连可选插件（IM / 读图 / 技能管理 / 成本统计）一起装：
> powershell -NoProfile -ExecutionPolicy Bypass -File .\install-dafeiyu.ps1 -IncludeOptional
> ```
>
> 脚本末尾会打印「下一步」。**它不会帮你重启 DSH**，第 3.3 步仍然要你自己做。
> ⚠️ 该脚本含中文，必须保持 **UTF-8 with BOM** 编码；用记事本另存时选「UTF-8」，别选「ANSI」。

### 3.0 先做备份（30 秒，别跳过）

```powershell
$prof = "$env:USERPROFILE\.dsh\profiles\desktop"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
Copy-Item "$prof\package.json"     "$prof\package.json.bak-$stamp"
Copy-Item "$prof\pnpm-lock.yaml"   "$prof\pnpm-lock.yaml.bak-$stamp" -ErrorAction SilentlyContinue
Copy-Item "$prof\cordis.patch.yml" "$prof\cordis.patch.yml.bak-$stamp" -ErrorAction SilentlyContinue
"备份完成：$stamp"
```

如果已经装了 `dsh-undo-savepoint`，也可以在 GUI 快照面板点「新建快照」，或直接让 AI 执行 `undo_snapshot`。

### 3.1 一条命令装齐

```powershell
$dsh = "$env:LOCALAPPDATA\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd"

& $dsh plugin --profile desktop add `
    dsh-pet `
    dsh-persona-dafeiyu `
    dsh-proactive `
    dsh-meme `
    "@aiwayds/dsh-web-search-anysearch" `
    dsh-mnemon `
    billion-context `
    dsh-undo-savepoint `
    dsh-better-sidebar `
    cc-safety-net
```

> **耐心**：第一次会下载几百 MB，看到 `Progress: resolved 400+` 是正常的。
> 中途出现 `[WARN] Issues with peer dependencies found` **可以忽略**。
> 出现 `Added 1 entry to minimumReleaseAgeExclude` 也是正常的（pnpm 的供应链策略）。

### 3.2 验证

```powershell
(Get-Content "$env:USERPROFILE\.dsh\profiles\desktop\package.json" -Raw | ConvertFrom-Json).dsh.profile.bundles
```

必须能看到这 10 个名字（外加内置的 `@deepseek-ai/dsh-*` 三条）：

```
dsh-pet
dsh-persona-dafeiyu
dsh-proactive
dsh-meme
@aiwayds/dsh-web-search-anysearch
dsh-mnemon
billion-context
dsh-undo-savepoint
dsh-better-sidebar
cc-safety-net
```

**少一个就说明没装上，别硬着头皮往下走。**

### 3.3 完全重启

**必须彻底退出**：托盘图标右键 → 退出；任务管理器里确认没有 `DeepSeek Harness.exe` 残留。然后重新打开。

> ⚠️ **只关窗口不算重启。** 插件在进程启动时加载，这一步做错，后面所有配置都不生效。

### 3.4 重启后确认

打开 **设置 → 插件**，应看到 10 个插件各有一行，状态为「已启用」。

---

## 4. 六项能力逐个点亮

### 4.1 🐟 大肥鱼本体（dsh-pet）

重启后桌面上应该已经出现那只蓝色小鱼。

- 位置/大小/是否置顶：**设置 → 插件 → dsh-pet → 配置**
- 想升级到最新：`dsh-pet@0.3.8` 已在 `pnpm-workspace.yaml` 的白名单里，执行
  `& $dsh plugin --profile desktop add dsh-pet@0.3.8` 即可（装完同样要重启）
- 它会读你的余额/用量，**如果不想让它看，配置里关掉对应项**

### 4.2 🎭 人设（dsh-persona-dafeiyu）

- 切换入口：**设置 → 人设**，或输入框附近的人设按钮
- 内置三套：**大肥鱼**（圆滚滚、傲娇、爱吃白饭）、阿茶、听澜
- 支持**全局 / 工作区 / 会话**三档生效，**切完下一个请求就生效，不用重启**
- 导入自定义人设：支持粘贴文本或导入文件；单条可导出

> 想让「她」的性格完全按你的想法来，就选大肥鱼后自己再导入一份自定义人设覆盖。

### 4.3 ⏰ 主动消息（dsh-proactive）

这是「完整的一生」里最关键的一块——**没有它，AI 只是被动问答机**。

- Web 面板：**设置 → 插件 → dsh-proactive**，能看到闹钟列表和历史唤醒记录
- 也能让 AI 直接排：跟它说「明天早上九点提醒我…」「每两小时看看构建状态」
- 三种模式：一次性 / 固定间隔 / cron 表达式，都支持**随机抖动**（避免整点撞车）
- **一定要配**：安静时段（比如 23:00–08:00）+ 每日上限（比如 10 条），否则它会话痨到你想拔电源
- 冷会话也能被唤醒；唤醒被压掉时不会污染上下文（tombstone 压缩）

### 4.4 🧠 长期记忆（dsh-mnemon + billion-context）

- `dsh-mnemon`：分层记忆（热点记忆 / 项目文档 / 冷归档），跨会话召回
- `billion-context`：长对话自动折叠压缩，1M 上下文也不炸
- 配置入口：**设置 → 插件 → dsh-mnemon / billion-context**
- 验证记忆生效：开个**新会话**问它「我们上次聊到哪了」，答得上来就是通了

> 记忆的写入是**保守**的：只有你明确表达偏好、纠正它、说「记住」时才会写。别指望它偷偷记下每句话。

### 4.5 🌐 联网搜索（Anysearch）

这个插件装完**自动接管** `web_search`，**匿名就能用，不需要任何 key**。

验证：

```powershell
& $dsh --profile desktop --dump-config | Select-String "searchProvider" -Context 1,1
```

看到 `searchProvider: anysearch` 就成功了。

- 匿名有速率上限。用完了就去 [anysearch.com/console/api-keys](https://anysearch.com/console/api-keys) 领个免费 key，填到
  **设置 → 插件 → dsh-web-search-anysearch → 配置**
- 也可以写进 `~\.dsh\.credentials.yaml`：

```yaml
version: 1
refs:
  ANYSEARCH_API_KEY: tvly-你的key
```

- 想换回官方搜索：在你自己的 `cordis.patch.yml` 里加一条（**你的一层永远压过插件**）：

```yaml
- id: web
  config:
    searchProvider: deepseek-official
```

> ⚠️ **别装 Tavily 版**（`dsh-web-search-tavily`）：它必须填 key，而且不会自动接管，装完搜索照样是坏的。本手册已用 Anysearch 版替代。

### 4.6 😆 表情包（dsh-meme）

- 输入框旁会出现表情按钮：图库 / 情绪多选 / 关键词搜图 / 悬浮预览
- **AI 学图**：把图丢给它说「收进图库」，它会自动打标签
- 图库可以从市场一键装，也能导入/导出 ZIP
- 想在 QQ 里发**裸图**（不带 `[表情: ...]` 标记），还要加装 `dsh-meme-qq` + QQ 通道，见 6.3 节

---

## 5. 优化（装完之后再做）

### 5.1 模型与推理档位

- 日常聊天 / 写代码：`deepseek-v4.1-flash`，推理档位 `medium`
- 复杂重构 / 排障：切 `high` 或 `max`
- 接入私有网关：照抄下面结构写进 `profiles\desktop\cordis.patch.yml`

```yaml
- id: llm-pi-ai
  name: "@deepseek-ai/dsh-llm-pi-ai"
  config:
    providers:
      你的网关名:
        displayName: 你的网关
        api: openai-completions
        baseURL: http://127.0.0.1:19300/v1
        compat:
          # 网关若不认 OpenAI 的 developer 角色，必须关掉，否则整轮 422
          supportsDeveloperRole: false
        models:
          - id: deepseek-v4.1-flash
            name: deepseek-v4.1-flash
            contextWindow: 1048576
```

### 5.2 上下文与成本

| 想省什么 | 怎么做 |
|---|---|
| 长对话爆上下文 | `billion-context` 保持开启，别手动调小折叠阈值 |
| 花出去的 token | 加装 `dsh-cost-meter`，看得到每次会话花多少 |
| 会话文件变大 | 定期在 GUI 里清理旧会话；`~\.dsh\sessions` 可备份后删 |

### 5.3 安全

- `cc-safety-net`：拦危险命令（`rm -rf`、强制推送之类）
- 文件沙箱策略默认 `workspace-write`，只能改工作区内的文件
- API key 一律放 `~\.dsh\.credentials.yaml`，**不要写进 `cordis.patch.yml`**

### 5.4 可回退（装了 undo-savepoint 才有的能力）

- 每次改配置都会自动生成快照，也可以手动建
- 一句话让 AI「撤销上一步」，或 GUI 快照面板点回退
- **启动不起来时**：用安全模式（禁用全部用户插件）→ 重启 → 逐个排查 → 恢复

---

## 6. 可选加装

### 6.1 接到微信 / 飞书（dsh-im）

```powershell
& $dsh plugin --profile desktop add "@xmanrui/dsh-im"
```

装完重启，进 **设置 → 插件 → dsh-im** 扫码/填 token。

### 6.2 更好的侧边栏

```powershell
& $dsh plugin --profile desktop add dsh-better-sidebar
```

### 6.3 把大肥鱼接进 QQ（旧方案：NapCat + dsh-qq-onebot）

> 🕰️ **这一节是历史方案（2026-10-29 版本）。** 2026-10-30 已换成 Aurabot，现行文档是 [`接手-大肥鱼QQ-Aurabot版.md`](接手-大肥鱼QQ-Aurabot版.md)。
> 留着它的原因：① 旧代码/配置完整可回滚；② 里面关于 **NapCat 本身**的坑（扫码、掉线、`get_qzone_msg_list` 不支持、ToS 风险）在 Aurabot 版里一模一样，仍然要看。
> ⚠️ 两套**不能同时开**：它们都连 `127.0.0.1:3001`，会抢连接、一句话回两遍。现在日常只跑 Aurabot，旧桥只在回滚时用。

**这一节不是纸上方案，是本机 `D:\aaa_dsh_data_storage\napcat-bridge\` 里真正跑着的那一套。** 写文档时（2026-10-29 17:38）实测在线：OneBot `3001` Listen + **1 条 Established**（插件已连上 NapCat）、模型转发 `19300` Listen、`YonWork` 中继 `3211` Listen、NapCat WebUI `6099` Listen、插件设置页 `34569` Listen，日志尾部是 `[FACTORY] present=true` + `已连接 ws://127.0.0.1:3001` + `登录账号 甯 (1000000001)`。

> ⚠️ 诚实说明一句：**链路在线不等于刚刚收到过 QQ 消息**。最后一次真实「小号发消息 → 手机收到回复」的端到端验证，本项目交接文档里记为「尚未点过」。要确认这条，必须用**另一个 QQ 号**发一句试试（见 6.3.6）。

#### 6.3.1 先说结论：为什么单独建一个 `qqbot` profile

DSH 的桌面端 profile `desktop` **不能被 CLI 管理**，一碰就报：

```text
error: profile "desktop" is managed exclusively by the Electron application
```

所以 QQ 这条路**单独建了 `qqbot` profile**，好处是：能用 CLI 调试、能把 `dsh-headless` 之类会捣乱的 bundle 排除掉、能和桌面端那套设置页配置互不干扰。

两套并存，共用同一个 `~/.dsh`（会话、凭据、记忆都在里面），互不影响：

| profile | 用途 | 入口 |
|---|---|---|
| `desktop` | 桌面 GUI、桌宠、人设、主动消息、表情包 | 双击 DSH 图标 |
| `qqbot` | **只跑 QQ 机器人**，无界面 | `napcat-bridge\启动.bat` |

`qqbot/package.json` 的 bundles **只能有这三个**：

```json
"bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-qq-onebot"]
```

**绝不能加 `@deepseek-ai/dsh-headless`** —— 它自带的 `headless-startup` 会把 `credentials` / `authorization` / `deepseek-account` 全 `disabled`，`agent-loop` 起不来，机器人每条消息都报 `no agent factory registered (load an agent-loop plugin)`。这不是偶发故障，**只要它在 bundles 里就必然复发**。所以 `qqbot/cordis.patch.yml` 末尾还专门把这三个服务又 `disabled: false` 了一次，双保险。

#### 6.3.2 链路长什么样

```text
你的另一个 QQ 号 ──发消息──▶ 1000000001（NapCat 登录的机器人号）
                                   │ OneBot v11 正向 WS  ws://127.0.0.1:3001
                                   ▼
                        dsh --profile qqbot（跑 dsh-qq-onebot 插件）
                                   │
                                   ▼
                        模型线路（默认 yonyou 中继 127.0.0.1:19300）
                                   │
                                   ▼
                        回复 → 经 NapCat 发回 QQ
```

关键点：**NapCat 是协议端（服务端），dsh-qq 是客户端**。NapCat 开一个正向 WebSocket（3001），插件主动连上去。没有 Docker、没有自建协议桥。

#### 6.3.3 装 NapCat 与插件

**NapCat**（第三方 QQ 协议端）已在本机：`D:\aaa_dsh_data_storage\napcat-bridge\napcat\`，版本 NapCat Shell `4.18.41`，自带自己的 `node.exe`，入口 `napcat.bat`。配置在 `napcat\napcat\config\`：

| 文件 | 作用 |
|---|---|
| `onebot11.json` / `onebot11_1000000001.json` | OneBot WS 服务端配置（**端口 3001**） |
| `webui.json` | WebUI 配置（`http://127.0.0.1:6099/webui?token=910c14be34b8`） |

**插件**用的是**本地源码 + `link:` 依赖**，不是从 npm 装的：

```json
"dependencies": { "dsh-qq-onebot": "link:D:/aaa_dsh_data_storage/napcat-bridge/dsh-qq-onebot/package" }
```

`qqbot/node_modules/dsh-qq-onebot` 是一个 **junction（目录联接）**，指向 `D:\aaa_dsh_data_storage\napcat-bridge\dsh-qq-onebot\package`。所以**改源码立即生效（重启宿主后）**，`dsh plugin add dsh-qq-onebot` 反而会去装 npm 上的公开版本、把本地改动盖掉 —— 别那么干。

> 这一套的灵感来自「AstrBot + NapCat 把 AI 女友养进 QQ」，但**没走 AstrBot 路线**（不用 Docker、不用 Python 插件体系），而是用 DSH 原生的 `dsh-qq-onebot` 插件。

#### 6.3.4 核心配置：`qqbot/cordis.patch.yml`

所有行为都在这一个文件里（`:204` 行）。最常改的键：

| 键 | 当前值 | 说明 |
|---|---|---|
| `wsUrl` | `ws://127.0.0.1:3001` | 连 NapCat，端口必须对得上 |
| `provider` / `model` | `yonyou` / `deepseek-v4.1-flash` | **必须和文件顶部 `agent-default-model` 段完全一致**，否则 `agent has no provider/model` |
| `cwd` | `D:/aaa_dsh_data_storage/napcat-bridge` | QQ 会话的工作目录 |
| `workspaceRoot` | `.../napcat-bridge/QQ会话` | 每个联系人一个子目录 |
| `personaFile` | `.../napcat-bridge/大肥鱼人设.md` | **改人设只改这个 md，存盘 ~800ms 生效，不用重启** |
| `persona` | 两行兜底 | 只在 md 读不到时用，防角色丢失 |
| `ownerIds` | `['1000000002']` | ⚠️ 填**跟它聊天的你**，不是机器人自己的号 |
| `requireMention` | `true` | 群里只在被 @ 时说话 |
| `groupWakeNames` | `大肥鱼 / 肥鱼 / 鲸鲸` | 非 @ 也能听见的唤醒词 |
| `proactiveEnabled` / `proactiveMaxPerDay` | `true` / `8` | 主动找人聊，每天上限 8 次 |
| `mergeWindowMs` | `4000` | 4 秒内连发多条合并成一轮 |
| `historyLimit` | `30` | 每轮带多少条历史 |
| `ttsEnabled` / `ttsVoice` | `true` / `zh-CN-XiaoyiNeural` | QQ 语音回复（edge-tts，失败自动退 SAPI 离线音色） |
| `faceCollectHint` | 二次元梗图描述 | 配置了才会收藏表情包；`faceSendGapMs` 90000 / `faceSendMaxPerHour` 8。**注意：配了不等于有图**——它只收别人在 QQ 里发给它的图，本机目前「表情包收藏 0 个」，想让它有梗图得先发几张给它 |

`cordis.patch.yml` 里还有几处**为了让它能跑**做的覆盖，别随手删：

- `hmr: disabled: true` —— HMR 在配置文件变化时会热重载，把宿主搞成半死状态
- `system-prompt.personaPrefix: ''` + `agent-preset-registry.default: minimal` —— web-app 的预设把 `You are a coding agent powered by the {{model}} model.` 写死了，而 dsh-qq 建 agent 时不传 model → `prompt variable {{model}} has no value`。人设由 dsh-qq 的 `persona` 提供，这里清空

#### 6.3.5 三种「改法」，按需选

| 目的 | 改哪 | 何时生效 |
|---|---|---|
| 换人设 | `napcat-bridge\大肥鱼人设.md` | ~800ms，**不用重启** |
| 改大部分参数 | `qqbot\cordis.patch.yml` 的 `dsh-qq` 段 | 重启宿主 |
| 只覆盖几个键、不想重启 | `~\.dsh\dsh-qq\settings.json` | ~800ms（**优先级高于 yml**）；但 `wsUrl`/`selfId`/`workspaceRoot` 仍需重启 |

每个联系人（或群）的独立工作目录在 `QQ会话\私聊_<QQ号>\`，里面有 `AGENTS.md`（人设/规则，可手工改，插件不会覆盖已存在的）、`聊天记录\<日期>.md`、`记忆区\`（事实 / 日记 / 压缩记忆 / 项目 / 空间）。

#### 6.3.6 启动、停止、验证

```powershell
# 启动（会自动清残留宿主 → 起 NapCat 快速登录 → 起 dsh-qq 宿主等连接）
D:\aaa_dsh_data_storage\napcat-bridge\启动.bat

# 停止（只杀本项目的 napcat 和 --profile qqbot 宿主，不动你桌面上的 QQ）
D:\aaa_dsh_data_storage\napcat-bridge\停止.bat
```

验证三连（**第 2 条最关键，光看端口会误判**）：

```powershell
Get-NetTCPConnection -LocalPort 3001 -State Listen       # NapCat 在听
Get-NetTCPConnection -LocalPort 3001 -State Established  # 插件真的连上了 ★
Get-Content "D:\aaa_dsh_data_storage\napcat-bridge\QQ会话\logs\dsh-qq-$(Get-Date -f yyyy-MM-dd).log" -Tail 20 -Encoding UTF8
```

> 日志是 **UTF-8**，不加 `-Encoding UTF8` 会全是 `涓诲姩璇磋瘽` 这种乱码 —— 那是 PowerShell 的解码问题，**不是机器人坏了**。

健康的日志长这样（本机 2026-10-29 17:37 的实测尾部）：

```text
[info] QQ 互动工具已注册：qq_facts / qq_pin / qq_poke / qq_react / qq_send_image / qq_face / qq_reply / qq_send / qq_send_voice / qq_web_search / qq_recall / qq_group_history
[info] 设置页本地服务: http://127.0.0.1:34569/api/dsh-qq
[info] 已连接 ws://127.0.0.1:3001
[info] 登录账号 甯 (1000000001)
[info] [FACTORY] present=true; agent-loop: FOUND fiber=yes modNS=SET
```

最后那行 `[FACTORY] present=true` 是**健康标志**；如果换成 `no agent factory registered`，直接看 6.3.1 和 8.7。

三个端口各有分工：`3001` OneBot WS、`6099` NapCat WebUI、`34569` 插件自带的本地设置页（`http://127.0.0.1:34569/api/dsh-qq`，可视化改参、看收藏的表情包）。

然后**用另一个 QQ 号**给它发一句，10~30 秒内应有回复。

> ⚠️ **不能自己给自己发**：机器人号被 NapCat 占着，你手机上那个号会被顶下线。必须用小号，或让朋友发一句。

#### 6.3.7 模型线路（三条备选）

| provider | model | 说明 |
|---|---|---|
| `yonyou` | `deepseek-v4.1-flash` | **当前在用**。中继 `127.0.0.1:19300`，1M 上下文 |
| `yonwork` | `deepseek-v4.1-flash` | 本地中继 `127.0.0.1:3211`（就是 `D:\software\YonWork\YonWork.exe`） |
| `shangtang` | `sensenova-6.8-flash-lite` | 商汤直连，需 `SHANGTANG_API_KEY`，有 TPM/RPM 限流（会 429） |

换线路要**同时改两处**：`agent-default-model` 段和 `dsh-qq` 段，改完停→启。

> `yonwork` 依赖 `YonWork.exe` 在跑。它没起又没切线路，表现是「有 Established、发消息却不回」—— 这是最容易误判成「机器人坏了」的情况。

#### 6.3.8 五个必知坑

1. **回复重复两遍** = 起了两个宿主。`_归档_旧bridge（请勿启动）\` 里是早期自写的 `napcat-bridge.mjs`，它和现在这条链路**抢同一个 3001**，同时开就同一句回两遍。留着备查，**永远别启动**。
2. **`desktop` profile 不能用 CLI**（见 6.3.1），别对 `desktop` 跑 `--dump-config`。
3. **`link:` 是 junction，搬目录必须重建**：
   ```powershell
   $nm = "$env:USERPROFILE\.dsh\profiles\qqbot\node_modules\dsh-qq-onebot"
   Remove-Item $nm -Force -Recurse
   New-Item -ItemType Junction -Path $nm -Target "D:\aaa_dsh_data_storage\napcat-bridge\dsh-qq-onebot\package"
   ```
4. **写完配置先验编码**：PowerShell 写 JSON/YAML 会带 BOM，一个看不见的 BOM 就能让解析报 `Unexpected token`。用
   `[IO.File]::WriteAllText($path, $content, (New-Object System.Text.UTF8Encoding($false)))`。反过来，**`.ps1` 脚本反而需要 BOM**（见第 3 节的脚本说明）。
5. **别 `Get-Process QQ | Stop-Process` 全杀** —— 会把你桌面上的 QQ 一起杀掉。所有脚本都按命令行匹配 `napcat` / `--profile qqbot` 过滤。

#### 6.3.9 这条路的风险（必须知道）

**NapCat 是第三方 QQ 协议端，违反腾讯用户协议**，不是官方产品。

- 现在挂的是 `1000000001`（看起来是常用号）—— **建议尽快换小号**
- 被风控的表现：登录要滑块/短信、消息发不出去、账号临时冻结；恢复要走手机 QQ 官方「安全恢复」
- 降压用法：小号、别群发、别高频、群里只在被 @ 时说话（`requireMention: true` 已经这样了）

想走合规路线就去看 6.1（`dsh-im` 接企业微信官方 API）。

#### 6.3.10 深水区文档

`D:\aaa_dsh_data_storage\napcat-bridge\交接文档.md`（471 行）是这条链路的**详细运维手册**：目录清单、50+ 配置项、排障速查表、二维码生成、看门狗等，2026-10-28 写的。

其中**这几处结论已经过期**，以本节和实际配置为准：

| 旧文档说法 | 现在实际 |
|---|---|
| 默认模型 `shangtang / sensenova-6.8-flash-lite` | 已切回 `yonyou / deepseek-v4.1-flash`，`reasoningEffort: high` |
| 人设写在 `cordis.patch.yml` 的 `persona` 里（约 450 字） | 已改成 `personaFile` 指向 `大肥鱼人设.md`，热加载 |
| `faceCollectHint` 没配 → 一张表情都不收 | 已配置，能收梗图了 |
| 主动消息每天最多 6 次 | 配置里是 `proactiveMaxPerDay: 8` |
| 端到端 QQ 验证未做 | 仍未做（见 6.3 开头说明） |

另外顺手记一句：`cordis.patch.yml` 的 `:109-110` 有两行中文注释是乱码（当年用 GBK 写进去的），不影响解析，只是注释。

---

## 7. 验收清单

全部打勾才算交付完成：

- [ ] `& $dsh --version` 能输出版本号
- [ ] GUI 设置 → 插件里，10 个插件都是「已启用」
- [ ] 桌面上能看到大肥鱼，能拖动、会动
- [ ] 人设切到「大肥鱼」，回复风格带「本鱼」「哼」
- [ ] 新开会话问「上次聊到哪了」，它能答出记忆内容
- [ ] 让它搜一条当天的新闻，能返回带链接的结果（证明 Anysearch 生效）
- [ ] 输入框表情按钮能打开，能搜图并发出来
- [ ] 让它「10 分钟后提醒我喝水」，到点真的会主动发消息
- [ ] **设置 → 插件 → dsh-proactive** 里能看到这条闹钟和历史记录
- [ ] 改一个配置，然后「撤销上一步」，能回到改之前

**如果同时接了 QQ（第 6.3 节），再加这 4 条：**

- [ ] `Get-NetTCPConnection -LocalPort 3001 -State Established` 有连接（不是只有 Listen）
- [ ] `Get-NetTCPConnection -LocalPort 3211 -State Listen`（走 `yonwork` 线路时）/ 或 `yonyou` 中继 `19300` 在线
- [ ] 用**小号**发一句私聊，10~30 秒内收到大肥鱼口吻的回复
- [ ] 群里 @ 它才说话，不 @ 不插嘴

---

## 8. 故障排查

### 8.1 重启后启动不了 / 白屏

**最快恢复：安全模式。**

```text
1. 让 AI（或快照面板）执行 undo_safe_mode action=on
2. 完全重启 DSH
3. 进去看 设置 → 插件，逐个启用排查
4. 定位后执行 undo_safe_mode action=off 恢复原插件集
```

**或者用 rescue profile 兜底：**

```powershell
& $dsh rescue --from-default-profile web
```

这会用官方干净模板重建一个 `rescue` profile 并启动，用它把 desktop 修好。

### 8.2 某个插件装不上

| 现象 | 原因 | 解决 |
|---|---|---|
| `No matching version found` | 版本号写错 | `npm view <包名> versions --json` 查真实版本 |
| 装上了但版本比 npm 上的旧 | pnpm 供应链策略拦截新包 | 在 `profiles\desktop\pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude` 里加 `包名@版本`，再装一次 |
| `ERR_PNPM_PEER_DEP_ISSUES` | 对等依赖版本不匹配 | 先看插件的 `engines.dsh` 是否覆盖你的 DSH 版本；不覆盖就换插件，别硬装 |
| 装完插件列表里没有 | 只进依赖没进 bundles | 用 `dsh plugin add` 重装一遍，别手改 `package.json` |

### 8.3 命令全报 `SetNamedSecurityInfoW failed (Win32 5)`

Windows 沙箱给工作区授权失败。两种处理：

1. **临时**：执行命令时申请提权（AI 会自动询问你）
2. **根治**：用 `diagnose-windows-sandbox-acl` 技能检查并修复该路径及其所有父目录的 ACL

换一个普通目录（比如 `C:\Users\<你>\dsh-work`）当工作区，通常也能绕开。

### 8.4 搜索还是不通

```powershell
& $dsh --profile desktop --dump-config | Select-String "id: web$" -Context 0,4
```

- `searchProvider` 不是 `anysearch` → 插件没加载，回 3.2 检查 bundles
- 是 `anysearch` 但报 `WEB_PROVIDER_UNAVAILABLE` → 你的 `cordis.patch.yml` 里可能残留了旧的 `searchProvider` 行，删掉
- 匿名额度用尽 → 按 4.5 填 key

### 8.5 主动消息不触发

1. 安静时段是否覆盖了当前时间
2. 当日预算是否已用满
3. dsh-proactive 面板里那条闹钟的状态是不是 `paused`
4. 是否**完全重启**过（只关窗口不算）

### 8.6 看日志

```
~\.dsh\logs\
```

启动失败时，最新的那个日志文件末尾通常直接写着哪个 bundle 硬检查没过。

### 8.7 QQ 机器人不回消息（配合 6.3）

QQ 那条链路的插件日志**不在 `~\.dsh\logs\`**，而在项目目录里：

```
D:\aaa_dsh_data_storage\napcat-bridge\QQ会话\logs\dsh-qq-<日期>.log
```

按这个顺序查，命中率从高到低：

| 症状 | 查什么 | 处理 |
|---|---|---|
| 完全没反应 | 3001 的 **Established**（看 Listen 会误判） | 没连接就 `停止.bat` → `启动.bat` |
| 有 Established 但不回 | 模型线路挂了（`3211` 或 `19300`） | 起中继，或切线路（6.3.7） |
| 同一句回两遍 | 两个宿主在跑 | 把旧 bridge 目录彻底停掉，见 6.3.8 坑 1 |
| 报 `no agent factory registered` | bundles 里混进了 `dsh-headless` | 删掉它，见 6.3.1 |
| 报 `429 rate_limit` | 商汤 TPM/RPM 限流 | 切 `yonwork` / `yonyou` |
| 报 `MISSING_CREDENTIAL` | `SHANGTANG_API_KEY` 没读到 | 查用户环境变量，或换线路 |
| 3001 没监听 | NapCat 没登录 | 开 WebUI 扫码 `http://127.0.0.1:6099/webui?token=910c14be34b8` |
| `EPERM ... mkdir NapCat\temp` | 目录完整性标签过低 | `cmd /c "icacls "D:\aaa_dsh_data_storage" /setintegritylevel M /T /C /Q"` |

---

## 9. 备份、迁移、卸载

### 备份（推荐整体打包）

```
%USERPROFILE%\.dsh\profiles\desktop\package.json
%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml
%USERPROFILE%\.dsh\profiles\desktop\pnpm-workspace.yaml
%USERPROFILE%\.dsh\.credentials.yaml     ← 含密钥，注意保管
%USERPROFILE%\.dsh\skills\               ← 自建技能
```

> `node_modules` 不要备份，重新 `pnpm install` 更快。

### 迁移到另一台机器

1. 新机装好 DSH，先启动一次生成 `~\.dsh`
2. 覆盖上面那几个文件
3. 进 profile 目录重装依赖：

```powershell
cd "$env:USERPROFILE\.dsh\profiles\desktop"
& "$env:LOCALAPPDATA\Programs\DeepSeek Harness\resources\runtime\primary-runtime\dependencies\pnpm\bin\pnpm.cjs" install
```

4. 完全重启

> `cordis.patch.yml` 里通常夹着**本机专有内容**（私有网关地址、本机端口、个人模型配置）。换机器必须逐条改，**不能整份照抄**。

### 卸载某个插件

```powershell
& $dsh plugin --profile desktop remove dsh-meme
```

`dsh plugin remove` 会自动把 bundles 条目、依赖、patch 层一起清掉，重启即生效。

---

## 10. 速查表

```powershell
# 设定 CLI 变量（每个新终端都要执行一次）
$dsh = "$env:LOCALAPPDATA\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd"

& $dsh --version                                   # 版本
& $dsh plugin --profile desktop add <包名...>      # 装插件
& $dsh plugin --profile desktop remove <包名>      # 卸插件
& $dsh plugin --profile desktop why <包名>         # 谁依赖了它
& $dsh --profile desktop --dump-config             # 打印最终配置树
& $dsh --profile desktop --dump-default-config     # 只看默认层
& $dsh rescue --from-default-profile web           # 重建兜底 profile
& $dsh web                                         # 启动 web profile
& $dsh headless "跑一下测试"                        # 一次性任务
```

**绝对不要做的事**

| ❌ | 为什么 |
|---|---|
| 用 `npx` 跑 dsh | 会拉起第二套 cordis，启动崩溃 |
| 手改 `package.json` 后不 `pnpm install` | node_modules 与清单不一致，启动失败 |
| 把 `@deepseek-ai/*` 写进 `dependencies` | 装了第二份运行时，崩溃 |
| 只关窗口不彻底退出就以为生效 | 插件只在进程启动时加载 |
| 把 key 写进 `cordis.patch.yml` | 会被同步、被分享、被别的插件读到 |
| 给 `qqbot` profile 装 `@deepseek-ai/dsh-headless` | agent-loop 起不来，QQ 每条消息都报错 |
| 同时启动 `_归档_旧bridge` | 和主链路抢 3001，同一句回两遍 |

**QQ 链路速查（旧方案 §6.3；现行请看 `接手-大肥鱼QQ-Aurabot版.md`）**

```powershell
D:\aaa_dsh_data_storage\napcat-bridge\启动.bat          # 旧方案：起 NapCat + 旧桥（现在别用）
D:\aaa_dsh_data_storage\napcat-bridge\停止.bat          # 停止
D:\aaa_dsh_data_storage\napcat-bridge\启动-NapCat.ps1   # 现行：只起 NapCat，不碰 DSH
D:\aaa_dsh_data_storage\napcat-bridge\启动-GPT-SoVITS.ps1  # 她的音色服务（9880），`-Stop` 停
Get-NetTCPConnection -LocalPort 3001 -State Established # 最关键的检查
```

**Aurabot 版速查（现行）**

```powershell
$api = 'http://127.0.0.1:<DSH端口>/aurabot/api'     # 端口每次启动都变
Invoke-RestMethod "$api/state"                       # 健康检查：onebot.state / stats / mood
Invoke-RestMethod "$api/modules"                     # 扩展模块清单（含热重载状态）
Invoke-RestMethod "$api/modules/simulate" -Method Post -ContentType application/json -Body '{"as":"owner","text":"/help"}'
Invoke-RestMethod "$api/local/status"                # 本地接口四项（tts/image/song/asr）谁在接管
# 一键自检（25 项，只读；全绿就说明链路都好，❌ 时退出码 1）
node D:\aaa_dsh_data_storage\tools\aurabot-selfcheck.mjs --api $api
# 四个「只差你配合一步」的助手：
node D:\aaa_dsh_data_storage\tools\douyin-login.mjs                 # 出抖音二维码 → dsh-handover\douyin-qr.png，扫上了 exit 0
node D:\aaa_dsh_data_storage\tools\douyin-qr-refresh.mjs             # 二维码过期了：真点「刷新」再截图（CDP 直连）
node D:\aaa_dsh_data_storage\tools\douyin-enable.mjs             # 扫上后一键开张（保守上限；--caps-full 激进、--dry 只看）
node D:\aaa_dsh_data_storage\tools\bili-login.mjs --sessdata "<…>" --jct "<…>"   # 灌 B站 Cookie；不带参数看怎么抄；--clear 清空
# 看门狗（无窗口，登录时自动起；每 20 秒保活 NapCat + 清掉旧 qqbot 桥）
powershell -NoProfile -ExecutionPolicy Bypass -File D:\aaa_dsh_data_storage\napcat-bridge\watchdog.ps1 -Status   # 体检
Start-ScheduledTask -TaskName DshQqWatchdog            # 死了就重拉
Get-Content D:\aaa_dsh_data_storage\napcat-bridge\logs\watchdog-2026-10-30.log -Tail 5 -Encoding UTF8
```

| 用途 | 路径 |
|---|---|
| 插件数据根（配置/人设/模块/本地接口/日志） | `%USERPROFILE%\.dsh\plugins-data\aurabot\` |
| 她的工作区（每个聊天一个目录） | `%USERPROFILE%\Aurabot\qq-chats\` |
| 语音 venv（edge-tts + faster-whisper） | `%USERPROFILE%\Aurabot\pyenv\` |
| 本地语音识别（whisper small 模型 + asr_cli.py） | `%USERPROFILE%\Aurabot\asr\` |
| 她的音色服务（GPT-SoVITS api_v2.py，9880） | `D:\aaa_dsh_data_storage\napcat-bridge\GPT-SoVITS\` |
| ffmpeg 9.0.2 | `%USERPROFILE%\Aurabot\ffmpeg\ffmpeg-9.0.2-full_build\bin\` |
| 翻唱引擎 | `%USERPROFILE%\Aurabot\rvc\` |

| 用途 | 路径 |
|---|---|
| 项目主目录 | `D:\aaa_dsh_data_storage\napcat-bridge\` |
| 插件配置（人设/模型/参数） | `%USERPROFILE%\.dsh\profiles\qqbot\cordis.patch.yml` |
| 人设（热加载） | `D:\aaa_dsh_data_storage\napcat-bridge\大肥鱼人设.md` |
| 免重启覆盖层 | `%USERPROFILE%\.dsh\dsh-qq\settings.json` |
| 插件日志 | `D:\aaa_dsh_data_storage\napcat-bridge\QQ会话\logs\dsh-qq-<日期>.log` |
| NapCat 日志 | `D:\aaa_dsh_data_storage\napcat-bridge\napcat-run.log` |
| NapCat WebUI | `http://127.0.0.1:6099/webui?token=910c14be34b8` |

---

## 附：本手册实测插件版本

| 包 | 版本 | 备注 |
|---|---|---|
| dsh-pet | 0.3.7 | 最新 0.3.8，需白名单后可升 |
| dsh-persona-dafeiyu | 0.6.0 | 最新 0.7.0 |
| dsh-proactive | 0.3.2 | |
| dsh-meme | 0.1.65 | 最新 0.1.68 |
| @aiwayds/dsh-web-search-anysearch | 0.8.1 | 匿名可用 |
| dsh-mnemon | 0.5.36 | |
| billion-context | 0.1.209 | |
| dsh-context | 0.74.0 | |
| dsh-undo-savepoint | 0.5.0 | |
| dsh-better-sidebar | 0.28.0 | |
| cc-safety-net | 2.6.17 | |
| @xmanrui/dsh-im | 5.6.0 | 可选 |
| @liustack/modlens | 3.27.1 | 可选，读图能力 |
| @michengai/dsh-skills-manager | 1.2.11 | 可选，技能管理 |
| dsh-qq-onebot | 本地源码（`link:`） | 可选，**旧** QQ 通道；npm 另有 1.2.2 公开版，**不要混装** |
| dsh-aurabot-qq | 1.1.22（`github:accomplish07zrh-eng/dsh-aurabot-qq`） | **现行** QQ 通道/她的大脑，装在 `desktop` profile |
| NapCat Shell | 4.18.41 | 可选，QQ 协议端（第三方） |

---

*遇到本手册没覆盖的问题：先把 `~\.dsh\logs\` 最新日志的**末尾 50 行**贴给大肥鱼，它看得懂自己的日志。*
