# Commit Scribe

根据 Git 待提交的变更自动生成 Conventional Commits 规范的 commit message 的 VS Code 扩展。

## 功能

- **一键生成**：在源代码管理（SCM）视图的标题栏或仓库行菜单点击按钮，自动读取待提交变更（优先暂存区，无暂存时用全部变更）生成 commit message
- **多 Provider 管理**：支持 OpenAI 兼容（DeepSeek/通义/Kimi 等）、OpenAI Responses、Ollama、Anthropic、自定义请求
- **多 Model 管理**：绑定 Provider，自动拉取模型列表，选择 commit 生成模型
- **思考模式可调**：按 Provider 单独设置启用 / 关闭思考，并按各协议自动映射字段
- **输出上限可配**：为每个 Provider 单独设置最大输出 tokens，兼顾推理模型的思维链长度
- **自定义请求头**：可为 Provider 附加自定义 HTTP 头（如网关鉴权、路由标识）
- **提示词自定义**：模板变量 `{{diff}}`、`{{files}}`、`{{branch}}`、`{{type}}`、`{{language}}`，支持实时预览
- **API Key 安全**：存于系统密钥链（SecretStorage），不进 settings.json
- **状态栏入口**：显示当前模型，点击打开设置面板

## 环境要求

- VS Code `1.85.0` 及以上
- 依赖内置扩展 `vscode.git`（读取变更需要已打开 Git 仓库）

## 使用

1. 在设置面板（命令 `Commit Scribe: 打开设置面板`）添加 Provider（API Mode / URL / Key）
2. 添加 Model（选择 Provider 后自动拉取模型列表）
3. 选择"Commit 生成模型"
4. 在 SCM 视图点击 ✨ 按钮生成 commit message，结果自动填入提交输入框

## 配置

| 配置 | 说明 |
|---|---|
| `commitHelper.providers` | API 服务提供商列表 |
| `commitHelper.models` | 模型列表（绑定 Provider） |
| `commitHelper.commitModel` | 生成 commit 使用的模型（`providerId::modelId`） |
| `commitHelper.prompt.template` | 提示词模板 |
| `commitHelper.prompt.language` | 生成语言（zh / en） |
| `commitHelper.maxDiffChars` | diff 内容截断上限（字符） |

## 支持的模式

| 模式 | 端点 | 说明 |
|---|---|---|
| `openai` | `/chat/completions` | OpenAI 兼容（DeepSeek、通义、Kimi 等） |
| `openai-responses` | `/responses` | OpenAI Responses API |
| `ollama` | `/api/chat` | 本地 Ollama |
| `anthropic` | `/v1/messages` | Anthropic Claude |
| `custom` | 自定义 URL | 自行提供请求 URL 与请求体模板 |

## Provider 高级选项

在 Provider 表格点击 ⚙ 展开高级选项：

| 选项 | 默认值 | 说明 |
|---|---|---|
| 超时（秒） | `30` | 单次请求超时 |
| 最大输出 tokens | `4096` | Anthropic 协议该字段必填；推理模型建议调大，避免思维链占满预算导致内容被截断 |
| 自定义 Headers（JSON） | 无 | 附加请求头，例如 `{"X-Api-Key": "xxx"}` |
| Custom 请求体模板 | 内置模板 | 仅 `custom` 模式使用，支持 `{{model}}`、`{{messages}}`、`{{prompt}}` |

## 思考模式

部分模型（如 DeepSeek 系列）**默认开启思考**，其思维链会占用输出预算。本扩展按 Provider 提供三档设置：

| 设置 | 行为 |
|---|---|
| 不指定（默认） | 不发送任何思考相关字段，由服务端默认行为决定 |
| 启用 | `anthropic` → `thinking: { type: "enabled" }`；`openai` / `openai-responses` → `reasoning_effort: "high"` |
| 关闭 | `anthropic` → `thinking: { type: "disabled" }`；`openai` / `openai-responses` → `reasoning_effort: "none"` |

说明：

- `ollama` 与 `custom` 模式不做注入（前者有自有参数体系，后者请求体完全由模板控制）
- Anthropic 协议要求开启思考时 `temperature` 必须为 `1`，因此**启用思考时本扩展不发送 `temperature`**，交由服务端默认值处理
- 「不指定」这一档是刻意保留的：默认开启思考的模型只能靠显式发送关闭参数来关闭，而默认关闭的服务端收到关闭参数反而可能报错

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

## 安全说明

- API Key 通过 VS Code 的 SecretStorage（系统密钥链）保存，**不会**写入 `settings.json`
- Provider、Model、提示词等非敏感配置写在工作区/用户 `settings.json`（`machine` scope）

## 许可证

[MIT](LICENSE)
