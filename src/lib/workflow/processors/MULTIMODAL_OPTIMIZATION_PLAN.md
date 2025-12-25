# 多模态节点实现分析与优化方案

## 1. 现状诊断与分析

经过代码审查，目前系统的多模态节点（Image, Audio, Video）和核心处理节点（Process）的实现存在以下特征和局限性：

### 1.1 核心处理节点 (ProcessNode) 的局限性

- **当前状态**：`ProcessNode` (`process.ts`) 和 `ProcessWithToolsNode` (`process-with-tools.ts`) 目前 **仅支持纯文本交互**。
- **问题**：即使上游节点（如 Input 或 Image 节点）通过变量传递了图片或音频数据，`ProcessNode` 仅仅是将这些数据作为字符串（如 URL 或文件名）处理，而不是作为真正的多模态消息（Message Content Part）发送给 AI 模型。这导致 GPT-4o、Claude 3.5 等多模态模型在通用处理节点中无法发挥其视觉/听觉能力。

### 1.2 专用多模态节点 (Image/Audio/Video) 的实现模式

目前多模态能力被分散在专用的输入节点中，实现逻辑较为割裂：

- **ImageNode (`image.ts`)**：
  - **逻辑**：自行判断 `isVisionModel`（硬编码模型列表）。
  - **行为**：如果是视觉模型，构造 `{ type: 'text' }, { type: 'image_url' }` 消息；否则仅发送图片描述文本。
  
- **AudioNode (`audio.ts`)**：
  - **逻辑**：自行判断 `isAudioMultimodalModel`（硬编码模型列表）。
  - **行为**：如果是音频模型，后端下载音频 -> 转 Base64 -> 构造 `{ type: 'input_audio' }`。支持降级为“先转录后分析”。

- **VideoNode (`video.ts`)**：
  - **逻辑**：区分 `isVideoModel`（原生视频理解）和 `isVisionModel`（基于帧）。
  - **行为**：如果是原生视频模型，发送 `{ type: 'video_url' }`。否则尝试提取帧（当前实现大多为伪代码/Stub，依赖 ffmpeg 但未完全集成）。

### 1.3 架构层面的问题

1. **模型能力定义重复**：`VISION_MODELS`、`AUDIO_MULTIMODAL_MODELS` 等常量列表在各个文件中重复定义，维护成本高且容易不一致。
2. **变量替换机制单一**：现有的 `replaceVariables` 函数仅返回 `string`。这意味着无法简单地将 `{{image_node.data}}` 替换为消息中的图像对象。

---

## 2. 优化方案与执行计划

### 阶段一：标准化模型能力定义 (P0 - 立即执行)

**目标**：消除硬编码的模型列表，建立统一的“模型能力注册表”。

- **操作**：
  - 在 `src/lib/ai/types.ts` 或新文件 `src/lib/ai/config.ts` 中集中管理模型能力定义。
  - 定义 `isVisionModel`、`isAudioModel`、`isVideoModel` 等统一工具函数。
  - 更新所有 Processor 引用统一的定义。

### 阶段二：升级 Process 节点支持多模态 (P0 - 核心优化)

**目标**：让通用的 Process 节点能够接收并“理解”多模态输入，而不仅仅是把它们当作文本。

- **操作**：
    1. **引入“附件/上下文”概念**：
        - 修改 `ProcessNodeConfig`，允许用户明确指定“输入文件/媒体”（类似于 Input 节点的附件）。
        - 或者增强变量解析：如果在提示词中检测到引用了文件类型的变量，自动将其转换为多模态消息部分。
    2. **重构 ProcessNode 消息构建逻辑**：
        - 从 `content: string` 升级为 `content: ContentPart[]`。
        - 解析 Prompt 中的文件引用，将其转换为 `image_url` / `input_audio` 等格式。

### 阶段三：优化专用节点与代码复用 (P1)

**目标**：减少 `image.ts`, `audio.ts`, `video.ts` 中的重复代码。

- **操作**：
  - 抽取公共的“多模态消息构建器” (MultimodalMessageBuilder)。
  - Audio 节点：优化 Base64 转换逻辑，考虑增加流式处理或更高效的传输。
  - Video 节点：明确抽帧逻辑的边界，如果服务器不支持 ffmpeg，则明确提示或仅使用原生 Video URL 模型。

---

## 3. 具体执行步骤

### 步骤 1：重构模型能力定义

- [ ] 创建 `src/lib/ai/model-capabilities.ts`。
- [ ] 迁移并合并所有分散的 `*_MODELS` 常量。
- [ ] 替换 `image.ts`, `audio.ts`, `video.ts` 中的硬编码检查。

### 步骤 2：增强 ProcessNode 的多模态能力

- [ ] 修改 `ProcessNodeProcessor` 中的消息构建逻辑。
- [ ] 实现 `buildMultimodalMessage` 函数，支持混合文本和媒体内容。
- [ ] (可选) 在 Process 节点配置界面增加“包含上游文件”的显式选项（如果变量引用太复杂）。

### 步骤 3：验证与测试

- [ ] 创建包含图片输入的 Workflow。
- [ ] 连接到 Process 节点，验证 GPT-4o 是否能通过 Process 节点“看到”图片。
