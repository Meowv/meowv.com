import WorksheetApp from "../components/WorksheetApp";
import { createPageMetadata } from "../lib/metadata";

export const dynamic = "force-static";

export const metadata = createPageMetadata({
  title: "笔画字帖生成｜汉字基本笔画在线练习纸",
  description: "在线制作汉字基本笔画练习字帖，可选择笔画、添加例字并调整方格、描红与 A4 页面版式，支持导出 PNG、PDF 或直接打印。",
  canonical: "/bihua/",
});

export default function Page() {
  return <WorksheetApp initialMode="stroke" />;
}
