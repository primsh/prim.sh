# Brand Asset Prompts

Prompt history for generating brand assets. Images stored in `brand/assets/` (gitignored).

---

## Asset 1: Logo (`>|` multicolor splatter)

Target: GitHub avatar, Discord icon, X profile pic. Square.

### Iteration 1 — logo-prompt-v1.png
**Model:** gemini-2.0-flash-exp-image-generation (Nano Banana, browser)
**Feedback:** Good clean brush strokes on `>|`. Green/cyan separation works. Too minimal — no multicolor splatter. Has Gemini watermark.
```
Spray paint graffiti style logo on pure black background. A terminal shell prompt symbol ">|" — a green chevron ">" and a blue vertical bar cursor "|". Neon green (#00ff88) paint with drips, splatter, and overspray. The vertical bar is cyan/blue. Raw street art texture, paint runs and speckles visible. No text, no words, no frame. Square composition, centered. Dark, moody, high contrast.
```

### Iteration 2 — logo-multicolor-v1.png
**Model:** gemini-2.0-flash-exp-image-generation (Nano Banana, browser)
**Feedback:** Multi-color splatter works. Purple/pink/orange/coral behind the mark. Readable. Has Gemini watermark.
```
Spray paint graffiti logo on pure black background. A terminal prompt ">|" symbol. The ">" chevron is bright neon green (#00ff88), the vertical bar "|" is electric blue (#6C8EFF). Both have paint drips running down. Surrounding splatter and overspray particles in purple, cyan, pink, orange, gold, coral — like multiple spray cans were used. Raw street art texture, paint runs visible. No text, no words, no frame. Square composition, centered. High contrast, dark moody atmosphere.
```

### Iteration 3 — logo-multicolor-v2.png
**Model:** gemini-2.0-flash-exp-image-generation (Nano Banana, browser)
**Feedback:** Heavier pink/magenta, more chaotic. Tighter composition. Has Gemini watermark.
```
(Same prompt as iteration 2)
```

### Iteration 4 — logo-api-v1.png
**Model:** gemini-2.0-flash-exp-image-generation (API)
**Feedback:** No watermark. Composition too tight/cropped — glyphs pushed to edges.
```
Spray paint graffiti logo on pure black background. A terminal prompt ">|" symbol. The ">" chevron is neon green (#00ff88), painted with a clean confident single brush stroke. The "|" vertical bar cursor is cyan (#4DD0E1), also a clean single stroke. Both have paint drips running down. Behind and around both symbols, a cloud of multicolor splatter particles — purple, pink, orange, coral, gold — like overspray from other cans. The main strokes stay clean and readable, the chaos is in the background splatter only. Raw street art texture. No text, no words, no letters, no frame, no watermark. Square composition, centered. Pure black background #0a0a0a. High contrast.
```

### Iteration 5 — logo-api-v2.jpg
**Model:** gemini-3-pro-image-preview (API)
**Feedback:** Best quality yet. More texture, realistic wall grain. Splatter has good variety — coral blobs, gold dust, purple clouds. No watermark. Issues: `>|` off-center. Splatter too dense, covers too much black. Wants: more realistic, slight glow, preserve chalky pastel tone. "Neon candy pastel chalk glow."
```
(Same prompt as iteration 4)
```

### Iteration 6 — logo-api-v3 (next)
**Model:** gemini-3-pro-image-preview (API)
**Prompt changes from v5 feedback:**
- Center the `>|` precisely
- Reduce splatter density — more black space visible
- Add subtle glow/bloom around strokes
- Chalky pastel tone with neon edges
```
Spray paint graffiti logo on pure black background (#0a0a0a). A terminal prompt ">|" symbol, precisely centered in the frame with generous black space around it. The ">" chevron is neon green (#00ff88) with a soft glow bloom around the edges. The "|" vertical bar cursor is cyan (#4DD0E1) with the same subtle glow. Both painted with clean confident single brush strokes — chalky pastel texture with neon-bright edges. Light paint drips running down. Sparse multicolor splatter particles scattered around — purple, pink, orange, coral, gold — but restrained, letting the black background breathe. Most of the image is black. Slight photorealistic spray paint texture. Neon candy pastel chalk aesthetic. No text, no words, no letters, no frame. Square composition. High contrast.
```

---

## Asset 2: Favicon (`>` solo green)

Target: Browser tab, bookmarks. Square, exports to 32x32/16x16.

### Iteration 1 — favicon-green-v1.png
**Model:** gemini-2.0-flash-exp-image-generation (Nano Banana, browser)
**Feedback:** Clean, glowing, minimal. Good for small sizes. Has Gemini watermark.
```
Single spray painted ">" chevron symbol on pure black background. Neon green (#00ff88) with paint drips and splatter particles. Glowing edges, raw aerosol texture. Minimal, iconic, centered. No text, no frame. Square composition.
```

---

## Asset 3: X Banner (neon stripes)

Target: X/Twitter header (1500x500, 3:1 ratio).

### Iteration 1 — banner-stripes-v1.png
**Model:** gemini-2.0-flash-exp-image-generation (Nano Banana, browser)
**Feedback:** Six stripes (requested 7). Generated square — needs crop to 3:1. Good colors and drip texture. Has Gemini watermark.
```
Ultra-wide panoramic image, 3:1 aspect ratio. Seven horizontal spray paint stripes on pure black background. Each stripe a different neon color: green, blue, coral, orange, purple, cyan, pink. Paint drips at edges, overspray particles between stripes. Raw street art texture. No text, no symbols. Very wide composition, stripes spanning the full width. 1500x500 pixels.
```

---

## Unused prompts

### Multi-color bleed variant
```
Spray paint graffiti logo on pure black background. A terminal prompt ">|" symbol painted with multiple overlapping neon colors — green, blue, purple, pink, cyan — like several spray cans hit the same spot. The ">" chevron is mostly green, the "|" bar is mostly blue, but colors bleed into each other. Heavy drips, splatter clouds, overspray particles. Raw chaotic street art energy. No text, no words, no frame. Square, centered.
```
