/**
 * scripts/lib/parse-api.ts -- Regex-based TypeScript api.ts parser
 *
 * Extracts interfaces, fields, JSDoc comments, and ERROR_CODES from api.ts files.
 * No AST / no new deps -- pure regex over the source text.
 */

import { readFileSync } from "node:fs";

// ── Output types ────────────────────────────────────────────────────────────

export interface ParsedField {
  name: string;
  type: string; // e.g. "string", "number", "string | null", "string[]"
  optional: boolean; // true when field name has "?"
  description: string; // from JSDoc
}

export interface ParsedInterface {
  name: string;
  fields: ParsedField[];
  extends?: string;
}

export interface ParsedApi {
  interfaces: Map<string, ParsedInterface>;
  errorCodes: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// Strip leading "* " and surrounding block-comment markers from a JSDoc string.
// Returns the joined description text.
function parseJsDoc(raw: string): string {
  return raw
    .replace(/^\/\*\*/, "")
    .replace(/\*\/$/, "")
    .split("\n")
    .map((l) => l.replace(/^\s*\*\s?/, "").trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

// Find the closing brace of a block starting at openIdx (which is on the opening brace).
// Handles nested braces. Returns the index of the matching closing brace.
function findClosingBrace(src: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// ── Field parser ─────────────────────────────────────────────────────────────

// Parse fields from an interface body string (content between the outer braces).
//
// Handles:
//   - Single-line JSDoc: /** description */
//   - Multi-line JSDoc
//   - Optional fields: name?: type
//   - Union types: string | null, "a" | "b"
//   - Array types: string[], Foo[]
//   - Inline object types -- normalized to "object"
//   - Index signatures [key: string]: ... -- skipped
function parseFields(body: string): ParsedField[] {
  const fields: ParsedField[] = [];

  let i = 0;
  let pendingJsDoc = "";

  while (i < body.length) {
    // Skip whitespace
    if (/\s/.test(body[i])) {
      i++;
      continue;
    }

    // JSDoc comment
    if (body.slice(i, i + 3) === "/**") {
      const end = body.indexOf("*/", i + 3);
      if (end === -1) break;
      pendingJsDoc = body.slice(i, end + 2);
      i = end + 2;
      continue;
    }

    // Line comment
    if (body.slice(i, i + 2) === "//") {
      const end = body.indexOf("\n", i);
      i = end === -1 ? body.length : end + 1;
      pendingJsDoc = "";
      continue;
    }

    // Skip index signatures: [key: string]: ...
    if (body[i] === "[") {
      const end = body.indexOf("\n", i);
      i = end === -1 ? body.length : end + 1;
      pendingJsDoc = "";
      continue;
    }

    // Read a field: identifier followed by optional "?", then ":"
    const identMatch = body.slice(i).match(/^([A-Za-z_$][A-Za-z0-9_$]*)(\?)?:/);
    if (!identMatch) {
      // Not a field line -- skip to next newline
      const end = body.indexOf("\n", i);
      i = end === -1 ? body.length : end + 1;
      pendingJsDoc = "";
      continue;
    }

    const fieldName = identMatch[1];
    const optional = identMatch[2] === "?";
    i += identMatch[0].length;

    // Skip whitespace after ":"
    while (i < body.length && body[i] === " ") i++;

    // Read type -- may span until ";" or end of line, but handle nested braces and angle brackets
    let typeStr = "";
    let depth = 0;
    let angleDepth = 0;
    while (i < body.length) {
      const ch = body[i];
      if (ch === "{") {
        depth++;
        typeStr += ch;
        i++;
        continue;
      }
      if (ch === "}") {
        if (depth === 0) break; // end of interface body
        depth--;
        typeStr += ch;
        i++;
        continue;
      }
      if (ch === "<") {
        angleDepth++;
        typeStr += ch;
        i++;
        continue;
      }
      if (ch === ">") {
        angleDepth--;
        typeStr += ch;
        i++;
        continue;
      }
      if (depth === 0 && angleDepth === 0 && (ch === ";" || ch === "\n")) {
        i++; // consume the separator
        break;
      }
      typeStr += ch;
      i++;
    }

    typeStr = typeStr.trim();

    // Inline object types like "{ name: string | null; email: string }" -> "object"
    let normalizedType = typeStr;
    if (normalizedType.startsWith("{")) {
      normalizedType = "object";
    }

    const description = pendingJsDoc ? parseJsDoc(pendingJsDoc) : "";
    pendingJsDoc = "";

    fields.push({
      name: fieldName,
      type: normalizedType,
      optional,
      description,
    });
  }

  return fields;
}

// ── ERROR_CODES parser ───────────────────────────────────────────────────────

// Extract string values from:
//   export const ERROR_CODES = [ "a", "b", ... ] as const;
function parseErrorCodes(src: string): string[] {
  const match = src.match(/export\s+const\s+ERROR_CODES\s*=\s*\[([\s\S]*?)\]\s*as\s+const/);
  if (!match) return [];
  const inner = match[1];
  const codes: string[] = [];
  const re = /"([^"]+)"/g;
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex iteration
  while ((m = re.exec(inner)) !== null) {
    codes.push(m[1]);
  }
  return codes;
}

// ── Interface scanner ────────────────────────────────────────────────────────

// Scan source for "export interface Foo [extends Bar] { ... }" blocks.
function parseInterfaces(src: string): Map<string, ParsedInterface> {
  const interfaces = new Map<string, ParsedInterface>();

  // Match interface declarations
  const re =
    /export\s+interface\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:extends\s+([A-Za-z_$][A-Za-z0-9_$<>, ]*))?\s*\{/g;

  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex iteration
  while ((m = re.exec(src)) !== null) {
    const name = m[1];
    const extendsClause = m[2]?.trim();
    const openBraceIdx = m.index + m[0].length - 1; // points at "{"
    const closeBraceIdx = findClosingBrace(src, openBraceIdx);
    if (closeBraceIdx === -1) continue;

    const body = src.slice(openBraceIdx + 1, closeBraceIdx);
    const fields = parseFields(body);

    interfaces.set(name, {
      name,
      fields,
      ...(extendsClause ? { extends: extendsClause } : {}),
    });
  }

  return interfaces;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse a TypeScript api.ts file and extract interfaces + ERROR_CODES.
 */
export function parseApiFile(filePath: string): ParsedApi {
  const src = readFileSync(filePath, "utf8");
  const interfaces = parseInterfaces(src);
  const errorCodes = parseErrorCodes(src);
  return { interfaces, errorCodes };
}
