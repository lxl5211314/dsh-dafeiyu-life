// 一次性验证：走插件自己的 local.call('asr') 通道，确认「听语音」这条链路真的能用。
// 用法：node test-local-asr.mjs <音频文件>
import { createLocal } from 'file:///%USERPROFILE%/.dsh/profiles/desktop/node_modules/dsh-aurabot-qq/src/local/local.js'

const file = process.argv[2]
if (!file) {
  console.error('用法：node test-local-asr.mjs <音频文件>')
  process.exit(2)
}

const log = {
  info: (...a) => console.log('[info]', ...a),
  warn: (...a) => console.warn('[warn]', ...a),
  debug: () => {},
  child: () => log,
}

const local = createLocal({ getConfig: () => ({ local: { asr: true } }), log })
console.log('active(asr) =', local.active('asr'), '| 脚本 =', local.pathOf('asr'))

const t = Date.now()
try {
  const r = await local.call('asr', { file })
  console.log('返回 =', JSON.stringify(r), `（${Date.now() - t} ms）`)
  console.log('status.last =', JSON.stringify(local.status().find((s) => s.slot === 'asr')?.last))
} catch (error) {
  console.error('失败：', error.message)
  console.log('status.last =', JSON.stringify(local.status().find((s) => s.slot === 'asr')?.last))
  process.exit(1)
}
