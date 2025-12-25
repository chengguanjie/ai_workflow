import { SHENSUAN_MODELS } from './types'

/**
 * Model Capability Checkers
 * Centralized logic to determine model capabilities based on model ID
 */

// Flattened arrays from SHENSUAN_MODELS for easier lookup
const VISION_MODEL_IDS = new Set([
                  ...SHENSUAN_MODELS['ocr'],
                  ...SHENSUAN_MODELS['image-gen'], // Some image gen models might accept image inputs too, but strictly "Vision" usually means understanding
                  'gpt-4o', 'gpt-4-turbo', 'gpt-4-vision-preview',
                  'claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307',
                  'claude-3-5-sonnet-20240620',
                  'anthropic/claude-sonnet-4.5:thinking', // Assuming new models support vision
                  'google/gemini-pro-vision', 'google/gemini-1.5-pro', 'google/gemini-1.5-flash',
                  'ali/qwen-vl-max', 'ali/qwen-vl-plus',
                  'deepseek/deepseek-vl',
])

// Heuristic keywords if exact ID not found
const VISION_KEYWORDS = ['vision', 'vl', '4o', 'gemini', 'claude-3', 'omni']

export function isVisionModel(modelId: string): boolean {
                  if (VISION_MODEL_IDS.has(modelId)) return true
                  const lower = modelId.toLowerCase()
                  return VISION_KEYWORDS.some(k => lower.includes(k))
}

const AUDIO_MODEL_IDS = new Set([
                  ...SHENSUAN_MODELS['audio-transcription'],
                  'gpt-4o-audio-preview',
                  'qwen2-audio-instruct',
])

const AUDIO_KEYWORDS = ['whisper', 'audio', 'speech', 'omni']

export function isAudioModel(modelId: string): boolean {
                  if (AUDIO_MODEL_IDS.has(modelId)) return true
                  const lower = modelId.toLowerCase()
                  return AUDIO_KEYWORDS.some(k => lower.includes(k))
}

const VIDEO_MODEL_IDS = new Set([
                  ...SHENSUAN_MODELS['video-gen'],
                  'google/gemini-1.5-pro', // Gemini 1.5 supports video natively
                  'google/gemini-1.5-flash',
                  'qwen-vl-max', // Some VL models support video
])

const VIDEO_KEYWORDS = ['video', 'omni', 'gemini-1.5']

export function isVideoModel(modelId: string): boolean {
                  if (VIDEO_MODEL_IDS.has(modelId)) return true
                  const lower = modelId.toLowerCase()
                  return VIDEO_KEYWORDS.some(k => lower.includes(k))
}
