export type AiKeyProvider = "gemini" | "groq";

export type AiApiKeyVerifyResult = {
  ok: boolean;
  provider: AiKeyProvider;
  model: string;
  latencyMs?: number;
  statusCode?: number;
  error?: string;
  index?: number;
};

export type UserAiKeysSnapshot = {
  gemini: string[];
  groq: string[];
};

export type AiKeysFormConfig = {
  gemini: {
    model: string;
    keyCount: number;
  };
  groq: {
    model: string;
    keyCount: number;
  };
  secretsUnavailable: boolean;
};

export type AiKeysVerifySummary = {
  provider: AiKeyProvider;
  results: AiApiKeyVerifyResult[];
};
