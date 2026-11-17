// pdfmake 0.3 ships no type declarations; only what reportPdf.ts calls is declared (the document definition is built by our own code and checked by its tests).
declare module 'pdfmake/build/pdfmake' {
  interface PdfMakeDocument { getBlob(): Promise<Blob> }
  interface PdfMake {
    addVirtualFileSystem(vfs: Record<string, string>): void
    createPdf(definition: unknown): PdfMakeDocument
  }
  const pdfMake: PdfMake
  export default pdfMake
}
declare module 'pdfmake/build/vfs_fonts' {
  const vfs: Record<string, string>
  export default vfs
}
