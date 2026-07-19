(function () {
  "use strict";

  var Core = window.ApiDocCore;
  var Generators = window.ApiDocGenerators;
  var Exporters = window.ApiDocExporters;
  if (!Core || !Generators || !Exporters) return;

  var DRAFT_KEY = "meowv:api-doc-generator:draft";
  var DEFAULT_EXPORT_STATUS = "支持本地导出 Markdown、OpenAPI、Word 和 PDF";
  var state = {
    initialized: false,
    requestFields: [],
    responseFields: [],
    data: null,
    outputs: null,
    activeTab: "markdown",
    dirty: false,
    saveTimer: null,
    regenerateTimer: null
  };

  var editorConfig = {
    adgHeadersJson: { error: "adgHeadersError", label: "请求头 JSON", empty: {} },
    adgRequestJson: { error: "adgRequestError", label: "请求参数 JSON", empty: {} },
    adgResponseJson: { error: "adgResponseError", label: "返回结果 JSON" }
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function escapeAttribute(value) {
    return Core.escapeHtml(value).replace(/`/g, "&#96;");
  }

  function setEditorError(id, message) {
    var config = editorConfig[id];
    if (!config) return;
    byId(config.error).textContent = message || "";
    var wrap = document.querySelector('[data-editor-for="' + id + '"]');
    if (wrap) wrap.classList.toggle("adg-error", !!message);
  }

  function parseEditor(id) {
    var config = editorConfig[id];
    var text = byId(id).value;
    try {
      var value;
      if (!text.trim() && Object.prototype.hasOwnProperty.call(config, "empty")) value = config.empty;
      else value = Core.parseJson(text, config.label);
      setEditorError(id, "");
      return value;
    } catch (error) {
      setEditorError(id, error.message);
      throw error;
    }
  }

  function formatEditor(id, minify) {
    var config = editorConfig[id];
    try {
      var value = parseEditor(id);
      byId(id).value = Core.stringifyLossless(value, minify ? 0 : 2);
      markDirty();
    } catch (error) {
      showGlobalError(config.label + " 无法" + (minify ? "压缩" : "格式化") + "，请先修正上方错误。");
    }
  }

  function showGlobalError(message) {
    var target = byId("adgGlobalError");
    target.textContent = message || "";
    target.classList.toggle("adg-show", !!message);
  }

  function setGenerateStatus(message, status) {
    var target = byId("adgGenerateStatus");
    target.textContent = message;
    target.className = "adg-status" + (status ? " adg-" + status : "");
  }

  function setValidation(errors) {
    var target = byId("adgValidation");
    if (!errors || !errors.length) {
      target.className = "adg-validation";
      target.innerHTML = '<i class="fas fa-check-circle"></i> OpenAPI 结构校验通过';
    } else {
      target.className = "adg-validation adg-error";
      target.innerHTML = '<i class="fas fa-exclamation-circle"></i> ' + Core.escapeHtml(errors.length + " 项结构错误");
      target.title = errors.join("\n");
    }
  }

  function normalizeHeaders(headers) {
    if (!headers || typeof headers !== "object" || Array.isArray(headers) || Core.isLosslessNumber(headers)) {
      throw new Error("请求头 JSON 必须是对象，例如 {\"Authorization\":\"Bearer YOUR_TOKEN\"}");
    }
    var normalized = {};
    Object.keys(headers).forEach(function (name) {
      var value = headers[name];
      normalized[name] = value && typeof value === "object" ? Core.stringifyLossless(value, 0) : String(value === null ? "" : value);
    });
    return normalized;
  }

  function collectData(rebuildFields) {
    showGlobalError("");
    ["adgHeadersJson", "adgRequestJson", "adgResponseJson"].forEach(function (id) { setEditorError(id, ""); });
    var name = byId("adgName").value.trim();
    var url = byId("adgUrl").value.trim();
    var statusCode = String(byId("adgStatusCode").value || "200");
    if (!name) throw new Error("请填写接口名称。");
    if (!url) throw new Error("请填写请求地址。");
    if (!/^\d{3}$/.test(statusCode) || Number(statusCode) < 100 || Number(statusCode) > 599) throw new Error("返回状态码应在 100 到 599 之间。");

    var urlInfo = Core.analyzeUrl(url);
    var headers = normalizeHeaders(parseEditor("adgHeadersJson"));
    var requestValue = parseEditor("adgRequestJson");
    var responseHasBody = !!byId("adgResponseJson").value.trim();
    var responseValue = responseHasBody ? parseEditor("adgResponseJson") : undefined;

    if (rebuildFields !== false) {
      state.requestFields = Core.buildFields(requestValue, state.requestFields, byId("adgFieldNotes").value, { pathParams: urlInfo.pathParams });
      state.responseFields = responseHasBody ? Core.buildFields(responseValue, state.responseFields, byId("adgFieldNotes").value, { pathParams: [] }) : [];
    }

    return {
      name: name,
      description: byId("adgDescription").value.trim(),
      url: url,
      method: byId("adgMethod").value,
      contentType: byId("adgContentType").value,
      statusCode: statusCode,
      headers: headers,
      requestValue: requestValue,
      responseHasBody: responseHasBody,
      responseValue: responseValue,
      requestFields: state.requestFields,
      responseFields: state.responseFields,
      errorCodes: byId("adgErrorCodes").value
    };
  }

  function outputText(tab) {
    if (!state.outputs) return "";
    var values = {
      markdown: state.outputs.markdown,
      openapi: state.outputs.openApiJson,
      curl: state.outputs.codes.curl,
      csharp: state.outputs.codes.csharp,
      javascript: state.outputs.codes.javascript,
      java: state.outputs.codes.java,
      preview: state.outputs.markdown
    };
    return values[tab] || "";
  }

  function renderOutputs() {
    if (!state.outputs) return;
    byId("adgMarkdownOutput").textContent = state.outputs.markdown;
    byId("adgOpenApiOutput").textContent = state.outputs.openApiJson;
    byId("adgCurlOutput").textContent = state.outputs.codes.curl;
    byId("adgCSharpOutput").textContent = state.outputs.codes.csharp;
    byId("adgJavaScriptOutput").textContent = state.outputs.codes.javascript;
    byId("adgJavaOutput").textContent = state.outputs.codes.java;
    byId("adgPreviewOutput").innerHTML = state.outputs.previewHtml;
    setValidation(state.outputs.validationErrors);
    document.querySelectorAll("[data-export]").forEach(function (button) { button.disabled = false; });
  }

  function locationOptions(value, response) {
    if (response) return '<option value="auto">—</option>';
    return [
      ["auto", "自动"], ["path", "Path"], ["query", "Query"], ["body", "Body"], ["header", "Header"]
    ].map(function (option) {
      return '<option value="' + option[0] + '"' + (value === option[0] ? " selected" : "") + ">" + option[1] + "</option>";
    }).join("");
  }

  function renderFieldTable(kind) {
    var fields = kind === "request" ? state.requestFields : state.responseFields;
    var target = byId(kind === "request" ? "adgRequestFields" : "adgResponseFields");
    if (!fields.length) {
      target.innerHTML = '<tr><td class="adg-empty-row" colspan="8">当前 JSON 没有可展示字段</td></tr>';
      return;
    }
    target.innerHTML = fields.map(function (field, index) {
      return '<tr data-kind="' + kind + '" data-index="' + index + '">' +
        '<td><input type="text" value="' + escapeAttribute(field.path) + '" data-key="path" aria-label="字段名称"><span class="adg-field-path" hidden>' + Core.escapeHtml(field.path) + "</span></td>" +
        '<td><span class="adg-field-type">' + Core.escapeHtml(Core.displayType(field)) + "</span></td>" +
        '<td><input type="checkbox" data-key="required" aria-label="是否必填"' + (field.required ? " checked" : "") + "></td>" +
        '<td><input type="text" value="' + escapeAttribute(field.description) + '" data-key="description" aria-label="字段说明"></td>' +
        '<td><input type="text" value="' + escapeAttribute(field.example) + '" data-key="example" aria-label="示例值"></td>' +
        '<td><input type="text" value="' + escapeAttribute(field.enumValue) + '" data-key="enumValue" aria-label="枚举值"></td>' +
        '<td><input type="text" value="' + escapeAttribute(field.defaultValue) + '" data-key="defaultValue" aria-label="默认值"></td>' +
        '<td><select class="browser-default" data-key="location" aria-label="参数位置"' + (kind === "response" ? " disabled" : "") + ">" + locationOptions(field.location, kind === "response") + "</select></td>" +
        "</tr>";
    }).join("");
  }

  function renderFieldTables() {
    renderFieldTable("request");
    renderFieldTable("response");
    byId("adgFieldCount").textContent = state.requestFields.length + " 个请求字段，" + state.responseFields.length + " 个返回字段";
  }

  function generateDocument(rebuildFields, skipFieldRender) {
    var button = byId("adgGenerate");
    button.disabled = true;
    setGenerateStatus("正在生成…", "");
    try {
      state.data = collectData(rebuildFields);
      state.outputs = Generators.buildDocument(state.data);
      if (!skipFieldRender) renderFieldTables();
      renderOutputs();
      openFieldConfig();
      setGenerateStatus("已生成 " + (state.requestFields.length + state.responseFields.length) + " 个字段", "success");
      scheduleDraftSave();
      return true;
    } catch (error) {
      showGlobalError(error.message || "生成失败，请检查输入内容。");
      setGenerateStatus("生成失败", "error");
      return false;
    } finally {
      button.disabled = false;
    }
  }

  function scheduleRegenerate() {
    clearTimeout(state.regenerateTimer);
    state.regenerateTimer = setTimeout(function () {
      if (state.outputs) generateDocument(false, true);
    }, 280);
  }

  function updateFieldFromInput(input) {
    var row = input.closest("tr[data-kind]");
    if (!row) return;
    var fields = row.dataset.kind === "request" ? state.requestFields : state.responseFields;
    var field = fields[Number(row.dataset.index)];
    if (!field) return;
    var key = input.dataset.key;
    field[key] = input.type === "checkbox" ? input.checked : input.value;
    if (key === "path" && !field.path.trim()) field.path = field.sourcePath || "field";
    markDirty();
    scheduleRegenerate();
  }

  function openFieldConfig() {
    var container = byId("adgFieldConfig");
    container.classList.add("adg-open");
    byId("adgFieldConfigToggle").setAttribute("aria-expanded", "true");
  }

  function toggleFieldConfig() {
    var container = byId("adgFieldConfig");
    var open = container.classList.toggle("adg-open");
    byId("adgFieldConfigToggle").setAttribute("aria-expanded", String(open));
  }

  function switchFieldTab(tab) {
    document.querySelectorAll("[data-field-tab]").forEach(function (button) {
      button.classList.toggle("adg-active", button.dataset.fieldTab === tab);
    });
    document.querySelectorAll("[data-field-pane]").forEach(function (pane) {
      pane.hidden = pane.dataset.fieldPane !== tab;
    });
  }

  function switchOutputTab(tab) {
    state.activeTab = tab;
    document.querySelectorAll("[data-output-tab]").forEach(function (button) {
      button.classList.toggle("adg-active", button.dataset.outputTab === tab);
    });
    document.querySelectorAll("[data-output-pane]").forEach(function (pane) {
      pane.classList.toggle("adg-active", pane.dataset.outputPane === tab);
    });
    scheduleDraftSave();
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy") ? resolve() : reject(new Error("复制失败"));
      } catch (error) {
        reject(error);
      }
      document.body.removeChild(textarea);
    });
  }

  function copyActiveOutput() {
    var text = outputText(state.activeTab);
    if (!text) {
      showGlobalError("请先生成文档。");
      return;
    }
    var button = byId("adgCopyActive");
    copyText(text).then(function () {
      button.classList.add("adg-copied");
      button.innerHTML = '<i class="fas fa-check"></i>';
      setTimeout(function () {
        button.classList.remove("adg-copied");
        button.innerHTML = '<i class="fas fa-copy"></i>';
      }, 1400);
    }).catch(function () {
      showGlobalError("复制失败，请手动选择结果内容。");
    });
  }

  function exportDocument(type, button) {
    if (!state.data || !state.outputs) {
      showGlobalError("请先生成文档，再执行导出。");
      return;
    }
    var status = byId("adgExportStatus");
    document.querySelectorAll("[data-export]").forEach(function (item) { item.disabled = true; });
    status.textContent = type === "pdf" ? "正在本地排版 PDF…" : "正在准备文件…";
    setTimeout(function () {
      try {
        if (type === "md") Exporters.exportMarkdown(state.data, state.outputs);
        else if (type === "json") Exporters.exportOpenApi(state.data, state.outputs);
        else if (type === "docx") Exporters.exportDocx(state.data, state.outputs);
        else if (type === "pdf") Exporters.exportPdf(state.data, state.outputs);
        state.dirty = false;
        status.textContent = "已导出 " + type.toUpperCase() + "，文件仅在本地生成";
        scheduleDraftSave();
      } catch (error) {
        status.textContent = "导出失败：" + error.message;
        showGlobalError("文件导出失败：" + error.message);
      } finally {
        document.querySelectorAll("[data-export]").forEach(function (item) { item.disabled = false; });
        setTimeout(function () {
          status.textContent = DEFAULT_EXPORT_STATUS;
        }, 2600);
      }
    }, 30);
  }

  function formSnapshot() {
    return {
      name: byId("adgName").value,
      description: byId("adgDescription").value,
      url: byId("adgUrl").value,
      method: byId("adgMethod").value,
      contentType: byId("adgContentType").value,
      statusCode: byId("adgStatusCode").value,
      headersJson: byId("adgHeadersJson").value,
      requestJson: byId("adgRequestJson").value,
      responseJson: byId("adgResponseJson").value,
      fieldNotes: byId("adgFieldNotes").value,
      errorCodes: byId("adgErrorCodes").value,
      requestFields: state.requestFields,
      responseFields: state.responseFields,
      activeTab: state.activeTab,
      dirty: state.dirty,
      savedAt: new Date().toISOString()
    };
  }

  function scheduleDraftSave() {
    if (!state.initialized || !byId("adgDraftToggle").checked) return;
    clearTimeout(state.saveTimer);
    byId("adgDraftStatus").textContent = "正在保存…";
    state.saveTimer = setTimeout(function () {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(formSnapshot()));
        byId("adgDraftStatus").textContent = "草稿已保存在当前浏览器";
      } catch (error) {
        byId("adgDraftStatus").textContent = "草稿保存失败";
      }
    }, 350);
  }

  function markDirty() {
    if (!state.initialized) return;
    state.dirty = true;
    scheduleDraftSave();
  }

  function applySnapshot(snapshot) {
    byId("adgName").value = snapshot.name || "";
    byId("adgDescription").value = snapshot.description || "";
    byId("adgUrl").value = snapshot.url || "";
    byId("adgMethod").value = snapshot.method || "POST";
    byId("adgContentType").value = snapshot.contentType || "application/json";
    byId("adgStatusCode").value = snapshot.statusCode || "200";
    byId("adgHeadersJson").value = snapshot.headersJson || "";
    byId("adgRequestJson").value = snapshot.requestJson || "";
    byId("adgResponseJson").value = snapshot.responseJson || "";
    byId("adgFieldNotes").value = snapshot.fieldNotes || "";
    byId("adgErrorCodes").value = snapshot.errorCodes || "400：请求参数错误\n401：身份认证失败\n500：服务器内部错误";
    state.requestFields = Array.isArray(snapshot.requestFields) ? snapshot.requestFields : [];
    state.responseFields = Array.isArray(snapshot.responseFields) ? snapshot.responseFields : [];
    state.activeTab = snapshot.activeTab || "markdown";
    state.dirty = snapshot.dirty !== false;
    switchOutputTab(state.activeTab);
  }

  function loadDraft() {
    var raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return false;
    try {
      var snapshot = JSON.parse(raw);
      applySnapshot(snapshot);
      byId("adgDraftToggle").checked = true;
      byId("adgDraftStatus").textContent = "已恢复本地草稿";
      return true;
    } catch (error) {
      localStorage.removeItem(DRAFT_KEY);
      return false;
    }
  }

  function loadExample() {
    byId("adgName").value = "获取用户订单详情";
    byId("adgDescription").value = "根据用户 ID 查询订单及商品明细，展示嵌套对象、对象数组、基础数组、空对象、空数组和 null 字段。";
    byId("adgUrl").value = "https://api.example.com/api/users/{id}/orders";
    byId("adgMethod").value = "POST";
    byId("adgContentType").value = "application/json";
    byId("adgStatusCode").value = "200";
    byId("adgHeadersJson").value = '{\n  "Authorization": "Bearer sk-example-secret",\n  "X-Trace-Id": "550e8400-e29b-41d4-a716-446655440000"\n}';
    byId("adgRequestJson").value = '{\n  "id": 42,\n  "filter": {\n    "createdAt": {\n      "from": "2026-07-01T00:00:00Z",\n      "to": "2026-07-31T23:59:59Z"\n    },\n    "statuses": [0, 1]\n  },\n  "includeItems": true\n}';
    byId("adgResponseJson").value = '{\n  "code": 0,\n  "message": "查询成功",\n  "data": {\n    "user": {\n      "id": 90071992547409931234,\n      "name": "示例用户",\n      "profile": {\n        "avatar": "https://example.com/avatar.png",\n        "email": "user@example.com"\n      }\n    },\n    "items": [\n      {\n        "id": "550e8400-e29b-41d4-a716-446655440000",\n        "status": 1,\n        "price": 19.9\n      }\n    ],\n    "tags": ["new", "paid"],\n    "extra": {},\n    "warnings": [],\n    "nextCursor": null\n  }\n}';
    byId("adgFieldNotes").value = "id：用户 ID，必填\nfilter.createdAt.from：开始时间\nfilter.createdAt.to：结束时间\nfilter.statuses[]：状态列表，枚举值：0=禁用，1=启用\ndata.user.id：用户 ID\ndata.user.name：用户名称\ndata.items[].status：订单状态，枚举值：0=禁用，1=启用";
    state.requestFields = [];
    state.responseFields = [];
    markDirty();
    generateDocument(true);
  }

  function clearAll() {
    byId("adgName").value = "";
    byId("adgDescription").value = "";
    byId("adgUrl").value = "";
    byId("adgMethod").value = "POST";
    byId("adgContentType").value = "application/json";
    byId("adgStatusCode").value = "200";
    byId("adgHeadersJson").value = "";
    byId("adgRequestJson").value = "";
    byId("adgResponseJson").value = "";
    byId("adgFieldNotes").value = "";
    byId("adgErrorCodes").value = "400：请求参数错误\n401：身份认证失败\n500：服务器内部错误";
    state.requestFields = [];
    state.responseFields = [];
    state.data = null;
    state.outputs = null;
    state.dirty = false;
    localStorage.removeItem(DRAFT_KEY);
    byId("adgDraftToggle").checked = false;
    byId("adgDraftStatus").textContent = "草稿未启用";
    byId("adgMarkdownOutput").textContent = "填写左侧信息后点击“一键生成”。";
    ["adgOpenApiOutput", "adgCurlOutput", "adgCSharpOutput", "adgJavaScriptOutput", "adgJavaOutput", "adgPreviewOutput"].forEach(function (id) {
      var target = byId(id);
      if (target) target.textContent = "";
    });
    Object.keys(editorConfig).forEach(function (id) {
      setEditorError(id, "");
    });
    renderFieldTables();
    showGlobalError("");
    byId("adgValidation").className = "adg-validation";
    byId("adgValidation").innerHTML = '<i class="fas fa-circle-info"></i> 尚未生成';
    setGenerateStatus("等待生成", "");
    document.querySelectorAll("[data-export]").forEach(function (button) { button.disabled = true; });
  }

  function bindEvents() {
    Object.keys(editorConfig).forEach(function (id) {
      var textarea = byId(id);
      textarea.addEventListener("input", function () {
        setEditorError(id, "");
        markDirty();
      });
    });

    document.querySelectorAll("[data-json-action]").forEach(function (button) {
      button.addEventListener("click", function () { formatEditor(button.dataset.target, button.dataset.jsonAction === "minify"); });
    });
    document.querySelectorAll(".adg-form-grid input, .adg-form-grid textarea, .adg-form-grid select, #adgFieldNotes, #adgErrorCodes").forEach(function (input) {
      input.addEventListener("input", markDirty);
      input.addEventListener("change", markDirty);
    });

    byId("adgGenerate").addEventListener("click", function () { markDirty(); generateDocument(true); });
    byId("adgLoadExample").addEventListener("click", loadExample);
    byId("adgClear").addEventListener("click", function () {
      if (!state.dirty || window.confirm("确定清空当前接口内容和本地草稿吗？")) clearAll();
    });
    byId("adgApplyNotes").addEventListener("click", function () {
      if (!state.requestFields.length && !state.responseFields.length) {
        generateDocument(true);
        return;
      }
      state.requestFields = Core.applyNotes(state.requestFields, byId("adgFieldNotes").value, true);
      state.responseFields = Core.applyNotes(state.responseFields, byId("adgFieldNotes").value, true);
      renderFieldTables();
      markDirty();
      generateDocument(false);
    });

    byId("adgFieldConfigToggle").addEventListener("click", toggleFieldConfig);
    byId("adgFieldConfigToggle").addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleFieldConfig();
      }
    });
    document.querySelectorAll("[data-field-tab]").forEach(function (button) {
      button.addEventListener("click", function () { switchFieldTab(button.dataset.fieldTab); });
    });
    [byId("adgRequestFields"), byId("adgResponseFields")].forEach(function (tbody) {
      tbody.addEventListener("input", function (event) { if (event.target.dataset.key) updateFieldFromInput(event.target); });
      tbody.addEventListener("change", function (event) { if (event.target.dataset.key) updateFieldFromInput(event.target); });
    });

    document.querySelectorAll("[data-output-tab]").forEach(function (button) {
      button.addEventListener("click", function () { switchOutputTab(button.dataset.outputTab); });
    });
    byId("adgCopyActive").addEventListener("click", copyActiveOutput);
    document.querySelectorAll("[data-export]").forEach(function (button) {
      button.disabled = true;
      button.addEventListener("click", function () { exportDocument(button.dataset.export, button); });
    });

    byId("adgDraftToggle").addEventListener("change", function () {
      if (this.checked) {
        byId("adgDraftStatus").textContent = "正在启用本地草稿…";
        scheduleDraftSave();
      } else {
        localStorage.removeItem(DRAFT_KEY);
        byId("adgDraftStatus").textContent = "草稿未启用";
      }
    });
    window.addEventListener("beforeunload", function (event) {
      if (!state.dirty) return;
      event.preventDefault();
      event.returnValue = "";
    });
  }

  function init() {
    bindEvents();
    var restored = loadDraft();
    state.initialized = true;
    if (restored) generateDocument(true);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
