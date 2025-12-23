"use client"

import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { useParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Loader2, CheckCircle, AlertCircle, Upload, X, FileIcon, Download } from "lucide-react"
import { sanitizeHtml, sanitizeCss } from "@/lib/security/xss-sanitizer"

// 输入字段类型
interface InputField {
  nodeId: string
  nodeName: string
  fieldId: string
  fieldName: string
  fieldType: string
  defaultValue: string
  options: Array<{ label: string; value: string }>
  placeholder: string
  required: boolean
  description: string
}

// 表单信息
interface FormInfo {
  form: {
    id: string
    name: string
    description: string | null
    showResult: boolean
    successMessage: string | null
    theme: string | null
    // AI 网页模式字段
    mode: 'form' | 'ai_page'
    stylePrompt: string | null
    htmlTemplate: string | null
    cssStyles: string | null
  }
  workflow: {
    name: string
    description: string | null
  }
  organization: {
    name: string
    logo: string | null
  }
  inputFields: InputField[]
}

// 输出文件
interface OutputFile {
  id: string
  fileName: string
  format: string
  url: string
  size: number
}

// 提交结果
interface SubmitResult {
  success: boolean
  status?: string
  output?: Record<string, unknown>
  error?: string
  duration?: number
  executionId?: string
  outputFiles?: OutputFile[]
  taskId?: string
  message?: string
}

// 文件上传信息
interface UploadedFile {
  name: string
  url: string
  size: number
  mimeType: string
}

export default function PublicFormPage() {
  const params = useParams()
  const token = params.token as string

  const [formInfo, setFormInfo] = useState<FormInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState<Record<string, string | string[] | UploadedFile>>({})
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<SubmitResult | null>(null)
  const [uploadingFields, setUploadingFields] = useState<Set<string>>(new Set())
  const aiFormContainerRef = useRef<HTMLDivElement>(null)

  // 获取表单信息
  useEffect(() => {
    async function fetchForm() {
      try {
        const response = await fetch(`/api/public/forms/${token}`)
        const data = await response.json()

        if (!response.ok) {
          setError(data.error || "获取表单信息失败")
          return
        }

        setFormInfo(data)

        // 初始化表单数据
        const initialData: Record<string, string | string[]> = {}
        data.inputFields.forEach((field: InputField) => {
          if (field.fieldType === "multiselect") {
            initialData[`${field.nodeId}.${field.fieldId}`] = []
          } else {
            initialData[`${field.nodeId}.${field.fieldId}`] = field.defaultValue || ""
          }
        })
        setFormData(initialData)
      } catch (err) {
        setError("网络错误，请稍后重试")
        console.error("Fetch form error:", err)
      } finally {
        setLoading(false)
      }
    }

    fetchForm()
  }, [token])

  // AI 网页模式表单提交处理
  useEffect(() => {
    if (!formInfo || formInfo.form.mode !== 'ai_page' || !aiFormContainerRef.current) {
      return
    }

    const container = aiFormContainerRef.current

    // 处理表单提交
    const handleAiFormSubmit = async (e: Event) => {
      e.preventDefault()

      const form = e.target as HTMLFormElement
      if (!form || form.tagName !== 'FORM') return

      setSubmitting(true)
      setResult(null)

      try {
        // 从 AI 生成的表单中提取数据
        const formDataObj = new FormData(form)
        const input: Record<string, Record<string, unknown>> = {}

        // 遍历输入字段，按节点分组
        for (const field of formInfo.inputFields) {
          if (!input[field.nodeId]) {
            input[field.nodeId] = {}
          }

          // 获取对应的表单值
          // AI 生成的 HTML 使用 data-field-id 属性或 name 属性
          const element = form.querySelector(
            `[data-field-id="${field.fieldId}"], [name="${field.fieldName}"]`
          ) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null

          if (element) {
            if (element.type === 'checkbox') {
              // 多选框，收集所有选中的值
              const checkboxes = form.querySelectorAll(
                `[name="${element.name}"]:checked`
              ) as NodeListOf<HTMLInputElement>
              const values = Array.from(checkboxes).map(cb => cb.value)
              input[field.nodeId][field.fieldId] = values
            } else if (element.type === 'file') {
              // 文件上传暂不支持
              const fileInput = element as HTMLInputElement
              if (fileInput.files && fileInput.files.length > 0) {
                // 简单起见，先跳过文件上传
                input[field.nodeId][field.fieldId] = ''
              }
            } else {
              input[field.nodeId][field.fieldId] = element.value || ''
            }
          } else {
            // 尝试从 FormData 中获取
            const value = formDataObj.get(field.fieldName) || formDataObj.get(field.fieldId)
            input[field.nodeId][field.fieldId] = value ? String(value) : ''
          }
        }

        const response = await fetch(`/api/public/forms/${token}/submit`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ input }),
        })

        const data = await response.json()
        setResult(data)
      } catch (err) {
        setResult({
          success: false,
          error: "提交失败，请稍后重试",
        })
        console.error("Submit AI form error:", err)
      } finally {
        setSubmitting(false)
      }
    }

    // 监听表单提交事件
    container.addEventListener('submit', handleAiFormSubmit)

    return () => {
      container.removeEventListener('submit', handleAiFormSubmit)
    }
  }, [formInfo, token])

  // 处理文件上传
  const handleFileUpload = useCallback(async (field: InputField, file: File) => {
    const fieldKey = `${field.nodeId}.${field.fieldId}`
    setUploadingFields(prev => new Set(prev).add(fieldKey))

    try {
      // 创建 FormData 上传文件
      const formData = new FormData()
      formData.append("file", file)

      const response = await fetch("/api/files/temp", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        throw new Error("文件上传失败")
      }

      const data = await response.json()

      // 存储上传的文件信息
      setFormData(prev => ({
        ...prev,
        [fieldKey]: {
          name: file.name,
          url: data.url,
          size: file.size,
          mimeType: file.type,
        } as UploadedFile,
      }))
    } catch (err) {
      console.error("File upload error:", err)
      alert("文件上传失败，请重试")
    } finally {
      setUploadingFields(prev => {
        const next = new Set(prev)
        next.delete(fieldKey)
        return next
      })
    }
  }, [])

  // 提交表单
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formInfo) return

    // 验证必填字段
    for (const field of formInfo.inputFields) {
      const fieldKey = `${field.nodeId}.${field.fieldId}`
      const value = formData[fieldKey]

      if (field.required) {
        if (field.fieldType === "multiselect") {
          if (!value || (value as string[]).length === 0) {
            alert(`请填写必填字段：${field.fieldName}`)
            return
          }
        } else if (isFileType(field.fieldType)) {
          if (!value || typeof value === "string") {
            alert(`请上传文件：${field.fieldName}`)
            return
          }
        } else {
          if (!value || (typeof value === "string" && !value.trim())) {
            alert(`请填写必填字段：${field.fieldName}`)
            return
          }
        }
      }
    }

    setSubmitting(true)
    setResult(null)

    try {
      // 构建输入数据，按节点分组
      const input: Record<string, Record<string, unknown>> = {}

      for (const field of formInfo.inputFields) {
        const fieldKey = `${field.nodeId}.${field.fieldId}`
        const value = formData[fieldKey]

        if (!input[field.nodeId]) {
          input[field.nodeId] = {}
        }

        // 处理文件类型
        if (isFileType(field.fieldType) && typeof value === "object" && value !== null && "url" in value) {
          input[field.nodeId][field.fieldId] = value
        } else {
          input[field.nodeId][field.fieldId] = value
        }
      }

      const response = await fetch(`/api/public/forms/${token}/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ input }),
      })

      const data = await response.json()
      setResult(data)
    } catch (err) {
      setResult({
        success: false,
        error: "提交失败，请稍后重试",
      })
      console.error("Submit form error:", err)
    } finally {
      setSubmitting(false)
    }
  }

  // 判断是否为文件类型
  const isFileType = (fieldType: string) => {
    return ["image", "pdf", "word", "excel", "audio", "video"].includes(fieldType)
  }

  // 获取文件类型接受的格式
  const getAcceptType = (fieldType: string) => {
    switch (fieldType) {
      case "image":
        return "image/*"
      case "pdf":
        return ".pdf,application/pdf"
      case "word":
        return ".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      case "excel":
        return ".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      case "audio":
        return "audio/*"
      case "video":
        return "video/*"
      default:
        return "*/*"
    }
  }

  // 格式化文件大小
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // 渲染字段输入
  const renderFieldInput = (field: InputField) => {
    const fieldKey = `${field.nodeId}.${field.fieldId}`
    const value = formData[fieldKey]
    const isUploading = uploadingFields.has(fieldKey)

    // 文件类型
    if (isFileType(field.fieldType)) {
      const uploadedFile = value as UploadedFile | string | undefined
      const hasFile = uploadedFile && typeof uploadedFile === "object" && "url" in uploadedFile

      return (
        <div className="space-y-2">
          {hasFile ? (
            <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
              <FileIcon className="h-5 w-5 text-slate-500" />
              <span className="flex-1 truncate text-sm">{(uploadedFile as UploadedFile).name}</span>
              <span className="text-xs text-slate-500">
                {formatFileSize((uploadedFile as UploadedFile).size)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setFormData(prev => ({ ...prev, [fieldKey]: "" }))}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-200 rounded-lg cursor-pointer hover:border-slate-300 hover:bg-slate-50 transition-colors">
              <input
                type="file"
                className="hidden"
                accept={getAcceptType(field.fieldType)}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    handleFileUpload(field, file)
                  }
                }}
                disabled={isUploading}
              />
              {isUploading ? (
                <div className="flex flex-col items-center">
                  <Loader2 className="h-8 w-8 text-slate-400 animate-spin" />
                  <span className="mt-2 text-sm text-slate-500">上传中...</span>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <Upload className="h-8 w-8 text-slate-400" />
                  <span className="mt-2 text-sm text-slate-500">点击上传文件</span>
                  <span className="text-xs text-slate-400 mt-1">
                    {field.fieldType === "image" && "支持 JPG、PNG、GIF 等图片格式"}
                    {field.fieldType === "pdf" && "支持 PDF 格式"}
                    {field.fieldType === "word" && "支持 DOC、DOCX 格式"}
                    {field.fieldType === "excel" && "支持 XLS、XLSX 格式"}
                    {field.fieldType === "audio" && "支持 MP3、WAV 等音频格式"}
                    {field.fieldType === "video" && "支持 MP4、MOV 等视频格式"}
                  </span>
                </div>
              )}
            </label>
          )}
        </div>
      )
    }

    // 单选下拉
    if (field.fieldType === "select") {
      return (
        <Select
          value={value as string}
          onValueChange={(v) => setFormData(prev => ({ ...prev, [fieldKey]: v }))}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={field.placeholder || "请选择..."} />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    }

    // 多选
    if (field.fieldType === "multiselect") {
      const selectedValues = (value as string[]) || []
      return (
        <div className="space-y-2">
          {field.options.map((option) => (
            <div key={option.value} className="flex items-center space-x-2">
              <Checkbox
                id={`${fieldKey}-${option.value}`}
                checked={selectedValues.includes(option.value)}
                onCheckedChange={(checked) => {
                  setFormData(prev => {
                    const current = (prev[fieldKey] as string[]) || []
                    if (checked) {
                      return { ...prev, [fieldKey]: [...current, option.value] }
                    } else {
                      return { ...prev, [fieldKey]: current.filter(v => v !== option.value) }
                    }
                  })
                }}
              />
              <Label htmlFor={`${fieldKey}-${option.value}`} className="font-normal cursor-pointer">
                {option.label}
              </Label>
            </div>
          ))}
        </div>
      )
    }

    // 默认文本输入
    const isLongText = field.defaultValue?.length > 100 || field.placeholder?.includes("\n")

    if (isLongText) {
      return (
        <Textarea
          value={value as string}
          onChange={(e) => setFormData(prev => ({ ...prev, [fieldKey]: e.target.value }))}
          placeholder={field.placeholder}
          rows={4}
          className="resize-y"
        />
      )
    }

    return (
      <Input
        type="text"
        value={value as string}
        onChange={(e) => setFormData(prev => ({ ...prev, [fieldKey]: e.target.value }))}
        placeholder={field.placeholder}
      />
    )
  }

  // 渲染结果
  const renderResult = () => {
    if (!result) return null

    if (!result.success || result.status === "FAILED") {
      return (
        <Card className="mt-6 border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-6 w-6 text-red-500" />
              <div>
                <p className="font-medium text-red-700">执行失败</p>
                <p className="text-sm text-red-600 mt-1">{result.error || "未知错误"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )
    }

    // 异步执行成功
    if (result.taskId) {
      return (
        <Card className="mt-6 border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-6 w-6 text-green-500" />
              <div>
                <p className="font-medium text-green-700">提交成功</p>
                <p className="text-sm text-green-600 mt-1">
                  {result.message || formInfo?.form.successMessage || "您的请求已提交，正在后台处理中。"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )
    }

    // 同步执行成功，显示结果
    return (
      <Card className="mt-6 border-green-200 bg-green-50">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 mb-4">
            <CheckCircle className="h-6 w-6 text-green-500" />
            <div>
              <p className="font-medium text-green-700">执行成功</p>
              {result.duration && (
                <p className="text-sm text-green-600">耗时 {(result.duration / 1000).toFixed(2)} 秒</p>
              )}
            </div>
          </div>

          {/* 输出内容 */}
          {result.output && Object.keys(result.output).length > 0 && (
            <div className="mt-4 p-4 bg-white rounded-lg border">
              <h4 className="font-medium mb-2">输出结果</h4>
              <div className="space-y-2">
                {Object.entries(result.output).map(([key, value]) => (
                  <div key={key} className="text-sm">
                    <span className="font-medium text-slate-600">{key}: </span>
                    <span className="text-slate-800 whitespace-pre-wrap">
                      {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 输出文件 */}
          {result.outputFiles && result.outputFiles.length > 0 && (
            <div className="mt-4">
              <h4 className="font-medium mb-2">输出文件</h4>
              <div className="space-y-2">
                {result.outputFiles.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center gap-3 p-3 bg-white rounded-lg border"
                  >
                    <FileIcon className="h-5 w-5 text-slate-500" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{file.fileName}</p>
                      <p className="text-sm text-slate-500">
                        {file.format.toUpperCase()} · {formatFileSize(file.size)}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(file.url, "_blank")}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      下载
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  // 加载中
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          <p className="text-slate-500">加载中...</p>
        </div>
      </div>
    )
  }

  // 错误状态
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-3 text-center">
              <AlertCircle className="h-12 w-12 text-red-500" />
              <p className="text-lg font-medium text-slate-700">{error}</p>
              <p className="text-sm text-slate-500">请检查链接是否正确，或联系表单创建者</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!formInfo) return null

  // Sanitize HTML and CSS for AI page mode to prevent XSS attacks
  const sanitizedHtmlTemplate = formInfo.form.htmlTemplate 
    ? sanitizeHtml(formInfo.form.htmlTemplate)
    : null
  const sanitizedCssStyles = formInfo.form.cssStyles 
    ? sanitizeCss(formInfo.form.cssStyles)
    : null

  // AI 网页模式渲染
  if (formInfo.form.mode === 'ai_page' && sanitizedHtmlTemplate) {
    return (
      <div className="min-h-screen">
        {/* 注入 CSS 样式 (sanitized) */}
        {sanitizedCssStyles && (
          <style dangerouslySetInnerHTML={{ __html: sanitizedCssStyles }} />
        )}

        {/* AI 生成的表单内容 (sanitized) */}
        <div
          ref={aiFormContainerRef}
          className="ai-form-container"
          dangerouslySetInnerHTML={{ __html: sanitizedHtmlTemplate }}
        />

        {/* 提交状态覆盖层 */}
        {submitting && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              <p className="text-slate-700">提交中...</p>
            </div>
          </div>
        )}

        {/* 结果显示覆盖层 */}
        {result && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-lg w-full max-h-[80vh] overflow-auto">
              <div className="p-6">
                {!result.success || result.status === "FAILED" ? (
                  <div className="flex flex-col items-center gap-3 text-center">
                    <AlertCircle className="h-12 w-12 text-red-500" />
                    <p className="text-lg font-medium text-red-700">执行失败</p>
                    <p className="text-sm text-red-600">{result.error || "未知错误"}</p>
                    <Button onClick={() => setResult(null)} className="mt-4">
                      关闭
                    </Button>
                  </div>
                ) : result.taskId ? (
                  <div className="flex flex-col items-center gap-3 text-center">
                    <CheckCircle className="h-12 w-12 text-green-500" />
                    <p className="text-lg font-medium text-green-700">提交成功</p>
                    <p className="text-sm text-green-600">
                      {result.message || formInfo.form.successMessage || "您的请求已提交，正在后台处理中。"}
                    </p>
                    <Button onClick={() => setResult(null)} className="mt-4">
                      关闭
                    </Button>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <CheckCircle className="h-8 w-8 text-green-500" />
                      <div>
                        <p className="font-medium text-green-700">执行成功</p>
                        {result.duration && (
                          <p className="text-sm text-green-600">耗时 {(result.duration / 1000).toFixed(2)} 秒</p>
                        )}
                      </div>
                    </div>

                    {/* 输出内容 */}
                    {result.output && Object.keys(result.output).length > 0 && (
                      <div className="mt-4 p-4 bg-slate-50 rounded-lg">
                        <h4 className="font-medium mb-2">输出结果</h4>
                        <div className="space-y-2">
                          {Object.entries(result.output).map(([key, value]) => (
                            <div key={key} className="text-sm">
                              <span className="font-medium text-slate-600">{key}: </span>
                              <span className="text-slate-800 whitespace-pre-wrap">
                                {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 输出文件 */}
                    {result.outputFiles && result.outputFiles.length > 0 && (
                      <div className="mt-4">
                        <h4 className="font-medium mb-2">输出文件</h4>
                        <div className="space-y-2">
                          {result.outputFiles.map((file) => (
                            <div
                              key={file.id}
                              className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg"
                            >
                              <FileIcon className="h-5 w-5 text-slate-500" />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{file.fileName}</p>
                                <p className="text-sm text-slate-500">
                                  {file.format.toUpperCase()} · {formatFileSize(file.size)}
                                </p>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => window.open(file.url, "_blank")}
                              >
                                <Download className="h-4 w-4 mr-1" />
                                下载
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <Button onClick={() => setResult(null)} className="mt-6 w-full">
                      关闭
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 页脚 */}
        <div className="py-4 text-center text-sm text-slate-400">
          Powered by AI Workflow
        </div>
      </div>
    )
  }

  // 标准表单模式渲染
  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* 组织信息 */}
        <div className="flex items-center gap-3 mb-6">
          {formInfo.organization.logo && (
            <img
              src={formInfo.organization.logo}
              alt={formInfo.organization.name}
              className="w-10 h-10 rounded-lg object-cover"
            />
          )}
          <span className="text-sm text-slate-500">{formInfo.organization.name}</span>
        </div>

        {/* 表单卡片 */}
        <Card>
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-2xl font-bold">
              {formInfo.form.name || formInfo.workflow.name}
            </CardTitle>
            <CardDescription className="text-base mt-3">
              {formInfo.form.description || formInfo.workflow.description ||
                "请认真填写以下信息，我们将根据您提供的内容进行处理。带 * 的为必填项。"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {formInfo.inputFields.map((field) => (
                <div key={`${field.nodeId}.${field.fieldId}`} className="space-y-2">
                  <Label className="flex items-center gap-1">
                    {field.fieldName}
                    {field.required && <span className="text-red-500">*</span>}
                  </Label>
                  {field.description && (
                    <p className="text-sm text-slate-500">{field.description}</p>
                  )}
                  {renderFieldInput(field)}
                </div>
              ))}

              <Button
                type="submit"
                className="w-full"
                disabled={submitting || uploadingFields.size > 0}
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    提交中...
                  </>
                ) : (
                  "提交"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* 结果显示 */}
        {renderResult()}

        {/* 页脚 */}
        <div className="mt-8 text-center text-sm text-slate-400">
          Powered by AI Workflow
        </div>
      </div>
    </div>
  )
}
