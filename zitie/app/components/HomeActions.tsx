import { ArrowRight } from "./Icons";

export default function HomeActions() {
  return (
    <div className="home-hero__actions" role="group" aria-label="首页快捷操作">
      <a className="home-hero__action home-hero__action--primary" href="/hanzi/">
        生成语文字帖
        <ArrowRight size={16} weight="bold" />
      </a>
      <a className="home-hero__action home-hero__action--secondary" href="/alphabet/">
        生成英文字帖
        <ArrowRight size={16} weight="bold" />
      </a>
    </div>
  );
}
