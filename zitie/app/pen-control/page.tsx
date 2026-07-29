import WorksheetApp from "../components/WorksheetApp";
import { createPageMetadata } from "../lib/metadata";

export const dynamic = "force-static";

export const metadata = createPageMetadata({
  title: "控笔训练字帖｜儿童线条与运笔练习纸",
  description: "在线制作儿童控笔训练 A4 练习纸，提供多种线条与运笔图案，并可调整图案粗细、行距、边距和页面版式，支持导出 PNG、PDF 或直接打印。",
  canonical: "/pen-control/",
});

export default function Page() {
  return <WorksheetApp initialMode="penControl" />;
}
