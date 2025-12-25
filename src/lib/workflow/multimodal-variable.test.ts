import { describe, it, expect } from 'vitest';
import { createContentPartsFromText } from './utils';
import type { ExecutionContext } from './types';

describe('Multimodal Variable Replacement', () => {
                  // Mock Execution Context
                  const mockContext: ExecutionContext = {
                                    executionId: 'test-exec',
                                    workflowId: 'test-wf',
                                    organizationId: 'test-org',
                                    userId: 'test-user',
                                    nodeOutputs: new Map(),
                                    aiConfigs: new Map(),
                                    globalVariables: {},
                                    importedFiles: []
                  };

                  // Helper to set node output
                  const setNodeOutput = (nodeName: string, data: any) => {
                                    mockContext.nodeOutputs.set(nodeName, {
                                                      nodeId: nodeName,
                                                      nodeName: nodeName,
                                                      nodeType: 'TEST',
                                                      status: 'success',
                                                      data: data,
                                                      startedAt: new Date(),
                                                      completedAt: new Date(),
                                                      duration: 100
                                    });
                  };

                  it('should handle pure text without variables', () => {
                                    const text = 'Hello world';
                                    const parts = createContentPartsFromText(text, mockContext);
                                    expect(parts).toHaveLength(1);
                                    expect(parts[0]).toEqual({ type: 'text', text: 'Hello world' });
                  });

                  it('should replace text variables correctly', () => {
                                    setNodeOutput('Input', { name: 'Alice' });
                                    const text = 'Hello {{Input.name}}';
                                    const parts = createContentPartsFromText(text, mockContext);

                                    expect(parts).toHaveLength(1);
                                    expect(parts[0]).toEqual({ type: 'text', text: 'Hello Alice' });
                  });

                  it('should convert image variable (array structure) to image_url', () => {
                                    setNodeOutput('ImageNode', {
                                                      images: [{
                                                                        url: 'https://example.com/image.jpg',
                                                                        type: 'image/jpeg'
                                                      }]
                                    });

                                    // Simulating usage like {{ImageNode.images}}
                                    const text = 'Analyze this: {{ImageNode.images}}';
                                    const parts = createContentPartsFromText(text, mockContext);

                                    expect(parts).toHaveLength(2);
                                    expect(parts[0]).toEqual({ type: 'text', text: 'Analyze this: ' });
                                    // The second part should be the image
                                    expect(parts[1]).toEqual({
                                                      type: 'image_url',
                                                      image_url: { url: 'https://example.com/image.jpg', detail: 'auto' }
                                    });
                  });

                  it('should handle nested file text part mixed with image (InputNode)', () => {
                                    setNodeOutput('InputNode', {
                                                      file: {
                                                                        url: 'https://example.com/photo.png',
                                                                        mimeType: 'image/png'
                                                      }
                                    });
                                    setNodeOutput('TextNode', { result: 'Look:' });

                                    const text = '{{TextNode.result}} {{InputNode.file}}';
                                    const parts = createContentPartsFromText(text, mockContext);

                                    expect(parts).toHaveLength(2);
                                    // Note: mergeTextParts might merge the space after {{TextNode}} if it resolves to text. 
                                    // "Look:" + " " -> "Look: "
                                    expect(parts[0]).toEqual({ type: 'text', text: 'Look: ' });
                                    expect(parts[1]).toEqual({
                                                      type: 'image_url',
                                                      image_url: { url: 'https://example.com/photo.png', detail: 'auto' }
                                    });
                  });

                  it('should handle video variables (array structure)', () => {
                                    setNodeOutput('VideoNode', {
                                                      videos: [{
                                                                        url: 'https://example.com/video.mp4',
                                                                        format: 'mp4'
                                                      }]
                                    });

                                    const text = 'Watch: {{VideoNode.videos}}';
                                    const parts = createContentPartsFromText(text, mockContext);

                                    expect(parts).toHaveLength(2);
                                    expect(parts[1]).toEqual({
                                                      type: 'video_url',
                                                      video_url: { url: 'https://example.com/video.mp4' }
                                    });
                  });
});
