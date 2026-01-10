"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  X,
  Send,
  Loader2,
  Bot,
  User,
  Trash2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Settings,
  History,
  MessageSquarePlus,
  ChevronLeft,
  Clock,
  Copy,
  Check,
  Square,
  Minus,
  Maximize2,
  GripHorizontal,
  CheckCircle,
  XCircle,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import {
  useAIAssistantStore,
  type AIMessage,
  type NodeAction,
  type TestResultData,
  type NodeResultData,
  type RequirementConfirmation,
} from "@/stores/ai-assistant-store";
import { useWorkflowStore } from "@/stores/workflow-store";
import type { NodeConfig } from "@/types/workflow";
import { cn } from "@/lib/utils";
import { fetchWithTimeout } from "@/lib/http/fetch-with-timeout";
import {
  ConfirmationCard,
  InteractiveOptions,
  TestProgress,
  NodeConfigDisplay,
  LayoutPreview,
  DiagnosisDisplay,
} from "@/components/workflow/ai-assistant";

interface AIAssistantPanelProps {
  workflowId: string;
}

async function readResponsePayload(
  response: Response,
): Promise<{ json: unknown | null; text: string | null }> {
  const contentType = response.headers.get("content-type") || "";
  const cloned = response.clone();

  if (contentType.includes("application/json")) {
    try {
      return { json: await response.json(), text: null };
    } catch {
      try {
        return { json: null, text: await cloned.text() };
      } catch {
        return { json: null, text: null };
      }
    }
  }

  try {
    return { json: null, text: await cloned.text() };
  } catch {
    return { json: null, text: null };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getApiErrorMessage(
  payload: unknown,
  text: string | null,
  status: number,
): string {
  if (isRecord(payload)) {
    const maybeError = payload.error;
    if (isRecord(maybeError) && typeof maybeError.message === "string" && maybeError.message) {
      return maybeError.message;
    }
    if (typeof payload.message === "string" && payload.message) return payload.message;
  }

  if (text && text.trim()) return text.trim();
  return `HTTP ${status}`;
}

function safeSerializeConfig(config: unknown): Record<string, unknown> {
  try {
    return JSON.parse(JSON.stringify(config));
  } catch {
    return {};
  }
}

function generateWorkflowContext(
  nodes: ReturnType<typeof useWorkflowStore.getState>["nodes"],
  edges: ReturnType<typeof useWorkflowStore.getState>["edges"],
): string {
  if (nodes.length === 0) {
    return "当前画布为空，没有任何节点。";
  }

  const workflowData = {
    nodes: nodes.map((node) => {
      const data = node.data as NodeConfig & { comment?: string };
      return {
        id: node.id,
        type: data.type,
        name: data.name,
        position: { x: Math.round(node.position.x), y: Math.round(node.position.y) },
        comment: data.comment || undefined,
        config: safeSerializeConfig(data.config || {}),
      };
    }),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle || undefined,
      targetHandle: edge.targetHandle || undefined,
    })),
  };

  return JSON.stringify(workflowData, null, 2);
}

interface AIProviderConfig {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  defaultModel: string | null;
  models: string[];
  isDefault: boolean;
  displayName: string;
}

export function AIAssistantPanel({ workflowId }: AIAssistantPanelProps) {
  const [inputValue, setInputValue] = useState("");
  const [showContext, setShowContext] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [providerConfigs, setProviderConfigs] = useState<AIProviderConfig[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  const [isResizing, setIsResizing] = useState(false);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(420);

  const pendingDiagnosisNodeIdRef = useRef<string | null>(null);
  const lastTestResultRef = useRef<unknown>(null);
  const testStatusPollFailureCountRef = useRef(0);

  const {
    isOpen,
    closePanel,
    messages,
    isLoading,
    selectedModel,
    availableModels,
    addMessage,
    addMessageAsync,
    updateMessageFixStatus,
    clearMessagesAsync,
    setLoading,
    setSelectedModel,
    setAvailableModels,
    showHistory,
    toggleHistory,
    conversations,
    currentConversationId,
    createConversationAsync,
    selectConversation,
    deleteConversationAsync,
    loadConversations,
    panelPosition,
    panelSize,
    isMinimized,
    setPanelPosition,
    setPanelSize,
    toggleMinimize,
    currentExecutionId,
    testingNodes,
    isTestRunning,
    setCurrentExecutionId,
    setTestingNodes,
    setTestRunning,
  } = useAIAssistantStore();

  const { nodes, edges, addNode, updateNode, deleteNode, onConnect } = useWorkflowStore();

  const fetchProviderConfigs = useCallback(
    async (retryCount = 0) => {
      const MAX_RETRIES = 2;
      const TIMEOUT_MS = 30_000;

      setIsLoadingModels(true);
      try {
        const response = await fetchWithTimeout(
          "/api/ai/providers?modality=text",
          { timeoutMs: TIMEOUT_MS },
        );
        const resData = await response.json();
        if (!response.ok) {
          const errorMsg = resData?.error?.message || resData?.message || `HTTP ${response.status}`;
          throw new Error(errorMsg);
        }
        const data = resData.success ? resData.data : {};
        const providers: AIProviderConfig[] = data.providers || [];
        setProviderConfigs(providers);

        if (providers.length > 0) {
          const models: { id: string; name: string; provider: string; configId: string }[] = [];
          providers.forEach((config) => {
            config.models.forEach((model) => {
              models.push({
                id: `${config.id}:${model}`,
                name: model,
                provider: config.displayName,
                configId: config.id,
              });
            });
          });
          setAvailableModels(models);

          const defaultProvider = data.defaultProvider as AIProviderConfig | null;
          if (defaultProvider && defaultProvider.models.length > 0) {
            const defaultModel = defaultProvider.defaultModel || defaultProvider.models[0];
            setSelectedModel(`${defaultProvider.id}:${defaultModel}`);
          } else if (providers[0]?.models?.length > 0) {
            const firstModel = providers[0].models[0];
            setSelectedModel(`${providers[0].id}:${firstModel}`);
          }
        } else {
          setAvailableModels([]);
        }
      } catch (error) {
        console.error("Failed to fetch AI providers:", error);
        const errorMsg = error instanceof Error ? error.message : "未知错误";

        if (
          retryCount < MAX_RETRIES &&
          (errorMsg.includes("请求超时") ||
            errorMsg.includes("Failed to fetch") ||
            errorMsg.includes("NetworkError"))
        ) {
          setIsLoadingModels(false);
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return fetchProviderConfigs(retryCount + 1);
        }

        if (errorMsg.includes("请求超时")) {
          toast.error("加载模型配置超时，请刷新页面重试");
        } else {
          toast.error(`获取AI服务商配置失败: ${errorMsg}`);
        }
      } finally {
        setIsLoadingModels(false);
      }
    },
    [setAvailableModels, setSelectedModel],
  );

  useEffect(() => {
    if (isOpen) {
      fetchProviderConfigs();
      loadConversations(workflowId);
    }
  }, [isOpen, fetchProviderConfigs, loadConversations, workflowId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isTestRunning || !currentExecutionId) return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(
          `/api/ai-assistant/test-status?id=${currentExecutionId}`,
          { cache: "no-store" },
        );
        const { json, text } = await readResponsePayload(response);

        if (!response.ok) {
          testStatusPollFailureCountRef.current += 1;
          const errorMsg = getApiErrorMessage(json, text, response.status);

          console.warn("轮询测试状态失败:", {
            status: response.status,
            message: errorMsg,
          });

          if (
            response.status === 401 ||
            response.status === 403 ||
            response.status === 404 ||
            response.status === 410 ||
            testStatusPollFailureCountRef.current >= 3
          ) {
            setTestRunning(false);
            setCurrentExecutionId(null);
            toast.error(`获取测试状态失败: ${errorMsg}`);
          }
          return;
        }

        if (!json || !isRecord(json)) {
          testStatusPollFailureCountRef.current += 1;
          const errorMsg = text || "响应格式错误";
          console.warn("轮询测试状态响应异常:", { message: errorMsg });

          if (testStatusPollFailureCountRef.current >= 3) {
            setTestRunning(false);
            setCurrentExecutionId(null);
            toast.error(`获取测试状态失败: ${errorMsg}`);
          }
          return;
        }

        testStatusPollFailureCountRef.current = 0;

        const resData = json;
        const resolved = resData.success === true ? resData.data : resData;

        if (!isRecord(resolved)) {
          console.warn("轮询测试状态响应异常:", { message: "响应数据结构错误" });
          return;
        }

        const data = resolved;
        setTestingNodes((data.nodeResults as NodeResultData[] | undefined) || []);

        if (data.completed) {
          setTestRunning(false);
          setCurrentExecutionId(null);
          
          const lastMessage = messages[messages.length - 1];
          if (lastMessage && lastMessage.phase === "testing" && !lastMessage.testResult) {
            const testResultData: TestResultData = {
              success: data.success as boolean,
              executionId: data.executionId as string | undefined,
              status: data.status as string | undefined,
              duration: data.duration as number | undefined,
              totalTokens: data.totalTokens as number | undefined,
              error: data.error as string | undefined,
              output: data.output as Record<string, unknown> | undefined,
              nodeResults: data.nodeResults as NodeResultData[] | undefined,
              analysis: data.analysis as string | undefined,
            };
            
            await addMessageAsync({
              role: "assistant",
              content: data.success 
                ? `测试完成！正在分析结果...`
                : `测试执行完毕，发现问题。正在分析...`,
              testResult: testResultData,
              phase: "testing",
            });

            try {
              console.log("[AI Assistant] 开始请求测试结果分析...", { testResultData, workflowId, selectedModel });
              const analysisResponse = await fetch("/api/ai-assistant/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  message: "请分析测试结果",
                  mode: "test_analysis",
                  model: selectedModel,
                  testResult: testResultData,
                  workflowId,
                }),
              });
              
              const analysisResData = await analysisResponse.json();
              console.log("[AI Assistant] 分析响应:", { ok: analysisResponse.ok, status: analysisResponse.status, data: analysisResData });
              
              if (analysisResponse.ok) {
                const analysisData = analysisResData.success ? analysisResData.data : analysisResData;
                console.log("[AI Assistant] 分析成功，添加消息:", analysisData);
                
                if (analysisData.phase === "request_node_config" && analysisData.failedNodeId) {
                  pendingDiagnosisNodeIdRef.current = analysisData.failedNodeId;
                  lastTestResultRef.current = testResultData;
                  await addMessageAsync({
                    role: "assistant",
                    content: analysisData.content,
                    interactiveQuestions: analysisData.interactiveQuestions,
                    phase: "request_node_config",
                  });
                } else {
                  await addMessageAsync({
                    role: "assistant",
                    content: analysisData.content,
                    nodeActions: analysisData.nodeActions,
                    phase: analysisData.phase === "fix_suggestion" ? "testing" : undefined,
                    pendingFix: analysisData.phase === "fix_suggestion" && analysisData.requireConfirmation,
                  });
                }
              } else {
                console.error("[AI Assistant] 分析请求失败:", analysisResData);
                await addMessageAsync({
                  role: "assistant",
                  content: `分析失败: ${analysisResData.error?.message || analysisResData.message || "未知错误"}`,
                });
              }
            } catch (analysisError) {
              console.error("[AI Assistant] 分析测试结果异常:", analysisError);
              await addMessageAsync({
                role: "assistant",
                content: `分析过程出错: ${analysisError instanceof Error ? analysisError.message : "未知错误"}`,
              });
            }
          }
        }
      } catch (error) {
        testStatusPollFailureCountRef.current += 1;
        console.warn("轮询测试状态出错:", error);

        if (testStatusPollFailureCountRef.current >= 3) {
          setTestRunning(false);
          setCurrentExecutionId(null);
          toast.error(
            `获取测试状态失败: ${error instanceof Error ? error.message : "未知错误"}`,
          );
        }
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [isTestRunning, currentExecutionId, messages, addMessage, setTestingNodes, setTestRunning, setCurrentExecutionId, workflowId, selectedModel]);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-drag-handle]')) {
      e.preventDefault();
      const rect = panelRef.current?.getBoundingClientRect();
      if (rect) {
        dragOffsetRef.current = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        };
        setIsDragging(true);
      }
    }
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newX = e.clientX - dragOffsetRef.current.x;
      const newY = e.clientY - dragOffsetRef.current.y;
      const maxX = window.innerWidth - panelSize.width;
      const maxY = window.innerHeight - 100;
      setPanelPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY)),
      });
    };

    const handleMouseUp = () => setIsDragging(false);

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, panelSize.width, setPanelPosition]);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      resizeStartXRef.current = e.clientX;
      resizeStartWidthRef.current = panelSize.width;
      setIsResizing(true);
    },
    [panelSize.width],
  );

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - resizeStartXRef.current;
      const newWidth = Math.max(360, Math.min(800, resizeStartWidthRef.current + deltaX));
      setPanelSize({ ...panelSize, width: newWidth });
    };

    const handleMouseUp = () => setIsResizing(false);

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, panelSize, setPanelSize]);

  const panelStyle = useMemo(() => {
    if (panelPosition) {
      return { left: panelPosition.x, top: panelPosition.y, width: panelSize.width };
    }
    return { left: 0, top: 0, width: panelSize.width };
  }, [panelPosition, panelSize.width]);

  const workflowContext = generateWorkflowContext(nodes, edges);

  const applyNodeActions = useCallback(
    (actions: NodeAction[]) => {
      const addedNodes: string[] = [];

      actions.forEach((action) => {
        if (action.action === "add" && action.nodeType && action.nodeName) {
          const nodeId = `${action.nodeType.toLowerCase()}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
          const position = action.position || {
            x: 100 + Math.random() * 200,
            y: 100 + nodes.length * 150,
          };

          addNode({
            id: nodeId,
            type: action.nodeType as NodeConfig["type"],
            name: action.nodeName,
            position,
            config: action.config || getDefaultConfig(action.nodeType),
          } as NodeConfig);

          addedNodes.push(nodeId);
          toast.success(`已添加节点: ${action.nodeName}`);
        } else if (action.action === "connect" && action.source && action.target) {
          const sourceId = action.source.startsWith("new_")
            ? addedNodes[parseInt(action.source.replace("new_", "")) - 1]
            : action.source;
          const targetId = action.target.startsWith("new_")
            ? addedNodes[parseInt(action.target.replace("new_", "")) - 1]
            : action.target;

          if (sourceId && targetId) {
            onConnect({
              source: sourceId,
              target: targetId,
              sourceHandle: action.sourceHandle || null,
              targetHandle: action.targetHandle || null,
            });
          }
        } else if (action.action === "update" && action.nodeId && action.config) {
          const targetNode = nodes.find((n) => n.id === action.nodeId);
          if (targetNode) {
            const currentConfig = (targetNode.data as NodeConfig).config || {};
            const mergedConfig = { ...currentConfig, ...action.config };
            updateNode(action.nodeId, { config: mergedConfig } as Partial<NodeConfig>);
            const nodeName = action.nodeName || (targetNode.data as NodeConfig).name || action.nodeId;
            toast.success(`已更新节点: ${nodeName}`);
          } else {
            toast.error(`未找到节点: ${action.nodeId}`);
          }
        } else if (action.action === "delete" && action.nodeId) {
          const targetNode = nodes.find((n) => n.id === action.nodeId);
          if (targetNode) {
            const nodeName = action.nodeName || (targetNode.data as NodeConfig).name || action.nodeId;
            deleteNode(action.nodeId);
            toast.success(`已删除节点: ${nodeName}`);
          } else {
            toast.error(`未找到节点: ${action.nodeId}`);
          }
        }
      });
    },
    [nodes, addNode, updateNode, deleteNode, onConnect],
  );

  const handleAbort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort(new DOMException("用户取消请求", "AbortError"));
      abortControllerRef.current = null;
      setLoading(false);
      toast.info("已停止生成");
    }
  }, [setLoading]);

  const handleSend = useCallback(async (messageOverride?: string) => {
    const trimmedInput = messageOverride ?? inputValue.trim();
    if (!trimmedInput || isLoading) return;

    if (!messageOverride) {
      await addMessageAsync({ role: "user", content: trimmedInput });
      setInputValue("");
    }
    setLoading(true);

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetchWithTimeout("/api/ai-assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmedInput,
          model: selectedModel,
          workflowContext,
          workflowId,
          history: messages.slice(-10).map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
        signal: abortControllerRef.current.signal,
        timeoutMs: 120_000,
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData.error?.message || errorData.message || (typeof errorData.error === 'string' ? errorData.error : "请求失败");
        throw new Error(errorMessage);
      }

      const resData = await response.json();
      const data = resData.success ? resData.data : resData;

      if (data.phase === "testing_pending" && data.pendingNodes) {
        setTestingNodes(data.pendingNodes);
        setCurrentExecutionId(data.executionId);
        setTestRunning(true);
        await addMessageAsync({
          role: "assistant",
          content: data.content,
          phase: "testing",
        });
      } else if (data.phase === "testing" && data.testResult) {
        await addMessageAsync({
          role: "assistant",
          content: data.content,
          testResult: data.testResult,
          phase: "testing",
        });
      } else if (data.phase === "fix_suggestion" && data.requireConfirmation) {
        await addMessageAsync({
          role: "assistant",
          content: data.content,
          nodeActions: data.nodeActions,
          pendingFix: true,
        });
      } else if (data.phase === "requirement_confirmation" && data.requirementConfirmation) {
        await addMessageAsync({
          role: "assistant",
          content: data.content,
          phase: "requirement_confirmation",
          requirementConfirmation: data.requirementConfirmation,
        });
      } else if (data.phase === "planning" && data.interactiveQuestions) {
        await addMessageAsync({
          role: "assistant",
          content: data.content,
          phase: "planning",
          interactiveQuestions: data.interactiveQuestions,
        });
      } else if (data.phase === "test_data_selection" && data.interactiveQuestions) {
        await addMessageAsync({
          role: "assistant",
          content: data.content,
          phase: "test_data_selection",
          interactiveQuestions: data.interactiveQuestions,
        });
      } else if (data.phase === "node_selection" && data.nodeSelection) {
        await addMessageAsync({
          role: "assistant",
          content: data.content,
          phase: "node_selection",
          nodeSelection: data.nodeSelection,
        });
      } else if (data.phase === "node_diagnosis" && data.diagnosis) {
        await addMessageAsync({
          role: "assistant",
          content: data.content,
          phase: "node_diagnosis",
          diagnosis: data.diagnosis,
          suggestions: data.suggestions,
          interactiveQuestions: data.interactiveQuestions,
          nodeActions: data.nodeActions,
          pendingFix: data.requireConfirmation,
        });
      } else if (data.layoutPreview && data.layoutPreview.length > 0) {
        await addMessageAsync({
          role: "assistant",
          content: data.content,
          phase: "planning",
          layoutPreview: data.layoutPreview,
        });
      } else {
        await addMessageAsync({
          role: "assistant",
          content: data.content,
          nodeActions: data.nodeActions,
        });

        if (data.nodeActions && data.nodeActions.length > 0 && data.phase !== "fix_suggestion") {
          setTimeout(() => {
            applyNodeActions(data.nodeActions);
          }, 300);
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      let errorMessage = error instanceof Error ? error.message : "AI请求失败";
      if (errorMessage.includes("请求超时")) {
        errorMessage = "请求超时，请检查网络连接";
      }
      toast.error(errorMessage);
      await addMessageAsync({
        role: "assistant",
        content: `抱歉，请求出错了：${errorMessage}`,
      });
    } finally {
      abortControllerRef.current = null;
      setLoading(false);
    }
  }, [
    inputValue,
    isLoading,
    selectedModel,
    workflowContext,
    workflowId,
    messages,
    addMessageAsync,
    setLoading,
    applyNodeActions,
    setTestingNodes,
    setCurrentExecutionId,
    setTestRunning,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleConfirmFix = useCallback((message: AIMessage) => {
    if (message.nodeActions && message.nodeActions.length > 0) {
      applyNodeActions(message.nodeActions);
      updateMessageFixStatus(message.id, 'applied');
      toast.success("修复已应用");
    }
  }, [applyNodeActions, updateMessageFixStatus]);

  const handleRejectFix = useCallback((message: AIMessage) => {
    updateMessageFixStatus(message.id, 'rejected');
    toast.info("已跳过修复");
  }, [updateMessageFixStatus]);

  const handleConfirmRequirement = useCallback(async (confirmation: RequirementConfirmation) => {
    const confirmationText = `确认创建工作流：

**工作流名称**：${confirmation.workflowName}
**目标**：${confirmation.goal}

**输入字段**：
${confirmation.inputFields.map(f => `- ${f.name} (${f.type}, ${f.required ? '必填' : '选填'})`).join('\n')}

**处理步骤**：
${confirmation.processSteps.map((s, i) => `${i + 1}. ${s.name}: ${s.description}`).join('\n')}

请根据以上确认的信息创建工作流。`;
    
    await addMessageAsync({ role: "user", content: confirmationText });
    handleSend(confirmationText);
  }, [addMessageAsync, handleSend]);

  const handleCancelRequirement = useCallback(async () => {
    const msg = "取消创建，让我重新描述需求。";
    await addMessageAsync({ role: "user", content: msg });
    handleSend(msg);
  }, [addMessageAsync, handleSend]);

  const getNodeConfigForDiagnosis = useCallback((nodeId: string) => {
    const targetNode = nodes.find(n => n.id === nodeId);
    if (!targetNode) return null;
    
    const nodeData = targetNode.data as NodeConfig;
    const config = nodeData.config as Record<string, unknown> | undefined;
    
    return {
      nodeId: nodeData.id,
      nodeName: nodeData.name,
      nodeType: nodeData.type,
      config: config ? {
        systemPrompt: config.systemPrompt,
        userPrompt: config.userPrompt,
        model: config.model,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        tools: config.tools,
        enableToolCalling: config.enableToolCalling,
        knowledgeBaseId: config.knowledgeBaseId,
        ragConfig: config.ragConfig,
      } : undefined,
    };
  }, [nodes]);

  const triggerWorkflowTest = useCallback(async (autoGenerate: boolean) => {
    setLoading(true);
    
    const inputNode = nodes.find(n => (n.data as NodeConfig).type === "INPUT");
    const inputConfig = (inputNode?.data as NodeConfig)?.config as { fields?: Array<{ name: string; value?: string }> } | undefined;
    const inputFields = inputConfig?.fields || [];
    
    const testInput: Record<string, string> = {};
    inputFields.forEach((field) => {
      testInput[field.name] = field.value || "";
    });

    const missingRequiredFields = (inputConfig?.fields || [])
      .filter((field) => (field as any).required && !String(field.value || "").trim())
      .map((field) => field.name);

    if (!autoGenerate && missingRequiredFields.length > 0) {
      await addMessageAsync({
        role: "assistant",
        content: `无法开始测试：INPUT 节点存在未填写的必填字段：${missingRequiredFields
          .map((name) => `「${name}」`)
          .join("、")}。\n\n你可以先在 INPUT 节点为这些字段预填 value，再点击测试；或选择“AI 生成数据”模式自动生成后测试。`,
      });
      setLoading(false);
      return;
    }

    await addMessageAsync({
      role: "assistant",
      content: autoGenerate 
        ? "好的，正在生成测试数据并执行测试..."
        : "好的，正在使用预填数据执行测试...",
      phase: "testing",
    });

    try {
      if (autoGenerate) {
        const response = await fetchWithTimeout("/api/ai-assistant/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "test_data_generation",
            model: selectedModel,
            workflowContext,
            workflowId,
            message:
              "请为“微信公众号文章二创”场景生成一份测试输入，并立即触发测试。",
          }),
          timeoutMs: 120_000,
        });

        const resData = await response.json();
        if (!response.ok) {
          throw new Error(resData.error?.message || resData.message || "生成测试数据失败");
        }

        const data = resData.success ? resData.data : resData;
        if (data.phase === "testing_pending" && data.executionId) {
          setTestingNodes(data.pendingNodes || []);
          setCurrentExecutionId(data.executionId);
          setTestRunning(true);
          if (data.content) {
            await addMessageAsync({
              role: "assistant",
              content: data.content,
              phase: "testing",
            });
          }
          return;
        }

        if (data.testRequest?.testInput) {
          // 兜底：如果 AI 生成了 testInput 但未触发测试，则用 /test 执行一次
          const fallbackResponse = await fetch("/api/ai-assistant/test", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              workflowId,
              testInput: data.testRequest.testInput,
            }),
          });
          const fallbackResData = await fallbackResponse.json();
          if (!fallbackResponse.ok) {
            throw new Error(
              fallbackResData.error?.message ||
                fallbackResData.message ||
                "测试启动失败",
            );
          }
          const fallbackData = fallbackResData.success ? fallbackResData.data : fallbackResData;
          setTestingNodes(fallbackData.pendingNodes || []);
          setCurrentExecutionId(fallbackData.executionId);
          setTestRunning(true);
          return;
        }

        await addMessageAsync({
          role: "assistant",
          content:
            data.content ||
            "生成测试数据失败：未获得可用的 testInput，请重试。",
        });
        return;
      }

      const response = await fetch("/api/ai-assistant/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowId,
          testInput,
        }),
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error?.message || resData.message || "测试启动失败");
      }
      const data = resData.success ? resData.data : resData;
      setTestingNodes(data.pendingNodes || []);
      setCurrentExecutionId(data.executionId);
      setTestRunning(true);
    } catch (error) {
      await addMessageAsync({
        role: "assistant",
        content: `测试启动失败：${error instanceof Error ? error.message : "未知错误"}`,
      });
    } finally {
      setLoading(false);
    }
  }, [workflowId, nodes, addMessageAsync, setLoading, setTestingNodes, setCurrentExecutionId, setTestRunning, selectedModel, workflowContext]);

  const handleSubmitAnswers = useCallback(async (answers: Record<string, string | string[]>) => {
    const answerText = Object.entries(answers)
      .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
      .join('\n');
    const msg = `我的选择：\n${answerText}`;
    await addMessageAsync({ role: "user", content: msg });

    const testMode = answers["test_mode"];
    const getNodeConfig = answers["get_node_config"];
    
    if (testMode === "use_existing" || testMode === "auto_generate") {
      await triggerWorkflowTest(testMode === "auto_generate");
    } else if (getNodeConfig === "yes" && pendingDiagnosisNodeIdRef.current) {
      const nodeConfig = getNodeConfigForDiagnosis(pendingDiagnosisNodeIdRef.current);
      if (nodeConfig) {
        setLoading(true);
        await addMessageAsync({
          role: "assistant",
          content: `正在获取「${nodeConfig.nodeName}」节点配置并进行深度诊断...`,
        });
        
        try {
          const diagnosisResponse = await fetch("/api/ai-assistant/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode: "node_diagnosis",
              model: selectedModel,
              nodeConfig,
              testResult: lastTestResultRef.current,
              workflowId,
            }),
          });
          
          const diagnosisResData = await diagnosisResponse.json();
          
          if (diagnosisResponse.ok) {
            const diagnosisData = diagnosisResData.success ? diagnosisResData.data : diagnosisResData;
            await addMessageAsync({
              role: "assistant",
              content: diagnosisData.content,
              nodeActions: diagnosisData.nodeActions,
              pendingFix: diagnosisData.phase === "fix_suggestion" && diagnosisData.requireConfirmation,
            });
          } else {
            await addMessageAsync({
              role: "assistant",
              content: `诊断失败: ${diagnosisResData.error?.message || diagnosisResData.message || "未知错误"}`,
            });
          }
        } catch (error) {
          await addMessageAsync({
            role: "assistant",
            content: `诊断过程出错: ${error instanceof Error ? error.message : "未知错误"}`,
          });
        } finally {
          setLoading(false);
          pendingDiagnosisNodeIdRef.current = null;
          lastTestResultRef.current = null;
        }
      } else {
        await addMessageAsync({
          role: "assistant",
          content: "未找到对应的节点配置信息，请检查节点是否存在。",
        });
      }
    } else if (getNodeConfig === "no") {
      pendingDiagnosisNodeIdRef.current = null;
      lastTestResultRef.current = null;
      await addMessageAsync({
        role: "assistant",
        content: "好的，您可以自行检查节点配置。如需帮助，随时告诉我。",
      });
    } else {
      handleSend(msg);
    }
  }, [addMessageAsync, handleSend, triggerWorkflowTest, getNodeConfigForDiagnosis, setLoading, selectedModel, workflowId]);

  const handleSelectNode = useCallback(async (nodeId: string) => {
    const msg = `我要配置节点: ${nodeId}`;
    await addMessageAsync({ role: "user", content: msg });
    handleSend(msg);
  }, [addMessageAsync, handleSend]);

  const handleConfirmLayout = useCallback(async () => {
    const msg = "确认，请应用这个布局。";
    await addMessageAsync({ role: "user", content: msg });
    handleSend(msg);
  }, [addMessageAsync, handleSend]);

  const handleCancelLayout = useCallback(async () => {
    const msg = "我想重新规划布局。";
    await addMessageAsync({ role: "user", content: msg });
    handleSend(msg);
  }, [addMessageAsync, handleSend]);

  const handleNewConversation = useCallback(async () => {
    await createConversationAsync(workflowId);
  }, [createConversationAsync, workflowId]);

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    } else if (diffDays === 1) {
      return "昨天";
    } else if (diffDays < 7) {
      return `${diffDays}天前`;
    } else {
      return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
    }
  };

  const workflowConversations = conversations.filter((c) => c.workflowId === workflowId);

  if (!isOpen) return null;

  if (isMinimized) {
    return (
      <div
        ref={panelRef}
        className={cn(
          "fixed z-50 flex items-center gap-2 rounded-xl border bg-white px-3 py-2 shadow-lg hover:shadow-xl transition-shadow",
          isDragging ? "cursor-grabbing" : "cursor-grab"
        )}
        style={{ left: panelPosition?.x ?? 16, top: panelPosition?.y ?? 16 }}
        onMouseDown={(e) => {
          if ((e.target as HTMLElement).closest('[data-expand-button]')) return;
          e.preventDefault();
          const rect = panelRef.current?.getBoundingClientRect();
          if (rect) {
            dragOffsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            setIsDragging(true);
          }
        }}
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <span className="text-sm font-medium text-gray-700">AI 助手</span>
        <button data-expand-button onClick={toggleMinimize} className="p-1 hover:bg-gray-100 rounded">
          <Maximize2 className="h-4 w-4 text-gray-400" />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      className={cn(
        "fixed z-50 flex flex-col rounded-2xl border bg-slate-50 shadow-xl overflow-hidden",
        isDragging && "cursor-grabbing select-none",
        !panelPosition && "h-full rounded-none"
      )}
      style={{
        ...panelStyle,
        height: panelPosition ? panelSize.height : "100%",
        maxHeight: panelPosition ? "calc(100vh - 32px)" : "100%",
      }}
      onMouseDown={handleDragStart}
    >
      <div
        className="absolute right-0 top-0 h-full w-1 cursor-ew-resize bg-transparent hover:bg-blue-400/50 transition-colors z-50"
        onMouseDown={handleResizeStart}
      />

      <div
        data-drag-handle
        className={cn(
          "flex items-center justify-between border-b bg-white px-4 py-3",
          panelPosition && "cursor-grab",
          isDragging && "cursor-grabbing"
        )}
      >
        <div className="flex items-center gap-3">
          {panelPosition && <GripHorizontal className="h-4 w-4 text-gray-300 mr-1" />}
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <h3 className="text-sm font-semibold text-gray-800">AI 助手</h3>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={handleNewConversation} title="新建对话" className="h-8 w-8 text-gray-500 hover:text-gray-700 hover:bg-gray-100">
            <MessageSquarePlus className="h-4 w-4" />
          </Button>
          <Button variant={showHistory ? "secondary" : "ghost"} size="icon" onClick={toggleHistory} title="历史记录" className="h-8 w-8 text-gray-500 hover:text-gray-700 hover:bg-gray-100">
            <History className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={clearMessagesAsync} title="清空对话" className="h-8 w-8 text-gray-500 hover:text-gray-700 hover:bg-gray-100">
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={toggleMinimize} title="最小化" className="h-8 w-8 text-gray-500 hover:text-gray-700 hover:bg-gray-100">
            <Minus className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={closePanel} className="h-8 w-8 text-gray-500 hover:text-gray-700 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="border-b bg-white px-4 py-2 space-y-2">
        {isLoadingModels ? (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>加载模型配置...</span>
          </div>
        ) : availableModels.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-amber-600">
            <AlertCircle className="h-3 w-3" />
            <span>未配置AI服务商</span>
            <Link href="/settings/ai-config" className="ml-auto flex items-center gap-1 text-blue-500 hover:underline">
              <Settings className="h-3 w-3" />
              前往设置
            </Link>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">模型:</span>
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger className="h-7 flex-1 text-xs border-gray-200 bg-gray-50">
                <SelectValue placeholder="选择模型" />
              </SelectTrigger>
              <SelectContent>
                {providerConfigs.map((config) => (
                  <div key={config.id}>
                    <div className="px-2 py-1.5 text-xs font-semibold text-gray-500">
                      {config.displayName}
                      {config.isDefault && <span className="ml-1 text-blue-500">(默认)</span>}
                    </div>
                    {(Array.isArray((config as any).models) ? ((config as any).models as string[]) : []).map((model) => (
                      <SelectItem key={`${config.id}:${model}`} value={`${config.id}:${model}`} className="text-xs pl-4">
                        {model}
                      </SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {showHistory ? (
          <div className="flex flex-1 flex-col overflow-hidden bg-white min-h-0">
            <div className="flex items-center justify-between border-b px-4 py-2 bg-gray-50">
              <button className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700" onClick={toggleHistory}>
                <ChevronLeft className="h-3 w-3" />
                返回对话
              </button>
              <span className="text-xs text-gray-500">{workflowConversations.length} 条对话</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {workflowConversations.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center p-4 text-center">
                  <History className="mb-2 h-8 w-8 text-gray-300" />
                  <p className="text-sm text-gray-500">暂无历史对话</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {workflowConversations.map((conv) => (
                    <div
                      key={conv.id}
                      className={cn(
                        "group flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-gray-50",
                        currentConversationId === conv.id && "bg-blue-50"
                      )}
                      onClick={() => selectConversation(conv.id)}
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-100 to-blue-200">
                        <Bot className="h-4 w-4 text-blue-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="truncate text-sm font-medium text-gray-800">{conv.title}</h4>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteConversationAsync(conv.id);
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <Clock className="h-3 w-3" />
                          <span>{formatTime(conv.updatedAt)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            <Collapsible open={showContext} onOpenChange={setShowContext} className="border-b bg-white">
              <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-2 text-xs text-gray-500 hover:bg-gray-50">
                <span>工作流上下文 (JSON)</span>
                {showContext ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="max-h-48 overflow-auto border-t bg-gray-50 px-4 py-2">
                  <pre className="whitespace-pre-wrap text-xs text-gray-600 font-mono">{workflowContext}</pre>
                </div>
              </CollapsibleContent>
            </Collapsible>

            <div className="flex-1 overflow-y-auto p-4 bg-white">
              {messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-100 to-blue-200">
                    <Bot className="h-8 w-8 text-blue-600" />
                  </div>
                  <h4 className="mb-2 font-medium text-gray-800">你好！我是AI助手</h4>
                  <p className="mb-4 text-sm text-gray-500">
                    我可以帮你分析和修改当前工作流
                    <br />
                    告诉我你想要做什么
                  </p>
                  <div className="space-y-2 text-xs text-gray-500 w-full px-4">
                    <button
                      className="block w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-left hover:bg-gray-100 text-gray-600"
                      onClick={() => setInputValue("帮我创建一个新的工作流")}
                    >
                      创建新工作流
                    </button>
                    <button
                      className="block w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-left hover:bg-gray-100 text-gray-600"
                      onClick={() => setInputValue("帮我测试当前工作流")}
                    >
                      测试现有工作流
                    </button>
                    <button
                      className="block w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-left hover:bg-gray-100 text-gray-600"
                      onClick={() => setInputValue("帮我设计工作流的节点逻辑")}
                    >
                      设计工作流节点
                    </button>
                    <button
                      className="block w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-left hover:bg-gray-100 text-gray-600"
                      onClick={() => setInputValue("帮我配置某个节点的详细设置")}
                    >
                      更改某个节点的详细配置
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((message) => (
                    <MessageBubble 
                      key={message.id} 
                      message={message}
                      onConfirmFix={handleConfirmFix}
                      onRejectFix={handleRejectFix}
                      onConfirmRequirement={handleConfirmRequirement}
                      onCancelRequirement={handleCancelRequirement}
                      onSubmitAnswers={handleSubmitAnswers}
                      onSelectNode={handleSelectNode}
                      onConfirmLayout={handleConfirmLayout}
                      onCancelLayout={handleCancelLayout}
                    />
                  ))}
                  {isTestRunning && testingNodes.length > 0 && (
                    <div className="flex items-start gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600">
                        <Bot className="h-4 w-4 text-white" />
                      </div>
                      <div className="flex-1">
                        <TestProgress 
                          nodeResults={testingNodes} 
                          isRunning={true}
                          className="max-w-full"
                        />
                      </div>
                    </div>
                  )}
                  {isLoading && !isTestRunning && (
                    <div className="flex items-start gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600">
                        <Bot className="h-4 w-4 text-white" />
                      </div>
                      <div className="flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-3">
                        <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                        <span className="text-sm text-gray-600">思考中...</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-2 h-6 px-2 text-xs text-gray-500 hover:text-red-500"
                          onClick={handleAbort}
                        >
                          <Square className="h-3 w-3 mr-1" />
                          停止
                        </Button>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            <div className="border-t bg-white p-4">
              <div className="flex gap-2">
                <Textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={availableModels.length === 0 ? "请先配置AI服务商..." : "描述你的需求或提问..."}
                  className="min-h-[60px] resize-none border-gray-200 bg-gray-50 focus:bg-white"
                  disabled={isLoading || availableModels.length === 0}
                />
                <Button
                  onClick={isLoading ? handleAbort : () => handleSend()}
                  disabled={!isLoading && (!inputValue.trim() || !selectedModel)}
                  variant={isLoading ? "destructive" : "default"}
                  className={cn("h-auto px-4", !isLoading && "bg-blue-500 hover:bg-blue-600")}
                >
                  {isLoading ? <Square className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
              <p className="mt-2 text-xs text-gray-400">按 Enter 发送，Shift + Enter 换行</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ 
  message,
  onConfirmFix,
  onRejectFix,
  onConfirmRequirement,
  onCancelRequirement,
  onSubmitAnswers,
  onSelectNode,
  onConfirmLayout,
  onCancelLayout,
}: { 
  message: AIMessage;
  onConfirmFix?: (message: AIMessage) => void;
  onRejectFix?: (message: AIMessage) => void;
  onConfirmRequirement?: (confirmation: RequirementConfirmation) => void;
  onCancelRequirement?: () => void;
  onSubmitAnswers?: (answers: Record<string, string | string[]>) => void;
  onSelectNode?: (nodeId: string) => void;
  onConfirmLayout?: () => void;
  onCancelLayout?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      toast.success("已复制到剪贴板");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("复制失败");
    }
  };

  return (
    <div className={cn("flex items-start gap-3", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white",
          isUser ? "bg-primary" : "bg-gradient-to-br from-blue-500 to-blue-600"
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div
        className={cn(
          "group relative max-w-[85%] rounded-lg px-4 py-3",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted"
        )}
      >
        <div className="whitespace-pre-wrap text-sm">{message.content}</div>
        
        {message.requirementConfirmation && onConfirmRequirement && onCancelRequirement && (
          <div className="mt-3">
            <ConfirmationCard
              confirmation={message.requirementConfirmation}
              onConfirm={onConfirmRequirement}
              onCancel={onCancelRequirement}
            />
          </div>
        )}
        
        {message.interactiveQuestions && message.interactiveQuestions.length > 0 && onSubmitAnswers && (
          <div className="mt-3">
            <InteractiveOptions
              questions={message.interactiveQuestions}
              onSubmit={onSubmitAnswers}
            />
          </div>
        )}
        
        {message.nodeSelection && message.nodeSelection.length > 0 && onSelectNode && (
          <div className="mt-3">
            <NodeConfigDisplay
              nodes={message.nodeSelection}
              onSelectNode={onSelectNode}
            />
          </div>
        )}
        
        {message.layoutPreview && message.layoutPreview.length > 0 && onConfirmLayout && onCancelLayout && (
          <div className="mt-3">
            <LayoutPreview
              nodes={message.layoutPreview as Array<{ action: 'add'; nodeType: string; nodeName: string; config?: Record<string, unknown> }>}
              onConfirm={onConfirmLayout}
              onCancel={onCancelLayout}
            />
          </div>
        )}
        
        {message.diagnosis && (
          <div className="mt-3">
            <DiagnosisDisplay
              diagnosis={message.diagnosis}
              suggestions={message.suggestions}
            />
          </div>
        )}
        
        {message.testResult && (
          <TestResultDisplay result={message.testResult} />
        )}
        
        {message.pendingFix && message.nodeActions && message.nodeActions.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <Wrench className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-medium text-gray-700">修复建议</span>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              AI建议修改 {message.nodeActions.length} 个节点，是否应用修复？
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => onConfirmFix?.(message)}
                className="bg-green-500 hover:bg-green-600 text-white"
              >
                <Check className="h-3 w-3 mr-1" />
                确认修复
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onRejectFix?.(message)}
              >
                暂不修复
              </Button>
            </div>
          </div>
        )}
        
        {message.fixStatus === 'applied' && (
          <div className="mt-2 pt-2 border-t border-gray-200 flex items-center gap-2 text-xs text-green-600">
            <CheckCircle className="h-3 w-3" />
            <span>修复已应用</span>
          </div>
        )}
        
        {message.fixStatus === 'rejected' && (
          <div className="mt-2 pt-2 border-t border-gray-200 flex items-center gap-2 text-xs text-gray-500">
            <XCircle className="h-3 w-3" />
            <span>已跳过修复</span>
          </div>
        )}
        
        {!isUser && !message.testResult && !message.pendingFix && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute -right-1 -bottom-1 h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100 bg-background border shadow-sm"
            onClick={handleCopy}
            title="复制内容"
          >
            {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
          </Button>
        )}
      </div>
    </div>
  );
}

function TestResultDisplay({ result }: { result: TestResultData }) {
  const [expanded, setExpanded] = useState(false);
  const [showFinalOutput, setShowFinalOutput] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyFinal = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(result.output ?? result, null, 2));
      setCopied(true);
      toast.success("已复制测试结果");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("复制失败");
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-gray-200">
      <div className="flex items-center gap-2 mb-2">
        {result.success ? (
          <CheckCircle className="h-4 w-4 text-green-500" />
        ) : (
          <XCircle className="h-4 w-4 text-red-500" />
        )}
        <span className={cn("text-sm font-medium", result.success ? "text-green-700" : "text-red-700")}>
          {result.success ? "测试通过" : "测试失败"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {result.executionId && (
            <span className="text-xs text-gray-400">ID: {result.executionId}</span>
          )}
          {result.duration && (
            <span className="text-xs text-gray-400">{result.duration}ms</span>
          )}
          {(result.output || result.error || result.nodeResults?.length) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={handleCopyFinal}
            >
              {copied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
              {copied ? "已复制" : "复制"}
            </Button>
          )}
        </div>
      </div>
      
      {result.error && (
        <div className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded mb-2">
          {result.error}
        </div>
      )}
      
      {result.analysis && (
        <div className="text-xs text-gray-600 mb-2">{result.analysis}</div>
      )}

      {result.output && (
        <Collapsible open={showFinalOutput} onOpenChange={setShowFinalOutput}>
          <CollapsibleTrigger className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600">
            {showFinalOutput ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            查看最终输出
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <pre className="p-2 bg-gray-100 rounded text-xs overflow-auto max-h-64 whitespace-pre-wrap break-words">
              {JSON.stringify(result.output, null, 2)}
            </pre>
          </CollapsibleContent>
        </Collapsible>
      )}
      
      {result.nodeResults && result.nodeResults.length > 0 && (
        <Collapsible open={expanded} onOpenChange={setExpanded}>
          <CollapsibleTrigger className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600">
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            查看节点详情 ({result.nodeResults.length} 个节点)
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-2">
            {result.nodeResults.map((node, idx) => (
              <NodeResultItem key={node.nodeId || idx} node={node} />
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}
      
      {result.totalTokens && (
        <div className="text-xs text-gray-400 mt-2">
          Token消耗: {result.totalTokens}
        </div>
      )}
    </div>
  );
}

function NodeResultItem({ node }: { node: NodeResultData }) {
  const [showOutput, setShowOutput] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(node.output ?? { error: node.error }, null, 2));
      setCopied(true);
      toast.success("已复制节点结果");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("复制失败");
    }
  };

  return (
    <div className={cn(
      "text-xs p-2 rounded border",
      node.status === "success" ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
    )}>
      <div className="flex items-center gap-2">
        {node.status === "success" ? (
          <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />
        ) : (
          <XCircle className="h-3 w-3 text-red-500 shrink-0" />
        )}
        <span className="font-medium truncate">{node.nodeName}</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-gray-400">{node.nodeType}</span>
          {(node.output || node.error) && (
            <button
              type="button"
              className="text-gray-400 hover:text-gray-700"
              onClick={handleCopy}
              title="复制节点结果"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </button>
          )}
        </div>
      </div>
      
      {node.error && (
        <div className="text-red-600 mt-1 pl-5">{node.error}</div>
      )}
      
      {node.duration && (
        <div className="text-gray-400 mt-1 pl-5">{node.duration}ms</div>
      )}
      
      {node.output && Object.keys(node.output).length > 0 && (
        <div className="mt-1 pl-5">
          <button
            className="text-blue-500 hover:underline"
            onClick={() => setShowOutput(!showOutput)}
          >
            {showOutput ? "隐藏输出" : "查看输出"}
          </button>
          {showOutput && (
            <pre className="mt-1 p-1 bg-gray-100 rounded text-xs overflow-auto max-h-32">
              {JSON.stringify(node.output, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function getDefaultConfig(type: string): Record<string, unknown> {
  switch (type.toUpperCase()) {
    case "INPUT":
      return { fields: [] };
    case "PROCESS":
      return { systemPrompt: "", userPrompt: "", temperature: 0.7, maxTokens: 10000 };
    case "CODE":
      return { prompt: "", language: "javascript", code: "" };
    case "OUTPUT":
      return { prompt: "", format: "text", templateName: "" };
    case "LOGIC":
      return { mode: "condition", conditions: [] };
    default:
      return {};
  }
}
