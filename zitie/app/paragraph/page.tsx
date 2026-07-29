import WorksheetApp from "../components/WorksheetApp";
import { createPageMetadata } from "../lib/metadata";

export const dynamic = "force-static";

export const metadata = createPageMetadata({
  title: "英文段落字帖｜文章、句子 A4 练习纸",
  description: "在线把英文文章、句子和段落制作成 A4 练字纸，支持四线三格、描红、字体、行距与页边距设置，可导出 PNG、PDF 或直接打印。",
  canonical: "/paragraph/",
});

export default function Page() {
  return <WorksheetApp initialMode="enParagraph" />;
}
