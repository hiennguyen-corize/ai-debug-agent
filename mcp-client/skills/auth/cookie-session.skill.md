---
id: cookie-session
name: Cookie/Session Auth
category: auth
description: Form-based login with cookie/session auth — CSRF, SameSite, session management
detectionSignals: [login form, Set-Cookie, session, JSESSIONID, connect.sid, form action login, csrf, xsrf, _token]
priority: 80
toolChain: [browser_get_dom, browser_fill, browser_click, get_network_logs, get_network_payload]
hypothesisTemplates: [Session expired, Cookie not sent on cross-origin, CSRF token mismatch, SameSite blocking cookie, HttpOnly preventing JS access, Session fixation]
---
# Cookie/Session Auth Strategy

## Login Flow
1. Navigate to login page
2. `browser_get_dom` → find:
   - Username/email field (input[type=email], input[name*=user], input[name*=email])
   - Password field (input[type=password])
   - Submit button (button[type=submit], input[type=submit])
   - **CSRF token**: hidden input (input[name=_token], input[name=csrf], input[name=_csrf])
3. `browser_fill` credentials from config `auth.credentials`
4. `browser_click` submit button
5. `get_network_logs` → verify:
   - POST request to login endpoint
   - Response has `Set-Cookie` header
   - No redirect to login page (redirect loop = auth failed)
6. Navigate to target URL — cookies should auto-attach

## Common Auth Failures

### Cookie Not Sent
- **SameSite=Strict**: Cookie not sent on cross-origin navigation. If app and API are on different domains, cookie won't attach
- **SameSite=Lax**: Cookie sent on top-level navigation but NOT on XHR/fetch to different origin
- **Secure flag**: Cookie only sent over HTTPS. If testing on HTTP, cookie is dropped
- **Domain mismatch**: Cookie set for `.example.com` won't be sent to `api.other.com`
- **Path restriction**: Cookie set with `Path=/app` won't be sent to `/api`

### CSRF Token Issues
- **Token not extracted**: Hidden field `<input name="_token" value="abc123">` must be included in form submission
- **Token per-request**: Some backends generate new token each request. Stale token = 403
- **Token in meta tag**: `<meta name="csrf-token" content="abc123">` — needs to be read and added to headers
- **Double Submit Cookie**: CSRF token in cookie AND header must match

### Session Issues
- **Session expired**: Server session TTL exceeded. Re-login required
- **Session not persisted**: Server uses in-memory sessions, restart clears all sessions
- **Concurrent sessions**: Server limits active sessions per user

## Post-Login Verification
After login attempt:
1. `get_network_logs` → check subsequent requests include cookies
2. `browser_get_dom` → verify app shows authenticated state (username, avatar, dashboard)
3. If still on login page → auth failed, check response body for error message
