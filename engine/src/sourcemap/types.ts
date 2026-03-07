/**
 * Source map types.
 */

export const SOURCE_MAP_ORIGIN = {
  PUBLIC_URL: 'public_url',
  LOCAL_PATH: 'local_path',
  BUILD_DIR_SCAN: 'build_dir_scan',
  NOT_FOUND: 'not_found',
} as const;

export type SourceMapOrigin = (typeof SOURCE_MAP_ORIGIN)[keyof typeof SOURCE_MAP_ORIGIN];

export type SourceMapResult = {
  success: boolean;
  origin: SourceMapOrigin;
  mapUrl: string;
  sourcesCount: number;
  rawMap: unknown;
};

export type ResolvedLocation = {
  originalFile: string;
  originalLine: number;
  originalColumn: number;
  surroundingCode: string;
  functionName: string | null;
};

export type ParsedErrorLocation = {
  bundleUrl: string;
  line: number;
  column: number;
};

export type ImportChainLink = {
  file: string;
  callerLine: number;
  callerCode: string;
  role: string;
};

export type SourceMapConfig = {
  localPath?: string;
  buildDir?: string;
  enabled?: boolean;
};
