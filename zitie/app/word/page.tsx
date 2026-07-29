import WorksheetApp from "../components/WorksheetApp";
import { createPageMetadata } from "../lib/metadata";

export const dynamic = "force-static";

export const metadata = createPageMetadata({
  title: "英文单词字帖｜在线制作 A4 英语练字纸",
  description: "在线制作英文单词 A4 练字纸，支持四线三格、描红、空行、字体字号与页面版式设置，可导出 PNG、PDF 或直接打印。",
  canonical: "/word/",
});

export default function Page() {
  return <WorksheetApp initialMode="word" />;
}
