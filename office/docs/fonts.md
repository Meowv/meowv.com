# 字体

项目不分发 Arial、Times New Roman、Calibri、微软雅黑、宋体等未取得再分发授权的商业字体。

当前上游资源包含开放许可的 DejaVu、Liberation、Noto、Comic Neue 与 Geist 字体。电子表格编辑器
通过 `public/font-map.json` 和 `onlyoffice-v7-iframe-patch.js` 把系统字体路径映射到开放字体；Word
和 PowerPoint 保留 OnlyOffice 自身字形回退，避免错误替换造成字形索引错位。

缺失字体会导致换行、分页、行高和图形位置变化。任何新增字体必须记录来源和许可证，并将许可文本
一同分发。
