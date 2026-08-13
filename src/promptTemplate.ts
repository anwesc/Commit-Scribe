/**
 * 提示词模板系统：变量替换、默认模板、预览渲染。
 *
 * 变量：
 *   {{diff}}     变更内容（截断后）
 *   {{files}}    变更文件列表（含增删行统计）
 *   {{branch}}   当前分支名
 *   {{type}}     变更类型统计（feat/fix/...）
 *   {{language}} 目标语言
 */

/** 变更文件条目 */
export interface FileChangeEntry {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked' | 'conflicted';
  additions: number;
  deletions: number;
}

/** 生成提示词时提供的上下文 */
export interface PromptContext {
  diff: string;
  files: FileChangeEntry[];
  branch: string;
  language: string;
}

const TYPE_LABELS: Record<FileChangeEntry['status'], string> = {
  added: '新增',
  modified: '修改',
  deleted: '删除',
  renamed: '重命名',
  untracked: '未跟踪',
  conflicted: '冲突',
};

/** 渲染文件列表文本 */
export function formatFiles(files: FileChangeEntry[]): string {
  if (files.length === 0) {
    return '（无）';
  }
  return files
    .map(f => {
      const stats =
        f.status === 'added' || f.status === 'modified' || f.status === 'untracked'
          ? ` (+${f.additions}/-${f.deletions})`
          : '';
      return `- [${TYPE_LABELS[f.status]}] ${f.path}${stats}`;
    })
    .join('\n');
}

/** 渲染变更类型统计（供 {{type}} 变量使用） */
export function formatTypeStats(files: FileChangeEntry[]): string {
  const counts = new Map<string, number>();
  for (const f of files) {
    counts.set(f.status, (counts.get(f.status) ?? 0) + 1);
  }
  if (counts.size === 0) {
    return '无';
  }
  return [...counts.entries()]
    .map(([status, n]) => `${TYPE_LABELS[status as FileChangeEntry['status']]} ${n} 个`)
    .join('，');
}

/**
 * 渲染模板：把所有 {{变量}} 替换为实际内容。
 * 未提供或未知的变量替换为空字符串。
 */
export function renderTemplate(template: string, ctx: PromptContext): string {
  const vars: Record<string, string> = {
    '{{diff}}': ctx.diff,
    '{{files}}': formatFiles(ctx.files),
    '{{branch}}': ctx.branch,
    '{{type}}': formatTypeStats(ctx.files),
    '{{language}}': ctx.language,
  };

  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (raw, name: string) => {
    const key = `{{${name.toLowerCase()}}}`;
    return vars[key] ?? '';
  });
}

/**
 * 预览渲染：用示例数据渲染模板，供设置面板「预览」按钮使用，
 * 让用户在没有真实变更时也能看到提示词效果。
 */
export function renderPreview(template: string, language: string): string {
  const sampleFiles: FileChangeEntry[] = [
    { path: 'src/gitService.ts', status: 'modified', additions: 42, deletions: 8 },
    { path: 'src/settingsService.ts', status: 'added', additions: 156, deletions: 0 },
    { path: 'src/constants.ts', status: 'modified', additions: 3, deletions: 1 },
    { path: 'docs/README.md', status: 'modified', additions: 12, deletions: 2 },
  ];
  return renderTemplate(template, {
    diff:
      '@@ -10,6 +10,8 @@\n  export class SettingsService {\n+  async getApiKey() { ... }\n+  async setApiKey() { ... }\n   get mode() { ... }\n   get baseUrl() { ... }',
    files: sampleFiles,
    branch: 'feat/settings-panel',
    language,
  });
}

/** 校验模板中是否存在未知变量（面板里提示） */
export function findUnknownVariables(template: string): string[] {
  const known = new Set(['diff', 'files', 'branch', 'type', 'language']);
  const found = new Set<string>();
  template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_raw, name: string) => {
    if (!known.has(name.toLowerCase())) {
      found.add(name.toLowerCase());
    }
    return '';
  });
  return [...found];
}
