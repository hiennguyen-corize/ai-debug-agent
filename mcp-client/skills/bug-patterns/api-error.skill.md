---
id: api-error
name: API Error
category: bug-pattern
description: HTTP 4xx/5xx errors, CORS, auth failures, malformed requests
detectionSignals: [network 4xx, network 5xx, response error, CORS, 401, 403, 404, 500, 502, 503, Access-Control, preflight, ERR_CONNECTION_REFUSED]
priority: 90
toolChain: [get_network_logs, get_network_payload, resolve_error_location, read_source_file]
hypothesisTemplates: [API returns error status, Request payload malformed, Auth token expired, CORS misconfiguration, Rate limited, Backend down, Wrong content-type, Missing required field]
---
# API Error Investigation

## Step 1: Identify failing request
`get_network_logs` → filter status >= 400. Note:
- URL and HTTP method
- Status code
- Request timing (did it timeout?)
- Whether it's a preflight (OPTIONS) or actual request

## Step 2: Classify by status code

### 400 Bad Request
- Request body doesn't match expected schema
- Missing required fields
- Wrong data type (string vs number)
- **Action**: `get_network_payload` → compare request body with API docs/schema

### 401 Unauthorized
- Missing or expired auth token
- Wrong token type (Bearer vs Basic)
- Cookie not sent (SameSite, cross-origin)
- **Action**: Check `Authorization` header, check cookies, check token expiry

### 403 Forbidden
- Valid auth but insufficient permissions
- CSRF token missing or invalid
- IP/geo restriction
- **Action**: Check CSRF token in form, check user role/permissions

### 404 Not Found
- Wrong API endpoint URL
- Resource deleted or never existed
- API version mismatch (`/api/v1/` vs `/api/v2/`)
- Dynamic route parameter wrong (ID doesn't exist)
- **Action**: Verify URL construction, check if resource exists

### 405 Method Not Allowed
- Using POST instead of PUT, or GET instead of POST
- **Action**: Check which methods the endpoint accepts

### 413 Payload Too Large
- File upload exceeds server limit
- Request body too large
- **Action**: Check `Content-Length` header, server upload limit config

### 422 Unprocessable Entity
- Validation error on server side
- Data format correct but semantically invalid
- **Action**: Response body usually contains specific validation errors

### 429 Too Many Requests
- Rate limiting active
- **Action**: Check `Retry-After` header, implement exponential backoff

### 500 Internal Server Error
- Server-side bug
- **Action**: Response body may contain stack trace (dev mode) or error ID (prod)

### 502 Bad Gateway / 503 Service Unavailable
- Backend server is down or overloaded
- Reverse proxy (Nginx) can't reach upstream
- **Action**: Check if API is independently accessible, check server health

## Step 3: CORS Errors
CORS errors appear as "Network Error" with status 0 in JavaScript.

**Symptoms**:
- Console: "Access to XMLHttpRequest at 'X' from origin 'Y' has been blocked by CORS policy"
- Network tab shows the request, but response is blocked
- Preflight OPTIONS request fails

**Common causes**:
- Backend missing `Access-Control-Allow-Origin` header
- Allowed origins don't include the frontend domain
- Missing `Access-Control-Allow-Headers` for custom headers (Authorization, Content-Type)
- Missing `Access-Control-Allow-Methods` for PUT/DELETE/PATCH
- Credentials mode mismatch: `withCredentials: true` requires `Access-Control-Allow-Credentials: true` and specific origin (not `*`)

## Step 4: Trace to source
If error message references code location → `resolve_error_location` → `read_source_file`.
Check:
- How the request URL is constructed (hardcoded vs dynamic)
- Request body formation (which state/form fields are included)
- Error handling (does the catch block handle this status code?)
- Retry logic (does it retry on failure?)
