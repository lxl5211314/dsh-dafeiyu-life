// 验证 B 站匿名读取（正确签名：view 传对象，comments 传 aid）
import { createBiliApi } from 'file:///%USERPROFILE%/.dsh/profiles/desktop/node_modules/dsh-aurabot-qq/src/bili/api.js'

const log = { info: () => {}, warn: () => {}, debug: () => {}, child: () => log }
const api = createBiliApi({ getCookie: () => '', log })

const pop = await api.popular(3).catch((e) => ({ error: e.message }))
if (pop.error) { console.log('popular error =', pop.error); process.exit(1) }
console.log('popular 前 3 =', pop.map((v) => v.title?.slice(0, 20)).join(' / '))

const v = await api.view({ bvid: pop[0].bvid }).catch((e) => ({ error: e.message }))
console.log('view =', JSON.stringify({ title: v?.title, author: v?.author, play: v?.play, duration: v?.duration, tname: v?.tname, error: v?.error }).slice(0, 400))

const c = await api.comments(v.aid, { limit: 3 }).catch((e) => ({ error: e.message }))
console.log('热评 =', JSON.stringify(Array.isArray(c) ? c.map((x) => `${x.name}: ${x.text.slice(0, 20)}`) : c).slice(0, 300))

const s = await api.search('白米饭 吃播', { page: 1 }).catch((e) => ({ error: e.message }))
console.log('搜索 =', JSON.stringify(Array.isArray(s) ? s.slice(0, 3).map((x) => x.title?.slice(0, 22)) : s).slice(0, 300))
