import { createElement, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import DonatePage from './DonatePage';
import HomePage from './HomePage';
import SiteFooter from './components/SiteFooter';
import SiteHeader from './components/SiteHeader';
import WorksheetApp from './components/WorksheetApp';
import { findZitiePage } from './routes';
import './zitie.css';

function NotFoundPage(): ReactElement {
  return (
    <div className="desktop-only">
      <SiteHeader />
      <main className="donate-page">
        <section className="donate-content" aria-labelledby="not-found-title">
          <p className="donate-content__eyebrow">页面不存在</p>
          <h1 id="not-found-title">没有找到这张字帖</h1>
          <p className="donate-content__description">
            当前地址没有对应页面，请返回字帖生成首页重新选择练习类型。
          </p>
          <p>
            <a className="home-hero__action home-hero__action--primary" href="/zitie/">
              返回首页
            </a>
          </p>
        </section>
      </main>
    </div>
  );
}

const page = findZitiePage(window.location.pathname);
let content: ReactElement;

if (page.kind === 'home') content = <HomePage />;
else if (page.kind === 'donate') content = <DonatePage />;
else if (page.kind === 'worksheet' && page.mode) {
  content = createElement(WorksheetApp, { initialMode: page.mode });
} else content = <NotFoundPage />;

const rootElement = document.getElementById('zitie-root');
if (!rootElement) throw new Error('未找到字帖应用挂载节点。');

createRoot(rootElement).render(
  <>
    {content}
    <SiteFooter />
  </>,
);
