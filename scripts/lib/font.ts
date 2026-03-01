// SPDX-License-Identifier: Apache-2.0
/**
 * font.ts — SF Mono glyph extraction utilities
 *
 * Shared by gen-brand-assets.ts, gen-og-images.ts, and gen-terminal-world.ts.
 * Extracts vector paths from SF Mono via opentype.js for SVG rendering.
 */

import opentype from "opentype.js";

export const FONT_PATH =
  "/Applications/Xcode.app/Contents/SharedFrameworks/DVTUserInterfaceKit.framework/Versions/A/Resources/Fonts/SF-Mono.ttf";

export interface Viewport {
  w: number;
  h: number;
  cx?: number;
  cy?: number;
  pad: number;
}

/** Load SF Mono from Xcode. Throws with a clear message if not found. */
export function loadSFMono(): opentype.Font {
  try {
    return opentype.loadSync(FONT_PATH);
  } catch {
    throw new Error(
      `SF Mono not found at ${FONT_PATH}\nInstall Xcode or Xcode Command Line Tools to get SF Mono.`,
    );
  }
}

/** Convert opentype.js path commands to an SVG `d` attribute string. */
// biome-ignore lint/suspicious/noExplicitAny: opentype.js command types are untyped
export function cmdToD(commands: any[], scale: number, ox: number, oy: number): string {
  const tx = (x: number) => (x * scale + ox).toFixed(1);
  const ty = (y: number) => (y * scale + oy).toFixed(1);
  let d = "";
  for (const c of commands) {
    switch (c.type) {
      case "M":
        d += `M${tx(c.x)} ${ty(c.y)}`;
        break;
      case "L":
        d += `L${tx(c.x)} ${ty(c.y)}`;
        break;
      case "Q":
        d += `Q${tx(c.x1)} ${ty(c.y1)} ${tx(c.x)} ${ty(c.y)}`;
        break;
      case "C":
        d += `C${tx(c.x1)} ${ty(c.y1)} ${tx(c.x2)} ${ty(c.y2)} ${tx(c.x)} ${ty(c.y)}`;
        break;
      case "Z":
        d += "Z";
        break;
    }
  }
  return d;
}

/** Extract a single glyph from SF Mono, scaled and centered in the viewport. */
export function extractGlyph(
  font: opentype.Font,
  char: string,
  viewport: Viewport,
): string {
  const { w, h, pad } = viewport;
  const cx = viewport.cx ?? w / 2;
  const cy = viewport.cy ?? h / 2;

  const refSize = 200;
  const path = font.getPath(char, 0, 0, refSize);
  const bb = path.getBoundingBox();
  const gW = bb.x2 - bb.x1;
  const gH = bb.y2 - bb.y1;

  const maxW = w - pad * 2;
  const maxH = h - pad * 2;
  const scale = Math.min(maxW / gW, maxH / gH);

  const ox = cx - (bb.x1 * scale + (gW * scale) / 2);
  const oy = cy - (bb.y1 * scale + (gH * scale) / 2);
  return cmdToD(path.commands, scale, ox, oy);
}

/**
 * Extract multiple characters as a single composed path.
 * Characters are placed with monospace spacing, then the group is centered in the viewport.
 */
export function extractGlyphs(
  font: opentype.Font,
  chars: string,
  viewport: Viewport,
): string {
  const { w, h, pad } = viewport;
  const cx = viewport.cx ?? w / 2;
  const cy = viewport.cy ?? h / 2;

  const refSize = 200;
  // Get individual glyph bounding boxes to compute total width with spacing
  const glyphData: { path: opentype.Path; bb: opentype.BoundingBox }[] = [];
  for (const char of chars) {
    const path = font.getPath(char, 0, 0, refSize);
    glyphData.push({ path, bb: path.getBoundingBox() });
  }

  // Use the advance width of a monospace char for spacing
  const glyph = font.charToGlyph(">");
  const advanceWidth = (glyph.advanceWidth ?? refSize * 0.6) * (refSize / font.unitsPerEm);

  // Compute total width using advance width for all but last char
  const lastBb = glyphData[glyphData.length - 1].bb;
  const totalWidth =
    advanceWidth * (chars.length - 1) + (lastBb.x2 - lastBb.x1);

  // Get max height across all glyphs
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const { bb } of glyphData) {
    minY = Math.min(minY, bb.y1);
    maxY = Math.max(maxY, bb.y2);
  }
  const totalHeight = maxY - minY;

  const maxW = w - pad * 2;
  const maxH = h - pad * 2;
  const scale = Math.min(maxW / totalWidth, maxH / totalHeight);

  // Center the composed group
  const groupW = totalWidth * scale;
  const groupH = totalHeight * scale;
  const baseOx = cx - groupW / 2;
  const baseOy = cy - groupH / 2;

  let d = "";
  for (let i = 0; i < glyphData.length; i++) {
    const { path, bb } = glyphData[i];
    const charOx = baseOx + advanceWidth * i * scale - bb.x1 * scale;
    const charOy = baseOy - minY * scale;
    d += cmdToD(path.commands, scale, charOx, charOy);
  }

  return d;
}
