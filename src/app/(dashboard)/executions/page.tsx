"use client";

/**
 * 执行历史页面
 *
 * 分为两个 Tab：
 * - 正在执行：显示 RUNNING/PENDING 状态的工作流
 * - 执行已完成：显示 COMPLETED/FAILED/CANCELLED 状态的工作流
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, Play, CheckCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { RunningSection } from "@/components/execution/running-section";
import {
  HistorySection,
  type HistoryFilters,
  type WorkflowOption,
} from "@/components/execution/history-section";
import type { Execution } from "@/lib/execution/categorize";

// 自动刷新间隔（毫秒）
const AUTO_REFRESH_INTERVAL = 5000;

type TabValue = "running" | "completed";

export default function ExecutionsPage() {
  return <ExecutionsView />;
}

export function ExecutionsView({
  embedded = false,
}: {
  embedded?: boolean;
} = {}) {
  // 当前激活的 Tab
  const [activeTab, setActiveTab] = useState<TabValue>("running");

  // 运行中的执行记录
  const [runningExecutions, setRunningExecutions] = useState<Execution[]>([]);
  const [isLoadingRunning, setIsLoadingRunning] = useState(true);

  // 历史记录
  const [historyExecutions, setHistoryExecutions] = useState<Execution[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const historyPageSize = 20;

  // 筛选状态
  const [filters, setFilters] = useState<HistoryFilters>({});

  // 工作流列表
  const [workflows, setWorkflows] = useState<WorkflowOption[]>([]);

  // 自动刷新相关
  const runningIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 加载工作流列表
  useEffect(() => {
    const loadWorkflows = async () => {
      try {
        const response = await fetch("/api/workflows");
        if (response.ok) {
          const data = await response.json();
          setWorkflows(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        console.error("Load workflows error:", error);
      }
    };
    loadWorkflows();
  }, []);

  // 加载运行中的执行记录
  const loadRunningExecutions = useCallback(async () => {
    try {
      // 获取运行中和等待中的执行记录
      const params = new URLSearchParams({
        limit: "100", // 获取足够多的记录以包含所有运行中的
        offset: "0",
      });

      const response = await fetch(`/api/executions?${params.toString()}`);
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          // 过滤出运行中的执行记录
          const allExecutions = result.data.executions || [];
          const running = allExecutions.filter(
            (e: Execution) => e.status === "RUNNING" || e.status === "PENDING",
          );
          setRunningExecutions(running);
        } else {
          setRunningExecutions([]);
        }
      }
    } catch (error) {
      console.error("Load running executions error:", error);
    } finally {
      setIsLoadingRunning(false);
    }
  }, []);

  // 加载历史记录
  const loadHistoryExecutions = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const offset = (historyPage - 1) * historyPageSize;
      const params = new URLSearchParams({
        limit: String(historyPageSize),
        offset: String(offset),
      });

      // 添加筛选条件
      if (filters.workflowId) {
        params.append("workflowId", filters.workflowId);
      }
      if (filters.status) {
        params.append("status", filters.status);
      } else {
        // 默认只获取历史记录状态
        params.append("statusIn", "COMPLETED,FAILED,CANCELLED");
      }
      if (filters.startDate) {
        params.append("startDate", filters.startDate);
      }
      if (filters.endDate) {
        params.append("endDate", filters.endDate);
      }

      const response = await fetch(`/api/executions?${params.toString()}`);
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          // 过滤确保只有历史记录状态
          const executions = (result.data.executions || []).filter(
            (e: Execution) =>
              e.status === "COMPLETED" ||
              e.status === "FAILED" ||
              e.status === "CANCELLED",
          );
          setHistoryExecutions(executions);
          setHistoryTotal(result.data.total || 0);
        } else {
          setHistoryExecutions([]);
          setHistoryTotal(0);
        }
      }
    } catch (error) {
      console.error("Load history executions error:", error);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [historyPage, filters]);

  // 初始加载
  useEffect(() => {
    loadRunningExecutions();
  }, [loadRunningExecutions]);

  useEffect(() => {
    loadHistoryExecutions();
  }, [loadHistoryExecutions]);

  // 运行区域自动刷新逻辑（5秒间隔）- 仅在正在执行 Tab 激活时
  useEffect(() => {
    // 只有当在"正在执行" Tab 且有运行中的执行记录时才启动自动刷新
    if (activeTab === "running" && runningExecutions.length > 0) {
      runningIntervalRef.current = setInterval(() => {
        loadRunningExecutions();
        // 同时刷新历史记录，因为运行中的可能已完成
        loadHistoryExecutions();
      }, AUTO_REFRESH_INTERVAL);
    } else {
      // 清除定时器
      if (runningIntervalRef.current) {
        clearInterval(runningIntervalRef.current);
        runningIntervalRef.current = null;
      }
    }

    return () => {
      if (runningIntervalRef.current) {
        clearInterval(runningIntervalRef.current);
      }
    };
  }, [
    activeTab,
    runningExecutions.length,
    loadRunningExecutions,
    loadHistoryExecutions,
  ]);

  // 手动刷新
  const handleRefresh = () => {
    if (activeTab === "running") {
      setIsLoadingRunning(true);
      loadRunningExecutions();
    } else {
      setIsLoadingHistory(true);
      loadHistoryExecutions();
    }
  };

  // 清理卡住的执行记录
  const [isCleaning, setIsCleaning] = useState(false);
  const handleCleanupStuck = async () => {
    setIsCleaning(true);
    try {
      const response = await fetch("/api/executions/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeoutMs: 10 * 60 * 1000 }), // 10分钟超时
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          toast.success(result.data.message || "清理完成");
          // 刷新列表
          loadRunningExecutions();
          loadHistoryExecutions();
        } else {
          toast.error(result.error?.message || "清理失败");
        }
      } else {
        toast.error("清理请求失败");
      }
    } catch (error) {
      console.error("Cleanup error:", error);
      toast.error("清理过程中发生错误");
    } finally {
      setIsCleaning(false);
    }
  };

  // 处理 Tab 切换
  const handleTabChange = (value: string) => {
    setActiveTab(value as TabValue);
    // 切换 Tab 时刷新对应数据
    if (value === "running") {
      loadRunningExecutions();
    } else {
      loadHistoryExecutions();
    }
  };

  // 处理筛选条件变化
  const handleFiltersChange = (newFilters: HistoryFilters) => {
    setFilters(newFilters);
    setHistoryPage(1); // 重置到第一页
  };

  // 处理页码变化
  const handlePageChange = (page: number) => {
    setHistoryPage(page);
  };

  const isLoading =
    activeTab === "running" ? isLoadingRunning : isLoadingHistory;

  return (
    <div className={embedded ? "h-full p-4" : "container mx-auto py-4"}>
      {/* Tabs 切换区域 */}
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="w-full"
      >
        <div className="mb-4 flex items-center justify-between">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="running" className="flex items-center gap-2">
              <Play className="h-4 w-4" />
              正在执行
              {runningExecutions.length > 0 && (
                <Badge
                  variant="default"
                  className="ml-1 bg-blue-500 hover:bg-blue-600"
                >
                  {runningExecutions.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="completed" className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              执行已完成
              {historyTotal > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {historyTotal}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-4">
            {/* 自动刷新状态指示 */}
            {activeTab === "running" && runningExecutions.length > 0 && (
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500"></span>
                </span>
                自动刷新中
              </span>
            )}
            {/* 清理卡住的执行记录按钮 */}
            {activeTab === "running" && runningExecutions.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={isCleaning}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    清理卡住
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>清理卡住的执行记录？</AlertDialogTitle>
                    <AlertDialogDescription>
                      此操作将把运行超过 10 分钟的执行记录标记为失败。
                      如果执行确实还在进行中，可能会导致数据不一致。
                      <br />
                      <br />
                      建议仅在确认执行已经卡住（如服务器重启后）时使用此功能。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleCleanupStuck}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      确认清理
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isLoading}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
              />
              刷新
            </Button>
          </div>
        </div>

        {/* 正在执行 Tab 内容 */}
        <TabsContent value="running" className="mt-0">
          <RunningSection
            executions={runningExecutions}
            isLoading={isLoadingRunning}
            showAsTab={true}
          />
        </TabsContent>

        {/* 执行已完成 Tab 内容 */}
        <TabsContent value="completed" className="mt-0">
          <HistorySection
            executions={historyExecutions}
            total={historyTotal}
            page={historyPage}
            pageSize={historyPageSize}
            isLoading={isLoadingHistory}
            filters={filters}
            workflows={workflows}
            onPageChange={handlePageChange}
            onFiltersChange={handleFiltersChange}
            showAsTab={true}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
