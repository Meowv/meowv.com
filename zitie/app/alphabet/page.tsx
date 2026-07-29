import WorksheetApp from "../components/WorksheetApp";
import { createPageMetadata } from "../lib/metadata";

export const dynamic = "force-static";

export const metadata = createPageMetadata({
  title: "英文字母字帖｜四线三格 A4 在线练字纸",
  description: "在线制作英文字母 A4 字帖，支持大小写成对、四线三格、描红数量、字体与间距设置，可导出 PNG、PDF 或直接打印。",
  canonical: "/alphabet/",
});

export default function Page() {
  return <WorksheetApp initialMode="alphabet" />;
}
