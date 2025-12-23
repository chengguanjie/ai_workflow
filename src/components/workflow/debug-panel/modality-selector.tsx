"use client";

import React from "react";
import {
  Type,
  Code,
  ImageIcon,
  Video,
  Mic,
  Volume2,
  Database,
  ScanText,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type { ModelModality } from "@/lib/ai/types";
import { MODALITY_LABELS } from "@/lib/workflow/debug-panel/types";

// ============================================
// Types
// ============================================

interface ModalitySelectorProps {
  selectedModality: ModelModality;
  onModalityChange: (modality: ModelModality) => void;
  availableModalities?: ModelModality[];
  disabled?: boolean;
  className?: string;
}

// ============================================
// Constants
// ============================================

/**
 * All supported modalities in display order
 */
const ALL_MODALITIES: ModelModality[] = [
  "text",
  "code",
  "image-gen",
  "video-gen",
  "audio-transcription",
  "audio-tts",
  "embedding",
  "ocr",
];

/**
 * Default modality when none is selected
 */
export const DEFAULT_MODALITY: ModelModality = "text";

/**
 * Icon mapping for each modality
 */
const MODALITY_ICONS: Record<
  ModelModality,
  React.ComponentType<{ className?: string }>
> = {
  text: Type,
  code: Code,
  "image-gen": ImageIcon,
  "video-gen": Video,
  "audio-transcription": Mic,
  "audio-tts": Volume2,
  embedding: Database,
  ocr: ScanText,
};

// ============================================
// ModalitySelector Component
// ============================================

/**
 * ModalitySelector - A component for selecting AI model modality/category
 *
 * Supports 8 model categories:
 * - text: 文本类
 * - code: 代码类
 * - image-gen: 图片生成
 * - video-gen: 视频生成
 * - audio-transcription: 音频转录
 * - audio-tts: 文字转语音
 * - embedding: 向量嵌入
 * - ocr: 图文识别
 */
export function ModalitySelector({
  selectedModality,
  onModalityChange,
  availableModalities,
  disabled = false,
  className,
}: ModalitySelectorProps) {
  // Use available modalities if provided, otherwise use all modalities
  const modalities = availableModalities || ALL_MODALITIES;

  // Get icon component for a modality
  const getIcon = (modality: ModelModality) => {
    const IconComponent = MODALITY_ICONS[modality];
    return IconComponent ? <IconComponent className="h-4 w-4" /> : null;
  };

  return (
    <div className={className}>
      <Label className="text-xs font-medium text-muted-foreground mb-2 block">
        模型类别
      </Label>
      <Select
        value={selectedModality}
        onValueChange={(value: string) =>
          onModalityChange(value as ModelModality)
        }
        disabled={disabled}
      >
        <SelectTrigger className="w-full h-9">
          <div className="flex items-center gap-2">
            {getIcon(selectedModality)}
            <span>{MODALITY_LABELS[selectedModality]}</span>
          </div>
        </SelectTrigger>
        <SelectContent
          className="z-[9999] overflow-visible"
          position="popper"
          sideOffset={5}
        >
          {modalities.map((modality) => (
            <SelectItem key={modality} value={modality}>
              <div className="flex items-center gap-2">
                {getIcon(modality)}
                <span>{MODALITY_LABELS[modality]}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default ModalitySelector;
