import React from "react";
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { render, screen } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import {
  nodeStyles,
  getTypeLabel,
  nodeTypes,
  ConditionNode,
  MediaDataImageNode,
  MediaDataAudioNode,
  MediaDataVideoNode,
  MediaDataDataNode,
} from "./index";

// Helper to create complete NodeProps for testing
const createNodeProps = (
  id: string,
  type: string,
  data: Record<string, unknown>,
) => ({
  id,
  data,
  selected: false,
  type,
  dragging: false,
  zIndex: 1,
  isConnectable: true,
  positionAbsoluteX: 0,
  positionAbsoluteY: 0,
  selectable: true,
  deletable: true,
  draggable: true,
});

/**
 * **Feature: advanced-nodes-ui, Property 4: Node Style Consistency**
 * **Validates: Requirements 8.2**
 *
 * For any registered node type, the nodeStyles mapping should contain
 * icon, color, and bgColor properties.
 */

// All node types that should be registered (basic + advanced)
const allNodeTypes = [
  // Basic nodes
  "input",
  "process",
  "code",
  "output",
  "data",
  "image",
  "video",
  "audio",
  // Advanced nodes
  "condition",
  "loop",
  "http",
  "merge",
  "image_gen",
  "notification",
];

// All node type labels (uppercase versions for getTypeLabel)
const allNodeTypeLabels: Record<string, string> = {
  INPUT: "用户输入",
  PROCESS: "AI处理",
  CODE: "代码节点",
  OUTPUT: "输出节点",
  DATA: "数据节点",
  IMAGE: "图片节点",
  VIDEO: "视频节点",
  AUDIO: "音频节点",
  CONDITION: "条件节点",
  LOOP: "循环节点",
  HTTP: "HTTP 节点",
  MERGE: "合并节点",
  IMAGE_GEN: "图像生成",
  NOTIFICATION: "通知节点",
};

describe("Property 4: Node Style Consistency", () => {
  /**
   * For any registered node type, nodeStyles should contain icon, color, headerColor, and borderColor
   */
  it("every node type should have complete style definition with icon, color, headerColor, and borderColor", () => {
    fc.assert(
      fc.property(fc.constantFrom(...allNodeTypes), (nodeType) => {
        const style = nodeStyles[nodeType];

        // Style should exist
        expect(style).toBeDefined();

        // Style should have icon property (a React component - can be function or object)
        expect(style.icon).toBeDefined();
        // React components can be functions or objects (ForwardRef components)
        expect(["function", "object"]).toContain(typeof style.icon);

        // Style should have color property (a Tailwind class string)
        expect(style.color).toBeDefined();
        expect(typeof style.color).toBe("string");
        expect(style.color.length).toBeGreaterThan(0);

        // Style should have headerColor property (a Tailwind class string)
        expect(style.headerColor).toBeDefined();
        expect(typeof style.headerColor).toBe("string");
        expect(style.headerColor.length).toBeGreaterThan(0);

        // Style should have borderColor property (a Tailwind class string)
        expect(style.borderColor).toBeDefined();
        expect(typeof style.borderColor).toBe("string");
        expect(style.borderColor.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * For any node type, getTypeLabel should return a non-empty Chinese label
   */
  it("every node type should have a Chinese label via getTypeLabel", () => {
    fc.assert(
      fc.property(fc.constantFrom(...allNodeTypes), (nodeType) => {
        const label = getTypeLabel(nodeType);

        // Label should be defined and non-empty
        expect(label).toBeDefined();
        expect(typeof label).toBe("string");
        expect(label.length).toBeGreaterThan(0);

        // Label should match expected Chinese label
        const expectedLabel = allNodeTypeLabels[nodeType.toUpperCase()];
        expect(label).toBe(expectedLabel);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * nodeStyles should contain all required node types
   */
  it("nodeStyles should contain all required node types", () => {
    for (const nodeType of allNodeTypes) {
      expect(nodeStyles).toHaveProperty(nodeType);
    }
  });

  /**
   * Color classes should follow Tailwind naming convention
   */
  it("color classes should follow Tailwind text-{color}-{shade} pattern", () => {
    fc.assert(
      fc.property(fc.constantFrom(...allNodeTypes), (nodeType) => {
        const style = nodeStyles[nodeType];

        // Color should match text-{color}-{shade} pattern
        expect(style.color).toMatch(/^text-[a-z]+-\d{2,3}$/);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * headerColor and borderColor classes should follow Tailwind naming convention
   */
  it("headerColor and borderColor classes should follow Tailwind patterns", () => {
    fc.assert(
      fc.property(fc.constantFrom(...allNodeTypes), (nodeType) => {
        const style = nodeStyles[nodeType];

        // headerColor should contain bg- class
        expect(style.headerColor).toBeDefined();
        expect(style.headerColor).toContain("bg-");

        // borderColor should contain border- class
        expect(style.borderColor).toBeDefined();
        expect(style.borderColor).toContain("border-");
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * **Feature: advanced-nodes-ui, Property 3: Node Type Registration Completeness**
 * **Validates: Requirements 11.1**
 *
 * For any node type defined in the backend processors, the nodeTypes object
 * in React Flow should have a corresponding component registered.
 */
describe("Property 3: Node Type Registration Completeness", () => {
  /**
   * For any node type in allNodeTypes, nodeTypes should have a registered component
   */
  it("every node type should have a registered React component in nodeTypes", () => {
    fc.assert(
      fc.property(fc.constantFrom(...allNodeTypes), (nodeType) => {
        // nodeTypes should have this node type registered
        expect(nodeTypes).toHaveProperty(nodeType);

        // The registered value should be a valid React component (function or object)
        const component = nodeTypes[nodeType as keyof typeof nodeTypes];
        expect(component).toBeDefined();
        expect(["function", "object"]).toContain(typeof component);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * nodeTypes should contain all required node types
   */
  it("nodeTypes should contain all required node types", () => {
    for (const nodeType of allNodeTypes) {
      expect(nodeTypes).toHaveProperty(nodeType);
    }
  });

  /**
   * nodeTypes keys should match nodeStyles keys for consistency
   */
  it("nodeTypes and nodeStyles should have matching keys", () => {
    const nodeTypesKeys = Object.keys(nodeTypes);
    const nodeStylesKeys = Object.keys(nodeStyles);

    // Every nodeType should have a corresponding style
    for (const key of nodeTypesKeys) {
      expect(nodeStylesKeys).toContain(key);
    }
  });
});

/**
 * **Feature: advanced-nodes-ui, Property 13: Condition Node Dual Handles**
 * **Validates: Requirements 11.4**
 *
 * For any rendered condition node, exactly two output handles should be present
 * with ids "true" and "false".
 */
describe("Property 13: Condition Node Dual Handles", () => {
  // Helper to render ConditionNode with required props
  const renderConditionNode = (config = {}) => {
    const mockData = {
      name: "Test Condition",
      type: "condition",
      config,
    };

    return render(
      <ReactFlowProvider>
        <ConditionNode
          {...createNodeProps("test-condition-1", "condition", mockData)}
        />
      </ReactFlowProvider>,
    );
  };

  it("condition node should render with true/false branch labels", () => {
    renderConditionNode();

    // Should display True and False labels
    expect(screen.getByText(/True/)).toBeDefined();
    expect(screen.getByText(/False/)).toBeDefined();
  });

  it("condition node should have two output handles with correct ids", () => {
    const { container } = renderConditionNode();

    // Find source handles (output handles)
    const sourceHandles = container.querySelectorAll(
      '[data-handlepos="right"]',
    );

    // Should have exactly 2 output handles
    expect(sourceHandles.length).toBe(2);

    // Check for true and false handle ids
    const handleIds = Array.from(sourceHandles).map((h) =>
      h.getAttribute("data-handleid"),
    );
    expect(handleIds).toContain("true");
    expect(handleIds).toContain("false");
  });

  it("condition node output handles should have distinct visual styles", () => {
    const { container } = renderConditionNode();

    // Find source handles
    const sourceHandles = container.querySelectorAll(
      '[data-handlepos="right"]',
    );

    // Get the handles by their ids
    const trueHandle = Array.from(sourceHandles).find(
      (h) => h.getAttribute("data-handleid") === "true",
    );
    const falseHandle = Array.from(sourceHandles).find(
      (h) => h.getAttribute("data-handleid") === "false",
    );

    expect(trueHandle).toBeDefined();
    expect(falseHandle).toBeDefined();

    // True handle should have green styling
    expect(trueHandle?.className).toContain("bg-green");

    // False handle should have red styling
    expect(falseHandle?.className).toContain("bg-red");
  });
});

/**
 * **Feature: advanced-nodes-ui, Property 14: Media/Data Node Mode Indicator**
 * **Validates: Requirements 11.5**
 *
 * For any rendered media/data node (IMAGE, AUDIO, VIDEO, DATA), the node should
 * display a mode indicator showing either "输入" or "输出".
 */
describe("Property 14: Media/Data Node Mode Indicator", () => {
  // Media/Data node types
  const mediaDataNodeTypes = ["image", "audio", "video", "data"];

  // Map node types to their components
  const mediaDataComponents: Record<string, typeof MediaDataImageNode> = {
    image: MediaDataImageNode,
    audio: MediaDataAudioNode,
    video: MediaDataVideoNode,
    data: MediaDataDataNode,
  };

  // Helper to render a media/data node
  const renderMediaDataNode = (
    nodeType: string,
    mode: "input" | "output" = "input",
  ) => {
    const Component = mediaDataComponents[nodeType];
    const mockData = {
      name: `Test ${nodeType}`,
      type: nodeType,
      config: { mode },
    };

    return render(
      <ReactFlowProvider>
        <Component
          {...createNodeProps(`test-${nodeType}-1`, nodeType, mockData)}
        />
      </ReactFlowProvider>,
    );
  };

  it("media/data nodes should display mode indicator", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...mediaDataNodeTypes),
        fc.constantFrom("input", "output") as fc.Arbitrary<"input" | "output">,
        (nodeType, mode) => {
          const { unmount } = renderMediaDataNode(nodeType, mode);

          // Should have a mode indicator
          const modeIndicator = screen.getByTestId("mode-indicator");
          expect(modeIndicator).toBeDefined();

          // Mode indicator should show correct text
          const expectedText = mode === "input" ? "输入" : "输出";
          expect(modeIndicator.textContent).toBe(expectedText);

          unmount();
        },
      ),
      { numRuns: 50 },
    );
  });

  it("media/data nodes should default to input mode when no mode specified", () => {
    fc.assert(
      fc.property(fc.constantFrom(...mediaDataNodeTypes), (nodeType) => {
        const Component = mediaDataComponents[nodeType];
        const mockData = {
          name: `Test ${nodeType}`,
          type: nodeType,
          config: {}, // No mode specified
        };

        const { unmount } = render(
          <ReactFlowProvider>
            <Component
              {...createNodeProps(
                `test-${nodeType}-default`,
                nodeType,
                mockData,
              )}
            />
          </ReactFlowProvider>,
        );

        // Should default to "输入" (input)
        const modeIndicator = screen.getByTestId("mode-indicator");
        expect(modeIndicator.textContent).toBe("输入");

        unmount();
      }),
      { numRuns: 50 },
    );
  });

  it("input mode indicator should have blue styling", () => {
    renderMediaDataNode("image", "input");

    const modeIndicator = screen.getByTestId("mode-indicator");
    expect(modeIndicator.className).toContain("bg-blue");
    expect(modeIndicator.className).toContain("text-blue");
  });

  it("output mode indicator should have green styling", () => {
    renderMediaDataNode("image", "output");

    const modeIndicator = screen.getByTestId("mode-indicator");
    expect(modeIndicator.className).toContain("bg-green");
    expect(modeIndicator.className).toContain("text-green");
  });
});
