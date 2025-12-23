# Implementation Plan: Node Debug Enhancement

## Overview

本实现计划将节点调试面板增强功能分解为可执行的编码任务，按照输入数据增强、AI提示词增强、输出结果增强三个模块依次实现。

## Tasks

- [x] 1. 创建核心类型定义和工具函数
  - [x] 1.1 创建输入/输出类型定义文件
    - 定义 `InputTabType`、`OutputType`、`ImportedFile` 等类型
    - 定义 `SUPPORTED_FILE_TYPES`、`OUTPUT_TYPE_LABELS`、`MODALITY_LABELS` 常量
    - _Requirements: 2.2, 4.2, 3.2_
  - [x] 1.2 实现文件类型验证函数
    - 实现 `isFileTypeSupported(extension: string): boolean`
    - 实现 `getFileCategory(extension: string): 'document' | 'image' | 'audio' | 'video' | null`
    - _Requirements: 2.2, 2.4_
  - [x] 1.3 编写文件类型验证属性测试
    - **Property 1: 文件类型验证**
    - **Validates: Requirements 2.2, 2.4**
  - [x] 1.4 实现输出类型推断函数
    - 实现 `inferOutputType(content: unknown, mimeType?: string): OutputType`
    - _Requirements: 4.3_
  - [x] 1.5 编写输出类型推断属性测试
    - **Property 3: 输出类型推断**
    - **Validates: Requirements 4.3**
  - [x] 1.6 实现下载文件名生成函数
    - 实现 `generateDownloadFileName(nodeName: string, outputType: OutputType): string`
    - _Requirements: 7.3_
  - [x] 1.7 编写下载文件名生成属性测试
    - **Property 5: 下载文件名生成**
    - **Validates: Requirements 7.3**

- [x] 2. Checkpoint - 确保所有工具函数测试通过
  - 运行测试确保核心函数正确
  - 如有问题请询问用户

- [x] 3. 实现输入数据Tab组件
  - [x] 3.1 创建 InputTabs 组件
    - 实现Tab切换UI（导入文件/上游数据）
    - 默认选中"上游数据"Tab
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - [x] 3.2 实现文件导入功能
    - 实现文件上传区域和拖拽上传
    - 显示文件名称、大小、类型信息
    - 实现文件删除功能
    - _Requirements: 2.1, 2.3, 2.5, 2.6_
  - [x] 3.3 编写 InputTabs 组件单元测试
    - 测试Tab切换功能
    - 测试文件上传交互
    - _Requirements: 1.1, 1.2, 1.3, 2.1_

- [x] 4. 实现模型类别选择组件
  - [x] 4.1 创建 ModalitySelector 组件
    - 实现8种模型类别的选择UI
    - 默认选中"文本类"
    - _Requirements: 3.1, 3.2, 3.3_
  - [x] 4.2 实现模型列表动态加载
    - 根据选中的模型类别过滤模型列表
    - 自动选择该类别的默认模型
    - _Requirements: 3.4, 3.5_
  - [x] 4.3 编写模型类别切换属性测试
    - **Property 2: 模型类别切换一致性**
    - **Validates: Requirements 3.4, 3.5**

- [ ] 5. Checkpoint - 确保输入和模型选择功能正常
  - 运行测试确保组件正确
  - 如有问题请询问用户

- [ ] 6. 实现输出结果增强组件
  - [ ] 6.1 创建 OutputTypeSelector 组件
    - 实现输出类型选择下拉框
    - 支持11种输出类型
    - _Requirements: 4.1, 4.2_
  - [ ] 6.2 实现文字类输出展示
    - 纯文本/JSON直接显示
    - HTML提供源码/渲染切换
    - CSV以表格形式展示
    - _Requirements: 5.1, 5.2, 5.3_
  - [ ] 6.3 编写CSV表格转换属性测试
    - **Property 4: CSV数据表格转换**
    - **Validates: Requirements 5.3**
  - [ ] 6.4 实现非文字类输出展示
    - 图片显示缩略图
    - 音频显示播放器控件
    - 视频显示缩略图
    - 文档显示文件图标
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - [ ] 6.5 创建 PreviewModal 预览弹窗组件
    - 实现图片/音频/视频/文档预览
    - 包含关闭和下载按钮
    - _Requirements: 6.5, 6.6_
  - [ ] 6.6 实现下载功能
    - 在输出区域添加下载按钮
    - 以选定格式下载文件
    - _Requirements: 7.1, 7.2_

- [x] 7. 集成到 NodeDebugPanel
  - [x] 7.1 重构 NodeDebugPanel 输入数据区域
    - 集成 InputTabs 组件
    - 保持现有上游数据功能
    - _Requirements: 1.1, 1.4_
  - [x] 7.2 重构 NodeDebugPanel AI提示词区域
    - 集成 ModalitySelector 组件
    - 更新模型选择逻辑
    - _Requirements: 3.1, 3.4_
  - [x] 7.3 重构 NodeDebugPanel 输出结果区域
    - 集成 OutputTypeSelector 组件
    - 集成文字/媒体输出展示
    - 集成 PreviewModal 组件
    - _Requirements: 4.1, 5.1, 6.1_

- [x] 8. Final Checkpoint - 确保所有功能集成正常
  - 运行所有测试确保通过
  - 如有问题请询问用户

## Notes

- All tasks are required for comprehensive testing
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
