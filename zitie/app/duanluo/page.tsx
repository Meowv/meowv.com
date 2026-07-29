import WorksheetApp from "../components/WorksheetApp";
import { createPageMetadata } from "../lib/metadata";

export const dynamic = "force-static";

export const metadata = createPageMetadata({
  title: "中文段落字帖｜文章、古诗 A4 描红练习纸",
  description: "在线把文章、古诗和中文段落制作成 A4 字帖，支持作文格、田字格等版式及描红、字体、行距设置，可导出 PNG、PDF 或直接打印。",
  canonical: "/duanluo/",
});

export default function Page() {
  return <WorksheetApp initialMode="cnParagraph" />;
}
