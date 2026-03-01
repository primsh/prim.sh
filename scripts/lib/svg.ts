// SPDX-License-Identifier: Apache-2.0
/**
 * svg.ts — SVG utility functions
 *
 * Shared helpers for SVG → PNG rasterization, file writing with check mode,
 * and HTML escaping for SVG text content.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";

/** HTML-escape a string for use in SVG text content. */
export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Rasterize an SVG string to PNG at the given width.
 * Returns null if @resvg/resvg-js is not installed (optional dependency).
 */
export async function svgToPng(
  svg: string,
  width: number,
  opts?: { loadSystemFonts?: boolean },
): Promise<Buffer | null> {
  try {
    const { Resvg } = await import("@resvg/resvg-js");
    const resvg = new Resvg(svg, {
      fitTo: { mode: "width" as const, value: width },
      font: { loadSystemFonts: opts?.loadSystemFonts ?? false },
    });
    return Buffer.from(resvg.render().asPng());
  } catch {
    return null;
  }
}

/**
 * Write content to a file, or verify it matches in check mode.
 * Returns true if file is up to date (or was written), false if stale/missing.
 */
export function writeOrCheck(
  filePath: string,
  content: string | Buffer,
  checkMode: boolean,
): boolean {
  if (checkMode) {
    if (!existsSync(filePath)) {
      console.error(`  MISSING: ${filePath}`);
      return false;
    }
    const existing = readFileSync(filePath);
    const buf = typeof content === "string" ? Buffer.from(content) : content;
    if (!existing.equals(buf)) {
      console.error(`  STALE: ${filePath}`);
      return false;
    }
    return true;
  }
  writeFileSync(filePath, content);
  return true;
}
