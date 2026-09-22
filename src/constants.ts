/**
 * 全局常量：配置键、默认提示词、SecretStorage 键名、命令 ID。
 */

export const CONFIG_SECTION = 'commitHelper';

/** Provider API Key 在 SecretStorage 中的键前缀（完整键：前缀 + providerId 小写） */
export const SECRET_API_KEY_PREFIX = 'commitHelper.apiKey.';

export const COMMANDS = {
  generate: 'commitHelper.generate',
  openSettings: 'commitHelper.openSettings',
  /** 生成期间的占位按钮（SCM 视图标题栏，点击只提示「生成中」） */
  generateBusy: 'commitHelper.generateBusy',
} as const;

/**
 * 「正在生成」上下文键。
 * package.json 的 when 子句用它把 SCM 视图的魔法笔按钮替换成旋转图标，
 * 从 UI 层面杜绝生成期间的重复点击。
 */
export const CONTEXT_GENERATING = 'commitHelper.generating';

/**
 * 用户主动取消生成时的错误文案。
 * extension.ts 依赖该值识别「取消」并静默处理，避免当作失败弹错。
 */
export const CANCEL_MESSAGE = '已取消';

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
  /** 请求超时（秒）。作为**下限**，实际超时随提示词长度自适应上浮，见 resolveTimeoutSeconds */
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

/** 默认请求超时（秒）：Provider 未设置 timeout 时使用 */
export const DEFAULT_TIMEOUT_SECONDS = 30;

/** 自适应超时的基准粒度：提示词每满多少字符追加 1 秒 */
export const PROMPT_CHARS_PER_TIMEOUT_SECOND = 2000;

/**
 * 自适应超时上限（秒）。
 * 超大 diff 的推理请求可能耗时数分钟，但必须有硬上限兜底；
 * 另外用户显式配置了更大的值时以用户值为准，不做截断。
 */
export const MAX_TIMEOUT_SECONDS = 600;

/**
 * 按提示词长度计算实际请求超时（秒）。
 *
 * 固定超时对本地小 diff 够用，但 diff 拉满（如 maxDiffChars=384000）时，
 * 推理模型需要数分钟才能返回，30 秒必定超时。因此以配置值为下限，
 * 按提示词长度上浮（384k 字符约 +192 秒），并封顶 MAX_TIMEOUT_SECONDS。
 *
 * 请求本身可随时取消（见 apiClient 的 AbortSignal 支持），故上浮风险可控。
 */
export function resolveTimeoutSeconds(configured: number | undefined, promptChars: number): number {
  const base = configured && configured > 0 ? configured : DEFAULT_TIMEOUT_SECONDS;
  // 用 floor：不足一个粒度的提示词严格使用配置值，不做无意义的 +1 秒
  const extra = Math.floor(Math.max(0, promptChars) / PROMPT_CHARS_PER_TIMEOUT_SECOND);
  return Math.min(base + extra, Math.max(MAX_TIMEOUT_SECONDS, base));
}

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
export const SETTINGS_PANEL_TITLE = 'Commit Scribe 设置';
