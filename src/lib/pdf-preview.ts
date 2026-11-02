// Render the first page of a PDF to a dataURL thumbnail.
// Uses pdfjs-dist with a Vite-loaded worker.
import * as pdfjs from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

let workerSet = false;
function ensureWorker() {
  if (workerSet) return;
  (pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  workerSet = true;
}

const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

export async function renderPdfThumbnail(url: string, maxWidth = 200): Promise<string | null> {
  if (cache.has(url)) return cache.get(url)!;
  if (inflight.has(url)) return inflight.get(url)!;
  ensureWorker();
  const p = (async () => {
    try {
      const loadingTask = pdfjs.getDocument({ url });
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1 });
      const scale = Math.min(maxWidth / viewport.width, 1);
      const v = page.getViewport({ scale: Math.max(scale, 0.4) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(v.width);
      canvas.height = Math.ceil(v.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      await page.render({ canvasContext: ctx, viewport: v, canvas }).promise;
      const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
      cache.set(url, dataUrl);
      return dataUrl;
    } catch (e) {
      console.warn("PDF thumbnail failed", e);
      return null;
    } finally {
      inflight.delete(url);
    }
  })();
  inflight.set(url, p);
  return p;
}

// Render the first N pages of a PDF to dataURL images (works reliably on mobile,
// where inline <iframe> PDF rendering is blocked).
const pagesCache = new Map<string, string[]>();

export async function renderPdfPages(
  url: string,
  maxPages = 5,
  targetWidth = 900,
): Promise<string[]> {
  const key = `${url}|${maxPages}|${targetWidth}`;
  if (pagesCache.has(key)) return pagesCache.get(key)!;
  ensureWorker();
  try {
    const pdf = await pdfjs.getDocument({ url }).promise;
    const count = Math.min(pdf.numPages, maxPages);
    const out: string[] = [];
    for (let i = 1; i <= count; i++) {
      const page = await pdf.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(targetWidth / base.width, 2);
      const v = page.getViewport({ scale: Math.max(scale, 0.8) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(v.width);
      canvas.height = Math.ceil(v.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) break;
      await page.render({ canvasContext: ctx, viewport: v, canvas }).promise;
      out.push(canvas.toDataURL("image/jpeg", 0.82));
    }
    pagesCache.set(key, out);
    return out;
  } catch (e) {
    console.warn("PDF page render failed", e);
    return [];
  }
}
