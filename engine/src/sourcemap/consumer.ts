/**
 * Source map consumer wrapper — typed, no assertions.
 */

import { SourceMapConsumer, type BasicSourceMapConsumer, type IndexedSourceMapConsumer, type RawSourceMap } from 'source-map';

type ConcreteConsumer = BasicSourceMapConsumer | IndexedSourceMapConsumer;

export const createConsumer = async (rawMap: unknown): Promise<ConcreteConsumer> =>
  new SourceMapConsumer(rawMap as RawSourceMap);

export const getConsumerSources = (consumer: ConcreteConsumer): string[] =>
  consumer.sources;
