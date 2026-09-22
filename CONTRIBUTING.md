# 开发指南

本文件面向本仓库的开发者，包含本地调试、打包与发布流程。
（不随扩展详情页展示；用户文档见 [README.md](README.md)。）

## 环境准备

- Node.js 18 及以上
- VS Code `1.85.0` 及以上

```bash
npm install
```

## 本地调试

```bash
npm run compile   # 编译（tsc -p ./，输出到 out/）
```

按 `F5` 启动扩展开发宿主（`.vscode/launch.json` 已配置 `preLaunchTask: npm: compile`，会自动先编译）。

调试时打开一个 Git 仓库，即可在源代码管理（SCM）视图看到 ✨ 按钮。

常用命令：

```bash
npm run watch     # 监听模式编译
```

## 项目结构

```
src/
├── extension.ts          扩展入口：注册命令、状态栏项、生成流程编排
├── constants.ts          常量：配置键、SecretStorage 键前缀、各模式默认值、默认提示词
├── settingsService.ts    唯一数据源：读写 settings.json 与 SecretStorage
├── apiClient.ts          各 API 模式的请求构建、响应解析、错误处理
├── gitService.ts         通过 vscode.git API 读取变更与 diff
├── promptTemplate.ts     提示词模板渲染与未知变量检测
├── settings/
│   ├── webviewPanel.ts   设置面板宿主：Webview 生命周期与消息处理
│   └── webviewContent.ts 设置面板 HTML/CSS/JS（内嵌脚本）
└── typings/
    └── git.d.ts          vscode.git API 的精简类型声明
```

### 两个实现约束

- `webviewContent.ts` 的内嵌 JS 处在一个 TS 模板字符串内，**不要使用反引号与 `${}`**，否则会破坏外层模板
- `vscode.git` 的 `diffIndexWithHEAD(path?)` / `diffWithHEAD(path?)` **不传路径时返回 `Change[]`**，只有传入具体路径才返回该文件的 diff 文本；因此 `gitService.collectDiffText` 是逐文件取 diff 再拼接的

## 打包

```bash
npx vsce package
```

产物为 `commit-scribe-<version>.vsix`，安装方式：

```bash
code --install-extension commit-scribe-<version>.vsix
```

或在 VS Code 中执行 `Extensions: Install from VSIX...`。

`.vscodeignore` 已排除源码、类型定义与开发脚本，只保留运行所需文件（`out/`、`package.json`、`README.md`、`LICENSE`、图标）。

## 发布

需要先创建 Azure DevOps Personal Access Token（权限：`Marketplace > Manage`）：

```bash
npx vsce login anwesc
npx vsce publish
```

### 发布前检查

- `publisher` 必须与实际拥有的发布者 ID 一致（当前为 `anwesc`）
- `name` 与 `displayName` 在 Marketplace 上**都是全局唯一**的，与 publisher 无关；重名会被拒绝
- `version` 不能与已发布的版本重复

排查名称占用可以查 Marketplace 详情页：

```
https://marketplace.visualstudio.com/items?itemName=<publisher>.<name>
```

返回 404 表示该标识未被占用。

## 版本与提交约定

- 提交信息使用 Conventional Commits（`feat` / `fix` / `docs` / `style` / `refactor` / `chore` 等）
- 版本号遵循语义化版本

## 配置键命名说明

扩展的品牌名为 **Commit Scribe**，但命令 ID 与配置键前缀仍为 `commitHelper`：

```
commitHelper.generate          命令：生成 commit message
commitHelper.openSettings      命令：打开设置面板
commitHelper.providers         配置：Provider 列表
commitHelper.apiKey.<id>       SecretStorage：各 Provider 的 API Key
```

这是**有意保留**的：修改命令 ID 或配置前缀会让已安装用户的配置失效。品牌更名只同步人类可读文案。
