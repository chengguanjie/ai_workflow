# Requirements Document

## Introduction

本功能增强节点调试面板（NodeDebugPanel），提供更丰富的输入数据管理、多模态模型选择和多格式输出结果展示能力。主要包括三个核心改进：

1. **输入数据增强**：在"输入数据"区域增加Tab切换，支持本节点文件导入和上游节点数据两种输入方式
2. **AI提示词增强**：支持按模型类别（文本类、图片类、视频类等）选择模型，与企业账号配置的六类模型类别对应
3. **输出结果增强**：支持多种输出格式类型，非文字类输出支持弹窗预览和下载

## Glossary

- **Node_Debug_Panel**: 节点调试面板，用于在工作流编辑器中调试单个节点的功能面板
- **Input_Tab**: 输入数据区域的Tab切换组件，包含"导入文件"和"上游数据"两个子Tab
- **File_Import**: 文件导入功能，支持用户上传多种格式的文件作为节点输入
- **Upstream_Data**: 上游数据，来自工作流中前置节点的输出数据
- **Model_Modality**: 模型类别/模态，包括text（文本类）、image-gen（图片生成）、video-gen（视频生成）、audio-transcription（音频转录）、audio-tts（文字转语音）、embedding（向量嵌入）、ocr（图文识别）、code（代码）
- **Output_Type**: 输出类型，定义调试结果的格式，如纯文本、Word、PDF、图片、音频、视频等
- **Preview_Modal**: 预览弹窗，用于展示非文字类输出内容的模态对话框

## Requirements

### Requirement 1: 输入数据Tab切换

**User Story:** As a 工作流开发者, I want to 在输入数据区域切换不同的输入方式, so that I can 灵活地使用文件导入或上游节点数据进行调试

#### Acceptance Criteria

1. WHEN 用户展开"输入数据"区域 THEN THE Node_Debug_Panel SHALL 显示包含"导入文件"和"上游数据"两个Tab的切换组件
2. THE Input_Tab SHALL 默认选中"上游数据"Tab
3. WHEN 用户切换Tab THEN THE Node_Debug_Panel SHALL 立即显示对应Tab的内容区域
4. WHILE "上游数据"Tab被选中 THEN THE Node_Debug_Panel SHALL 显示现有的上游节点数据输入界面

### Requirement 2: 文件导入功能

**User Story:** As a 工作流开发者, I want to 导入各种格式的文件作为节点输入, so that I can 使用真实文件数据进行节点调试

#### Acceptance Criteria

1. WHEN 用户选择"导入文件"Tab THEN THE File_Import SHALL 显示文件上传区域和文件类型选择器
2. THE File_Import SHALL 支持以下文件类型：Word(.doc/.docx)、PDF(.pdf)、Excel(.xls/.xlsx)、PPT(.ppt/.pptx)、CSV(.csv)、HTML(.html)、JSON(.json)、图片(.jpg/.jpeg/.png/.gif/.webp)、音频(.mp3/.wav/.m4a)、视频(.mp4/.webm/.mov)
3. WHEN 用户上传文件 THEN THE File_Import SHALL 显示文件名称、大小和类型信息
4. WHEN 用户上传不支持的文件类型 THEN THE File_Import SHALL 显示错误提示并拒绝上传
5. THE File_Import SHALL 支持拖拽上传文件
6. WHEN 文件上传成功 THEN THE File_Import SHALL 提供删除已上传文件的功能

### Requirement 3: 模型类别选择

**User Story:** As a 工作流开发者, I want to 按模型类别选择AI模型, so that I can 根据任务类型选择合适的模型进行调试

#### Acceptance Criteria

1. WHEN 用户展开"AI提示词"区域 THEN THE Node_Debug_Panel SHALL 首先显示模型类别选择器
2. THE Node_Debug_Panel SHALL 支持以下模型类别：文本类(text)、代码类(code)、图片生成(image-gen)、视频生成(video-gen)、音频转录(audio-transcription)、文字转语音(audio-tts)、向量嵌入(embedding)、图文识别(ocr)
3. THE Node_Debug_Panel SHALL 默认选中"文本类"模型类别
4. WHEN 用户选择模型类别 THEN THE Node_Debug_Panel SHALL 更新模型配置下拉框，仅显示该类别下的可用模型
5. WHEN 模型类别变更 THEN THE Node_Debug_Panel SHALL 自动选择该类别的默认模型

### Requirement 4: 输出类型选择

**User Story:** As a 工作流开发者, I want to 选择输出结果的格式类型, so that I can 以合适的方式查看和使用调试结果

#### Acceptance Criteria

1. WHEN 调试执行完成 THEN THE Node_Debug_Panel SHALL 在输出结果区域显示输出类型选择器
2. THE Node_Debug_Panel SHALL 支持以下输出类型：纯文本、Word、PDF、Excel、PPT、CSV、HTML、JSON、图片、音频、视频
3. THE Node_Debug_Panel SHALL 根据实际输出内容自动推断并设置默认输出类型
4. WHEN 用户选择不同输出类型 THEN THE Node_Debug_Panel SHALL 以对应格式展示输出内容

### Requirement 5: 文字类输出展示

**User Story:** As a 工作流开发者, I want to 直接查看文字类输出结果, so that I can 快速验证节点的文本输出

#### Acceptance Criteria

1. WHEN 输出类型为纯文本或JSON THEN THE Node_Debug_Panel SHALL 直接在面板内显示格式化的文本内容
2. WHEN 输出类型为HTML THEN THE Node_Debug_Panel SHALL 提供源码视图和渲染预览两种查看方式
3. WHEN 输出类型为CSV THEN THE Node_Debug_Panel SHALL 以表格形式展示数据

### Requirement 6: 非文字类输出展示

**User Story:** As a 工作流开发者, I want to 预览和下载非文字类输出结果, so that I can 验证图片、音频、视频等多媒体输出

#### Acceptance Criteria

1. WHEN 输出类型为图片 THEN THE Node_Debug_Panel SHALL 显示图片缩略图，点击后弹窗显示完整图片
2. WHEN 输出类型为音频 THEN THE Node_Debug_Panel SHALL 显示音频播放器控件，点击后弹窗显示完整播放器
3. WHEN 输出类型为视频 THEN THE Node_Debug_Panel SHALL 显示视频缩略图，点击后弹窗显示视频播放器
4. WHEN 输出类型为Word/PDF/Excel/PPT THEN THE Node_Debug_Panel SHALL 显示文件图标和文件信息，点击后弹窗预览（如支持）或提示下载
5. THE Preview_Modal SHALL 包含关闭按钮和下载按钮
6. WHEN 用户点击下载按钮 THEN THE Node_Debug_Panel SHALL 触发文件下载

### Requirement 7: 输出结果下载

**User Story:** As a 工作流开发者, I want to 下载调试输出结果, so that I can 保存和分享调试结果

#### Acceptance Criteria

1. THE Node_Debug_Panel SHALL 在输出结果区域提供下载按钮
2. WHEN 用户点击下载按钮 THEN THE Node_Debug_Panel SHALL 以选定的输出类型格式下载文件
3. THE Node_Debug_Panel SHALL 为下载文件生成合理的默认文件名（包含节点名称和时间戳）
