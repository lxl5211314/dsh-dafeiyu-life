#!/usr/bin/env node
// 大肥鱼（Aurabot）一键自检 —— 只读，不改任何配置
// 用法：
//   node aurabot-selfcheck.mjs
//   node aurabot-selfcheck.mjs --api http://127.0.0.1:62707/aurabot/api --ws ws://127.0.0.1:3001 --tts-port 9880
//   node aurabot-selfcheck.mjs --json
// 退出码：0 = 没有 ❌；1 = 有 ❌
import net from 'node:net'

const argv = process.argv.slice(2)
const arg = (name, def) => {
  const i = argv.indexOf('--' + name)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def
}
const API = arg('api', 'http://127.0.0.1:62707/aurabot/api').replace(/\/$/, '')
const WS = arg('ws', 'ws://127.0.0.1:3001')
const TTS_PORT = Number(arg('tts-port', '9880'))
const JSON_OUT = argv.includes('--json')

const rows = []
const add = (name, level, detail) => rows.push({ name, level, detail })

async function getJson(url, ms = 15000) {
  const r = await fetch(url, {
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(ms),
  })
  if (!r.ok) throw new Error('HTTP ' + r.status)
  return r.json()
}

function wsCall(action, params = {}, ms = 12000) {
  return new Promise((resolve) => {
    let done = false
    let ws
    const finish = (v) => {
      if (done) return
      done = true
      try { ws && ws.close() } catch {}
      resolve(v)
    }
    try { ws = new WebSocket(WS) } catch (e) { return finish({ ok: false, message: e.message }) }
    const echo = 'sc-' + Math.random().toString(36).slice(2, 8)
    const timer = setTimeout(() => finish({ ok: false, message: '超时没回执' }), ms)
    ws.addEventListener('open', () => {
      try { ws.send(JSON.stringify({ action, params, echo })) } catch (e) { clearTimeout(timer); finish({ ok: false, message: e.message }) }
    })
    ws.addEventListener('message', (ev) => {
      let d
      try { d = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data)) } catch { return }
      if (d.echo !== echo) return
      clearTimeout(timer)
      finish({ ok: d.status === 'ok' || d.retcode === 0, data: d.data, retcode: d.retcode, message: d.message || d.wording })
    })
    ws.addEventListener('error', () => { clearTimeout(timer); finish({ ok: false, message: '连不上 WS' }) })
  })
}

function tcpAlive(port, host = '127.0.0.1', ms = 2500) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host })
    const done = (v) => { try { s.destroy() } catch {}; resolve(v) }
    s.setTimeout(ms)
    s.once('connect', () => done(true))
    s.once('timeout', () => done(false))
    s.once('error', () => done(false))
  })
}

// 1. 面板 API + 主状态
let state = null
try {
  state = await getJson(API + '/state', 20000)
  add('面板 API', 'ok', API + '/state 正常（' + Object.keys(state).length + ' 个字段）')
} catch (e) {
  add('面板 API', 'fail', API + '/state 打不开：' + e.message + '（DSH 没开，或端口变了 —— 端口每次启动都变，去 DSH 地址栏抄）')
}

if (state) {
  const cfg = state.config || {}
  const ob = state.onebot || {}
  const login = ob.login || {}
  const uin = login.uin || login.userId || login.user_id || ''
  if (ob.state === 'connected') add('QQ 网关', 'ok', 'connected，登录号 ' + (uin || '(未报)') + (login.nickname ? ' / ' + login.nickname : ''))
  else add('QQ 网关', 'fail', 'state=' + (ob.state || '(空)') + ' ' + (ob.problem || ob.message || ''))

  add('总开关', cfg.enabled === true ? 'ok' : 'fail', cfg.enabled === true ? 'enabled=true' : 'enabled=false（她不会回任何消息）')
  add('试运行', cfg.dryRun === true ? 'warn' : 'ok', cfg.dryRun === true ? 'dryRun=true —— 只记日志不真发' : 'dryRun=false（会真发）')
  add('初始化', cfg.setupDone ? 'ok' : 'warn', cfg.setupDone ? '主人=' + (cfg.ownerName || '') + '(' + (cfg.ownerQQ || '') + ')' : 'setupDone=false —— 面板引导没走完')

  const m = cfg.model || {}
  add('全局模型', m.provider && m.model ? 'ok' : 'warn', m.provider && m.model ? m.provider + ' / ' + m.model + ' / ' + (m.reasoningEffort || '-') : '没指定，跟随 DSH 默认')
  const cm = cfg.chatModels || {}
  const spec = (o) => (o && o.provider ? o.provider + '/' + o.model : '(未设)')
  add('分档模型', 'ok', '私聊=' + spec(cm.privateDefault) + '  群=' + spec(cm.groupDefault))

  const st = state.stats || {}
  add('收发计数', (st.errors || 0) > 0 ? 'warn' : 'ok', '收到 ' + (st.received ?? 0) + ' / 发出 ' + (st.sent ?? 0) + ' / 语音 ' + (st.voice ?? 0) + ' / 表情 ' + (st.stickers ?? 0) + ' / 错误 ' + (st.errors ?? 0))

  const persona = (cfg.persona && cfg.persona.current) || ''
  add('人格', persona ? 'ok' : 'warn', persona ? 'persona = ' + persona : '(空，用默认)')

  const cst = state.stickers || {}
  add('表情库', (cst.count || 0) > 0 ? 'ok' : 'warn', (cst.count || 0) + ' 张（上限 ' + ((cfg.stickers && cfg.stickers.maxLibrary) || '?') + '）')
  add('头像', state.avatar && state.avatar.custom ? 'ok' : 'warn', state.avatar && state.avatar.custom ? '自定义头像已生效' : '用插件自带图')

  const mood = state.mood || {}
  add('心情', 'ok', (mood.value ?? '?') + ' / ' + (mood.label || ''))

  const diary = state.diary || {}
  add('空间日记', diary.next ? 'ok' : 'warn', diary.next ? '下一篇 ' + diary.next + (diary.last && diary.last.ok ? '（上一篇已发，tid ' + String(diary.last.tid).slice(0, 12) + '）' : '') : '未排期')

  const su = state.speakUp || {}
  add('主动搭话', su.nextAt ? 'ok' : 'warn', su.nextAt ? '下次 ' + new Date(su.nextAt).toLocaleTimeString('zh-CN') : '未排期')

  const song = state.song || {}
  if (!song.enabled) add('翻唱', 'warn', '模块关着')
  else if ((song.voices || []).length > 0) add('翻唱', 'ok', (song.voices || []).length + ' 个音色，ready=' + song.ready)
  else {
    const p = song.parts || {}
    const six = ['python', 'applio', 'separator', 'ffmpeg', 'weights', 'separatorModel'].filter((k) => p[k]).length
    add('翻唱', 'warn', '引擎六件套 ' + six + '/6，只缺 .pth 音色模型')
  }

  const sess = state.sessions || {}
  const nses = Object.keys(sess).length
  add('会话', nses > 0 ? 'ok' : 'warn', nses + ' 个：' + Object.keys(sess).slice(0, 4).join(', '))
}

// 2. 各模块独立状态（不在 /state 顶层）
async function moduleState(path, name, fn) {
  try {
    const d = await getJson(API + path, 20000)
    fn(d)
  } catch (e) {
    add(name, 'warn', path + ' 打不开：' + e.message)
  }
}

await moduleState('/bili/state', 'B站', (d) => {
  const biliCfg = (state && state.config && state.config.bili) || {}
  if (biliCfg.enabled === false) return add('B站', 'warn', '模块关着（config.bili.enabled=false）')
  // canPost 只代表「Cookie 里有 bili_jct」，不代表登录有效；真正看 account.isLogin
  const logged = Boolean(d.account && d.account.isLogin)
  const hasCookie = Boolean(biliCfg.cookieSet || (biliCfg.sessdataSet && biliCfg.biliJctSet))
  if (logged) add('B站', 'ok', '已登录 ' + (d.account.uname || '') + '，能发评论' + (d.vision && d.vision.ready ? '，ffmpeg 就绪' : ''))
  else add('B站', 'warn', '能看视频、不能发评论（' + (hasCookie ? 'Cookie 无效或过期，用 tools/bili-login.mjs 重灌' : '缺 SESSDATA/bili_jct') + '）' + (d.vision && d.vision.ready ? '，ffmpeg 就绪' : ''))
})

await moduleState('/douyin/state', '抖音', (d) => {
  const acc = d.account || {}
  const logged = d.loggedIn ?? acc.loggedIn ?? Boolean(acc && acc.nickname)
  add('抖音', logged ? 'ok' : 'warn', logged ? '已登录 ' + (acc.nickname || '') : '没登录' + (d.browserOpen ? '（浏览器开着，跑 tools/douyin-login.mjs 出二维码）' : '（跑 tools/douyin-login.mjs 出二维码）'))
})

await moduleState('/heybox/state', '小黑盒', (d) => {
  const q = d.quota || {}
  add('小黑盒', 'ok', '今天逛了 ' + (q.browse ?? 0) + ' 轮（读不用 Cookie，写要 pkey）')
})

// 3. 本地接口
try {
  const local = await getJson(API + '/local/status', 12000)
  const list = local.list || []
  for (const slot of ['tts', 'asr']) {
    const s = list.find((x) => x.slot === slot) || {}
    const on = s.active === true
    add('本地接口 ' + slot, on ? 'ok' : 'warn', on ? '启用' + (s.last && s.last.message ? '（最近：' + s.last.message + '）' : '') : '没启用（面板「本地接口」打勾 + 放脚本）')
  }
} catch (e) {
  add('本地接口', 'warn', '/local/status 打不开：' + e.message)
}

// 4. NapCat 直连
const info = await wsCall('get_login_info')
if (info.ok) add('NapCat WS', 'ok', '登录号 ' + ((info.data && info.data.user_id) || '?') + ' / ' + ((info.data && info.data.nickname) || '?'))
else add('NapCat WS', 'fail', WS + ' 不通：' + (info.message || info.retcode || '未知') + '（NapCat 没起就先跑 启动-NapCat.ps1）')

const groups = await wsCall('get_group_list')
if (groups.ok) {
  const list = groups.data || []
  add('群', list.length ? 'ok' : 'warn', list.length ? list.length + ' 个群：' + list.map((g) => g.group_name).slice(0, 3).join('、') : '一个群都没有（群聊那套只能等你有群再验）')
} else add('群', 'warn', 'get_group_list 失败：' + (groups.message || groups.retcode))

const friends = await wsCall('get_friend_list')
if (friends.ok) add('好友', 'ok', (friends.data || []).length + ' 个')
else add('好友', 'warn', 'get_friend_list 失败：' + (friends.message || friends.retcode))

// 5. 她的音色服务（只探端口，不做业务请求）
const alive = await tcpAlive(TTS_PORT)
add('音色服务 ' + TTS_PORT, alive ? 'ok' : 'warn', alive ? '端口在听（她会用自己的声音）' : '没起 → 跑 启动-GPT-SoVITS.ps1，不起就退回 edge-tts 机械音')

// 输出
const icon = { ok: '✅', warn: '⚠️ ', fail: '❌' }
if (JSON_OUT) {
  console.log(JSON.stringify({ at: new Date().toISOString(), api: API, ws: WS, rows }, null, 2))
} else {
  console.log('\n大肥鱼自检 · ' + new Date().toLocaleString('zh-CN'))
  console.log('  面板 ' + API + '\n  网关 ' + WS + '\n  音色端口 ' + TTS_PORT + '\n')
  const w = Math.max(...rows.map((r) => [...r.name].length)) + 1
  for (const r of rows) console.log('  ' + icon[r.level] + ' ' + r.name.padEnd(w, ' ') + ' ' + r.detail)
  const c = (lv) => rows.filter((r) => r.level === lv).length
  console.log('\n  合计：✅ ' + c('ok') + '   ⚠️ ' + c('warn') + '   ❌ ' + c('fail') + '\n')
}
process.exit(rows.some((r) => r.level === 'fail') ? 1 : 0)
