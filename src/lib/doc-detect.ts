// Lightweight document edge detection + perspective correction.
// Pure JS, no opencv. Works well when the page is brighter than the
// background (the common case for phone scans on a desk).

export type Quad = { tl: P; tr: P; br: P; bl: P };
type P = { x: number; y: number };

const ANALYSIS_W = 480;

/** Detect the page quad in image coords. Returns null if no confident quad. */
export function detectQuad(source: HTMLCanvasElement): Quad | null {
  const sw = source.width;
  const sh = source.height;
  const scale = ANALYSIS_W / sw;
  const w = ANALYSIS_W;
  const h = Math.round(sh * scale);

  // Downscale to a small analysis canvas
  const small = document.createElement("canvas");
  small.width = w;
  small.height = h;
  const sctx = small.getContext("2d");
  if (!sctx) return null;
  sctx.drawImage(source, 0, 0, w, h);
  const { data } = sctx.getImageData(0, 0, w, h);

  // Grayscale
  const gray = new Uint8ClampedArray(w * h);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    gray[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }

  // 3x3 box blur to reduce texture noise
  const blurred = boxBlur(gray, w, h);

  // Otsu threshold — page (bright) vs background (dark)
  const t = otsu(blurred);
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < blurred.length; i++) mask[i] = blurred[i] > t ? 1 : 0;

  // Largest connected component of bright pixels
  const region = largestComponent(mask, w, h);
  if (!region || region.points.length < (w * h) * 0.08) return null;

  // Reject if the region hugs all 4 borders — likely the background is bright
  const margin = 4;
  const touchesL = region.minX <= margin;
  const touchesR = region.maxX >= w - margin - 1;
  const touchesT = region.minY <= margin;
  const touchesB = region.maxY >= h - margin - 1;
  if (touchesL && touchesR && touchesT && touchesB) return null;

  // Find 4 extreme corners using sum/diff heuristic
  let tl = region.points[0], tr = region.points[0], br = region.points[0], bl = region.points[0];
  let minSum = Infinity, maxSum = -Infinity, minDiff = Infinity, maxDiff = -Infinity;
  for (const p of region.points) {
    const s = p.x + p.y;
    const d = p.x - p.y;
    if (s < minSum) { minSum = s; tl = p; }
    if (s > maxSum) { maxSum = s; br = p; }
    if (d > maxDiff) { maxDiff = d; tr = p; }
    if (d < minDiff) { minDiff = d; bl = p; }
  }

  // Sanity: the quad must cover a reasonable area
  const area = quadArea(tl, tr, br, bl);
  if (area < w * h * 0.1) return null;

  // Scale back to source coords
  const up = (p: P): P => ({ x: p.x / scale, y: p.y / scale });
  return { tl: up(tl), tr: up(tr), br: up(br), bl: up(bl) };
}

/** Warp the quad to a flat rectangle on a new canvas. */
export function warpQuad(source: HTMLCanvasElement, q: Quad): HTMLCanvasElement {
  // Output dimensions = max of opposite edges
  const wTop = dist(q.tl, q.tr);
  const wBot = dist(q.bl, q.br);
  const hLeft = dist(q.tl, q.bl);
  const hRight = dist(q.tr, q.br);
  const outW = Math.max(64, Math.round(Math.max(wTop, wBot)));
  const outH = Math.max(64, Math.round(Math.max(hLeft, hRight)));

  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const octx = out.getContext("2d");
  if (!octx) return source;

  // Compute homography from output rect -> source quad
  const H = solveHomography(
    [{ x: 0, y: 0 }, { x: outW, y: 0 }, { x: outW, y: outH }, { x: 0, y: outH }],
    [q.tl, q.tr, q.br, q.bl],
  );
  if (!H) return source;

  const sctx = source.getContext("2d");
  if (!sctx) return source;
  const src = sctx.getImageData(0, 0, source.width, source.height);
  const dst = octx.createImageData(outW, outH);

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const denom = H[6] * x + H[7] * y + 1;
      const sx = (H[0] * x + H[1] * y + H[2]) / denom;
      const sy = (H[3] * x + H[4] * y + H[5]) / denom;
      const px = sampleBilinear(src, sx, sy);
      const di = (y * outW + x) * 4;
      dst.data[di] = px[0];
      dst.data[di + 1] = px[1];
      dst.data[di + 2] = px[2];
      dst.data[di + 3] = 255;
    }
  }
  octx.putImageData(dst, 0, 0);
  return out;
}

// ---------------- helpers ----------------

function boxBlur(src: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) s += src[(y + dy) * w + (x + dx)];
      out[y * w + x] = s / 9;
    }
  }
  return out;
}

function otsu(g: Uint8ClampedArray): number {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < g.length; i++) hist[g[i]]++;
  const total = g.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, max = 0, threshold = 127;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > max) { max = between; threshold = i; }
  }
  return threshold;
}

function largestComponent(mask: Uint8Array, w: number, h: number) {
  const seen = new Uint8Array(mask.length);
  let best: { points: P[]; minX: number; minY: number; maxX: number; maxY: number } | null = null;
  const stack: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (seen[idx] || !mask[idx]) continue;
      // BFS
      stack.length = 0;
      stack.push(idx);
      seen[idx] = 1;
      const pts: P[] = [];
      let minX = x, minY = y, maxX = x, maxY = y;
      while (stack.length) {
        const i = stack.pop()!;
        const px = i % w, py = (i - px) / w;
        pts.push({ x: px, y: py });
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
        if (px > 0 && !seen[i - 1] && mask[i - 1]) { seen[i - 1] = 1; stack.push(i - 1); }
        if (px < w - 1 && !seen[i + 1] && mask[i + 1]) { seen[i + 1] = 1; stack.push(i + 1); }
        if (py > 0 && !seen[i - w] && mask[i - w]) { seen[i - w] = 1; stack.push(i - w); }
        if (py < h - 1 && !seen[i + w] && mask[i + w]) { seen[i + w] = 1; stack.push(i + w); }
      }
      if (!best || pts.length > best.points.length) best = { points: pts, minX, minY, maxX, maxY };
    }
  }
  return best;
}

function dist(a: P, b: P) { return Math.hypot(a.x - b.x, a.y - b.y); }

function quadArea(a: P, b: P, c: P, d: P) {
  return Math.abs((a.x * b.y - b.x * a.y) + (b.x * c.y - c.x * b.y) + (c.x * d.y - d.x * c.y) + (d.x * a.y - a.x * d.y)) / 2;
}

function sampleBilinear(img: ImageData, x: number, y: number): [number, number, number] {
  const w = img.width, h = img.height;
  if (x < 0 || y < 0 || x >= w - 1 || y >= h - 1) return [255, 255, 255];
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const i00 = (y0 * w + x0) * 4;
  const i10 = i00 + 4;
  const i01 = i00 + w * 4;
  const i11 = i01 + 4;
  const d = img.data;
  const out: [number, number, number] = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    out[c] =
      d[i00 + c] * (1 - fx) * (1 - fy) +
      d[i10 + c] * fx * (1 - fy) +
      d[i01 + c] * (1 - fx) * fy +
      d[i11 + c] * fx * fy;
  }
  return out;
}

/** Solve 3x3 homography mapping src -> dst (4 point pairs). Returns 8 entries (H33=1). */
function solveHomography(src: P[], dst: P[]): number[] | null {
  // Build 8x8 system
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x: X, y: Y } = src[i];
    const { x: u, y: v } = dst[i];
    A.push([X, Y, 1, 0, 0, 0, -u * X, -u * Y]);
    b.push(u);
    A.push([0, 0, 0, X, Y, 1, -v * X, -v * Y]);
    b.push(v);
  }
  return solve(A, b);
}

function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  // Augment
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    // Pivot
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-9) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    // Eliminate
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  const x = new Array(n);
  for (let i = 0; i < n; i++) x[i] = M[i][n] / M[i][i];
  return x;
}
