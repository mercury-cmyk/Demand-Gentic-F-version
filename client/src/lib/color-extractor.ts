/**
 * Extract dominant colors from an image URL using Canvas.
 * Tries direct CORS loading first, then falls back to a server-side proxy
 * for external images that don't send CORS headers.
 */

interface ExtractedColor {
  hex: string;
  rgb: [number, number, number];
  count: number;
  percentage: number;
}

/**
 * Load an image with CORS support and return an HTMLImageElement.
 */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image. Ensure the URL is accessible.'));
    img.src = url;
  });
}

/**
 * Fetch the image via server-side proxy (bypasses CORS).
 * Returns a data URI that can be loaded into an Image element.
 */
async function loadImageViaProxy(url: string): Promise<HTMLImageElement> {
  const token = localStorage.getItem('clientPortalToken');
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const proxyUrl = `/api/client-portal/settings/image-proxy?url=${encodeURIComponent(url)}`;
  const res = await fetch(proxyUrl, { headers });

  if (!res.ok) {
    throw new Error(`Proxy fetch failed: ${res.status}`);
  }

  const data = await res.json();
  if (!data.dataUri) {
    throw new Error('No data URI returned from proxy');
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode proxied image'));
    img.src = data.dataUri;
  });
}

/**
 * Convert RGB to hex string.
 */
function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');
}

/**
 * Calculate color distance (simple Euclidean in RGB space).
 */
function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt(
    (a[0] - b[0]) ** 2 +
    (a[1] - b[1]) ** 2 +
    (a[2] - b[2]) ** 2
  );
}

/**
 * Quantize a color channel to reduce the palette (group similar colors).
 */
function quantize(value: number, levels: number): number {
  const step = 256 / levels;
  return Math.min(255, Math.round(Math.floor(value / step) * step + step / 2));
}

/**
 * Check if a color is too close to white or too close to black
 * (these are usually background, not brand colors).
 */
function isNeutral(r: number, g: number, b: number): boolean {
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  // Skip very bright (near-white) and very dark (near-black)
  if (brightness > 240 || brightness < 15) return true;
  // Skip grays (low saturation)
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max === 0 ? 0 : (max - min) / max;
  if (saturation < 0.1 && brightness > 30 && brightness < 225) return true;
  return false;
}

/**
 * Extract pixel colors from an image element using canvas.
 * May throw SecurityError if the image is cross-origin and tainted.
 */
function extractPixelColors(img: HTMLImageElement, maxColors: number): ExtractedColor[] {
  // Scale down for performance (max 100px on longest side)
  const scale = Math.min(1, 100 / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);

  // This line throws SecurityError if the canvas is tainted by CORS
  const imageData = ctx.getImageData(0, 0, w, h);
  const pixels = imageData.data;

  // Quantize and count colors
  const colorMap = new Map<string, { rgb: [number, number, number]; count: number }>();
  const levels = 8; // quantization levels per channel
  let totalCounted = 0;

  for (let i = 0; i < pixels.length; i += 4) {
    const a = pixels[i + 3];
    if (a < 128) continue; // skip transparent pixels

    const r = quantize(pixels[i], levels);
    const g = quantize(pixels[i + 1], levels);
    const b = quantize(pixels[i + 2], levels);

    if (isNeutral(r, g, b)) continue;

    const key = `${r},${g},${b}`;
    const existing = colorMap.get(key);
    if (existing) {
      existing.count++;
    } else {
      colorMap.set(key, { rgb: [r, g, b], count: 1 });
    }
    totalCounted++;
  }

  // Sort by frequency
  const sorted = Array.from(colorMap.values()).sort((a, b) => b.count - a.count);

  // Merge colors that are too similar (within distance 40)
  const merged: { rgb: [number, number, number]; count: number }[] = [];
  for (const color of sorted) {
    const similar = merged.find((m) => colorDistance(m.rgb, color.rgb) < 40);
    if (similar) {
      similar.count += color.count;
    } else {
      merged.push({ ...color });
    }
    if (merged.length >= maxColors * 2) break; // enough candidates
  }

  // Re-sort after merging
  merged.sort((a, b) => b.count - a.count);

  const total = totalCounted || 1;
  return merged.slice(0, maxColors).map((c) => ({
    hex: rgbToHex(c.rgb[0], c.rgb[1], c.rgb[2]),
    rgb: c.rgb,
    count: c.count,
    percentage: Math.round((c.count / total) * 100),
  }));
}

/**
 * Extract the top N dominant colors from an image URL.
 * Returns sorted by frequency (most dominant first).
 *
 * Tries direct CORS loading first. If the image server doesn't allow
 * cross-origin access (canvas becomes tainted), falls back to a
 * server-side proxy that returns the image as a base64 data URI.
 */
export async function extractColorsFromImage(
  imageUrl: string,
  maxColors: number = 6,
): Promise<ExtractedColor[]> {
  // Attempt 1: Direct load with CORS
  try {
    const img = await loadImage(imageUrl);
    return extractPixelColors(img, maxColors);
  } catch {
    // CORS blocked or image failed to load — try proxy
  }

  // Attempt 2: Server-side proxy (bypasses CORS)
  const img = await loadImageViaProxy(imageUrl);
  return extractPixelColors(img, maxColors);
}
