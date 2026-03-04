---
id: shadow-dom
name: Shadow DOM
category: browser
description: Components using Shadow DOM encapsulation
detectionSignals: [shadow-root, #shadow-root, shadow DOM, web components, custom elements]
priority: 60
toolChain: [browser_get_dom, browser_click, browser_screenshot]
hypothesisTemplates: [Element hidden inside shadow root, CSS not piercing shadow boundary, Event not propagating out of shadow]
---
# Shadow DOM Strategy

## Challenge
Standard CSS selectors cannot pierce Shadow DOM boundaries. Elements inside `#shadow-root` are invisible to normal `querySelector`.

## Access Strategy
1. `browser_get_dom` may return shadow host but not shadow content
2. Use `page.evaluate()` to traverse: `document.querySelector('my-component').shadowRoot.querySelector('.inner')`
3. Some frameworks (Lit, Stencil) use open shadow roots — accessible via `.shadowRoot`

## Common Issues
- Event listeners on host don't receive events from shadow children
- Styles from parent page don't apply inside shadow root
- `slot` content may be invisible in DOM tree
