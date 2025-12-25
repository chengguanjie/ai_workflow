/**
 * Node Config Panel - Re-export from refactored module
 * 
 * This file maintains backward compatibility by re-exporting the NodeConfigPanel
 * from its new modular location. The component has been split into smaller,
 * more maintainable sub-components located in the node-config-panel/ directory.
 * 
 * Directory structure:
 * - node-config-panel/
 *   - index.tsx                 - Main panel component (entry point)
 *   - input-node-config.tsx     - Input node configuration
 *   - process-node-config.tsx   - Process node configuration
 *   - shared/
 *     - types.ts                - Shared type definitions
 *     - ai-provider-select.tsx  - AI provider selection component
 *     - reference-selector.tsx  - Node reference selector component
 *     - prompt-tab-content.tsx  - Prompt tab content component
 */

export { 
  NodeConfigPanel,
  InputNodeConfigPanel,
  ProcessNodeConfigPanel,
} from './node-config-panel/index'
