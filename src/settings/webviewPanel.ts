import * as vscode from 'vscode';
import { SettingsService, ProviderDraft, ModelDraft, PromptSettings } from '../settingsService';
import { getWebviewContent } from './webviewContent';
import { testConnection, fetchModels, ApiError, toRuntime, validateProvider, validateModelId } from '../apiClient';
import { renderPreview, findUnknownVariables } from '../promptTemplate';
import { SETTINGS_PANEL_TITLE } from '../constants';

/** Webview → 扩展 的消息 */
type WebviewMessage =
  | { type: 'requestInit' }
  | { type: 'saveProvider'; provider: ProviderDraft; apiKey?: string; apiKeyCleared?: boolean }
  | { type: 'deleteProvider'; id: string }
  | { type: 'fetchModels'; providerId: string }
  | { type: 'testConnection'; providerId: string; modelId: string }
  | { type: 'saveModel'; model: ModelDraft }
  | { type: 'deleteModel'; providerId: string; modelId: string }
  | { type: 'savePrompt'; prompt: PromptSettings; commitModel?: string }
  | { type: 'preview'; template: string; language: string };

/** 设置面板：单例 Webview */
export class SettingsPanel {
  private static current: SettingsPanel | undefined;

  static createOrShow(settingsService: SettingsService): SettingsPanel {
    if (SettingsPanel.current) {
      SettingsPanel.current.panel.reveal(vscode.ViewColumn.One);
      return SettingsPanel.current;
    }
    return new SettingsPanel(settingsService);
  }

  static close(): void {
    if (SettingsPanel.current) {
      SettingsPanel.current.dispose();
    }
  }

  readonly panel: vscode.WebviewPanel;
  private readonly settingsService: SettingsService;
  private disposables: vscode.Disposable[] = [];

  private constructor(settingsService: SettingsService) {
    this.settingsService = settingsService;
    this.panel = vscode.window.createWebviewPanel(
      'commitHelper.settings',
      SETTINGS_PANEL_TITLE,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [],
      }
    );

    this.panel.webview.html = getWebviewContent();
    this.panel.webview.onDidReceiveMessage(
      msg => this.handleMessage(msg as WebviewMessage),
      undefined,
      this.disposables
    );
    this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables);

    SettingsPanel.current = this;
  }

  private dispose(): void {
    SettingsPanel.current = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      const d = this.disposables.pop();
      d?.dispose();
    }
  }

  private async handleMessage(msg: WebviewMessage): Promise<void> {
    switch (msg.type) {
      case 'requestInit':
        await this.postInit();
        break;

      case 'saveProvider': {
        const { provider, apiKey, apiKeyCleared } = msg;
        // 编辑已有 Provider 时：
        //  - 输入框留空（未改 Key）→ 沿用已存储的 Key
        //  - 点了「清除已存 Key」→ 允许保存空 Key
        const apiKeySatisfied =
          !apiKey && (apiKeyCleared || !!(await this.settingsService.getProviderApiKey(provider.id)));
        const missing = validateProvider({ ...provider, apiKey }, apiKeySatisfied);
        if (missing) {
          this.post({ type: 'providerSaveResult', ok: false, message: missing });
          return;
        }
        try {
          let keyToSave: string | undefined;
          if (apiKeyCleared) {
            keyToSave = '';
          } else if (apiKey) {
            keyToSave = apiKey;
          }
          const err = await this.settingsService.saveProvider(provider, keyToSave);
          if (err) {
            this.post({ type: 'providerSaveResult', ok: false, message: err });
            return;
          }
          this.post({ type: 'providerSaveResult', ok: true, message: 'Provider 已保存' });
          await this.postInit();
        } catch (err) {
          this.post({
            type: 'providerSaveResult',
            ok: false,
            message: `保存失败：${err instanceof Error ? err.message : String(err)}`,
          });
        }
        break;
      }

      case 'deleteProvider': {
        try {
          await this.settingsService.deleteProvider(msg.id);
          this.post({ type: 'providerDeleteResult', ok: true, message: `Provider ${msg.id} 已删除` });
          await this.postInit();
        } catch (err) {
          this.post({
            type: 'providerDeleteResult',
            ok: false,
            message: `删除失败：${err instanceof Error ? err.message : String(err)}`,
          });
        }
        break;
      }

      case 'fetchModels': {
        const provider = this.settingsService.findProvider(msg.providerId);
        if (!provider) {
          this.post({ type: 'modelsFetchResult', ok: false, message: 'Provider 不存在', models: [] });
          return;
        }
        try {
          const apiKey = (await this.settingsService.getProviderApiKey(provider.id)) ?? '';
          const models = await fetchModels(toRuntime(provider, apiKey));
          this.post({ type: 'modelsFetchResult', ok: true, message: `拉取到 ${models.length} 个模型`, models });
        } catch (err) {
          const message =
            err instanceof ApiError ? err.message : `拉取失败：${err instanceof Error ? err.message : String(err)}`;
          this.post({ type: 'modelsFetchResult', ok: false, message, models: [] });
        }
        break;
      }

      case 'testConnection': {
        const provider = this.settingsService.findProvider(msg.providerId);
        if (!provider) {
          this.post({ type: 'testResult', ok: false, message: 'Provider 不存在' });
          return;
        }
        const missing = validateModelId(msg.modelId, provider.mode);
        if (missing) {
          this.post({ type: 'testResult', ok: false, message: missing });
          return;
        }
        this.post({ type: 'testResult', ok: true, message: '正在测试连接…', loading: true });
        try {
          const apiKey = (await this.settingsService.getProviderApiKey(provider.id)) ?? '';
          const result = await testConnection(toRuntime(provider, apiKey), msg.modelId);
          this.post({ type: 'testResult', ok: true, message: result.message, models: result.models });
        } catch (err) {
          const message =
            err instanceof ApiError ? err.message : `测试失败：${err instanceof Error ? err.message : String(err)}`;
          this.post({ type: 'testResult', ok: false, message });
        }
        break;
      }

      case 'saveModel': {
        const providerMode = this.settingsService.findProvider(msg.model.providerId)?.mode ?? 'openai';
        const missing = validateModelId(msg.model.id, providerMode);
        if (missing) {
          this.post({ type: 'modelSaveResult', ok: false, message: missing });
          return;
        }
        try {
          const err = await this.settingsService.saveModel(msg.model);
          if (err) {
            this.post({ type: 'modelSaveResult', ok: false, message: err });
            return;
          }
          this.post({ type: 'modelSaveResult', ok: true, message: 'Model 已保存' });
          await this.postInit();
        } catch (err) {
          this.post({
            type: 'modelSaveResult',
            ok: false,
            message: `保存失败：${err instanceof Error ? err.message : String(err)}`,
          });
        }
        break;
      }

      case 'deleteModel': {
        try {
          await this.settingsService.deleteModel(msg.providerId, msg.modelId);
          this.post({ type: 'modelDeleteResult', ok: true, message: 'Model 已删除' });
          await this.postInit();
        } catch (err) {
          this.post({
            type: 'modelDeleteResult',
            ok: false,
            message: `删除失败：${err instanceof Error ? err.message : String(err)}`,
          });
        }
        break;
      }

      case 'savePrompt': {
        try {
          await this.settingsService.savePromptSettings(msg.prompt);
          if (msg.commitModel !== undefined) {
            await this.settingsService.setCommitModel(msg.commitModel);
          }
          this.post({ type: 'promptSaveResult', ok: true, message: '已保存' });
          await this.postInit();
        } catch (err) {
          this.post({
            type: 'promptSaveResult',
            ok: false,
            message: `保存失败：${err instanceof Error ? err.message : String(err)}`,
          });
        }
        break;
      }

      case 'preview': {
        const preview = renderPreview(msg.template, msg.language);
        const unknown = findUnknownVariables(msg.template);
        this.post({ type: 'previewResult', preview, unknownVars: unknown });
        break;
      }
    }
  }

  private async postInit(): Promise<void> {
    const data = await this.settingsService.getPanelInitData();
    this.post({ type: 'init', data });
  }

  private post(message: unknown): void {
    if (!this.panel.webview) {
      return;
    }
    void this.panel.webview.postMessage(message);
  }
}

/** 供 extension.ts 调用的便捷入口 */
export function openSettingsPanel(settingsService: SettingsService): void {
  SettingsPanel.createOrShow(settingsService);
}
