"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkflowStore } from "@/stores/workflow-store";
import {
  syncManager,
  saveWorkflowOffline,
  getWorkflowOffline,
  isIndexedDBSupported,
  type ConflictInfo,
  type OfflineWorkflow,
} from "@/lib/offline";
import type { SaveStatusType } from "@/components/workflow/save-status-indicator";
import { toast } from "sonner";

interface UseWorkflowSaveOptions {
  workflowId: string;
  debounceMs?: number;
  autoSave?: boolean;
  onConflict?: (conflict: ConflictInfo) => void;
}

interface UseWorkflowSaveReturn {
  status: SaveStatusType;
  lastSavedAt: number | null;
  isSaving: boolean;
  isOnline: boolean;
  conflict: ConflictInfo | null;
  save: (options?: { silent?: boolean; force?: boolean }) => Promise<boolean>;
  resolveConflict: (resolution: "local" | "server") => Promise<boolean>;
  retry: () => Promise<void>;
  /** 设置服务器版本号，用于初始化时同步 */
  setServerVersion: (version: number) => Promise<void>;
}

/**
 * 工作流保存 Hook
 * 集成乐观更新、防抖保存、离线支持和冲突检测
 */
export function useWorkflowSave({
  workflowId,
  debounceMs = 1500,
  autoSave = true,
  onConflict,
}: UseWorkflowSaveOptions): UseWorkflowSaveReturn {
  const [status, setStatus] = useState<SaveStatusType>("saved");
  const [isSaving, setIsSaving] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingSaveRef = useRef<boolean>(false);
  const localVersionRef = useRef<number>(0);

  const { name, description, getWorkflowConfig, markSaved, isDirty } =
    useWorkflowStore();

  // 监听网络状态
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOnline = () => {
      setIsOnline(true);
      // 恢复在线后尝试同步
      if (pendingSaveRef.current) {
        syncPendingChanges();
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setStatus("offline");
    };

    setIsOnline(navigator.onLine);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 监听同步管理器事件
  useEffect(() => {
    const unsubscribeStatus = syncManager.on("statusChange", (data) => {
      const eventData = data as { status?: string; online?: boolean };
      if (typeof eventData.online === "boolean") {
        setIsOnline(eventData.online);
      }
    });

    const unsubscribeConflict = syncManager.on("conflict", (data) => {
      const conflictData = data as ConflictInfo;
      setConflict(conflictData);
      setStatus("conflict");
      onConflict?.(conflictData);
    });

    const unsubscribeComplete = syncManager.on("syncComplete", (data) => {
      const syncData = data as { workflowId: string; version: number };
      if (syncData.workflowId === workflowId) {
        localVersionRef.current = syncData.version;
        setStatus("saved");
        setLastSavedAt(Date.now());
      }
    });

    return () => {
      unsubscribeStatus();
      unsubscribeConflict();
      unsubscribeComplete();
    };
  }, [workflowId, onConflict]);

  // 初始化：清除旧的冲突状态，与服务器同步
  useEffect(() => {
    async function initializeAndSync() {
      if (!isIndexedDBSupported()) return;

      const localWorkflow = await getWorkflowOffline(workflowId);

      // 如果本地有冲突状态的旧数据，清除它
      // 因为用户重新打开页面时，应该以服务器数据为准
      if (localWorkflow && localWorkflow.syncStatus === "conflict") {
        // 清除冲突状态，将状态重置为已同步
        await saveWorkflowOffline({
          ...localWorkflow,
          syncStatus: "synced",
        });
        // 清除 syncManager 中的冲突记录
        syncManager.clearConflict(workflowId);
        setStatus("saved");
        setLastSavedAt(localWorkflow.lastModified);
        localVersionRef.current = localWorkflow.version;
        return;
      }

      if (localWorkflow) {
        localVersionRef.current = localWorkflow.version;
        setLastSavedAt(localWorkflow.lastModified);

        if (localWorkflow.syncStatus === "pending") {
          pendingSaveRef.current = true;
          setStatus("unsaved");
        } else {
          setStatus("saved");
        }
      }
    }

    initializeAndSync();
  }, [workflowId]);

  /**
   * 设置服务器版本号
   * 用于初始化时将服务器版本同步到本地，避免版本冲突
   */
  const setServerVersion = useCallback(
    async (version: number): Promise<void> => {
      localVersionRef.current = version;

      if (!isIndexedDBSupported()) return;

      const existingLocal = await getWorkflowOffline(workflowId);
      // 只有当本地没有数据，或者本地版本小于服务器版本时，才更新
      if (!existingLocal || existingLocal.version < version) {
        const config = getWorkflowConfig();
        const offlineData: OfflineWorkflow = {
          id: workflowId,
          name,
          description,
          manual: "",
          config,
          version,
          lastModified: Date.now(),
          syncStatus: "synced",
          serverVersion: version,
        };
        await saveWorkflowOffline(offlineData);
      }
    },
    [workflowId, name, description, getWorkflowConfig],
  );

  /**
   * 乐观保存到本地
   */
  const saveToLocal = useCallback(async (): Promise<void> => {
    if (!isIndexedDBSupported()) return;

    const config = getWorkflowConfig();
    const newVersion = localVersionRef.current + 1;

    const offlineData: OfflineWorkflow = {
      id: workflowId,
      name,
      description,
      manual: "",
      config,
      version: newVersion,
      lastModified: Date.now(),
      syncStatus: "pending",
    };

    await saveWorkflowOffline(offlineData);
    pendingSaveRef.current = true;
  }, [workflowId, name, description, getWorkflowConfig]);

  /**
   * 同步到服务器
   */
  const syncToServer = useCallback(
    async (silent = true): Promise<boolean> => {
      if (!navigator.onLine) {
        setStatus("offline");
        return false;
      }

      setIsSaving(true);
      setStatus("saving");

      try {
        const config = getWorkflowConfig();
        const result = await syncManager.saveWorkflow(
          workflowId,
          { name, description, config },
          { immediate: true },
        );

        if (result.success) {
          markSaved();
          setStatus("saved");
          setLastSavedAt(Date.now());
          pendingSaveRef.current = false;

          if (!silent) {
            toast.success("工作流已保存");
          }

          return true;
        } else {
          if (result.conflict) {
            setConflict(result.conflict);
            setStatus("conflict");
          } else {
            setStatus("error");
            if (!silent) {
              toast.error(result.error || "保存失败");
            }
          }

          return false;
        }
      } catch (error) {
        setStatus("error");
        if (!silent) {
          toast.error(error instanceof Error ? error.message : "保存失败");
        }
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [workflowId, name, description, getWorkflowConfig, markSaved],
  );

  /**
   * 同步待处理的更改
   */
  const syncPendingChanges = useCallback(async (): Promise<void> => {
    if (!navigator.onLine || !pendingSaveRef.current) return;

    await syncToServer(true);
  }, [syncToServer]);

  /**
   * 防抖保存
   */
  const debouncedSave = useCallback(async (): Promise<void> => {
    // 清除之前的定时器
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // 乐观保存到本地
    await saveToLocal();
    setStatus("unsaved");

    // 设置新的防抖定时器
    debounceTimerRef.current = setTimeout(async () => {
      await syncToServer(true);
    }, debounceMs);
  }, [saveToLocal, syncToServer, debounceMs]);

  /**
   * 监听 isDirty 变化，触发自动保存
   */
  useEffect(() => {
    if (!autoSave || !isDirty) return;

    debouncedSave();

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [isDirty, autoSave, debouncedSave]);

  /**
   * 监听立即保存请求事件
   */
  useEffect(() => {
    const handleRequestSave = () => {
      // 清除防抖定时器，立即保存
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      syncToServer(true);
    };

    window.addEventListener("workflow-request-save", handleRequestSave);
    return () => {
      window.removeEventListener("workflow-request-save", handleRequestSave);
    };
  }, [syncToServer]);

  /**
   * 手动保存
   */
  const save = useCallback(
    async (options?: {
      silent?: boolean;
      force?: boolean;
    }): Promise<boolean> => {
      const { silent = false, force: _force = false } = options || {};

      // 清除防抖定时器
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // 乐观保存到本地
      await saveToLocal();

      // 同步到服务器
      return syncToServer(silent);
    },
    [saveToLocal, syncToServer],
  );

  /**
   * 解决冲突
   */
  const resolveConflict = useCallback(
    async (resolution: "local" | "server"): Promise<boolean> => {
      setIsSaving(true);

      try {
        let success = false;

        if (resolution === "local") {
          success = await syncManager.resolveConflictWithLocal(workflowId);
        } else {
          success = await syncManager.resolveConflictWithServer(workflowId);
          // 如果使用服务器版本，需要重新加载工作流
          if (success) {
            window.location.reload();
          }
        }

        if (success) {
          setConflict(null);
          setStatus("saved");
          toast.success("冲突已解决");
        } else {
          toast.error("解决冲突失败");
        }

        return success;
      } catch (_error) {
        toast.error("解决冲突失败");
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [workflowId],
  );

  /**
   * 重试保存
   */
  const retry = useCallback(async (): Promise<void> => {
    await syncToServer(false);
  }, [syncToServer]);

  // 清理
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return {
    status,
    lastSavedAt,
    isSaving,
    isOnline,
    conflict,
    save,
    resolveConflict,
    retry,
    setServerVersion,
  };
}
