---
id: webpack
name: webpack Source Maps
category: source-map
description: webpack bundle source map resolution
detectionSignals: [webpack, webpackChunk, __webpack_require__, bundle.js.map]
priority: 70
toolChain: [fetch_source_map, resolve_error_location, read_source_file]
hypothesisTemplates: [Source map not deployed, Source map URL mismatch]
---
# webpack Source Map Resolution

## Map Location Patterns
1. `//# sourceMappingURL={filename}.map` comment at end of bundle
2. Separate `.map` file in same directory as bundle
3. `SourceMap` response header

## Resolution Strategy
1. `fetch_source_map` with bundle URL
2. If 404 → try `{bundleUrl}.map` directly
3. If local build → check `sourcemapDir` config for local `.map` files
4. Verify `sources` array in map file → paths should match project structure

## webpack-Specific Notes
- Production builds may strip source maps entirely
- `devtool: 'hidden-source-map'` generates maps but removes URL comment
- Chunk names may be hashed: `main.abc123.js` → `main.abc123.js.map`
