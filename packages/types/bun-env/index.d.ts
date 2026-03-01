// SPDX-License-Identifier: Apache-2.0
// Minimal Bun runtime augmentations for tsc compatibility.
// Only declares what tsc can't infer from @types/node alone.
// Full bun-types is intentionally avoided to prevent fetch type conflicts with vitest mocks.

interface ImportMeta {
  /** Absolute path to the directory containing the current file (Bun-specific). */
  readonly dir: string;
  /** Absolute path to the current file (Bun-specific). */
  readonly file: string;
  /** Absolute path to the current file (Bun-specific). */
  readonly path: string;
}
