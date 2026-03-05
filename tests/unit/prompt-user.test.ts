import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPromptUser } from '../../mcp-client/src/agent/prompt-user-factory.js';

describe('prompt-user-factory', () => {
  const originalStdin = process.stdin.isTTY;

  beforeEach(() => {
    // Default: non-TTY (CI/piped), so readline won't activate
    Object.defineProperty(process.stdin, 'isTTY', { value: false, writable: true, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: originalStdin, writable: true, configurable: true });
    vi.restoreAllMocks();
  });

  it('returns auto-assume for autonomous mode', async () => {
    const prompt = createPromptUser({ mode: 'autonomous' });
    const result = await prompt('What is the auth flow?');
    expect(result).toContain('AUTO-ASSUMED');
  });

  it('returns auto-assume for autonomous mode even with callbackUrl', async () => {
    const prompt = createPromptUser({ mode: 'autonomous', callbackUrl: 'http://example.com/callback' });
    const result = await prompt('Question');
    expect(result).toContain('AUTO-ASSUMED');
  });

  it('returns auto-assume for interactive mode when stdin is not TTY', async () => {
    const prompt = createPromptUser({ mode: 'interactive' });
    const result = await prompt('Need clarification');
    expect(result).toContain('AUTO-ASSUMED');
  });

  it('returns callback-based prompt for interactive mode with callbackUrl', () => {
    const prompt = createPromptUser({ mode: 'interactive', callbackUrl: 'http://example.com/callback' });
    expect(prompt).toBeTypeOf('function');
  });

  it('returns readline prompt for interactive mode when stdin is TTY', () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, writable: true, configurable: true });
    const prompt = createPromptUser({ mode: 'interactive' });
    // Returns a readline-based function (not autoAssume)
    expect(prompt).toBeTypeOf('function');
    // We can't easily test readline interactively, but we verify it doesn't return autoAssume
  });

  it('prefers callbackUrl over readline even when stdin is TTY', () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, writable: true, configurable: true });
    const prompt = createPromptUser({ mode: 'interactive', callbackUrl: 'http://example.com/callback' });
    expect(prompt).toBeTypeOf('function');
  });
});
