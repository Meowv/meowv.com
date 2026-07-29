import WorksheetApp from "../components/WorksheetApp";
import { createPageMetadata } from "../lib/metadata";

export const dynamic = "force-static";

export const metadata = createPageMetadata({
  title: "汉字字帖生成｜田字格、米字格在线练字纸",
  description: "在线生成可打印的汉字字帖，支持田字格、米字格、回宫格等方格，可设置笔顺、拼音、描红、字体与版式，并导出 PNG、PDF 或直接打印。",
  canonical: "/hanzi/",
});

export default function Page() {
  return <WorksheetApp initialMode="hanzi" />;
}
