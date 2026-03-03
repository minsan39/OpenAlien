#!/usr/bin/env node

import { MCPServer } from './server';
import { registerFilesystemTools } from './tools';

const SERVER_NAME = 'openalien-filesystem';
const SERVER_VERSION = '0.1.0';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const allowedDirs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--allow' || args[i] === '-a') {
      const dir = args[++i];
      if (dir) {
        allowedDirs.push(dir);
      }
    }
  }

  const server = new MCPServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      tools: { listChanged: false },
    }
  );

  if (allowedDirs.length > 0) {
    server.setAllowedDirectories(allowedDirs);
  }

  registerFilesystemTools(server);

  await server.start();
}

main().catch((error) => {
  process.stderr.write(`Fatal error: ${error.message}\n`);
  process.exit(1);
});
