import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'

import type { EditalFileClassification } from '../../../lib/ai/edital-schema'

GlobalWorkerOptions.workerSrc =
  'https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs'

export interface ExtractEditalTextResult {
  textContent: string
  textPreview: string
  pageCount: number | null
  warnings: string[]
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function buildPreview(textContent: string): string {
  return compactWhitespace(textContent).slice(0, 2000)
}

async function extractPdfText(file: File): Promise<ExtractEditalTextResult> {
  const buffer = await file.arrayBuffer()
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
  })

  const pdf = await loadingTask.promise

  try {
    const pages: string[] = []

    for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
      const page = await pdf.getPage(pageIndex)
      const textContent = await page.getTextContent()
      const pageText = textContent.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')

      pages.push(compactWhitespace(pageText))
    }

    const textContent = pages.filter(Boolean).join('\n\n')

    return {
      textContent,
      textPreview: buildPreview(textContent),
      pageCount: pdf.numPages,
      warnings:
        textContent.length > 0
          ? []
          : ['O PDF foi lido, mas não retornou texto extraível localmente.'],
    }
  } finally {
    await loadingTask.destroy()
  }
}

async function extractTextLikeFile(file: File): Promise<ExtractEditalTextResult> {
  const textContent = compactWhitespace(await file.text())

  return {
    textContent,
    textPreview: buildPreview(textContent),
    pageCount: null,
    warnings:
      textContent.length > 0
        ? []
        : ['O arquivo de texto foi lido, mas não continha conteúdo útil.'],
  }
}

export async function extractEditalText(
  file: File,
  classification: EditalFileClassification,
): Promise<ExtractEditalTextResult> {
  try {
    switch (classification.format) {
      case 'pdf':
        return await extractPdfText(file)
      case 'text':
      case 'markdown':
      case 'html':
        return await extractTextLikeFile(file)
      case 'image':
        return {
          textContent: '',
          textPreview: '',
          pageCount: null,
          warnings: ['Imagem detectada; a ingestão local não faz OCR nesta etapa.'],
        }
      case 'doc':
        return {
          textContent: '',
          textPreview: '',
          pageCount: null,
          warnings: ['Documento Office detectado; converta para PDF ou texto para melhor extração local.'],
        }
      default:
        return {
          textContent: '',
          textPreview: '',
          pageCount: null,
          warnings: ['Formato não suportado para extração local de texto.'],
        }
    }
  } catch (error) {
    return {
      textContent: '',
      textPreview: '',
      pageCount: null,
      warnings: [
        `Falha na extração local do arquivo: ${
          error instanceof Error ? error.message : 'erro desconhecido'
        }`,
      ],
    }
  }
}
