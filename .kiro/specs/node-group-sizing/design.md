# Design Document: Node Group Sizing Enhancement

## Overview

本设计优化节点组合（Node Group）的视觉尺寸计算，在现有的 padding 基础上增加额外的视觉边距（visual margin），使组合容器看起来比内部节点略大，提供更清晰的视觉边界。

## Architecture

### 现有架构

当前节点组合的尺寸计算位于 `src/stores/workflow-store.ts` 的 `groupNodes` 函数中：

```typescript
const padding = 24;
const headerHeight = 50;
const groupWidth = sortedNodeIds.length * nodeWidth + (sortedNodeIds.length - 1) * nodeGap + padding * 2;
const groupHeight = nodeHeight + padding * 2 + headerHeight;
```

### 改进方案

引入新的 `visualMargin` 常量，在现有 padding 基础上增加额外边距：

```typescript
const padding = 24;
const visualMargin = 16; // 新增：额外视觉边距
const headerHeight = 50;
const totalPadding = padding + visualMargin; // 总边距

const groupWidth = sortedNodeIds.length * nodeWidth + (sortedNodeIds.length - 1) * nodeGap + totalPadding * 2;
const groupHeight = nodeHeight + totalPadding * 2 + headerHeight;
```

## Components and Interfaces

### 修改的组件

1. **workflow-store.ts** - `groupNodes` 函数
   - 增加 `visualMargin` 常量
   - 更新尺寸计算公式

2. **workflow-store.ts** - 自动布局相关代码
   - 确保布局计算使用相同的边距常量

### 常量定义

```typescript
// 节点组合尺寸常量
const NODE_GROUP_CONSTANTS = {
  NODE_WIDTH: 240,
  NODE_HEIGHT: 180,
  NODE_GAP: 24,
  PADDING: 24,
  VISUAL_MARGIN: 16,  // 新增
  HEADER_HEIGHT: 50,
};
```

## Data Models

无数据模型变更，仅修改尺寸计算逻辑。

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Group dimensions include visual margin

*For any* set of nodes being grouped, the resulting group width and height SHALL be at least `2 * visualMargin` pixels larger than the minimum bounding box required to contain all child nodes with basic padding.

**Validates: Requirements 1.1, 1.2, 2.1**

### Property 2: Margin consistency across dimensions

*For any* node group, the horizontal visual margin SHALL equal the vertical visual margin.

**Validates: Requirements 2.3**

### Property 3: Child position adjustment preserves margin

*For any* node group after child nodes are repositioned, the distance from the outermost child node edge to the group boundary SHALL be at least `padding + visualMargin` pixels.

**Validates: Requirements 1.4**

## Error Handling

- 如果节点数量小于 2，`groupNodes` 函数应提前返回（现有行为）
- 尺寸计算应始终产生正数值

## Testing Strategy

### Unit Tests

1. 测试 `groupNodes` 函数生成的组尺寸是否包含额外边距
2. 测试单节点边界情况（如果支持）
3. 测试不同数量节点的组尺寸计算

### Property-Based Tests

使用 fast-check 进行属性测试：

1. **Property 1**: 生成随机数量的节点位置，验证组尺寸始终包含 visualMargin
2. **Property 2**: 验证水平和垂直边距相等
3. **Property 3**: 验证子节点位置调整后边距保持

测试配置：
- 最少 100 次迭代
- 使用 fast-check 库
- 标签格式: **Feature: node-group-sizing, Property N: [property_text]**
