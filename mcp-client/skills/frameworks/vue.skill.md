---
id: vue
name: Vue.js Framework
category: framework
description: Vue 3 Composition API debugging — reactivity, ref/reactive pitfalls, performance
detectionSignals: [__VUE__, vue-router, v-cloak, data-v-, __vue_app__, vue.runtime, vue.global]
priority: 80
toolChain: [browser_get_dom, get_console_logs, get_network_logs, browser_screenshot]
hypothesisTemplates: [Vue reactivity lost, ref .value forgotten, reactive object reassigned, Destructured reactive lost reactivity, Computed not updating, Pinia store stale, Watcher not triggering, v-model binding broken]
---
# Vue.js Investigation Playbook

## Detection Markers
- `__VUE__` or `__vue_app__` on root element
- `data-v-` scoped style attributes (hash-based)
- `v-cloak` directive
- `vue.runtime` or `vue.global` in network requests

## Vue 3 Composition API Reactivity Pitfalls

### 1. ref() vs reactive() Confusion
- **`ref()`**: Works with ANY value (primitives + objects). Access via `.value` in script, auto-unwrapped in template
- **`reactive()`**: Only objects/arrays/Maps/Sets. **Cannot hold primitives**. No `.value` needed

### 2. Forgetting `.value`
Most common Vue 3 bug. In `<script setup>`:
```
const count = ref(0)
count = 5        // ❌ Reassigns the ref itself (loses reactivity)
count.value = 5  // ✅ Updates the reactive value
```
- Template auto-unwraps: `{{ count }}` works without `.value`
- Script/functions always need `.value`
- Comparison: `if (count === 5)` is ALWAYS false — should be `if (count.value === 5)`

### 3. Reassigning reactive() Object
```
let state = reactive({ count: 0 })
state = reactive({ count: 1 })  // ❌ Old proxy disconnected, template still references old one
state.count = 1                  // ✅ Mutate properties, not the object itself
```

### 4. Destructuring reactive() Loses Reactivity
```
const state = reactive({ name: 'Vue', count: 0 })
const { name, count } = state    // ❌ name and count are now plain values, not reactive
const { name, count } = toRefs(state)  // ✅ Maintains reactivity via refs
```

### 5. Passing Non-Reactive Values to Composables
```
const props = defineProps<{ userId: string }>()
const user = useUser(props.userId)  // ❌ Passes primitive, not reactive reference
const user = useUser(() => props.userId)  // ✅ Pass getter function
const user = useUser(toRef(props, 'userId'))  // ✅ Convert to ref
```

## Template Rendering Bugs

### v-if vs v-show
- `v-if`: Destroys/recreates DOM element → component loses state on toggle
- `v-show`: CSS `display:none` → component stays mounted, keeps state
- Bug pattern: Using `v-if` on component with internal state, state resets on toggle

### v-for Key Issues
- Missing `:key` on `v-for` → DOM reuse bugs, animations break, input state leaks between items
- Using array index as key → same problem when items are reordered/filtered
- Best practice: Use unique ID from data

### Slot Content Not Updating
- Slot content from parent may not update if parent's reactive data isn't triggering re-render
- Check if slot content accesses props/state correctly

## State Management (Pinia)

### Common Issues
1. **Store action not awaited**: Async action returns before data is ready
2. **Stale store state**: Navigating between pages, store retains old data. Use `$reset()` or clear in route guard
3. **`$reset()` not working with setup stores**: Only works with Option API stores. Setup stores need manual reset
4. **Multiple store instances (SSR)**: Each request should get its own store instance. Check if store is created outside `defineStore`

## Performance Issues
- **Large reactive objects**: Binding entire API response to reactive state makes Vue track every nested property. Use `shallowRef()` or `shallowReactive()` for large objects where deep tracking isn't needed
- **Heavy computed properties**: Computed properties recalculate on every dependency change. If expensive, consider `watchEffect` with debounce
- **Inefficient watchers**: `watch(state, callback, { deep: true })` on large objects is expensive. Watch specific properties instead
- **Too many reactive bindings**: > 100 reactive bindings per component causes noticeable lag

## Global Error Handling
```
app.config.errorHandler = (err, component, info) => { ... }
```
Check if `errorHandler` is swallowing errors silently — may explain "no error in console" scenarios.

## Debugging Priority Tools
1. `get_console_logs` — Vue warnings are very descriptive (`[Vue warn]: ...`)
2. `browser_get_dom` — check `data-v-` scoped styles, component structure
3. `get_network_logs` — API calls in `onMounted`, Pinia actions
4. `browser_screenshot` — visual state verification

## Key Console Warnings to Look For
- "[Vue warn]: Property was accessed during render but is not defined"
- "[Vue warn]: Avoid mutating a prop directly"
- "[Vue warn]: Component emitted event but it is not declared"
- "Extraneous non-props attributes were passed to component"
- "[Vue warn]: Maximum recursive updates exceeded"
