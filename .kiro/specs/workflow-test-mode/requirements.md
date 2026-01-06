# Requirements Document

## Introduction

本功能将改造工作流执行页面，将现有的"普通执行"和"实时监控"两种模式重新定义为"执行模式"和"测试模式"。执行模式保持原有的工作流运行功能，测试模式则提供一个完整的测试环境，支持用户输入测试数据或使用 AI 生成测试数据，并允许用户对每个节点的执行结果提供反馈（正确/错误及错误原因），这些反馈数据将保存到数据库中，用于后续的统计分析。

## Glossary

- **Execution_Panel**: 工作流执行面板组件，用于执行工作流并展示结果
- **Execution_Mode**: 执行模式，按正常工作流运行，用户输入参数后执行，弹窗可最小化
- **Test_Mode**: 测试模式，用户输入或 AI 生成测试数据，逐节点执行并收集反馈
- **Node_Feedback**: 节点反馈，用户对单个节点执行结果的评价，包括正确/错误选项及错误原因
- **Test_Execution**: 测试执行记录，包含测试数据、节点反馈等信息
- **AI_Test_Data_Generator**: AI 测试数据生成器，根据输入字段定义自动生成测试数据

## Requirements

### Requirement 1: 执行模式基础功能

**User Story:** As a 工作流用户, I want to 使用执行模式运行工作流, so that 我可以正常执行工作流并获取结果。

#### Acceptance Criteria

1. WHEN 用户打开执行面板 THEN THE Execution_Panel SHALL 显示"执行模式"和"测试模式"两个标签页
2. WHEN 用户选择执行模式 THEN THE Execution_Panel SHALL 显示输入参数表单和执行按钮
3. WHEN 用户点击执行按钮 THEN THE Execution_Panel SHALL 提交工作流执行请求并显示执行状态
4. WHEN 工作流正在执行中 THEN THE Execution_Panel SHALL 提供最小化弹窗的选项，允许用户继续其他操作
5. WHEN 用户最小化执行弹窗 THEN THE Execution_Panel SHALL 在后台继续执行并在完成后提供通知

### Requirement 2: 测试模式基础功能

**User Story:** As a 工作流开发者, I want to 使用测试模式测试工作流, so that 我可以验证每个节点的输出是否符合预期。

#### Acceptance Criteria

1. WHEN 用户选择测试模式 THEN THE Execution_Panel SHALL 显示测试数据输入区域和 AI 生成测试数据按钮
2. WHEN 用户点击 AI 生成测试数据按钮 THEN THE AI_Test_Data_Generator SHALL 根据输入字段定义生成合理的测试数据
3. WHEN 用户在测试模式下点击执行 THEN THE Execution_Panel SHALL 逐节点执行工作流并显示每个节点的执行结果
4. WHEN 节点执行完成 THEN THE Execution_Panel SHALL 显示该节点的输出数据和反馈选项
5. WHILE 测试执行进行中 THEN THE Execution_Panel SHALL 实时更新节点执行状态和进度

### Requirement 3: 节点反馈功能

**User Story:** As a 工作流开发者, I want to 对每个节点的执行结果提供反馈, so that 我可以记录哪些节点输出正确，哪些需要改进。

#### Acceptance Criteria

1. WHEN 节点执行完成 THEN THE Execution_Panel SHALL 显示"正确"和"错误"两个反馈选项
2. WHEN 用户选择"错误"选项 THEN THE Execution_Panel SHALL 显示错误原因输入框
3. WHEN 用户提交节点反馈 THEN THE Node_Feedback SHALL 保存到数据库中，关联执行记录和节点信息
4. THE Node_Feedback SHALL 包含节点 ID、执行 ID、反馈类型（正确/错误）、错误原因、反馈时间等字段
5. WHEN 用户完成所有节点反馈 THEN THE Execution_Panel SHALL 显示测试完成摘要

### Requirement 4: 测试数据持久化

**User Story:** As a 系统管理员, I want to 保存测试执行数据和反馈, so that 我可以在统计分析中使用这些数据。

#### Acceptance Criteria

1. WHEN 测试执行开始 THEN THE Test_Execution SHALL 创建一条测试执行记录，标记为测试类型
2. WHEN 节点反馈提交 THEN THE Node_Feedback SHALL 与测试执行记录关联保存
3. THE Test_Execution SHALL 记录测试输入数据、是否为 AI 生成、执行时间等元数据
4. WHEN 查询执行历史 THEN THE System SHALL 能够区分正常执行和测试执行
5. THE Node_Feedback SHALL 支持按工作流、节点、时间范围等维度进行查询和统计

### Requirement 5: AI 测试数据生成

**User Story:** As a 工作流开发者, I want to 使用 AI 自动生成测试数据, so that 我可以快速创建多样化的测试用例。

#### Acceptance Criteria

1. WHEN 用户点击 AI 生成测试数据 THEN THE AI_Test_Data_Generator SHALL 分析输入字段的名称、类型和描述
2. THE AI_Test_Data_Generator SHALL 根据字段语义生成合理的测试数据
3. WHEN AI 生成完成 THEN THE Execution_Panel SHALL 自动填充生成的测试数据到输入表单
4. IF AI 生成失败 THEN THE Execution_Panel SHALL 显示错误提示并允许用户手动输入
5. THE AI_Test_Data_Generator SHALL 支持文本、图片 URL、选择项等不同字段类型的数据生成

### Requirement 6: 统计分析集成

**User Story:** As a 工作流管理者, I want to 在统计分析中查看测试反馈数据, so that 我可以了解工作流各节点的质量状况。

#### Acceptance Criteria

1. WHEN 用户访问统计分析页面 THEN THE System SHALL 显示测试反馈相关的统计指标
2. THE System SHALL 统计每个节点的正确率和错误率
3. THE System SHALL 按错误原因分类统计，识别常见问题
4. THE System SHALL 支持按时间范围筛选测试反馈数据
5. THE System SHALL 提供节点质量趋势图表，展示改进情况

