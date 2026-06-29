import {
  createEmptyEditalExtraction,
  type EditalAiRequest,
  type EditalAiResponse,
  type EditalExtraction,
  type EditalFileClassification,
} from '../../../lib/ai/edital-schema'
import { extractEditalHeuristically } from '../../edital-review/lib/heuristic-edital-extraction'
import { classifyEditalFile } from './classify-edital-file'
import { extractEditalText } from './extract-edital-text'

export interface IngestEditalFileOptions {
  file: File
  remoteExtraction?: (request: EditalAiRequest) => Promise<EditalAiResponse>
}

export interface IngestEditalFileResult {
  classification: EditalFileClassification
  textContent: string
  textPreview: string
  pageCount: number | null
  heuristicExtraction: EditalExtraction
  extraction: EditalExtraction
  provider: EditalAiResponse['provider']
  warnings: string[]
}

function shouldSendFileToRemote(
  file: File,
  classification: EditalFileClassification,
  textContent: string,
): boolean {
  const maxVisionBytes = 12 * 1024 * 1024

  return (
    file.size <= maxVisionBytes &&
    (classification.format === 'image' ||
      classification.isScannedCandidate ||
      textContent.trim().length < 180)
  )
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''

  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index])
  }

  return btoa(binary)
}

export async function ingestEditalFile(
  options: IngestEditalFileOptions,
): Promise<IngestEditalFileResult> {
  const initialClassification = classifyEditalFile({
    fileName: options.file.name,
    mimeType: options.file.type || null,
    fileSizeBytes: options.file.size,
  })

  const extractedText = await extractEditalText(options.file, initialClassification)
  const refinedClassification = classifyEditalFile({
    fileName: options.file.name,
    mimeType: options.file.type || null,
    fileSizeBytes: options.file.size,
    textPreview: extractedText.textPreview,
  })

  const heuristicExtraction =
    extractedText.textContent.length > 0
      ? extractEditalHeuristically({
          textContent: extractedText.textContent,
          fileName: options.file.name,
          classification: refinedClassification,
        })
      : createEmptyEditalExtraction(refinedClassification.documentKind)

  if (extractedText.textContent.length === 0) {
    heuristicExtraction.warnings.push('Sem texto local suficiente para extrair o edital.')
  }

  const warnings = [...extractedText.warnings, ...heuristicExtraction.warnings]
  const fileData = shouldSendFileToRemote(
    options.file,
    refinedClassification,
    extractedText.textContent,
  )
    ? {
        mimeType: options.file.type || 'application/octet-stream',
        base64: await fileToBase64(options.file),
      }
    : null

  if (!options.remoteExtraction || (extractedText.textContent.length === 0 && !fileData)) {
    return {
      classification: refinedClassification,
      textContent: extractedText.textContent,
      textPreview: extractedText.textPreview,
      pageCount: extractedText.pageCount,
      heuristicExtraction,
      extraction: heuristicExtraction,
      provider: extractedText.textContent.length > 0 ? 'heuristic' : 'none',
      warnings,
    }
  }

  try {
    const remoteResponse = await options.remoteExtraction({
      action: 'extract_edital',
      payload: {
        fileName: options.file.name,
        mimeType: options.file.type || null,
        fileSizeBytes: options.file.size,
        textContent: extractedText.textContent,
        textPreview: extractedText.textPreview,
        fileData,
        classification: refinedClassification,
        heuristicExtraction,
      },
    })

    return {
      classification: refinedClassification,
      textContent: extractedText.textContent,
      textPreview: extractedText.textPreview,
      pageCount: extractedText.pageCount,
      heuristicExtraction,
      extraction: remoteResponse.extraction,
      provider: remoteResponse.provider,
      warnings: [...warnings, ...remoteResponse.warnings],
    }
  } catch (error) {
    const failureMessage =
      error instanceof Error ? error.message : 'falha desconhecida na extração remota'

    return {
      classification: refinedClassification,
      textContent: extractedText.textContent,
      textPreview: extractedText.textPreview,
      pageCount: extractedText.pageCount,
      heuristicExtraction,
      extraction: heuristicExtraction,
      provider: 'heuristic',
      warnings: [...warnings, `Extração remota indisponível: ${failureMessage}`],
    }
  }
}
