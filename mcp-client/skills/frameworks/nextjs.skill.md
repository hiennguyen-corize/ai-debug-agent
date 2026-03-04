---
id: nextjs
name: Next.js Framework
category: framework
description: Next.js 13-15 App Router debugging — SSR, RSC, hydration, caching
detectionSignals: [__NEXT_DATA__, _next/static, next-router, __next, _next/data, _next/image]
priority: 85
toolChain: [get_network_logs, get_console_logs, browser_get_dom, browser_screenshot]
hypothesisTemplates: [Hydration mismatch, Server component in client boundary, getServerSideProps error, Route not found, Middleware redirect loop, ISR stale cache, Server Action failure, RSC payload error]
---
# Next.js Investigation Playbook

## Detection Markers
- `<script id="__NEXT_DATA__">` in DOM (Pages Router)
- `_next/static/` in network requests
- `__next` div wrapper
- `_next/data/` requests (Pages Router data fetching)
- `_next/image` in image URLs (next/image component)

## App Router vs Pages Router
Check `__NEXT_DATA__` presence:
- **Present**: Pages Router (`getServerSideProps`, `getStaticProps`)
- **Absent**: App Router (Server Components, `fetch()` in components)

## Hydration Mismatch (Most Common Bug)

### Causes
1. **Browser-only APIs in render**: `window.innerWidth`, `localStorage.getItem()`, `navigator.userAgent` — these don't exist on server
2. **Dynamic content**: `Date.now()`, `Math.random()`, `crypto.randomUUID()` in render — server/client produce different values
3. **Conditional rendering on window**: `typeof window !== 'undefined'` in render body causes mismatch
4. **Invalid HTML nesting**: `<p>` inside `<p>`, `<div>` inside `<p>`, `<a>` inside `<a>` — browsers auto-correct, React expects exact match
5. **Third-party scripts**: Browser extensions or analytics scripts modify DOM after SSR
6. **CSS-in-JS**: Incorrect SSR configuration for styled-components/emotion

### Solutions
- Use `useEffect` to defer client-only values (runs after hydration)
- `next/dynamic` with `ssr: false` for client-only components
- `suppressHydrationWarning={true}` for unavoidable mismatches (timestamps)
- Guard with `const [isClient, setIsClient] = useState(false)` + `useEffect(() => setIsClient(true), [])`

### Key Error Messages
- "Text content does not match server-rendered HTML"
- "Hydration failed because the initial UI does not match"
- "There was an error while hydrating"

## Server Components Bugs

### Common Mistakes
1. **Using hooks in Server Components**: `useState`, `useEffect`, `useContext` → error. Must add `'use client'` directive
2. **Passing functions as props**: Server → Client component props must be serializable. Functions, Dates, Maps are not
3. **Importing client-only code**: Server Component importing a module that uses `window` → build error
4. **Calling Route Handlers from Server Components**: Unnecessary network round-trip. Call the logic directly
5. **Context in Server Components**: React Context is client-only. Provide context from a client wrapper

### Overusing `'use client'`
- Every `'use client'` increases client bundle size
- Only components using hooks, event handlers, or browser APIs need it
- Server Components can render Client Components as children

## Data Fetching Issues

### App Router
- **Stale data**: `fetch()` caching is aggressive by default. Use `{ cache: 'no-store' }` or `revalidate: 0`
- **ISR not updating**: Check `revalidate` value in `fetch()` options or route segment config
- **`cookies()`/`headers()`** in cached route → must opt into dynamic rendering
- **Server Actions returning non-serializable data**: Functions, class instances → error

### Pages Router
- **`getServerSideProps` throwing**: Returns 500 page to user without useful error
- **Incorrect `getStaticPaths` fallback**: `false` returns 404 for unknown paths, `blocking` waits, `true` shows loading
- **Serialization errors**: Dates, undefined, functions in `props` → JSON serialization fails

## Middleware & Routing
- **Redirect loop**: Middleware redirecting to a URL that triggers same middleware
- **Missing `matcher`**: Middleware runs on ALL routes including `_next/static`, API routes
- **Dynamic route params**: `[slug]` vs `[...slug]` vs `[[...slug]]` — catch-all vs optional catch-all

## Debugging Priority Tools
1. `get_console_logs` — hydration warnings, RSC errors
2. `get_network_logs` — check `_next/data/` requests, RSC payload, cache headers
3. `browser_get_dom` — verify `__NEXT_DATA__` content, component structure
4. `browser_screenshot` — visual verification, error pages
