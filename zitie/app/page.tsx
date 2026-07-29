import HomeActions from "./components/HomeActions";
import { Sparkle } from "./components/Icons";
import HomePoemPreview from "./components/HomePoemPreview";
import SiteHeader from "./components/SiteHeader";

export const dynamic = "force-static";

export default function Home() {
  return (
    <div className="home-page desktop-only">
      <SiteHeader />
      <main className="home-hero">
        <section className="home-hero__copy" aria-labelledby="home-title">
          <div className="home-hero__ink" aria-hidden="true"><span /><i /></div>
          <div className="home-hero__seal" aria-hidden="true"><span>字</span><span>帖</span></div>
          <p className="home-hero__eyebrow"><Sparkle size={15} weight="fill" /> 纸上练字 · 随心生成</p>
          <p className="home-hero__kicker">从一方字格开始</p>
          <h1 id="home-title"><span>让每一笔，</span><em>都有章法。</em></h1>
          <p className="home-hero__quote">静下心来，把汉字写得更舒展一些。</p>
          <p className="home-hero__description">输入想练的文字，即可生成干净、真实的 A4 练字纸。汉字、拼音、英文、数字与控笔练习，都能循着自己的节奏慢慢写。</p>
          <HomeActions />
          <dl className="home-hero__features">
            <div><dt>多种格纸</dt><dd>田字格、米字格与横线格</dd></div>
            <div><dt>A4 排版</dt><dd>预览、导出和打印保持一致</dd></div>
            <div><dt>从容练习</dt><dd>为启蒙，也为片刻静心</dd></div>
          </dl>
        </section>

        <div className="home-hero__preview" id="home-example">
          <HomePoemPreview />
        </div>
      </main>
    </div>
  );
}
