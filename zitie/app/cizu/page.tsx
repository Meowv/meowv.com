import WorksheetApp from "../components/WorksheetApp";
import { createPageMetadata } from "../lib/metadata";

export const dynamic = "force-static";

export const metadata = createPageMetadata({
  title: "词组字帖生成｜词语、成语在线描红练习",
  description: "在线制作词语、成语与词组练字字帖，支持拼音、描红、空行空列、多种方格与 A4 版式，可导出 PNG、PDF 或直接打印。",
  canonical: "/cizu/",
});

export default function Page() {
  return <WorksheetApp initialMode="phrase" />;
}
