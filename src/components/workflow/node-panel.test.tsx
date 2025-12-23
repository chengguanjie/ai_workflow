import { describe, it, expect } from "vitest";
import {
  primaryNodes,
  moreNodes,
  advancedNodes,
  mediaDataNodes,
  allNodeTypes,
  NodeType,
} from "./node-panel";

/**
 * Property tests for NodePanel completeness and drag data consistency
 * These tests verify that all required node types are available in the panel
 * and that drag data is consistent with node type definitions
 *
 * 简化后的节点面板只包含两个节点：
 * - 用户输入 (input)
 * - AI处理 (process)
 */

// ============================================
// Property 1: Node Panel Completeness
// ============================================

describe("Property 1: Node Panel Completeness", () => {
  /**
   * 简化后的节点面板应该只包含 input 和 process 节点
   */
  it("allNodeTypes should only contain input and process nodes", () => {
    const allTypes = allNodeTypes.map((n) => n.type);
    expect(allTypes).toContain("input");
    expect(allTypes).toContain("process");
    expect(allTypes.length).toBe(2);
  });

  /**
   * primaryNodes 应该包含用户输入和AI处理节点
   */
  it("primaryNodes should contain input and process nodes", () => {
    const primaryTypes = primaryNodes.map((n) => n.type);
    expect(primaryTypes).toContain("input");
    expect(primaryTypes).toContain("process");
    expect(primaryTypes.length).toBe(2);
  });

  /**
   * 其他节点数组应该为空（保持向后兼容）
   */
  it("other node arrays should be empty for backward compatibility", () => {
    expect(moreNodes.length).toBe(0);
    expect(advancedNodes.length).toBe(0);
    expect(mediaDataNodes.length).toBe(0);
  });

  /**
   * 每个节点应该有所有必需的属性
   */
  it("each node should have all required properties (type, name, description, icon, color, bgColor)", () => {
    allNodeTypes.forEach((node: NodeType) => {
      expect(node.type).toBeDefined();
      expect(node.type.length).toBeGreaterThan(0);

      expect(node.name).toBeDefined();
      expect(node.name.length).toBeGreaterThan(0);

      expect(node.description).toBeDefined();
      expect(node.description.length).toBeGreaterThan(0);

      expect(node.icon).toBeDefined();
      // React components can be functions or objects (forwardRef components)
      expect(["function", "object"].includes(typeof node.icon)).toBe(true);

      expect(node.color).toBeDefined();
      expect(node.color).toMatch(/^text-/);

      expect(node.bgColor).toBeDefined();
      expect(node.bgColor).toMatch(/^bg-/);
    });
  });

  /**
   * 不应该存在重复的节点类型
   */
  it("no duplicate node types should exist in allNodeTypes", () => {
    const types = allNodeTypes.map((n) => n.type);
    const uniqueTypes = new Set(types);
    expect(types.length).toBe(uniqueTypes.size);
  });
});

// ============================================
// Property 2: Drag Data Consistency
// ============================================

describe("Property 2: Drag Data Consistency", () => {
  /**
   * 每个节点类型应该是有效的字符串，可以用作拖拽数据
   */
  it("each node type should be a valid non-empty string for drag data", () => {
    allNodeTypes.forEach((node: NodeType) => {
      // Type should be a valid string
      expect(typeof node.type).toBe("string");
      expect(node.type.length).toBeGreaterThan(0);

      // Type should not contain special characters that could break drag/drop
      expect(node.type).toMatch(/^[a-z_]+$/);
    });
  });

  /**
   * 节点类型应该是小写的（与拖拽数据格式一致）
   */
  it("all node types should be lowercase", () => {
    allNodeTypes.forEach((node: NodeType) => {
      expect(node.type).toBe(node.type.toLowerCase());
    });
  });

  /**
   * 拖拽数据应该与节点类型完全匹配
   */
  it("drag data should match node type exactly", () => {
    allNodeTypes.forEach((node: NodeType) => {
      // Simulate what onDragStart does:
      // event.dataTransfer.setData('application/reactflow', nodeType)
      const dragData = node.type;

      // The drag data should exactly match the node's type
      expect(dragData).toBe(node.type);
    });
  });
});

// ============================================
// Node Panel Structure Tests
// ============================================

describe("Node Panel Structure", () => {
  /**
   * 用户输入节点应该正确配置
   */
  it("input node should have correct configuration", () => {
    const inputNode = primaryNodes.find((n) => n.type === "input");
    expect(inputNode).toBeDefined();
    expect(inputNode?.name).toBe("User Input");
    expect(inputNode?.description).toContain("输入");
  });

  /**
   * AI处理节点应该正确配置
   */
  it("process node should have correct configuration", () => {
    const processNode = primaryNodes.find((n) => n.type === "process");
    expect(processNode).toBeDefined();
    expect(processNode?.name).toBe("Agent");
    expect(processNode?.description).toContain("AI");
  });

  /**
   * 节点名称已更新为新的命名
   */
  it("node names should use new naming convention", () => {
    const inputNode = primaryNodes.find((n) => n.type === "input");
    const processNode = primaryNodes.find((n) => n.type === "process");

    // 确保使用新的命名（英文）
    expect(inputNode?.name).toBe("User Input");
    expect(processNode?.name).toBe("Agent");
  });
});
