/**
 * 设置面板的 HTML/CSS/JS。
 * 注意：内嵌 JS 中不使用模板字符串，避免与外层模板字符串冲突。
 *
 * 界面布局（参考 oai-compatible-copilot 风格）：
 *   Provider Management：表格 + 增删改，API Key 单独存 secrets
 *   Model Management：表格 + 增删改，选择 Provider 后拉取模型列表
 *   提示词模板：模板编辑 + 其他配置
 */

export function getWebviewContent(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<title>Commit Helper 设置</title>
<style>
  body {
    font-family: var(--vscode-font-family, sans-serif);
    padding: 14px;
    color: var(--vscode-foreground, #cccccc);
    max-width: 1080px;
  }
  section {
    border: 1px solid var(--vscode-editorWidget-border, #3c3c3c);
    padding: 14px 16px;
    border-radius: 10px;
    margin-bottom: 18px;
    background: var(--vscode-sideBar-background, #1e1e1e);
  }
  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    flex-wrap: wrap;
    gap: 8px;
  }
  .section-header h2 { margin: 0; font-size: 15px; }
  .section-actions { display: flex; gap: 8px; flex-wrap: wrap; }

  button {
    margin: 0;
    padding: 6px 14px;
    border-radius: 6px;
    border: 1px solid var(--vscode-button-border, transparent);
    background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #fff);
    cursor: pointer;
    font-size: 13px;
  }
  button:hover { opacity: 0.9; }
  button.secondary {
    background: transparent;
    border-color: var(--vscode-editorWidget-border, #3c3c3c);
    color: var(--vscode-foreground, #cccccc);
  }
  button.danger {
    background: #b91c1c;
    color: #fff;
    border: none;
  }
  button.small { padding: 3px 10px; font-size: 12px; }

  .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; }
  .row .field { flex: 1; min-width: 160px; }
  .field label {
    display: block;
    font-weight: 600;
    margin-bottom: 5px;
    font-size: 12px;
    color: var(--vscode-descriptionForeground, #8c8c8c);
  }
  .field-description {
    font-size: 11px;
    color: var(--vscode-descriptionForeground, #8c8c8c);
    margin-bottom: 5px;
  }
  input[type="text"], input[type="password"], input[type="number"], select, textarea {
    width: 100%;
    padding: 7px 10px;
    box-sizing: border-box;
    border-radius: 6px;
    border: 1px solid var(--vscode-editorWidget-border, #3c3c3c);
    background: var(--vscode-editor-background, #252526);
    color: var(--vscode-foreground, #cccccc);
    font-size: 13px;
    font-family: inherit;
  }
  input:focus, select:focus, textarea:focus {
    outline: 1px solid var(--vscode-focusBorder, #3794ff);
    border-color: var(--vscode-focusBorder, #3794ff);
  }
  textarea { resize: vertical; font-family: monospace; }
  textarea.prompt-box { min-height: 200px; }
  .checkbox-label { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; }
  .checkbox-label input { width: auto; }

  .table-container { overflow-x: auto; }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  th, td {
    border: 1px solid var(--vscode-editorWidget-border, #3c3c3c);
    padding: 7px 10px;
    text-align: left;
    vertical-align: middle;
  }
  th {
    background: rgba(255, 255, 255, 0.04);
    font-weight: 600;
    font-size: 12px;
    color: var(--vscode-descriptionForeground, #8c8c8c);
    white-space: nowrap;
  }
  td input, td select {
    padding: 4px 8px;
    font-size: 12px;
  }
  .key-badge {
    display: inline-block;
    padding: 1px 8px;
    border-radius: 9px;
    font-size: 11px;
    border: 1px solid var(--vscode-editorWidget-border, #3c3c3c);
  }
  .key-badge.set { color: #4ec9b0; border-color: #4ec9b0; }
  .key-badge.empty { color: #8c8c8c; }
  .key-badge.warn { color: #d7ba7d; border-color: #d7ba7d; }
  .model-issue {
    color: #d7ba7d;
    font-size: 11px;
    margin-top: 3px;
  }
  .actions-cell { white-space: nowrap; width: 1%; }
  .actions-cell button { margin-right: 4px; }

  .status {
    margin: 8px 0;
    padding: 8px 10px;
    font-size: 12px;
    white-space: pre-wrap;
    word-break: break-all;
    border-radius: 6px;
  }
  .status.ok { background: rgba(78, 201, 176, 0.12); color: #4ec9b0; }
  .status.err { background: rgba(241, 76, 76, 0.12); color: #f14c4c; }
  .status.loading { background: rgba(55, 148, 255, 0.1); color: #3794ff; }
  .hidden { display: none !important; }

  .provider-form, .model-form {
    border: 1px solid var(--vscode-editorWidget-border, #3c3c3c);
    border-radius: 8px;
    padding: 12px;
    margin-top: 12px;
    background: rgba(255, 255, 255, 0.02);
  }
  .form-title { font-weight: 600; margin: 0 0 10px; font-size: 13px; }
  .form-actions { display: flex; gap: 8px; margin-top: 10px; }

  /* Provider 行内编辑 */
  .provider-input {
    width: 100%;
    padding: 5px 8px;
    border: 1px solid var(--vscode-editorWidget-border, #3c3c3c);
    border-radius: 4px;
    background: var(--vscode-input-background, #252526);
    color: var(--vscode-input-foreground, #cccccc);
    box-sizing: border-box;
    font-size: 12px;
  }
  .provider-input:focus {
    outline: 1px solid var(--vscode-focusBorder, #3794ff);
  }
  td input.provider-input, td select.provider-input {
    min-width: 140px;
  }
  .advanced-row td {
    background: rgba(255, 255, 255, 0.02);
  }
  .advanced-fields {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    align-items: flex-end;
  }
  .advanced-fields .af-field {
    flex: 1;
    min-width: 150px;
  }
  .advanced-fields label {
    display: block;
    font-size: 11px;
    color: var(--vscode-descriptionForeground, #8c8c8c);
    margin-bottom: 3px;
  }

  /* Model ID 自定义下拉（主题色可控） */
  .input-with-dropdown {
    position: relative;
    width: 100%;
  }
  .model-input-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 1000;
    background: var(--vscode-editorWidget-background, #252526);
    border: 1px solid var(--vscode-editorWidget-border, #3c3c3c);
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
    margin-top: 2px;
    display: none;
    max-height: 300px;
    overflow: hidden;
  }
  .model-input-dropdown.show { display: block; }
  .dropdown-header {
    padding: 7px 12px;
    font-weight: 600;
    font-size: 12px;
    color: var(--vscode-descriptionForeground, #8c8c8c);
    border-bottom: 1px solid var(--vscode-editorWidget-border, #3c3c3c);
    background: rgba(255, 255, 255, 0.04);
  }
  .dropdown-content {
    max-height: 240px;
    overflow-y: auto;
  }
  .dropdown-option {
    padding: 7px 12px;
    cursor: pointer;
    font-size: 12px;
    color: var(--vscode-foreground, #cccccc);
  }
  .dropdown-option:hover {
    background: var(--vscode-list-hoverBackground, rgba(255, 255, 255, 0.08));
  }
  .dropdown-option.selected {
    background: var(--vscode-list-activeSelectionBackground, #094771);
    color: var(--vscode-list-activeSelectionForeground, #ffffff);
  }
  .dropdown-option.error { color: #f14c4c; }

  .chip {
    display: inline-block;
    margin: 0 4px 4px 0;
    padding: 2px 9px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--vscode-editorWidget-border, #3c3c3c);
    border-radius: 10px;
    cursor: pointer;
    font-size: 12px;
    color: #9cdcfe;
  }
  .chip:hover { border-color: var(--vscode-focusBorder, #3794ff); }
  .empty-hint {
    color: var(--vscode-descriptionForeground, #8c8c8c);
    font-size: 12px;
    padding: 14px 4px;
  }
</style>
</head>
<body>
  <h2 style="margin:4px 0 14px;">⚙️ Commit Helper 设置</h2>

  <!-- ============ Provider Management ============ -->
  <section id="providerSection">
    <div class="section-header">
      <h2>Provider Management</h2>
      <div class="section-actions">
        <button id="addProviderBtn">＋ Add Provider</button>
        <button id="refreshBtn" class="secondary">↻ Refresh</button>
      </div>
    </div>
    <div class="table-container">
      <table id="providerTable">
        <thead>
          <tr>
            <th>Provider ID</th>
            <th>Base URL</th>
            <th>API Key</th>
            <th>API Mode</th>
            <th>Thinking</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="providerTableBody"></tbody>
      </table>
    </div>
    <div id="providerEmpty" class="empty-hint hidden">尚未添加 Provider。点击「Add Provider」添加（例如 DeepSeek、Ollama 等）。</div>
    <div id="providerStatus" class="status hidden"></div>
  </section>

  <!-- ============ Model Management ============ -->
  <section id="modelSection">
    <div class="section-header">
      <h2>Model Management</h2>
      <div class="section-actions">
        <button id="addModelBtn">＋ Add Model</button>
      </div>
    </div>
    <div class="table-container">
      <table id="modelTable">
        <thead>
          <tr>
            <th>Model ID</th>
            <th>Provider</th>
            <th>Display Name</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="modelTableBody"></tbody>
      </table>
    </div>
    <div id="modelEmpty" class="empty-hint hidden">尚未添加模型。点击「Add Model」从 Provider 拉取模型列表添加。</div>
    <div id="modelFormSection" class="model-form hidden"></div>
    <div id="modelStatus" class="status hidden"></div>
  </section>

  <!-- ============ 提示词模板 ============ -->
  <section id="promptSection">
    <div class="section-header">
      <h2>提示词模板 &amp; 生成配置</h2>
    </div>

    <div class="row">
      <div class="field" style="flex:2 1 200px; min-width:180px;">
        <label for="commitModelSelect">Commit 生成模型</label>
        <div class="field-description">生成 commit message 时使用的模型。</div>
        <select id="commitModelSelect"><option value="">（未选择）</option></select>
      </div>
      <div class="field" style="flex:1 1 100px; min-width:90px;">
        <label for="language">语言</label>
        <div class="field-description">生成消息的语言。</div>
        <select id="language">
          <option value="zh">中文</option>
          <option value="en">English</option>
        </select>
      </div>
      <div class="field" style="flex:1 1 120px; min-width:110px;">
        <label for="maxDiffChars">Diff 上限（字符）</label>
        <div class="field-description">送入模型的 diff 截断上限。</div>
        <input type="number" id="maxDiffChars" min="500" step="100" value="4000">
      </div>
    </div>

    <div class="row" style="align-items:flex-start;">
      <div class="field">
        <label>插入变量</label>
        <div style="padding-top:6px;">
          <span class="chip" data-var="{{diff}}">{{diff}}</span>
          <span class="chip" data-var="{{files}}">{{files}}</span>
          <span class="chip" data-var="{{branch}}">{{branch}}</span>
          <span class="chip" data-var="{{type}}">{{type}}</span>
          <span class="chip" data-var="{{language}}">{{language}}</span>
        </div>
      </div>
    </div>
    <div class="row" style="align-items:flex-start;">
      <div class="field">
        <label for="promptTemplate">提示词模板</label>
        <textarea class="prompt-box" id="promptTemplate" spellcheck="false"></textarea>
      </div>
    </div>
    <div class="row">
      <button id="previewBtn" class="secondary">👁 预览提示词</button>
      <button id="restoreBtn" class="secondary">↺ 恢复默认模板</button>
      <button id="savePromptBtn">💾 保存</button>
    </div>
    <div id="promptStatus" class="status hidden"></div>
  </section>

<script>
(function () {
  var vscode = acquireVsCodeApi();
  var state = {
    providers: [],
    providerApiKeys: {},
    models: [],
    commitModel: '',
    prompt: null
  };

  var $ = function (id) { return document.getElementById(id); };
  var els = {
    providerTableBody: $('providerTableBody'),
    providerEmpty: $('providerEmpty'),
    providerStatus: $('providerStatus'),
    modelTableBody: $('modelTableBody'),
    modelEmpty: $('modelEmpty'),
    modelFormSection: $('modelFormSection'),
    modelStatus: $('modelStatus'),
    commitModelSelect: $('commitModelSelect'),
    promptTemplate: $('promptTemplate'),
    language: $('language'),
    maxDiffChars: $('maxDiffChars'),
    promptStatus: $('promptStatus')
  };

  var MODE_LABELS = {
    openai: 'OpenAI',
    'openai-responses': 'OpenAI Responses',
    ollama: 'Ollama',
    anthropic: 'Anthropic',
    custom: 'Custom'
  };

  var MODE_API_KEYS = ['openai', 'openai-responses', 'anthropic']; // 需要 API Key 的模式

  // 与 constants.ts 的 DEFAULT_MAX_TOKENS 保持一致（anthropic 模式 max_tokens 必填）
  var DEFAULT_MAX_TOKENS = 4096;

  // 与 constants.ts 的 DEFAULT_BASE_URLS 保持一致
  var MODE_DEFAULT_BASE_URLS = {
    'openai': 'https://api.openai.com/v1',
    'openai-responses': 'https://api.openai.com/v1',
    'ollama': 'http://localhost:11434',
    'anthropic': 'https://api.anthropic.com/v1',
    'custom': ''
  };

  function isDefaultBaseUrl(url) {
    var v = (url || '').trim();
    if (!v) { return true; }
    return Object.keys(MODE_DEFAULT_BASE_URLS).some(function (k) {
      return MODE_DEFAULT_BASE_URLS[k] === v;
    });
  }

  /**
   * API Mode ↔ Base URL 联动：
   * 切换模式时，若 Base URL 为空或仍是某个模式的内置默认地址，则自动替换为新模式的默认地址；
   * 用户手填过的自定义地址不会被覆盖。
   */
  function bindModeBaseUrlSync(tr) {
    var modeSel = tr.querySelector('[data-field="apiMode"]');
    var urlInput = tr.querySelector('[data-field="baseUrl"]');
    if (!modeSel || !urlInput) { return; }
    modeSel.addEventListener('change', function () {
      if (isDefaultBaseUrl(urlInput.value)) {
        urlInput.value = MODE_DEFAULT_BASE_URLS[modeSel.value] || '';
      }
    });
  }

  function showStatus(el, text, cls) {
    el.textContent = text;
    el.className = 'status ' + (cls || '');
    el.classList.remove('hidden');
  }
  function hideStatus(el) {
    el.classList.add('hidden');
  }

  // ---------- 初始化渲染 ----------
  function render() {
    renderProviders();
    renderModels();
    renderCommitModelSelect();
    if (state.prompt) {
      els.promptTemplate.value = state.prompt.promptTemplate;
      els.language.value = state.prompt.language;
      els.maxDiffChars.value = String(state.prompt.maxDiffChars);
    }
  }

  // ---------- Provider 行内编辑 ----------
  function modeOptionsHtml(selected) {
    return ['openai', 'openai-responses', 'ollama', 'anthropic', 'custom'].map(function (m) {
      return '<option value="' + m + '"' + (selected === m ? ' selected' : '') + '>' + esc(MODE_LABELS[m]) + '</option>';
    }).join('');
  }

  /**
   * 思考模式为三态：空值 = 不发送字段（交给服务端默认行为）。
   * 因为有些模型默认开启思考，只有显式 disabled 才能关闭；
   * 而默认关闭的服务端收到 disabled 反而可能报错，故保留「不指定」这一档。
   */
  var THINKING_LABELS = {
    '': '不指定',
    'enabled': '启用',
    'disabled': '关闭'
  };

  function thinkingOptionsHtml(selected) {
    var cur = selected || '';
    return Object.keys(THINKING_LABELS).map(function (v) {
      return '<option value="' + v + '"' + (cur === v ? ' selected' : '') + '>' + esc(THINKING_LABELS[v]) + '</option>';
    }).join('');
  }

  function buildProviderRow(p) {
    var tr = document.createElement('tr');
    var hasKey = !!state.providerApiKeys[p.id];
    var keyPlaceholder = hasKey ? '已配置（留空不变）' : '输入 API Key';

    tr.setAttribute('data-provider', p.id);
    tr.innerHTML =
      '<td><strong>' + esc(p.id) + '</strong>' +
        (hasKey ? ' <span class="key-badge set">Key✓</span>' : '') + '</td>' +
      '<td><input type="text" class="provider-input" data-field="baseUrl" value="' + esc(p.baseUrl) + '" placeholder="Base URL"></td>' +
      '<td><input type="password" class="provider-input" data-field="apiKey" placeholder="' + esc(keyPlaceholder) + '"></td>' +
      '<td><select class="provider-input" data-field="apiMode">' + modeOptionsHtml(p.mode) + '</select></td>' +
      '<td><select class="provider-input" data-field="thinking">' + thinkingOptionsHtml(p.thinking) + '</select></td>' +
      '<td class="actions-cell">' +
        '<button class="secondary small" data-advanced="1" title="高级选项（超时/Headers/Custom）">⚙</button>' +
        '<button class="save-provider-btn small">保存</button>' +
        '<button class="danger small" data-del="' + esc(p.id) + '">删除</button>' +
      '</td>';
    return tr;
  }

  function buildProviderAdvancedRow(p) {
    var tr = document.createElement('tr');
    tr.className = 'advanced-row hidden';
    tr.setAttribute('data-advanced-row', p.id);
    tr.innerHTML =
      '<td colspan="6"><div class="advanced-fields">' +
        '<div class="af-field" style="max-width:150px;"><label>超时（秒）</label><input type="number" class="provider-input" data-field="timeout" min="5" value="' + (p.timeout || 30) + '"></div>' +
        '<div class="af-field" style="max-width:170px;"><label>最大输出 tokens</label><input type="number" class="provider-input" data-field="maxTokens" min="1" value="' + (p.maxTokens || '') + '" placeholder="' + DEFAULT_MAX_TOKENS + '"></div>' +
        '<div class="af-field"><label>自定义 Headers（JSON）</label><input type="text" class="provider-input" data-field="headers" value="' + (p.headers ? esc(JSON.stringify(p.headers)) : '') + '" placeholder=\\'{"X-Api-Key": "xxx"}\\'></div>' +
        '<div class="af-field" style="flex:2;"><label>Custom 请求体模板</label><input type="text" class="provider-input" data-field="customRequestTemplate" value="' + esc(p.customRequestTemplate || '') + '" placeholder=\\'{"model": "{{model}}", "messages": {{messages}}}\\'></div>' +
        (state.providerApiKeys[p.id] ? '<div class="af-field"><label>&nbsp;</label><button class="danger small" data-clear-key="' + esc(p.id) + '">清除已存 Key</button></div>' : '') +
      '</div></td>';
    return tr;
  }

  function renderProviders() {
    var body = els.providerTableBody;
    body.innerHTML = '';
    els.providerEmpty.classList.toggle('hidden', state.providers.length > 0);

    state.providers.forEach(function (p) {
      body.appendChild(buildProviderRow(p));
      body.appendChild(buildProviderAdvancedRow(p));
    });

    // API Mode → Base URL 联动（默认地址跟随模式，自定义地址保留）
    body.querySelectorAll('tr[data-provider]').forEach(bindModeBaseUrlSync);

    // 高级选项展开/收起
    body.querySelectorAll('[data-advanced]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tr = btn.closest('tr');
        var adv = tr.nextElementSibling;
        if (adv && adv.getAttribute('data-advanced-row')) {
          adv.classList.toggle('hidden');
        }
      });
    });

    // 行内保存
    body.querySelectorAll('.save-provider-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tr = btn.closest('tr');
        var id = tr.getAttribute('data-provider');
        var adv = tr.nextElementSibling;
        var main = collectRowData(tr);
        var data = main;
        data.id = id;
        if (adv && adv.getAttribute('data-advanced-row')) {
          // 高级行在前、主行在后：若两处出现同名字段，以主行为准
          data = Object.assign(collectRowData(adv), main);
          data.id = id;
        }
        var apiKey = data.apiKey || undefined;
        vscode.postMessage({ type: 'saveProvider', provider: data, apiKey: apiKey });
      });
    });

    // 清除 Key
    body.querySelectorAll('[data-clear-key]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-clear-key');
        var tr = btn.closest('tr.advanced-row');
        var main = tr.previousElementSibling;
        var mainData = collectRowData(main);
        var data = Object.assign(collectRowData(tr), mainData);
        data.id = id;
        vscode.postMessage({
          type: 'saveProvider',
          provider: data,
          apiKeyCleared: true
        });
      });
    });

    // 删除（行内二次确认：第一次点击进入确认态，3 秒内再点执行）
    body.querySelectorAll('[data-del]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.classList.contains('confirming')) {
          // 第二次点击：真正执行删除
          var id = btn.getAttribute('data-del');
          vscode.postMessage({ type: 'deleteProvider', id: id });
          btn.classList.remove('confirming');
          btn.textContent = '删除';
          return;
        }
        // 第一次点击：进入确认态
        btn.classList.add('confirming');
        btn.textContent = '确认删除？';
        setTimeout(function () {
          btn.classList.remove('confirming');
          btn.textContent = '删除';
        }, 3000);
      });
    });

    function collectRowData(tr) {
      var out = {};
      tr.querySelectorAll('[data-field]').forEach(function (input) {
        var field = input.getAttribute('data-field');
        // 行内 select 的 data-field 是 apiMode，而 ProviderDraft 的字段名是 mode
        var key = field === 'apiMode' ? 'mode' : field;
        var val = input.value.trim();
        if (field === 'timeout') {
          out[key] = parseInt(val, 10) || 30;
        } else if (field === 'maxTokens') {
          // 留空表示不指定，交由扩展侧使用默认值
          var mt = parseInt(val, 10);
          out[key] = isNaN(mt) || mt <= 0 ? undefined : mt;
        } else if (field === 'thinking') {
          // 空值表示「不指定」，不发送 thinking/reasoning_effort 字段
          out[key] = val || undefined;
        } else if (field === 'headers') {
          try {
            out[key] = val ? JSON.parse(val) : undefined;
          } catch (e) {
            out[key] = undefined;
          }
        } else {
          out[key] = val;
        }
      });
      return out;
    }
  }

  // 添加 Provider：插入一行可编辑新行（对齐参考插件）
  function addProviderRow() {
    var body = els.providerTableBody;
    var tr = document.createElement('tr');
    tr.className = 'new-provider-row';
    tr.innerHTML =
      '<td><input type="text" class="provider-input" data-field="id" placeholder="例如 deepseek"></td>' +
      '<td><input type="text" class="provider-input" data-field="baseUrl" placeholder="https://api.deepseek.com/v1"></td>' +
      '<td><input type="password" class="provider-input" data-field="apiKey" placeholder="API Key"></td>' +
      '<td><select class="provider-input" data-field="apiMode">' + modeOptionsHtml('openai') + '</select></td>' +
      '<td><select class="provider-input" data-field="thinking">' + thinkingOptionsHtml('') + '</select></td>' +
      '<td class="actions-cell">' +
        '<button class="save-provider-btn small">保存</button>' +
        '<button class="cancel-provider-btn secondary small">取消</button>' +
      '</td>';
    body.appendChild(tr);
    bindModeBaseUrlSync(tr);
    tr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    tr.querySelector('.save-provider-btn').addEventListener('click', function () {
      var data = {};
      tr.querySelectorAll('[data-field]').forEach(function (input) {
        data[input.getAttribute('data-field')] = input.value.trim();
      });
      vscode.postMessage({
        type: 'saveProvider',
        provider: {
          id: data.id,
          baseUrl: data.baseUrl,
          mode: data.apiMode,
          thinking: data.thinking || undefined,
          timeout: 30
        },
        apiKey: data.apiKey || undefined
      });
      tr.remove();
    });
    tr.querySelector('.cancel-provider-btn').addEventListener('click', function () {
      tr.remove();
    });
  }

  /** 检查 Model 与其 Provider 当前配置是否仍然自洽；返回提示文案（无问题返回空串） */
  function describeModelIssue(m) {
    var p = null;
    for (var i = 0; i < state.providers.length; i++) {
      if (state.providers[i].id === m.providerId) { p = state.providers[i]; break; }
    }
    if (!p) {
      return '所属 Provider 已不存在，请删除或改绑';
    }
    if (p.mode === 'custom' && !m.id) {
      return 'custom 模式建议填写 Model ID';
    }
    if (p.mode !== 'custom' && !String(m.id || '').trim()) {
      return 'Model ID 为空，无法用于生成';
    }
    return '';
  }

  function renderModels() {
    var body = els.modelTableBody;
    body.innerHTML = '';
    els.modelEmpty.classList.toggle('hidden', state.models.length > 0);

    state.models.forEach(function (m) {
      var tr = document.createElement('tr');
      var isCommit = state.commitModel === m.providerId + '::' + m.id;
      // Provider 被改模式/改地址后可能出现「不可用」的遗留模型，提示但不自动删除
      var issue = describeModelIssue(m);
      tr.innerHTML =
        '<td><strong>' + esc(m.id) + '</strong>' + (isCommit ? ' <span class="key-badge set">使用中</span>' : '') +
          (issue ? '<div class="model-issue">' + esc(issue) + '</div>' : '') + '</td>' +
        '<td>' + esc(m.providerId) + '</td>' +
        '<td>' + esc(m.displayName || '') + '</td>' +
        '<td class="actions-cell">' +
          '<button class="secondary small" data-set="' + esc(m.providerId) + '|' + esc(m.id) + '">使用</button>' +
          '<button class="secondary small" data-edit="' + esc(m.providerId) + '|' + esc(m.id) + '">编辑</button>' +
          '<button class="danger small" data-del="' + esc(m.providerId) + '|' + esc(m.id) + '">删除</button>' +
        '</td>';
      body.appendChild(tr);
    });

    body.querySelectorAll('[data-set]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var parts = btn.getAttribute('data-set').split('|');
        vscode.postMessage({ type: 'savePrompt', prompt: collectPrompt(), commitModel: parts[0] + '::' + parts[1] });
      });
    });
    body.querySelectorAll('[data-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var parts = btn.getAttribute('data-edit').split('|');
        openModelForm(parts[0], parts[1]);
      });
    });
    body.querySelectorAll('[data-del]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.classList.contains('confirming')) {
          // 第二次点击：真正执行删除
          var parts = btn.getAttribute('data-del').split('|');
          vscode.postMessage({ type: 'deleteModel', providerId: parts[0], modelId: parts[1] });
          btn.classList.remove('confirming');
          btn.textContent = '删除';
          return;
        }
        // 第一次点击：进入确认态
        btn.classList.add('confirming');
        btn.textContent = '确认删除？';
        setTimeout(function () {
          btn.classList.remove('confirming');
          btn.textContent = '删除';
        }, 3000);
      });
    });
  }

  function renderCommitModelSelect() {
    var sel = els.commitModelSelect;
    var current = state.commitModel;
    sel.innerHTML = '<option value="">（未选择）</option>';
    state.models.forEach(function (m) {
      var opt = document.createElement('option');
      opt.value = m.providerId + '::' + m.id;
      opt.textContent = m.id + (m.displayName ? '（' + m.displayName + '）' : '') + ' · ' + m.providerId;
      if (opt.value === current) {
        opt.selected = true;
      }
      sel.appendChild(opt);
    });
    if (!current && state.models.length > 0) {
      // 未显式选择时显示占位提示，但保持默认第一个可用
      sel.value = '';
    }
  }

  // ---------- Model 表单 ----------
  function openModelForm(editProviderId, editModelId) {
    var section = els.modelFormSection;
    var existing = editModelId
      ? state.models.find(function (m) { return m.providerId === editProviderId && m.id === editModelId; })
      : undefined;

    var providerOptions = state.providers.map(function (p) {
      return '<option value="' + esc(p.id) + '"' + ((existing && existing.providerId === p.id) ? ' selected' : '') + '>' + esc(p.id) + '（' + esc(MODE_LABELS[p.mode]) + '）</option>';
    }).join('');

    section.innerHTML =
      '<div class="form-title">' + (existing ? '编辑 Model' : '添加 Model') + '</div>' +
      '<div class="row">' +
        '<div class="field"><label>所属 Provider *</label><select id="mfProvider" ' + (existing ? 'disabled' : '') + '><option value="">选择 Provider</option>' + providerOptions + '</select></div>' +
        '<div class="field" style="flex:2;"><label>Model ID *</label>' +
          '<div class="input-with-dropdown">' +
            '<input type="text" id="mfModelId" value="' + (existing ? esc(existing.id) : '') + '" placeholder="从下拉选择或直接输入模型 ID">' +
            '<div id="mfDropdown" class="model-input-dropdown">' +
              '<div class="dropdown-header" id="mfDropdownHeader">Select Model</div>' +
              '<div class="dropdown-content" id="mfDropdownContent"></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="row">' +
        '<div class="field"><label>Display Name</label><input type="text" id="mfDisplayName" value="' + (existing ? esc(existing.displayName || '') : '') + '" placeholder="可选"></div>' +
        '<div class="field"></div>' +
      '</div>' +
      '<div id="mfFetchStatus" class="status hidden"></div>' +
      '<div class="form-actions">' +
        '<button id="mfFetch" class="secondary small">↻ 拉取模型列表</button>' +
        '<button id="mfSave">保存 Model</button>' +
        '<button id="mfCancel" class="secondary">取消</button>' +
      '</div>';

    section.classList.remove('hidden');
    section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    var mfDropdown = $('mfDropdown');
    var mfDropdownContent = $('mfDropdownContent');
    var mfDropdownHeader = $('mfDropdownHeader');
    var mfModelId = $('mfModelId');
    // 标记：本轮是否刚由 focus 显示过下拉（避免 focus 与 click 竞争导致“闪现后消失”）
    var focusJustShowed = false;

    function showDropdown() {
      if (mfDropdownContent.children.length > 0) {
        mfDropdown.classList.add('show');
      }
    }
    function hideDropdown() {
      mfDropdown.classList.remove('show');
    }

    // 点击输入框显示/隐藏下拉
    mfModelId.addEventListener('focus', function () {
      focusJustShowed = true;
      showDropdown();
    });
    mfModelId.addEventListener('click', function () {
      // 同一轮 focus 已显示时，click 不再收起（否则点击立即隐藏，形成闪现）
      if (focusJustShowed) {
        focusJustShowed = false;
        return;
      }
      // 再次点击（无新 focus）时切换收起
      if (mfDropdown.classList.contains('show')) {
        hideDropdown();
      } else {
        showDropdown();
      }
    });
    mfModelId.addEventListener('blur', function () {
      // 失焦重置标记，防止下次点击误判
      focusJustShowed = false;
    });
    mfModelId.addEventListener('input', function () {
      // 输入内容时收起下拉（允许手动输入任意 ID）
      hideDropdown();
    });
    // 点击下拉选项后已隐藏；点击其他区域（含输入框外）隐藏
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.input-with-dropdown')) {
        hideDropdown();
      }
    });

    $('mfCancel').addEventListener('click', function () { section.classList.add('hidden'); });

    function selectedProviderId() {
      return existing ? existing.providerId : $('mfProvider').value;
    }

    $('mfFetch').addEventListener('click', function () {
      var pid = selectedProviderId();
      if (!pid) {
        showStatus($('mfFetchStatus'), '请先选择 Provider', 'err');
        return;
      }
      showStatus($('mfFetchStatus'), '正在拉取模型列表…', 'loading');
      vscode.postMessage({ type: 'fetchModels', providerId: pid });
    });

    $('mfProvider').addEventListener('change', function () {
      // 切换 Provider 后，上一个 Provider 的 Model ID 已不适用：清空并重新拉取
      mfModelId.value = '';
      mfDropdownContent.innerHTML = '';
      mfDropdownHeader.textContent = 'Select Model';
      hideDropdown();
      $('mfFetch').click();
    });

    $('mfSave').addEventListener('click', function () {
      var pid = selectedProviderId();
      vscode.postMessage({
        type: 'saveModel',
        model: {
          id: mfModelId.value.trim(),
          providerId: pid,
          displayName: $('mfDisplayName').value.trim() || undefined
        }
      });
      section.classList.add('hidden');
    });

    // 若编辑已有模型，尝试拉取一次列表
    if (existing) {
      $('mfFetch').click();
    }
  }

  // ---------- 提示词 ----------
  function collectPrompt() {
    return {
      promptTemplate: els.promptTemplate.value,
      language: els.language.value,
      maxDiffChars: parseInt(els.maxDiffChars.value, 10) || 4000
    };
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ---------- 事件绑定 ----------
  $('addProviderBtn').addEventListener('click', addProviderRow);
  $('refreshBtn').addEventListener('click', function () { vscode.postMessage({ type: 'requestInit' }); });
  $('addModelBtn').addEventListener('click', function () { openModelForm(undefined, undefined); });

  $('previewBtn').addEventListener('click', function () {
    vscode.postMessage({ type: 'preview', template: els.promptTemplate.value, language: els.language.value });
  });
  $('restoreBtn').addEventListener('click', function () {
    vscode.postMessage({ type: 'requestInit' });
    showStatus(els.promptStatus, '已恢复为当前保存的配置（可再次编辑）', 'loading');
  });
  $('savePromptBtn').addEventListener('click', function () {
    els.promptStatus.classList.add('hidden');
    vscode.postMessage({ type: 'savePrompt', prompt: collectPrompt(), commitModel: els.commitModelSelect.value });
  });

  // 变量插入
  Array.prototype.forEach.call(document.querySelectorAll('.chip'), function (chip) {
    chip.addEventListener('click', function () {
      insertAtCursor(els.promptTemplate, chip.getAttribute('data-var'));
    });
  });
  function insertAtCursor(textarea, text) {
    var start = textarea.selectionStart;
    var end = textarea.selectionEnd;
    var value = textarea.value;
    textarea.value = value.slice(0, start) + text + value.slice(end);
    textarea.selectionStart = textarea.selectionEnd = start + text.length;
    textarea.focus();
  }

  // ---------- 接收扩展消息 ----------
  window.addEventListener('message', function (event) {
    var msg = event.data;
    if (!msg || !msg.type) { return; }
    switch (msg.type) {
      case 'init': {
        var data = msg.data;
        state.providers = data.providers || [];
        state.providerApiKeys = data.providerApiKeys || {};
        state.models = data.models || [];
        state.commitModel = data.commitModel || '';
        state.prompt = data.prompt || null;
        render();
        break;
      }
      case 'modelsFetchResult': {
        var statusEl = $('mfFetchStatus');
        if (!statusEl) { return; }
        var content = $('mfDropdownContent');
        var header = $('mfDropdownHeader');
        if (msg.ok) {
          showStatus(statusEl, msg.message, 'ok');
          content.innerHTML = '';
          var models = msg.models || [];
          header.textContent = models.length > 0 ? 'Select Model（' + models.length + '）' : 'No models available';
          models.forEach(function (m) {
            var opt = document.createElement('div');
            opt.className = 'dropdown-option';
            opt.textContent = m;
            opt.addEventListener('click', function () {
              $('mfModelId').value = m;
              content.querySelectorAll('.dropdown-option').forEach(function (o) { o.classList.remove('selected'); });
              opt.classList.add('selected');
              $('mfDropdown').classList.remove('show');
            });
            content.appendChild(opt);
          });
          // 注意：不自动填充 Model ID，避免下拉选项（可能经服务端过滤）被误解为完整列表
        } else {
          showStatus(statusEl, '❌ ' + msg.message, 'err');
          header.textContent = 'Error fetching models';
          content.innerHTML = '<div class="dropdown-option error">拉取模型列表失败：' + esc(msg.message) + '</div>';
        }
        break;
      }
      case 'testResult': {
        // 保留扩展性：未来 Provider 行内测试使用
        break;
      }
      case 'previewResult': {
        var text = '';
        if (msg.unknownVars && msg.unknownVars.length > 0) {
          text = '⚠️ 发现未知变量：{{' + msg.unknownVars.join('}}、{{') + '}}（会被替换为空）\\n\\n';
        }
        text += msg.preview;
        showStatus(els.promptStatus, text, 'ok');
        break;
      }
      case 'providerSaveResult':
      case 'providerDeleteResult':
      case 'modelSaveResult':
      case 'modelDeleteResult':
      case 'promptSaveResult': {
        var statusEl =
          msg.type === 'providerSaveResult' || msg.type === 'providerDeleteResult' ? els.providerStatus :
          msg.type === 'modelSaveResult' || msg.type === 'modelDeleteResult' ? els.modelStatus :
          els.promptStatus;
        if (msg.ok) {
          showStatus(statusEl, '✅ ' + msg.message, 'ok');
        } else {
          showStatus(statusEl, '❌ ' + msg.message, 'err');
        }
        break;
      }
    }
  });

  // 通知扩展：面板已就绪
  vscode.postMessage({ type: 'requestInit' });
})();
</script>
</body>
</html>`;
}
