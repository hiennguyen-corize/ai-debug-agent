---
id: oauth
name: OAuth/SSO Auth
category: auth
description: OAuth 2.0 / OIDC / SSO login flows — cannot fully automate, detection and workaround strategies
detectionSignals: [oauth, /authorize, /callback, accounts.google, login.microsoftonline, redirect_uri, client_id, code_challenge, PKCE, openid, id_token]
priority: 80
toolChain: [get_network_logs, browser_get_dom, browser_screenshot]
hypothesisTemplates: [OAuth callback URL mismatch, Token refresh failed, PKCE verifier missing, Consent screen blocking, State parameter mismatch, Token expired no refresh]
---
# OAuth/SSO Auth Strategy

## Limitation
OAuth flows redirect to third-party providers (Google, GitHub, Microsoft, etc.) — **automated login is NOT possible** without pre-configured credentials or test tokens. Do NOT attempt to fill in credentials on provider login pages.

## Detection
`get_network_logs` → look for:
- Request to `/authorize` with `client_id` and `redirect_uri` params
- Redirects to `accounts.google.com`, `login.microsoftonline.com`, `github.com/login/oauth`
- URL contains `response_type=code` (Authorization Code flow) or `response_type=token` (Implicit)
- PKCE: URL contains `code_challenge` and `code_challenge_method`

## Investigation Approach

### If auth is needed to reproduce the bug
1. **Flag to user**: "This app uses OAuth. Please provide one of:
   - A pre-authenticated session cookie
   - A valid JWT/access token
   - A test account configured in the OAuth provider"
2. If user provides token → inject via:
   - Cookie: Set cookie before navigating to target URL
   - Header: Configure `Authorization: Bearer <token>` for API requests

### If investigating the OAuth flow itself
Common OAuth bugs to look for:
1. **Redirect URI mismatch**: `redirect_uri` in request doesn't match registered URI in OAuth provider → error page
2. **State parameter mismatch**: `state` parameter in callback doesn't match original → CSRF protection triggers rejection
3. **PKCE verifier missing**: Authorization Code + PKCE flow requires `code_verifier` in token exchange. If missing → token request fails
4. **Token expired, no refresh**: Access token expired, refresh token missing or also expired → silent auth failure
5. **Consent screen**: User hasn't granted consent for required scopes → stuck on consent page
6. **Mixed content**: OAuth redirect from HTTPS to HTTP → blocked by browser
7. **Popup blocked**: OAuth flow uses popup window → browser blocks it, callback never fires

### Post-OAuth investigation (when already authenticated)
If user is logged in but app still has issues:
- Check token expiry: JWT decode → check `exp` claim
- Check token refresh: `get_network_logs` → look for `/token` endpoint requests
- Check scope: Decoded JWT may not include required scope for the API being called
