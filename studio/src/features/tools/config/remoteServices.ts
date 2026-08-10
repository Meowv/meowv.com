export interface RemoteServiceConfig {
  readonly provider: string;
  readonly origin: string;
  readonly timeoutMs: number;
  readonly transmittedFields: readonly string[];
}

export const remoteServices = {
  translation: {
    provider: 'MyMemory Translation',
    origin: 'https://api.mymemory.translated.net',
    timeoutMs: 15_000,
    transmittedFields: ['原文', '源语言', '目标语言'],
  },
  shortVideo: {
    provider: 'BugPK',
    origin: 'https://api.bugpk.com',
    timeoutMs: 15_000,
    transmittedFields: ['短视频分享链接'],
  },
} as const satisfies Record<string, RemoteServiceConfig>;
