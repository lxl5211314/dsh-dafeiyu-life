// 群聊验收清单：登录了什么号、有几个群、哪些群在白名单里、进群后该怎么测
// 用法：node check-group.mjs [--api http://127.0.0.1:62707/aurabot/api] [--ws ws://127.0.0.1:3001]
// 只读：不改配置、不发消息。

const argv = process.argv.slice(2)
function opt(name, fallback) {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback
}
const API = opt('api', 'http://127.0.0.1:62707/aurabot/api')
const WS = opt('ws', 'ws://127.0.0.1:3001')

const line = (s = '') => console.log(s)

function onebot(action, params = {}) {
  return new Promise((resolve) => {
    const ws = new WebSocket(WS)
    const echo = `chk-${action}-${Date.now()}`
    const done = (v) => {
      try {
        ws.close()
      } catch {}
      resolve(v)
    }
    const timer = setTimeout(() => done({ ok: false, error: '超时没回执' }), 15000)
    ws.addEventListener('open', () => ws.send(JSON.stringify({ action, params, echo })))
    ws.addEventListener('message', (ev) => {
      let d
      try {
        d = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data))
      } catch {
        return
      }
      if (d.echo !== echo) return
      clearTimeout(timer)
      done({ ok: d.status === 'ok' || d.retcode === 0, data: d.data, retcode: d.retcode, message: d.message })
    })
    ws.addEventListener('error', () => {
      clearTimeout(timer)
      done({ ok: false, error: 'WS 连不上（NapCat 没起？端口不对？）' })
    })
  })
}

async function getJson(path) {
  const r = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(20000) })
  if (!r.ok) throw new Error(`${path} → HTTP ${r.status}`)
  return r.json()
}

line('=== 群聊验收 ===')

let state
try {
  state = await getJson('/state')
} catch (e) {
  line(`[x] 面板 API 不通：${e.message}`)
  line('    端口每次启动都变：Get-NetTCPConnection -State Listen | ? LocalPort -lt 65535')
  process.exit(1)
}

const onebotState = state.onebot?.state
const login = state.onebot?.login
line(`[1] 网关：gateway=${state.config?.gateway ?? state.gateway} / onebot=${onebotState} / 登录=${login?.nickname}(${login?.uin})`)
if (onebotState !== 'connected') line('    ⚠ 没连上，先看 NapCat 起没起（启动-NapCat.ps1）')

const g = state.config?.group || state.group || {}
line(`[2] 群策略：唤醒词「${g.wakeWords}」/ 插话概率 ${g.interjectChance} / 冷却 ${g.cooldownSec}s / 每小时 ${g.maxPerHour} 条 / 静默时段 ${g.quietHours} 点`)
const allow = state.config?.allow || state.allow || {}
line(`[3] 白名单：私聊 ${JSON.stringify(allow.private || [])} / 群 ${JSON.stringify(allow.groups || [])}`)

const gl = await onebot('get_group_list')
if (!gl.ok) {
  line(`[4] 取群列表失败：${gl.error || gl.message || gl.retcode}`)
} else {
  const groups = gl.data || []
  line(`[4] 这个号在 ${groups.length} 个群里`)
  for (const x of groups) {
    const white = (allow.groups || []).map(String).includes(String(x.group_id)) ? '✅ 已白名单' : '⚠ 未白名单'
    line(`    - ${x.group_name}(${x.group_id})  ${x.member_count}人  ${white}`)
  }
  if (!groups.length) {
    line('')
    line('    ⚠ 一个群都没有 → 群聊功能只能靠单测（11 用例）背书，端到端没法验。')
    line('    要做真实验收：拿这个号（1000000001）进一个自己的群，然后重跑本脚本。')
  } else {
    const first = groups[0].group_id
    line('')
    line('    要白名单化（例如第一个群）：')
    line(`    Invoke-RestMethod -Method Post -Uri "${API}/save" -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes('{"allow":{"groups":["${first}"]}}'))`)
  }
}

line('')
line('[5] 进群之后按这个测（QQ 里发，看日志）')
line('    a) 群里 @她 说「大肥鱼 在吗」→ 应 hit must（被@）')
line('    b) 群里只发「大肥鱼」→ 应 hit must（唤醒词）')
line('    c) 引用她的消息回一句 → 应 hit must（repliedToBot）')
line('    d) 群里正常聊天不叫她 → 应多数 none，偶尔 interject')
line('    e) 让她在群里发消息 → 她不该有本地工具（social 档 9 个）')
line('    日志：%USERPROFILE%\\.dsh\\plugins-data\\aurabot\\logs\\aurabot-<日期>.log（要 Select-String 过滤，别整段 tail）')

const tools = await getJson('/modules/tools?as=other&kind=group').catch(() => null)
if (tools) {
  const raw = tools.list || tools.tools || []
  const names = raw.map((t) => (typeof t === 'string' ? t : t.name || t.id || JSON.stringify(t)))
  line('')
  line(`[6] 群档工具（social）：${names.length} 个 → ${names.join(', ')}`)
}
