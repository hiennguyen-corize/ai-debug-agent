/**
 * Tool call deduplication tracker — prevents Investigator from repeating identical calls.
 */

const MAX_DUPLICATE_CALLS = 2;

export class ToolCallTracker {
  private readonly cache = new Map<string, { result: unknown; count: number }>();

  private makeKey(name: string, args: Record<string, unknown>): string {
    return `${name}::${JSON.stringify(args, Object.keys(args).sort())}`;
  }

  getCached(name: string, args: Record<string, unknown>): { result: unknown; count: number } | undefined {
    const entry = this.cache.get(this.makeKey(name, args));
    if (entry === undefined) return undefined;
    entry.count++;
    return entry;
  }

  store(name: string, args: Record<string, unknown>, result: unknown): void {
    this.cache.set(this.makeKey(name, args), { result, count: 1 });
  }

  reset(): void {
    this.cache.clear();
  }

  isOverLimit(count: number): boolean {
    return count >= MAX_DUPLICATE_CALLS;
  }
}
