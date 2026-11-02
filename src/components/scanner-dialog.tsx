import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, Trash2, Loader2, Sparkles, Check, X } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import { detectQuad, warpQuad } from "@/lib/doc-detect";

type Page = { dataUrl: string; width: number; height: number };

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onScanned: (file: File, suggestedTitle: string) => void;
};

/** Auto-enhance: white balance + contrast boost so paper looks clean. */
function enhance(canvas: HTMLCanvasElement, mode: "color" | "bw"): string {
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas.toDataURL("image/jpeg", 0.9);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;

  // Find ~95th percentile brightness to use as "paper white"
  const samples: number[] = [];
  const step = Math.max(1, Math.floor(d.length / 4 / 4000));
  for (let i = 0; i < d.length; i += 4 * step) {
    samples.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
  }
  samples.sort((a, b) => a - b);
  const white = Math.max(180, samples[Math.floor(samples.length * 0.95)] || 220);
  const black = Math.min(80, samples[Math.floor(samples.length * 0.05)] || 30);
  const range = Math.max(1, white - black);

  for (let i = 0; i < d.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      let v = ((d[i + c] - black) / range) * 255;
      v = Math.max(0, Math.min(255, v));
      // Slight contrast curve
      v = v < 128 ? v * 0.92 : v + (255 - v) * 0.15;
      d[i + c] = v;
    }
    if (mode === "bw") {
      const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      d[i] = d[i + 1] = d[i + 2] = g;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.85);
}

export function ScannerDialog({ open, onOpenChange, onScanned }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [mode, setMode] = useState<"color" | "bw">("color");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Page | null>(null);

  // Start camera when dialog opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setReady(false);
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play();
          setReady(true);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Camera unavailable");
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open]);

  const capture = () => {
    const v = videoRef.current;
    if (!v || !ready) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0);

    // Try to detect the page edges and warp to a flat rectangle
    let cropped: HTMLCanvasElement = canvas;
    let detected = false;
    try {
      const quad = detectQuad(canvas);
      if (quad) {
        cropped = warpQuad(canvas, quad);
        detected = true;
      }
    } catch (e) {
      console.warn("edge detection failed", e);
    }

    const dataUrl = enhance(cropped, mode);
    setPages((p) => [...p, { dataUrl, width: cropped.width, height: cropped.height }]);
    if (detected) toast.success("Edges detected — cropped & straightened");
    else toast.message("Captured (no clear edges found — kept full frame)");
  };

  const remove = (i: number) => setPages((p) => p.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => setPages((p) => {
    const j = i + dir;
    if (j < 0 || j >= p.length) return p;
    const out = [...p];
    [out[i], out[j]] = [out[j], out[i]];
    return out;
  });

  const finish = async () => {
    if (!pages.length) return;
    setBusy(true);
    try {
      const pdf = new jsPDF({ unit: "pt", format: "a4", compress: true });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      pages.forEach((pg, idx) => {
        if (idx > 0) pdf.addPage();
        const ratio = Math.min(pageW / pg.width, pageH / pg.height);
        const w = pg.width * ratio;
        const h = pg.height * ratio;
        const x = (pageW - w) / 2;
        const y = (pageH - h) / 2;
        pdf.addImage(pg.dataUrl, "JPEG", x, y, w, h, undefined, "FAST");
      });
      const blob = pdf.output("blob");
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const file = new File([blob], `scan-${ts}.pdf`, { type: "application/pdf" });
      onScanned(file, `Scan ${new Date().toLocaleDateString()}`);
      setPages([]);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create PDF");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) setPages([]); onOpenChange(v); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Scan document</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="relative overflow-hidden rounded-lg bg-black aspect-[4/3]">
              <video ref={videoRef} playsInline muted className="h-full w-full object-contain" />
              {!ready && !error && (
                <div className="absolute inset-0 grid place-items-center text-white/70 text-sm">
                  <div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Starting camera…</div>
                </div>
              )}
              {error && (
                <div className="absolute inset-0 grid place-items-center p-4 text-center text-white/80 text-sm">
                  Camera couldn't start: {error}
                </div>
              )}
              {/* Document frame guide */}
              {ready && <div className="pointer-events-none absolute inset-6 rounded-md border-2 border-dashed border-white/40" />}
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex gap-1 rounded-lg bg-muted p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setMode("color")}
                  className={`rounded-md px-3 py-1.5 ${mode === "color" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                >Color</button>
                <button
                  type="button"
                  onClick={() => setMode("bw")}
                  className={`rounded-md px-3 py-1.5 ${mode === "bw" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                >B&amp;W</button>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" /> Auto-enhance on
              </div>
              <Button onClick={capture} disabled={!ready} size="lg" className="gap-2">
                <Camera className="h-4 w-4" /> Capture
              </Button>
            </div>

            {pages.length > 0 && (
              <div>
                <div className="mb-2 text-xs font-medium text-muted-foreground">{pages.length} page{pages.length > 1 ? "s" : ""} captured · tap to preview</div>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {pages.map((p, i) => (
                    <div key={i} className="group relative shrink-0">
                      <button type="button" onClick={() => setPreview(p)} className="block">
                        <img src={p.dataUrl} alt={`Page ${i + 1}`} className="h-24 w-20 rounded-md border border-border object-cover" />
                      </button>
                      <div className="absolute -top-1 -right-1 flex gap-0.5 opacity-0 transition group-hover:opacity-100">
                        <button type="button" onClick={() => move(i, -1)} className="grid h-5 w-5 place-items-center rounded-full bg-background shadow text-[10px] border" aria-label="Move left">‹</button>
                        <button type="button" onClick={() => move(i, 1)} className="grid h-5 w-5 place-items-center rounded-full bg-background shadow text-[10px] border" aria-label="Move right">›</button>
                        <button type="button" onClick={() => remove(i)} className="grid h-5 w-5 place-items-center rounded-full bg-destructive text-destructive-foreground shadow" aria-label="Remove">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="mt-1 text-center text-[10px] text-muted-foreground">{i + 1}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button onClick={finish} disabled={!pages.length || busy} className="gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Save as PDF ({pages.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!preview} onOpenChange={(v) => !v && setPreview(null)}>
        <DialogContent className="max-w-2xl p-2">
          {preview && (
            <div className="relative">
              <img src={preview.dataUrl} alt="Preview" className="max-h-[80vh] w-full rounded object-contain" />
              <Button size="icon" variant="secondary" className="absolute right-2 top-2" onClick={() => setPreview(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
