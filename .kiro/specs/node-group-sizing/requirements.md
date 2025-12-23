# Requirements Document

## Introduction

优化节点组合（Node Group）的视觉尺寸，使组合后的容器大小比内部节点略大，提供更好的视觉边界和用户体验。

## Glossary

- **Node_Group**: 工作流编辑器中将多个节点组合在一起的容器节点
- **Child_Node**: 被包含在节点组内的子节点
- **Group_Padding**: 节点组边框与内部子节点之间的间距
- **Visual_Margin**: 节点组额外的视觉边距，使组看起来比子节点略大

## Requirements

### Requirement 1

**User Story:** As a workflow editor user, I want node groups to have slightly larger dimensions than the contained nodes, so that the group boundary is clearly visible and provides better visual separation.

#### Acceptance Criteria

1. WHEN multiple nodes are grouped together, THE Node_Group SHALL have additional visual margin beyond the child nodes' bounding box
2. THE Node_Group SHALL maintain a minimum extra margin of 16 pixels on each side beyond the current padding
3. WHEN the group is collapsed, THE Node_Group SHALL maintain proportional sizing relative to the collapsed state
4. WHEN child nodes are added or removed from a group, THE Node_Group SHALL recalculate its size with the visual margin preserved

### Requirement 2

**User Story:** As a workflow editor user, I want the node group sizing to be consistent and predictable, so that the visual appearance is uniform across all groups.

#### Acceptance Criteria

1. THE Node_Group SHALL apply the same visual margin calculation regardless of the number of child nodes
2. WHEN a single node is in a group (edge case), THE Node_Group SHALL still appear visibly larger than the single node
3. THE visual margin SHALL be consistent across horizontal and vertical dimensions
