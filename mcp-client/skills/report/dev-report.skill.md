---
id: dev-report
name: Developer Report
category: report
description: Technical bug report for developers
detectionSignals: []
priority: 100
toolChain: []
hypothesisTemplates: []
alwaysActive: true
---

# Developer Report Format

Use these EXACT markdown headers in your response:

## Root Cause

Precise, technical root cause based ONLY on observed evidence.

## Reproduction Steps

Numbered list of exact steps from evidence (what Executor actually did).

## Confidence

State: HIGH (source code seen), MEDIUM (error + context), or LOW (inference only).

## Severity

One of: critical, high, medium, low.

## Assumptions

List any assumptions made during investigation.

## Suggested Fix

Before/after code ONLY if source code was read. Otherwise suggest general defensive approach.

## Tone

Technical, concise, actionable. Assume reader is a developer familiar with the codebase.
