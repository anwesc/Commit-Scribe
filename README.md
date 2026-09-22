# Commit Scribe

根据 Git 待提交的变更自动生成 Conventional Commits 规范的 commit message 的 VS Code 扩展。

## 功能

- **一键生成**：在源代码管理（SCM）视图的标题栏或仓库行菜单点击按钮，自动读取待提交变更（优先暂存区，无暂存时用全部变更）生成 commit message
- **多 Provider 管理**：支持 OpenAI 兼容（DeepSeek/通义/Kimi 等）、OpenAI Responses、Ollama、Anthropic、自定义请求
- **多 Model 管理**：绑定 Provider，自动拉取模型列表，选择 commit 生成模型
- **提示词自定义**：模板变量 `{{diff}}`、`{{files}}`、`{{branch}}`、`{{type}}`、`{{language}}`，支持实时预览
- **API Key 安全**：存于系统密钥链（SecretStorage），不进 settings.json
- **状态栏入口**：显示当前模型，点击打开设置面板

## 使用

1. 在设置面板（命令 `Commit Scribe: 打开设置面板`）添加 Provider（API Mode / URL / Key）
2. 添加 Model（选择 Provider 后自动拉取模型列表）
3. 选择"Commit 生成模型"
4. 在 SCM 视图点击 ✨ 按钮生成 commit message

## 配置

| 配置 | 说明 |
|---|---|
| `commitHelper.providers` | API 服务提供商列表 |
| `commitHelper.models` | 模型列表（绑定 Provider） |
| `commitHelper.commitModel` | 生成 commit 使用的模型（`providerId::modelId`） |
| `commitHelper.prompt.template` | 提示词模板 |
| `commitHelper.prompt.language` | 生成语言（zh / en） |
| `commitHelper.maxDiffChars` | diff 内容截断上限（字符） |

## 开发

```bash
npm install
npm run compile   # 编译
F5                # 启动扩展开发宿主调试
```

打包：

```bash
npx vsce package
```

## 支持的模式

- **openai**：OpenAI 兼容 `/chat/completions`（DeepSeek、通义、Kimi 等）
- **openai-responses**：OpenAI `/responses`
- **ollama**：本地 Ollama `/api/chat`
- **anthropic**：Anthropic Claude `/v1/messages`
- **custom**：自定义请求 URL 与请求体模板
