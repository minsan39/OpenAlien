import { ToolRegistry } from './registry';
import { ToolCallResult } from './types';

export const TOOL_CALL_START = '<tool_call=';
export const TOOL_CALL_END = '>';

export const TOOL_CALLING_PROMPT = `

【工具调用说明】

当你需要使用工具来完成任务时，请按以下格式输出：

<tool_call={"name": "工具名称", "args": {"参数名": "参数值"}}>

例如：
- 读取文件: <tool_call={"name": "read_file", "args": {"file_path": "src/index.ts"}}>
- 获取时间: <tool_call={"name": "current_time", "args": {"format": "full"}}>
- 搜索记忆: <tool_call={"name": "memory_search", "args": {"query": "项目"}}>

重要规则：
1. 每次只能调用一个工具
2. 工具调用后，系统会返回结果，你再根据结果继续回答
3. 如果任务复杂，可以多次调用工具
4. 如果没有合适的工具，请直接告诉用户

工具调用示例对话：
用户: 帮我看看 package.json 文件的内容
AI: <tool_call={"name": "read_file", "args": {"file_path": "package.json"}}>
系统: {"success": true, "data": {"content": "...文件内容..."}}
AI: 这是 package.json 文件的内容：...
`;

export interface ParsedToolCall {
  name: string;
  args: Record<string, any>;
  raw: string;
}

export class ToolCallParser {
  static parse(text: string): ParsedToolCall | null {
    const startIndex = text.indexOf(TOOL_CALL_START);
    if (startIndex === -1) return null;

    const endIndex = text.indexOf(TOOL_CALL_END, startIndex);
    if (endIndex === -1) return null;

    const jsonStr = text.substring(startIndex + TOOL_CALL_START.length, endIndex);

    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed.name && typeof parsed.name === 'string') {
        return {
          name: parsed.name,
          args: parsed.args || {},
          raw: text.substring(startIndex, endIndex + TOOL_CALL_END.length),
        };
      }
    } catch (error) {
    }

    return null;
  }

  static parseAll(text: string): ParsedToolCall[] {
    const calls: ParsedToolCall[] = [];
    let remaining = text;

    while (true) {
      const call = this.parse(remaining);
      if (!call) break;

      calls.push(call);
      const callEnd = remaining.indexOf(TOOL_CALL_END) + TOOL_CALL_END.length;
      remaining = remaining.substring(callEnd);
    }

    return calls;
  }

  static hasToolCall(text: string): boolean {
    return text.includes(TOOL_CALL_START);
  }

  static removeToolCalls(text: string): string {
    let result = text;
    
    while (true) {
      const call = this.parse(result);
      if (!call) break;
      
      result = result.replace(call.raw, '');
    }

    return result.trim();
  }
}

export class ToolCaller {
  private registry: ToolRegistry;

  constructor(registry: ToolRegistry) {
    this.registry = registry;
  }

  async executeFromText(text: string): Promise<{
    toolCall: ParsedToolCall | null;
    result: ToolCallResult | null;
    cleanedText: string;
  }> {
    const toolCall = ToolCallParser.parse(text);

    if (!toolCall) {
      return {
        toolCall: null,
        result: null,
        cleanedText: text,
      };
    }

    const result = await this.registry.execute(toolCall.name, toolCall.args);
    const cleanedText = ToolCallParser.removeToolCalls(text);

    return {
      toolCall,
      result,
      cleanedText,
    };
  }

  async executeMultipleFromText(text: string): Promise<{
    toolCalls: ParsedToolCall[];
    results: ToolCallResult[];
    cleanedText: string;
  }> {
    const toolCalls = ToolCallParser.parseAll(text);

    if (toolCalls.length === 0) {
      return {
        toolCalls: [],
        results: [],
        cleanedText: text,
      };
    }

    const results: ToolCallResult[] = [];
    for (const call of toolCalls) {
      const result = await this.registry.execute(call.name, call.args);
      results.push(result);
    }

    const cleanedText = ToolCallParser.removeToolCalls(text);

    return {
      toolCalls,
      results,
      cleanedText,
    };
  }
}
