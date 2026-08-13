/**
 * VS Code 内置 Git 扩展 API 的类型定义（精简版）。
 * 完整定义见 https://github.com/microsoft/vscode/blob/main/extensions/git/src/api/git.d.ts
 * 仅包含本项目使用到的接口。
 */

import * as vscode from 'vscode';

export const enum RefType {
  Head,
  RemoteHead,
  Tag,
}

export interface Ref {
  readonly type: RefType;
  readonly name?: string;
  readonly commit?: string;
  readonly remote?: string;
}

export interface Branch extends Ref {
  readonly upstream?: Branch;
  readonly ahead?: number;
  readonly behind?: number;
}

export const enum Status {
  INDEX_MODIFIED,
  INDEX_ADDED,
  INDEX_DELETED,
  INDEX_RENAMED,
  INDEX_COPIED,

  MODIFIED,
  DELETED,
  UNTRACKED,
  IGNORED,
  INTENT_TO_ADD,
  INTENT_TO_RENAME,
  TYPE_CHANGED,

  ADDED_BY_US,
  ADDED_BY_THEM,
  DELETED_BY_US,
  DELETED_BY_THEM,
  BOTH_ADDED,
  BOTH_DELETED,
  BOTH_MODIFIED,
}

export interface Change {
  readonly uri: vscode.Uri;
  readonly originalUri: vscode.Uri;
  readonly renameUri?: vscode.Uri;
  readonly status: Status;
}

export interface RepositoryState {
  readonly HEAD: Branch | undefined;
  readonly indexChanges: Change[];
  readonly workingTreeChanges: Change[];
  readonly mergeChanges: Change[];
}

/**
 * 真实类型为 vscode.SourceControlInputBox：只有 value/placeholder/visible/enabled，
 * 没有 show()/hide() 方法（git API 中 ApiRepository.inputBox 直接返回 SourceControlInputBox）。
 */
export interface InputBox {
  value: string;
  placeholder: string;
  readonly visible: boolean;
  enabled: boolean;
}

export interface RepositoryUIState {
  readonly selected: boolean;
  readonly focused: boolean;
}

export interface LogOptions {
  readonly maxEntries?: number;
  readonly path?: string;
}

export interface Commit {
  readonly hash: string;
  readonly message: string;
  readonly parents: string[];
  readonly authorDate?: Date;
  readonly authorName?: string;
  readonly authorEmail?: string;
}

export interface Remote {
  readonly name: string;
  readonly fetchUrl?: string;
  readonly pushUrl?: string;
  readonly isReadOnly: boolean;
}

export interface Repository {
  readonly rootUri: vscode.Uri;
  readonly inputBox: InputBox;
  readonly state: RepositoryState;
  readonly ui: RepositoryUIState;
  readonly kind: 'repository' | 'submodule' | 'worktree';
  /** 该仓库对应的 SourceControl（用于从 SCM 视图菜单点击参数匹配仓库） */
  readonly sourceControl: vscode.SourceControl;

  getConfigs(): Promise<{ key: string; value: string }[]>;
  getConfig(key: string): Promise<string>;
  getGlobalConfig(key: string): Promise<string>;
  setConfig(key: string, value: string): Promise<string>;

  getObjectDetails(treeish: string, path: string): Promise<{ mode: string; object: string; size: number }>;
  detectObjectType(object: string): Promise<{ mimetype: string; encoding?: string }>;
  buffer(ref: string, path: string): Promise<Buffer>;
  show(ref: string, path: string): Promise<string>;
  getCommit(ref: string): Promise<Commit>;

  add(paths: string[]): Promise<void>;
  revert(paths: string[]): Promise<void>;
  clean(paths: string[]): Promise<void>;
  commit(message: string, opts?: CommitOptions): Promise<void>;

  /**
   * 注意：不带 path 时返回 Change[]（变更列表）；传具体路径才返回该文件的 diff 文本。
   * 详见 vscode.git 官方 api1.ts：diffIndexWithHEAD(): Promise<Change[]>; diffIndexWithHEAD(path: string): Promise<string>;
   */
  diffIndexWithHEAD(path?: string): Promise<string | Change[]>;
  diffWithHEAD(path?: string): Promise<string | Change[]>;
  diffWithRef(ref: string, path?: string): Promise<string | Change[]>;
  diffIndexWithWorkingTree(path?: string): Promise<string | Change[]>;

  log(options?: LogOptions): Promise<Commit[]>;
  getRemotes(): Promise<Remote[]>;
}

export interface CommitOptions {
  all?: boolean;
  amend?: boolean;
  signoff?: boolean;
  signCommit?: boolean;
  empty?: boolean;
  noVerify?: boolean;
  requireUserConfig?: boolean;
  useEditor?: boolean;
  verbose?: boolean;
  postCommitCommand?: string | null;
}

export const enum APIState {
  Uninitialized = 'uninitialized',
  Initialized = 'initialized',
}

export interface PublishEvent {
  repository: Repository;
  branch?: string;
}

export interface GitExtension {
  readonly enabled: boolean;
  getAPI(version: 1): API;
}

export interface API {
  readonly state: APIState;
  readonly onDidChangeState: vscode.Event<APIState>;
  readonly onDidPublish: vscode.Event<PublishEvent>;
  readonly git: Git;
  readonly repositories: Repository[];
  readonly onDidOpenRepository: vscode.Event<Repository>;
  readonly onDidCloseRepository: vscode.Event<Repository>;

  toGitUri(uri: vscode.Uri, ref: string): vscode.Uri;
  getRepository(uri: vscode.Uri): Repository | null;
  init(root: vscode.Uri): Promise<Repository | null>;
  openRepository(root: vscode.Uri): Promise<Repository | null>;
}

export interface Git {
  path: string;
  version: string;
}
