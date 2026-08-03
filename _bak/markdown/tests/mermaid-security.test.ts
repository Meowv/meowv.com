import { sanitizeMermaidSvg } from "@/services/mermaid-security";
import mermaid from "mermaid";
import { describe, expect, it } from "vitest";

function parseSvg(svg: string): SVGSVGElement {
  return new DOMParser().parseFromString(
    svg,
    "image/svg+xml",
  ).documentElement as unknown as SVGSVGElement;
}

function installSvgMeasurementStub(): void {
  Object.defineProperty(SVGElement.prototype, "getBBox", {
    configurable: true,
    value: () => ({
      bottom: 20,
      height: 20,
      left: 0,
      right: 100,
      top: 0,
      width: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  });
  Object.defineProperty(HTMLImageElement.prototype, "decode", {
    configurable: true,
    value: () => Promise.resolve(),
  });
}

describe("Mermaid SVG 本地资源保护", () => {
  it("可清洗 Mermaid 实际生成的普通流程图", async () => {
    installSvgMeasurementStub();
    mermaid.initialize({
      securityLevel: "strict",
      startOnLoad: false,
      suppressErrorRendering: true,
    });
    const result = await mermaid.render(
      "mermaid-security-normal-flow",
      "flowchart LR\n  A[开始] --> B{判断}\n  B --> C[结束]",
    );
    const sanitized = sanitizeMermaidSvg(result.svg);
    const root = parseSvg(sanitized);

    expect(root.localName).toBe("svg");
    expect(root.textContent).toContain("开始");
    expect(root.textContent).toContain("结束");
    expect(root.querySelector("path")).not.toBeNull();
  });

  it("清除 Mermaid image 节点实际生成的远程图片", async () => {
    installSvgMeasurementStub();
    mermaid.initialize({
      securityLevel: "strict",
      startOnLoad: false,
      suppressErrorRendering: true,
    });
    const result = await mermaid.render(
      "mermaid-security-remote-image",
      'flowchart LR\n  A@{ img: "https://example.com/tracker.png", label: "Remote", pos: "t", h: 60 }',
    );
    const sanitized = sanitizeMermaidSvg(result.svg);

    expect(result.svg).toContain("https://example.com/tracker.png");
    expect(sanitized).not.toContain("example.com");
    expect(parseSvg(sanitized).querySelector("image")).toBeNull();
  });

  it("保留普通图表的内部引用和安全 foreignObject 标签", () => {
    const sanitized = sanitizeMermaidSvg(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <defs>
          <marker id="arrow"><path d="M0 0L10 5L0 10z" /></marker>
          <clipPath id="clip"><rect width="10" height="10" /></clipPath>
          <g id="node"><circle r="4" /></g>
        </defs>
        <path marker-end="url(#arrow)" clip-path="url('#clip')" />
        <use href="#node" />
        <foreignObject>
          <div xmlns="http://www.w3.org/1999/xhtml">
            <span class="nodeLabel">安全标签</span>
          </div>
        </foreignObject>
      </svg>
    `);
    const root = parseSvg(sanitized);

    expect(root.querySelector("path[marker-end]")?.getAttribute("marker-end"))
      .toBe("url(#arrow)");
    expect(root.querySelector("path[clip-path]")?.getAttribute("clip-path"))
      .toBe("url('#clip')");
    expect(root.querySelector("use")?.getAttribute("href")).toBe("#node");
    expect(root.querySelector("foreignObject")?.textContent).toContain(
      "安全标签",
    );
  });

  it("移除 image、use 和 feImage 的远程、相对及 data 引用", () => {
    const sanitized = sanitizeMermaidSvg(`
      <svg xmlns="http://www.w3.org/2000/svg"
        xmlns:xlink="http://www.w3.org/1999/xlink">
        <image href="https://example.com/tracker.png" />
        <image xlink:href="../private.png" />
        <use href="data:image/svg+xml;base64,PHN2Zy8+" />
        <feImage href="//example.com/filter.svg" />
        <use href="#safe-symbol" />
      </svg>
    `);
    const root = parseSvg(sanitized);

    expect(root.querySelectorAll("image, feImage")).toHaveLength(0);
    expect(root.querySelectorAll("use")).toHaveLength(1);
    expect(root.querySelector("use")?.getAttribute("href")).toBe(
      "#safe-symbol",
    );
    expect(sanitized).not.toContain("example.com");
    expect(sanitized).not.toContain("../private.png");
    expect(sanitized).not.toContain("data:image");
  });

  it("清理 foreignObject 内的加载元素、外链、事件和危险样式", () => {
    const sanitized = sanitizeMermaidSvg(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <foreignObject>
          <div xmlns="http://www.w3.org/1999/xhtml"
            onclick="fetch('https://example.com/click')"
            style="background-image: url(https://example.com/background.png)">
            <span>保留文字</span>
            <img src="https://example.com/pixel.png" />
            <iframe srcdoc="unsafe"></iframe>
            <a href="https://example.com">外链</a>
            <a href="#local-node">内部链接</a>
          </div>
        </foreignObject>
      </svg>
    `);
    const root = parseSvg(sanitized);
    const foreignObject = root.querySelector("foreignObject");
    const links = foreignObject?.querySelectorAll("a") ?? [];

    expect(foreignObject?.textContent).toContain("保留文字");
    expect(foreignObject?.querySelector("img, iframe")).toBeNull();
    expect(foreignObject?.querySelector("[onclick], [style]")).toBeNull();
    expect(links[0]?.hasAttribute("href")).toBe(false);
    expect(links[1]?.getAttribute("href")).toBe("#local-node");
    expect(sanitized).not.toContain("example.com");
  });

  it("删除可能加载资源的 CSS 和动态链接元素", () => {
    const sanitized = sanitizeMermaidSvg(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <style>.safe { fill: red; }</style>
        <style>@import "https://example.com/theme.css";</style>
        <path class="safe" fill="url(#gradient)" />
        <path stroke="url(../remote.svg#stroke)" />
        <animate attributeName="href"
          values="#safe;https://example.com/tracker.svg" />
      </svg>
    `);
    const root = parseSvg(sanitized);
    const styles = root.querySelectorAll("style");
    const paths = root.querySelectorAll("path");

    expect(styles).toHaveLength(1);
    expect(styles[0]?.textContent).toContain("fill: red");
    expect(paths[0]?.getAttribute("fill")).toBe("url(#gradient)");
    expect(paths[1]?.hasAttribute("stroke")).toBe(false);
    expect(root.querySelector("animate")).toBeNull();
    expect(sanitized).not.toContain("example.com");
    expect(sanitized).not.toContain("../remote.svg");
  });
});
