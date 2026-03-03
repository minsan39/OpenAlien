import { EventEmitter } from 'events';
import {
  Task,
  TaskResult,
  TaskExecutionOptions,
  isAtomicTask,
  isTaskCompleted,
} from './types';
import { ToolRegistry } from '../tools/registry';
import { TaskPlanner } from './planner';

export class TaskExecutor extends EventEmitter {
  private toolRegistry: ToolRegistry;
  private planner: TaskPlanner;
  private options: TaskExecutionOptions;

  constructor(
    toolRegistry: ToolRegistry,
    planner: TaskPlanner,
    options: TaskExecutionOptions = {}
  ) {
    super();
    this.toolRegistry = toolRegistry;
    this.planner = planner;
    this.options = {
      timeout: 60000,
      maxRetries: 3,
      ...options,
    };
  }

  async execute(task: Task): Promise<TaskResult> {
    this.emit('executing', task);
    task.status = 'executing';
    task.startedAt = Date.now();

    try {
      const plan = await this.planner.plan(task);

      if (plan.needsUserInput) {
        this.emit('needsInput', task, plan.userInputPrompt || '需要用户输入');
        return {
          success: false,
          error: '需要用户输入',
          duration: Date.now() - task.startedAt,
        };
      }

      if (!plan.canExecute) {
        task.status = 'failed';
        task.error = plan.reason || '无法执行此任务';
        this.emit('failed', task, task.error);
        return {
          success: false,
          error: task.error,
          duration: Date.now() - task.startedAt,
        };
      }

      if (plan.subTasks && plan.subTasks.length > 0) {
        const subTasks = this.planner.createSubTasks(task, plan.subTasks);
        this.emit('splitted', task, subTasks);
        return {
          success: true,
          data: { subTaskIds: subTasks.map(t => t.id) },
          duration: Date.now() - task.startedAt,
        };
      }

      if (plan.toolToUse) {
        task.toolId = plan.toolToUse.toolId;
        task.toolName = plan.toolToUse.toolName;
        task.toolArgs = plan.toolToUse.args;

        const result = await this.executeTool(task);
        task.result = result;
        task.status = result.success ? 'completed' : 'failed';
        task.completedAt = Date.now();

        if (result.success) {
          this.emit('completed', task, result);
        } else {
          this.emit('failed', task, result.error);
        }

        return result;
      }

      task.status = 'failed';
      task.error = '无法确定如何执行此任务';
      return {
        success: false,
        error: task.error,
        duration: Date.now() - task.startedAt,
      };
    } catch (error: any) {
      task.status = 'failed';
      task.error = error.message;
      task.completedAt = Date.now();
      this.emit('failed', task, error.message);
      return {
        success: false,
        error: error.message,
        duration: Date.now() - task.startedAt,
      };
    }
  }

  private async executeTool(task: Task): Promise<TaskResult> {
    if (!task.toolName) {
      return {
        success: false,
        error: '未指定工具',
        duration: 0,
      };
    }

    const startTime = Date.now();

    try {
      const result = await this.runWithTimeout(
        this.toolRegistry.execute(task.toolName, task.toolArgs || {}),
        this.options.timeout || 60000
      );

      return {
        success: result.success,
        data: result.data,
        error: result.error,
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      };
    }
  }

  private runWithTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`执行超时 (${timeout}ms)`));
      }, timeout);

      promise
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  async retry(task: Task): Promise<TaskResult> {
    if (task.retryCount >= (task.maxRetries || this.options.maxRetries || 3)) {
      return {
        success: false,
        error: '已达到最大重试次数',
        duration: 0,
      };
    }

    task.retryCount++;
    task.status = 'pending';
    task.error = undefined;

    return this.execute(task);
  }

  cancel(task: Task): void {
    if (!isTaskCompleted(task)) {
      task.status = 'cancelled';
      task.completedAt = Date.now();
      this.emit('cancelled', task);
    }
  }
}
