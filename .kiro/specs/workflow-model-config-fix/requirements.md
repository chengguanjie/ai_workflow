# Requirements Document

## Introduction

修复工作流节点调试中的模型配置不一致问题。用户在调试面板中选择的模型与实际执行时使用的模型不一致，导致执行失败且调试日志为空。

## Glossary

- **Process_Node**: AI处理节点，用于执行AI模型调用
- **Debug_Panel**: 节点调试面板，用于单独测试节点功能
- **Model_Config**: 模型配置，包含模型ID、服务商配置等信息
- **Modality**: 模型模态类型，如text（文本）、video-gen（视频生成）等

## Requirements

### Requirement 1: 模型配置同步

**User Story:** As a 工作流开发者, I want 在调试面板中选择的模型能够正确保存并在执行时使用, so that 我可以准确测试不同模型的效果。

#### Acceptance Criteria

1. WHEN 用户在调试面板的模型选择器中选择一个模型 THEN THE Debug_Panel SHALL 立即将该模型配置保存到节点配置中
2. WHEN 调试执行开始时 THEN THE Process_Node SHALL 使用节点配置中保存的模型而非默认模型
3. IF 节点配置中的模型为空或无效 THEN THE Process_Node SHALL 使用服务商的默认文本模型
4. WHEN 节点配置中存在旧的非文本模型（如video-gen） THEN THE Debug_Panel SHALL 自动将其替换为默认文本模型

### Requirement 2: 调试日志完整性

**User Story:** As a 工作流开发者, I want 在调试执行失败时也能看到完整的调试日志, so that 我可以诊断问题原因。

#### Acceptance Criteria

1. WHEN 调试执行过程中发生错误 THEN THE Debug_Panel SHALL 显示错误发生前的所有日志
2. WHEN 模型配置错误导致执行失败 THEN THE Debug_Panel SHALL 在日志中显示具体的配置问题
3. THE Debug_Panel SHALL 在"调试过程"标签页中显示执行日志，而非仅显示"等待执行..."

### Requirement 3: 模型类型验证

**User Story:** As a 系统, I want 在执行前验证模型类型是否与任务匹配, so that 可以提前发现配置错误。

#### Acceptance Criteria

1. WHEN 用户尝试使用非文本模型（如video-gen、image-gen）执行文本处理任务 THEN THE Process_Node SHALL 在执行前抛出明确的错误提示
2. WHEN 检测到模型类型不匹配 THEN THE Debug_Panel SHALL 在日志中记录详细的模型配置信息
3. THE Process_Node SHALL 在日志中记录实际使用的模型ID，便于问题诊断
