import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Session, Message } from './types';

const MEMORY_DIR = path.join(os.homedir(), '.config', 'openalien-nodejs', 'memory');
const SESSIONS_DIR = path.join(MEMORY_DIR, 'sessions');
const CURRENT_SESSION_FILE = path.join(MEMORY_DIR, 'current_session.json');

export class ShortTermMemory {
  private currentSession: Session | null = null;

  constructor() {
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    if (!fs.existsSync(MEMORY_DIR)) {
      fs.mkdirSync(MEMORY_DIR, { recursive: true });
    }
    if (!fs.existsSync(SESSIONS_DIR)) {
      fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    }
  }

  startNewSession(provider?: string, model?: string): Session {
    const now = Date.now();
    this.currentSession = {
      id: this.generateId(),
      title: '',
      createdAt: now,
      updatedAt: now,
      messages: [],
      provider,
      model,
    };
    this.saveCurrentSession();
    return this.currentSession;
  }

  loadSession(sessionId: string): Session | null {
    if (!fs.existsSync(SESSIONS_DIR)) {
      return null;
    }

    const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'));
    
    for (const file of files) {
      try {
        const sessionPath = path.join(SESSIONS_DIR, file);
        const data = fs.readFileSync(sessionPath, 'utf-8');
        const session: Session = JSON.parse(data);
        
        if (session.id === sessionId || session.id.startsWith(sessionId)) {
          this.currentSession = session;
          return this.currentSession;
        }
      } catch (e) {
        // Skip invalid files
      }
    }
    return null;
  }

  addMessage(role: 'user' | 'assistant', content: string): void {
    if (!this.currentSession) {
      this.startNewSession();
    }
    
    const message: Message = {
      role,
      content,
      timestamp: Date.now(),
    };
    
    this.currentSession!.messages.push(message);
    this.currentSession!.updatedAt = Date.now();
    this.saveCurrentSession();
  }

  getMessages(): Message[] {
    return this.currentSession?.messages || [];
  }

  getCurrentSession(): Session | null {
    return this.currentSession;
  }

  setTitle(title: string): void {
    if (this.currentSession) {
      this.currentSession.title = title;
      this.currentSession.updatedAt = Date.now();
      this.saveCurrentSession();
    }
  }

  private saveCurrentSession(): void {
    if (this.currentSession) {
      fs.writeFileSync(CURRENT_SESSION_FILE, JSON.stringify(this.currentSession, null, 2));
    }
  }

  saveSessionToHistory(): void {
    if (this.currentSession && this.currentSession.messages.length > 0) {
      const sessionPath = path.join(SESSIONS_DIR, `${this.currentSession.id}.json`);
      fs.writeFileSync(sessionPath, JSON.stringify(this.currentSession, null, 2));
    }
  }

  getAllSessions(): Session[] {
    const sessions: Session[] = [];
    
    if (!fs.existsSync(SESSIONS_DIR)) {
      return sessions;
    }

    const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'));
    
    for (const file of files) {
      try {
        const data = fs.readFileSync(path.join(SESSIONS_DIR, file), 'utf-8');
        const session: Session = JSON.parse(data);
        sessions.push(session);
      } catch (e) {
        // Skip invalid files
      }
    }

    return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  deleteSession(sessionId: string): boolean {
    const sessionPath = path.join(SESSIONS_DIR, `${sessionId}.json`);
    if (fs.existsSync(sessionPath)) {
      fs.unlinkSync(sessionPath);
      return true;
    }
    return false;
  }

  clearCurrentSession(): void {
    this.currentSession = null;
    if (fs.existsSync(CURRENT_SESSION_FILE)) {
      fs.unlinkSync(CURRENT_SESSION_FILE);
    }
  }

  private generateId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  getSessionSummary(): string {
    if (!this.currentSession || this.currentSession.messages.length === 0) {
      return '';
    }

    const userMessages = this.currentSession.messages
      .filter(m => m.role === 'user')
      .map(m => m.content)
      .join('\n');

    return userMessages;
  }
}
