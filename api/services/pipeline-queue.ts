/**
 * PipelineQueue — promise-chain mutex for serializing investigations.
 * Only one investigation runs at a time (single browser instance).
 */

export type PipelineQueue = {
  enqueue(fn: () => Promise<void>): { position: number };
  runningCount(): number;
};

export const createPipelineQueue = (): PipelineQueue => {
  let chain: Promise<void> = Promise.resolve();
  let count = 0;

  return {
    enqueue(fn: () => Promise<void>): { position: number } {
      const position = count;
      count++;

      const previousChain = chain;
      chain = previousChain.then(async () => {
        try {
          await fn();
        } finally {
          count--;
        }
      });

      return { position };
    },

    runningCount(): number {
      return count;
    },
  };
};
