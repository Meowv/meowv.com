import SiteHeader from "../components/SiteHeader";
import { createPageMetadata } from "../lib/metadata";

export const dynamic = "force-static";

export const metadata = createPageMetadata({
  title: "捐赠支持",
  description: "字帖生成免费开放，感谢通过支付宝或微信支持服务器、字体与功能维护。",
  canonical: "/donate/",
});

const donationMethods = [
  { name: "支付宝", hint: "打开支付宝扫一扫", image: "https://meowv.com/medias/reward/alipay.png" },
  { name: "微信", hint: "打开微信扫一扫", image: "https://meowv.com/medias/reward/wechat.png" },
];

export default function DonatePage() {
  return (
    <div className="desktop-only">
      <SiteHeader activeDonate />
      <main className="donate-page">
        <section className="donate-content" aria-labelledby="donate-title">
          <p className="donate-content__eyebrow">感谢你的支持</p>
          <h1 id="donate-title">捐赠支持</h1>
          <p className="donate-content__description">如果这份字帖工具对你有所帮助，欢迎扫码支持。每一份心意，都会帮助它继续安静地陪伴更多练习。字帖生成免费开放，你的支持将用于服务器、字体与功能维护。</p>
          <div className="donate-methods">
            {donationMethods.map((method) => (
              <section className="donate-method" key={method.name}>
                <h2>{method.name}</h2>
                <p>{method.hint}</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="donate-method__qr" src={method.image} alt={`${method.name}收款二维码`} />
              </section>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
