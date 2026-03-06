/**
 * Async message queue for interactive mode.
 * Agent awaits next(), FE/API pushes messages via push().
 */

export type MessageQueue = {
  push: (message: string) => void;
  next: () => Promise<string>;
};

export const createMessageQueue = (): MessageQueue => {
  let resolve: ((msg: string) => void) | null = null;
  const pending: string[] = [];

  return {
    push(message: string): void {
      if (resolve !== null) {
        const r = resolve;
        resolve = null;
        r(message);
      } else {
        pending.push(message);
      }
    },

    next(): Promise<string> {
      const queued = pending.shift();
      if (queued !== undefined) return Promise.resolve(queued);
      return new Promise<string>((r) => { resolve = r; });
    },
  };
};
