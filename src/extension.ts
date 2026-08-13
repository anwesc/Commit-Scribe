import * as vscode from 'vscode';
import { SettingsService } from './settingsService';
import { openSettingsPanel } from './settings/webviewPanel';
import { getGitAPI, resolveRepository, collectChanges, toPromptContext, GitServiceError } from './gitService';
import { renderTemplate } from './promptTemplate';
import { generateMessage, toRuntime, ApiError } from './apiClient';
import { COMMANDS, DEFAULT_PROMPT_TEMPLATE } from './constants';

export function activate(context: vscode.ExtensionContext): void {
  const settingsService = new SettingsService(context.secrets);

  // 命令：打开设置面板
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.openSettings, () => {
      openSettingsPanel(settingsService);
    })
  );

  // 命令：根据待提交变更生成 Commit Message
  // SCM 视图仓库行菜单点击时会传入该仓库的 SourceControl 作为第一个参数
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.generate, async (sourceControl?: unknown) => {
      await generateCommitMessage(settingsService, sourceControl);
    })
  );

  // 状态栏入口：显示当前使用的模型，点击打开设置面板
  const statusBarItem = createStatusBarItem(settingsService);
  context.subscriptions.push(statusBarItem);

  vscode.window.setStatusBarMessage('Commit Helper 已激活', 3000);
}

/** 创建状态栏项：显示当前 commit 模型，点击打开设置面板 */
function createStatusBarItem(settingsService: SettingsService): vscode.Disposable {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  item.command = COMMANDS.openSettings;
  item.text = '$(wand) Commit Helper';
  item.tooltip = 'Commit Helper：点击打开设置';
  item.show();

  const update = async (): Promise<void> => {
    const active = await settingsService.resolveActiveModel();
    if (active) {
      item.text = `$(wand) ${active.model.id}`;
      item.tooltip = `Commit Helper · ${active.provider.id}/${active.model.id} · 点击打开设置`;
    } else {
      item.text = '$(wand) Commit Helper';
      item.tooltip = 'Commit Helper：未配置模型，点击打开设置';
    }
  };
  void update();

  // 配置变化时刷新状态栏文本
  const onConfigChange = vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('commitHelper')) {
      void update();
    }
  });

  return vscode.Disposable.from(item, onConfigChange);
}

export function deactivate(): void {
  // 无需额外清理（subscriptions 由 VS Code 统一释放）
}

async function generateCommitMessage(settingsService: SettingsService, commandArg?: unknown): Promise<void> {
  try {
    const api = await getGitAPI();
    // 仓库行菜单点击 → 直接用该仓库；标题栏按钮/命令面板 → 自动选择
    const repository = await resolveRepository(api, commandArg);

    // 解析当前使用的 Provider + Model
    const active = await settingsService.resolveActiveModel();
    if (!active) {
      const action = await vscode.window.showErrorMessage(
        'Commit Helper 尚未配置 Provider 和 Model。请先添加。',
        '打开设置面板'
      );
      if (action === '打开设置面板') {
        openSettingsPanel(settingsService);
      }
      return;
    }

    const maxDiffChars = settingsService.maxDiffChars;
    const language = settingsService.language;

    const summary = await collectChanges(repository, { maxDiffChars });
    if (summary.files.length === 0) {
      vscode.window.showInformationMessage('当前仓库没有待提交的变更。');
      return;
    }

    const template = settingsService.promptTemplate || DEFAULT_PROMPT_TEMPLATE;
    const prompt = renderTemplate(template, toPromptContext(summary, language));

    const runtime = toRuntime(active.provider, active.apiKey);
    const message = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Commit Helper：正在使用 ${active.provider.id}/${active.model.id} 为 ${summary.files.length} 个变更文件生成提交信息…`,
        cancellable: false,
      },
      () => generateMessage(runtime, active.model.id, prompt)
    );

    // 自动填入提交输入框（固定行为）；SourceControlInputBox 无 show()，打开 SCM 视图让用户看到
    repository.inputBox.value = message;
    await vscode.commands.executeCommand('workbench.view.scm');
    vscode.window.showInformationMessage('✅ Commit Message 已生成并填入输入框，可修改后提交。');
  } catch (err) {
    if (err instanceof Error && err.message === '已取消') {
      return;
    }
    const message =
      err instanceof GitServiceError || err instanceof ApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    const action = await vscode.window.showErrorMessage(`Commit Helper 生成失败：${message}`, '打开设置面板');
    if (action === '打开设置面板') {
      openSettingsPanel(settingsService);
    }
  }
}
