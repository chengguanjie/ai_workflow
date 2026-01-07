/**
 * 调试事件类型定义
 *
 * 用于实时调试日志流功能的类型定义和样式映射
 * Requirements: 4.1, 4.2
 */

/**
 * 日志级别类型
 * 与现有 debug.ts 中的日志类型保持一致
 */
export type LogLevel = 'info' | 'step' | 'success' | 'warning' | 'error';

/**
 * 调试日志数据
 */
export interface DebugLogData {
  /** 日志级别 */
  level: LogLevel;
  /** 日志消息 */
  message: string;
  /** 执行步骤标识 */
  step?: string;
  /** 附加数据 */
  data?: unknown;
  /** 时间戳 */
  timestamp?: string;
}

/**
 * 调试状态数据
 */
export interface DebugStatusData {
  /** 执行状态 */
  status: 'running' | 'completed' | 'failed';
  /** 执行进度 (0-100) */
  progress?: number;
}

/**
 * 调试完成数据
 */
export interface DebugCompleteData {
  /** 最终状态 */
  status: 'success' | 'error' | 'skipped' | 'paused';
  /** 输出数据 */
  output: Record<string, unknown>;
  /** 错误信息 */
  error?: string;
  /** 执行时长 (毫秒) */
  duration: number;
  /** Token 使用统计 */
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** 审批请求 ID (当节点暂停等待审批时) */
  approvalRequestId?: string;
}

/**
 * 调试错误数据
 */
export interface DebugErrorData {
  /** 错误消息 */
  message: string;
  /** 错误堆栈 */
  stack?: string;
}

/**
 * 调试日志事件
 * SSE 传输的事件格式
 */
export interface DebugLogEvent {
  /** 事件类型 */
  type: 'log' | 'status' | 'complete' | 'error';
  /** 事件时间戳 */
  timestamp: string;
  /** 事件数据 */
  data: DebugLogData | DebugStatusData | DebugCompleteData | DebugErrorData;
}

/**
 * 日志级别样式配置
 * 用于前端显示不同级别日志的样式
 */
export interface LogLevelStyle {
  /** 图标 */
  icon: string;
  /** 文字颜色 (Tailwind CSS 类) */
  color: string;
  /** 背景颜色 (Tailwind CSS 类) */
  bgColor: string;
}

/**
 * 日志级别样式映射
 * Requirements: 4.2 - 使用不同颜色区分日志级别
 */
export const LOG_LEVEL_STYLES: Record<LogLevel, LogLevelStyle> = {
  info: {
    icon: '🔹',
    color: 'text-blue-400',
    bgColor: 'bg-blue-950/30',
  },
  step: {
    icon: '⚡',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-950/30',
  },
  success: {
    icon: '✅',
    color: 'text-green-400',
    bgColor: 'bg-green-950/30',
  },
  warning: {
    icon: '⚠️',
    color: 'text-orange-400',
    bgColor: 'bg-orange-950/30',
  },
  error: {
    icon: '❌',
    color: 'text-red-400',
    bgColor: 'bg-red-950/30',
  },
};

/**
 * 调试执行状态
 */
export type DebugStatus = 'idle' | 'running' | 'completed' | 'failed';

/**
 * 调试状态
 */
export interface DebugState {
  /** 当前状态 */
  status: DebugStatus;
  /** 日志列表 */
  logs: DebugLogData[];
  /** 执行结果 */
  result: DebugCompleteData | null;
  /** 错误信息 */
  error: string | null;
  /** 开始时间 */
  startTime: number | null;
}

/**
 * 创建初始调试状态
 */
export function createInitialDebugState(): DebugState {
  return {
    status: 'idle',
    logs: [],
    result: null,
    error: null,
    startTime: null,
  };
}

/**
 * 格式化日志消息
 * 将 DebugLogData 转换为可显示的字符串格式
 */
export function formatLogMessage(log: DebugLogData): string {
  const style = LOG_LEVEL_STYLES[log.level];
  const timeStr = log.timestamp
    ? new Date(log.timestamp).toLocaleTimeString('zh-CN', { hour12: false })
    : new Date().toLocaleTimeString('zh-CN', { hour12: false });

  let message = `[${timeStr}] ${style.icon} ${log.message}`;
  if (log.step) {
    message = `[${timeStr}] ${style.icon} [${log.step}] ${log.message}`;
  }

  return message;
}

/**
 * 格式化 JSON 数据
 * Requirements: 4.3 - JSON 数据格式化显示
 */
export function formatJsonData(data: unknown): string {
  if (data === null || data === undefined) {
    return '';
  }

  if (typeof data === 'object') {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }

  return String(data);
}

/**
 * 创建日志事件
 */
export function createLogEvent(log: DebugLogData): DebugLogEvent {
  return {
    type: 'log',
    timestamp: new Date().toISOString(),
    data: {
      ...log,
      timestamp: log.timestamp || new Date().toISOString(),
    },
  };
}

/**
 * 创建状态事件
 */
export function createStatusEvent(status: DebugStatusData['status'], progress?: number): DebugLogEvent {
  return {
    type: 'status',
    timestamp: new Date().toISOString(),
    data: {
      status,
      progress,
    },
  };
}

/**
 * 创建完成事件
 */
export function createCompleteEvent(result: DebugCompleteData): DebugLogEvent {
  return {
    type: 'complete',
    timestamp: new Date().toISOString(),
    data: result,
  };
}

/**
 * 创建错误事件
 */
export function createErrorEvent(message: string, stack?: string): DebugLogEvent {
  return {
    type: 'error',
    timestamp: new Date().toISOString(),
    data: {
      message,
      stack,
    },
  };
}

/**
 * 类型守卫：检查是否为日志数据
 */
export function isDebugLogData(data: DebugLogEvent['data']): data is DebugLogData {
  return 'level' in data && 'message' in data;
}

/**
 * 类型守卫：检查是否为状态数据
 */
export function isDebugStatusData(data: DebugLogEvent['data']): data is DebugStatusData {
  return 'status' in data && !('output' in data) && !('level' in data);
}

/**
 * 类型守卫：检查是否为完成数据
 */
export function isDebugCompleteData(data: DebugLogEvent['data']): data is DebugCompleteData {
  return 'status' in data && 'output' in data && 'duration' in data;
}

/**
 * 类型守卫：检查是否为错误数据
 */
export function isDebugErrorData(data: DebugLogEvent['data']): data is DebugErrorData {
  return 'message' in data && !('level' in data) && !('output' in data);
}
