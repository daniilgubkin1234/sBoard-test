import { loadCanvasKit } from 'html2pdf-skia';
import pdfWasmUrl from 'html2pdf-skia/lib/wasm/canvaskit-pdf.wasm?url';

export type SkiaKit = Awaited<ReturnType<typeof loadCanvasKit>>;

let cachedKit: Promise<SkiaKit> | null = null;

export function loadSkiaKit(): Promise<SkiaKit> {
  cachedKit ??= loadCanvasKit({
    wasmBinaryUrl: pdfWasmUrl,
    timeout: 30_000,
    verbose: false,
  });

  return cachedKit;
}
