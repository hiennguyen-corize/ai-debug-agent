---
id: file-upload
name: File Upload Bug
category: bug-pattern
description: File upload fails, rejects, or produces no response
detectionSignals: [upload, file, multipart, 413, file rejected, FormData]
priority: 60
toolChain: [browser_upload_file, get_network_logs, get_network_payload, get_console_logs]
hypothesisTemplates: [File too large (413), Wrong content-type, Upload endpoint not found, FormData key mismatch]
---
# File Upload Investigation

## Step 1: Attempt upload
`browser_upload_file` with a test file.

## Step 2: Check request
`get_network_logs` → verify multipart request was sent. Check status code.
- 413: File too large
- 415: Wrong content-type
- 422: Validation error

## Step 3: Inspect payload
`get_network_payload` → verify FormData field name matches backend expectation.
