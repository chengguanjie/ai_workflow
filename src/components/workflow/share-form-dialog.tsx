"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Loader2,
  Plus,
  Copy,
  ExternalLink,
  Trash2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Eye,
  RefreshCw,
  Maximize2,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { useWorkflowStore } from "@/stores/workflow-store"

interface WorkflowForm {
  id: string
  name: string
  description: string | null
  shareToken: string
  isActive: boolean
  expiresAt: string | null
  maxSubmissions: number | null
  submissionCount: number
  showResult: boolean
  mode: string
  stylePrompt: string | null
  createdAt: string
  updatedAt: string
}

interface InputField {
  nodeId: string
  nodeName: string
  fieldId: string
  fieldName: string
  fieldType: string
  defaultValue: string
  options?: Array<{ label: string; value: string }>
  placeholder?: string
  required?: boolean
  description?: string
}

interface ShareFormDialogProps {
  workflowId: string
  isOpen: boolean
  onClose: () => void
}

export function ShareFormDialog({
  workflowId,
  isOpen,
  onClose,
}: ShareFormDialogProps) {
  const [forms, setForms] = useState<WorkflowForm[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [expandedFormId, setExpandedFormId] = useState<string | null>(null)

  // 获取工作流 store 中的节点信息
  const { nodes, name: workflowName, description: workflowDescription } = useWorkflowStore()

  // 创建表单状态
  const [newFormName, setNewFormName] = useState("")
  const [newFormDescription, setNewFormDescription] = useState("")
  const [newFormShowResult, setNewFormShowResult] = useState(true)
  const [newFormSuccessMessage, setNewFormSuccessMessage] = useState("")
  const [newFormExpiresAt, setNewFormExpiresAt] = useState("")
  const [newFormMaxSubmissions, setNewFormMaxSubmissions] = useState("")

  // AI 网页模式状态
  const [formMode, setFormMode] = useState<"form" | "ai_page">("form")
  const [stylePrompt, setStylePrompt] = useState("")
  const [generatedHtml, setGeneratedHtml] = useState("")
  const [generatedCss, setGeneratedCss] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  // 获取输入字段
  // 使用 React Flow 节点的 type 属性（小写）来判断，这是最可靠的方式
  const inputFields: InputField[] = nodes
    .filter((node) => node.type === "input")
    .flatMap((node) => {
      const nodeData = node.data as {
        name?: string
        config?: {
          fields?: Array<{
            id: string
            name: string
            value: string
            fieldType?: string
            options?: Array<{ label: string; value: string }>
            placeholder?: string
            required?: boolean
            description?: string
          }>
        }
      }
      const fields = nodeData?.config?.fields || []
      return fields.map((field) => ({
        nodeId: node.id,
        nodeName: String(nodeData?.name || "输入"),
        fieldId: field.id,
        fieldName: field.name,
        fieldType: field.fieldType || "text",
        defaultValue: field.value || "",
        options: field.options,
        placeholder: field.placeholder,
        required: field.required,
        description: field.description,
      }))
    })

  // 加载表单列表
  const loadForms = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/workflows/${workflowId}/forms`)
      const data = await response.json()

      if (response.ok) {
        setForms(data.forms || [])
      } else {
        toast.error(data.error || "加载表单列表失败")
      }
    } catch (error) {
      console.error("Load forms error:", error)
      toast.error("加载表单列表失败")
    } finally {
      setLoading(false)
    }
  }, [workflowId])

  useEffect(() => {
    if (isOpen) {
      loadForms()
    }
  }, [isOpen, loadForms])

  // AI 生成 HTML
  const handleGenerateHtml = async () => {
    if (!stylePrompt.trim()) {
      toast.error("请输入风格描述")
      return
    }

    if (inputFields.length === 0) {
      toast.error("没有可用的输入字段，请先在工作流中添加输入节点")
      return
    }

    setIsGenerating(true)
    try {
      const response = await fetch("/api/ai/generate-form-html", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formName: newFormName || "未命名表单",
          formDescription: newFormDescription,
          workflowName,
          workflowDescription,
          inputFields: inputFields.map((f) => ({
            fieldId: f.fieldId,
            fieldName: f.fieldName,
            fieldType: f.fieldType,
            placeholder: f.placeholder,
            required: f.required,
            description: f.description,
            options: f.options,
          })),
          stylePrompt,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setGeneratedHtml(data.html)
        setGeneratedCss(data.css)
        toast.success("HTML 生成成功")
        setShowPreview(true)
      } else {
        toast.error(data.error || "生成失败")
      }
    } catch (error) {
      console.error("Generate HTML error:", error)
      toast.error("生成失败")
    } finally {
      setIsGenerating(false)
    }
  }

  // 创建表单
  const handleCreateForm = async () => {
    if (!newFormName.trim()) {
      toast.error("请输入表单名称")
      return
    }

    if (formMode === "ai_page" && !generatedHtml) {
      toast.error("请先生成 AI 网页模板")
      return
    }

    setCreating(true)
    try {
      const response = await fetch(`/api/workflows/${workflowId}/forms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newFormName.trim(),
          description: newFormDescription.trim() || undefined,
          showResult: newFormShowResult,
          successMessage: newFormSuccessMessage.trim() || undefined,
          expiresAt: newFormExpiresAt || undefined,
          maxSubmissions: newFormMaxSubmissions || undefined,
          mode: formMode,
          stylePrompt: formMode === "ai_page" ? stylePrompt : undefined,
          htmlTemplate: formMode === "ai_page" ? generatedHtml : undefined,
          cssStyles: formMode === "ai_page" ? generatedCss : undefined,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        toast.success("表单创建成功")
        setShowCreateForm(false)
        resetCreateForm()
        loadForms()
      } else {
        toast.error(data.error || "创建表单失败")
      }
    } catch (error) {
      console.error("Create form error:", error)
      toast.error("创建表单失败")
    } finally {
      setCreating(false)
    }
  }

  // 重置创建表单
  const resetCreateForm = () => {
    setNewFormName("")
    setNewFormDescription("")
    setNewFormShowResult(true)
    setNewFormSuccessMessage("")
    setNewFormExpiresAt("")
    setNewFormMaxSubmissions("")
    setFormMode("form")
    setStylePrompt("")
    setGeneratedHtml("")
    setGeneratedCss("")
    setShowPreview(false)
  }

  // 复制链接
  const copyFormLink = (shareToken: string) => {
    const url = `${window.location.origin}/form/${shareToken}`
    navigator.clipboard.writeText(url)
    toast.success("链接已复制到剪贴板")
  }

  // 打开表单
  const openForm = (shareToken: string) => {
    window.open(`/form/${shareToken}`, "_blank")
  }

  // 切换表单状态
  const toggleFormActive = async (form: WorkflowForm) => {
    try {
      const response = await fetch(
        `/api/workflows/${workflowId}/forms/${form.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: !form.isActive }),
        }
      )

      if (response.ok) {
        toast.success(form.isActive ? "表单已停用" : "表单已启用")
        loadForms()
      } else {
        const data = await response.json()
        toast.error(data.error || "更新表单失败")
      }
    } catch (error) {
      console.error("Toggle form error:", error)
      toast.error("更新表单失败")
    }
  }

  // 删除表单
  const deleteForm = async (formId: string) => {
    if (!confirm("确定要删除这个表单吗？删除后所有提交记录也将被删除。")) {
      return
    }

    try {
      const response = await fetch(
        `/api/workflows/${workflowId}/forms/${formId}`,
        {
          method: "DELETE",
        }
      )

      if (response.ok) {
        toast.success("表单已删除")
        loadForms()
      } else {
        const data = await response.json()
        toast.error(data.error || "删除表单失败")
      }
    } catch (error) {
      console.error("Delete form error:", error)
      toast.error("删除表单失败")
    }
  }

  // 格式化日期
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  // 获取模式标签
  const getModeLabel = (mode: string) => {
    return mode === "ai_page" ? "AI网页" : "标准表单"
  }

  return (
    <>
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>分享表单</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* 创建新表单按钮 */}
          {!showCreateForm && (
            <Button
              onClick={() => setShowCreateForm(true)}
              className="w-full"
              variant="outline"
            >
              <Plus className="h-4 w-4 mr-2" />
              创建新表单
            </Button>
          )}

          {/* 创建表单区域 */}
          {showCreateForm && (
            <div className="border rounded-lg p-4 space-y-4 bg-slate-50">
              <h3 className="font-medium">创建新表单</h3>

              {/* 模式选择 */}
              <Tabs value={formMode} onValueChange={(v) => setFormMode(v as "form" | "ai_page")}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="form">标准表单</TabsTrigger>
                  <TabsTrigger value="ai_page">
                    <Sparkles className="h-4 w-4 mr-1" />
                    AI网页模式
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="form" className="space-y-4 mt-4">
                  <p className="text-sm text-muted-foreground">
                    使用标准样式的表单页面，简洁实用。
                  </p>

                  {/* 显示可用的输入字段 */}
                  {inputFields.length === 0 ? (
                    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md text-sm text-yellow-700">
                      没有可用的输入字段。请先在工作流中添加输入节点并配置字段。
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label className="text-sm">将包含的输入字段 ({inputFields.length})</Label>
                      <div className="flex flex-wrap gap-2">
                        {inputFields.map((field) => (
                          <Badge key={`${field.nodeId}-${field.fieldId}`} variant="secondary">
                            {field.fieldName}
                            <span className="ml-1 text-muted-foreground">
                              ({field.fieldType})
                            </span>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="ai_page" className="space-y-4 mt-4">
                  <p className="text-sm text-muted-foreground">
                    使用 AI 生成美观的自定义网页，让你的表单更具吸引力。
                  </p>

                  {inputFields.length === 0 ? (
                    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md text-sm text-yellow-700">
                      没有可用的输入字段。请先在工作流中添加输入节点并配置字段。
                    </div>
                  ) : (
                    <>
                      {/* 可用字段列表 */}
                      <div className="space-y-2">
                        <Label className="text-sm">可用的输入字段 ({inputFields.length})</Label>
                        <div className="flex flex-wrap gap-2">
                          {inputFields.map((field) => (
                            <Badge key={`${field.nodeId}-${field.fieldId}`} variant="secondary">
                              {field.fieldName}
                              <span className="ml-1 text-muted-foreground">
                                ({field.fieldType})
                              </span>
                            </Badge>
                          ))}
                        </div>
                      </div>

                      {/* 风格描述 */}
                      <div className="space-y-2">
                        <Label htmlFor="stylePrompt">风格描述 *</Label>
                        <Textarea
                          id="stylePrompt"
                          value={stylePrompt}
                          onChange={(e) => setStylePrompt(e.target.value)}
                          placeholder="描述你想要的网页风格，例如：&#10;- 科技感十足的深色主题，带有霓虹光效&#10;- 简约温暖的浅色风格，适合问卷调查&#10;- 专业商务风格，蓝色为主色调&#10;- 可爱活泼的卡通风格，适合年轻用户"
                          rows={4}
                        />
                      </div>

                      {/* 生成按钮 */}
                      <Button
                        onClick={handleGenerateHtml}
                        disabled={isGenerating || !stylePrompt.trim()}
                        className="w-full"
                      >
                        {isGenerating ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            AI 正在生成中...
                          </>
                        ) : generatedHtml ? (
                          <>
                            <RefreshCw className="h-4 w-4 mr-2" />
                            重新生成
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4 mr-2" />
                            生成 AI 网页
                          </>
                        )}
                      </Button>

                      {/* 预览按钮 */}
                      {generatedHtml && (
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            onClick={() => setShowPreview(true)}
                            className="flex-1"
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            预览生成的网页
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </TabsContent>
              </Tabs>

              {/* 通用配置 */}
              <div className="border-t pt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="formName">表单名称 *</Label>
                  <Input
                    id="formName"
                    value={newFormName}
                    onChange={(e) => setNewFormName(e.target.value)}
                    placeholder="例如：客户咨询表单"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="formDescription">表单描述</Label>
                  <Textarea
                    id="formDescription"
                    value={newFormDescription}
                    onChange={(e) => setNewFormDescription(e.target.value)}
                    placeholder="简短描述表单用途..."
                    rows={2}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>显示执行结果</Label>
                    <p className="text-sm text-muted-foreground">
                      提交后是否向用户显示工作流执行结果
                    </p>
                  </div>
                  <Switch
                    checked={newFormShowResult}
                    onCheckedChange={setNewFormShowResult}
                  />
                </div>

                {!newFormShowResult && (
                  <div className="space-y-2">
                    <Label htmlFor="successMessage">提交成功消息</Label>
                    <Input
                      id="successMessage"
                      value={newFormSuccessMessage}
                      onChange={(e) => setNewFormSuccessMessage(e.target.value)}
                      placeholder="提交成功！我们会尽快处理您的请求。"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="expiresAt">过期时间（可选）</Label>
                    <Input
                      id="expiresAt"
                      type="datetime-local"
                      value={newFormExpiresAt}
                      onChange={(e) => setNewFormExpiresAt(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="maxSubmissions">最大提交次数（可选）</Label>
                    <Input
                      id="maxSubmissions"
                      type="number"
                      value={newFormMaxSubmissions}
                      onChange={(e) => setNewFormMaxSubmissions(e.target.value)}
                      placeholder="不限制"
                      min="1"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowCreateForm(false)
                    resetCreateForm()
                  }}
                >
                  取消
                </Button>
                <Button
                  onClick={handleCreateForm}
                  disabled={creating || (formMode === "ai_page" && !generatedHtml)}
                >
                  {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  创建
                </Button>
              </div>
            </div>
          )}

          {/* 表单列表 */}
          <div className="space-y-3">
            <h3 className="font-medium text-sm text-muted-foreground">
              已创建的表单 ({forms.length})
            </h3>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : forms.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                还没有创建任何表单
              </div>
            ) : (
              <div className="space-y-2">
                {forms.map((form) => (
                  <div
                    key={form.id}
                    className="border rounded-lg p-4 space-y-3"
                  >
                    {/* 表单头部 */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{form.name}</h4>
                        <Badge
                          variant={form.isActive ? "default" : "secondary"}
                        >
                          {form.isActive ? "启用中" : "已停用"}
                        </Badge>
                        <Badge variant="outline">
                          {getModeLabel(form.mode)}
                        </Badge>
                        {form.expiresAt &&
                          new Date(form.expiresAt) < new Date() && (
                            <Badge variant="destructive">已过期</Badge>
                          )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyFormLink(form.shareToken)}
                          title="复制链接"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openForm(form.shareToken)}
                          title="打开表单"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setExpandedFormId(
                              expandedFormId === form.id ? null : form.id
                            )
                          }
                          title="设置"
                        >
                          {expandedFormId === form.id ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* 基本信息 */}
                    {form.description && (
                      <p className="text-sm text-muted-foreground">
                        {form.description}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                      <span>提交次数: {form.submissionCount}</span>
                      {form.maxSubmissions && (
                        <span>最大限制: {form.maxSubmissions}</span>
                      )}
                      {form.expiresAt && (
                        <span>过期时间: {formatDate(form.expiresAt)}</span>
                      )}
                      <span>创建时间: {formatDate(form.createdAt)}</span>
                    </div>

                    {/* 展开的设置区域 */}
                    {expandedFormId === form.id && (
                      <div className="pt-3 border-t space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm">启用/停用表单</span>
                          <Switch
                            checked={form.isActive}
                            onCheckedChange={() => toggleFormActive(form)}
                          />
                        </div>

                        {form.mode === "ai_page" && form.stylePrompt && (
                          <div className="text-sm">
                            <span className="text-muted-foreground">风格描述：</span>
                            <span className="ml-1">{form.stylePrompt}</span>
                          </div>
                        )}

                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground flex-1 truncate">
                            表单链接: {window.location.origin}/form/
                            {form.shareToken}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => copyFormLink(form.shareToken)}
                          >
                            <Copy className="h-3 w-3 mr-1" />
                            复制
                          </Button>
                        </div>

                        <div className="flex justify-end">
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => deleteForm(form.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            删除表单
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* AI 网页预览弹窗 - 独立的全屏弹窗 */}
    <Dialog open={showPreview} onOpenChange={setShowPreview}>
      <DialogContent className="max-w-[95vw] w-[95vw] h-[95vh] p-0 flex flex-col [&>button]:hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>AI 生成网页预览</DialogTitle>
        </DialogHeader>

        {/* 顶部工具栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-background shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <span className="font-medium">AI 生成网页预览</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerateHtml}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1" />
              )}
              重新生成
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowPreview(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* 预览区域 - 使用 iframe 隔离样式 */}
        <div className="flex-1 overflow-hidden bg-slate-100">
          <iframe
            srcDoc={`
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>${generatedCss}</style>
              </head>
              <body style="margin: 0; padding: 16px; min-height: 100vh; box-sizing: border-box;">
                ${generatedHtml}
              </body>
              </html>
            `}
            className="w-full h-full border-0"
            title="AI 生成网页预览"
          />
        </div>

        {/* 底部操作栏 */}
        <div className="flex items-center justify-end gap-3 px-4 py-3 border-t bg-background shrink-0">
          <Button
            variant="outline"
            onClick={() => setShowPreview(false)}
          >
            取消
          </Button>
          <Button
            onClick={() => {
              setShowPreview(false)
              toast.success("已确认使用此网页模板")
            }}
          >
            确认使用
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  )
}
