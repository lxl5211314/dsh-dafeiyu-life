// 通用 OneBot v11 调用小工具：node onebot-call.mjs <action> [paramsJson] [--url ws://127.0.0.1:3001]
// 例：node onebot-call.mjs get_group_list
//     node onebot-call.mjs get_friend_list
//     node onebot-call.mjs send_private_msg '{"user_id":1000000002,"message":"test"}'
const argv = process.argv.slice(2)
let url = 'ws://127.0.0.1:3001'
const i = argv.indexOf('--url')
if (i >= 0) { url = argv[i + 1]; argv.splice(i, 2) }
const action = argv[0]
if (!action) { console.error('用法: node onebot-call.mjs <action> [paramsJson] [--url ws://...]'); process.exit(2) }
let params = {}
if (argv[1]) { try { params = JSON.parse(argv[1]) } catch (e) { console.error('params 不是合法 JSON:', e.message); process.exit(2) } }

const echo = 'call-' + Date.now()
const ws = new WebSocket(url)
const timer = setTimeout(() => { console.error('[timeout] 15s 没有回应'); try { ws.close() } catch {} ; process.exit(1) }, 15000)
ws.addEventListener('open', () => {
  ws.send(JSON.stringify({ action, params, echo }))
})
ws.addEventListener('message', (ev) => {
  let m
  try { m = JSON.parse(String(ev.data)) } catch { return }
  if (m.echo !== echo && !m.retcode && m.echo === undefined) return
  clearTimeout(timer)
  console.log(JSON.stringify(m, null, 2))
  try { ws.close() } catch {}
  process.exit(m.retcode === 0 || m.status === 'ok' ? 0 : 1)
})
ws.addEventListener('error', (e) => { console.error('[ws error]', e?.message || e); process.exit(1) })
