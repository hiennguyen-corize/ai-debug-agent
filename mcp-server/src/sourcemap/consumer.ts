/**
 * Source map consumer wrapper — typed, no assertions.
 */

import { SourceMapConsumer, type RawSourceMap } from 'source-map';

export const createConsumer = async (rawMap: unknown): Promise<SourceMapConsumer> =>
  new SourceMapConsumer(rawMap as RawSourceMap);

export const getConsumerSources = (consumer: SourceMapConsumer): string[] =>
  (consumer as unknown as { sources: string[] }).sources ?? [];
