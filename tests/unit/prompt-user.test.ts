import { describe, it, expect } from 'vitest';
import { createPromptUser } from '../../mcp-client/src/agent/prompt-user-factory.js';

describe('prompt-user-factory', () => {
  it('returns auto-assume for autonomous mode', async () => {
    const prompt = createPromptUser({ mode: 'autonomous' });
    const result = await prompt('What is the auth flow?');
    expect(result).toContain('AUTO-ASSUMED');
  });

  it('returns auto-assume for interactive mode without callbackUrl', async () => {
    const prompt = createPromptUser({ mode: 'interactive' });
    const result = await prompt('Need clarification');
    expect(result).toContain('AUTO-ASSUMED');
  });

  it('returns auto-assume for autonomous mode even with callbackUrl', async () => {
    const prompt = createPromptUser({ mode: 'autonomous', callbackUrl: 'http://example.com/callback' });
    const result = await prompt('Question');
    expect(result).toContain('AUTO-ASSUMED');
  });

  it('returns callback-based prompt for interactive mode with callbackUrl', () => {
    const prompt = createPromptUser({ mode: 'interactive', callbackUrl: 'http://example.com/callback' });
    expect(prompt).toBeTypeOf('function');
    // Cannot test actual HTTP call without mock server, but function should exist
  });
});
