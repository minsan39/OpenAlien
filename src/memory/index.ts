import { ShortTermMemory } from './short-term';
import { LongTermMemorySystem } from './long-term';
import { TrashSystem } from './trash';
import { Session, LongTermMemory, Message, TrashMemory } from './types';
import { Config } from '../types';
import { chatStream } from '../providers';
import chalk from 'chalk';

export { ShortTermMemory } from './short-term';
export { LongTermMemorySystem } from './long-term';
export { TrashSystem } from './trash';
export * from './types';

const MEMORY_EXTRACTION_PROMPT = `分析以下对话，判断需要记住或遗忘的信息。

需要记住的信息类型：
1. 用户明确表达的偏好（"我喜欢..."、"我不喜欢..."）
2. 用户明确要求记住的内容（"记住..."、"别忘了..."）
3. 用户的重要个人信息（项目名称、技术栈、工作内容等）

不需要记住的内容：
1. AI的自我介绍、能力说明
2. 临时性的对话内容
3. 普通的问候和闲聊
4. 用户没有明确表达偏好的内容

需要遗忘的情况：
1. 用户明确说"忘记"、"删掉"、"不用记了"等
2. 用户纠正之前的信息

输出格式（严格JSON）：
{
  "toSave": [{"type": "preference|user_habit|important_info", "content": "具体内容"}],
  "toDelete": ["要删除的记忆内容"]
}

注意：
- 非常保守地判断，只有真正重要、用户明确表达的信息才记住
- 不要记住AI说的内容
- 不要从AI的回答中推断用户偏好
- content 要简洁明确，不超过50字
- 如果没有需要处理的，返回 {"toSave": [], "toDelete": []}
- 必须返回有效JSON`;

const SESSION_REVIEW_PROMPT = `分析以下会话历史，提取所有值得长期记住的信息。

需要记住的信息类型：
1. 用户明确表达的偏好（"我喜欢..."、"我不喜欢..."）
2. 用户明确要求记住的内容
3. 用户的重要个人信息

不需要记住的内容：
1. AI的自我介绍、能力说明
2. 临时性的对话内容
3. 普通的问候和闲聊

输出格式（严格JSON）：
{"memories": [{"type": "preference|user_habit|important_info", "content": "具体内容"}]}

注意：
- 非常保守地判断，只有真正重要的信息才记住
- 不要记住AI说的内容
- 不要从AI的回答中推断用户偏好
- content 要简洁明确，不超过50字
- 如果没有需要记住的信息，返回 {"memories": []}
- 必须返回有效JSON`;

const MEMORY_CLEANUP_PROMPT = `分析以下长期记忆列表，判断哪些应该删除。

应该删除的情况：
1. 已过时的信息（比如"今天要开会"这种临时性的）
2. 错误或矛盾的信息
3. 不再相关的内容
4. 重复或冗余的信息

输出格式（严格JSON）：
{"toDelete": ["要删除的记忆内容1", "要删除的记忆内容2"]}

如果没有需要删除的，返回 {"toDelete": []}
必须返回有效JSON`;

const SEMANTIC_SEARCH_PROMPT = `你是一个记忆检索助手。用户想要查找相关的记忆。

用户查询：{{QUERY}}

记忆列表：
{{MEMORY_LIST}}

请分析哪些记忆与用户查询相关。相关性判断标准：
1. 直接提及查询中的关键词
2. 语义相关（意思相近但不完全相同）
3. 可能是用户想要回忆的内容

输出格式（严格JSON）：
{
  "relevantMemories": [
    {
      "content": "记忆内容",
      "relevance": "high|medium|low",
      "reason": "为什么相关"
    }
  ],
  "summary": "简要总结找到的相关记忆"
}

注意：
- 只返回真正相关的记忆
- 按相关性排序（high在前）
- 如果没有相关记忆，返回 {"relevantMemories": [], "summary": "未找到相关记忆"}
- 必须返回有效JSON`;

export class MemorySystem {
  private shortTerm: ShortTermMemory;
  private longTerm: LongTermMemorySystem;
  private trash: TrashSystem;
  private config: Config | null = null;

  constructor() {
    this.shortTerm = new ShortTermMemory();
    this.longTerm = new LongTermMemorySystem();
    this.trash = new TrashSystem();
  }

  setConfig(config: Config): void {
    this.config = config;
  }

  startSession(provider?: string, model?: string): Session {
    return this.shortTerm.startNewSession(provider, model);
  }

  loadSession(sessionId: string): Session | null {
    return this.shortTerm.loadSession(sessionId);
  }

  addMessage(role: 'user' | 'assistant', content: string): void {
    this.shortTerm.addMessage(role, content);
  }

  getMessages(): Message[] {
    return this.shortTerm.getMessages();
  }

  getCurrentSession(): Session | null {
    return this.shortTerm.getCurrentSession();
  }

  getAllSessions(): Session[] {
    return this.shortTerm.getAllSessions();
  }

  deleteSession(sessionId: string): boolean {
    return this.shortTerm.deleteSession(sessionId);
  }

  saveToLongTerm(type: LongTermMemory['type'], content: string): LongTermMemory {
    const session = this.shortTerm.getCurrentSession();
    const source = session?.id;
    return this.longTerm.addMemory(type, content, source);
  }

  getLongTermMemories(): LongTermMemory[] {
    return this.longTerm.getAllMemories();
  }

  getLongTermPrompt(): string {
    return this.longTerm.formatForPrompt();
  }

  async generateSessionTitle(): Promise<string> {
    const messages = this.shortTerm.getMessages();
    if (messages.length === 0) {
      return '新对话';
    }

    const userMessages = messages
      .filter(m => m.role === 'user')
      .slice(0, 3)
      .map(m => m.content)
      .join('\n');

    if (!this.config) {
      return this.generateLocalTitle(userMessages);
    }

    try {
      let title = '';
      const systemPrompt = '请用一句话概括以下对话的主题，不超过15个字，不要加引号：';
      
      await chatStream(
        this.config,
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessages },
        ],
        {
          onContent: (chunk) => {
            title += chunk;
          },
        }
      );

      title = title.replace(/["""''「」【】]/g, '').trim();
      return title.substring(0, 30) || '新对话';
    } catch (e) {
      return this.generateLocalTitle(userMessages);
    }
  }

  private generateLocalTitle(content: string): string {
    const firstLine = content.split('\n')[0].trim();
    if (firstLine.length <= 20) {
      return firstLine || '新对话';
    }
    return firstLine.substring(0, 20) + '...';
  }

  async saveAndClose(): Promise<void> {
    const session = this.shortTerm.getCurrentSession();
    
    if (session && session.messages.length > 0) {
      const title = await this.generateSessionTitle();
      this.shortTerm.setTitle(title);
      this.shortTerm.saveSessionToHistory();
      console.log(chalk.gray(`  💾 会话已保存: ${title}`));
    }
    
    this.shortTerm.clearCurrentSession();
  }

  getMemorySummary(): { sessions: number; memories: number; trashCount: number } {
    const sessions = this.shortTerm.getAllSessions();
    const memories = this.longTerm.getAllMemories();
    
    return {
      sessions: sessions.length,
      memories: memories.length,
      trashCount: this.trash.getTrashCount(),
    };
  }

  async extractMemoriesFromConversation(userMessage: string, assistantMessage: string): Promise<void> {
    if (!this.config) return;

    try {
      let response = '';
      await chatStream(
        this.config,
        [
          { role: 'system', content: MEMORY_EXTRACTION_PROMPT },
          { role: 'user', content: `用户: ${userMessage}\n助手: ${assistantMessage}` },
        ],
        {
          onContent: (chunk) => {
            response += chunk;
          },
        }
      );

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return;

      const result = JSON.parse(jsonMatch[0]);
      
      if (result.toDelete && Array.isArray(result.toDelete)) {
        for (const contentToDelete of result.toDelete) {
          if (this.deleteMemoryByContent(contentToDelete, 'user_request')) {
            console.log(chalk.gray(`  🗑️ 已移入回收站: ${contentToDelete.substring(0, 30)}...`));
          }
        }
      }
      
      if (result.toSave && Array.isArray(result.toSave)) {
        for (const memory of result.toSave) {
          if (memory.content && !this.isDuplicateMemory(memory.content)) {
            this.longTerm.addMemory(memory.type || 'important_info', memory.content);
            console.log(chalk.gray(`  🧠 已记住: ${memory.content.substring(0, 30)}...`));
          }
        }
      }
    } catch (e) {
      // Silently fail - memory extraction should not interrupt conversation
    }
  }

  async reviewRecentSessions(): Promise<void> {
    if (!this.config) return;

    const sessions = this.shortTerm.getAllSessions().slice(0, 5);
    if (sessions.length === 0) return;

    console.log(chalk.gray('  🔍 正在回顾历史会话，提取重要信息...'));

    for (const session of sessions) {
      if (session.messages.length < 2) continue;

      try {
        const conversationText = session.messages
          .map(m => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`)
          .join('\n');

        let response = '';
        await chatStream(
          this.config,
          [
            { role: 'system', content: SESSION_REVIEW_PROMPT },
            { role: 'user', content: conversationText.substring(0, 2000) },
          ],
          {
            onContent: (chunk) => {
              response += chunk;
            },
          }
        );

        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) continue;

        const result = JSON.parse(jsonMatch[0]);
        
        if (result.memories && Array.isArray(result.memories)) {
          for (const memory of result.memories) {
            if (memory.content && !this.isDuplicateMemory(memory.content)) {
              this.longTerm.addMemory(memory.type || 'important_info', memory.content);
            }
          }
        }
      } catch (e) {
        // Continue with next session
      }
    }
  }

  private isDuplicateMemory(content: string): boolean {
    const memories = this.longTerm.getAllMemories();
    const normalizedNew = content.toLowerCase().trim();
    
    return memories.some(m => {
      const normalizedExisting = m.content.toLowerCase().trim();
      return normalizedNew === normalizedExisting || 
             normalizedNew.includes(normalizedExisting) ||
             normalizedExisting.includes(normalizedNew);
    });
  }

  async cleanupMemories(): Promise<number> {
    if (!this.config) return 0;

    const memories = this.longTerm.getAllMemories();
    if (memories.length === 0) return 0;

    try {
      const memoryList = memories.map(m => `- ${m.content}`).join('\n');
      
      let response = '';
      await chatStream(
        this.config,
        [
          { role: 'system', content: MEMORY_CLEANUP_PROMPT },
          { role: 'user', content: `当前长期记忆列表：\n${memoryList}` },
        ],
        {
          onContent: (chunk) => {
            response += chunk;
          },
        }
      );

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return 0;

      const result = JSON.parse(jsonMatch[0]);
      let deletedCount = 0;
      
      if (result.toDelete && Array.isArray(result.toDelete)) {
        for (const contentToDelete of result.toDelete) {
          const memoryToDelete = memories.find(m => 
            m.content.includes(contentToDelete) || contentToDelete.includes(m.content)
          );
          
          if (memoryToDelete) {
            this.trash.moveToTrash(memoryToDelete, 'cleanup');
            this.longTerm.deleteMemory(memoryToDelete.id);
            deletedCount++;
            console.log(chalk.gray(`  🗑️ 已移入回收站: ${memoryToDelete.content.substring(0, 30)}...`));
          }
        }
      }
      
      return deletedCount;
    } catch (e) {
      return 0;
    }
  }

  deleteMemoryByContent(content: string, reason: TrashMemory['deleteReason'] = 'user_request'): boolean {
    const memories = this.longTerm.getAllMemories();
    const memoryToDelete = memories.find(m => 
      m.content.toLowerCase().includes(content.toLowerCase()) ||
      content.toLowerCase().includes(m.content.toLowerCase())
    );
    
    if (memoryToDelete) {
      this.trash.moveToTrash(memoryToDelete, reason);
      return this.longTerm.deleteMemory(memoryToDelete.id);
    }
    return false;
  }

  getTrashMemories(): TrashMemory[] {
    return this.trash.getAllTrash();
  }

  searchTrash(query: string): TrashMemory[] {
    return this.trash.searchTrash(query);
  }

  getTrashPrompt(): string {
    return this.trash.formatTrashForPrompt();
  }

  emptyTrash(): number {
    return this.trash.emptyTrash();
  }

  async semanticSearch(query: string): Promise<{
    results: Array<{
      content: string;
      type: string;
      relevance: string;
      reason: string;
    }>;
    summary: string;
  }> {
    const memories = this.longTerm.getAllMemories();
    
    if (memories.length === 0) {
      return { results: [], summary: '暂无记忆' };
    }

    if (!this.config) {
      const keywordResults = this.keywordSearch(query);
      return {
        results: keywordResults.map(m => ({
          content: m.content,
          type: m.type,
          relevance: 'medium',
          reason: '关键词匹配',
        })),
        summary: `找到 ${keywordResults.length} 条相关记忆`,
      };
    }

    try {
      const memoryList = memories
        .slice(0, 30)
        .map((m, i) => `${i + 1}. [${m.type}] ${m.content}`)
        .join('\n');

      const prompt = SEMANTIC_SEARCH_PROMPT
        .replace('{{QUERY}}', query)
        .replace('{{MEMORY_LIST}}', memoryList);

      let response = '';
      await chatStream(
        this.config,
        [
          { role: 'system', content: '你是一个记忆检索助手，只输出 JSON 格式的结果。' },
          { role: 'user', content: prompt },
        ],
        {
          onContent: (chunk) => {
            response += chunk;
          },
        }
      );

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { results: [], summary: '解析失败' };
      }

      const result = JSON.parse(jsonMatch[0]);
      
      return {
        results: (result.relevantMemories || []).map((m: any) => ({
          content: m.content,
          type: memories.find(mem => mem.content.includes(m.content))?.type || 'unknown',
          relevance: m.relevance,
          reason: m.reason,
        })),
        summary: result.summary || '搜索完成',
      };
    } catch (e) {
      const keywordResults = this.keywordSearch(query);
      return {
        results: keywordResults.map(m => ({
          content: m.content,
          type: m.type,
          relevance: 'low',
          reason: '关键词匹配（语义搜索失败）',
        })),
        summary: `找到 ${keywordResults.length} 条可能相关的记忆`,
      };
    }
  }

  private keywordSearch(query: string): LongTermMemory[] {
    const memories = this.longTerm.getAllMemories();
    const keywords = query.toLowerCase().split(/\s+/);
    
    return memories.filter(m => {
      const content = m.content.toLowerCase();
      return keywords.some(kw => content.includes(kw));
    });
  }

  getRelevantMemories(query: string, limit: number = 5): LongTermMemory[] {
    const memories = this.longTerm.getAllMemories();
    const keywords = query.toLowerCase().split(/\s+/);
    
    const scored = memories.map(m => {
      const content = m.content.toLowerCase();
      let score = 0;
      for (const kw of keywords) {
        if (content.includes(kw)) {
          score += 1;
        }
      }
      return { memory: m, score };
    });

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.memory);
  }
}
