# Third-Party Notices

本项目原创代码采用 [MIT License](./LICENSE)。第三方代码、数据、字体、图片、音视频及其他资源的版权归各自权利人所有，继续适用其原有许可证；根目录 MIT 许可证不对这些内容重新授权。

本文件记录直接运行时依赖、主要随仓库分发的资源，以及需要进一步核对的许可信息。它是来源与许可索引，不替代各组件的完整许可证、版权声明、NOTICE、对应源码和其他分发要求，也不表示已经完成所有间接依赖或发布产物的许可审计。

依赖版本与解析结果以各项目的清单和锁文件为准；下表的 npm 许可依据本次核对的安装包元数据，原文以所使用版本的 `LICENSE` / `COPYING` / `NOTICE` 为准。更新依赖或重新打包时，应同步核对。

## Studio 与 Zitie

直接运行时依赖见 [`studio/package.json`](./studio/package.json)，解析版本见 [`studio/pnpm-lock.yaml`](./studio/pnpm-lock.yaml)。以下链接指向各上游项目；版权归相应项目作者和贡献者所有。

| 组件 | 声明的许可证 |
| --- | --- |
| [@excalidraw/excalidraw](https://github.com/excalidraw/excalidraw) | MIT |
| [@microsoft/signalr](https://github.com/dotnet/aspnetcore) | MIT |
| [@tabler/icons-vue](https://github.com/tabler/tabler-icons) | MIT |
| [@visimer/core](https://github.com/inkeep/visimer) | MIT |
| [@visimer/dom](https://github.com/inkeep/visimer) | MIT |
| [@visimer/monaco](https://github.com/inkeep/visimer) | MIT |
| [@vue/devtools-api](https://github.com/vuejs/devtools) | MIT |
| [@zip.js/zip.js](https://github.com/gildas-lormeau/zip.js) | BSD-3-Clause |
| [@zumer/snapdom](https://github.com/zumerlab/snapdom) | MIT |
| [ag-psd](https://github.com/Agamnentzar/ag-psd) | MIT |
| [cnchar](https://github.com/theajack/cnchar) | MIT |
| [cnchar-order](https://github.com/theajack/cnchar) | MIT |
| [cnchar-trad](https://github.com/theajack/cnchar) | MIT |
| [cubing](https://github.com/cubing/cubing.js) | MPL-2.0 OR GPL-3.0-or-later |
| [d3](https://github.com/d3/d3) | ISC |
| [docx](https://github.com/dolanmiu/docx) | MIT |
| [dompurify](https://github.com/cure53/DOMPurify) | (MPL-2.0 OR Apache-2.0) |
| [fflate](https://github.com/101arrowz/fflate) | MIT |
| [foliate-js](https://github.com/johnfactotum/foliate-js) | MIT |
| [hanzi-writer-data](https://github.com/chanind/hanzi-writer-data) | Arphic Public License（见下方数据说明） |
| [heic-to](https://github.com/hoppergee/heic-to) | LGPL-3.0（包元数据；许可正文允许 later version） |
| [highlight.js](https://github.com/highlightjs/highlight.js) | BSD-3-Clause |
| [hls.js](https://github.com/video-dev/hls.js) | Apache-2.0 |
| [html2canvas](https://github.com/niklasvh/html2canvas) | MIT |
| [ical.js](https://github.com/kewisch/ical.js) | MPL-2.0 |
| [js-yaml](https://github.com/nodeca/js-yaml) | MIT |
| [jsoncrack-react](https://github.com/AykutSarac/jsoncrack.com) | Apache-2.0 |
| [jspdf](https://github.com/parallax/jsPDF) | MIT |
| [jsqr](https://github.com/cozmo/jsQR) | Apache-2.0 |
| [jszip](https://github.com/Stuk/jszip) | (MIT OR GPL-3.0-or-later) |
| [lunar-javascript](https://github.com/6tail/lunar-javascript) | MIT |
| [markdown-it](https://github.com/markdown-it/markdown-it) | MIT |
| [markmap-lib](https://github.com/markmap/markmap) | MIT |
| [markmap-view](https://github.com/markmap/markmap) | MIT |
| [mermaid](https://github.com/mermaid-js/mermaid) | MIT |
| [mind-elixir](https://github.com/SSShooter/mind-elixir-core) | MIT |
| [minisearch](https://github.com/lucaong/minisearch) | MIT |
| [monaco-editor](https://github.com/microsoft/monaco-editor) | MIT |
| [pdf-lib](https://github.com/Hopding/pdf-lib) | MIT |
| [pdfjs-dist](https://github.com/mozilla/pdf.js) | Apache-2.0 |
| [pinia](https://github.com/vuejs/pinia) | MIT |
| [pinyin-pro](https://github.com/zh-lx/pinyin-pro) | MIT |
| [qrcode](https://github.com/soldair/node-qrcode) | MIT |
| [ranui](https://github.com/chaxus/ran) | MIT |
| [ranuts](https://github.com/chaxus/ran) | MIT |
| [react](https://github.com/facebook/react) | MIT |
| [react-dom](https://github.com/facebook/react) | MIT |
| [sql.js](http://github.com/sql-js/sql.js) | MIT |
| [three](https://github.com/mrdoob/three.js) | MIT |
| [utif](https://github.com/photopea/UTIF.js) | MIT |
| [vue](https://github.com/vuejs/core) | MIT |
| [vue-draggable-plus](https://github.com/Alfred-Skyblue/vue-draggable-plus) | MIT |
| [vue-router](https://github.com/vuejs/router) | MIT |

### 单独授权的数据与运行时

- **Hanzi Writer Data / Make Me a Hanzi**：Zitie 使用的笔顺数据来自 [hanzi-writer-data](https://github.com/chanind/hanzi-writer-data)，上游说明其由 [Make Me a Hanzi](https://github.com/skishore/makemeahanzi) 从 Arphic 字体提取，适用 **Arphic Public License**，不是 Hanzi Writer 软件本身的 MIT 许可。分发数据及其修改版本时应保留 [ARPHICPL.TXT](https://github.com/chanind/hanzi-writer-data/blob/master/ARPHICPL.TXT) 并遵守其条款。
- **heic-to / libheif**：HEIC 转换组件 `heic-to` 的包元数据声明 LGPL-3.0，附带许可正文允许 LGPL v3 或更新版本。其内含的 libheif / WebAssembly 及相关编解码依赖应按实际构建分别保留许可、版权和适用的源码或重新链接材料，不能统一改标 MIT。来源：[heic-to](https://github.com/hoppergee/heic-to)、[libheif](https://github.com/strukturag/libheif)。
- **MPL 与多许可证组件**：`ical.js`、`cubing`、`dompurify` 等按各自许可使用。表中的 `OR` 表示上游提供许可选择，不表示多种许可均被替换为本项目 MIT；修改或再分发时仍须满足所选许可的条件。
- **SQLite**：`sql.js` 软件适用 MIT；底层 SQLite 核心另按其[公共领域声明](https://sqlite.org/copyright.html)处理，不能把核心与封装的许可混为一谈。

### ONLYOFFICE 编辑器与转换器

仓库包含 `studio/public/office-assets/sdkjs/`、`web-apps/`、`wasm/`、`libs/` 等编辑和转换资源，并由 `studio/src/features/office/runtime/` 加载。ONLYOFFICE 相关版权归 **Ascensio System SIA** 及相应贡献者所有。

| 组件 | 上游及许可参考 | 本仓库状态 |
| --- | --- | --- |
| ONLYOFFICE SDKJS | [源码](https://github.com/ONLYOFFICE/sdkjs) · [LICENSE](https://github.com/ONLYOFFICE/sdkjs/blob/master/LICENSE)，AGPL v3 及上游适用的附加条款 | 本仓库中的具体来源版本、修改记录及完整声明尚需核对 |
| ONLYOFFICE Web Apps | [源码](https://github.com/ONLYOFFICE/web-apps) · [LICENSE](https://github.com/ONLYOFFICE/web-apps/blob/master/LICENSE)，AGPL v3 及上游适用的附加条款 | 本仓库中的具体来源版本、修改记录及完整声明尚需核对 |
| Office WebAssembly 转换器及辅助库 | 位于 `studio/public/office-assets/wasm/` 与 `libs/` | 需按实际资源确认构建来源、版本、许可及对应源码，不能直接视为 MIT |

链接中的上游主分支用于定位项目，不等同于已经确认了本仓库所附二进制的对应源码版本。分发或部署涉及这些组件的版本时，须核对适用的 AGPL、版权与界面声明、商标、源码提供及其他上游要求；本文件中的列名、链接或根目录 MIT 声明均不能替代这些义务。相关集成是否构成受上游许可约束的衍生作品，也不能仅靠在此排除第三方目录来确定。

## Blog

### Hexo 与插件

直接依赖见 [`blog/package.json`](./blog/package.json)，解析版本见 [`blog/yarn.lock`](./blog/yarn.lock)。

| 组件 | 声明的许可证 |
| --- | --- |
| [hexo](https://github.com/hexojs/hexo) | MIT |
| [hexo-filter-github-emojis](https://github.com/crimx/hexo-filter-github-emojis) | MIT |
| [hexo-generator-archive](https://github.com/hexojs/hexo-generator-archive) | MIT |
| [hexo-generator-category](https://github.com/hexojs/hexo-generator-category) | MIT |
| [hexo-generator-feed](https://github.com/hexojs/hexo-generator-feed) | MIT |
| [hexo-generator-index](https://github.com/hexojs/hexo-generator-index) | MIT |
| [hexo-generator-search](https://github.com/Wzpan/hexo-generator-search) | MIT |
| [hexo-generator-sitemap](https://github.com/hexojs/hexo-generator-sitemap) | MIT |
| [hexo-generator-tag](https://github.com/hexojs/hexo-generator-tag) | MIT |
| [hexo-neat](https://github.com/rozbo/hexo-neat) | MIT |
| [hexo-permalink-pinyin](https://github.com/viko16/hexo-permalink-pinyin) | MIT |
| [hexo-renderer-ejs](https://github.com/hexojs/hexo-renderer-ejs) | MIT |
| [hexo-renderer-marked](https://github.com/hexojs/hexo-renderer-marked) | MIT |
| [hexo-renderer-pug](https://github.com/hexojs/hexo-renderer-pug) | MIT |
| [hexo-renderer-stylus](https://github.com/hexojs/hexo-renderer-stylus) | MIT |
| [hexo-server](https://github.com/hexojs/hexo-server) | MIT |
| [hexo-wordcount](https://github.com/willin/hexo-wordcount) | MIT |

### Matery 主题及内置资源

[`blog/themes/hexo-theme-matery/`](./blog/themes/hexo-theme-matery/) 基于 [blinkfox/hexo-theme-matery](https://github.com/blinkfox/hexo-theme-matery)，主题适用 **Apache-2.0**，现有 [LICENSE](./blog/themes/hexo-theme-matery/LICENSE) 保持有效。主题内的第三方库、图标与字体不因随主题分发而统一改为 Apache-2.0 或本项目 MIT。

以下许可依据仓库内相应资源的头部声明整理：

| 资源（位于主题 `source/libs/`） | 版权 / 许可说明 |
| --- | --- |
| `jquery/` | JS Foundation 与贡献者；MIT，见 [jQuery 许可](https://jquery.org/license/) |
| `materialize/` | Materialize；MIT，见 [上游项目](https://github.com/Dogfalo/materialize) |
| `animate/` | Daniel Eden；MIT，见 [Animate.css](https://github.com/animate-css/animate.css) |
| `typed/` | MIT，见 [Typed.js](https://github.com/mattboldt/typed.js) |
| `jqcloud/` | Luca Ongaro；MIT，见 [jQCloud](https://github.com/lucaong/jQCloud) |
| `masonry/` | 包含 MIT 许可声明，见 [Masonry](https://github.com/desandro/masonry) |
| `echarts/` | 包含 Apache Software Foundation 许可声明；Apache-2.0，见 [ECharts](https://github.com/apache/echarts) |
| `lightGallery/` | 文件头声明 GPLv3；见 [lightGallery](https://github.com/sachinchoolur/lightGallery)，应核对所附版本，不能用上游新版条款覆盖旧版本 |
| `valine/` | 主脚本文件头声明 GPL-2.0，包内还包含单独授权的代码；见 [Valine](https://github.com/xCss/Valine)，应分别保留声明 |
| `awesome/` | Font Awesome Free：图标 CC BY 4.0、字体 SIL OFL 1.1、代码 MIT；见 [官方许可](https://fontawesome.com/license/free) |

`background/`、`cryptojs/`、`minivaline/`、`gitalk/`、`dplayer/`、`codeBlock/`、`instantpage/`、`aplayer/`、`prism/`、`lightGallery/` 的附属资源、`others/`、`scrollprogress/`、`gitment/`、`tocbot/`、`aos/`、`share/` 等复制到主题内的资源，还需按所附文件版本逐项核对原始声明；不能仅凭库名或主题许可证判断全部资源的许可。

## API 与原生依赖

直接 NuGet 依赖见 [`Meowv.Api.csproj`](./api/src/Meowv.Api/Meowv.Api.csproj)。

| 组件 | 来源 | 许可说明 |
| --- | --- | --- |
| .NET / ASP.NET Core / SignalR | [dotnet](https://github.com/dotnet)、[ASP.NET Core](https://github.com/dotnet/aspnetcore) | 相关代码通常采用 MIT；随分发运行时的完整许可及第三方声明应一并保留 |
| Microsoft.Data.Sqlite | [EF Core](https://github.com/dotnet/efcore) | NuGet 包声明 MIT；另有 SQLitePCLRaw 等间接依赖，须保留各自声明 |
| NSec.Cryptography | [NSec](https://github.com/ektrah/nsec) | NuGet 包声明 MIT；包内 `NOTICE` 另列 libsodium、RFC 6234 等代码的许可与版权 |
| libsodium | [libsodium](https://github.com/jedisct1/libsodium) | ISC；通过 NSec 引入，版权归 Frank Denis 及其他权利人所有 |
| SQLite | [SQLite](https://sqlite.org/copyright.html) | 核心为公共领域；封装和构建依赖另有许可 |
| FFmpeg / libx264 | [FFmpeg 许可说明](https://ffmpeg.org/legal.html) · [BtbN 构建](https://github.com/BtbN/FFmpeg-Builds) · [binmgr 构建](https://github.com/binmgr/ffmpeg) | 按实际二进制构建选项确定 LGPL / GPL；不是本项目 MIT |

API 使用独立 FFmpeg 进程处理媒体。[下载脚本](./api/scripts/fetch-ffmpeg.sh)的 Windows 路径选择包含 libx264 的 GPL 构建，并在产物 `SOURCE.txt` 中记录 `GPL-3.0-or-later`；其他平台也应检查实际构建，不能默认全部为 LGPL。`SOURCE.txt` 的下载与校验记录不能替代完整许可证和对应源码提供等义务；分发二进制时，应补齐与该版本匹配的相关材料。

LiveWall 的 SwiftPM 清单不声明第三方 Swift 包，壁纸内容和系统框架也不属于本项目 MIT 的重新授权范围。Wallpapers 的 Python 运行时依赖为标准库；测试、构建工具及它们的依赖仍各自适用原许可。

## 字体、图标与媒体

| 资源位置 / 名称 | 来源与许可说明 |
| --- | --- |
| `studio/public/office-assets/fonts/Noto*.ttf` | 文件内声明 SIL OFL 1.1，包含 Adobe 的版权与 Reserved Font Name 信息；见 [Noto CJK](https://github.com/notofonts/noto-cjk) |
| `studio/public/fonts/studio-noto-sans-sc-subset.woff2` | Noto Sans SC 字体子集；应保留对应源字体的 OFL、版权及子集修改信息，具体源版本需核对 |
| `studio/public/office-assets/fonts/LiberationSans*.ttf` | 文件内声明 SIL OFL 1.1，包含 Google 与 Red Hat 的版权；见 [Liberation Fonts](https://github.com/liberationfonts/liberation-fonts) |
| `studio/public/office-assets/fonts/ComicNeue*.ttf` | Comic Neue Project Authors；文件内声明 SIL OFL 1.1，见 [Comic Neue](https://github.com/crozynski/comicneue) |
| `studio/public/office-assets/fonts/DejaVu*.ttf` | 包含 Bitstream Vera、部分 Arev 字形的条款及 DejaVu 修改的公共领域声明，见 [DejaVu 许可](https://dejavu-fonts.github.io/License.html)，不应简化为 MIT |
| `studio/public/excalidraw-assets/fonts/` | 随 Excalidraw 提供的 Assistant、Cascadia、ComicShanns、Excalifont、Liberation、Lilita、Nunito、Virgil、Xiaolai 字体；须按各字体的原始许可分别保留声明，见 [上游字体目录](https://github.com/excalidraw/excalidraw/tree/master/packages/excalidraw/fonts)，不能直接套用 Excalidraw 软件的 MIT |
| `studio/public/zitie/fonts/practice-*.woff2` | 练习字体的具体来源、修改记录和授权尚需核对，不由根目录 MIT 自动授权 |
| `studio/public/sounds/carnival.wav` | 音频的具体来源和授权尚需核对，不由根目录 MIT 自动授权 |
| 博客主题图标字体与插图 | 依各资源自己的许可；Font Awesome 的字体、图标与代码许可不同，见上方说明 |
| `blog/source/games/ztype/`、`blog/source/games/plonky/` | 游戏程序、引擎、字体与媒体应分别核对权利人和分发授权；当前未确认完整授权链，不适用本项目 MIT 的重新授权 |
| 壁纸、封面、视频、文章配图与转载内容 | 权利属于各自权利人；公开接口可访问、可下载或被采集不表示允许再分发或商用，也不表示适用本项目 MIT |

本项目 MIT 声明不替换文章或资源中已有的单独授权与署名，也不授予第三方商标、人物肖像及其他独立权利。没有明确许可信息的第三方内容，不应被解释为已经获得本项目的授权。

## 分发时保留的材料

- 保留所用版本的完整许可证、版权声明及上游要求的 `NOTICE`；仅保留本清单中的链接不能替代这些材料。
- 对 AGPL、GPL、LGPL、MPL 等组件，按实际版本、修改和组合方式履行对应源码、修改标记、界面声明或重新链接等适用义务。
- 开发工具、间接依赖、下载的二进制和字体子集，应在制作实际发布包时再次核对；清单和锁文件用于定位版本，不是许可证原文。
- 对上文标记“尚需核对”的 Office 资源、主题附属库、字体、音频和游戏，先确认来源、授权与所需材料，再决定是否纳入再分发产物。本文件不构成这些待确认资源的授权证明。
