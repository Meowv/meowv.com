(function (root, factory) {
  root.ApiDocExporters = factory(root.ApiDocCore);
})(typeof window !== "undefined" ? window : globalThis, function (Core) {
  "use strict";

  if (!Core) throw new Error("ApiDocCore 未加载");

  var encoder = new TextEncoder();

  function concatBytes(chunks) {
    var length = chunks.reduce(function (total, chunk) { return total + chunk.length; }, 0);
    var output = new Uint8Array(length);
    var offset = 0;
    chunks.forEach(function (chunk) {
      output.set(chunk, offset);
      offset += chunk.length;
    });
    return output;
  }

  function littleEndian16(value) {
    return new Uint8Array([value & 255, (value >>> 8) & 255]);
  }

  function littleEndian32(value) {
    return new Uint8Array([value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]);
  }

  var crcTable = (function () {
    var table = [];
    for (var i = 0; i < 256; i++) {
      var value = i;
      for (var j = 0; j < 8; j++) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
      table[i] = value >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    var crc = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function dosDateTime(date) {
    var year = Math.max(1980, date.getFullYear());
    return {
      date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
      time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
    };
  }

  function zipStore(entries) {
    var localChunks = [];
    var centralChunks = [];
    var localOffset = 0;
    var timestamp = dosDateTime(new Date());

    entries.forEach(function (entry) {
      var name = encoder.encode(entry.name);
      var data = entry.data instanceof Uint8Array ? entry.data : encoder.encode(String(entry.data));
      var checksum = crc32(data);
      var localHeader = concatBytes([
        littleEndian32(0x04034b50), littleEndian16(20), littleEndian16(0x0800), littleEndian16(0),
        littleEndian16(timestamp.time), littleEndian16(timestamp.date), littleEndian32(checksum),
        littleEndian32(data.length), littleEndian32(data.length), littleEndian16(name.length), littleEndian16(0), name
      ]);
      localChunks.push(localHeader, data);

      var centralHeader = concatBytes([
        littleEndian32(0x02014b50), littleEndian16(20), littleEndian16(20), littleEndian16(0x0800), littleEndian16(0),
        littleEndian16(timestamp.time), littleEndian16(timestamp.date), littleEndian32(checksum),
        littleEndian32(data.length), littleEndian32(data.length), littleEndian16(name.length), littleEndian16(0),
        littleEndian16(0), littleEndian16(0), littleEndian16(0), littleEndian32(0), littleEndian32(localOffset), name
      ]);
      centralChunks.push(centralHeader);
      localOffset += localHeader.length + data.length;
    });

    var central = concatBytes(centralChunks);
    var end = concatBytes([
      littleEndian32(0x06054b50), littleEndian16(0), littleEndian16(0),
      littleEndian16(entries.length), littleEndian16(entries.length),
      littleEndian32(central.length), littleEndian32(localOffset), littleEndian16(0)
    ]);
    return concatBytes(localChunks.concat([central, end]));
  }

  function xmlEscape(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function wordRun(text, options) {
    var settings = options || {};
    var properties = [
      '<w:rFonts w:ascii="Arial Unicode MS" w:hAnsi="Arial Unicode MS" w:eastAsia="Arial Unicode MS"/>'
    ];
    if (settings.bold) properties.push("<w:b/>");
    if (settings.color) properties.push('<w:color w:val="' + settings.color + '"/>');
    if (settings.size) properties.push('<w:sz w:val="' + settings.size + '"/><w:szCs w:val="' + settings.size + '"/>');
    return "<w:r><w:rPr>" + properties.join("") + "</w:rPr><w:t xml:space=\"preserve\">" + xmlEscape(text) + "</w:t></w:r>";
  }

  function wordParagraph(text, style, options) {
    var settings = options || {};
    var paragraphProps = [];
    if (style) paragraphProps.push('<w:pStyle w:val="' + style + '"/>');
    if (settings.keepNext) paragraphProps.push("<w:keepNext/>");
    if (settings.pageBreakBefore) paragraphProps.push("<w:pageBreakBefore/>");
    if (settings.shading) paragraphProps.push('<w:shd w:val="clear" w:color="auto" w:fill="' + settings.shading + '"/>');
    if (settings.spacingAfter !== undefined) paragraphProps.push('<w:spacing w:after="' + settings.spacingAfter + '"/>');
    return "<w:p><w:pPr>" + paragraphProps.join("") + "</w:pPr>" + wordRun(text, settings) + "</w:p>";
  }

  function wordCodeBlock(code) {
    return String(code || "").replace(/\r\n?/g, "\n").split("\n").map(function (line) {
      return wordParagraph(line || " ", "Code", { shading: "F5F7F3", size: 18, spacingAfter: 0 });
    }).join("");
  }

  function wordCell(value, header, width) {
    return '<w:tc><w:tcPr><w:tcW w:w="' + width + '" w:type="dxa"/><w:tcMar><w:top w:w="80" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tcMar>' +
      (header ? '<w:shd w:val="clear" w:fill="EAF4DF"/>' : "") +
      "</w:tcPr>" + wordParagraph(value === undefined || value === null || value === "" ? "—" : value, "", { bold: header, size: 18, spacingAfter: 0 }) + "</w:tc>";
  }

  function wordTable(headers, rows, widths) {
    var grid = widths.map(function (width) { return '<w:gridCol w:w="' + width + '"/>'; }).join("");
    var border = '<w:tblBorders><w:top w:val="single" w:sz="4" w:color="D9E3D0"/><w:left w:val="single" w:sz="4" w:color="D9E3D0"/><w:bottom w:val="single" w:sz="4" w:color="D9E3D0"/><w:right w:val="single" w:sz="4" w:color="D9E3D0"/><w:insideH w:val="single" w:sz="4" w:color="D9E3D0"/><w:insideV w:val="single" w:sz="4" w:color="D9E3D0"/></w:tblBorders>';
    var xml = '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblLayout w:type="fixed"/>' + border + '</w:tblPr><w:tblGrid>' + grid + "</w:tblGrid>";
    xml += "<w:tr>" + headers.map(function (header, index) { return wordCell(header, true, widths[index]); }).join("") + "</w:tr>";
    (rows.length ? rows : [headers.map(function () { return "—"; })]).forEach(function (row) {
      xml += "<w:tr>" + row.map(function (cell, index) { return wordCell(cell, false, widths[index]); }).join("") + "</w:tr>";
    });
    return xml + "</w:tbl>";
  }

  function fieldRows(fields) {
    return (fields || []).map(function (field) {
      return [
        field.path,
        Core.displayType(field),
        field.required ? "是" : "否",
        field.description || "—",
        field.example || "—",
        field.enumValue || "—"
      ];
    });
  }

  function hasResponseBody(data) {
    return data.responseHasBody !== false;
  }

  function buildWordDocumentXml(data, outputs) {
    var body = [];
    body.push(wordParagraph(data.name, "Title", { bold: true, color: "365F00", size: 38 }));
    body.push(wordParagraph(data.description || "暂无接口描述。", "Normal", { size: 21 }));
    body.push(wordParagraph("接口信息", "Heading1", { keepNext: true }));
    body.push(wordTable(["项目", "内容"], [
      ["请求地址", data.url],
      ["请求方式", data.method],
      ["Content-Type", data.contentType],
      ["返回状态码", String(data.statusCode)]
    ], [2200, 7000]));
    body.push(wordParagraph("请求头", "Heading1", { keepNext: true }));
    body.push(wordCodeBlock(Core.stringifyLossless(Core.sanitizeHeaders(data.headers || {}), 2)));
    body.push(wordParagraph("请求参数", "Heading1", { keepNext: true }));
    body.push(wordTable(["字段", "类型", "必填", "说明", "示例", "枚举值"], fieldRows(data.requestFields), [1900, 1450, 800, 2300, 1850, 1500]));
    body.push(wordParagraph("请求 JSON 示例", "Heading1", { keepNext: true }));
    body.push(wordCodeBlock(Core.stringifyLossless(data.requestValue, 2)));
    if (hasResponseBody(data)) {
      body.push(wordParagraph("返回参数", "Heading1", { keepNext: true }));
      body.push(wordTable(["字段", "类型", "必填", "说明", "示例", "枚举值"], fieldRows(data.responseFields), [1900, 1450, 800, 2300, 1850, 1500]));
      body.push(wordParagraph("返回 JSON 示例", "Heading1", { keepNext: true }));
      body.push(wordCodeBlock(Core.stringifyLossless(data.responseValue, 2)));
    } else {
      body.push(wordParagraph("返回结果", "Heading1", { keepNext: true }));
      body.push(wordParagraph("该接口成功时不返回响应体。", "Normal", { size: 21 }));
    }
    body.push(wordParagraph("错误码说明", "Heading1", { keepNext: true }));
    body.push(wordTable(["状态码", "说明"], outputs.errorRows.map(function (row) { return [row.code, row.description]; }), [1800, 7400]));
    [
      ["curl 示例", outputs.codes.curl],
      ["C# HttpClient 示例", outputs.codes.csharp],
      ["JavaScript Axios 示例", outputs.codes.javascript],
      ["JavaScript Fetch 示例", outputs.codes.fetch],
      ["Java HttpClient 示例", outputs.codes.java]
    ].forEach(function (section) {
      body.push(wordParagraph(section[0], "Heading1", { keepNext: true, pageBreakBefore: true }));
      body.push(wordCodeBlock(section[1]));
    });
    body.push('<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="850" w:header="708" w:footer="708" w:gutter="0"/><w:cols w:space="708"/><w:docGrid w:linePitch="312"/></w:sectPr>');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + body.join("") + "</w:body></w:document>";
  }

  function createDocxBytes(data, outputs) {
    var now = new Date().toISOString();
    var contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>';
    var rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>';
    var documentRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
    var styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial Unicode MS" w:hAnsi="Arial Unicode MS" w:eastAsia="Arial Unicode MS"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:after="120" w:line="300" w:lineRule="auto"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:pPr><w:spacing w:after="280"/><w:jc w:val="left"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="360" w:after="160"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="4B7E00"/><w:sz w:val="30"/><w:szCs w:val="30"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="120" w:right="120"/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:wordWrap/></w:pPr><w:rPr><w:rFonts w:ascii="Arial Unicode MS" w:hAnsi="Arial Unicode MS" w:eastAsia="Arial Unicode MS"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style></w:styles>';
    var core = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>' + xmlEscape(data.name) + '</dc:title><dc:creator>meowv.com API 文档生成器</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">' + now + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + now + "</dcterms:modified></cp:coreProperties>";
    var app = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>meowv.com API 文档生成器</Application></Properties>';
    return zipStore([
      { name: "[Content_Types].xml", data: contentTypes },
      { name: "_rels/.rels", data: rels },
      { name: "word/document.xml", data: buildWordDocumentXml(data, outputs) },
      { name: "word/styles.xml", data: styles },
      { name: "word/_rels/document.xml.rels", data: documentRels },
      { name: "docProps/core.xml", data: core },
      { name: "docProps/app.xml", data: app }
    ]);
  }

  function shorten(value, limit) {
    var text = String(value === undefined || value === null || value === "" ? "—" : value);
    return text.length > limit ? text.slice(0, limit - 1) + "…" : text;
  }

  function buildPdfBlocks(data, outputs) {
    var metaRows = [
      ["请求地址", data.url], ["请求方式", data.method], ["Content-Type", data.contentType], ["返回状态码", String(data.statusCode)]
    ];
    var blocks = [
      { type: "title", text: data.name },
      { type: "paragraph", text: data.description || "暂无接口描述。" },
      { type: "heading", text: "接口信息" },
      { type: "table", headers: ["项目", "内容"], rows: metaRows, widths: [0.22, 0.78] },
      { type: "heading", text: "请求头" },
      { type: "code", label: "JSON", text: Core.stringifyLossless(Core.sanitizeHeaders(data.headers || {}), 2) },
      { type: "heading", text: "请求参数" },
      { type: "table", headers: ["字段", "类型", "必填", "说明", "示例", "枚举值"], rows: fieldRows(data.requestFields).map(function (row) { return row.map(function (cell) { return shorten(cell, 220); }); }), widths: [0.18, 0.14, 0.08, 0.25, 0.20, 0.15] },
      { type: "heading", text: "请求 JSON 示例" },
      { type: "code", label: "JSON", text: Core.stringifyLossless(data.requestValue, 2) }
    ];
    if (hasResponseBody(data)) {
      blocks.push(
        { type: "heading", text: "返回参数" },
        { type: "table", headers: ["字段", "类型", "必填", "说明", "示例", "枚举值"], rows: fieldRows(data.responseFields).map(function (row) { return row.map(function (cell) { return shorten(cell, 220); }); }), widths: [0.18, 0.14, 0.08, 0.25, 0.20, 0.15] },
        { type: "heading", text: "返回 JSON 示例" },
        { type: "code", label: "JSON", text: Core.stringifyLossless(data.responseValue, 2) }
      );
    } else {
      blocks.push({ type: "heading", text: "返回结果" }, { type: "paragraph", text: "该接口成功时不返回响应体。" });
    }
    blocks.push(
      { type: "heading", text: "错误码说明" },
      { type: "table", headers: ["状态码", "说明"], rows: outputs.errorRows.map(function (row) { return [row.code, row.description]; }), widths: [0.18, 0.82] }
    );
    [
      ["curl 示例", "bash", outputs.codes.curl],
      ["C# HttpClient 示例", "C#", outputs.codes.csharp],
      ["JavaScript Axios 示例", "JavaScript", outputs.codes.javascript],
      ["JavaScript Fetch 示例", "JavaScript", outputs.codes.fetch],
      ["Java HttpClient 示例", "Java", outputs.codes.java]
    ].forEach(function (section) {
      blocks.push({ type: "pageBreak" }, { type: "heading", text: section[0] }, { type: "code", label: section[1], text: section[2] });
    });
    return blocks;
  }

  function renderPdfPages(data, outputs) {
    var PAGE_WIDTH = 1240;
    var PAGE_HEIGHT = 1754;
    var MARGIN = 86;
    var CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
    var pages = [];
    var canvas;
    var context;
    var y;

    function newPage() {
      if (canvas) {
        var base64 = canvas.toDataURL("image/jpeg", 0.92).split(",")[1];
        var binary = atob(base64);
        var bytes = new Uint8Array(binary.length);
        for (var index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
        pages.push({ width: PAGE_WIDTH, height: PAGE_HEIGHT, data: bytes });
      }
      canvas = document.createElement("canvas");
      canvas.width = PAGE_WIDTH;
      canvas.height = PAGE_HEIGHT;
      context = canvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
      context.textBaseline = "top";
      y = MARGIN;
    }

    function ensure(height) {
      if (y + height > PAGE_HEIGHT - MARGIN) newPage();
    }

    function setFont(size, weight, monospace) {
      context.font = (weight || "400") + " " + size + "px " + (monospace ? '"SFMono-Regular", Consolas, "PingFang SC", "Arial Unicode MS", STHeiti, monospace' : '"PingFang SC", "Arial Unicode MS", STHeiti, Arial, sans-serif');
    }

    function wrapLine(text, maxWidth) {
      var lines = [];
      var current = "";
      Array.from(String(text)).forEach(function (char) {
        if (context.measureText(current + char).width > maxWidth && current) {
          lines.push(current);
          current = char;
        } else {
          current += char;
        }
      });
      lines.push(current || " ");
      return lines;
    }

    function wrapText(text, maxWidth) {
      var lines = [];
      String(text === undefined || text === null ? "" : text).replace(/\r\n?/g, "\n").split("\n").forEach(function (line) {
        lines = lines.concat(wrapLine(line, maxWidth));
      });
      return lines;
    }

    function drawText(text, size, lineHeight, color, weight, monospace) {
      setFont(size, weight, monospace);
      var lines = wrapText(text, CONTENT_WIDTH);
      ensure(lines.length * lineHeight + 10);
      context.fillStyle = color;
      lines.forEach(function (line) {
        context.fillText(line, MARGIN, y);
        y += lineHeight;
      });
      y += 10;
    }

    function drawTable(block) {
      var widths = block.widths.map(function (ratio) { return CONTENT_WIDTH * ratio; });
      var fontSize = 18;
      var lineHeight = 27;
      var padding = 12;

      function prepareRow(row, header) {
        setFont(fontSize, header ? "700" : "400", false);
        var cells = row.map(function (cell, index) {
          var lines = wrapText(shorten(cell, 320), widths[index] - padding * 2);
          return lines.length > 11 ? lines.slice(0, 10).concat(["…"]) : lines;
        });
        var maxLines = Math.max.apply(null, cells.map(function (lines) { return lines.length; }));
        return { cells: cells, height: Math.max(52, maxLines * lineHeight + padding * 2) };
      }

      function paintRow(row, header) {
        var prepared = prepareRow(row, header);
        if (y + prepared.height > PAGE_HEIGHT - MARGIN) {
          newPage();
          if (!header) paintRow(block.headers, true);
        }
        var x = MARGIN;
        prepared.cells.forEach(function (lines, index) {
          context.fillStyle = header ? "#eaf4df" : "#ffffff";
          context.fillRect(x, y, widths[index], prepared.height);
          context.strokeStyle = "#cfdcc4";
          context.lineWidth = 1;
          context.strokeRect(x, y, widths[index], prepared.height);
          setFont(fontSize, header ? "700" : "400", false);
          context.fillStyle = header ? "#3d6500" : "#34402d";
          lines.forEach(function (line, lineIndex) {
            context.fillText(line, x + padding, y + padding + lineIndex * lineHeight);
          });
          x += widths[index];
        });
        y += prepared.height;
      }

      ensure(60);
      paintRow(block.headers, true);
      (block.rows.length ? block.rows : [block.headers.map(function () { return "—"; })]).forEach(function (row) { paintRow(row, false); });
      y += 24;
    }

    function drawCode(block) {
      var fontSize = 17;
      var lineHeight = 25;
      var padding = 18;
      setFont(fontSize, "400", true);
      var lines = wrapText(block.text, CONTENT_WIDTH - padding * 2);
      ensure(54);
      context.fillStyle = "#eaf4df";
      context.fillRect(MARGIN, y, CONTENT_WIDTH, 38);
      context.fillStyle = "#4b7e00";
      setFont(16, "700", false);
      context.fillText(block.label, MARGIN + padding, y + 9);
      y += 38;
      lines.forEach(function (line) {
        if (y + lineHeight + padding > PAGE_HEIGHT - MARGIN) newPage();
        context.fillStyle = "#f5f7f3";
        context.fillRect(MARGIN, y, CONTENT_WIDTH, lineHeight + 2);
        context.fillStyle = "#263322";
        setFont(fontSize, "400", true);
        context.fillText(line, MARGIN + padding, y + 2);
        y += lineHeight + 2;
      });
      context.fillStyle = "#f5f7f3";
      context.fillRect(MARGIN, y, CONTENT_WIDTH, padding);
      y += padding + 24;
    }

    newPage();
    buildPdfBlocks(data, outputs).forEach(function (block) {
      if (block.type === "pageBreak") {
        if (y > MARGIN + 20) newPage();
      } else if (block.type === "title") {
        drawText(block.text, 46, 62, "#365f00", "700", false);
      } else if (block.type === "heading") {
        y += 12;
        drawText(block.text, 31, 42, "#4b7e00", "700", false);
      } else if (block.type === "paragraph") {
        drawText(block.text, 22, 34, "#4a5545", "400", false);
      } else if (block.type === "table") {
        drawTable(block);
      } else if (block.type === "code") {
        drawCode(block);
      }
    });
    newPage();
    return pages;
  }

  function createPdfBytesFromJpegs(images) {
    var objectCount = 2 + images.length * 3;
    var objects = new Array(objectCount + 1);
    var kids = [];
    images.forEach(function (_, index) { kids.push((3 + index * 3) + " 0 R"); });
    objects[1] = encoder.encode("<< /Type /Catalog /Pages 2 0 R >>");
    objects[2] = encoder.encode("<< /Type /Pages /Kids [" + kids.join(" ") + "] /Count " + images.length + " >>");
    images.forEach(function (image, index) {
      var pageId = 3 + index * 3;
      var imageId = pageId + 1;
      var contentId = pageId + 2;
      var imageName = "Im" + (index + 1);
      var content = "q\n595.28 0 0 841.89 0 0 cm\n/" + imageName + " Do\nQ";
      objects[pageId] = encoder.encode("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /" + imageName + " " + imageId + " 0 R >> >> /Contents " + contentId + " 0 R >>");
      objects[imageId] = concatBytes([
        encoder.encode("<< /Type /XObject /Subtype /Image /Width " + image.width + " /Height " + image.height + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + image.data.length + " >>\nstream\n"),
        image.data,
        encoder.encode("\nendstream")
      ]);
      objects[contentId] = encoder.encode("<< /Length " + encoder.encode(content).length + " >>\nstream\n" + content + "\nendstream");
    });

    var chunks = [encoder.encode("%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n")];
    var offsets = [0];
    var offset = chunks[0].length;
    for (var id = 1; id <= objectCount; id++) {
      offsets[id] = offset;
      var objectBytes = concatBytes([encoder.encode(id + " 0 obj\n"), objects[id], encoder.encode("\nendobj\n")]);
      chunks.push(objectBytes);
      offset += objectBytes.length;
    }
    var xrefOffset = offset;
    var xref = "xref\n0 " + (objectCount + 1) + "\n0000000000 65535 f \n";
    for (var index = 1; index <= objectCount; index++) xref += String(offsets[index]).padStart(10, "0") + " 00000 n \n";
    xref += "trailer\n<< /Size " + (objectCount + 1) + " /Root 1 0 R >>\nstartxref\n" + xrefOffset + "\n%%EOF";
    chunks.push(encoder.encode(xref));
    return concatBytes(chunks);
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function downloadText(text, filename, type) {
    downloadBlob(new Blob([text], { type: type + ";charset=utf-8" }), filename);
  }

  function exportMarkdown(data, outputs) {
    downloadText(outputs.markdown, Core.safeFilename(data.name) + ".md", "text/markdown");
  }

  function exportOpenApi(data, outputs) {
    downloadText(outputs.openApiJson, Core.safeFilename(data.name) + "-openapi.json", "application/json");
  }

  function exportDocx(data, outputs) {
    var bytes = createDocxBytes(data, outputs);
    downloadBlob(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), Core.safeFilename(data.name) + ".docx");
  }

  function exportPdf(data, outputs) {
    var images = renderPdfPages(data, outputs);
    var bytes = createPdfBytesFromJpegs(images);
    downloadBlob(new Blob([bytes], { type: "application/pdf" }), Core.safeFilename(data.name) + ".pdf");
  }

  return {
    exportMarkdown: exportMarkdown,
    exportOpenApi: exportOpenApi,
    exportDocx: exportDocx,
    exportPdf: exportPdf,
    createDocxBytes: createDocxBytes,
    createPdfBytesFromJpegs: createPdfBytesFromJpegs,
    renderPdfPages: renderPdfPages,
    zipStore: zipStore
  };
});
