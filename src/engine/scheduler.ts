import { EventEmitter } from 'events';
import {
  Task,
  TaskResult,
  TaskProgress,
  TaskExecutionOptions,
  createTask,
  isTaskCompleted,
  getTaskDuration,
} from './types';
import { TaskPlanner } from './planner';
import { TaskExecutor } from './executor';
import { ToolRegistry } from '../tools/registry';
import { MemorySystem } from '../memory';
import { Config } from '../types';

export interface SchedulerOptions extends TaskExecutionOptions {
  maxConcurrent?: number;
}

export class TaskScheduler extends EventEmitter {
  private planner: TaskPlanner;
  private executor: TaskExecutor;
  private tasks: Map<string, Task> = new Map();
  private pendingQueue: string[] = [];
  private runningTasks: Set<string> = new Set();
  private options: SchedulerOptions;

  constructor(
    toolRegistry: ToolRegistry,
    memory: MemorySystem,
    config: Config,
    options: SchedulerOptions = {}
  ) {
    super();
    this.options = {
      maxConcurrent: 5,
      timeout: 60000,
      maxRetries: 3,
      ...options,
    };

    this.planner = new TaskPlanner(toolRegistry, memory, config);
    this.executor = new TaskExecutor(toolRegistry, this.planner, this.options);

    this.setupEventForwarding();
  }

  private setupEventForwarding(): void {
    this.planner.on('planning', (task) => this.emit('planning', task));
    this.planner.on('planned', (task, plan) => this.emit('planned', task, plan));
    this.planner.on('splitted', (task, subTasks) => this.emit('splitted', task, subTasks));

    this.executor.on('executing', (task) => this.emit('executing', task));
    this.executor.on('completed', (task, result) => this.emit('completed', task, result));
    this.executor.on('failed', (task, error) => this.emit('failed', task, error));
    this.executor.on('cancelled', (task) => this.emit('cancelled', task));
    this.executor.on('needsInput', (task, prompt) => this.emit('needsInput', task, prompt));
  }

  submit(description: string, priority: Task['priority'] = 'normal'): Task {
    const task = createTask(description, { priority });
    this.tasks.set(task.id, task);
    this.planner.addTask(task);
    this.pendingQueue.push(task.id);
    this.emit('submitted', task);
    return task;
  }

  submitTask(task: Task): void {
    this.tasks.set(task.id, task);
    this.planner.addTask(task);
    this.pendingQueue.push(task.id);
    this.emit('submitted', task);
  }

  async run(): Promise<Map<string, TaskResult>> {
    const results = new Map<string, TaskResult>();

    while (this.pendingQueue.length > 0 || this.runningTasks.size > 0) {
      while (
        this.pendingQueue.length > 0 &&
        this.runningTasks.size < (this.options.maxConcurrent || 5)
      ) {
        const taskId = this.pendingQueue.shift()!;
        const task = this.tasks.get(taskId);

        if (task && !isTaskCompleted(task)) {
          this.runTask(task, results);
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return results;
  }

  private async runTask(task: Task, results: Map<string, TaskResult>): Promise<void> {
    if (this.hasUnmetDependencies(task)) {
      this.pendingQueue.push(task.id);
      return;
    }

    this.runningTasks.add(task.id);

    try {
      const result = await this.executor.execute(task);
      results.set(task.id, result);

      if (result.success && result.data?.subTaskIds) {
        for (const subTaskId of result.data.subTaskIds) {
          const subTask = this.tasks.get(subTaskId);
          if (subTask) {
            this.pendingQueue.push(subTaskId);
          }
        }
      }
    } finally {
      this.runningTasks.delete(task.id);
    }
  }

  private hasUnmetDependencies(task: Task): boolean {
    for (const depId of task.dependencies) {
      const depTask = this.tasks.get(depId);
      if (!depTask || !isTaskCompleted(depTask) || depTask.status === 'failed') {
        return true;
      }
    }
    return false;
  }

  async runSingle(taskId: string): Promise<TaskResult | null> {
    const task = this.tasks.get(taskId);
    if (!task) return null;

    return this.executor.execute(task);
  }

  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  getPendingTasks(): Task[] {
    return this.getAllTasks().filter((t) => t.status === 'pending');
  }

  getRunningTasks(): Task[] {
    return this.getAllTasks().filter((t) => t.status === 'executing');
  }

  getCompletedTasks(): Task[] {
    return this.getAllTasks().filter((t) => t.status === 'completed');
  }

  getFailedTasks(): Task[] {
    return this.getAllTasks().filter((t) => t.status === 'failed');
  }

  getProgress(taskId: string): TaskProgress {
    const task = this.tasks.get(taskId);
    if (!task) {
      return {
        taskId,
        status: 'pending',
        progress: 0,
      };
    }

    const progress = this.calculateProgress(task);

    return {
      taskId: task.id,
      status: task.status,
      progress,
      message: this.getStatusMessage(task),
      subProgress: task.subTaskIds.map((id) => this.getProgress(id)),
    };
  }

  private calculateProgress(task: Task): number {
    if (task.status === 'completed') return 100;
    if (task.status === 'failed' || task.status === 'cancelled') return 0;

    if (task.subTaskIds.length === 0) {
      switch (task.status) {
        case 'pending':
          return 0;
        case 'planning':
          return 20;
        case 'executing':
          return 60;
        default:
          return 0;
      }
    }

    let totalProgress = 0;
    for (const subTaskId of task.subTaskIds) {
      const subTask = this.tasks.get(subTaskId);
      if (subTask) {
        totalProgress += this.calculateProgress(subTask);
      }
    }

    return totalProgress / task.subTaskIds.length;
  }

  private getStatusMessage(task: Task): string {
    switch (task.status) {
      case 'pending':
        return '等待执行';
      case 'planning':
        return '正在规划...';
      case 'splitted':
        return '已拆解为子任务';
      case 'executing':
        return task.toolName ? `正在执行: ${task.toolName}` : '正在执行...';
      case 'completed':
        return '已完成';
      case 'failed':
        return `失败: ${task.error || '未知错误'}`;
      case 'cancelled':
        return '已取消';
      default:
        return '未知状态';
    }
  }

  cancel(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      this.executor.cancel(task);
      for (const subTaskId of task.subTaskIds) {
        this.cancel(subTaskId);
      }
    }
  }

  cancelAll(): void {
    for (const task of this.tasks.values()) {
      this.executor.cancel(task);
    }
    this.pendingQueue = [];
    this.runningTasks.clear();
  }

  clear(): void {
    this.tasks.clear();
    this.pendingQueue = [];
    this.runningTasks.clear();
  }

  getStats(): {
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
  } {
    const tasks = this.getAllTasks();
    return {
      total: tasks.length,
      pending: tasks.filter((t) => t.status === 'pending').length,
      running: tasks.filter((t) => t.status === 'executing').length,
      completed: tasks.filter((t) => t.status === 'completed').length,
      failed: tasks.filter((t) => t.status === 'failed').length,
    };
  }
}
