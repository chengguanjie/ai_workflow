"use client";

import { useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Play,
  Shield,
  CheckCircle2,
  XCircle,
  FlaskConical,
  Stethoscope,
  Lightbulb,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import {
  useAIAssistantStore,
  type AESReport,
} from "@/stores/ai-assistant-store";
import { useWorkflowStore } from "@/stores/workflow-store";
import { cn } from "@/lib/utils";
import { fetchWithTimeout } from "@/lib/http/fetch-with-timeout";
import type { NodeConfig } from "@/types/workflow";

interface TestSectionProps {
  workflowId: string;
  selectedModel: string;
}

export function TestSection({ workflowId, selectedModel }: TestSectionProps) {
  const [testInputFields, setTestInputFields] = useState<
    Record<string, string>
  >({});
  const [isTesting, setIsTesting] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);

  const {
    addMessage,
    setPhase,
    setMode,
    sharedTestResult,
    sharedAESReport,
    setSharedTestResult,
    setSharedAESReport,
  } = useAIAssistantStore();

  const { nodes, edges } = useWorkflowStore();

  // 获取输入节点字段
  const inputNodeFields = useMemo(() => {
    const fields: Array<{
      nodeName: string;
      fieldName: string;
      required?: boolean;
    }> = [];
    nodes.forEach((node) => {
      const data = node.data as NodeConfig;
      if (data.type === "INPUT") {
        const nodeFields =
          (
            data.config as {
              fields?: Array<{ name: string; required?: boolean }>;
            }
          )?.fields || [];
        nodeFields.forEach((f) => {
          fields.push({
            nodeName: data.name,
            fieldName: f.name,
            required: f.required,
          });
        });
      }
    });
    return fields;
  }, [nodes]);

  // 生成工作流上下文
  const generateWorkflowContext = useCallback(() => {
    if (nodes.length === 0) {
      return "当前画布为空，没有任何节点。";
    }

    const nodeDescriptions = nodes
      .map((node) => {
        const data = node.data as NodeConfig & { comment?: string };
        return `- 节点 "${data.name}" (ID: ${node.id}, 类型: ${data.type})`;
      })
      .join("\n");

    return `当前工作流状态：
节点数量: ${nodes.length}
连接数量: ${edges.length}

节点详情:
${nodeDescriptions}`;
  }, [nodes, edges]);

  // 执行测试
  const handleTest = useCallback(async () => {
    if (nodes.length === 0) {
      toast.error("工作流为空，请先添加节点");
      return;
    }

    setIsTesting(true);
    setPhase("testing");

    const testInput: Record<string, unknown> = {};
    inputNodeFields.forEach((field) => {
      const key = field.fieldName;
      if (testInputFields[key]) {
        testInput[key] = testInputFields[key];
      }
    });

    addMessage({
      role: "system",
      content: `正在执行工作流测试...\n测试输入: ${JSON.stringify(testInput, null, 2)}`,
      messageType: "test_result",
    });

    try {
      const response = await fetchWithTimeout("/api/ai-assistant/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowId,
          testInput,
          timeout: 120,
        }),
        timeoutMs: 180_000,
      });

      const result = await response.json();

      // 存储到共享状态
      setSharedTestResult({
        ...result,
        testInput,
        timestamp: Date.now(),
      });

      const statusIcon = result.success ? "✅" : "❌";
      let resultMessage = `${statusIcon} 测试${result.success ? "成功" : "失败"}\n\n`;

      if (result.duration) {
        resultMessage += `执行时间: ${(result.duration / 1000).toFixed(2)}秒\n`;
      }

      if (result.totalTokens) {
        resultMessage += `Token消耗: ${result.totalTokens}\n`;
      }

      if (result.error) {
        resultMessage += `\n错误信息: ${result.error}\n`;
      }

      if (result.analysis) {
        resultMessage += `\n分析:\n${result.analysis}`;
      }

      if (result.output && Object.keys(result.output).length > 0) {
        resultMessage += `\n\n输出结果:\n\`\`\`json\n${JSON.stringify(result.output, null, 2)}\n\`\`\``;
      }

      addMessage({
        role: "assistant",
        content: resultMessage,
        testResult: result,
        messageType: "test_result",
      });

      if (result.success) {
        toast.success("测试执行成功");
      } else {
        toast.error("测试执行失败");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "测试失败";
      toast.error(errorMessage);
      addMessage({
        role: "assistant",
        content: `测试执行出错: ${errorMessage}`,
        messageType: "test_result",
      });
    } finally {
      setIsTesting(false);
    }
  }, [
    nodes,
    workflowId,
    testInputFields,
    inputNodeFields,
    addMessage,
    setPhase,
    setSharedTestResult,
  ]);

  // AES 评估
  const handleAESEvaluate = useCallback(async () => {
    if (nodes.length === 0) {
      toast.error("工作流为空，请先添加节点");
      return;
    }

    setIsEvaluating(true);
    setPhase("optimization");

    addMessage({
      role: "system",
      content:
        "正在进行 AES 全维评估 (Logic, Agentic, Context, Prompt, Robustness)...",
      messageType: "aes_evaluation",
    });

    try {
      const workflowContext = generateWorkflowContext();
      const response = await fetchWithTimeout("/api/ai-assistant/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowContext,
          model: selectedModel,
          testResult: sharedTestResult,
        }),
        timeoutMs: 120_000,
      });

      const data = await response.json();

      if (data.success && data.evaluation) {
        const report = data.evaluation as AESReport;
        // 存储到共享状态
        setSharedAESReport(report);

        let reportContent = `## 🛡️ AES 评估报告\n\n`;
        reportContent += `**总分**: ${report.scores.total}/100`;

        if (report.targetMatching !== undefined) {
          reportContent += `  |  **目标达成**: ${report.targetMatching}/100`;
        }
        reportContent += `\n\n`;

        if (report.executionAnalysis) {
          const ea = report.executionAnalysis;
          const icon = ea.status === "success" ? "✅" : "❌";
          reportContent += `### ⚡ 动态执行分析\n`;
          reportContent += `- **状态**: ${icon} ${ea.status}\n`;
          if (ea.errorAnalysis)
            reportContent += `- **错误分析**: ${ea.errorAnalysis}\n`;
          if (ea.durationAnalysis)
            reportContent += `- **耗时**: ${ea.durationAnalysis}\n`;
          if (ea.outputQuality)
            reportContent += `- **输出质量**: ${ea.outputQuality}\n`;
          reportContent += `\n`;
        }

        reportContent += `### 维度得分\n`;
        reportContent += `- **L (Logic)**: ${report.scores.L}/30\n`;
        reportContent += `- **A (Agentic)**: ${report.scores.A}/25\n`;
        reportContent += `- **C (Context)**: ${report.scores.C}/20\n`;
        reportContent += `- **P (Prompt)**: ${report.scores.P}/15\n`;
        reportContent += `- **R (Robustness)**: ${report.scores.R}/10\n\n`;

        reportContent += `### 诊断详情\n${report.report}\n`;

        if (report.needOptimization) {
          reportContent += `\n> ⚠️ 检测到潜在风险，建议进行优化。`;
        }

        addMessage({
          role: "assistant",
          content: reportContent,
          aesReport: report,
          messageType: "aes_evaluation",
        });

        if (report.needOptimization) {
          toast.warning("检测到工作流存在优化空间");
        } else {
          toast.success("AES 评估完成，工作流状态良好");
        }
      } else {
        addMessage({
          role: "assistant",
          content: `AES 评估失败: ${data.error || "未知错误"}`,
          messageType: "aes_evaluation",
        });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "评估请求失败";
      toast.error(errorMessage);
      addMessage({
        role: "assistant",
        content: `AES 评估出错: ${errorMessage}`,
        messageType: "aes_evaluation",
      });
    } finally {
      setIsEvaluating(false);
    }
  }, [
    nodes,
    generateWorkflowContext,
    selectedModel,
    sharedTestResult,
    addMessage,
    setPhase,
    setSharedAESReport,
  ]);

  // 跳转到诊断页面
  const handleGoToDiagnose = () => {
    setMode("diagnose");
    toast.info("已切换到诊断模式");
  };

  // 跳转到建议页面
  const handleGoToOptimize = () => {
    setMode("optimize");
    toast.info("已切换到建议模式");
  };

  return (
    <div className="flex flex-col h-full">
      {/* 顶部区域 */}
      <div className="shrink-0 p-4 border-b bg-white">
        <div className="text-center">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-amber-100 to-yellow-100 mb-2">
            <FlaskConical className="h-5 w-5 text-amber-600" />
          </div>
          <h4 className="font-medium text-gray-800 text-sm">测试验证</h4>
          <p className="text-xs text-gray-500">
            执行工作流测试和质量评估
          </p>
        </div>
      </div>

      {nodes.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-500 p-4">
          <FlaskConical className="h-12 w-12 text-gray-300 mb-3" />
          <p className="text-sm">工作流为空</p>
          <p className="text-xs mt-1">请先在画布上添加节点</p>
        </div>
      ) : (
        <>
          {/* 可滚动内容区域 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {/* 测试输入 */}
            {inputNodeFields.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-medium text-gray-700">
                  测试输入
                </Label>
                {inputNodeFields.map((field, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span
                      className="text-xs text-gray-500 w-20 shrink-0 truncate"
                      title={`${field.nodeName}.${field.fieldName}`}
                    >
                      {field.fieldName}
                      {field.required && (
                        <span className="text-red-500">*</span>
                      )}
                    </span>
                    <Input
                      className="h-7 text-xs flex-1 border-gray-200 bg-white"
                      placeholder={`输入 ${field.fieldName}`}
                      value={testInputFields[field.fieldName] || ""}
                      onChange={(e) =>
                        setTestInputFields((prev) => ({
                          ...prev,
                          [field.fieldName]: e.target.value,
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            )}

            {/* 最近测试结果摘要 */}
            {sharedTestResult && (
              <div
                className={cn(
                  "p-3 rounded-lg",
                  sharedTestResult.success ? "bg-green-50" : "bg-red-50"
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  {sharedTestResult.success ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                  <span
                    className={cn(
                      "text-sm font-medium",
                      sharedTestResult.success
                        ? "text-green-700"
                        : "text-red-700"
                    )}
                  >
                    最近测试{sharedTestResult.success ? "成功" : "失败"}
                  </span>
                  {sharedTestResult.timestamp && (
                    <span className="text-xs text-gray-400 ml-auto">
                      {new Date(sharedTestResult.timestamp).toLocaleTimeString()}
                    </span>
                  )}
                </div>
                {sharedTestResult.duration && (
                  <p className="text-xs text-gray-600">
                    执行时间: {(sharedTestResult.duration / 1000).toFixed(2)}秒
                  </p>
                )}
                {sharedTestResult.error && (
                  <p className="text-xs text-red-600 mt-1 line-clamp-2">
                    {sharedTestResult.error}
                  </p>
                )}
              </div>
            )}

            {/* AES 评估结果摘要 */}
            {sharedAESReport && (
              <div className="p-3 rounded-lg bg-blue-50">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-blue-500" />
                    <span className="text-sm font-medium text-blue-700">
                      AES 评估
                    </span>
                  </div>
                  <span className="text-lg font-bold text-blue-700">
                    {sharedAESReport.scores.total}分
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1 text-[10px] text-center">
                  <div className="bg-white p-1 rounded">
                    L: {sharedAESReport.scores.L}
                  </div>
                  <div className="bg-white p-1 rounded">
                    A: {sharedAESReport.scores.A}
                  </div>
                  <div className="bg-white p-1 rounded">
                    C: {sharedAESReport.scores.C}
                  </div>
                  <div className="bg-white p-1 rounded">
                    P: {sharedAESReport.scores.P}
                  </div>
                  <div className="bg-white p-1 rounded">
                    R: {sharedAESReport.scores.R}
                  </div>
                </div>
              </div>
            )}

            {/* 后续操作提示 */}
            {(sharedTestResult || sharedAESReport) && (
              <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                <p className="text-xs font-medium text-gray-700 mb-2">
                  下一步操作
                </p>
                <div className="space-y-2">
                  {!sharedTestResult?.success && (
                    <button
                      onClick={handleGoToDiagnose}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 transition-colors text-left"
                    >
                      <Stethoscope className="h-4 w-4 text-teal-500" />
                      <div className="flex-1">
                        <span className="text-xs font-medium text-gray-700">
                          去诊断
                        </span>
                        <p className="text-[10px] text-gray-500">
                          检查配置问题和潜在隐患
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-gray-400" />
                    </button>
                  )}
                  {(sharedTestResult || sharedAESReport?.needOptimization) && (
                    <button
                      onClick={handleGoToOptimize}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 transition-colors text-left"
                    >
                      <Lightbulb className="h-4 w-4 text-orange-500" />
                      <div className="flex-1">
                        <span className="text-xs font-medium text-gray-700">
                          获取建议
                        </span>
                        <p className="text-[10px] text-gray-500">
                          AI分析并提供优化方案
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-gray-400" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 固定底部按钮区域 */}
          <div className="shrink-0 p-4 border-t bg-white space-y-2">
            {/* 操作按钮 */}
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1 h-9 text-xs bg-amber-500 hover:bg-amber-600"
                onClick={handleTest}
                disabled={isTesting || isEvaluating}
              >
                {isTesting ? (
                  <>
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    测试中
                  </>
                ) : (
                  <>
                    <Play className="mr-1 h-3 w-3" />
                    执行测试
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 h-9 text-xs border-gray-200 bg-white hover:bg-gray-50"
                onClick={handleAESEvaluate}
                disabled={isTesting || isEvaluating}
              >
                {isEvaluating ? (
                  <>
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    评估中
                  </>
                ) : (
                  <>
                    <Shield className="mr-1 h-3 w-3" />
                    AES 评估
                  </>
                )}
              </Button>
            </div>

            {/* 提示文字 */}
            <p className="text-[10px] text-gray-400 text-center">
              测试后可前往「建议」页面获取 AI 优化方案
            </p>
          </div>
        </>
      )}
    </div>
  );
}
