#!/usr/bin/env node
// 二维码保鲜：没登录就每 45 秒刷一次码，一直刷到登录成功或次数用完。
// 用法：node douyin-qr-keepalive.mjs [--api http://127.0.0.1:62707/aurabot/api] [--max 12]
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const run = promisify(execFile);
const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const API = arg('--api', 'http://127.0.0.1:62707/aurabot/api');
const MAX = Number(arg('--max', '12'));
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\//, ''));
const REFRESH = path.join(HERE, 'douyin-qr-refresh.mjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function state() {
  try {
    const r = await fetch(`${API}/douyin/state`, { signal: AbortSignal.timeout(15000) });
    return await r.json();
  } catch {
    return null;
  }
}

const t = () => new Date().toTimeString().slice(0, 8);
const s0 = await state();
if (s0 && (s0.loggedIn || s0.account)) {
  console.log(`${t()} 已经登录了：${s0.account?.nickname || s0.account || '好'}`);
  process.exit(0);
}

for (let i = 1; i <= MAX; i++) {
  try {
    const { stdout } = await run(process.execPath, [REFRESH], { timeout: 90000 });
    const expired = /仍显示失效=true/.test(stdout);
    console.log(`${t()} 第 ${i}/${MAX} 次刷新：${expired ? '还是失效' : '新码已落盘'}`);
  } catch (e) {
    console.log(`${t()} 第 ${i}/${MAX} 次刷新失败：${String(e.message || e).split('\n')[0]}`);
  }
  for (let k = 0; k < 9; k++) {
    await sleep(5000);
    const s = await state();
    if (s && (s.loggedIn || s.account)) {
      console.log(`🎉 ${t()} 登录成功：${s.account?.nickname || JSON.stringify(s.account)}`);
      process.exit(0);
    }
  }
}
console.log(`${t()} 保鲜结束，仍未登录（二维码不会再自己刷了）`);
process.exit(2);
