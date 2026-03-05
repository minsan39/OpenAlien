#!/usr/bin/env node

if (process.platform === 'win32') {
  process.env['TERM'] = 'xterm-utf8';
  process.env['FORCE_COLOR'] = '1';
  try {
    require('child_process').execSync('chcp 65001', { stdio: 'ignore' });
  } catch {}
}

if (process.stdout) {
  process.stdout.setEncoding('utf8');
}
if (process.stderr) {
  process.stderr.setEncoding('utf8');
}

import { getConfig, isConfigured, resetConfig } from './config';
import { ChatSession } from './core';

const args = process.argv.slice(2);

async function main() {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
  OpenAlien - 开源 AI 终端助手

  用法:
    openalien          启动对话
    openalien --reset  重置配置
    openalien --help   显示帮助

  命令:
    /help      显示帮助
    /clear     清空对话
    /thinking  切换思考过程显示
    /config    查看配置
    /exit      退出程序
`);
    process.exit(0);
  }

  if (args.includes('--reset')) {
    resetConfig();
    console.log('✅ 配置已重置');
    process.exit(0);
  }

  let config = getConfig();

  if (!config || !isConfigured()) {
    const { runSetup } = await import('./ui/setup');
    config = await runSetup();
  }

  const session = new ChatSession(config);
  
  process.on('SIGINT', () => {
    session.stop();
    process.exit(0);
  });

  await session.start();
}

main().catch((error) => {
  console.error('❌ 启动失败:', error.message);
  process.exit(1);
});
