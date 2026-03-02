// SPDX-License-Identifier: Apache-2.0
/**
 * gemini.ts — Shared Gemini image-to-image API call
 */

const MODELS = {
  flash: "gemini-3.1-flash-image-preview",
  pro: "gemini-3-pro-image-preview",
} as const;

export type GeminiModel = keyof typeof MODELS;

export function getGeminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!key) throw new Error("Set GEMINI_API_KEY or GOOGLE_API_KEY");
  return key;
}

/**
 * Call Gemini image-to-image: send a PNG + text prompt, get a PNG back.
 */
export async function callGeminiImageToImage(
  inputPng: Buffer,
  prompt: string,
  opts?: { model?: GeminiModel },
): Promise<Buffer> {
  const apiKey = getGeminiApiKey();
  const modelKey = opts?.model ?? "flash";
  const modelId = MODELS[modelKey];
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`;

  const body = {
    contents: [
      {
        parts: [
          { inlineData: { mimeType: "image/png", data: inputPng.toString("base64") } },
          { text: prompt },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
    },
  };

  const res = await fetch(`${url}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts;
  if (!parts || parts.length === 0) {
    throw new Error(`No parts in Gemini response: ${JSON.stringify(data, null, 2)}`);
  }

  const imagePart = parts.find(
    (p: { inlineData?: { mimeType: string; data: string } }) => p.inlineData?.mimeType?.startsWith("image/"),
  );
  if (!imagePart) {
    const descriptions = parts.map((p: { text?: string }) => (p.text ? `text: ${p.text.slice(0, 200)}` : "non-text"));
    throw new Error(`No image in Gemini response. Parts: ${descriptions.join(", ")}`);
  }

  return Buffer.from(imagePart.inlineData.data, "base64");
}

export { MODELS as GEMINI_MODELS };
