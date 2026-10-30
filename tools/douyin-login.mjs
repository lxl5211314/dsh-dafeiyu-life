#!/usr/bin/env node
// 抖音扫码登录助手 —— 打开登录页、存二维码、盯着登录状态
// 用法：
//   node douyin-login.mjs                       # 出二维码并存到 dsh-handover\douyin-qr.png
//   node douyin-login.mjs --api http://127.0.0.1:62707/aurabot/api --wait 180
// 退出码：0 = 已登录；2 = 等到超时还没登（二维码已存盘，可重新扫码）；1 = 面板打不开
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const argv = process.argv.slice(2)
const arg = (name, def) => {
  const i = argv.indexOf('--' + name)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def
}
const API = arg('api', 'http://127.0.0.1:62707/aurabot/api').replace(/\/$/, '')
const OUT = resolve(arg('out', 'D:/aaa_dsh_data_storage/dsh-handover/douyin-qr.png'))
const WAIT = Number(arg('wait', '180'))

async function post(path, body = {}) {
  const r = await fetch(API + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  })
  if (!r.ok) throw new Error('HTTP ' + r.status)
  return r.json()
}
async function get(path) {
  const r = await fetch(API + path, { signal: AbortSignal.timeout(30000) })
  if (!r.ok) throw new Error('HTTP ' + r.status)
  return r.json()
}

let r
try {
  console.log('正在打开抖音登录页…（第一次会启动插件自己的浏览器 profile，慢十几秒）')
  r = await post('/douyin/login')
} catch (e) {
  console.error('❌ 面板打不开或登录页起不来：' + e.message)
  console.error('   检查 DSH 是否在跑、端口是否变了：--api http://127.0.0.1:<端口>/aurabot/api')
  process.exit(1)
}

const shot = r.shot || (r.state && r.state.shot) || ''
if (shot.startsWith('data:image')) {
  const b64 = shot.slice(shot.indexOf(',') + 1)
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, Buffer.from(b64, 'base64'))
  console.log('✅ 二维码已存：' + OUT)
  console.log('   用手机抖音扫码（手机上点左上角「扫一扫」），二维码过期就再跑一次本脚本')
} else {
  console.log('⚠️ 这次没拿到二维码截图：' + JSON.stringify(r).slice(0, 300))
}

const started = Date.now()
let last = ''
while (Date.now() - started < WAIT * 1000) {
  await delay(3000)
  let st
  try { st = await get('/douyin/state') } catch { continue }
  const acc = st.account || {}
  const logged = st.loggedIn ?? acc.loggedIn ?? Boolean(acc && acc.nickname)
  const line = '  状态：loggedIn=' + logged + ' browserOpen=' + st.browserOpen + (acc.nickname ? ' 账号=' + acc.nickname : '')
  if (line !== last) { console.log(line); last = line }
  if (logged) {
    console.log('🎉 登录成功：' + (acc.nickname || '(没拿到昵称)'))
    console.log('   想让她自己去刷就把 douyin.enabled 打开（默认可先试运行）')
    process.exit(0)
  }
}
console.log('⏳ 等了 ' + WAIT + ' 秒还没扫上；二维码已存盘，重新扫码跑同一命令即可')
process.exit(2)
