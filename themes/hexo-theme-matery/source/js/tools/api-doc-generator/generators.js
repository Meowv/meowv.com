(function (root, factory) {
  root.ApiDocGenerators = factory(root.ApiDocCore);
})(typeof window !== "undefined" ? window : globalThis, function (Core) {
  "use strict";

  if (!Core) throw new Error("ApiDocCore 未加载");

  function markdownCell(value) {
    var text = String(value === undefined || value === null || value === "" ? "—" : value);
    return text
      .replace(/\\/g, "\\\\")
      .replace(/\|/g, "\\|")
      .replace(/\r\n?|\n/g, "<br>")
      .replace(/`/g, "\\`");
  }

  function markdownTable(fields) {
    var lines = [
      "| 字段 | 类型 | 必填 | 说明 | 示例 | 枚举值 |",
      "|---|---|---|---|---|---|"
    ];
    if (!fields || !fields.length) {
      lines.push("| — | — | — | — | — | — |");
      return lines.join("\n");
    }
    fields.forEach(function (field) {
      lines.push(
        "| " + [
          field.path,
          Core.displayType(field),
          field.required ? "是" : "否",
          field.description,
          field.example,
          field.enumValue
        ].map(markdownCell).join(" | ") + " |"
      );
    });
    return lines.join("\n");
  }

  function parseErrorCodes(text, successStatus) {
    var rows = [];
    String(text || "").replace(/\r\n?/g, "\n").split("\n").forEach(function (line) {
      var match = line.trim().match(/^(\d{3}|default)\s*[：:]\s*(.+)$/i);
      if (match) rows.push({ code: match[1], description: match[2].trim() });
    });
    if (!rows.some(function (row) { return row.code === String(successStatus); })) {
      rows.unshift({ code: String(successStatus), description: "请求成功" });
    }
    return rows;
  }

  function fieldMap(fields) {
    var result = {};
    (fields || []).forEach(function (field) {
      result[field.path] = field;
      if (field.sourcePath) result[field.sourcePath] = field;
    });
    return result;
  }

  function coerceFieldValue(value, type) {
    if (value === undefined || value === null || value === "") return undefined;
    if (type === "integer") {
      if (/^-?\d+$/.test(String(value).trim())) {
        var integer = Number(value);
        return Number.isSafeInteger(integer) ? integer : new Core.LosslessNumber(String(value).trim());
      }
    }
    if (type === "number") {
      var number = Number(value);
      if (Number.isFinite(number)) return number;
    }
    if (type === "boolean" && /^(true|false)$/i.test(String(value).trim())) return String(value).toLowerCase() === "true";
    if (type === "null" && String(value).trim() === "null") return null;
    if (type === "object" || type === "array") {
      try { return Core.parseJson(String(value), "字段示例"); } catch (error) { return String(value); }
    }
    return String(value);
  }

  function attachFieldMetadata(schema, field, sample) {
    if (!field) return schema;
    if (field.description) schema.description = field.description;
    var enumValues = Core.parseEnumValues(field.enumValue, field.type);
    if (enumValues.length) schema.enum = enumValues;
    var example = coerceFieldValue(field.example, field.type);
    if (example !== undefined) schema.example = example;
    else if (sample !== undefined) schema.example = sample;
    var defaultValue = coerceFieldValue(field.defaultValue, field.type);
    if (defaultValue !== undefined) schema.default = defaultValue;
    return schema;
  }

  function schemaForValue(value, path, fieldsByPath) {
    var type = Core.inferType(value);
    var currentPath = type === "array" ? path + "[]" : path;
    var field = fieldsByPath[currentPath];
    var schema;

    if (type === "object") {
      schema = { type: "object", properties: {} };
      var required = [];
      Object.keys(value).forEach(function (key) {
        var childPath = path ? path + "." + key : key;
        schema.properties[key] = schemaForValue(value[key], childPath, fieldsByPath);
        var childType = Core.inferType(value[key]);
        var childField = fieldsByPath[childType === "array" ? childPath + "[]" : childPath];
        if (childField && childField.required) required.push(key);
      });
      if (required.length) schema.required = required;
    } else if (type === "array") {
      var representative = Core.chooseRepresentative(value);
      schema = {
        type: "array",
        items: value.length ? schemaForValue(representative, currentPath, fieldsByPath) : {}
      };
    } else if (type === "null") {
      schema = { type: "string", nullable: true, example: null };
    } else {
      schema = { type: type };
      var format = field && field.format ? field.format : Core.inferFormat(value);
      if (format) schema.format = format;
      schema.example = value;
    }
    return attachFieldMetadata(schema, field, value);
  }

  function schemaForParameter(field) {
    var schema;
    if (field.type === "array") {
      schema = {
        type: "array",
        items: field.itemType && field.itemType !== "unknown" ? { type: field.itemType === "null" ? "string" : field.itemType } : {}
      };
      if (field.itemType === "null") schema.items.nullable = true;
    } else if (field.type === "null") {
      schema = { type: "string", nullable: true };
    } else {
      schema = { type: field.type };
      if (field.format) schema.format = field.format;
    }
    return attachFieldMetadata(schema, field);
  }

  var SKIP = { skip: true };

  function filterBodyValue(value, path, fields, fieldsByPath, method, pathParams) {
    var type = Core.inferType(value);
    var currentPath = type === "array" ? path + "[]" : path;
    var field = fieldsByPath[currentPath];
    var location = field ? Core.resolveLocation(field, method, pathParams) : "body";

    if (type === "object") {
      var object = {};
      var count = 0;
      Object.keys(value).forEach(function (key) {
        var childPath = path ? path + "." + key : key;
        var child = filterBodyValue(value[key], childPath, fields, fieldsByPath, method, pathParams);
        if (child !== SKIP) {
          object[key] = child;
          count++;
        }
      });
      if (count) return object;
      if (path === "" && !/^(GET|DELETE)$/i.test(method || "GET")) return {};
      return field && location === "body" ? {} : SKIP;
    }

    if (type === "array") {
      if (!value.length) return location === "body" ? [] : SKIP;
      if (Core.inferType(Core.chooseRepresentative(value)) !== "object") return location === "body" ? value : SKIP;
      var array = value.map(function (item) {
        return filterBodyValue(item, currentPath, fields, fieldsByPath, method, pathParams);
      }).filter(function (item) { return item !== SKIP; });
      return array.length ? array : (location === "body" ? [] : SKIP);
    }

    return location === "body" ? value : SKIP;
  }

  function operationId(method, pathname) {
    var words = String(pathname || "api")
      .replace(/\{([^}]+)\}/g, " by $1 ")
      .split(/[^a-zA-Z0-9]+/)
      .filter(Boolean);
    var suffix = words.map(function (word, index) {
      var clean = word.replace(/[^a-zA-Z0-9]/g, "");
      return index === 0 ? clean.toLowerCase() : clean.charAt(0).toUpperCase() + clean.slice(1);
    }).join("");
    return String(method || "GET").toLowerCase() + (suffix ? suffix.charAt(0).toUpperCase() + suffix.slice(1) : "Api");
  }

  function hasResponseBody(data) {
    return data.responseHasBody !== false;
  }

  function buildOpenApi(data) {
    var url = Core.analyzeUrl(data.url);
    var method = String(data.method || "GET").toLowerCase();
    var fields = data.requestFields || [];
    var fieldsByPath = fieldMap(fields);
    var parameters = [];
    var parameterKeys = {};

    function addParameter(parameter) {
      var key = parameter.in + ":" + parameter.name;
      if (parameterKeys[key]) return;
      parameterKeys[key] = true;
      parameters.push(parameter);
    }

    url.pathParams.forEach(function (name) {
      var matching = fields.find(function (field) { return Core.fieldMatchesPathParam(field, [name]); });
      addParameter({
        name: name,
        in: "path",
        required: true,
        description: matching && matching.description ? matching.description : "路径参数 " + name,
        schema: matching ? schemaForParameter(matching) : { type: "string" },
        example: matching && matching.example ? coerceFieldValue(matching.example, matching.type) : name.toUpperCase()
      });
    });

    Core.leafFields(fields).forEach(function (field) {
      var location = Core.resolveLocation(field, data.method, url.pathParams);
      if (location !== "query" && location !== "header") return;
      var name = field.path.replace(/\[\]/g, "");
      addParameter({
        name: name,
        in: location,
        required: !!field.required,
        description: field.description || undefined,
        schema: schemaForParameter(field),
        example: coerceFieldValue(field.example, field.type)
      });
    });

    var sanitizedHeaders = Core.sanitizeHeaders(data.headers || {});
    Object.keys(sanitizedHeaders).forEach(function (name) {
      if (/^content-type$/i.test(name)) return;
      addParameter({
        name: name,
        in: "header",
        required: false,
        schema: { type: "string" },
        example: String(sanitizedHeaders[name])
      });
    });

    if (url.query) {
      new URLSearchParams(url.query).forEach(function (value, name) {
        addParameter({ name: name, in: "query", required: false, schema: { type: "string" }, example: value });
      });
    }

    var bodyValue = filterBodyValue(data.requestValue, "", fields, fieldsByPath, data.method, url.pathParams);
    var operation = {
      summary: data.name,
      description: data.description || undefined,
      operationId: operationId(data.method, url.pathname),
      parameters: parameters,
      responses: {}
    };
    if (!parameters.length) delete operation.parameters;

    if (bodyValue !== SKIP) {
      var requestSchema = schemaForValue(bodyValue, "", fieldsByPath);
      operation.requestBody = {
        required: fields.some(function (field) {
          return field.required && Core.resolveLocation(field, data.method, url.pathParams) === "body";
        }),
        content: {}
      };
      operation.requestBody.content[data.contentType] = {
        schema: requestSchema,
        example: bodyValue
      };
    }

    var successResponse = { description: "请求成功" };
    if (hasResponseBody(data)) {
      var responseSchema = schemaForValue(data.responseValue, "", fieldMap(data.responseFields));
      successResponse.content = {
        "application/json": {
          schema: responseSchema,
          example: data.responseValue
        }
      };
    }
    operation.responses[String(data.statusCode)] = successResponse;

    parseErrorCodes(data.errorCodes, data.statusCode).forEach(function (row) {
      if (row.code === String(data.statusCode)) return;
      if (!operation.responses[row.code]) operation.responses[row.code] = { description: row.description };
    });

    var paths = {};
    paths[url.pathname] = {};
    paths[url.pathname][method] = operation;
    return {
      openapi: "3.0.3",
      info: {
        title: data.name || "API 文档",
        description: data.description || "",
        version: "1.0.0"
      },
      servers: [{ url: url.server }],
      paths: paths
    };
  }

  function validateOpenApi(document) {
    var errors = [];
    if (!document || !/^3\.0\./.test(document.openapi || "")) errors.push("openapi 必须是 3.0.x 版本");
    if (!document.info || !document.info.title || !document.info.version) errors.push("info.title 和 info.version 不能为空");
    if (!Array.isArray(document.servers) || !document.servers.length || !document.servers[0].url) errors.push("servers 至少需要一个有效 URL");
    if (!document.paths || !Object.keys(document.paths).length) errors.push("paths 不能为空");
    Object.keys((document && document.paths) || {}).forEach(function (path) {
      if (path.charAt(0) !== "/") errors.push("路径 “" + path + "” 必须以 / 开头");
      Object.keys(document.paths[path] || {}).forEach(function (method) {
        var operation = document.paths[path][method];
        if (!operation.responses || !Object.keys(operation.responses).length) errors.push(path + " 的 " + method.toUpperCase() + " 缺少 responses");
        (operation.parameters || []).forEach(function (parameter) {
          if (parameter.in === "path" && parameter.required !== true) errors.push("Path 参数 “" + parameter.name + "” 必须 required: true");
        });
      });
    });
    return errors;
  }

  function queryEntries(data) {
    var url = Core.analyzeUrl(data.url);
    var entries = [];
    Core.leafFields(data.requestFields || []).forEach(function (field) {
      if (Core.resolveLocation(field, data.method, url.pathParams) !== "query") return;
      var value = Core.getValueAtPath(data.requestValue, field.sourcePath || field.path);
      if (value === undefined) value = field.example;
      if (value && typeof value === "object") value = Core.stringifyLossless(value, 0);
      else value = Core.exampleText(value);
      entries.push({ name: field.path.replace(/\[\]/g, ""), value: value });
    });
    return entries;
  }

  function bodyEntries(data) {
    var url = Core.analyzeUrl(data.url);
    return Core.leafFields(data.requestFields || []).filter(function (field) {
      return Core.resolveLocation(field, data.method, url.pathParams) === "body";
    }).map(function (field) {
      var value = Core.getValueAtPath(data.requestValue, field.sourcePath || field.path);
      if (value === undefined) value = field.example;
      return { name: field.path.replace(/\[\]/g, ""), value: Core.exampleText(value) };
    });
  }

  function requestBodyValue(data) {
    var url = Core.analyzeUrl(data.url);
    return filterBodyValue(
      data.requestValue,
      "",
      data.requestFields || [],
      fieldMap(data.requestFields || []),
      data.method,
      url.pathParams
    );
  }

  function shellQuote(value) {
    return "'" + String(value).replace(/'/g, "'\\''") + "'";
  }

  function appendQuery(url, entries) {
    if (!entries.length) return url;
    var query = entries.map(function (entry) {
      return encodeURIComponent(entry.name) + "=" + encodeURIComponent(entry.value);
    }).join("&");
    return url + (url.indexOf("?") === -1 ? "?" : "&") + query;
  }

  function generateCurl(data) {
    var headers = Core.sanitizeHeaders(data.headers || {});
    var queries = queryEntries(data);
    var isMultipart = data.contentType === "multipart/form-data";
    var lines = ["curl --request " + data.method + " \\", "  --url " + shellQuote(appendQuery(data.url, queries))];
    if (!isMultipart && !Object.keys(headers).some(function (name) { return /^content-type$/i.test(name); })) {
      headers["Content-Type"] = data.contentType;
    }
    Object.keys(headers).forEach(function (name) {
      if (isMultipart && /^content-type$/i.test(name)) return;
      lines.push("  --header " + shellQuote(name + ": " + headers[name]));
    });
    var body = bodyEntries(data);
    var bodyValue = requestBodyValue(data);
    var hasBody = bodyValue !== SKIP;
    if (hasBody) {
      if (data.contentType === "application/json") {
        lines.push("  --data-raw " + shellQuote(Core.stringifyLossless(bodyValue, 2)));
      } else if (data.contentType === "multipart/form-data") {
        body.forEach(function (entry) { lines.push("  --form " + shellQuote(entry.name + "=" + entry.value)); });
      } else {
        body.forEach(function (entry) { lines.push("  --data-urlencode " + shellQuote(entry.name + "=" + entry.value)); });
      }
    }
    var command = lines.map(function (line, index) {
      return index < lines.length - 1 && !/\\$/.test(line) ? line + " \\" : line;
    }).join("\n");
    return isMultipart ? "# --form 会自动设置 Content-Type: multipart/form-data 和 boundary\n" + command : command;
  }

  function csharpString(value) {
    return '"' + String(value)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n") + '"';
  }

  function generateCSharp(data) {
    var headers = Core.sanitizeHeaders(data.headers || {});
    var queries = queryEntries(data);
    var body = bodyEntries(data);
    var bodyValue = requestBodyValue(data);
    var hasBody = bodyValue !== SKIP;
    var lines = [
      "using System;",
      "using System.Net.Http;",
      "using System.Text;",
      "using System.Collections.Generic;",
      "using System.Linq;",
      "",
      "using var client = new HttpClient();",
      "var url = " + csharpString(data.url) + ";"
    ];
    if (queries.length) {
      lines.push("var query = new Dictionary<string, string?>", "{");
      queries.forEach(function (entry) { lines.push("    [" + csharpString(entry.name) + "] = " + csharpString(entry.value) + ","); });
      lines.push("};", "var queryString = string.Join(\"&\", query.Select(item =>", "    $\"{Uri.EscapeDataString(item.Key)}={Uri.EscapeDataString(item.Value ?? string.Empty)}\"));", "url += (url.Contains('?') ? \"&\" : \"?\") + queryString;");
    }
    lines.push("", "using var request = new HttpRequestMessage(new HttpMethod(" + csharpString(data.method) + "), url);");
    Object.keys(headers).forEach(function (name) {
      if (!/^content-type$/i.test(name)) lines.push("request.Headers.TryAddWithoutValidation(" + csharpString(name) + ", " + csharpString(headers[name]) + ");");
    });
    if (hasBody) {
      if (data.contentType === "application/json") {
        lines.push("var requestBody = " + csharpString(Core.stringifyLossless(bodyValue, 2)) + ";", "request.Content = new StringContent(requestBody, Encoding.UTF8, \"application/json\");");
      } else if (data.contentType === "application/x-www-form-urlencoded") {
        lines.push("request.Content = new FormUrlEncodedContent(new Dictionary<string, string>", "{");
        body.forEach(function (entry) { lines.push("    [" + csharpString(entry.name) + "] = " + csharpString(entry.value) + ","); });
        lines.push("});");
      } else {
        lines.push("var form = new MultipartFormDataContent();");
        body.forEach(function (entry) { lines.push("form.Add(new StringContent(" + csharpString(entry.value) + "), " + csharpString(entry.name) + ");"); });
        lines.push("request.Content = form;");
      }
    }
    lines.push(
      "",
      "try",
      "{",
      "    using var response = await client.SendAsync(request);",
      "    var responseBody = await response.Content.ReadAsStringAsync();",
      "    response.EnsureSuccessStatusCode();",
      "    Console.WriteLine(responseBody);",
      "}",
      "catch (HttpRequestException ex)",
      "{",
      "    Console.Error.WriteLine($\"请求失败：{ex.Message}\");",
      "}"
    );
    return lines.join("\n");
  }

  function jsString(value) {
    return JSON.stringify(String(value));
  }

  function jsTemplate(value) {
    return "`" + String(value).replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${") + "`";
  }

  function generateJavaScript(data) {
    var headers = Core.sanitizeHeaders(data.headers || {});
    var isMultipart = data.contentType === "multipart/form-data";
    if (!isMultipart && !Object.keys(headers).some(function (name) { return /^content-type$/i.test(name); })) headers["Content-Type"] = data.contentType;
    if (isMultipart) {
      Object.keys(headers).forEach(function (name) { if (/^content-type$/i.test(name)) delete headers[name]; });
    }
    var queries = queryEntries(data);
    var body = bodyEntries(data);
    var bodyValue = requestBodyValue(data);
    var hasBody = bodyValue !== SKIP;
    var lines = ["import axios from \"axios\";", "", "async function callApi() {", "  try {"];
    if (hasBody && data.contentType === "application/x-www-form-urlencoded") {
      lines.push("    const form = new URLSearchParams();");
      body.forEach(function (entry) { lines.push("    form.append(" + jsString(entry.name) + ", " + jsString(entry.value) + ");"); });
    } else if (hasBody && data.contentType === "multipart/form-data") {
      lines.push("    const form = new FormData();", "    // 浏览器会自动生成 multipart/form-data 的 boundary。");
      body.forEach(function (entry) { lines.push("    form.append(" + jsString(entry.name) + ", " + jsString(entry.value) + ");"); });
    }
    lines.push("    const response = await axios({", "      method: " + jsString(data.method.toLowerCase()) + ",", "      url: " + jsString(data.url) + ",", "      headers: {");
    Object.keys(headers).forEach(function (name) { lines.push("        " + jsString(name) + ": " + jsString(headers[name]) + ","); });
    lines.push("      },");
    if (queries.length) {
      lines.push("      params: {");
      queries.forEach(function (entry) { lines.push("        " + jsString(entry.name) + ": " + jsString(entry.value) + ","); });
      lines.push("      },");
    }
    if (hasBody) {
      if (data.contentType === "application/json") lines.push("      data: " + jsTemplate(Core.stringifyLossless(bodyValue, 2)) + ",");
      else lines.push("      data: form,");
    }
    lines.push(
      "    });",
      "",
      "    console.log(response.status, response.data);",
      "  } catch (error) {",
      "    if (axios.isAxiosError(error)) {",
      "      console.error(\"请求失败\", error.response?.status, error.response?.data || error.message);",
      "    } else {",
      "      console.error(\"未知错误\", error);",
      "    }",
      "  }",
      "}",
      "",
      "callApi();"
    );
    return lines.join("\n");
  }

  function javaString(value) {
    return '"' + String(value)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n") + '"';
  }

  function generateJava(data) {
    var headers = Core.sanitizeHeaders(data.headers || {});
    var queries = queryEntries(data);
    var body = bodyEntries(data);
    var bodyValue = requestBodyValue(data);
    var hasBody = bodyValue !== SKIP;
    var lines = [
      "import java.net.URI;",
      "import java.net.URLEncoder;",
      "import java.net.http.HttpClient;",
      "import java.net.http.HttpRequest;",
      "import java.net.http.HttpResponse;",
      "import java.nio.charset.StandardCharsets;",
      "",
      "public class ApiRequestExample {",
      "    public static void main(String[] args) {",
      "        var client = HttpClient.newHttpClient();",
      "        var url = " + javaString(data.url) + ";"
    ];
    if (queries.length) {
      var queryExpression = queries.map(function (entry) {
        return "encode(" + javaString(entry.name) + ") + \"=\" + encode(" + javaString(entry.value) + ")";
      }).join(" + \"&\" + ");
      lines.push("        var query = " + queryExpression + ";", "        url += (url.contains(\"?\") ? \"&\" : \"?\") + query;");
    }
    var javaBodyExpression = "";
    var javaContentType = data.contentType;
    if (hasBody) {
      if (data.contentType === "application/json") {
        lines.push("        var requestBody = " + javaString(Core.stringifyLossless(bodyValue, 2)) + ";");
      } else if (data.contentType === "application/x-www-form-urlencoded") {
        var formBody = body.map(function (entry) { return encodeURIComponent(entry.name) + "=" + encodeURIComponent(entry.value); }).join("&");
        lines.push("        var requestBody = " + javaString(formBody) + ";");
      } else {
        var boundary = "----ApiDocBoundary7MA4YWxkTrZu0gW";
        var multipartBody = body.map(function (entry) {
          return "--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + entry.name.replace(/"/g, "\\\"") + "\"\r\n\r\n" + entry.value + "\r\n";
        }).join("") + "--" + boundary + "--\r\n";
        lines.push("        var boundary = " + javaString(boundary) + ";", "        var requestBody = " + javaString(multipartBody) + ";");
        javaContentType = "multipart/form-data; boundary=" + boundary;
      }
      javaBodyExpression = "requestBody";
    }

    lines.push("", "        var builder = HttpRequest.newBuilder(URI.create(url))");
    Object.keys(headers).forEach(function (name) {
      if (!/^content-type$/i.test(name)) lines.push("            .header(" + javaString(name) + ", " + javaString(headers[name]) + ")");
    });
    if (hasBody) {
      lines.push(
        "            .header(\"Content-Type\", " + javaString(javaContentType) + ")",
        "            .method(" + javaString(data.method) + ", HttpRequest.BodyPublishers.ofString(" + javaBodyExpression + "))",
        "            .build();"
      );
    } else {
      lines.push("            .method(" + javaString(data.method) + ", HttpRequest.BodyPublishers.noBody())", "            .build();");
    }
    lines.push(
      "",
      "        try {",
      "            var response = client.send(builder, HttpResponse.BodyHandlers.ofString());",
      "            if (response.statusCode() >= 400) {",
      "                throw new IllegalStateException(\"HTTP \" + response.statusCode() + \": \" + response.body());",
      "            }",
      "            System.out.println(response.body());",
      "        } catch (InterruptedException ex) {",
      "            Thread.currentThread().interrupt();",
      "            System.err.println(\"请求被中断：\" + ex.getMessage());",
      "        } catch (Exception ex) {",
      "            System.err.println(\"请求失败：\" + ex.getMessage());",
      "        }",
      "    }"
    );
    if (queries.length) {
      lines.push("", "    private static String encode(String value) {", "        return URLEncoder.encode(value, StandardCharsets.UTF_8);", "    }");
    }
    lines.push("}");
    return lines.join("\n");
  }

  function generateMarkdown(data, codes) {
    var headers = Core.sanitizeHeaders(data.headers || {});
    var errorRows = parseErrorCodes(data.errorCodes, data.statusCode);
    var responseSection = hasResponseBody(data) ? [
      "## 返回参数",
      "",
      markdownTable(data.responseFields),
      "",
      "## 返回 JSON 示例",
      "",
      "```json",
      Core.stringifyLossless(data.responseValue, 2),
      "```",
      ""
    ] : [
      "## 返回结果",
      "",
      "该接口成功时不返回响应体。",
      ""
    ];
    var lines = [
      "# " + data.name,
      "",
      data.description || "暂无接口描述。",
      "",
      "## 接口信息",
      "",
      "| 项目 | 内容 |",
      "|---|---|",
      "| 请求地址 | `" + String(data.url).replace(/`/g, "\\`") + "` |",
      "| 请求方式 | `" + data.method + "` |",
      "| Content-Type | `" + data.contentType + "` |",
      "| 返回状态码 | `" + data.statusCode + "` |",
      "",
      "## 请求头",
      "",
      "```json",
      Core.stringifyLossless(headers, 2),
      "```",
      "",
      "## 请求参数",
      "",
      markdownTable(data.requestFields),
      "",
      "## 请求 JSON 示例",
      "",
      "```json",
      Core.stringifyLossless(data.requestValue, 2),
      "```",
      ""
    ].concat(responseSection).concat([
      "## 错误码说明",
      "",
      "| 状态码 | 说明 |",
      "|---|---|"
    ]);
    errorRows.forEach(function (row) { lines.push("| " + markdownCell(row.code) + " | " + markdownCell(row.description) + " |"); });
    [
      ["curl 示例", "bash", codes.curl],
      ["C# HttpClient 示例", "csharp", codes.csharp],
      ["JavaScript Axios 示例", "javascript", codes.javascript],
      ["Java HttpClient 示例", "java", codes.java]
    ].forEach(function (section) {
      lines.push("", "## " + section[0], "", "```" + section[1], section[2], "```");
    });
    return lines.join("\n") + "\n";
  }

  function htmlTable(fields) {
    var html = "<div class=\"adg-preview-table-wrap\"><table><thead><tr><th>字段</th><th>类型</th><th>必填</th><th>说明</th><th>示例</th><th>枚举值</th></tr></thead><tbody>";
    if (!fields || !fields.length) html += "<tr><td colspan=\"6\">—</td></tr>";
    (fields || []).forEach(function (field) {
      html += "<tr>" + [
        field.path,
        Core.displayType(field),
        field.required ? "是" : "否",
        field.description || "—",
        field.example || "—",
        field.enumValue || "—"
      ].map(function (value) { return "<td>" + Core.escapeHtml(value) + "</td>"; }).join("") + "</tr>";
    });
    return html + "</tbody></table></div>";
  }

  function codeHtml(language, code) {
    return "<div class=\"adg-preview-code\"><span>" + Core.escapeHtml(language) + "</span><pre>" + Core.escapeHtml(code) + "</pre></div>";
  }

  function generatePreviewHtml(data, codes) {
    var errorRows = parseErrorCodes(data.errorCodes, data.statusCode);
    var errorHtml = "<div class=\"adg-preview-table-wrap\"><table><thead><tr><th>状态码</th><th>说明</th></tr></thead><tbody>";
    errorRows.forEach(function (row) { errorHtml += "<tr><td>" + Core.escapeHtml(row.code) + "</td><td>" + Core.escapeHtml(row.description) + "</td></tr>"; });
    errorHtml += "</tbody></table></div>";
    var responseHtml = hasResponseBody(data) ? [
      "<h2>返回参数</h2>", htmlTable(data.responseFields),
      "<h2>返回 JSON 示例</h2>", codeHtml("JSON", Core.stringifyLossless(data.responseValue, 2))
    ] : [
      "<h2>返回结果</h2>", "<p class=\"adg-document-desc\">该接口成功时不返回响应体。</p>"
    ];
    return [
      "<article class=\"adg-document\">",
      "<h1>" + Core.escapeHtml(data.name) + "</h1>",
      "<p class=\"adg-document-desc\">" + Core.escapeHtml(data.description || "暂无接口描述。").replace(/\n/g, "<br>") + "</p>",
      "<h2>接口信息</h2>",
      "<dl class=\"adg-document-meta\"><div><dt>请求地址</dt><dd><code>" + Core.escapeHtml(data.url) + "</code></dd></div><div><dt>请求方式</dt><dd><strong>" + Core.escapeHtml(data.method) + "</strong></dd></div><div><dt>Content-Type</dt><dd><code>" + Core.escapeHtml(data.contentType) + "</code></dd></div><div><dt>返回状态码</dt><dd>" + Core.escapeHtml(data.statusCode) + "</dd></div></dl>",
      "<h2>请求头</h2>", codeHtml("JSON", Core.stringifyLossless(Core.sanitizeHeaders(data.headers || {}), 2)),
      "<h2>请求参数</h2>", htmlTable(data.requestFields),
      "<h2>请求 JSON 示例</h2>", codeHtml("JSON", Core.stringifyLossless(data.requestValue, 2)),
      responseHtml.join(""),
      "<h2>错误码说明</h2>", errorHtml,
      "<h2>curl 示例</h2>", codeHtml("bash", codes.curl),
      "<h2>C# HttpClient 示例</h2>", codeHtml("C#", codes.csharp),
      "<h2>JavaScript Axios 示例</h2>", codeHtml("JavaScript", codes.javascript),
      "<h2>Java HttpClient 示例</h2>", codeHtml("Java", codes.java),
      "</article>"
    ].join("");
  }

  function buildDocument(data) {
    var codes = {
      curl: generateCurl(data),
      csharp: generateCSharp(data),
      javascript: generateJavaScript(data),
      java: generateJava(data)
    };
    var openApi = buildOpenApi(data);
    var validationErrors = validateOpenApi(openApi);
    return {
      codes: codes,
      markdown: generateMarkdown(data, codes),
      openApi: openApi,
      openApiJson: Core.stringifyLossless(openApi, 2),
      validationErrors: validationErrors,
      previewHtml: generatePreviewHtml(data, codes),
      errorRows: parseErrorCodes(data.errorCodes, data.statusCode)
    };
  }

  return {
    markdownCell: markdownCell,
    markdownTable: markdownTable,
    parseErrorCodes: parseErrorCodes,
    schemaForValue: schemaForValue,
    buildOpenApi: buildOpenApi,
    validateOpenApi: validateOpenApi,
    generateCurl: generateCurl,
    generateCSharp: generateCSharp,
    generateJavaScript: generateJavaScript,
    generateJava: generateJava,
    generateMarkdown: generateMarkdown,
    generatePreviewHtml: generatePreviewHtml,
    buildDocument: buildDocument
  };
});
