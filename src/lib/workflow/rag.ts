export type ImportedFileForRag = { name: string; content: string; type: string }

function clamp(text: string, maxChars: number): string {
  const normalized = text.replace(/\r\n/g, '\n')
  if (normalized.length <= maxChars) return normalized
  return normalized.slice(0, maxChars)
}

export function buildRagQuery(params: {
  userPromptText: string
  importedFiles?: ImportedFileForRag[]
  maxChars?: number
}): string {
  const maxChars = params.maxChars ?? 2000
  const prompt = (params.userPromptText || '')
    .replace(/\[(image|audio|video|image_url|audio_url|video_url)\]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const pieces: string[] = []
  if (prompt) pieces.push(prompt)

  const imported = (params.importedFiles || [])
    .map((f) => ({ name: f.name, content: (f.content || '').trim() }))
    .filter((f) => f.content.length > 0)
    .map((f) => `【文件：${f.name}】\n${f.content}`)
    .join('\n\n')

  if (imported) pieces.push(imported)

  return clamp(pieces.join('\n\n').trim(), maxChars)
}

