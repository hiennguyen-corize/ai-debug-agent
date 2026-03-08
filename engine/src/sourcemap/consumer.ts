/**
 * Source map consumer wrapper — typed, no assertions.
 */

import { SourceMapConsumer, type BasicSourceMapConsumer, type IndexedSourceMapConsumer, type RawSourceMap } from 'source-map';

type ConcreteConsumer = BasicSourceMapConsumer | IndexedSourceMapConsumer;

const isSourceMapLike = (v: unknown): v is RawSourceMap =>
  typeof v === 'object' && v !== null && 'version' in v && 'mappings' in v;

export const createConsumer = async (rawMap: unknown): Promise<ConcreteConsumer> => {
  if (!isSourceMapLike(rawMap)) {
    throw new Error('Invalid source map: missing required "version" or "mappings" fields');
  }
  return new SourceMapConsumer(rawMap);
};
