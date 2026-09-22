import {
  ApiMode,
  ProviderConfig,
  ThinkingMode,
  DEFAULT_MAX_TOKENS,
  DEFAULT_TIMEOUT_SECONDS,
  resolveTimeoutSeconds,
  CANCEL_MESSAGE,
} from './constants';

/** API 请求失败时抛出的错误 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Provider 运行时参数（ProviderConfig + 从 SecretStorage 取出的 apiKey） */
export interface ProviderRuntime {
  mode: ApiMode;
  baseUrl: string;
  apiKey: string;
  timeout?: number;
  maxTokens?: number;
  thinking?: ThinkingMode;
  customRequestTemplate?: string;
  headers?: Record<string, string>;
}

/** 由 ProviderConfig + apiKey 构建运行时参数 */
export function toRuntime(provider: ProviderConfig, apiKey: string): ProviderRuntime {
  return {
    mode: provider.mode,
    baseUrl: provider.baseUrl,
    apiKey,
    timeout: provider.timeout,
    maxTokens: provider.maxTokens,
    thinking: provider.thinking,
    customRequestTemplate: provider.customRequestTemplate,
    headers: provider.headers,
  };
}

/** 请求超时配置 */
interface TimeoutSetting {
  ms: number;
  /** 是否已按提示词长度自适应放宽（仅影响错误文案） */
  adaptive?: boolean;
}

/**
 * 带超时的 fetch。
 * @param signal 外部取消信号（用户点「取消」），与超时同时生效；
 *   两者都表现为 AbortError，因此靠 signal.aborted 区分，取消优先。
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeout: TimeoutSetting,
  signal?: AbortSignal
): Promise<Response> {
  if (signal?.aborted) {
    throw new ApiError(CANCEL_MESSAGE);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout.ms);
  const onAbort = (): void => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      if (signal?.aborted) {
        throw new ApiError(CANCEL_MESSAGE);
      }
      const seconds = timeout.ms / 1000;
      throw new ApiError(
        timeout.adaptive
          ? `请求超时（已等待 ${seconds} 秒）：已按提示词长度放宽超时，仍不够可调大 Provider 高级选项里的「超时」值，或改用更快的模型`
          : `请求超时（${seconds}s）`
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

const SYSTEM_PROMPT = '你是一个专业的 Git commit message 生成助手，只输出 commit message 本身。';

function buildChatBody(model: string, prompt: string, extra?: Record<string, unknown>) {
  return {
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    temperature: 0.3,
    ...(extra ?? {}),
  };
}

/** 合并自定义 headers */
function mergeHeaders(base: Record<string, string>, custom?: Record<string, string>): Record<string, string> {
  return { ...base, ...(custom ?? {}) };
}

/**
 * 按各协议规范生成 thinking 字段（未配置时返回空对象，即不发送任何相关字段）。
 * - Anthropic：顶层 `thinking: { type: 'enabled' | 'disabled' }`
 * - OpenAI 兼容 / Responses：顶层 `reasoning_effort`（DeepSeek 官方端点也支持该字段，
 *   且关闭思考同样走 reasoning_effort: 'none'）
 */
function thinkingFields(runtime: ProviderRuntime): Record<string, unknown> {
  if (!runtime.thinking) {
    return {};
  }
  if (runtime.mode === 'anthropic') {
    return { thinking: { type: runtime.thinking } };
  }
  return { reasoning_effort: runtime.thinking === 'enabled' ? 'high' : 'none' };
}

/** 按 mode 构建聊天补全请求 */
function buildChatRequest(
  runtime: ProviderRuntime,
  modelId: string,
  prompt: string
): { url: string; init: RequestInit } {
  const base = runtime.baseUrl.replace(/\/+$/, '');

  switch (runtime.mode) {
    case 'ollama': {
      return {
        url: `${base}/api/chat`,
        init: {
          method: 'POST',
          headers: mergeHeaders({ 'Content-Type': 'application/json' }, runtime.headers),
          body: JSON.stringify({
            model: modelId,
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: prompt },
            ],
            stream: false,
            options: { temperature: 0.3 },
          }),
        },
      };
    }

    case 'anthropic': {
      return {
        url: `${base}/messages`,
        init: {
          method: 'POST',
          headers: mergeHeaders(
            {
              'Content-Type': 'application/json',
              'x-api-key': runtime.apiKey,
              'anthropic-version': '2023-06-01',
            },
            runtime.headers
          ),
          body: JSON.stringify({
            model: modelId,
            // Anthropic Messages 协议中 max_tokens 为必填项，缺失会被服务端拒绝
            max_tokens: runtime.maxTokens ?? DEFAULT_MAX_TOKENS,
            // 开启思考时 temperature 必须为 1，故不发送（交由服务端默认）
            ...(runtime.thinking === 'enabled' ? {} : { temperature: 0.3 }),
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: prompt }],
            ...thinkingFields(runtime),
          }),
        },
      };
    }

    case 'custom': {
      const template =
        runtime.customRequestTemplate || '{"model": "{{model}}", "messages": {{messages}}}';
      let bodyText = template
        .replace(/\{\{\s*model\s*\}\}/g, modelId)
        .replace(/\{\{\s*messages\s*\}\}/g, () =>
          JSON.stringify(buildChatBody(modelId, prompt).messages)
        )
        .replace(/\{\{\s*prompt\s*\}\}/g, () => JSON.stringify(prompt));
      let body: unknown;
      try {
        body = JSON.parse(bodyText);
      } catch (err) {
        throw new ApiError(
          `custom 请求体模板不是合法 JSON：${err instanceof Error ? err.message : String(err)}`
        );
      }
      return {
        url: base || 'http://localhost:8000/v1/chat/completions',
        init: {
          method: 'POST',
          headers: mergeHeaders(
            {
              'Content-Type': 'application/json',
              ...(runtime.apiKey ? { Authorization: `Bearer ${runtime.apiKey}` } : {}),
            },
            runtime.headers
          ),
          body: JSON.stringify(body),
        },
      };
    }

    case 'openai-responses': {
      // OpenAI Responses API：POST /responses，input 为消息数组
      return {
        url: `${base}/responses`,
        init: {
          method: 'POST',
          headers: mergeHeaders(
            {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${runtime.apiKey}`,
            },
            runtime.headers
          ),
          body: JSON.stringify({
            model: modelId,
            input: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: prompt },
            ],
            temperature: 0.3,
            ...thinkingFields(runtime),
          }),
        },
      };
    }

    case 'openai':
    default: {
      return {
        url: `${base}/chat/completions`,
        init: {
          method: 'POST',
          headers: mergeHeaders(
            {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${runtime.apiKey}`,
            },
            runtime.headers
          ),
          body: JSON.stringify(buildChatBody(modelId, prompt, thinkingFields(runtime))),
        },
      };
    }
  }
}

/** 从多种响应结构里尽量提取模型文本 */
function extractContent(data: any): string {
  if (!data) {
    throw new ApiError('响应为空');
  }

  // 从 content 值中提取字符串：兼容字符串与多模态数组 [{type:'text',text:'...'}]
  const contentToString = (c: unknown): string => {
    if (typeof c === 'string') {
      return c;
    }
    if (Array.isArray(c)) {
      return c
        .map(part => {
          if (typeof part === 'string') {
            return part;
          }
          if (part && typeof part === 'object' && typeof part.text === 'string') {
            return part.text;
          }
          return '';
        })
        .join('');
    }
    return '';
  };

  // 遍历所有 choices，取第一个非空内容
  if (Array.isArray(data.choices)) {
    for (const choice of data.choices) {
      const message = choice?.message;
      if (message) {
        const content = contentToString(message.content);
        if (content) {
          return content;
        }
      }
      const text = contentToString(choice?.text);
      if (text) {
        return text;
      }
    }
  }

  // Responses API：output 为事件数组，取第一个 message 的文本
  if (Array.isArray(data.output)) {
    for (const item of data.output) {
      const content = contentToString(item?.content);
      if (content) {
        return content;
      }
    }
  }
  // Responses API 便捷字段 output_text
  if (typeof data.output_text === 'string' && data.output_text) {
    return data.output_text;
  }
  const msg = contentToString(data.message?.content);
  if (msg) {
    return msg;
  }
  const directContent = contentToString(data.content);
  if (directContent) {
    return directContent;
  }
  if (typeof data.response === 'string') {
    return data.response;
  }
  throw new ApiError(
    '模型未返回最终内容（message.content 为空）。推理模型可能因思维链过长耗尽输出上限，或需要关闭思考模式。请重试或更换模型。'
  );
}

/** 统一错误提取 */
async function toApiError(res: Response): Promise<ApiError> {
  const text = await res.text().catch(() => '');
  let detail = text;
  try {
    const json = JSON.parse(text);
    detail = json.error?.message || json.message || json.error?.toString() || text;
  } catch {
    /* 非 JSON 响应，直接用原文 */
  }
  return new ApiError(`HTTP ${res.status}：${detail}`, res.status, text);
}

/** Provider 配置的固定超时（毫秒）：仅用于模型列表等小请求 */
function fixedTimeoutMs(runtime: ProviderRuntime): number {
  const seconds = runtime.timeout && runtime.timeout > 0 ? runtime.timeout : DEFAULT_TIMEOUT_SECONDS;
  return seconds * 1000;
}

/** 发起请求并解析 JSON */
async function requestJson(
  runtime: ProviderRuntime,
  url: string,
  init: RequestInit,
  signal?: AbortSignal,
  timeout?: TimeoutSetting
): Promise<any> {
  let res: Response;
  try {
    res = await fetchWithTimeout(url, init, timeout ?? { ms: fixedTimeoutMs(runtime) }, signal);
  } catch (err) {
    if (err instanceof ApiError) {
      throw err;
    }
    throw new ApiError(`网络请求失败：${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) {
    throw await toApiError(res);
  }
  return res.json();
}

/**
 * 调用模型生成 commit message。
 * @param signal 取消信号；被取消时抛出 message 为 {@link CANCEL_MESSAGE} 的 ApiError
 * @returns 模型输出的文本（已去除首尾空白）
 */
export async function generateMessage(
  runtime: ProviderRuntime,
  modelId: string,
  prompt: string,
  signal?: AbortSignal
): Promise<string> {
  const { url, init } = buildChatRequest(runtime, modelId, prompt);
  // 超时随 prompt 长度自适应上浮，避免大 diff 必然超时
  const configuredSeconds =
    runtime.timeout && runtime.timeout > 0 ? runtime.timeout : DEFAULT_TIMEOUT_SECONDS;
  const seconds = resolveTimeoutSeconds(runtime.timeout, prompt.length);
  const data = await requestJson(runtime, url, init, signal, {
    ms: seconds * 1000,
    adaptive: seconds > configuredSeconds,
  });
  const content = extractContent(data).trim();
  if (!content) {
    throw new ApiError('模型返回了空内容');
  }
  return content;
}

/** 拉取 Provider 可用的模型列表 */
export async function fetchModels(runtime: ProviderRuntime): Promise<string[]> {
  const base = runtime.baseUrl.replace(/\/+$/, '');

  switch (runtime.mode) {
    case 'ollama': {
      const data = await requestJson(runtime, `${base}/api/tags`, {
        method: 'GET',
        headers: mergeHeaders({}, runtime.headers),
      });
      return Array.isArray(data?.models) ? data.models.map((m: any) => m.name).filter(Boolean) : [];
    }

    case 'anthropic': {
      const data = await requestJson(
        runtime,
        `${base}/models`,
        {
          method: 'GET',
          headers: mergeHeaders(
            { 'x-api-key': runtime.apiKey, 'anthropic-version': '2023-06-01' },
            runtime.headers
          ),
        }
      );
      return Array.isArray(data?.data) ? data.data.map((m: any) => m.id).filter(Boolean) : [];
    }

    case 'openai':
    case 'openai-responses': {
      const data = await requestJson(runtime, `${base}/models`, {
        method: 'GET',
        headers: mergeHeaders({ Authorization: `Bearer ${runtime.apiKey}` }, runtime.headers),
      });
      return Array.isArray(data?.data) ? data.data.map((m: any) => m.id).filter(Boolean) : [];
    }

    default:
      return [];
  }
}

/**
 * 测试连接：拉取模型列表（openai/ollama/anthropic 等）。
 * custom 模式无通用探活端点，发一次最小请求验证。
 */
export async function testConnection(
  runtime: ProviderRuntime,
  modelId: string
): Promise<{ message: string; models: string[] }> {
  if (runtime.mode === 'custom') {
    if (!runtime.baseUrl) {
      throw new ApiError('custom 模式需要填写完整请求 URL（API URL）');
    }
    const message = await generateMessage(runtime, modelId, '回复 OK 两个字即可。');
    return { message: `连接成功，模型响应：${message.slice(0, 100)}`, models: [] };
  }
  const models = await fetchModels(runtime);
  if (models.length > 0) {
    return { message: `连接成功，可用模型：${models.join('、')}`, models };
  }
  return { message: '连接成功', models: [] };
}

/**
 * 校验 Provider 配置必填项（不含 Model ID）。
 * @param apiKeySatisfied 本次未填 Key 时，是否已有可用 Key（已存储，或用户显式清除）
 */
export function validateProvider(
  provider: ProviderDraftLike,
  apiKeySatisfied = false
): string | undefined {
  if (!provider.id?.trim()) {
    return 'Provider ID 不能为空';
  }
  if (!provider.baseUrl?.trim()) {
    return 'API URL 不能为空';
  }
  // custom 模式的请求体模板可选（buildChatRequest 内有默认模板兜底）
  if (
    provider.mode !== 'ollama' &&
    provider.mode !== 'custom' &&
    !provider.apiKey &&
    !apiKeySatisfied
  ) {
    return 'API Key 不能为空（Ollama / 自定义模式不需要）';
  }
  return undefined;
}

/** 校验 Model ID */
export function validateModelId(modelId: string, mode: ApiMode): string | undefined {
  if (mode !== 'custom' && !modelId.trim()) {
    return 'Model ID 不能为空';
  }
  return undefined;
}

/** Provider 草稿（含 apiKey，供校验用） */
export interface ProviderDraftLike {
  id: string;
  mode: ApiMode;
  baseUrl: string;
  apiKey?: string;
  customRequestTemplate?: string;
}
