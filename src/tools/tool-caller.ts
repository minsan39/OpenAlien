import { ToolRegistry } from './registry';
import { ToolCallResult } from './types';

export const TOOL_CALL_START = '<tool_call=';
export const TOOL_CALL_END = '>';

export const TOOL_CALLING_PROMPT = `

【工具调用说明】

当你需要使用工具来完成任务时，请严格按照以下格式输出：

<tool_call={"name": "工具名称", "args": {"参数名": "参数值"}}>

⚠️ 格式要求（非常重要）：
- 必须包含 "name" 字段（注意是 name，不是其他词）
- 工具名称必须完全匹配可用工具列表中的名称

正确示例：
<tool_call={"name": "current_time", "args": {"format": "full"}}>
<tool_call={"name": "read_file", "args": {"file_path": "package.json"}}>

错误示例（不要这样写）：
<tool_call={"": "current_time", ...}>        ❌ 缺少 "name" 字段名
<tool_call={"工具": "current_time", ...}>    ❌ 字段名必须是 "name"
<tool_call={"name": "current", ...}>         ❌ 工具名称不完整

【工具调用流程】

1. 分析用户需求，判断是否需要使用工具
2. 如果需要工具，输出工具调用
3. 系统执行工具并返回结果
4. 验证结果：检查工具返回的结果是否符合用户的要求
5. 如果结果不符合要求，分析原因并重新调用工具（修正参数或换工具）
6. 如果结果符合要求，用自然语言汇总结果，输出给用户

【验证检查点】

工具执行后，你必须在 <think&gt;</think&gt; 中进行验证：
- 结果是否完整？
- 结果格式是否正确？
- 是否满足用户的具体要求？
- 如果有错误，是什么原因？如何修正？

【输出要求】

最终输出时，不要直接展示原始的工具返回数据，而是：
1. 用自然语言解释结果
2. 提取用户关心的关键信息
3. 如果用户问的是时间/日期等，用友好的中文格式回答

重要规则：
1. 每次只能调用一个工具
2. JSON格式必须正确，"name" 字段不能省略
3. 工具名称必须完全匹配，不能简写
4. 工具调用后，必须验证结果是否符合用户要求
5. 如果结果不符合要求，重新调用工具（最多重试3次）
6. 如果没有合适的工具，请直接告诉用户
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

    let jsonStr = text.substring(startIndex + TOOL_CALL_START.length, endIndex);

    // 尝试修复常见的JSON格式错误
    jsonStr = this.fixJsonString(jsonStr);

    try {
      let parsed = JSON.parse(jsonStr);
      
      // 容错处理：如果 name 字段为空或不存在，尝试从其他字段推断
      if (!parsed.name || parsed.name === '') {
        // 检查是否有空键名的情况，如 {"": "current_time"}
        const emptyKeyMatch = jsonStr.match(/""\s*:\s*"([^"]+)"/);
        if (emptyKeyMatch) {
          parsed.name = emptyKeyMatch[1];
        }
      }
      
      if (parsed.name && typeof parsed.name === 'string' && parsed.name !== '') {
        return {
          name: parsed.name,
          args: parsed.args || {},
          raw: text.substring(startIndex, endIndex + TOOL_CALL_END.length),
        };
      }
    } catch (error) {
      // JSON解析失败，尝试用正则提取
      const nameMatch = jsonStr.match(/"name"\s*:\s*"([^"]+)"/);
      if (nameMatch) {
        const argsMatch = jsonStr.match(/"args"\s*:\s*(\{[^}]*\})/);
        let args = {};
        if (argsMatch) {
          try {
            args = JSON.parse(argsMatch[1]);
          } catch (e) {}
        }
        return {
          name: nameMatch[1],
          args,
          raw: text.substring(startIndex, endIndex + TOOL_CALL_END.length),
        };
      }
    }

    return null;
  }

  private static fixJsonString(jsonStr: string): string {
    // 修复缺少逗号的情况: "name": "xxx" "args" -> "name": "xxx", "args"
    jsonStr = jsonStr.replace(/"([^"]+)"\s*:\s*"([^"]+)"\s*"([^"]+)"/g, '"$1": "$2", "$3"');
    
    // 修复缺少逗号的情况: } { -> }, {
    jsonStr = jsonStr.replace(/\}\s*\{/g, '}, {');
    
    // 修复缺少逗号的情况: ] [ -> ], [
    jsonStr = jsonStr.replace(/\]\s*\[/g, '], [');
    
    // 修复值后面缺少逗号: "value" "key" -> "value", "key"
    jsonStr = jsonStr.replace(/"([^"]+)"\s+"([^"]+)"/g, '"$1", "$2"');
    
    return jsonStr;
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
