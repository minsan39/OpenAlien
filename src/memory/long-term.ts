import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { LongTermMemory, MemorySummary } from './types';

const MEMORY_DIR = path.join(os.homedir(), '.config', 'openalien-nodejs', 'memory');
const LONG_TERM_FILE = path.join(MEMORY_DIR, 'long_term_memory.json');

export class LongTermMemorySystem {
  private memories: LongTermMemory[] = [];

  constructor() {
    this.ensureDirectories();
    this.load();
  }

  private ensureDirectories(): void {
    if (!fs.existsSync(MEMORY_DIR)) {
      fs.mkdirSync(MEMORY_DIR, { recursive: true });
    }
  }

  private load(): void {
    if (fs.existsSync(LONG_TERM_FILE)) {
      try {
        const data = fs.readFileSync(LONG_TERM_FILE, 'utf-8');
        this.memories = JSON.parse(data);
      } catch (e) {
        this.memories = [];
      }
    }
  }

  private save(): void {
    fs.writeFileSync(LONG_TERM_FILE, JSON.stringify(this.memories, null, 2));
  }

  addMemory(
    type: LongTermMemory['type'],
    content: string,
    source?: string
  ): LongTermMemory {
    const memory: LongTermMemory = {
      id: this.generateId(),
      type,
      content,
      createdAt: Date.now(),
      source,
    };
    
    this.memories.push(memory);
    this.save();
    
    return memory;
  }

  getAllMemories(): LongTermMemory[] {
    return [...this.memories].sort((a, b) => b.createdAt - a.createdAt);
  }

  getMemoriesByType(type: LongTermMemory['type']): LongTermMemory[] {
    return this.memories
      .filter(m => m.type === type)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  deleteMemory(id: string): boolean {
    const index = this.memories.findIndex(m => m.id === id);
    if (index !== -1) {
      this.memories.splice(index, 1);
      this.save();
      return true;
    }
    return false;
  }

  clearAll(): void {
    this.memories = [];
    this.save();
  }

  getSummary(): MemorySummary {
    return {
      totalMemories: this.memories.length,
      totalSessions: 0, // This will be updated by the main memory system
      lastSessionAt: undefined,
    };
  }

  formatForPrompt(): string {
    if (this.memories.length === 0) {
      return '';
    }

    const recentMemories = this.memories
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 20);

    let output = '【长期记忆】\n';
    
    const grouped: Record<string, string[]> = {};
    for (const memory of recentMemories) {
      if (!grouped[memory.type]) {
        grouped[memory.type] = [];
      }
      grouped[memory.type].push(memory.content);
    }

    const typeNames: Record<string, string> = {
      user_habit: '用户习惯',
      important_info: '重要信息',
      preference: '偏好设置',
      instruction: '指令记录',
    };

    for (const [type, items] of Object.entries(grouped)) {
      output += `\n${typeNames[type] || type}:\n`;
      for (const item of items) {
        output += `  - ${item}\n`;
      }
    }

    return output;
  }

  private generateId(): string {
    return `mem_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}
