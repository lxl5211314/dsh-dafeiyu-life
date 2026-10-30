#!/usr/bin/env node
// B站 Cookie 灌入助手 —— 把 SESSDATA / bili_jct 写进 Aurabot 配置并当场验证能不能发评论
// 用法：
//   node bili-login.mjs --sessdata "xxx" --jct "yyy"
//   node bili-login.mjs                      # 不给参数 = 只打印怎么拿这两条
//   node bili-login.mjs --clear              # 清空（回退到"只能读"）
// 说明：写入走 POST /save（bili.sessdata / bili.biliJct），不是 /bili/account（那个是只读刷新）
import { setTimeout as delay } from 'node:timers/promises'

const argv = process.argv.slice(2)
const arg = (name, def) => {
  const i = argv.indexOf('--' + name)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def
}
const API = arg('api', 'http://127.0.0.1:62707/aurabot/api').replace(/\/$/, '')
const SESS = arg('sessdata', '')
const JCT = arg('jct', '')
const CLEAR = argv.includes('--clear')

async function post(path, body = {}) {
  const r = await fetch(API + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  })
  if (!r.ok) throw new Error('HTTP ' + r.status)
  return r.json()
}
async function get(path) {
  const r = await fetch(API + path, { signal: AbortSignal.timeout(30000) })
  if (!r.ok) throw new Error('HTTP ' + r.status)
  return r.json()
}

function guide() {
  console.log(`
怎么拿这两条 Cookie（30 秒）：
  1) 浏览器登录 https://www.bilibili.com
  2) F12 → Application（应用）→ Storage → Cookies → https://www.bilibili.com
  3) 找 SESSDATA 和 bili_jct 两行，把「Value」整段复制
  4) 跑：node bili-login.mjs --sessdata "<SESSDATA>" --jct "<bili_jct>"

注意：
  · SESSDATA 就是登录凭证，等同于你的登录态 —— 只写进本机插件配置，别贴到群里/公开场合；
  · 想让我自动从浏览器抠？可以，但 Chrome/Edge 运行时会独占锁住 Cookies 数据库，
    得先把两个浏览器完全退出（那时 cookies 库才能拷出来、DPAPI 解密）；
  · 只想让她"看视频"其实不用这条 —— 匿名就能读（实测过）。
`)
}

if (!CLEAR && (!SESS || !JCT)) { guide(); process.exit(0) }

try {
  if (CLEAR) {
    // 注意：空字符串在 mergeFromPanel 里意思是「保留原值」，只有 null 才是清空
    const r = await post('/save', { bili: { sessdata: null, biliJct: null, cookie: null } })
    console.log((r.ok ? '✅ 已清空' : '⚠️ 清空返回 ' + JSON.stringify(r).slice(0, 200)))
  } else {
    const body = { bili: { sessdata: SESS, biliJct: JCT, cookie: 'SESSDATA=' + SESS + '; bili_jct=' + JCT + ';' } }
    const r = await post('/save', body)
    console.log((r.ok ? '✅ 已写入配置' : '⚠️ 写入返回 ' + JSON.stringify(r).slice(0, 300)))
  }
  await delay(500)
  try { await post('/bili/account') } catch {}
  await delay(1200)
  const st = await get('/bili/state')
  const acc = st.account || {}
  console.log('   isLogin=' + acc.isLogin + '  uname=' + (acc.uname || '(空)') + '  canPost=' + st.canPost)
  if (acc.isLogin) {
    console.log('🎉 登录生效，她可以发评论/点赞了（`bili.commentDaily` 之类的闸门仍在）')
    process.exit(0)
  }
  console.log('⚠️ 还没登录成功：可能 SESSDATA 抄错/过期，或 bili_jct 不配对')
  process.exit(2)
} catch (e) {
  console.error('❌ 面板打不开：' + e.message + '\n   端口每次启动都变，用 --api http://127.0.0.1:<端口>/aurabot/api 指定')
  process.exit(1)
}
