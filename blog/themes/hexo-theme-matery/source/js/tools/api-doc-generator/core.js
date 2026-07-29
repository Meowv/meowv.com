(function (root, factory) {
  root.ApiDocCore = factory();
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function LosslessNumber(raw) {
    this.raw = raw;
  }

  function isLosslessNumber(value) {
    return value instanceof LosslessNumber || (
      value && typeof value === "object" && typeof value.raw === "string" && value.constructor && value.constructor.name === "LosslessNumber"
    );
  }

  function JsonParser(text, label) {
    this.text = String(text || "");
    this.label = label || "JSON";
    this.position = 0;
    this.length = this.text.length;
  }

  JsonParser.prototype.getLocation = function (position) {
    var before = this.text.slice(0, position);
    var lines = before.split("\n");
    return {
      line: lines.length,
      column: lines[lines.length - 1].length + 1,
      position: position
    };
  };

  JsonParser.prototype.fail = function (message, position) {
    var at = position === undefined ? this.position : position;
    var location = this.getLocation(at);
    var error = new SyntaxError(
      this.label + " 解析失败：第 " + location.line + " 行，第 " + location.column + " 列，" + message
    );
    error.line = location.line;
    error.column = location.column;
    error.position = location.position;
    throw error;
  };

  JsonParser.prototype.skipWhitespace = function () {
    while (this.position < this.length && /[\u0020\u0009\u000a\u000d]/.test(this.text.charAt(this.position))) {
      this.position++;
    }
  };

  JsonParser.prototype.parse = function () {
    this.skipWhitespace();
    if (this.position >= this.length) this.fail("内容为空");
    var value = this.parseValue();
    this.skipWhitespace();
    if (this.position !== this.length) {
      this.fail("存在多余字符 “" + this.text.charAt(this.position) + "”");
    }
    return value;
  };

  JsonParser.prototype.parseValue = function () {
    this.skipWhitespace();
    var char = this.text.charAt(this.position);
    if (char === "{") return this.parseObject();
    if (char === "[") return this.parseArray();
    if (char === '"') return this.parseString();
    if (char === "t") return this.parseLiteral("true", true);
    if (char === "f") return this.parseLiteral("false", false);
    if (char === "n") return this.parseLiteral("null", null);
    if (char === "-" || /[0-9]/.test(char)) return this.parseNumber();
    if (!char) this.fail("值不完整");
    this.fail("无法识别字符 “" + char + "”");
  };

  JsonParser.prototype.parseLiteral = function (literal, value) {
    if (this.text.slice(this.position, this.position + literal.length) !== literal) {
      this.fail("应为 " + literal);
    }
    this.position += literal.length;
    return value;
  };

  JsonParser.prototype.parseString = function () {
    var result = "";
    this.position++;
    while (this.position < this.length) {
      var char = this.text.charAt(this.position++);
      if (char === '"') return result;
      if (char === "\\") {
        if (this.position >= this.length) this.fail("字符串转义不完整");
        var escaped = this.text.charAt(this.position++);
        var escapes = {
          '"': '"',
          "\\": "\\",
          "/": "/",
          b: "\b",
          f: "\f",
          n: "\n",
          r: "\r",
          t: "\t"
        };
        if (Object.prototype.hasOwnProperty.call(escapes, escaped)) {
          result += escapes[escaped];
        } else if (escaped === "u") {
          var hex = this.text.slice(this.position, this.position + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) this.fail("Unicode 转义应包含 4 位十六进制字符", this.position);
          result += String.fromCharCode(parseInt(hex, 16));
          this.position += 4;
        } else {
          this.fail("不支持的转义字符 \\" + escaped + "”", this.position - 1);
        }
      } else {
        if (char.charCodeAt(0) < 0x20) this.fail("字符串中包含未转义的控制字符", this.position - 1);
        result += char;
      }
    }
    this.fail("字符串缺少结束引号");
  };

  JsonParser.prototype.parseNumber = function () {
    var start = this.position;
    if (this.text.charAt(this.position) === "-") this.position++;

    var first = this.text.charAt(this.position);
    if (first === "0") {
      this.position++;
      if (/[0-9]/.test(this.text.charAt(this.position))) this.fail("数字不能包含多余的前导 0");
    } else if (/[1-9]/.test(first)) {
      while (/[0-9]/.test(this.text.charAt(this.position))) this.position++;
    } else {
      this.fail("数字格式不正确");
    }

    var isInteger = true;
    if (this.text.charAt(this.position) === ".") {
      isInteger = false;
      this.position++;
      if (!/[0-9]/.test(this.text.charAt(this.position))) this.fail("小数点后需要数字");
      while (/[0-9]/.test(this.text.charAt(this.position))) this.position++;
    }

    if (/e/i.test(this.text.charAt(this.position))) {
      isInteger = false;
      this.position++;
      if (/[+-]/.test(this.text.charAt(this.position))) this.position++;
      if (!/[0-9]/.test(this.text.charAt(this.position))) this.fail("指数后需要数字");
      while (/[0-9]/.test(this.text.charAt(this.position))) this.position++;
    }

    var raw = this.text.slice(start, this.position);
    var number = Number(raw);
    if (isInteger) return Number.isSafeInteger(number) ? number : new LosslessNumber(raw);
    if (!Number.isFinite(number)) this.fail("数字超出可处理范围", start);
    return number;
  };

  JsonParser.prototype.parseArray = function () {
    var result = [];
    this.position++;
    this.skipWhitespace();
    if (this.text.charAt(this.position) === "]") {
      this.position++;
      return result;
    }
    while (this.position < this.length) {
      result.push(this.parseValue());
      this.skipWhitespace();
      var char = this.text.charAt(this.position++);
      if (char === "]") return result;
      if (char !== ",") this.fail("数组元素之间需要逗号", this.position - 1);
      this.skipWhitespace();
      if (this.text.charAt(this.position) === "]") this.fail("数组末尾不能有多余逗号");
    }
    this.fail("数组缺少结束符 ]");
  };

  JsonParser.prototype.parseObject = function () {
    var result = {};
    this.position++;
    this.skipWhitespace();
    if (this.text.charAt(this.position) === "}") {
      this.position++;
      return result;
    }
    while (this.position < this.length) {
      if (this.text.charAt(this.position) !== '"') this.fail("对象字段名需要使用双引号");
      var key = this.parseString();
      this.skipWhitespace();
      if (this.text.charAt(this.position++) !== ":") this.fail("字段名后需要冒号", this.position - 1);
      result[key] = this.parseValue();
      this.skipWhitespace();
      var char = this.text.charAt(this.position++);
      if (char === "}") return result;
      if (char !== ",") this.fail("对象字段之间需要逗号", this.position - 1);
      this.skipWhitespace();
      if (this.text.charAt(this.position) === "}") this.fail("对象末尾不能有多余逗号");
    }
    this.fail("对象缺少结束符 }");
  };

  function parseJson(text, label, emptyValue) {
    var source = String(text === undefined || text === null ? "" : text).trim();
    if (!source && arguments.length >= 3) return emptyValue;
    return new JsonParser(source, label).parse();
  }

  function stringifyLossless(value, spacing) {
    var gapSize = typeof spacing === "number" ? Math.max(0, Math.min(10, spacing)) : 0;
    var gap = new Array(gapSize + 1).join(" ");
    var stack = [];

    function serialize(current, depth) {
      if (isLosslessNumber(current)) return current.raw;
      if (current === null) return "null";
      if (typeof current === "string") return JSON.stringify(current);
      if (typeof current === "number") return Number.isFinite(current) ? String(current) : "null";
      if (typeof current === "boolean") return current ? "true" : "false";
      if (typeof current !== "object") return "null";
      if (stack.indexOf(current) !== -1) throw new TypeError("无法序列化循环引用");
      stack.push(current);

      var nextIndent = new Array(depth + 2).join(gap);
      var currentIndent = new Array(depth + 1).join(gap);
      var parts = [];
      if (Array.isArray(current)) {
        for (var i = 0; i < current.length; i++) parts.push(serialize(current[i], depth + 1));
        stack.pop();
        if (!parts.length) return "[]";
        return gap ? "[\n" + nextIndent + parts.join(",\n" + nextIndent) + "\n" + currentIndent + "]" : "[" + parts.join(",") + "]";
      }

      Object.keys(current).forEach(function (key) {
        var separator = gap ? ": " : ":";
        parts.push(JSON.stringify(key) + separator + serialize(current[key], depth + 1));
      });
      stack.pop();
      if (!parts.length) return "{}";
      return gap ? "{\n" + nextIndent + parts.join(",\n" + nextIndent) + "\n" + currentIndent + "}" : "{" + parts.join(",") + "}";
    }

    return serialize(value, 0);
  }

  function inferType(value) {
    if (value === null) return "null";
    if (isLosslessNumber(value)) return "integer";
    if (Array.isArray(value)) return "array";
    if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
    if (typeof value === "boolean") return "boolean";
    if (typeof value === "string") return "string";
    if (typeof value === "object") return "object";
    return "string";
  }

  function inferFormat(value) {
    if (typeof value !== "string") return "";
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/.test(value)) return "date-time";
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return "date";
    if (/^\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/.test(value)) return "time";
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) return "uuid";
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "email";
    if (/^[a-z][a-z0-9+.-]*:\/\/[^\s]+$/i.test(value)) return "uri";
    return "";
  }

  function chooseRepresentative(values) {
    var list = Array.isArray(values) ? values : [];
    var objectValues = list.filter(function (item) {
      return item && typeof item === "object" && !Array.isArray(item) && !isLosslessNumber(item);
    });
    if (objectValues.length) {
      var merged = {};
      objectValues.forEach(function (item) {
        Object.keys(item).forEach(function (key) {
          if (!Object.prototype.hasOwnProperty.call(merged, key) || merged[key] === null) {
            merged[key] = item[key];
          } else if (
            merged[key] && item[key] && typeof merged[key] === "object" && typeof item[key] === "object" &&
            !Array.isArray(merged[key]) && !Array.isArray(item[key]) && !isLosslessNumber(merged[key]) && !isLosslessNumber(item[key])
          ) {
            merged[key] = chooseRepresentative([merged[key], item[key]]);
          } else if (Array.isArray(merged[key]) && Array.isArray(item[key]) && !merged[key].length && item[key].length) {
            merged[key] = item[key];
          }
        });
      });
      return merged;
    }
    for (var i = 0; i < list.length; i++) {
      if (list[i] !== null && list[i] !== undefined) return list[i];
    }
    return null;
  }

  function exampleText(value) {
    if (isLosslessNumber(value)) return value.raw;
    if (value === null) return "null";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return stringifyLossless(value, 0);
  }

  function flattenFields(value) {
    var fields = [];

    function addNode(node, path) {
      var type = inferType(node);
      var displayPath = path;
      var representative = null;
      var itemType = "";

      if (type === "array") {
        displayPath += "[]";
        representative = chooseRepresentative(node);
        itemType = node.length ? inferType(representative) : "unknown";
      }

      fields.push({
        path: displayPath,
        type: type,
        itemType: itemType,
        format: inferFormat(node),
        example: exampleText(node)
      });

      if (type === "object") {
        Object.keys(node).forEach(function (key) {
          addNode(node[key], path ? path + "." + key : key);
        });
      } else if (type === "array" && representative && inferType(representative) === "object") {
        Object.keys(representative).forEach(function (key) {
          addNode(representative[key], displayPath + "." + key);
        });
      } else if (type === "array" && Array.isArray(representative)) {
        addNode(representative, displayPath);
      }
    }

    if (inferType(value) === "object") {
      Object.keys(value).forEach(function (key) { addNode(value[key], key); });
    } else if (inferType(value) === "array") {
      addNode(value, "");
    } else {
      addNode(value, "value");
    }
    return fields;
  }

  function parseFieldNotes(text) {
    var notes = {};
    String(text || "").replace(/\r\n?/g, "\n").split("\n").forEach(function (line) {
      var trimmed = line.trim();
      if (!trimmed) return;
      var match = trimmed.match(/^(.+?)[：:]\s*(.+)$/);
      if (!match) return;
      var path = match[1].trim();
      var description = match[2].trim();
      var enumText = "";
      var defaultValue = "";
      var enumMatch = description.match(/(?:^|[，,；;]\s*)枚举值[：:]\s*(.+)$/);
      if (enumMatch) {
        enumText = enumMatch[1].trim();
        description = description.slice(0, enumMatch.index).replace(/[，,；;\s]+$/, "");
      }
      var defaultMatch = description.match(/(?:^|[，,；;]\s*)默认值[：:]\s*([^，,；;]+)$/);
      if (defaultMatch) {
        defaultValue = defaultMatch[1].trim();
        description = description.slice(0, defaultMatch.index).replace(/[，,；;\s]+$/, "");
      }
      notes[path] = {
        description: description,
        enumValue: enumText,
        defaultValue: defaultValue,
        required: /(?:^|[，,；;\s])必填(?:$|[，,；;\s])/.test(match[2])
      };
    });
    return notes;
  }

  function analyzeUrl(input) {
    var source = String(input || "").trim() || "/api/example";
    var absolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(source);
    var parsed;
    try {
      parsed = new URL(source, "https://api.example.com");
    } catch (error) {
      throw new Error("请求地址格式不正确：" + error.message);
    }
    var pathParams = [];
    var seen = {};
    var pathname = (parsed.pathname || "/").replace(/%7B/ig, "{").replace(/%7D/ig, "}");
    pathname.replace(/\{([^{}\/]+)\}/g, function (_, name) {
      if (!seen[name]) {
        seen[name] = true;
        pathParams.push(name);
      }
      return _;
    });
    return {
      source: source,
      absolute: absolute,
      server: absolute ? parsed.origin : "https://api.example.com",
      pathname: pathname,
      query: parsed.search,
      pathParams: pathParams
    };
  }

  function fieldMatchesPathParam(fieldPath, pathParams) {
    if (fieldPath && typeof fieldPath === "object") {
      return fieldMatchesPathParam(fieldPath.path, pathParams) || fieldMatchesPathParam(fieldPath.sourcePath, pathParams);
    }
    var normalized = String(fieldPath || "").replace(/\[\]/g, "");
    var parts = normalized.split(".");
    var last = parts[parts.length - 1];
    return pathParams.indexOf(normalized) !== -1 || pathParams.indexOf(last) !== -1;
  }

  function resolveLocation(field, method, pathParams) {
    if (fieldMatchesPathParam(field, pathParams || [])) return "path";
    if (field.location && field.location !== "auto") return field.location;
    return /^(GET|DELETE)$/i.test(method || "GET") ? "query" : "body";
  }

  function buildFields(value, existingFields, notesText, options) {
    var existingMap = {};
    (existingFields || []).forEach(function (field) { existingMap[field.sourcePath || field.path] = field; });
    var notes = parseFieldNotes(notesText);
    var pathParams = (options && options.pathParams) || [];

    return flattenFields(value).map(function (row) {
      var existing = existingMap[row.path] || {};
      var note = notes[existing.path] || notes[row.path] || {};
      var field = {
        path: existing.path || row.path,
        sourcePath: row.path,
        type: row.type,
        itemType: row.itemType,
        format: row.format,
        required: existing.required !== undefined ? !!existing.required : fieldMatchesPathParam(row.path, pathParams),
        description: existing.description || note.description || "",
        example: existing.example !== undefined && existing.example !== "" ? existing.example : row.example,
        enumValue: existing.enumValue || note.enumValue || "",
        defaultValue: existing.defaultValue || note.defaultValue || "",
        location: existing.location || "auto"
      };
      if (fieldMatchesPathParam(field, pathParams)) {
        field.location = "path";
        field.required = true;
      }
      return field;
    });
  }

  function applyNotes(fields, notesText, force) {
    var notes = parseFieldNotes(notesText);
    return (fields || []).map(function (field) {
      var note = notes[field.path] || notes[field.sourcePath];
      if (!note) return field;
      var next = Object.assign({}, field);
      if (force || !next.description) next.description = note.description || next.description;
      if (force || !next.enumValue) next.enumValue = note.enumValue || next.enumValue;
      if (force || !next.defaultValue) next.defaultValue = note.defaultValue || next.defaultValue;
      if (note.required) next.required = true;
      return next;
    });
  }

  function displayType(field) {
    if (!field) return "string";
    if (field.type === "array") return field.itemType && field.itemType !== "unknown" ? "array<" + field.itemType + ">" : "array";
    return field.format ? field.type + " (" + field.format + ")" : field.type;
  }

  function isSensitiveHeader(name) {
    return /authorization|proxy-authorization|api[-_]?key|token|secret|cookie|session/i.test(String(name || ""));
  }

  function maskedHeaderValue(name, value) {
    var headerName = String(name || "");
    var original = String(value === undefined || value === null ? "" : value);
    if (!isSensitiveHeader(headerName)) return original;
    if (/authorization/i.test(headerName)) {
      if (/^basic\s+/i.test(original)) return "Basic YOUR_CREDENTIALS";
      return "Bearer YOUR_TOKEN";
    }
    if (/api[-_]?key/i.test(headerName)) return "YOUR_API_KEY";
    if (/cookie|session/i.test(headerName)) return "YOUR_COOKIE";
    return "YOUR_TOKEN";
  }

  function sanitizeHeaders(headers) {
    var result = {};
    Object.keys(headers || {}).forEach(function (name) {
      result[name] = maskedHeaderValue(name, headers[name]);
    });
    return result;
  }

  function parseEnumValues(text, type) {
    var source = String(text || "").trim();
    if (!source) return [];
    return source.split(/[，,；;\n]+/).map(function (item) {
      var value = item.trim().replace(/^['"]|['"]$/g, "");
      if (value.indexOf("=") !== -1) value = value.split("=")[0].trim();
      if (type === "integer") {
        if (/^-?\d+$/.test(value)) {
          var number = Number(value);
          return Number.isSafeInteger(number) ? number : new LosslessNumber(value);
        }
      }
      if (type === "number" && /^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) return Number(value);
      if (type === "boolean" && /^(true|false)$/i.test(value)) return value.toLowerCase() === "true";
      if (type === "null" && value === "null") return null;
      return value;
    }).filter(function (value) { return value !== ""; });
  }

  function getValueAtPath(value, path) {
    var tokens = String(path || "").split(".");
    var current = value;
    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];
      var isArray = /\[\]$/.test(token);
      var key = token.replace(/\[\]$/, "");
      if (key) {
        if (!current || typeof current !== "object") return undefined;
        current = current[key];
      }
      if (isArray) {
        if (!Array.isArray(current)) return undefined;
        current = chooseRepresentative(current);
      }
    }
    return current;
  }

  function leafFields(fields) {
    return (fields || []).filter(function (field) {
      if (field.type !== "object" && field.type !== "array") return true;
      var sourcePath = field.sourcePath || field.path;
      var prefix = sourcePath + ".";
      return !(fields || []).some(function (candidate) {
        var candidatePath = candidate.sourcePath || candidate.path;
        return candidatePath !== sourcePath && candidatePath.indexOf(prefix) === 0;
      });
    });
  }

  function safeFilename(name) {
    var safe = String(name || "api-document")
      .trim()
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80);
    return safe || "api-document";
  }

  function escapeHtml(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  return {
    LosslessNumber: LosslessNumber,
    isLosslessNumber: isLosslessNumber,
    parseJson: parseJson,
    stringifyLossless: stringifyLossless,
    inferType: inferType,
    inferFormat: inferFormat,
    chooseRepresentative: chooseRepresentative,
    flattenFields: flattenFields,
    parseFieldNotes: parseFieldNotes,
    buildFields: buildFields,
    applyNotes: applyNotes,
    displayType: displayType,
    analyzeUrl: analyzeUrl,
    fieldMatchesPathParam: fieldMatchesPathParam,
    resolveLocation: resolveLocation,
    isSensitiveHeader: isSensitiveHeader,
    maskedHeaderValue: maskedHeaderValue,
    sanitizeHeaders: sanitizeHeaders,
    parseEnumValues: parseEnumValues,
    getValueAtPath: getValueAtPath,
    leafFields: leafFields,
    exampleText: exampleText,
    safeFilename: safeFilename,
    escapeHtml: escapeHtml
  };
});
