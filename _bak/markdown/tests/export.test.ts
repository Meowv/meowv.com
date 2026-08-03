import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ExportError,
  createDocxExport,
  createHtmlExport,
  createMarkdownExport,
  createPdfExport,
  downloadExport,
  prepareExportHtml,
  renderHtmlDocument,
  sanitizeExportFilename,
} from "../src/services/export";

const pdfMocks = vi.hoisted(() => ({
  addImage: vi.fn(),
  addPage: vi.fn(),
  html2canvas: vi.fn(),
  output: vi.fn(),
  renderedHtml: "",
}));

const mermaidMocks = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(),
}));

vi.mock("html2canvas", () => ({
  default: pdfMocks.html2canvas,
}));

vi.mock("mermaid", () => ({
  default: {
    initialize: mermaidMocks.initialize,
    render: mermaidMocks.render,
  },
}));

vi.mock("jspdf", () => ({
  jsPDF: class {
    readonly internal = {
      pageSize: {
        getHeight: () => 842,
        getWidth: () => 595,
      },
    };

    addImage(...args: unknown[]) {
      pdfMocks.addImage(...args);
    }

    addPage(...args: unknown[]) {
      pdfMocks.addPage(...args);
    }

    output(...args: unknown[]) {
      return pdfMocks.output(...args);
    }
  },
}));

function mermaidPlaceholder(source: string): string {
  return `<div class="mermaid mermaid-placeholder" data-mermaid-source="${encodeURIComponent(source)}"><pre><code class="language-mermaid">${source}</code></pre></div>`;
}

function installRasterMocks() {
  const drawImage = vi.fn();
  const fillRect = vi.fn();
  const getContext = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue({
      drawImage,
      fillRect,
      fillStyle: "",
    } as unknown as CanvasRenderingContext2D);
  const toBlob = vi
    .spyOn(HTMLCanvasElement.prototype, "toBlob")
    .mockImplementation((callback) => {
      callback(new Blob(["png"], { type: "image/png" }));
    });

  class LocalImage {
    decoding = "";
    height = 120;
    naturalHeight = 120;
    naturalWidth = 240;
    onerror: OnErrorEventHandler | null = null;
    onload: (() => void) | null = null;
    width = 240;

    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  }

  vi.stubGlobal("Image", LocalImage);
  return { drawImage, fillRect, getContext, toBlob };
}

describe("export service", () => {
  beforeEach(() => {
    pdfMocks.addImage.mockReset();
    pdfMocks.addPage.mockReset();
    pdfMocks.html2canvas.mockReset();
    pdfMocks.output.mockReset();
    pdfMocks.renderedHtml = "";
    mermaidMocks.initialize.mockReset();
    mermaidMocks.render.mockReset();

    pdfMocks.html2canvas.mockImplementation(async (element: HTMLElement) => {
      pdfMocks.renderedHtml = element.innerHTML;
      return {
        height: 3_000,
        toDataURL: () => "data:image/png;base64,AA==",
        width: 1_000,
      };
    });
    pdfMocks.output.mockImplementation(
      () => new Blob(["pdf"], { type: "application/pdf" }),
    );
    mermaidMocks.render.mockImplementation(async (id: string) => ({
      svg: `<svg id="${id}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 120"><style>#${id} rect { fill: #eef2ff; }</style><rect width="240" height="120"></rect><image href="https://cdn.example.com/tracker.png"></image></svg>`,
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("安全化文件名并替换已有导出扩展名", () => {
    expect(sanitizeExportFilename("CON.md", "pdf")).toBe("_CON.pdf");
    expect(sanitizeExportFilename("../../方案?.markdown", "docx")).toBe(
      "方案.docx",
    );
    expect(sanitizeExportFilename("  EF Core 性能优化.html  ", "md")).toBe(
      "EF Core 性能优化.md",
    );
    expect(sanitizeExportFilename("..\u202e/..\u0000", "html")).toBe(
      "markdown-document.html",
    );
  });

  it("移除可执行 HTML，同时保留可展示的本地与线上图片", () => {
    const result = prepareExportHtml(`
      <script>alert("xss")</script>
      <img src="https://cdn.example.com/remote.png" alt="远程图">
      <img src="data:image/png;base64,AA==" srcset="https://cdn.example.com/a.png 2x" alt="本地图">
      <img src="blob:https://md.meowv.com/local-image" alt="工作区图片">
      <div style="color: red; background-image: url(https://cdn.example.com/bg.png)">正文</div>
      <a href="https://example.com/docs" onclick="alert(1)">文档链接</a>
    `);

    const host = document.createElement("div");
    host.innerHTML = result.html;

    expect(host.querySelector("script")).toBeNull();
    expect(host.querySelector('img[alt="远程图"]')?.getAttribute("src")).toBe(
      "https://cdn.example.com/remote.png",
    );
    expect(host.querySelector('img[alt="本地图"]')?.getAttribute("src")).toBe(
      "data:image/png;base64,AA==",
    );
    expect(
      host.querySelector('img[alt="工作区图片"]')?.getAttribute("src"),
    ).toBe("blob:https://md.meowv.com/local-image");
    expect(host.querySelector("img")?.hasAttribute("srcset")).toBe(false);
    expect(host.querySelector("div")?.getAttribute("style")).not.toContain(
      "https://",
    );
    expect(host.querySelector("a")?.getAttribute("href")).toBe(
      "https://example.com/docs",
    );
    expect(host.querySelector("a")?.getAttribute("onclick")).toBeNull();
    expect(host.querySelector("a")?.getAttribute("rel")).toBe(
      "noreferrer noopener",
    );
    expect(result.warnings).not.toContain(
      "已移除不受支持的图片：https://cdn.example.com/remote.png",
    );
  });

  it("HTML 导出将本地对象 URL 转为 Base64，并保留线上图片地址", async () => {
    class LocalFileReader {
      result: string | null = null;
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;

      readAsDataURL(): void {
        this.result = "data:image/png;base64,AA==";
        this.onload?.();
      }
    }

    vi.stubGlobal("FileReader", LocalFileReader);
    const resolveImageBlob = vi
      .fn()
      .mockResolvedValue(new Blob(["png"], { type: "image/png" }));

    const artifact = await createHtmlExport(
      `
        <img src="blob:https://md.meowv.com/local-image" alt="本地图片">
        <img src="https://cdn.example.com/remote.png" alt="线上图片">
      `,
      { resolveImageBlob },
    );
    const html = await artifact.blob.text();

    expect(resolveImageBlob).toHaveBeenCalledWith(
      "blob:https://md.meowv.com/local-image",
    );
    expect(html).toContain('src="data:image/png;base64,AA=="');
    expect(html).toContain('src="https://cdn.example.com/remote.png"');
    expect(html).toContain("img-src data: https:");
  });

  it("生成带离线 CSP 和内联样式的完整 HTML 文档", async () => {
    const html = await renderHtmlDocument("<h1>离线文档</h1>", {
      language: "zh-CN",
      title: '标题 <"安全">',
    });

    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('connect-src \'none\'');
    expect(html).toContain("<style>");
    expect(html).toContain("<h1>离线文档</h1>");
    expect(html).toContain("<title>标题 &lt;&quot;安全&quot;&gt;</title>");
    expect(html).not.toContain("<script");
  });

  it("不会为已有 article 再包一层重复 article", async () => {
    const html = await renderHtmlDocument(
      "<article><h1>已有正文容器</h1></article>",
    );
    const parsed = new DOMParser().parseFromString(html, "text/html");

    expect(parsed.querySelectorAll("body > article")).toHaveLength(1);
    expect(parsed.querySelector("article article")).toBeNull();
  });

  it("创建 Markdown 与 HTML 导出文件，并保留安全文件名", async () => {
    const markdown = createMarkdownExport("# 标题", {
      filename: "../我的笔记.md",
    });
    const html = await createHtmlExport("<h1>标题</h1>", {
      filename: "../我的笔记.md",
      title: "标题",
    });

    expect(markdown.filename).toBe("我的笔记.md");
    expect(markdown.mimeType).toBe("text/markdown;charset=utf-8");
    expect(await markdown.blob.text()).toBe("# 标题");
    expect(html.filename).toBe("我的笔记.html");
    expect(html.mimeType).toBe("text/html;charset=utf-8");
    expect(await html.blob.text()).toContain("<article><h1>标题</h1></article>");
  });

  it("在 HTML 导出中本地渲染 Mermaid，并阻止图表外部资源", async () => {
    const artifact = await createHtmlExport(
      mermaidPlaceholder(
        'flowchart LR\nA@{ img: "https://cdn.example.com/source.png", label: "本地图表" }',
      ),
      { filename: "流程图.md" },
    );
    const html = await artifact.blob.text();
    const renderedSource = String(mermaidMocks.render.mock.calls[0]?.[1]);

    expect(mermaidMocks.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        securityLevel: "strict",
        startOnLoad: false,
      }),
    );
    expect(renderedSource).not.toContain(
      "https://cdn.example.com/source.png",
    );
    expect(renderedSource).toContain("data:image/png;base64,");
    expect(html).toContain('class="mermaid-export"');
    expect(html).toContain("<svg");
    expect(html).toContain("data-mermaid-export-style");
    expect(html).not.toContain("language-mermaid");
    expect(html).not.toContain("https://cdn.example.com/tracker.png");
    expect(artifact.warnings).toContain(
      "已阻止 Mermaid 图表中的非本地图片：https://cdn.example.com/source.png",
    );
  });

  it("分页生成 PDF，并将线上图片交给渲染器加载", async () => {
    class LocalFileReader {
      result: string | null = null;
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;

      readAsDataURL(): void {
        this.result = "data:image/png;base64,AA==";
        this.onload?.();
      }
    }

    vi.stubGlobal("FileReader", LocalFileReader);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        blob: async () => new Blob(["png"], { type: "image/png" }),
        ok: true,
      }),
    );
    const artifact = await createPdfExport(
      `<h1>标题</h1><img src="https://cdn.example.com/a.png" alt="远程图">${mermaidPlaceholder("flowchart LR\nA --> B")}`,
      { filename: "长文.md" },
    );

    expect(artifact.filename).toBe("长文.pdf");
    expect(artifact.mimeType).toBe("application/pdf");
    expect(pdfMocks.html2canvas).toHaveBeenCalledOnce();
    expect(pdfMocks.renderedHtml).toContain("data:image/png;base64,AA==");
    expect(pdfMocks.renderedHtml).not.toContain(
      "https://cdn.example.com/a.png",
    );
    expect(pdfMocks.renderedHtml).toContain("<svg");
    expect(pdfMocks.renderedHtml).not.toContain("language-mermaid");
    expect(pdfMocks.addImage).toHaveBeenCalledTimes(3);
    expect(pdfMocks.addPage).toHaveBeenCalledTimes(2);
    expect(pdfMocks.html2canvas.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ useCORS: true }),
    );
    expect(document.querySelector("[data-export-pdf-root]")).toBeNull();
  });

  it("PDF 在跨域图片无法读取时保留带地址的占位区域", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("cors")));
    const source = "https://images.example.com/feature.png";
    const artifact = await createPdfExport(
      `<h1>标题</h1><img src="${source}" alt="功能示意图">`,
      { filename: "跨域图片.md" },
    );

    expect(artifact.warnings).toContain(
      `PDF 无法加载线上图片（跨域限制），已使用占位：${source}`,
    );
    expect(pdfMocks.renderedHtml).toContain(
      "export-remote-image-placeholder",
    );
    expect(pdfMocks.renderedHtml).toContain(source);
    expect(pdfMocks.renderedHtml).toContain("线上图片无法嵌入：功能示意图");
  });

  it("生成可下载的 docx，并在无法读取线上图片时降级为占位文本", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    const artifact = await createDocxExport(
      `
        <h1>导出标题</h1>
        <p>包含 <strong>加粗</strong> 和 <code>inline code</code>。</p>
        <ul><li>列表一</li><li>列表二</li></ul>
        <table><tr><th>字段</th><th>说明</th></tr><tr><td>id</td><td>编号</td></tr></table>
        <img src="https://cdn.example.com/a.png" alt="远程图">
      `,
      { filename: "开发文档.md", title: "开发文档" },
    );

    expect(artifact.filename).toBe("开发文档.docx");
    expect(artifact.mimeType).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(artifact.blob.size).toBeGreaterThan(1_000);
    expect(artifact.warnings).toContain(
      "Word 导出未嵌入不支持的图片：远程图",
    );
  });

  it("将 Mermaid 与 WebP 在本地栅格化为 PNG 后嵌入 docx", async () => {
    const raster = installRasterMocks();
    const artifact = await createDocxExport(
      `${mermaidPlaceholder("sequenceDiagram\nA->>B: 本地消息")}<img src="data:image/webp;base64,AA==" alt="WebP 图片">`,
      { filename: "兼容性.md" },
    );

    expect(artifact.filename).toBe("兼容性.docx");
    expect(artifact.blob.size).toBeGreaterThan(1_000);
    expect(raster.getContext).toHaveBeenCalledTimes(2);
    expect(raster.drawImage).toHaveBeenCalledTimes(2);
    expect(raster.toBlob).toHaveBeenCalledTimes(2);
    expect(artifact.warnings).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining("Mermaid 图表未导出"),
        expect.stringContaining("无法转换 WebP"),
      ]),
    );
  });

  it("浏览器无法转换 WebP 时在 docx 中明确降级并返回 warning", async () => {
    vi.stubGlobal("Image", undefined);
    const artifact = await createDocxExport(
      '<img src="data:image/webp;base64,AA==" alt="WebP 图片">',
      { filename: "WebP.md" },
    );

    expect(artifact.blob.size).toBeGreaterThan(1_000);
    expect(artifact.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Word 导出无法转换 WebP 图片：WebP 图片"),
      ]),
    );
  });

  it("通过对象 URL 启动下载并释放临时资源", () => {
    vi.useFakeTimers();
    const createObjectUrl = vi.fn(() => "blob:download");
    const revokeObjectUrl = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL: createObjectUrl,
      revokeObjectURL: revokeObjectUrl,
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    const artifact = createMarkdownExport("content", {
      filename: "note.md",
    });

    downloadExport(artifact);

    expect(createObjectUrl).toHaveBeenCalledWith(artifact.blob);
    expect(click).toHaveBeenCalledOnce();
    expect(document.querySelector('a[download="note.md"]')).toBeNull();
    vi.runAllTimers();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:download");
    vi.useRealTimers();
  });

  it("浏览器缺少 DOM 能力时返回可识别错误", () => {
    vi.stubGlobal("DOMParser", undefined);

    expect(() => prepareExportHtml("<p>内容</p>")).toThrowError(
      expect.objectContaining<Partial<ExportError>>({
        code: "UNSUPPORTED_BROWSER",
        name: "ExportError",
      }),
    );
  });
});
