/**
 * Result parser — extracts structured sections from Playwright tool results.
 */

export type ParsedSection = {
  type: 'header' | 'code' | 'text' | 'snapshot'
  title?: string | undefined
  language?: string | undefined
  content: string
}

export const extractTextContent = (raw: string): string => {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item): item is { type: string; text: string } =>
          typeof item === 'object' && item !== null && 'text' in item)
        .map((item) => item.text)
        .join('\n')
    }
  } catch {
    // not JSON, use as-is
  }
  return raw
}

const parseCodeBlock = (lines: string[], startIdx: number, language: string): { section: ParsedSection; nextIndex: number } => {
  const isSnapshot = language === 'yaml' || language === 'accessibilitytree'
  const codeLines: string[] = []
  let i = startIdx

  while (i < lines.length && !lines[i]!.startsWith('```')) {
    codeLines.push(lines[i]!)
    i++
  }
  if (i < lines.length) i++ // skip closing ```

  return {
    section: {
      type: isSnapshot ? 'snapshot' : 'code',
      language: language || undefined,
      title: isSnapshot ? 'Page Snapshot' : undefined,
      content: codeLines.join('\n'),
    },
    nextIndex: i,
  }
}

export const parseSections = (text: string): ParsedSection[] => {
  const sections: ParsedSection[] = []
  const lines = text.split('\n')
  let i = 0

  while (i < lines.length) {
    const line = lines[i]!

    if (line.startsWith('### ')) {
      sections.push({ type: 'header', content: line.slice(4) })
      i++
      continue
    }

    if (line.startsWith('```')) {
      const { section, nextIndex } = parseCodeBlock(lines, i + 1, line.slice(3).trim())
      sections.push(section)
      i = nextIndex
      continue
    }

    if (line.trim().length > 0) {
      const textLines: string[] = [line]
      i++
      while (i < lines.length && !lines[i]!.startsWith('###') && !lines[i]!.startsWith('```') && lines[i]!.trim().length > 0) {
        textLines.push(lines[i]!)
        i++
      }
      sections.push({ type: 'text', content: textLines.join('\n') })
      continue
    }

    i++
  }

  return sections
}
