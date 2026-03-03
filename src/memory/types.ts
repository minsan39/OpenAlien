export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface Session {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
  provider?: string;
  model?: string;
}

export interface LongTermMemory {
  id: string;
  type: 'user_habit' | 'important_info' | 'preference' | 'instruction';
  content: string;
  createdAt: number;
  source?: string;
}

export interface TrashMemory extends LongTermMemory {
  deletedAt: number;
  deleteReason?: 'expired' | 'user_request' | 'contradiction' | 'cleanup';
}

export interface MemorySummary {
  totalSessions: number;
  totalMemories: number;
  lastSessionAt?: number;
  trashCount?: number;
}
