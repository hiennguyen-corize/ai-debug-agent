---
id: form-input
name: Form/Input Bug
category: bug-pattern
description: Form validation, submission, or input binding issues
detectionSignals: [form, input, validation, submit does nothing, required field, form data missing]
priority: 70
toolChain: [browser_fill, browser_click, get_network_logs, browser_get_dom]
hypothesisTemplates: [Form submit handler not attached, Validation prevents submit silently, Input value not bound to state, CSRF token expired]
---
# Form Bug Investigation

## Step 1: Fill and submit
Use `browser_fill` to populate all fields → `browser_click` submit button.

## Step 2: Check network
Did a request fire? If no → JS submit handler broken or validation blocking.

## Step 3: Check validation
`browser_get_dom` → look for validation error messages (may be hidden or outside viewport).

## Step 4: Inspect payload
If request fires → `get_network_payload` → verify form data is correct and complete.
