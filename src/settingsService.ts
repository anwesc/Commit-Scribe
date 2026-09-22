import * as vscode from 'vscode';
import {
  CONFIG_SECTION,
  KEYS,
  SECRET_API_KEY_PREFIX,
  API_MODES,
  THINKING_MODES,
  ApiMode,
  ThinkingMode,
  ProviderConfig,
  ModelConfig,
  DEFAULT_BASE_URLS,
  modelKey,
} from './constants';

/** API Key 的 SecretStorage 键 */
function providerSecretKey(providerId: string): string {
  return `${SECRET_API_KEY_PREFIX}${providerId.toLowerCase()}`;
}

/** 前端面板回传的 Provider 数据（apiKey 单独处理） */
export interface ProviderDraft {
  id: string;
  mode: ApiMode;
  baseUrl: string;
  timeout?: number;
  maxTokens?: number;
  thinking?: ThinkingMode;
  customRequestTemplate?: string;
  headers?: Record<string, string>;
}

/** 前端面板回传的 Model 数据 */
export interface ModelDraft {
  id: string;
  providerId: string;
  displayName?: string;
}

/** 提示词及相关配置（提示词模板板块保存的内容） */
export interface PromptSettings {
  promptTemplate: string;
  language: string;
  maxDiffChars: number;
}

/** 面板初始化数据（全量快照） */
export interface PanelInitData {
  providers: ProviderDraft[];
  providerApiKeys: Record<string, boolean>; // providerId → 是否已配置 key
  models: ModelConfig[];
  commitModel: string;
  prompt: PromptSettings;
}

/**
 * 设置服务：唯一的数据源。
 * - providers/models/提示词等走 workspace.getConfiguration（settings.json，machine scope）
 * - 各 Provider 的 API Key 存 SecretStorage（vscode 密钥链），不进 settings.json
 */
export class SettingsService implements vscode.Disposable {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  get<T>(key: string): T | undefined {
    return vscode.workspace.getConfiguration(CONFIG_SECTION).get<T>(key);
  }

  async update(key: string, value: unknown): Promise<void> {
    await vscode.workspace
      .getConfiguration(CONFIG_SECTION)
      .update(key, value, vscode.ConfigurationTarget.Global);
  }

  // ---------- Providers ----------

  get providers(): ProviderConfig[] {
    const raw = this.get<ProviderConfig[]>(KEYS.providers) ?? [];
    // 兜底：历史数据可能缺失/写错 mode 字段，统一规范为合法 ApiMode
    return raw.map(p => ({ ...p, mode: normalizeApiMode(p.mode) }));
  }

  findProvider(id: string): ProviderConfig | undefined {
    return this.providers.find(p => p.id === id);
  }

  /** 新增或更新 Provider；返回错误信息（无则成功） */
  async saveProvider(draft: ProviderDraft, apiKey: string | undefined): Promise<string | undefined> {
    const id = draft.id.trim().toLowerCase();
    if (!id) {
      return 'Provider ID 不能为空';
    }
    if (!/^[a-z0-9_-]+$/.test(id)) {
      return 'Provider ID 只能包含小写字母、数字、下划线和中划线';
    }

    // 前端可能未带上 mode（历史字段名不一致），按 id 回退到已存配置，再回退默认 openai
    const mode = normalizeApiMode(draft.mode ?? this.findProvider(id)?.mode);

    const providers = this.providers;
    const index = providers.findIndex(p => p.id === id);
    const newProvider: ProviderConfig = {
      id,
      mode,
      baseUrl: draft.baseUrl?.trim() || DEFAULT_BASE_URLS[mode] || '',
      timeout: draft.timeout,
      maxTokens: draft.maxTokens,
      thinking: normalizeThinking(draft.thinking),
      customRequestTemplate: draft.customRequestTemplate,
      headers: draft.headers,
    };

    if (index >= 0) {
      providers[index] = newProvider;
    } else {
      providers.push(newProvider);
    }
    await this.update(KEYS.providers, providers);

    if (apiKey !== undefined) {
      if (apiKey) {
        await this.secrets.store(providerSecretKey(id), apiKey);
      } else {
        await this.secrets.delete(providerSecretKey(id));
      }
    }
    return undefined;
  }

  async deleteProvider(id: string): Promise<void> {
    const providers = this.providers.filter(p => p.id !== id);
    await this.update(KEYS.providers, providers);
    await this.secrets.delete(providerSecretKey(id));

    // 级联删除该 Provider 下的模型，并清理 commitModel 引用
    const models = this.models.filter(m => m.providerId !== id);
    await this.update(KEYS.models, models);
    const commitModel = this.get<string>(KEYS.commitModel);
    if (commitModel && commitModel.startsWith(`${id}::`)) {
      await this.update(KEYS.commitModel, '');
    }
  }

  async getProviderApiKey(id: string): Promise<string | undefined> {
    const key = await this.secrets.get(providerSecretKey(id));
    return key || undefined;
  }

  // ---------- Models ----------

  get models(): ModelConfig[] {
    return this.get<ModelConfig[]>(KEYS.models) ?? [];
  }

  /** 新增或更新 Model；返回错误信息（无则成功） */
  async saveModel(draft: ModelDraft): Promise<string | undefined> {
    const id = draft.id.trim();
    if (!id) {
      return 'Model ID 不能为空';
    }
    if (!this.findProvider(draft.providerId)) {
      return '所属 Provider 不存在';
    }

    const models = this.models;
    const index = models.findIndex(m => m.providerId === draft.providerId && m.id === id);
    const newModel: ModelConfig = {
      id,
      providerId: draft.providerId,
      displayName: draft.displayName,
    };
    if (index >= 0) {
      models[index] = newModel;
    } else {
      models.push(newModel);
    }
    await this.update(KEYS.models, models);
    return undefined;
  }

  async deleteModel(providerId: string, id: string): Promise<void> {
    const models = this.models.filter(m => !(m.providerId === providerId && m.id === id));
    await this.update(KEYS.models, models);
    if (this.get<string>(KEYS.commitModel) === modelKey({ providerId, id })) {
      await this.update(KEYS.commitModel, '');
    }
  }

  // ---------- 当前使用的模型（生成 commit 用） ----------

  get commitModel(): string {
    return this.get<string>(KEYS.commitModel) ?? '';
  }

  /**
   * 解析当前使用的模型，返回对应的 Provider + Model + API Key。
   * 若 commitModel 未设置或失效，回退到第一个 Provider 的第一个 Model。
   */
  async resolveActiveModel(): Promise<{ provider: ProviderConfig; model: ModelConfig; apiKey: string } | undefined> {
    const models = this.models;

    let parsed = this.commitModel ? parseModelKeySafe(this.commitModel) : undefined;
    let provider = parsed ? this.findProvider(parsed.providerId) : undefined;
    let model = parsed
      ? models.find(m => m.providerId === parsed.providerId && m.id === parsed.modelId)
      : undefined;

    // 回退：第一个 provider + 其第一个 model
    if (!provider || !model) {
      for (const p of this.providers) {
        const m = models.find(x => x.providerId === p.id);
        if (m) {
          provider = p;
          model = m;
          break;
        }
      }
    }
    if (!provider || !model) {
      return undefined;
    }
    const apiKey = (await this.getProviderApiKey(provider.id)) ?? '';
    return { provider, model, apiKey };
  }

  /** 设置当前 commit 使用的模型 */
  async setCommitModel(modelKeyStr: string): Promise<void> {
    await this.update(KEYS.commitModel, modelKeyStr);
  }

  // ---------- 提示词及其他 ----------

  get promptTemplate(): string {
    return this.get<string>(KEYS.promptTemplate) ?? '';
  }

  get language(): string {
    return this.get<string>(KEYS.promptLanguage) ?? 'zh';
  }

  get maxDiffChars(): number {
    return this.get<number>(KEYS.maxDiffChars) ?? 4000;
  }

  get promptSettings(): PromptSettings {
    return {
      promptTemplate: this.promptTemplate,
      language: this.language,
      maxDiffChars: this.maxDiffChars,
    };
  }

  async savePromptSettings(settings: PromptSettings): Promise<void> {
    await Promise.all([
      this.update(KEYS.promptTemplate, settings.promptTemplate),
      this.update(KEYS.promptLanguage, settings.language),
      this.update(KEYS.maxDiffChars, settings.maxDiffChars),
    ]);
  }

  /** 面板初始化快照 */
  async getPanelInitData(): Promise<PanelInitData> {
    const providers = this.providers.map<ProviderDraft>(p => ({
      id: p.id,
      mode: p.mode,
      baseUrl: p.baseUrl,
      timeout: p.timeout,
      maxTokens: p.maxTokens,
      thinking: p.thinking,
      customRequestTemplate: p.customRequestTemplate,
      headers: p.headers,
    }));
    const providerApiKeys: Record<string, boolean> = {};
    for (const p of providers) {
      providerApiKeys[p.id] = !!(await this.getProviderApiKey(p.id));
    }
    return {
      providers,
      providerApiKeys,
      models: this.models,
      commitModel: this.commitModel,
      prompt: this.promptSettings,
    };
  }

  dispose(): void {
    // SecretStorage 由扩展上下文管理
  }
}

function parseModelKeySafe(key: string): { providerId: string; modelId: string } | undefined {
  const idx = key.indexOf('::');
  if (idx <= 0) {
    return undefined;
  }
  return { providerId: key.slice(0, idx), modelId: key.slice(idx + 2) };
}

/** 把任意来源的 mode 值规范为合法 ApiMode（无效值回退 openai） */
function normalizeApiMode(value: unknown): ApiMode {
  return API_MODES.includes(value as ApiMode) ? (value as ApiMode) : 'openai';
}

/** 规范 thinking 三态；未设置或非法值一律视为「不发送」（undefined） */
function normalizeThinking(value: unknown): ThinkingMode | undefined {
  return THINKING_MODES.includes(value as ThinkingMode) ? (value as ThinkingMode) : undefined;
}
