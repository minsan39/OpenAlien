import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TrashMemory, LongTermMemory } from './types';

const MEMORY_DIR = path.join(os.homedir(), '.config', 'openalien-nodejs', 'memory');
const TRASH_FILE = path.join(MEMORY_DIR, 'trash.json');

export class TrashSystem {
  private trashedMemories: TrashMemory[] = [];

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
    if (fs.existsSync(TRASH_FILE)) {
      try {
        const data = fs.readFileSync(TRASH_FILE, 'utf-8');
        this.trashedMemories = JSON.parse(data);
      } catch (e) {
        this.trashedMemories = [];
      }
    }
  }

  private save(): void {
    fs.writeFileSync(TRASH_FILE, JSON.stringify(this.trashedMemories, null, 2));
  }

  moveToTrash(
    memory: LongTermMemory,
    reason: TrashMemory['deleteReason']
  ): void {
    const trashMemory: TrashMemory = {
      ...memory,
      deletedAt: Date.now(),
      deleteReason: reason,
    };
    
    this.trashedMemories.push(trashMemory);
    this.save();
  }

  getAllTrash(): TrashMemory[] {
    return [...this.trashedMemories].sort((a, b) => b.deletedAt - a.deletedAt);
  }

  searchTrash(query: string): TrashMemory[] {
    const lowerQuery = query.toLowerCase();
    return this.trashedMemories.filter(m => 
      m.content.toLowerCase().includes(lowerQuery)
    );
  }

  getRecentTrash(days: number = 30): TrashMemory[] {
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    return this.trashedMemories.filter(m => m.deletedAt >= cutoff);
  }

  emptyTrash(): number {
    const count = this.trashedMemories.length;
    this.trashedMemories = [];
    this.save();
    return count;
  }

  getTrashCount(): number {
    return this.trashedMemories.length;
  }

  formatTrashForPrompt(limit: number = 20): string {
    if (this.trashedMemories.length === 0) {
      return '';
    }

    const recent = this.trashedMemories
      .sort((a, b) => b.deletedAt - a.deletedAt)
      .slice(0, limit);

    let output = '【历史记忆（回收站）】\n';
    
    for (const memory of recent) {
      const date = new Date(memory.createdAt).toLocaleDateString('zh-CN');
      output += `- [${date}] ${memory.content}\n`;
    }

    return output;
  }
}
