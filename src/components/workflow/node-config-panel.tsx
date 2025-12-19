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
 *   - code-node-config.tsx      - Code node configuration
 *   - output-node-config.tsx    - Output node configuration
 *   - data-node-config.tsx      - Data/Image/Video/Audio node configurations
 *   - media-node-config.tsx     - Base media node configuration component
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
  CodeNodeConfigPanel,
  OutputNodeConfigPanel,
  DataNodeConfigPanel,
  ImageNodeConfigPanel,
  VideoNodeConfigPanel,
  AudioNodeConfigPanel,
  MediaNodeConfigPanel,
} from './node-config-panel/index'
