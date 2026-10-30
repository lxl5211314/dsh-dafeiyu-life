#!/usr/bin/env node
// 抖音「扫码成功后一键开张」——检查登录态，登上了就打开总开关（保守上限）
// 用法：
//   node douyin-enable.mjs                 # 默认：只查，登上了就开
//   node douyin-enable.mjs --caps-full     # 用插件默认上限（点赞30/评论3/分享5/每天写40）
//   node douyin-enable.mjs --dry           # 只查不动配置
// 退出码：0 = 已登录且已开；2 = 还没登录；1 = 面板打不开
import { setTimeout as delay } from 'node:timers/promises'

const argv = process.argv.slice(2)
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d }
const API = arg('api', 'http://127.0.0.1:62707/aurabot/api').replace(/\/$/, '')
const FULL = argv.includes('--caps-full')
const DRY = argv.includes('--dry')

const get = async (p) => (await fetch(API + p, { signal: AbortSignal.timeout(30000) })).json()
const post = async (p, body = {}) => {
  const r = await fetch(API + p, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(60000),
  })
  return r.json()
}

let st
try { st = await get('/douyin/state') } catch (e) {
  console.error('❌ 面板打不开：' + e.message); process.exit(1)
}
const acc = st.account || {}
const logged = st.loggedIn ?? acc.loggedIn ?? Boolean(acc && acc.nickname)
console.log('browserOpen=' + st.browserOpen + '  loggedIn=' + logged + (acc.nickname ? '  账号=' + acc.nickname : ''))
if (!logged) {
  console.log('⚠️ 还没扫码。先跑：node tools\\douyin-login.mjs   （二维码过期就用 douyin-qr-refresh.mjs 刷一张）')
  process.exit(2)
}

if (DRY) { console.log('（--dry 只查不改）'); process.exit(0) }

// 保守策略：能看、能点几个赞、能挑好视频发到 QQ，但不在公共评论区留言、不 @ 主人
const caps = FULL
  ? { like: 30, comment: 3, share: 5, atOwner: 3 }
  : { like: 5, comment: 1, share: 2, atOwner: 0 }
const patch = {
  douyin: {
    enabled: true,
    autoBrowse: true,
    intervalHours: 4,
    maxRunsPerDay: 2,
    perRun: 3,
    maxWatchPerDay: 20,
    shareTo: 'qq',
    caps,
    gate: { maxWritesPerDay: FULL ? 40 : 8, minWriteGapSec: 20, newAccountDays: 3 },
  },
}
const r = await post('/save', patch)
console.log((r.ok ? '✅ 已开启' : '⚠️ 保存返回：' + JSON.stringify(r).slice(0, 200)))
await delay(800)
const after = await get('/state').catch(() => null)
const c = after && after.config && after.config.douyin
if (c) {
  console.log('   enabled=' + c.enabled + ' autoBrowse=' + c.autoBrowse + ' perRun=' + c.perRun + '/轮 × ' + c.maxRunsPerDay + ' 轮/天')
  console.log('   上限：点赞 ' + c.caps.like + ' / 评论 ' + c.caps.comment + ' / 分享 ' + c.caps.share + ' / @主人 ' + c.caps.atOwner + '，每天写操作 ' + c.gate.maxWritesPerDay)
  console.log('   分享去处：' + c.shareTo + '（没核对主人抖音号时会自动改发 QQ）')
}
console.log('想激进点：node tools\\douyin-enable.mjs --caps-full；想关掉：POST /save {"douyin":{"enabled":false}}')
process.exit(0)
