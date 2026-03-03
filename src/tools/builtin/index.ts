export * from './memory';
export * from './system';
export * from './file';

import { UnifiedTool } from '../types';
import { memoryTools } from './memory';
import { systemTools } from './system';
import { fileTools } from './file';

export const allBuiltinTools: UnifiedTool[] = [
  ...memoryTools,
  ...systemTools,
  ...fileTools,
];

export function registerBuiltinTools(registry: {
  register: (tool: UnifiedTool) => void;
}): void {
  for (const tool of allBuiltinTools) {
    registry.register(tool);
  }
}
