import * as vscode from 'vscode';
import { SettingsService } from './settingsService';
import { openSettingsPanel } from './settings/webviewPanel';
import { getGitAPI, resolveRepository, collectChanges, toPromptContext, GitServiceError } from './gitService';
import { renderTemplate } from './promptTemplate';
import { generateMessage, toRuntime, ApiError } from './apiClient';
import { COMMANDS, CONTEXT_GENERATING, CANCEL_MESSAGE, DEFAULT_PROMPT_TEMPLATE } from './constants';

/** 状态栏控制器：除生命周期管理外，还能切换「生成中」显示 */
interface StatusBarController extends vscode.Disposable {
  setBusy(busy: boolean): void;
}

/** 生成互斥标志：防止并发请求（与 UI 层的按钮替换互为兜底） */
let generating = false;

export function activate(context: vscode.ExtensionContext): void {
  const settingsService = new SettingsService(context.secrets);

  // 状态栏入口：显示当前使用的模型，点击打开设置面板；生成期间显示旋转图标
  const statusBar = createStatusBarItem(settingsService);
  context.subscriptions.push(statusBar);

  // 命令：打开设置面板
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.openSettings, () => {
      openSettingsPanel(settingsService);
    })
  );

  // 命令：生成期间的占位按钮（点击只提示，不做任何请求）
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.generateBusy, () => {
      void vscode.window.showInformationMessage('Commit Scribe 正在生成中，请稍候…');
    })
  );

  // 命令：根据待提交变更生成 Commit Message
  // SCM 视图仓库行菜单点击时会传入该仓库的 SourceControl 作为第一个参数
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.generate, async (sourceControl?: unknown) => {
      await generateCommitMessage(settingsService, statusBar, sourceControl);
    })
  );

  vscode.window.setStatusBarMessage('Commit Scribe 已激活', 3000);
}

/** 创建状态栏项：显示当前 commit 模型，点击打开设置面板 */
function createStatusBarItem(settingsService: SettingsService): StatusBarController {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  let busy = false;
  let idleText = '$(wand) Commit Scribe';
  let idleTooltip = 'Commit Scribe：点击打开设置';

  const render = (): void => {
    if (busy) {
      item.text = '$(sync~spin) Commit Scribe 生成中…';
      item.tooltip = 'Commit Scribe：正在生成 commit message…';
      item.command = undefined; // 生成期间不响应点击
      return;
    }
    item.text = idleText;
    item.tooltip = idleTooltip;
    item.command = COMMANDS.openSettings;
  };

  const update = async (): Promise<void> => {
    const active = await settingsService.resolveActiveModel();
    if (active) {
      idleText = `$(wand) ${active.model.id}`;
      idleTooltip = `Commit Scribe · ${active.provider.id}/${active.model.id} · 点击打开设置`;
    } else {
      idleText = '$(wand) Commit Scribe';
      idleTooltip = 'Commit Scribe：未配置模型，点击打开设置';
    }
    render();
  };
  render();
  item.show();
  void update();

  // 配置变化时刷新状态栏文本
  const onConfigChange = vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('commitHelper')) {
      void update();
    }
  });

  return {
    setBusy: (value: boolean) => {
      busy = value;
      render();
    },
    dispose: () => {
      onConfigChange.dispose();
      item.dispose();
    },
  };
}

/** 同步「生成中」状态：状态栏图标 + SCM 按钮替换所依赖的上下文键 */
async function setGeneratingState(statusBar: StatusBarController, busy: boolean): Promise<void> {
  statusBar.setBusy(busy);
  await vscode.commands.executeCommand('setContext', CONTEXT_GENERATING, busy);
}

export function deactivate(): void {
  // 无需额外清理（subscriptions 由 VS Code 统一释放）
}

async function generateCommitMessage(
  settingsService: SettingsService,
  statusBar: StatusBarController,
  commandArg?: unknown
): Promise<void> {
  // 生成期间忽略重复触发（SCM 按钮此时已替换为「生成中」占位，此处为兜底）
  if (generating) {
    return;
  }
  generating = true;
  try {
    await setGeneratingState(statusBar, true);
    const api = await getGitAPI();
    // 仓库行菜单点击 → 直接用该仓库；标题栏按钮/命令面板 → 自动选择
    const repository = await resolveRepository(api, commandArg);

    // 解析当前使用的 Provider + Model
    const active = await settingsService.resolveActiveModel();
    if (!active) {
      const action = await vscode.window.showErrorMessage(
        'Commit Scribe 尚未配置 Provider 和 Model。请先添加。',
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
        title: `Commit Scribe：正在使用 ${active.provider.id}/${active.model.id} 为 ${summary.files.length} 个变更文件生成提交信息…`,
        cancellable: true,
      },
      (_progress, token) => {
        // 点进度通知上的「取消」→ 中止正在进行的 HTTP 请求
        const controller = new AbortController();
        token.onCancellationRequested(() => controller.abort());
        return generateMessage(runtime, active.model.id, prompt, controller.signal);
      }
    );

    // 自动填入提交输入框（固定行为）；SourceControlInputBox 无 show()，打开 SCM 视图让用户看到
    repository.inputBox.value = message;
    await vscode.commands.executeCommand('workbench.view.scm');
    vscode.window.showInformationMessage('✅ Commit Message 已生成并填入输入框，可修改后提交。');
  } catch (err) {
    // 用户主动取消：静默收尾，只给一条轻提示，不当作失败
    if (err instanceof ApiError && err.message === CANCEL_MESSAGE) {
      vscode.window.showInformationMessage('Commit Scribe：已取消生成。');
      return;
    }
    const message =
      err instanceof GitServiceError || err instanceof ApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    const action = await vscode.window.showErrorMessage(`Commit Scribe 生成失败：${message}`, '打开设置面板');
    if (action === '打开设置面板') {
      openSettingsPanel(settingsService);
    }
  } finally {
    generating = false;
    // 恢复 UI 状态时不让异常掩盖原始错误
    await setGeneratingState(statusBar, false).catch(() => undefined);
  }
}
