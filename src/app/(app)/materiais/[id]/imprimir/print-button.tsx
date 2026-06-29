'use client'

import { Download, Printer } from 'lucide-react'

export function PrintButton() {
  return (
    <button className="button-primary" onClick={() => window.print()}>
      <Printer className="size-4" />
      Imprimir ou salvar PDF
      <Download className="size-4" />
    </button>
  )
}
