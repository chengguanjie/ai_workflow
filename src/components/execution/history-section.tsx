"use client";

/**
 * 历史记录区域组件
 *
 * 显示已完成（COMPLETED/FAILED/CANCELLED）的执行记录
 * - 筛选栏（工作流、状态、日期范围）
 * - 表格展示
 * - 分页功能
 */

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  History,
  CheckCircle2,
  XCircle,
  Ban,
  Loader2,
  FileText,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Filter,
  X,
  Zap,
  Inbox,
} from "lucide-react";
import type { Execution } from "@/lib/execution/categorize";

/**
 * 筛选参数接口
 */
export interface HistoryFilters {
  workflowId?: string;
  status?: "COMPLETED" | "FAILED" | "CANCELLED";
  startDate?: string;
  endDate?: string;
}

/**
 * 工作流选项接口
 */
export interface WorkflowOption {
  id: string;
  name: string;
}

interface HistorySectionProps {
  /** 历史执行记录列表 */
  executions: Execution[];
  /** 总记录数 */
  total: number;
  /** 当前页码（从1开始） */
  page: number;
  /** 每页记录数 */
  pageSize: number;
  /** 是否正在加载 */
  isLoading?: boolean;
  /** 当前筛选条件 */
  filters: HistoryFilters;
  /** 可选的工作流列表 */
  workflows?: WorkflowOption[];
  /** 页码变化回调 */
  onPageChange: (page: number) => void;
  /** 筛选条件变化回调 */
  onFiltersChange: (filters: HistoryFilters) => void;
  /** 点击执行记录时的回调 */
  onExecutionClick?: (execution: Execution) => void;
  /** 是否作为 Tab 内容显示（不包裹在外层 Card 中） */
  showAsTab?: boolean;
}

/**
 * 格式化持续时间
 */
function formatDuration(ms: number | null): string {
  if (!ms) return "-";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

/**
 * 格式化日期时间
 */
function formatDate(date: string | null): string {
  if (!date) return "-";
  return new Date(date).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * 获取状态图标
 */
function getStatusIcon(status: string) {
  switch (status) {
    case "COMPLETED":
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case "FAILED":
      return <XCircle className="h-4 w-4 text-red-500" />;
    case "CANCELLED":
      return <Ban className="h-4 w-4 text-gray-500" />;
    default:
      return null;
  }
}

/**
 * 获取状态文本
 */
function getStatusText(status: string): string {
  switch (status) {
    case "COMPLETED":
      return "成功";
    case "FAILED":
      return "失败";
    case "CANCELLED":
      return "已取消";
    default:
      return status;
  }
}

/**
 * 获取状态徽章样式
 */
function getStatusBadgeVariant(
  status: string,
): "default" | "destructive" | "secondary" {
  switch (status) {
    case "COMPLETED":
      return "default";
    case "FAILED":
      return "destructive";
    case "CANCELLED":
      return "secondary";
    default:
      return "secondary";
  }
}

/**
 * 筛选栏组件
 */
function FilterBar({
  filters,
  workflows = [],
  onFiltersChange,
}: {
  filters: HistoryFilters;
  workflows?: WorkflowOption[];
  onFiltersChange: (filters: HistoryFilters) => void;
}) {
  const hasFilters =
    filters.workflowId ||
    filters.status ||
    filters.startDate ||
    filters.endDate;

  const resetFilters = () => {
    onFiltersChange({});
  };

  return (
    <div className="flex flex-wrap items-center gap-3 mb-4">
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">筛选:</span>
      </div>

      {/* 工作流筛选 */}
      <Select
        value={filters.workflowId || "all"}
        onValueChange={(value) => {
          onFiltersChange({
            ...filters,
            workflowId: value === "all" ? undefined : value,
          });
        }}
      >
        <SelectTrigger className="w-[200px]" size="sm">
          <SelectValue placeholder="选择工作流" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部工作流</SelectItem>
          {workflows.map((workflow) => (
            <SelectItem key={workflow.id} value={workflow.id}>
              {workflow.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* 状态筛选 */}
      <Select
        value={filters.status || "all"}
        onValueChange={(value) => {
          onFiltersChange({
            ...filters,
            status:
              value === "all" ? undefined : (value as HistoryFilters["status"]),
          });
        }}
      >
        <SelectTrigger className="w-[140px]" size="sm">
          <SelectValue placeholder="选择状态" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部状态</SelectItem>
          <SelectItem value="COMPLETED">成功</SelectItem>
          <SelectItem value="FAILED">失败</SelectItem>
          <SelectItem value="CANCELLED">已取消</SelectItem>
        </SelectContent>
      </Select>

      {/* 开始日期 */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">从</span>
        <Input
          type="date"
          value={filters.startDate || ""}
          onChange={(e) => {
            onFiltersChange({
              ...filters,
              startDate: e.target.value || undefined,
            });
          }}
          className="h-8 w-[140px]"
        />
      </div>

      {/* 结束日期 */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">至</span>
        <Input
          type="date"
          value={filters.endDate || ""}
          onChange={(e) => {
            onFiltersChange({
              ...filters,
              endDate: e.target.value || undefined,
            });
          }}
          className="h-8 w-[140px]"
        />
      </div>

      {/* 重置筛选 */}
      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={resetFilters}>
          <X className="mr-1 h-4 w-4" />
          重置
        </Button>
      )}
    </div>
  );
}

/**
 * 分页组件
 */
function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.ceil(total / pageSize);

  if (totalPages <= 1) return null;

  const startRecord = (page - 1) * pageSize + 1;
  const endRecord = Math.min(page * pageSize, total);

  return (
    <div className="mt-4 flex items-center justify-between">
      <p className="text-sm text-muted-foreground">
        显示 {startRecord} - {endRecord} 条，共 {total} 条
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm">
          {page} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/**
 * 空状态组件
 */
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <Inbox className="h-12 w-12 mb-4 opacity-50" />
      <p className="text-lg font-medium">暂无执行记录</p>
      <p className="text-sm mt-1">执行完成后会在这里显示</p>
    </div>
  );
}

/**
 * 加载状态组件
 */
function LoadingState() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

/**
 * 执行记录表格
 */
function ExecutionsTable({
  executions,
  isLoading = false,
  onExecutionClick,
}: {
  executions: Execution[];
  isLoading?: boolean;
  onExecutionClick?: (execution: Execution) => void;
}) {
  if (isLoading) {
    return <LoadingState />;
  }

  if (executions.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-[100px]">状态</TableHead>
            <TableHead>工作流</TableHead>
            <TableHead className="w-[160px]">执行时间</TableHead>
            <TableHead className="w-[100px]">耗时</TableHead>
            <TableHead className="w-[100px]">Tokens</TableHead>
            <TableHead className="w-[80px]">文件</TableHead>
            <TableHead className="w-[80px]">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {executions.map((execution) => (
            <TableRow key={execution.id} className="hover:bg-muted/30">
              <TableCell>
                <div className="flex items-center gap-2">
                  {getStatusIcon(execution.status)}
                  <Badge
                    variant={getStatusBadgeVariant(execution.status)}
                    className="text-xs"
                  >
                    {getStatusText(execution.status)}
                  </Badge>
                </div>
              </TableCell>
              <TableCell>
                <Link
                  href={`/workflows/${execution.workflowId}`}
                  className="font-medium hover:text-primary hover:underline"
                >
                  {execution.workflowName}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDate(execution.startedAt || execution.createdAt)}
              </TableCell>
              <TableCell>{formatDuration(execution.duration)}</TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Zap className="h-3 w-3 text-muted-foreground" />
                  {execution.totalTokens.toLocaleString()}
                </div>
              </TableCell>
              <TableCell>
                {execution.outputFileCount > 0 && (
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <FileText className="h-4 w-4" />
                    <span>{execution.outputFileCount}</span>
                  </div>
                )}
              </TableCell>
              <TableCell>
                <Link href={`/executions/${execution.id}`}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onExecutionClick?.(execution)}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * 历史记录内容组件（筛选栏 + 表格 + 分页）
 */
function HistoryContent({
  executions,
  total,
  page,
  pageSize,
  isLoading,
  filters,
  workflows,
  onPageChange,
  onFiltersChange,
  onExecutionClick,
}: Omit<HistorySectionProps, "showAsTab">) {
  return (
    <>
      {/* 筛选栏 */}
      <FilterBar
        filters={filters}
        workflows={workflows}
        onFiltersChange={(newFilters) => {
          onFiltersChange(newFilters);
          // 筛选条件变化时重置到第一页
          onPageChange(1);
        }}
      />

      {/* 表格 */}
      <ExecutionsTable
        executions={executions}
        isLoading={isLoading}
        onExecutionClick={onExecutionClick}
      />

      {/* 分页 */}
      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={onPageChange}
      />
    </>
  );
}

/**
 * 历史记录区域组件
 */
export function HistorySection({
  executions,
  total,
  page,
  pageSize,
  isLoading = false,
  filters,
  workflows = [],
  onPageChange,
  onFiltersChange,
  onExecutionClick,
  showAsTab = false,
}: HistorySectionProps) {
  // Tab 模式：直接显示内容，不包裹在外层 Card 中
  if (showAsTab) {
    return (
      <div className="rounded-lg border bg-card p-4">
        <HistoryContent
          executions={executions}
          total={total}
          page={page}
          pageSize={pageSize}
          isLoading={isLoading}
          filters={filters}
          workflows={workflows}
          onPageChange={onPageChange}
          onFiltersChange={onFiltersChange}
          onExecutionClick={onExecutionClick}
        />
      </div>
    );
  }

  // 非 Tab 模式：包裹在 Card 中
  return (
    <div>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">历史记录</CardTitle>
            <Badge variant="secondary" className="ml-2">
              {total}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <HistoryContent
            executions={executions}
            total={total}
            page={page}
            pageSize={pageSize}
            isLoading={isLoading}
            filters={filters}
            workflows={workflows}
            onPageChange={onPageChange}
            onFiltersChange={onFiltersChange}
            onExecutionClick={onExecutionClick}
          />
        </CardContent>
      </Card>
    </div>
  );
}
