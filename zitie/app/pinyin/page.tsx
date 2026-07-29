import WorksheetApp from "../components/WorksheetApp";
import { createPageMetadata } from "../lib/metadata";

export const dynamic = "force-static";

export const metadata = createPageMetadata({
  title: "拼音字帖生成｜在线制作四线三格练习纸",
  description: "在线制作拼音四线三格 A4 练习纸，支持带声调韵母输入、描红、空行、字体字号与版式设置，可导出 PNG、PDF 或直接打印。",
  canonical: "/pinyin/",
});

export default function Page() {
  return <WorksheetApp initialMode="pinyin" />;
}
