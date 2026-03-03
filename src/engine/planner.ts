import { EventEmitter } from 'events';
import {
  Task,
  TaskPlan,
  TaskPlanItem,
  TaskContext,
  TaskResult,
  createTask,
  isAtomicTask,
  TaskPriority,
} from './types';
import { ToolRegistry } from '../tools/registry';
import { MemorySystem } from '../memory';
import { Config, Message } from '../types';
import { chatStream } from '../providers';

const PLANNING_PROMPT = `你是一个任务规划助手。你的工作是分析任务并决定如何执行。

## 当前上下文

### 用户记忆和约束
{{MEMORY_CONTEXT}}

### 可用工具
{{TOOLS_CONTEXT}}

### 用户约束
{{CONSTRAINTS_CONTEXT}}

### 之前的执行结果
{{RESULTS_CONTEXT}}

## 当前任务
{{TASK_DESCRIPTION}}

## 你的任务

分析上述任务，判断：

1. **这个任务能否执行？**
   - 检查是否有必要的工具
   - 检查是否满足用户约束
   - 检查是否有足够的信息

2. **这个任务需要拆解吗？**
   - 如果任务可以用单个工具完成，则不需要拆解
   - 如果任务涉及多个步骤，则需要拆解

3. **如果需要拆解，拆解成哪些子任务？**
   - 每个子任务应该是独立的、可执行的
   - 标明子任务之间的依赖关系

## 输出格式

请以严格的 JSON 格式输出，不要包含任何其他内容：

{
  "canExecute": true/false,
  "reason": "如果不能执行，说明原因",
  "needsUserInput": true/false,
  "userInputPrompt": "如果需要用户输入，询问的问题",
  "shouldSplit": true/false,
  "toolToUse": {
    "toolName": "工具名称",
    "args": { "参数": "值" }
  },
  "subTasks": [
    {
      "description": "子任务描述",
      "priority": "normal/high/low",
      "dependencies": ["依赖的子任务序号，从1开始"]
    }
  ]
}

注意：
- 如果 shouldSplit 为 true，则不要填写 toolToUse
- 如果 shouldSplit 为 false，则必须填写 toolToUse 或说明 canExecute 为 false
- 子任务序号从 1 开始，dependencies 数组中的数字表示该子任务依赖第几个子任务`;

export class TaskPlanner extends EventEmitter {
  private toolRegistry: ToolRegistry;
  private memory: MemorySystem;
  private config: Config;
  private tasks: Map<string, Task> = new Map();

  constructor(toolRegistry: ToolRegistry, memory: MemorySystem, config: Config) {
    super();
    this.toolRegistry = toolRegistry;
    this.memory = memory;
    this.config = config;
  }

  addTask(task: Task): void {
    this.tasks.set(task.id, task);
  }

  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  removeTask(taskId: string): void {
    this.tasks.delete(taskId);
  }

  async plan(task: Task): Promise<TaskPlan> {
    this.emit('planning', task);

    const context = await this.buildContext(task);
    const prompt = this.buildPlanningPrompt(task, context);

    try {
      const plan = await this.callAIForPlan(prompt, task);
      this.emit('planned', task, plan);
      return plan;
    } catch (error: any) {
      this.emit('error', task, error);
      return {
        taskId: task.id,
        canExecute: false,
        reason: error.message || '规划失败',
      };
    }
  }

  private async buildContext(task: Task): Promise<TaskContext> {
    const memoryContext = this.memory.getLongTermPrompt() || '暂无用户记忆';
    const toolsContext = this.toolRegistry.formatForPrompt() || '暂无可用工具';
    
    const userConstraints: string[] = [];
    const memories = this.memory.getLongTermMemories();
    for (const mem of memories) {
      if (mem.type === 'instruction' || mem.type === 'preference') {
        userConstraints.push(mem.content);
      }
    }

    const previousResults = new Map<string, TaskResult>();
    if (task.parentTaskId) {
      const parent = this.tasks.get(task.parentTaskId);
      if (parent) {
        for (const subTaskId of parent.subTaskIds) {
          const subTask = this.tasks.get(subTaskId);
          if (subTask?.result) {
            previousResults.set(subTaskId, subTask.result);
          }
        }
      }
    }

    return {
      memoryContext,
      availableTools: toolsContext,
      userConstraints,
      previousResults,
    };
  }

  private buildPlanningPrompt(task: Task, context: TaskContext): string {
    let resultsContext = '暂无之前的执行结果';
    if (context.previousResults.size > 0) {
      resultsContext = '';
      for (const [id, result] of context.previousResults) {
        const subTask = this.tasks.get(id);
        resultsContext += `- ${subTask?.description || id}: ${result.success ? '成功' : '失败'}\n`;
        if (result.data) {
          resultsContext += `  结果: ${JSON.stringify(result.data).substring(0, 200)}...\n`;
        }
      }
    }

    return PLANNING_PROMPT
      .replace('{{MEMORY_CONTEXT}}', context.memoryContext)
      .replace('{{TOOLS_CONTEXT}}', context.availableTools)
      .replace('{{CONSTRAINTS_CONTEXT}}', context.userConstraints.join('\n') || '无特殊约束')
      .replace('{{RESULTS_CONTEXT}}', resultsContext)
      .replace('{{TASK_DESCRIPTION}}', task.description);
  }

  private async callAIForPlan(prompt: string, task: Task): Promise<TaskPlan> {
    const messages: Message[] = [
      { role: 'system', content: '你是一个任务规划助手，只输出 JSON 格式的结果。' },
      { role: 'user', content: prompt },
    ];

    let fullResponse = '';

    return new Promise((resolve, reject) => {
      chatStream(this.config, messages, {
        onContent: (chunk) => {
          fullResponse += chunk;
        },
        onComplete: () => {
          try {
            const json = this.extractJSON(fullResponse);
            const plan = this.parsePlan(json, task);
            resolve(plan);
          } catch (error: any) {
            reject(new Error(`解析规划结果失败: ${error.message}`));
          }
        },
        onError: (error) => {
          reject(error);
        },
      });
    });
  }

  private extractJSON(text: string): any {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('未找到有效的 JSON');
    }
    return JSON.parse(jsonMatch[0]);
  }

  private parsePlan(json: any, task: Task): TaskPlan {
    const plan: TaskPlan = {
      taskId: task.id,
      canExecute: json.canExecute !== false,
      reason: json.reason,
      needsUserInput: json.needsUserInput,
      userInputPrompt: json.userInputPrompt,
    };

    if (json.shouldSplit && json.subTasks) {
      plan.subTasks = json.subTasks.map((item: any, index: number) => ({
        description: item.description,
        priority: (item.priority as TaskPriority) || 'normal',
        dependencies: (item.dependencies || []).map((d: number) => 
          `${task.id}-sub-${d}`
        ),
      }));
    } else if (json.toolToUse) {
      plan.toolToUse = {
        toolId: `tool:${json.toolToUse.toolName}`,
        toolName: json.toolToUse.toolName,
        args: json.toolToUse.args || {},
      };
    }

    return plan;
  }

  createSubTasks(parentTask: Task, planItems: TaskPlanItem[]): Task[] {
    const subTasks: Task[] = [];

    for (let i = 0; i < planItems.length; i++) {
      const item = planItems[i];
      const subTask = createTask(item.description, {
        parentTaskId: parentTask.id,
        priority: item.priority || parentTask.priority,
        depth: parentTask.depth + 1,
        dependencies: item.dependencies || [],
      });

      subTasks.push(subTask);
      this.tasks.set(subTask.id, subTask);
    }

    parentTask.subTaskIds = subTasks.map(t => t.id);
    parentTask.status = 'splitted';

    return subTasks;
  }
}
