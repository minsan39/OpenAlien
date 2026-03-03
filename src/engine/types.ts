export type TaskStatus = 
  | 'pending'
  | 'planning'
  | 'splitted'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type TaskPriority = 'low' | 'normal' | 'high' | 'critical';

export interface Task {
  id: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  
  parentTaskId?: string;
  subTaskIds: string[];
  depth: number;
  
  toolId?: string;
  toolName?: string;
  toolArgs?: Record<string, any>;
  result?: TaskResult;
  
  dependencies: string[];
  
  error?: string;
  retryCount: number;
  maxRetries: number;
  
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

export interface TaskResult {
  success: boolean;
  data?: any;
  error?: string;
  duration: number;
}

export interface TaskPlan {
  taskId: string;
  canExecute: boolean;
  reason?: string;
  subTasks?: TaskPlanItem[];
  toolToUse?: {
    toolId: string;
    toolName: string;
    args: Record<string, any>;
  };
  needsUserInput?: boolean;
  userInputPrompt?: string;
}

export interface TaskPlanItem {
  description: string;
  priority?: TaskPriority;
  dependencies?: string[];
}

export interface TaskExecutionOptions {
  timeout?: number;
  maxConcurrent?: number;
  retryOnFailure?: boolean;
  maxRetries?: number;
}

export interface TaskProgress {
  taskId: string;
  status: TaskStatus;
  progress: number;
  message?: string;
  subProgress?: TaskProgress[];
}

export interface TaskContext {
  memoryContext: string;
  availableTools: string;
  userConstraints: string[];
  previousResults: Map<string, TaskResult>;
}

export function createTask(
  description: string,
  options: Partial<Task> = {}
): Task {
  return {
    id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    description,
    status: 'pending',
    priority: 'normal',
    subTaskIds: [],
    depth: 0,
    dependencies: [],
    retryCount: 0,
    maxRetries: 3,
    createdAt: Date.now(),
    ...options,
  };
}

export function isAtomicTask(task: Task): boolean {
  return task.toolId !== undefined && task.subTaskIds.length === 0;
}

export function isTaskCompleted(task: Task): boolean {
  return task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled';
}

export function getTaskDuration(task: Task): number {
  if (!task.startedAt) return 0;
  const end = task.completedAt || Date.now();
  return end - task.startedAt;
}
