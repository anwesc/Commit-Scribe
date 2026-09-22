/**
 * 全局常量：配置键、默认提示词、SecretStorage 键名、命令 ID。
 */

export const CONFIG_SECTION = 'commitHelper';

/** Provider API Key 在 SecretStorage 中的键前缀（完整键：前缀 + providerId 小写） */
export const SECRET_API_KEY_PREFIX = 'commitHelper.apiKey.';

export const COMMANDS = {
  generate: 'commitHelper.generate',
  openSettings: 'commitHelper.openSettings',
} as const;

/** 配置键（与 package.json contributes.configuration 保持一致） */
export const KEYS = {
  providers: 'providers',
  models: 'models',
  commitModel: 'commitModel',
  promptTemplate: 'prompt.template',
  promptLanguage: 'prompt.language',
  maxDiffChars: 'maxDiffChars',
} as const;

export type ApiMode = 'openai' | 'openai-responses' | 'ollama' | 'anthropic' | 'custom';

export const API_MODES: ApiMode[] = ['openai', 'openai-responses', 'ollama', 'anthropic', 'custom'];

/**
 * 思考模式。undefined 表示**不发送**相关字段，交由服务端默认行为决定。
 * 这是刻意的三态设计：部分模型（如 DeepSeek 系列）默认开启思考，
 * 只有显式发送 disabled 才能关闭；而只支持默认关闭的服务端收到 disabled 可能报错。
 */
export type ThinkingMode = 'enabled' | 'disabled';

export const THINKING_MODES: ThinkingMode[] = ['enabled', 'disabled'];

export const API_MODE_LABELS: Record<ApiMode, string> = {
  openai: 'OpenAI 兼容（/chat/completions）',
  'openai-responses': 'OpenAI Responses（/responses）',
  ollama: 'Ollama（本地 /api/chat）',
  anthropic: 'Anthropic Claude',
  custom: '自定义请求',
};

export const DEFAULT_BASE_URLS: Record<ApiMode, string> = {
  openai: 'https://api.openai.com/v1',
  'openai-responses': 'https://api.openai.com/v1',
  ollama: 'http://localhost:11434',
  anthropic: 'https://api.anthropic.com/v1',
  custom: '',
};

export const DEFAULT_MODELS: Record<ApiMode, string> = {
  openai: 'gpt-4o-mini',
  'openai-responses': 'gpt-4o-mini',
  ollama: 'qwen2.5-coder:7b',
  anthropic: 'claude-sonnet-4-20250514',
  custom: '',
};

/**
 * Provider：一个 API 服务提供商。
 * apiKey 不存于此（存 SecretStorage，键为 SECRET_API_KEY_PREFIX + id 小写）。
 */
export interface ProviderConfig {
  /** 唯一 ID（小写字母数字），例如 "deepseek" */
  id: string;
  mode: ApiMode;
  baseUrl: string;
  timeout?: number;
  /** 最大输出 tokens；anthropic 模式该字段必填，未设置时用 DEFAULT_MAX_TOKENS */
  maxTokens?: number;
  /** 是否启用思考；不设置则不发送相关字段（见 ThinkingMode） */
  thinking?: ThinkingMode;
  customRequestTemplate?: string;
  headers?: Record<string, string>;
}

/**
 * 默认最大输出 tokens。
 * Anthropic Messages 协议中 max_tokens 为必填项，缺失会被服务端拒绝
 * （例如 LiteLLM 报 `anthropic_messages() missing 1 required positional argument: 'max_tokens'`）。
 * 取值需兼顾：过低会截断推理模型的思考过程，过高会被部分模型拒绝。
 */
export const DEFAULT_MAX_TOKENS = 4096;

/** Model：绑定到某个 Provider 的模型。 */
export interface ModelConfig {
  id: string;
  providerId: string;
  displayName?: string;
}

/** commitModel 的标识形式：providerId::modelId */
export function modelKey(m: { providerId: string; id: string }): string {
  return `${m.providerId}::${m.id}`;
}

export function parseModelKey(key: string): { providerId: string; modelId: string } | undefined {
  const idx = key.indexOf('::');
  if (idx <= 0) {
    return undefined;
  }
  return { providerId: key.slice(0, idx), modelId: key.slice(idx + 2) };
}

export const DEFAULT_PROMPT_TEMPLATE = `请根据以下 Git 变更生成一条符合 Conventional Commits 规范的 commit message。

变更文件：
{{files}}

Diff 摘要：
{{diff}}

要求：
1. 首行为 type(scope): subject，subject 不超过 50 字符
2. type 从 feat/fix/perf/style/tools/refactor/docs/test/build/ci/chore/merge/revert/hotfix/release/deps/config/init/add/update/remove 中选择
3. 有多处逻辑变更时用正文分条描述
4. 使用 {{language}} 输出
5. 只输出 commit message 本身，不要任何额外说明`;

/** 提示词模板支持的变量 */
export const PROMPT_VARIABLES: { name: string; description: string }[] = [
  { name: '{{diff}}', description: '变更内容（自动截断到 maxDiffChars）' },
  { name: '{{files}}', description: '变更文件列表（含增删行统计）' },
  { name: '{{branch}}', description: '当前分支名' },
  { name: '{{type}}', description: '按文件内容推断的变更类型统计' },
  { name: '{{language}}', description: '目标语言（zh / en）' },
];

/** Webview 面板标题 */
export const SETTINGS_PANEL_TITLE = 'Commit Helper 设置';
