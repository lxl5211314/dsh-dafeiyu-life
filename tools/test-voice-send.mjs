// 测「本地 TTS 产出的 wav 能不能当 QQ 语音发出去」
// 用法：node test-voice-send.mjs <wav路径> [目标QQ号] [--url ws://127.0.0.1:3001]
// 走的是 Aurabot 发送语音时的同一条路：{type:'record', data:{file:'base64://...'}}，由网关转 silk。

import { readFileSync } from 'node:fs'

const arg = process.argv.slice(2)
let file = arg[0]
let target = arg[1]
let url = 'ws://127.0.0.1:3001'
const ui = arg.indexOf('--url')
if (ui >= 0) {
  url = arg[ui + 1]
  arg.splice(ui, 2)
}
file = arg[0]
target = arg[1] || '1000000002'

if (!file) {
  console.error('用法：node test-voice-send.mjs <wav路径> [目标QQ号]')
  process.exit(2)
}

const buf = readFileSync(file)
console.log(`[i] 读入 ${file} → ${Math.round(buf.length / 1024)} KB`)

const ws = new WebSocket(url)
const echo = 'voice-test-' + Date.now()

const timer = setTimeout(() => {
  console.error('[x] 15 秒没等到回执')
  process.exit(1)
}, 15000)

ws.addEventListener('open', () => {
  ws.send(JSON.stringify({
    action: 'send_private_msg',
    params: {
      user_id: Number(target),
      message: [{ type: 'record', data: { file: 'base64://' + buf.toString('base64') } }],
      auto_escape: false,
    },
    echo,
  }))
})

ws.addEventListener('message', (event) => {
  let data
  try {
    data = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data))
  } catch {
    return
  }
  if (data.echo !== echo) return
  clearTimeout(timer)
  console.log('[reply]', JSON.stringify(data).slice(0, 300))
  const ok = data.status === 'ok' || data.retcode === 0
  console.log(ok ? '[OK] 语音发出去了' : '[x] 网关拒绝')
  ws.close()
  process.exit(ok ? 0 : 1)
})

ws.addEventListener('error', (e) => {
  clearTimeout(timer)
  console.error('[x] WS 出错：', e?.message || e)
  process.exit(1)
})
