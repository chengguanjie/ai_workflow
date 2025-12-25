/**
 * 同步管理器
 * 处理离线/在线数据同步、冲突检测和解决
 */

import {
  saveWorkflowOffline,
  getWorkflowOffline,
  getPendingWorkflows,
  addPendingChange,
  clearPendingChanges,
  updateSyncStatus,
  isIndexedDBSupported,
  type OfflineWorkflow,
} from "./indexed-db";
import type { WorkflowConfig } from "@/types/workflow";

// 同步状态
export type SyncStatus = "idle" | "syncing" | "offline" | "error" | "conflict";

// 冲突信息
export interface ConflictInfo {
  workflowId: string;
  localVersion: number;
  serverVersion: number;
  localData: Partial<OfflineWorkflow>;
  serverData: Partial<OfflineWorkflow>;
  timestamp: number;
}

// 同步结果
export interface SyncResult {
  success: boolean;
  synced: number;
  failed: number;
  conflicts: ConflictInfo[];
}

// 保存选项
export interface SaveOptions {
  silent?: boolean;
  immediate?: boolean;
  optimistic?: boolean;
}

// API 错误响应
interface ApiErrorResponse {
  error?: string | {
    message?: string
    details?: Array<{ field: string; message: string }>
  }
  serverData?: Partial<OfflineWorkflow> & { version?: number }
}

// 事件监听器类型
type SyncEventType = "statusChange" | "conflict" | "syncComplete" | "error";
type SyncEventHandler = (data: unknown) => void;

class SyncManager {
  private status: SyncStatus = "idle";
  private isOnline: boolean =
    typeof navigator !== "undefined" ? navigator.onLine : true;
  private syncQueue: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private listeners: Map<SyncEventType, Set<SyncEventHandler>> = new Map();
  private conflicts: Map<string, ConflictInfo> = new Map();
  private retryDelay: number = 5000;
  private maxRetries: number = 3;
  private debounceDelay: number = 1000;

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.handleOnline);
      window.addEventListener("offline", this.handleOffline);
      this.isOnline = navigator.onLine;
    }
  }

  /**
   * 上线处理
   */
  private handleOnline = () => {
    this.isOnline = true;
    this.emit("statusChange", { online: true });
    // 自动尝试同步待处理的更改
    this.syncPendingChanges();
  };

  /**
   * 离线处理
   */
  private handleOffline = () => {
    this.isOnline = false;
    this.status = "offline";
    this.emit("statusChange", { online: false });
  };

  /**
   * 获取当前状态
   */
  getStatus(): SyncStatus {
    if (!this.isOnline) return "offline";
    return this.status;
  }

  /**
   * 是否在线
   */
  isNetworkOnline(): boolean {
    return this.isOnline;
  }

  /**
   * 添加事件监听器
   */
  on(event: SyncEventType, handler: SyncEventHandler): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);

    return () => {
      this.listeners.get(event)?.delete(handler);
    };
  }

  /**
   * 触发事件
   */
  private emit(event: SyncEventType, data: unknown): void {
    this.listeners.get(event)?.forEach((handler) => handler(data));
  }

  /**
   * 保存工作流（带乐观更新）
   */
  async saveWorkflow(
    workflowId: string,
    data: {
      name: string;
      description: string;
      config: WorkflowConfig;
    },
    options: SaveOptions = {},
  ): Promise<{ success: boolean; error?: string; conflict?: ConflictInfo }> {
    const { immediate = false, optimistic: _optimistic = true } = options;

    // 获取当前本地版本
    const localWorkflow = await getWorkflowOffline(workflowId);
    const currentVersion = localWorkflow?.version || 0;

    // 乐观更新：先保存到本地
    if (isIndexedDBSupported()) {
      const offlineData: OfflineWorkflow = {
        id: workflowId,
        name: data.name,
        description: data.description,
        manual: "",
        config: data.config,
        version: currentVersion + 1,
        lastModified: Date.now(),
        syncStatus: "pending",
        serverVersion: localWorkflow?.serverVersion,
      };
      await saveWorkflowOffline(offlineData);
    }

    // 如果离线，添加到待同步队列
    if (!this.isOnline) {
      await addPendingChange({
        workflowId,
        type: "update",
        data: { ...data, version: currentVersion + 1 },
        timestamp: Date.now(),
        retryCount: 0,
      });
      return { success: true };
    }

    // 在线时，使用防抖同步
    if (!immediate) {
      return this.debouncedSync(workflowId, data, currentVersion);
    }

    // 立即同步
    return this.syncToServer(workflowId, data, currentVersion);
  }

  /**
   * 防抖同步
   */
  private debouncedSync(
    workflowId: string,
    data: { name: string; description: string; config: WorkflowConfig },
    version: number,
  ): Promise<{ success: boolean; error?: string; conflict?: ConflictInfo }> {
    return new Promise((resolve) => {
      // 清除之前的定时器
      const existingTimer = this.syncQueue.get(workflowId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // 设置新的定时器
      const timer = setTimeout(async () => {
        this.syncQueue.delete(workflowId);
        const result = await this.syncToServer(workflowId, data, version);
        resolve(result);
      }, this.debounceDelay);

      this.syncQueue.set(workflowId, timer);
    });
  }

  /**
   * 同步到服务器
   */
  private async syncToServer(
    workflowId: string,
    data: { name: string; description: string; config: WorkflowConfig },
    localVersion: number,
  ): Promise<{ success: boolean; error?: string; conflict?: ConflictInfo }> {
    this.status = "syncing";
    this.emit("statusChange", { status: "syncing" });

    try {
      const response = await fetch(`/api/workflows/${workflowId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          description: data.description,
          config: data.config,
          expectedVersion: localVersion,
        }),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as ApiErrorResponse;

        // 版本冲突
        if (response.status === 409) {
          const serverData = errorData.serverData;
          const conflict: ConflictInfo = {
            workflowId,
            localVersion,
            serverVersion: serverData?.version || 0,
            localData: data,
            serverData: serverData || {},
            timestamp: Date.now(),
          };

          this.conflicts.set(workflowId, conflict);
          await updateSyncStatus(workflowId, "conflict", serverData?.version);

          this.status = "conflict";
          this.emit("conflict", conflict);

          return { success: false, error: "Version conflict", conflict };
        }

        let errorMessage =
          typeof errorData.error === "string"
            ? errorData.error
            : errorData.error?.message || "Sync failed";

        // Append validation details if available
        if (
          typeof errorData.error === "object" &&
          errorData.error &&
          "details" in errorData.error &&
          Array.isArray(errorData.error.details)
        ) {
          const details = errorData.error.details
            .map((d) => `${d.field}: ${d.message}`)
            .join(", ");
          errorMessage += ` (${details})`;
        }

        throw new Error(errorMessage);
      }

      const result = await response.json();
      const serverVersion = result.data?.version || localVersion + 1;

      // 更新本地数据
      if (isIndexedDBSupported()) {
        await updateSyncStatus(workflowId, "synced", serverVersion);
        await clearPendingChanges(workflowId);
      }

      this.status = "idle";
      this.conflicts.delete(workflowId);
      this.emit("syncComplete", { workflowId, version: serverVersion });

      return { success: true };
    } catch (error) {
      this.status = "error";
      this.emit("error", { workflowId, error });

      // 保存到待同步队列
      if (isIndexedDBSupported()) {
        await addPendingChange({
          workflowId,
          type: "update",
          data: { ...data, version: localVersion + 1 },
          timestamp: Date.now(),
          retryCount: 0,
        });
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * 同步所有待处理的更改
   */
  async syncPendingChanges(): Promise<SyncResult> {
    if (!this.isOnline || !isIndexedDBSupported()) {
      return { success: false, synced: 0, failed: 0, conflicts: [] };
    }

    const pendingWorkflows = await getPendingWorkflows();
    const result: SyncResult = {
      success: true,
      synced: 0,
      failed: 0,
      conflicts: [],
    };

    for (const workflow of pendingWorkflows) {
      const syncResult = await this.syncToServer(
        workflow.id,
        {
          name: workflow.name,
          description: workflow.description,
          config: workflow.config,
        },
        workflow.version - 1,
      );

      if (syncResult.success) {
        result.synced++;
      } else {
        result.failed++;
        if (syncResult.conflict) {
          result.conflicts.push(syncResult.conflict);
        }
      }
    }

    result.success = result.failed === 0;

    return result;
  }

  /**
   * 解决冲突：使用本地版本
   */
  async resolveConflictWithLocal(workflowId: string): Promise<boolean> {
    // 直接从 IndexedDB 获取本地工作流数据，不依赖内存中的 conflicts Map
    const workflow = await getWorkflowOffline(workflowId);
    if (!workflow) return false;

    // 强制使用本地版本覆盖服务器
    try {
      const response = await fetch(`/api/workflows/${workflowId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: workflow.name,
          description: workflow.description,
          config: workflow.config,
          forceOverwrite: true,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        await updateSyncStatus(workflowId, "synced", result.data?.version);
        this.conflicts.delete(workflowId);
        this.status = "idle";
        return true;
      }
    } catch {
      // 解决失败
    }

    return false;
  }

  /**
   * 解决冲突：使用服务器版本
   */
  async resolveConflictWithServer(workflowId: string): Promise<boolean> {
    if (!isIndexedDBSupported()) return false;

    // 从服务器获取最新版本
    try {
      const response = await fetch(`/api/workflows/${workflowId}`);
      if (!response.ok) return false;

      const result = await response.json();
      const serverData = result.data;

      if (!serverData) return false;

      // 使用服务器版本覆盖本地
      const serverWorkflow: OfflineWorkflow = {
        id: workflowId,
        name: serverData.name || "",
        description: serverData.description || "",
        manual: serverData.manual || "",
        config: serverData.config,
        version: serverData.version || 1,
        lastModified: Date.now(),
        syncStatus: "synced",
        serverVersion: serverData.version || 1,
      };

      await saveWorkflowOffline(serverWorkflow);
      await clearPendingChanges(workflowId);
      this.conflicts.delete(workflowId);
      this.status = "idle";

      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取当前冲突
   */
  getConflict(workflowId: string): ConflictInfo | undefined {
    return this.conflicts.get(workflowId);
  }

  /**
   * 清除指定工作流的冲突状态
   */
  clearConflict(workflowId: string): void {
    this.conflicts.delete(workflowId);
    if (this.conflicts.size === 0) {
      this.status = "idle";
    }
  }

  /**
   * 获取所有冲突
   */
  getAllConflicts(): ConflictInfo[] {
    return Array.from(this.conflicts.values());
  }

  /**
   * 清理
   */
  destroy(): void {
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.handleOnline);
      window.removeEventListener("offline", this.handleOffline);
    }

    // 清除所有定时器
    this.syncQueue.forEach((timer) => clearTimeout(timer));
    this.syncQueue.clear();
    this.listeners.clear();
  }
}

// 单例导出
export const syncManager = new SyncManager();
