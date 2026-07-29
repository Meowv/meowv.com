import WorksheetApp from "../components/WorksheetApp";
import { createPageMetadata } from "../lib/metadata";

export const dynamic = "force-static";

export const metadata = createPageMetadata({
  title: "数字字帖生成｜四线格 A4 数字练习纸",
  description: "在线制作数字 A4 练习字帖，支持四线格、描红、空行、字体字号与页面版式设置，可导出 PNG、PDF 或直接打印。",
  canonical: "/number/",
});

export default function Page() {
  return <WorksheetApp initialMode="number" />;
}
