---
id: vite
name: Vite Source Maps
category: source-map
description: Vite/Rollup bundle source map resolution
detectionSignals: [/@vite/, ?import, vite, @fs/, ?v=, .mjs]
priority: 70
toolChain: [fetch_source_map, resolve_error_location, read_source_file]
hypothesisTemplates: [Dev server inline maps, Prod maps not generated]
---
# Vite Source Map Resolution

## Dev Mode
- Vite dev server serves **inline source maps** (base64 in bundle)
- Files served as ESM modules via `/@vite/` prefix
- No `.map` files — maps embedded in `//# sourceMappingURL=data:...`

## Production Build
- Rollup generates separate `.map` files
- Location: same directory as output chunks
- `build.sourcemap: true` must be set in `vite.config.ts`

## Resolution Strategy
1. Check if `/@vite/` in URL → dev mode → inline maps
2. Production → `fetch_source_map` with chunk URL
3. Vite uses content-hash chunks: `index-DxRg4.js` → `index-DxRg4.js.map`
