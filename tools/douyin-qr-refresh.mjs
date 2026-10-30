#!/usr/bin/env node
// 抖音二维码「刷新 + 重新截图」——给 douyin-login.mjs 打补丁用
// 背景：插件的 loginStart() 只会「点右上角登录 → 等二维码元素 → 截图」，
//       如果登录弹窗本来就开着、只是二维码过期了，它会拍到一张「二维码失效」的图。
//       这里直接挂到插件浏览器的 CDP 端口上：点「点击刷新」，再截一次登录面板。
// 用法：node douyin-qr-refresh.mjs [--out D:\...\douyin-qr.png]
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const argv = process.argv.slice(2)
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d }
const PROFILE = arg('profile', '%USERPROFILE%/.dsh/plugins-data/aurabot/douyin/edge-profile')
const OUT = arg('out', 'D:/aaa_dsh_data_storage/dsh-handover/douyin-qr.png')

let port
try {
  port = Number(String(readFileSync(join(PROFILE, 'DevToolsActivePort'), 'utf8')).split(/\r?\n/)[0].trim())
} catch (e) {
  console.error('❌ 读不到 DevToolsActivePort（插件浏览器没起来？先跑 tools/douyin-login.mjs）')
  process.exit(1)
}

const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const page = targets.find((t) => t.type === 'page' && /douyin\.com/.test(t.url))
if (!page) {
  console.error('❌ 没找到抖音页面，现有目标：' + targets.map((t) => t.type + ' ' + t.url).join(' | '))
  process.exit(1)
}

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = () => bad(new Error('CDP 连不上')) })

let seq = 0
const pending = new Map()
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
}
function send(method, params = {}) {
  const id = ++seq
  return new Promise((ok) => { pending.set(id, ok); ws.send(JSON.stringify({ id, method, params })) })
}
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  return r.result && r.result.result ? r.result.result.value : undefined
}

// 1) 面板在不在
const hasPanel = await evaluate(`Boolean(document.querySelector('#login-panel-new') || document.querySelector('#douyin_login_comp_flat_panel'))`)
console.log('登录面板在不在：' + hasPanel)

// 2) 点「点击刷新」（过期时才有），点完等二维码重新画出来
const clicked = await evaluate(`(() => {
  const hit = [...document.querySelectorAll('div,span,p,button,a')]
    .filter(n => /点击刷新|刷新/.test((n.innerText||'').trim()) && n.getBoundingClientRect().width > 0)
    .sort((a,b) => a.getBoundingClientRect().width - b.getBoundingClientRect().width)[0]
  if (!hit) return 'no-refresh-button'
  for (const t of ['mouseover','mouseenter','mousedown','mouseup','click']) hit.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window, button: 0 }))
  return 'clicked'
})()`)
console.log('刷新按钮：' + clicked)

await delay(2500)

// 3) 截登录面板
const box = await evaluate(`(() => {
  const n = document.querySelector('#login-panel-new') || document.querySelector('#douyin_login_comp_flat_panel')
  if (!n) return null
  const r = n.getBoundingClientRect()
  return r.width > 0 ? { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height), scale: 1 } : null
})()`)
const shot = await send('Page.captureScreenshot', box ? { format: 'png', clip: box } : { format: 'png' })
const b64 = shot.result && shot.result.data
if (!b64) { console.error('❌ 截图失败'); process.exit(1) }
writeFileSync(OUT, Buffer.from(b64, 'base64'))
console.log('✅ 已截图：' + OUT)

// 4) 顺手报一下当前扫码状态
const state = await evaluate(`(() => {
  const n = document.querySelector('#douyin_login_comp_scan_code')
  const text = document.body.innerText || ''
  return { hasQr: Boolean(n && n.querySelector('img,canvas')), expired: /二维码失效/.test(text) }
})()`)
console.log('二维码元素=' + state.hasQr + '  仍显示失效=' + state.expired)
ws.close()
process.exit(state.expired ? 2 : 0)
