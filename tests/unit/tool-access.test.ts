import { describe, it, expect } from 'vitest';
import { assertToolAccess, ToolAccessDeniedError, TOOL_ACCESS } from '../../shared/tool-access.js';

describe('tool-access', () => {
  describe('TOOL_ACCESS registry', () => {
    it('gives investigator analysis tools only', () => {
      expect(TOOL_ACCESS.investigator).toContain('dispatch_browser_task');
      expect(TOOL_ACCESS.investigator).toContain('fetch_source_map');
      expect(TOOL_ACCESS.investigator).toContain('resolve_error_location');
      expect(TOOL_ACCESS.investigator).toContain('ask_user');
      expect(TOOL_ACCESS.investigator).toContain('finish_investigation');
      expect(TOOL_ACCESS.investigator).not.toContain('browser_navigate');
      expect(TOOL_ACCESS.investigator).not.toContain('browser_click');
    });

    it('gives explorer browser tools only', () => {
      expect(TOOL_ACCESS.explorer).toContain('browser_navigate');
      expect(TOOL_ACCESS.explorer).toContain('browser_click');
      expect(TOOL_ACCESS.explorer).toContain('get_console_logs');
      expect(TOOL_ACCESS.explorer).not.toContain('dispatch_browser_task');
      expect(TOOL_ACCESS.explorer).not.toContain('fetch_source_map');
    });

    it('gives scout limited browser tools', () => {
      expect(TOOL_ACCESS.scout).toContain('browser_navigate');
      expect(TOOL_ACCESS.scout).toContain('get_console_logs');
      expect(TOOL_ACCESS.scout).not.toContain('browser_fill');
      expect(TOOL_ACCESS.scout).not.toContain('dispatch_browser_task');
    });

    it('gives synthesis no tools', () => {
      expect(TOOL_ACCESS.synthesis).toHaveLength(0);
    });
  });

  describe('assertToolAccess', () => {
    it('allows investigator to call analysis tools', () => {
      expect(() => { assertToolAccess('investigator', 'fetch_source_map'); }).not.toThrow();
      expect(() => { assertToolAccess('investigator', 'dispatch_browser_task'); }).not.toThrow();
    });

    it('blocks investigator from browser tools', () => {
      expect(() => { assertToolAccess('investigator', 'browser_navigate'); }).toThrow(ToolAccessDeniedError);
      expect(() => { assertToolAccess('investigator', 'browser_click'); }).toThrow(ToolAccessDeniedError);
    });

    it('allows explorer to call browser tools', () => {
      expect(() => { assertToolAccess('explorer', 'browser_navigate'); }).not.toThrow();
      expect(() => { assertToolAccess('explorer', 'get_network_logs'); }).not.toThrow();
    });

    it('blocks explorer from analysis tools', () => {
      expect(() => { assertToolAccess('explorer', 'fetch_source_map'); }).toThrow(ToolAccessDeniedError);
      expect(() => { assertToolAccess('explorer', 'dispatch_browser_task'); }).toThrow(ToolAccessDeniedError);
    });

    it('blocks synthesis from all tools', () => {
      expect(() => { assertToolAccess('synthesis', 'browser_navigate'); }).toThrow(ToolAccessDeniedError);
      expect(() => { assertToolAccess('synthesis', 'fetch_source_map'); }).toThrow(ToolAccessDeniedError);
    });

    it('throws ToolAccessDeniedError with correct message', () => {
      try {
        assertToolAccess('investigator', 'browser_click');
      } catch (err) {
        expect(err).toBeInstanceOf(ToolAccessDeniedError);
        expect((err as Error).message).toContain('investigator');
        expect((err as Error).message).toContain('browser_click');
      }
    });
  });
});
