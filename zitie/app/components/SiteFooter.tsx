const BASIC_STROKES = [
  { glyph: "一", name: "横" },
  { glyph: "丨", name: "竖" },
  { glyph: "丿", name: "撇" },
  { glyph: "丶", name: "点" },
] as const;

export default function SiteFooter() {
  return (
    <footer className="site-footer desktop-only">
      <div className="site-footer__inner">
        <a className="site-footer__brand">
          <span>
            <strong>纸上有格，落笔有章</strong>
            <small>字帖生成，在线制作 A4 练字纸</small>
          </span>
        </a>

        <div className="site-footer__strokes" role="img" aria-label="横、竖、撇、点四种基本笔画">
          {BASIC_STROKES.map((stroke) => (
            <span className="site-footer__stroke" key={stroke.name} aria-hidden="true">
              <strong>{stroke.glyph}</strong>
              <small>{stroke.name}</small>
            </span>
          ))}
        </div>

        <div className="site-footer__motto">
          <strong>一笔一画，写好中国字</strong>
          <span>田字格 · 米字格 · 四线格 · A4 打印</span>
          <a href="/donate/">捐赠支持</a>
          <span>更多工具：
            <a href="https://img.meowv.com" target="_blank" rel="noreferrer">Image Studio</a>、
            <a href="https://md.meowv.com" target="_blank" rel="noreferrer">Markdown Studio</a>、
            <a href="https://excel.meowv.com" target="_blank" rel="noreferrer">在线 Excel 处理</a>、
            <a href="https://pdf.meowv.com" target="_blank" rel="noreferrer">在线 PDF 处理</a>
          </span>
        </div>
      </div>
    </footer>
  );
}
