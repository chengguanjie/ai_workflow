# 多模态 AI 服务实施计划

## 概述

本文档详细规划了为 AI Workflow 系统添加完整多模态支持的实施方案，包括图片生成、视频生成、音频处理、向量嵌入等功能。

## 当前状态分析

### 已支持的能力

| 组件 | 状态 | 说明 |
|------|------|------|
| ModelModality 类型定义 | ✅ 完成 | 8 种模态类型已定义 |
| SHENSUAN_MODELS 模型列表 | ✅ 完成 | 各模态模型已配置 |
| 多模态 ContentPart 类型 | ✅ 完成 | 支持 text/image_url/video_url/input_audio |
| 变量自动转换 | ✅ 完成 | 图片/视频 URL 自动转 ContentPart |
| 模型能力检测 | ✅ 完成 | isVisionModel/isAudioModel/isVideoModel |
| 音频转录 | ✅ 完成 | transcribeAudio() 已实现 |
| 节点 UI 模态显示 | ✅ 完成 | 动态图标和颜色 |

### 缺失的能力

| 功能 | 优先级 | 说明 |
|------|--------|------|
| 图片生成 API | P0 | image-gen 模型无法使用 |
| 视频生成 API | P1 | video-gen 模型无法使用 |
| TTS 文本转语音 | P1 | audio-tts 模型无法使用 |
| 向量嵌入 API | P2 | embedding 模型用于 RAG |
| 处理器模态路由 | P0 | 根据模型模态调用不同 API |

---

## 实施计划

### 阶段一：核心 API 扩展 (P0)

#### 1.1 扩展 AIService 接口

**文件**: `src/lib/ai/index.ts`

新增方法签名：

```typescript
// 图片生成
async generateImage(
  providerType: AIProviderType,
  request: ImageGenerationRequest,
  apiKey: string,
  baseUrl?: string
): Promise<ImageGenerationResponse>

// 向量嵌入
async createEmbedding(
  providerType: AIProviderType,
  request: EmbeddingRequest,
  apiKey: string,
  baseUrl?: string
): Promise<EmbeddingResponse>
```

#### 1.2 定义新的请求/响应类型

**文件**: `src/lib/ai/types.ts`

```typescript
// ===== 图片生成 =====
export interface ImageGenerationRequest {
  model: string
  prompt: string
  negativePrompt?: string
  n?: number                    // 生成数量，默认 1
  size?: string                 // 如 "1024x1024"
  quality?: 'standard' | 'hd'
  style?: 'vivid' | 'natural'
  responseFormat?: 'url' | 'b64_json'
}

export interface ImageGenerationResponse {
  images: Array<{
    url?: string
    b64_json?: string
    revisedPrompt?: string
  }>
  model: string
  usage?: {
    totalTokens?: number
  }
}

// ===== 视频生成 =====
export interface VideoGenerationRequest {
  model: string
  prompt: string
  image?: string               // 可选的参考图片 URL（图生视频）
  duration?: number            // 秒数
  aspectRatio?: '16:9' | '9:16' | '1:1'
  resolution?: '720p' | '1080p' | '4k'
}

export interface VideoGenerationResponse {
  taskId: string               // 异步任务 ID
  status: 'pending' | 'processing' | 'completed' | 'failed'
  videos?: Array<{
    url: string
    duration: number
  }>
  error?: string
}

// ===== TTS 文本转语音 =====
export interface TTSRequest {
  model: string
  input: string
  voice?: string               // 音色 ID
  speed?: number               // 0.25 - 4.0
  responseFormat?: 'mp3' | 'wav' | 'opus' | 'aac'
}

export interface TTSResponse {
  audio: {
    url?: string
    b64_json?: string
    format: string
    duration?: number
  }
}

// ===== 向量嵌入 =====
export interface EmbeddingRequest {
  model: string
  input: string | string[]
  dimensions?: number
}

export interface EmbeddingResponse {
  embeddings: Array<{
    index: number
    embedding: number[]
  }>
  model: string
  usage: {
    promptTokens: number
    totalTokens: number
  }
}
```

#### 1.3 实现胜算云提供商的多模态方法

**文件**: `src/lib/ai/providers/shensuan.ts`

```typescript
// 图片生成
async generateImage(
  request: ImageGenerationRequest,
  apiKey: string,
  baseUrl?: string
): Promise<ImageGenerationResponse> {
  const url = `${baseUrl || SHENSUAN_BASE_URL}/v1/images/generations`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: request.model,
      prompt: request.prompt,
      negative_prompt: request.negativePrompt,
      n: request.n || 1,
      size: request.size || '1024x1024',
      quality: request.quality,
      style: request.style,
      response_format: request.responseFormat || 'url'
    })
  })

  // ... 处理响应
}

// 向量嵌入
async createEmbedding(
  request: EmbeddingRequest,
  apiKey: string,
  baseUrl?: string
): Promise<EmbeddingResponse> {
  const url = `${baseUrl || SHENSUAN_BASE_URL}/v1/embeddings`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: request.model,
      input: request.input,
      dimensions: request.dimensions
    })
  })

  // ... 处理响应
}
```

---

### 阶段二：处理器模态路由 (P0)

#### 2.1 创建模态路由器

**新文件**: `src/lib/workflow/processors/modality-router.ts`

```typescript
import { getModelModality, ModelModality } from '@/lib/ai/types'
import { AIService } from '@/lib/ai'

export interface ModalityRouterResult {
  success: boolean
  output: unknown
  error?: string
}

export async function routeByModality(
  aiService: AIService,
  model: string,
  prompt: string,
  context: ExecutionContext,
  config: ProcessNodeConfig
): Promise<ModalityRouterResult> {
  const modality = getModelModality(model)

  switch (modality) {
    case 'text':
    case 'code':
      return handleTextGeneration(aiService, model, prompt, context, config)

    case 'image-gen':
      return handleImageGeneration(aiService, model, prompt, config)

    case 'video-gen':
      return handleVideoGeneration(aiService, model, prompt, config)

    case 'audio-tts':
      return handleTTS(aiService, model, prompt, config)

    case 'audio-transcription':
      return handleTranscription(aiService, model, context, config)

    case 'embedding':
      return handleEmbedding(aiService, model, prompt, config)

    case 'ocr':
      return handleOCR(aiService, model, context, config)

    default:
      // 未知模态，尝试作为文本处理
      return handleTextGeneration(aiService, model, prompt, context, config)
  }
}

// 各模态处理函数...
async function handleImageGeneration(...) { ... }
async function handleVideoGeneration(...) { ... }
// ...
```

#### 2.2 修改 ProcessNodeProcessor

**文件**: `src/lib/workflow/processors/process.ts`

主要修改点：

```typescript
// 在 process() 方法中，替换直接调用 chat() 的逻辑
// 改为使用 modality-router

import { routeByModality } from './modality-router'

// 原代码:
// const response = await aiService.chat(...)

// 新代码:
const result = await routeByModality(
  aiService,
  model,
  userPromptText,
  context,
  processNode.config
)

if (!result.success) {
  throw new Error(result.error)
}
```

---

### 阶段三：节点配置 UI 增强 (P1)

#### 3.1 添加模态特定配置面板

**新文件**: `src/components/workflow/config-panels/image-gen-config.tsx`

```typescript
interface ImageGenConfigProps {
  config: ProcessNodeConfig
  onChange: (config: ProcessNodeConfig) => void
}

export function ImageGenConfig({ config, onChange }: ImageGenConfigProps) {
  return (
    <div className="space-y-4">
      {/* 尺寸选择 */}
      <div>
        <Label>图片尺寸</Label>
        <Select
          value={config.imageSize || '1024x1024'}
          onValueChange={(v) => onChange({ ...config, imageSize: v })}
        >
          <SelectItem value="1024x1024">1024 × 1024 (正方形)</SelectItem>
          <SelectItem value="1792x1024">1792 × 1024 (横版)</SelectItem>
          <SelectItem value="1024x1792">1024 × 1792 (竖版)</SelectItem>
        </Select>
      </div>

      {/* 生成数量 */}
      <div>
        <Label>生成数量</Label>
        <Input
          type="number"
          min={1}
          max={4}
          value={config.imageCount || 1}
          onChange={(e) => onChange({ ...config, imageCount: parseInt(e.target.value) })}
        />
      </div>

      {/* 负面提示词 */}
      <div>
        <Label>负面提示词（可选）</Label>
        <Textarea
          value={config.negativePrompt || ''}
          onChange={(e) => onChange({ ...config, negativePrompt: e.target.value })}
          placeholder="描述不想出现的内容..."
        />
      </div>
    </div>
  )
}
```

#### 3.2 类似地创建其他模态配置面板

- `video-gen-config.tsx` - 视频生成配置（时长、比例、分辨率）
- `tts-config.tsx` - TTS 配置（音色、语速、格式）
- `transcription-config.tsx` - 转录配置（语言、格式）

#### 3.3 修改节点编辑器动态加载配置面板

**文件**: `src/components/workflow/nodes/index.tsx`

```typescript
// 根据模型模态显示不同的配置面板
const modality = getModelModality(data.config.model)

{modality === 'image-gen' && (
  <ImageGenConfig config={data.config} onChange={handleConfigChange} />
)}

{modality === 'video-gen' && (
  <VideoGenConfig config={data.config} onChange={handleConfigChange} />
)}

{modality === 'audio-tts' && (
  <TTSConfig config={data.config} onChange={handleConfigChange} />
)}
```

---

### 阶段四：视频生成异步处理 (P1)

视频生成通常需要较长时间（30秒-几分钟），需要异步任务机制。

#### 4.1 创建异步任务管理器

**新文件**: `src/lib/ai/async-task-manager.ts`

```typescript
interface AsyncTask {
  id: string
  type: 'video-gen' | 'audio-gen'
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress?: number
  result?: unknown
  error?: string
  createdAt: Date
  completedAt?: Date
}

export class AsyncTaskManager {
  private tasks = new Map<string, AsyncTask>()

  async submitVideoGeneration(request: VideoGenerationRequest): Promise<string> {
    // 提交任务，返回任务 ID
  }

  async pollTaskStatus(taskId: string): Promise<AsyncTask> {
    // 轮询任务状态
  }

  async waitForCompletion(taskId: string, timeout?: number): Promise<AsyncTask> {
    // 等待任务完成
  }
}
```

#### 4.2 在处理器中支持异步等待

```typescript
async function handleVideoGeneration(
  aiService: AIService,
  model: string,
  prompt: string,
  config: ProcessNodeConfig
): Promise<ModalityRouterResult> {
  // 1. 提交生成任务
  const taskId = await aiService.submitVideoGeneration({
    model,
    prompt,
    duration: config.videoDuration,
    aspectRatio: config.videoAspectRatio
  })

  // 2. 轮询等待完成
  const result = await aiService.waitForVideoCompletion(taskId, {
    maxWaitTime: 5 * 60 * 1000,  // 最多等待 5 分钟
    pollInterval: 3000           // 每 3 秒检查一次
  })

  // 3. 返回结果
  return {
    success: true,
    output: {
      videos: result.videos,
      taskId
    }
  }
}
```

---

### 阶段五：扩展 ProcessNodeConfig 类型 (P0)

**文件**: `src/lib/workflow/types.ts`

```typescript
export interface ProcessNodeConfig {
  // 现有字段
  model?: string
  systemPrompt?: string
  userPrompt?: string
  temperature?: number
  maxTokens?: number

  // ===== 新增：图片生成配置 =====
  imageSize?: '1024x1024' | '1792x1024' | '1024x1792' | string
  imageCount?: number
  imageQuality?: 'standard' | 'hd'
  imageStyle?: 'vivid' | 'natural'
  negativePrompt?: string

  // ===== 新增：视频生成配置 =====
  videoDuration?: number
  videoAspectRatio?: '16:9' | '9:16' | '1:1'
  videoResolution?: '720p' | '1080p' | '4k'
  referenceImage?: string        // 图生视频的参考图

  // ===== 新增：TTS 配置 =====
  ttsVoice?: string
  ttsSpeed?: number
  ttsFormat?: 'mp3' | 'wav' | 'opus'

  // ===== 新增：转录配置 =====
  transcriptionLanguage?: string
  transcriptionFormat?: 'json' | 'text' | 'srt' | 'vtt'

  // ===== 新增：嵌入配置 =====
  embeddingDimensions?: number
}
```

---

### 阶段六：输出格式标准化 (P1)

#### 6.1 定义统一的模态输出格式

**文件**: `src/lib/workflow/types.ts`

```typescript
// 各模态的标准输出格式
export interface ImageGenOutput {
  _type: 'image-gen'
  images: Array<{
    url: string
    b64?: string
    revisedPrompt?: string
    width?: number
    height?: number
  }>
  model: string
  prompt: string
}

export interface VideoGenOutput {
  _type: 'video-gen'
  videos: Array<{
    url: string
    duration: number
    format?: string
  }>
  taskId: string
  model: string
  prompt: string
}

export interface TTSOutput {
  _type: 'audio-tts'
  audio: {
    url: string
    format: string
    duration?: number
  }
  model: string
  text: string
}

export interface TranscriptionOutput {
  _type: 'audio-transcription'
  text: string
  segments?: Array<{
    start: number
    end: number
    text: string
  }>
  language?: string
  model: string
}

export interface EmbeddingOutput {
  _type: 'embedding'
  embeddings: number[][]
  model: string
  dimensions: number
}

// 联合类型
export type ModalityOutput =
  | ImageGenOutput
  | VideoGenOutput
  | TTSOutput
  | TranscriptionOutput
  | EmbeddingOutput
  | { _type: 'text'; content: string }
```

#### 6.2 在调试面板显示模态输出

**文件**: `src/components/workflow/node-debug-panel.tsx`

```typescript
function renderModalityOutput(output: ModalityOutput) {
  switch (output._type) {
    case 'image-gen':
      return (
        <div className="grid grid-cols-2 gap-2">
          {output.images.map((img, i) => (
            <img key={i} src={img.url} alt={`Generated ${i+1}`} className="rounded" />
          ))}
        </div>
      )

    case 'video-gen':
      return (
        <div>
          {output.videos.map((video, i) => (
            <video key={i} src={video.url} controls className="w-full rounded" />
          ))}
        </div>
      )

    case 'audio-tts':
      return (
        <audio src={output.audio.url} controls className="w-full" />
      )

    // ... 其他模态
  }
}
```

---

## 实施顺序

```
Week 1: 阶段一 + 阶段二（核心 API + 模态路由）
        - 完成 AIService 接口扩展
        - 实现胜算云图片生成 API
        - 创建模态路由器
        - 修改 ProcessNodeProcessor

Week 2: 阶段三 + 阶段五（UI 增强 + 类型扩展）
        - 添加图片生成配置面板
        - 扩展 ProcessNodeConfig 类型
        - 测试图片生成端到端流程

Week 3: 阶段四（视频生成异步处理）
        - 实现视频生成 API
        - 创建异步任务管理器
        - 添加视频生成配置面板

Week 4: 阶段六 + TTS/转录（输出标准化 + 音频功能）
        - 实现 TTS API
        - 完善音频转录
        - 标准化所有输出格式
        - 调试面板多模态预览
```

---

## 测试清单

### 图片生成
- [ ] 选择 image-gen 模型后节点显示紫色图标
- [ ] 可配置图片尺寸、数量、负面提示词
- [ ] 执行成功返回图片 URL
- [ ] 输出可被下游节点引用
- [ ] 调试面板预览生成的图片

### 视频生成
- [ ] 选择 video-gen 模型后节点显示橙色图标
- [ ] 可配置时长、比例、分辨率
- [ ] 支持图生视频（传入参考图）
- [ ] 长时间生成任务不会超时
- [ ] 调试面板预览生成的视频

### TTS 文本转语音
- [ ] 选择 audio-tts 模型后节点显示蓝色图标
- [ ] 可选择音色和语速
- [ ] 执行成功返回音频 URL
- [ ] 调试面板播放生成的音频

### 音频转录
- [ ] 上传音频文件后可正确转录
- [ ] 支持多种音频格式
- [ ] 返回文本和时间戳

### 向量嵌入
- [ ] embedding 模型可生成向量
- [ ] 向量可用于 RAG 检索

---

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 胜算云 API 不支持某些模态 | 功能不可用 | 提前测试 API 兼容性；准备 OpenAI/其他备选 |
| 视频生成超时 | 用户体验差 | 实现进度显示；支持后台任务 |
| 大文件传输慢 | 性能问题 | 使用 URL 而非 base64；支持分片上传 |
| 模型成本高 | 成本超支 | 添加用量限制和提醒 |

---

## 文件变更清单

### 新增文件
- `src/lib/ai/types.ts` - 扩展类型定义
- `src/lib/workflow/processors/modality-router.ts` - 模态路由器
- `src/lib/ai/async-task-manager.ts` - 异步任务管理
- `src/components/workflow/config-panels/image-gen-config.tsx`
- `src/components/workflow/config-panels/video-gen-config.tsx`
- `src/components/workflow/config-panels/tts-config.tsx`

### 修改文件
- `src/lib/ai/index.ts` - 添加新方法
- `src/lib/ai/providers/shensuan.ts` - 实现多模态 API
- `src/lib/workflow/processors/process.ts` - 使用模态路由
- `src/lib/workflow/types.ts` - 扩展配置类型
- `src/components/workflow/nodes/index.tsx` - 动态配置面板

---

## 开始实施

准备好后，请告诉我开始哪个阶段的实施。建议从 **阶段一（核心 API 扩展）** 开始，因为这是其他所有功能的基础。

---

## 实施进度记录

### 2024-12-31 完成的工作

#### ✅ 阶段一：核心 API 扩展

1. **扩展类型定义** (`src/lib/ai/types.ts`)
   - 添加了 `ImageGenerationRequest/Response`
   - 添加了 `VideoGenerationRequest/Response`
   - 添加了 `TTSRequest/Response`
   - 添加了 `EmbeddingRequest/Response`
   - 添加了标准化输出类型 `ModalityOutput`
   - 扩展了 `AIProvider` 接口

2. **实现胜算云多模态 API** (`src/lib/ai/providers/shensuan.ts`)
   - `generateImage()` - 图片生成
   - `generateVideo()` - 视频生成任务提交
   - `getVideoTaskStatus()` - 视频任务状态查询
   - `textToSpeech()` - TTS 文本转语音
   - `createEmbedding()` - 向量嵌入

3. **扩展 AIService** (`src/lib/ai/index.ts`)
   - 添加所有多模态方法
   - 添加 `waitForVideoCompletion()` 异步等待
   - 添加能力检测方法

#### ✅ 阶段二：处理器模态路由

4. **创建模态路由器** (`src/lib/workflow/processors/modality-router.ts`)
   - 根据模型模态自动路由到对应 API
   - 支持所有 8 种模态类型
   - 标准化输出格式转换

5. **修改 ProcessNodeProcessor** (`src/lib/workflow/processors/process.ts`)
   - 集成模态路由器
   - 自动检测模型类型并调用对应 API

#### ✅ 阶段五：类型扩展

6. **扩展 ProcessNodeConfigData** (`src/types/workflow.ts`)
   - 添加图片生成配置字段
   - 添加视频生成配置字段
   - 添加 TTS 配置字段
   - 添加音频转录配置字段
   - 添加向量嵌入配置字段

### 构建验证

- ✅ `pnpm build` 通过
- ✅ 类型检查通过
- ✅ 无编译错误

### 后续待完成

- [ ] 阶段三：节点配置 UI 增强（添加模态特定配置面板）
- [ ] 阶段六：输出格式标准化（调试面板多模态预览）
- [ ] 集成测试和真实 API 验证
