import * as vscode from 'vscode';
import { API, GitExtension, Repository, Status } from './typings/git';
import { FileChangeEntry, PromptContext } from './promptTemplate';

/** 收集到的变更摘要 */
export interface ChangeSummary {
  files: FileChangeEntry[];
  diff: string;
  branch: string;
  repository: Repository;
}

/** 打开 git 仓库时无可用 API */
export class GitServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitServiceError';
  }
}

/** 获取内置 Git 扩展 API（兼容同步/异步返回） */
export async function getGitAPI(): Promise<API> {
  const ext = vscode.extensions.getExtension<GitExtension>('vscode.git');
  if (!ext) {
    throw new GitServiceError('未找到内置 Git 扩展（vscode.git），请确认其已启用。');
  }
  const api = ext.exports?.getAPI(1);
  if (!api) {
    throw new GitServiceError('内置 Git 扩展未初始化，请稍后重试。');
  }
  return api;
}

/**
 * 解析目标仓库：
 * - 若命令由 SCM 视图的仓库行菜单触发，VS Code 会传入该仓库的 SourceControl，
 *   直接用它匹配对应仓库（不再弹选择框）
 * - 否则（标题栏按钮/命令面板）回退到 pickRepository：单仓库直接用，多仓库按活动编辑器或用户选择
 */
export async function resolveRepository(api: API, commandArg?: unknown): Promise<Repository> {
  // SCM 视图仓库行菜单点击时，VS Code 传入该仓库的 SourceControl（git 扩展的 id 为 'git'）
  if (
    commandArg &&
    typeof commandArg === 'object' &&
    'id' in commandArg &&
    (commandArg as { id: string }).id === 'git'
  ) {
    const sc = commandArg as vscode.SourceControl;
    const match = api.repositories.find(r => r.sourceControl === sc);
    if (match) {
      return match;
    }
  }
  // 兼容：参数直接是 Repository
  if (commandArg && typeof commandArg === 'object' && (commandArg as Repository).rootUri) {
    const uri = (commandArg as Repository).rootUri;
    const match = api.getRepository(uri);
    if (match) {
      return match;
    }
  }
  return pickRepository(api);
}

/** 根据当前上下文选择仓库：活动编辑器所在仓库优先，否则让用户选择 */
export async function pickRepository(api: API): Promise<Repository> {
  const repos = api.repositories;
  if (repos.length === 0) {
    throw new GitServiceError('当前没有打开的 Git 仓库。');
  }
  if (repos.length === 1) {
    return repos[0];
  }

  // 优先活动编辑器所属仓库
  const active = vscode.window.activeTextEditor?.document.uri;
  if (active) {
    const match = api.getRepository(active);
    if (match) {
      return match;
    }
  }

  // 让用户选择
  const items = repos.map(r => ({
    label: r.rootUri.fsPath.split(/[\\/]/).pop() || r.rootUri.fsPath,
    description: r.rootUri.fsPath,
    repository: r,
  }));
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: '选择要生成 Commit Message 的仓库',
    matchOnDescription: true,
  });
  if (!picked) {
    throw new GitServiceError('已取消。');
  }
  return picked.repository;
}

/** Status → 中文状态映射 */
function mapStatus(status: Status): FileChangeEntry['status'] {
  switch (status) {
    case Status.INDEX_ADDED:
      return 'added';
    case Status.INDEX_DELETED:
    case Status.DELETED:
      return 'deleted';
    case Status.INDEX_RENAMED:
    case Status.INDEX_COPIED:
      return 'renamed';
    case Status.UNTRACKED:
    case Status.INTENT_TO_ADD:
    case Status.INTENT_TO_RENAME:
      return 'untracked';
    case Status.ADDED_BY_US:
    case Status.ADDED_BY_THEM:
    case Status.DELETED_BY_US:
    case Status.DELETED_BY_THEM:
    case Status.BOTH_ADDED:
    case Status.BOTH_DELETED:
    case Status.BOTH_MODIFIED:
      return 'conflicted';
    default:
      return 'modified';
  }
}

/** 解析 diff 文本，统计每个文件的增删行数（按 diff 中 @@ 块归属） */
function parseDiffStats(diff: string, paths: string[]): Map<string, { additions: number; deletions: number }> {
  const stats = new Map<string, { additions: number; deletions: number }>();
  for (const p of paths) {
    stats.set(p, { additions: 0, deletions: 0 });
  }

  let currentFile: string | undefined;
  const lines = diff.split('\n');
  for (const line of lines) {
    const fileHeader = /^\+\+\+\s+b\/(.+)$/.exec(line);
    if (fileHeader) {
      currentFile = fileHeader[1];
      continue;
    }
    if (!currentFile || !stats.has(currentFile)) {
      continue;
    }
    if (/^\+[^+]/.test(line)) {
      stats.get(currentFile)!.additions++;
    } else if (/^-[^-]/.test(line)) {
      stats.get(currentFile)!.deletions++;
    }
  }
  return stats;
}

/**
 * 逐文件获取 diff 文本并拼接。
 * 注意：git API 的 diffIndexWithHEAD/diffWithHEAD 不带 path 时返回 Change[]，
 * 只有传路径才返回该文件的 diff 字符串，因此必须逐个文件请求。
 */
async function collectDiffText(
  repository: Repository,
  paths: string[],
  scope: 'index' | 'worktree'
): Promise<string> {
  const parts: string[] = [];
  for (const p of paths) {
    try {
      const d =
        scope === 'index'
          ? await repository.diffIndexWithHEAD(p)
          : await repository.diffWithHEAD(p);
      if (typeof d === 'string' && d.trim()) {
        parts.push(d);
      }
    } catch {
      // 单个文件 diff 失败不阻断整体
    }
  }
  return parts.join('\n');
}

/**
 * 收集仓库变更摘要：
 * - 优先使用暂存（Staged）变更：diff = 暂存区 vs HEAD
 * - 若没有暂存变更，则使用未暂存变更（工作区 vs HEAD）
 * - files 与 diff 保持同源，避免提示词里文件列表与 diff 内容不一致
 * - branch：当前分支名
 */
export async function collectChanges(
  repository: Repository,
  opts: { maxDiffChars: number }
): Promise<ChangeSummary> {
  const indexChanges = repository.state.indexChanges;
  const workChanges = repository.state.workingTreeChanges;

  // 情况一：有暂存变更 → 只取暂存（diff 与文件列表同源）
  let effectiveChanges = indexChanges;
  let diff = '';
  if (indexChanges.length > 0) {
    diff = await collectDiffText(
      repository,
      indexChanges.map(c => c.uri.fsPath),
      'index'
    );
  } else if (workChanges.length > 0) {
    // 情况二：无暂存变更 → 取未暂存变更
    effectiveChanges = workChanges;
    diff = await collectDiffText(
      repository,
      workChanges.map(c => c.uri.fsPath),
      'worktree'
    );
  }

  if (effectiveChanges.length === 0) {
    throw new GitServiceError('当前仓库没有待提交的变更。');
  }

  // 去重：以路径为主键，staged 状态优先
  const byPath = new Map<string, { uri: vscode.Uri; status: Status }>();
  for (const c of effectiveChanges) {
    const key = c.uri.fsPath;
    const existing = byPath.get(key);
    if (!existing || isIndexStatus(c.status)) {
      byPath.set(key, { uri: c.uri, status: c.status });
    }
  }

  const files: FileChangeEntry[] = [];
  for (const { uri, status } of byPath.values()) {
    const rel = vscode.workspace.asRelativePath(uri, false) || uri.fsPath;
    files.push({
      path: rel,
      status: mapStatus(status),
      additions: 0,
      deletions: 0,
    });
  }

  // 统计增删行数
  if (diff) {
    const stats = parseDiffStats(diff, files.map(f => f.path));
    for (const f of files) {
      const s = stats.get(f.path);
      if (s) {
        f.additions = s.additions;
        f.deletions = s.deletions;
      }
    }
  }

  // 按 diff 长度截断（保留文件头信息）
  let truncated = diff;
  if (truncated.length > opts.maxDiffChars) {
    const head = truncated.slice(0, opts.maxDiffChars);
    const tail = truncated.slice(-300);
    truncated = `${head}\n\n…（diff 过长，已截断，共 ${diff.length} 字符，省略中间内容）…\n${tail}`;
  }

  const branch = repository.state.HEAD?.name ?? 'HEAD（游离状态）';

  return { files, diff: truncated, branch, repository };
}

function isIndexStatus(status: Status): boolean {
  return (
    status === Status.INDEX_MODIFIED ||
    status === Status.INDEX_ADDED ||
    status === Status.INDEX_DELETED ||
    status === Status.INDEX_RENAMED ||
    status === Status.INDEX_COPIED
  );
}

/** 构建完整的 PromptContext */
export function toPromptContext(summary: ChangeSummary, language: string): PromptContext {
  return {
    diff: summary.diff,
    files: summary.files,
    branch: summary.branch,
    language,
  };
}
