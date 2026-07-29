"use client";

import {
  CaretDown,
  CaretLeft,
  CaretRight,
  Check,
  DownloadSimple,
  FilePdf,
  ImageSquare,
  Images,
  Info,
  MagnifyingGlass,
  Minus,
  Plus,
  Printer,
  Trash,
  WarningCircle,
  X,
} from "./Icons";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  getWorksheetTemplates,
  type WorksheetTemplateOption,
} from "../config/worksheet-templates";
import {
  findMatchingLocalFont,
  registerLocalFont,
  requestLocalFonts,
  supportsLocalFontAccess,
  type FontDataLike,
  type RegisteredLocalFont,
} from "../lib/local-fonts";
import {
  createPagePngBlob,
  createPagesPdfBlob,
  createPagesZipBlob,
  createPrintPageUrls,
  downloadBlob,
  renderWorksheetPage,
  revokeObjectUrls,
} from "../lib/renderer";
import type {
  ExerciseMode,
  StrokePracticeItem,
  WorksheetPage,
  WorksheetSettings,
} from "../lib/types";
import {
  COLOR_PALETTE,
  FONT_OPTIONS,
  GRID_OPTIONS,
  MODE_LABELS,
  PEN_PATTERN_KEYS,
  PINYIN_KEYS,
  STROKE_NAMES,
} from "../lib/ui-data";
import {
  A4_HEIGHT_MM,
  BUILT_IN_FONT_FAMILIES,
  clampPageIndex,
  createWorksheet,
  getModeDefaults,
  loadStoredWorkspace,
  pagePngFilename,
  serializeWorkspace,
  WORKSPACE_KEY,
} from "../lib/worksheet";
import SiteHeader from "./SiteHeader";

type BusyAction = "png" | "zip" | "pdf" | "print" | null;
type DialogKind = "input" | "font" | "margins" | "stroke" | null;
type StatusMessage = { type: "info" | "success" | "error"; text: string } | null;

const FOUR_LINE_MODES = new Set<ExerciseMode>([
  "alphabet",
  "word",
  "enParagraph",
  "number",
  "pinyin",
]);
const CHINESE_GRID_MODES = new Set<ExerciseMode>([
  "hanzi",
  "phrase",
  "cnParagraph",
  "stroke",
]);
const PARAGRAPH_MODES = new Set<ExerciseMode>(["cnParagraph", "enParagraph"]);

export default function WorksheetApp({ initialMode = "hanzi" }: { initialMode?: ExerciseMode }) {
  const [settings, setSettings] = useState<WorksheetSettings>(() => getModeDefaults(initialMode));
  const [hydrated, setHydrated] = useState(false);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [inputDraft, setInputDraft] = useState("");
  const [strokeDraft, setStrokeDraft] = useState<StrokePracticeItem[]>([]);
  const [zoom, setZoom] = useState(100);
  const [currentPage, setCurrentPage] = useState(0);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportPage, setExportPage] = useState(0);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [status, setStatus] = useState<StatusMessage>(null);
  const [pageWarnings, setPageWarnings] = useState<Record<number, string[]>>({});
  const [activePinyinChoice, setActivePinyinChoice] = useState<string | null>(null);
  const [fontTab, setFontTab] = useState<"common" | "local">("common");
  const [fontQuerying, setFontQuerying] = useState(false);
  const [localFonts, setLocalFonts] = useState<FontDataLike[]>([]);
  const [fontSearch, setFontSearch] = useState("");
  const [printUrls, setPrintUrls] = useState<string[]>([]);
  const activeLocalFont = useRef<RegisteredLocalFont | null>(null);
  const printUrlsRef = useRef<string[]>([]);
  const printRequested = useRef(false);
  const pageElementsRef = useRef(new Map<number, HTMLDivElement>());
  const pageNavigationTargetRef = useRef<number | null>(null);
  const draftTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fontSearchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const stored = loadStoredWorkspace(window.localStorage.getItem(WORKSPACE_KEY));
    const restored =
      stored.settings.mode === initialMode ? stored.settings : getModeDefaults(initialMode);
    const frame = window.requestAnimationFrame(() => {
      setSettings(restored);
      setHydrated(true);
      if (restored.fontKey === "local" && restored.localFont) {
        setStatus({
          type: "info",
          text: `已记住“${restored.localFont.fullName}”，点击字体设置并重新授权即可恢复。`,
        });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [initialMode]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(WORKSPACE_KEY, serializeWorkspace(settings));
  }, [hydrated, settings]);

  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => setStatus(null), 4_500);
    return () => window.clearTimeout(timer);
  }, [status]);

  const cleanupPrintUrls = useCallback(() => {
    if (printUrlsRef.current.length) revokeObjectUrls(printUrlsRef.current);
    printUrlsRef.current = [];
    printRequested.current = false;
    setPrintUrls([]);
  }, []);

  useEffect(() => {
    const afterPrint = () => cleanupPrintUrls();
    window.addEventListener("afterprint", afterPrint);
    return () => {
      window.removeEventListener("afterprint", afterPrint);
      cleanupPrintUrls();
      activeLocalFont.current?.dispose();
      activeLocalFont.current = null;
    };
  }, [cleanupPrintUrls]);

  useEffect(() => {
    if (!dialog) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDialog(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [dialog]);

  useEffect(() => {
    if (dialog !== "font" || fontTab !== "local") return;
    const timer = window.setTimeout(() => fontSearchRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [dialog, fontTab]);

  const build = useMemo(() => createWorksheet(settings), [settings]);
  const pages = build.pages;
  const activePageIndex = clampPageIndex(currentPage, pages.length);
  const isFourLine = FOUR_LINE_MODES.has(settings.mode);
  const isParagraph = PARAGRAPH_MODES.has(settings.mode);
  const usesChineseGrid = CHINESE_GRID_MODES.has(settings.mode);
  const isPenControl = settings.mode === "penControl";
  const isStroke = settings.mode === "stroke";
  const templates = useMemo(
    () => getWorksheetTemplates(settings.mode),
    [settings.mode],
  );

  useEffect(() => {
    let frame = 0;
    let navigationEndTimer = 0;
    const commitClosestPage = () => {
      const viewportCenter = window.innerHeight / 2;
      let closestIndex = activePageIndex;
      let closestDistance = Number.POSITIVE_INFINITY;
      pageElementsRef.current.forEach((element, pageIndex) => {
        if (pageIndex >= pages.length) return;
        const bounds = element.getBoundingClientRect();
        const distance = Math.abs(bounds.top + bounds.height / 2 - viewportCenter);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = pageIndex;
        }
      });
      setCurrentPage((pageIndex) => pageIndex === closestIndex ? pageIndex : closestIndex);
    };
    const finishPageNavigation = () => {
      if (pageNavigationTargetRef.current === null) return;
      pageNavigationTargetRef.current = null;
      commitClosestPage();
    };
    const updateCurrentPage = () => {
      if (pageNavigationTargetRef.current !== null) {
        window.clearTimeout(navigationEndTimer);
        navigationEndTimer = window.setTimeout(finishPageNavigation, 120);
        return;
      }
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (pageNavigationTargetRef.current !== null) return;
        commitClosestPage();
      });
    };
    updateCurrentPage();
    window.addEventListener("scroll", updateCurrentPage, { passive: true });
    window.addEventListener("resize", updateCurrentPage);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(navigationEndTimer);
      window.removeEventListener("scroll", updateCurrentPage);
      window.removeEventListener("resize", updateCurrentPage);
    };
  }, [activePageIndex, pages.length, zoom]);

  const registerPageElement = useCallback((pageIndex: number, element: HTMLDivElement | null) => {
    if (element) pageElementsRef.current.set(pageIndex, element);
    else pageElementsRef.current.delete(pageIndex);
  }, []);

  const goToPage = useCallback((pageIndex: number) => {
    const nextPage = clampPageIndex(pageIndex, pages.length);
    const pageElement = pageElementsRef.current.get(nextPage);
    if (!pageElement) return;
    pageNavigationTargetRef.current = nextPage;
    pageElement.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [pages.length]);

  const toggleExportMenu = () => {
    if (!exportOpen) setExportPage(activePageIndex);
    setExportOpen((open) => !open);
  };

  const updateSettings = useCallback((patch: Partial<WorksheetSettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
    setActivePinyinChoice(null);
  }, []);

  const applyTemplate = useCallback((template: WorksheetTemplateOption) => {
    setSettings((current) => ({
      ...current,
      ...template.patch,
      mode: current.mode,
    }));
    setActivePinyinChoice(null);
    setStatus({ type: "success", text: `已应用“${template.label}”模板。` });
  }, []);

  const updateMargins = useCallback((side: keyof WorksheetSettings["pageMarginsPx"], value: number) => {
    setSettings((current) => ({
      ...current,
      pageMarginsPx: {
        ...current.pageMarginsPx,
        [side]: Math.max(0, Math.min(96, Number.isFinite(value) ? value : 36)),
      },
    }));
  }, []);

  const openInputDialog = () => {
    if (isStroke) {
      setStrokeDraft(settings.strokeItems.map((item) => ({ ...item })));
      setDialog("stroke");
      return;
    }
    setInputDraft(isPenControl ? settings.penPatterns : settings.input);
    setDialog("input");
  };

  const confirmInput = () => {
    const count = Array.from(inputDraft).length;
    if (count > build.inputLimit) return;
    if (isPenControl) {
      updateSettings({ input: inputDraft, penPatterns: inputDraft || "1" });
    } else {
      updateSettings({ input: inputDraft });
    }
    setDialog(null);
  };

  const confirmStrokes = () => {
    if (!strokeDraft.length || strokeDraft.length > 20) return;
    updateSettings({ strokeItems: strokeDraft });
    setDialog(null);
  };

  const insertPinyin = (character: string) => {
    const textarea = draftTextareaRef.current;
    if (!textarea) {
      setInputDraft((value) => value + character);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    setInputDraft((value) => value.slice(0, start) + character + value.slice(end));
    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + character.length, start + character.length);
    });
  };

  const togglePenPattern = (pattern: string) => {
    setInputDraft((current) => {
      const values = new Set(Array.from(current));
      if (values.has(pattern)) values.delete(pattern);
      else values.add(pattern);
      return Array.from(PEN_PATTERN_KEYS).filter((key) => values.has(key)).join("");
    });
  };

  const selectBuiltInFont = (fontKey: string) => {
    const option = FONT_OPTIONS.find((font) => font.value === fontKey);
    if (!option) return;
    activeLocalFont.current?.dispose();
    activeLocalFont.current = null;
    updateSettings({
      fontKey: option.value,
      fontFamily: option.family,
      localFont: null,
    });
    setDialog(null);
  };

  const applyLocalFont = async (font: FontDataLike, restored = false) => {
    try {
      const registered = await registerLocalFont(font);
      activeLocalFont.current?.dispose();
      activeLocalFont.current = registered;
      updateSettings({
        fontKey: "local",
        fontFamily: `"${registered.alias}", ${BUILT_IN_FONT_FAMILIES.kaiti}`,
        localFont: registered.selection,
      });
      setDialog(null);
      setStatus({
        type: "success",
        text: restored
          ? `已恢复本机字体“${font.fullName}”。`
          : `已加载“${font.fullName}”，预览、打印与导出会使用同一字体。`,
      });
    } catch {
      activeLocalFont.current?.dispose();
      activeLocalFont.current = null;
      updateSettings({
        fontKey: "kaiti",
        fontFamily: BUILT_IN_FONT_FAMILIES.kaiti,
        localFont: null,
      });
      setStatus({ type: "error", text: "字体已不可用，已回退到楷体。" });
    }
  };

  const authorizeLocalFonts = async () => {
    if (!supportsLocalFontAccess()) {
      setStatus({
        type: "error",
        text: "当前浏览器不支持本机字体授权，请使用桌面版 Chrome 或 Edge。",
      });
      return;
    }
    setFontQuerying(true);
    try {
      const fonts = await requestLocalFonts();
      setLocalFonts(fonts);
      if (settings.localFont) {
        const match = findMatchingLocalFont(fonts, settings.localFont);
        if (match) {
          await applyLocalFont(match, true);
          return;
        }
        activeLocalFont.current?.dispose();
        activeLocalFont.current = null;
        updateSettings({
          fontKey: "kaiti",
          fontFamily: BUILT_IN_FONT_FAMILIES.kaiti,
          localFont: null,
        });
        setStatus({ type: "error", text: "未找到之前使用的字体，已回退到楷体。" });
      }
    } catch (error) {
      const rejected = error instanceof DOMException && error.name === "NotAllowedError";
      setStatus({
        type: "error",
        text: rejected
          ? "你没有允许读取字体列表；字帖仍可继续使用内置字体。"
          : error instanceof Error
            ? error.message
            : "无法读取本机字体，已继续使用楷体。",
      });
      activeLocalFont.current?.dispose();
      activeLocalFont.current = null;
      updateSettings({
        fontKey: "kaiti",
        fontFamily: BUILT_IN_FONT_FAMILIES.kaiti,
        localFont: null,
      });
    } finally {
      setFontQuerying(false);
    }
  };

  const filteredFonts = useMemo(() => {
    const query = fontSearch.trim().toLocaleLowerCase();
    return localFonts
      .filter((font) =>
        query
          ? `${font.family} ${font.fullName} ${font.postscriptName}`
              .toLocaleLowerCase()
              .includes(query)
          : true,
      )
      .slice(0, 120);
  }, [fontSearch, localFonts]);

  const handlePinyinChange = useCallback((key: string, value: string) => {
    setSettings((current) => ({
      ...current,
      pinyinOverrides: { ...current.pinyinOverrides, [key]: value },
    }));
    setActivePinyinChoice(null);
  }, []);

  const handlePageWarnings = useCallback((pageIndex: number, warnings: string[]) => {
    setPageWarnings((current) => {
      if (JSON.stringify(current[pageIndex] ?? []) === JSON.stringify(warnings)) return current;
      return { ...current, [pageIndex]: warnings };
    });
  }, []);

  const handleCurrentPng = async () => {
    if (build.error) return;
    setBusy("png");
    setExportOpen(false);
    try {
      const index = clampPageIndex(exportPage, pages.length);
      const blob = await createPagePngBlob(pages[index], 300);
      downloadBlob(blob, pagePngFilename(index, pages.length));
      setStatus({ type: "success", text: `第 ${index + 1} 页已按 300 DPI 生成 PNG。` });
    } catch {
      setStatus({ type: "error", text: "PNG 生成失败，请稍后重试。" });
    } finally {
      setBusy(null);
    }
  };

  const handleAllPng = async () => {
    if (build.error) return;
    setBusy("zip");
    setExportOpen(false);
    try {
      const blob = await createPagesZipBlob(pages, (current, total) => {
        setStatus({ type: "info", text: `正在生成第 ${current}/${total} 页 PNG…` });
      });
      downloadBlob(blob, "zitie-pages.zip");
      setStatus({ type: "success", text: "全部页面已打包为 ZIP。" });
    } catch {
      setStatus({ type: "error", text: "ZIP 生成失败，请稍后重试。" });
    } finally {
      setBusy(null);
    }
  };

  const handlePdf = async () => {
    if (build.error) return;
    setBusy("pdf");
    setExportOpen(false);
    try {
      const blob = await createPagesPdfBlob(pages, (current, total) => {
        setStatus({ type: "info", text: `正在生成第 ${current}/${total} 页 PDF…` });
      });
      downloadBlob(blob, "zitie.pdf");
      setStatus({ type: "success", text: "PDF 已生成。" });
    } catch {
      setStatus({ type: "error", text: "PDF 生成失败，请稍后重试。" });
    } finally {
      setBusy(null);
    }
  };

  const handlePrint = async () => {
    if (build.error || busy) return;
    cleanupPrintUrls();
    setBusy("print");
    setStatus({ type: "info", text: "正在准备 A4 打印页面…" });
    try {
      const urls = await createPrintPageUrls(pages, 144);
      printUrlsRef.current = urls;
      printRequested.current = true;
      setPrintUrls(urls);
    } catch {
      setBusy(null);
      setStatus({ type: "error", text: "打印页面准备失败，请稍后重试。" });
    }
  };

  const handlePrintReady = useCallback(() => {
    if (!printRequested.current) return;
    printRequested.current = false;
    setBusy(null);
    setStatus(null);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => window.print());
    });
  }, []);

  const fontLabel = settings.localFont?.fullName
    ?? FONT_OPTIONS.find((font) => font.value === settings.fontKey)?.label
    ?? "楷体";
  const inputSummary = isStroke
    ? settings.strokeItems.map((item) => STROKE_NAMES[item.strokeIndex]).join("、")
    : isPenControl
      ? settings.penPatterns
      : settings.input;
  const allWarnings = Array.from(new Set(
    Object.entries(pageWarnings)
      .filter(([index]) => Number(index) < pages.length)
      .flatMap(([, warnings]) => warnings),
  ));
  const inputDraftCount = Array.from(inputDraft).length;
  const inputDraftTooLong = inputDraftCount > build.inputLimit;

  return (
    <>
      <div className="worksheet-page">
        <SiteHeader activeMode={settings.mode} />
        <main className="worksheet-shell">
          <section className="preview-column" aria-label="A4 字帖预览">
            <div className="mobile-quick-editor">
              <div className="mobile-workspace-note">
                <Info size={17} />
                <span>手机端可编辑内容并查看预览；完整设置、导出和打印请使用电脑浏览器。</span>
              </div>
              <ContentEditorButton
                inputCount={build.inputCount}
                inputLimit={build.inputLimit}
                inputSummary={inputSummary}
                isPenControl={isPenControl}
                isStroke={isStroke}
                onClick={openInputDialog}
              />
            </div>
            <div className="paper-stack">
              {pages.map((page) => (
                <WorksheetCanvas
                  key={`${page.index}-${settings.fontFamily}`}
                  page={page}
                  zoom={zoom}
                  activePinyinChoice={activePinyinChoice}
                  onTogglePinyinChoice={setActivePinyinChoice}
                  onPinyinChange={handlePinyinChange}
                  onWarnings={handlePageWarnings}
                  onElementRef={registerPageElement}
                />
              ))}
            </div>
            <div className="zoom-toolbar" aria-label="预览缩放">
              <button type="button" aria-label="缩小" onClick={() => setZoom((value) => Math.max(70, value - 10))} disabled={zoom <= 70}>
                <Minus size={15} />
              </button>
              <span>{zoom}%</span>
              <button type="button" aria-label="放大" onClick={() => setZoom((value) => Math.min(120, value + 10))} disabled={zoom >= 120}>
                <Plus size={15} />
              </button>
              <div className="zoom-toolbar__page-nav">
                <button type="button" aria-label="上一页" onClick={() => goToPage(activePageIndex - 1)} disabled={activePageIndex <= 0}>
                  <CaretLeft size={14} />
                </button>
                <small aria-live="polite">{activePageIndex + 1} / {pages.length} 页</small>
                <button type="button" aria-label="下一页" onClick={() => goToPage(activePageIndex + 1)} disabled={activePageIndex >= pages.length - 1}>
                  <CaretRight size={14} />
                </button>
              </div>
            </div>
            {allWarnings.length > 0 && (
              <div className="render-warning" role="status">
                <WarningCircle size={15} />
                {allWarnings[0]}
              </div>
            )}
          </section>

          <aside className="settings-sidebar" aria-label="字帖设置">
            <div className="action-row">
              <div className="export-wrap">
                <button className="toolbar-button" type="button" onClick={toggleExportMenu} disabled={!!busy || !!build.error}>
                  <DownloadSimple size={18} />
                  {busy && busy !== "print" ? "生成中" : "导出"}
                  <CaretDown size={14} weight="bold" />
                </button>
                {exportOpen && (
                  <div className="export-menu">
                    <button type="button" onClick={handlePdf}><FilePdf size={18} /><span><strong>导出为 PDF</strong><small>全部 A4 页面</small></span></button>
                    <button type="button" onClick={handleCurrentPng}><ImageSquare size={18} /><span><strong>当前页 PNG</strong><small>第 {clampPageIndex(exportPage, pages.length) + 1}/{pages.length} 页 · 2480 × 3508</small></span></button>
                    <button type="button" onClick={handleAllPng}><Images size={18} /><span><strong>全部 PNG</strong><small>下载 ZIP 压缩包</small></span></button>
                  </div>
                )}
              </div>
              <button className="toolbar-button toolbar-button--dark" type="button" onClick={handlePrint} disabled={!!busy || !!build.error}>
                <Printer size={18} />
                {busy === "print" ? "准备中" : "打印"}
              </button>
            </div>

            <section className="common-settings-group" aria-label="常用设置">
              <ContentEditorButton
                inputCount={build.inputCount}
                inputLimit={build.inputLimit}
                inputSummary={inputSummary}
                isPenControl={isPenControl}
                isStroke={isStroke}
                onClick={openInputDialog}
              />
              {build.error && <p className="sidebar-error"><WarningCircle size={14} />{build.error}</p>}

              <SettingsCard className="template-card" title="快捷模板">
                <div className="template-list" role="group" aria-label={`${MODE_LABELS[settings.mode]}快捷模板`}>
                  {templates.map((template) => (
                    <button key={template.id} type="button" onClick={() => applyTemplate(template)}>
                      <strong>{template.label}</strong>
                      <small>{template.description}</small>
                    </button>
                  ))}
                </div>
              </SettingsCard>

              <SettingsCard className="settings-common-card" title="常用设置">
                {settings.mode === "hanzi" && (
                  <ToggleRow label="显示笔顺" checked={settings.showStrokeOrder} onChange={(showStrokeOrder) => updateSettings({ showStrokeOrder })} />
                )}
                {(settings.mode === "hanzi" || settings.mode === "phrase") && (
                  <ToggleRow label="显示拼音" checked={settings.showPinyin} onChange={(showPinyin) => updateSettings({ showPinyin })} />
                )}
                {!isParagraph && !isPenControl && (
                  <ToggleRow label="首字高亮" checked={settings.highlightFirst} onChange={(highlightFirst) => updateSettings({ highlightFirst })} />
                )}
                {settings.mode === "alphabet" && (
                  <ToggleRow label="大小写成对" checked={settings.pairedCase} onChange={(pairedCase) => updateSettings({ pairedCase })} />
                )}
                {usesChineseGrid && !isFourLine && !isPenControl && (
                  <SelectRow label="方格类型" value={settings.gridStyle} onChange={(value) => updateSettings({ gridStyle: value as WorksheetSettings["gridStyle"] })}>
                    {isParagraph && <option value="horizontal">横线格</option>}
                    {GRID_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </SelectRow>
                )}
                <SliderRow label={isFourLine ? "行格" : "方格大小"} value={settings.cellSizeMm} min={6} max={20} step={1} suffix="mm" onChange={(cellSizeMm) => updateSettings({ cellSizeMm })} />
                {!isPenControl && (
                  <>
                    <button className="setting-button-row" type="button" onClick={() => { setDialog("font"); setFontTab("common"); }}>
                      <span>{isStroke ? "示例字体" : "字体"}</span>
                      <strong className="truncate">{fontLabel}</strong>
                      <CaretDown size={14} weight="bold" />
                    </button>
                    <SliderRow label="字体大小" value={settings.fontSizePercent} min={48} max={128} step={1} suffix="%" onChange={(fontSizePercent) => updateSettings({ fontSizePercent })} />
                  </>
                )}
                <SliderRow label="描红数量" value={settings.traceCount} min={0} max={20} step={1} suffix="" onChange={(traceCount) => updateSettings({ traceCount })} />
              </SettingsCard>
            </section>

            <details className="advanced-settings">
              <summary>
                <span>高级设置</span>
                <small>页边距、颜色与细节</small>
                <CaretDown size={15} weight="bold" />
              </summary>
              <div className="advanced-settings__content">
                <SettingsCard title="练习细节">
                  <ToggleRow label="插入空行" checked={settings.insertEmptyRow} onChange={(insertEmptyRow) => updateSettings({ insertEmptyRow })} />
                  {!isParagraph && !isFourLine && !isPenControl && (
                    <ToggleRow label="插入空列" checked={settings.insertEmptyColumn} onChange={(insertEmptyColumn) => updateSettings({ insertEmptyColumn })} />
                  )}
                </SettingsCard>

                <SettingsCard title="页面版式">
                  <SliderRow label="行间距" value={settings.rowGapMm} min={0} max={8} step={1} suffix="mm" onChange={(rowGapMm) => updateSettings({ rowGapMm })} />
                  <button className="setting-button-row" type="button" onClick={() => setDialog("margins")}>
                    <span>页边距</span>
                    <strong>{Object.values(settings.pageMarginsPx).join(", ")}</strong>
                    <CaretDown size={14} weight="bold" />
                  </button>
                </SettingsCard>

                {!isPenControl && (
                  <SettingsCard title="文字细节">
                    <SelectRow label="字体粗细" value={settings.fontWeight} onChange={(value) => updateSettings({ fontWeight: value as WorksheetSettings["fontWeight"] })}>
                      <option value="normal">常规</option>
                      <option value="bold">加粗</option>
                    </SelectRow>
                    <SliderRow label="上下偏移" value={settings.verticalOffsetPercent} min={-50} max={50} step={1} suffix="%" onChange={(verticalOffsetPercent) => updateSettings({ verticalOffsetPercent })} />
                  </SettingsCard>
                )}

                <SettingsCard title={isPenControl ? "描红与方格" : "描红与线条"}>
                  {isPenControl && (
                    <SelectRow label="描红粗细" value={settings.penStrokeWeight} onChange={(value) => updateSettings({ penStrokeWeight: value as WorksheetSettings["penStrokeWeight"] })}>
                      <option value="normal">常规</option>
                      <option value="bold">加粗</option>
                    </SelectRow>
                  )}
                  <ColorRow label="描红颜色" value={settings.traceColor} onChange={(traceColor) => updateSettings({ traceColor })} />
                  <ColorRow label={isPenControl ? "方格颜色" : "线条颜色"} value={settings.lineColor} onChange={(lineColor) => updateSettings({ lineColor })} />
                </SettingsCard>
              </div>
            </details>
          </aside>
        </main>
      </div>

      {status && <Toast message={status} onClose={() => setStatus(null)} />}

      {dialog === "input" && (
        <Dialog title={isPenControl ? "控笔图案" : "输入内容"} subtitle={isPenControl ? "选择需要练习的控笔图案" : settings.mode === "pinyin" ? "请输入拼音，点击可快速输入带声调韵母" : `编辑${MODE_LABELS[settings.mode]}内容`} onClose={() => setDialog(null)}>
          {isPenControl ? (
            <div className="pen-pattern-picker">
              {Array.from(PEN_PATTERN_KEYS).map((pattern) => (
                <button
                  key={pattern}
                  type="button"
                  className={inputDraft.includes(pattern) ? "is-selected" : ""}
                  aria-pressed={inputDraft.includes(pattern)}
                  onClick={() => togglePenPattern(pattern)}
                  style={{ fontFamily: BUILT_IN_FONT_FAMILIES.penControl }}
                >
                  {pattern}
                </button>
              ))}
            </div>
          ) : (
            <>
              {settings.mode === "pinyin" && (
                <div className="pinyin-quick-keys">
                  {PINYIN_KEYS.map((character) => <button key={character} type="button" onClick={() => insertPinyin(character)}>{character}</button>)}
                </div>
              )}
              <textarea ref={draftTextareaRef} className="dialog-textarea" value={inputDraft} onChange={(event) => setInputDraft(event.target.value)} autoFocus rows={settings.mode === "pinyin" ? 10 : 8} />
            </>
          )}
          <div className="dialog-meta">
            <span className={inputDraftTooLong ? "is-error" : ""}>{inputDraftCount}/{build.inputLimit}</span>
            {inputDraftTooLong && <strong>内容超出上限，请删减后再确定。</strong>}
          </div>
          <DialogActions onCancel={() => setDialog(null)} onConfirm={confirmInput} confirmDisabled={inputDraftTooLong || !inputDraft.length} />
        </Dialog>
      )}

      {dialog === "stroke" && (
        <Dialog title="笔画输入" subtitle="请选择需要练习的笔画，并可填写例字" onClose={() => setDialog(null)} wide>
          <div className="stroke-editor">
            {strokeDraft.map((item, index) => (
              <div className="stroke-editor__row" key={`${index}-${item.strokeIndex}`}>
                <span className="stroke-editor__select">
                  <select value={item.strokeIndex} onChange={(event) => setStrokeDraft((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, strokeIndex: Number(event.target.value) } : entry))}>
                    {STROKE_NAMES.map((name, strokeIndex) => <option key={`${name}-${strokeIndex}`} value={strokeIndex}>{name}</option>)}
                  </select>
                  <CaretDown size={15} weight="bold" />
                </span>
                <span className="stroke-glyph" style={{ fontFamily: BUILT_IN_FONT_FAMILIES.bihua }}>{String.fromCodePoint(0xe900 + item.strokeIndex)}</span>
                <input value={item.example} maxLength={4} placeholder="例字" onChange={(event) => setStrokeDraft((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, example: event.target.value } : entry))} />
                <button type="button" aria-label="删除此笔画" onClick={() => setStrokeDraft((current) => current.filter((_, entryIndex) => entryIndex !== index))}><Trash size={17} /></button>
              </div>
            ))}
          </div>
          <button className="add-stroke-button" type="button" disabled={strokeDraft.length >= 20} onClick={() => setStrokeDraft((current) => [...current, { strokeIndex: 0, example: "" }])}><Plus size={16} />添加笔画</button>
          <DialogActions onCancel={() => setDialog(null)} onConfirm={confirmStrokes} confirmDisabled={!strokeDraft.length || strokeDraft.length > 20} />
        </Dialog>
      )}

      {dialog === "font" && (
        <Dialog title="选择字体" subtitle="常用字体可直接使用；系统字体需在浏览器中授权读取" onClose={() => setDialog(null)} wide>
          <div className="font-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={fontTab === "common"} className={fontTab === "common" ? "is-active" : ""} onClick={() => setFontTab("common")}>常用字体</button>
            <button type="button" role="tab" aria-selected={fontTab === "local"} className={fontTab === "local" ? "is-active" : ""} onClick={() => setFontTab("local")}>本机字体</button>
          </div>
          {fontTab === "common" ? (
            <div className="common-fonts">
              {FONT_OPTIONS.map((font) => (
                <button key={font.value} type="button" className={settings.fontKey === font.value ? "is-selected" : ""} onClick={() => selectBuiltInFont(font.value)}>
                  <span><strong>{font.label}</strong><small>{font.value}</small></span>
                  <em style={{ fontFamily: font.family }}>春风又绿江南岸 Aa 123</em>
                  {settings.fontKey === font.value && <Check size={17} weight="bold" />}
                </button>
              ))}
            </div>
          ) : (
            <div className="local-font-panel">
              {localFonts.length === 0 ? (
                <div className="local-font-empty">
                  <strong>{supportsLocalFontAccess() ? "授权读取本机字体" : "当前浏览器不支持本机字体访问"}</strong>
                  <p>{supportsLocalFontAccess() ? "浏览器会显示权限请求，只有点击下方按钮后才会读取字体列表。" : "请使用桌面版 Chrome 或 Edge，字帖仍可使用内置字体。"}</p>
                  {supportsLocalFontAccess() && <button type="button" onClick={authorizeLocalFonts} disabled={fontQuerying}>{fontQuerying ? "等待授权…" : "授权加载本机字体"}</button>}
                </div>
              ) : (
                <>
                  <label className="font-search"><MagnifyingGlass size={17} /><input ref={fontSearchRef} value={fontSearch} onChange={(event) => setFontSearch(event.target.value)} placeholder="搜索字体名称" /></label>
                  <div className="local-font-list">
                    {filteredFonts.map((font) => (
                      <button key={`${font.postscriptName}-${font.style}`} type="button" onClick={() => applyLocalFont(font)}>
                        <span><strong>{font.fullName}</strong><small>{font.family} · {font.style || "Regular"}</small></span>
                        <em style={{ fontFamily: `"${font.family}", serif` }}>春风又绿江南岸 Aa 123</em>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </Dialog>
      )}

      {dialog === "margins" && (
        <Dialog title="页边距" subtitle="分别设置 A4 页面的上、右、下、左边距（px）" onClose={() => setDialog(null)}>
          <div className="margin-grid">
            {(["top", "right", "bottom", "left"] as const).map((side) => (
              <label key={side}><span>{{ top: "上", right: "右", bottom: "下", left: "左" }[side]}</span><input type="number" min={0} max={96} value={settings.pageMarginsPx[side]} onChange={(event) => updateMargins(side, Number(event.target.value))} /></label>
            ))}
          </div>
          <DialogActions onCancel={() => setDialog(null)} onConfirm={() => setDialog(null)} />
        </Dialog>
      )}

      <PrintLayer urls={printUrls} onReady={handlePrintReady} />
    </>
  );
}

function WorksheetCanvas({
  page,
  zoom,
  activePinyinChoice,
  onTogglePinyinChoice,
  onPinyinChange,
  onWarnings,
  onElementRef,
}: {
  page: WorksheetPage;
  zoom: number;
  activePinyinChoice: string | null;
  onTogglePinyinChoice: (key: string | null) => void;
  onPinyinChange: (key: string, value: string) => void;
  onWarnings: (pageIndex: number, warnings: string[]) => void;
  onElementRef: (pageIndex: number, element: HTMLDivElement | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [rendering, setRendering] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    setRendering(true);
    renderWorksheetPage(canvas, page, 96)
      .then((warnings) => {
        if (!cancelled) onWarnings(page.index, warnings);
      })
      .catch(() => {
        if (!cancelled) onWarnings(page.index, ["预览绘制失败，请刷新页面重试。"]);
      })
      .finally(() => {
        if (!cancelled) setRendering(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, onWarnings]);

  return (
    <div
      ref={(element) => onElementRef(page.index, element)}
      className="paper-frame"
      style={{ width: `${(794 * zoom) / 100}px` }}
    >
      <canvas ref={canvasRef} className="worksheet-canvas" aria-label={`A4 字帖第 ${page.index + 1} 页`} />
      {page.pinyinControls.map((control) => {
        const controlKey = `${page.index}:${control.key}`;
        const open = activePinyinChoice === controlKey;
        return (
          <div className="pinyin-choice" key={controlKey} style={{ top: `${(control.y / A4_HEIGHT_MM) * 100}%` }}>
            <button type="button" aria-label={`切换“${control.character}”的拼音`} aria-expanded={open} onClick={() => onTogglePinyinChoice(open ? null : controlKey)}><CaretDown size={13} /></button>
            {open && (
              <div className="pinyin-choice__menu">
                <strong>{control.character}</strong>
                {control.options.map((option) => <button key={option} type="button" className={option === control.selected ? "is-active" : ""} onClick={() => onPinyinChange(control.key, option)}>{option}</button>)}
              </div>
            )}
          </div>
        );
      })}
      {rendering && <div className="canvas-loading"><span />正在生成字帖预览…</div>}
      <span className="paper-number">{page.index + 1} / {page.total}</span>
    </div>
  );
}

function PrintLayer({ urls, onReady }: { urls: string[]; onReady: () => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!urls.length) return;
    const images = Array.from(containerRef.current?.querySelectorAll("img") ?? []);
    if (images.length !== urls.length) return;
    const loaded = new Set<HTMLImageElement>();
    const markLoaded = (image: HTMLImageElement) => {
      if (!image.naturalWidth) return;
      loaded.add(image);
      if (loaded.size === images.length) onReady();
    };
    const listeners = images.map((image) => {
      const listener = () => markLoaded(image);
      image.addEventListener("load", listener);
      if (image.complete) markLoaded(image);
      return { image, listener };
    });
    return () => listeners.forEach(({ image, listener }) => image.removeEventListener("load", listener));
  }, [urls, onReady]);

  return (
    <div className="print-layer" ref={containerRef} aria-hidden="true">
      {urls.map((url, index) => (
        // 打印层使用运行时 Blob URL，不能交给图片优化器处理。
        // eslint-disable-next-line @next/next/no-img-element
        <img key={url} src={url} alt="" data-page={index + 1} />
      ))}
    </div>
  );
}

function ContentEditorButton({
  inputCount,
  inputLimit,
  inputSummary,
  isPenControl,
  isStroke,
  onClick,
}: {
  inputCount: number;
  inputLimit: number;
  inputSummary: string;
  isPenControl: boolean;
  isStroke: boolean;
  onClick: () => void;
}) {
  return (
    <button className="content-card" type="button" onClick={onClick}>
      <span>{isStroke ? "点击输入笔画和例字" : isPenControl ? "点击选择控笔图案" : "点击编辑练习内容"}</span>
      <strong
        className={isPenControl ? "content-card__patterns" : undefined}
        aria-label={isPenControl ? "已选择控笔图案" : undefined}
      >
        {inputSummary || "暂无内容"}
      </strong>
      <small>{inputCount}/{inputLimit}</small>
    </button>
  );
}

function SettingsCard({
  title,
  className,
  children,
}: {
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`settings-card${title ? " settings-card--titled" : ""}${className ? ` ${className}` : ""}`}>
      {title && <h2 className="settings-card__title">{title}</h2>}
      {children}
    </section>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="toggle-switch" aria-hidden="true"><span /></span>
    </label>
  );
}

function SliderRow({ label, value, min, max, step, suffix, onChange }: { label: string; value: number; min: number; max: number; step: number; suffix: string; onChange: (value: number) => void }) {
  return (
    <label className="slider-row">
      <span>{label}</span>
      <input type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} />
      <strong>{value}{suffix}</strong>
    </label>
  );
}

function SelectRow({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <label className="select-row">
      <span>{label}</span>
      <span className="select-row__control">
        <select value={value} onChange={(event) => onChange(event.target.value)}>{children}</select>
        <CaretDown className="select-row__icon" size={14} weight="bold" />
      </span>
    </label>
  );
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="color-row">
      <span>{label}</span>
      <button type="button" aria-label={`选择${label}`} aria-expanded={open} className="color-swatch" style={{ backgroundColor: value }} onClick={() => setOpen((current) => !current)} />
      {open && (
        <div className="color-popover">
          {COLOR_PALETTE.map((color) => <button key={color} type="button" aria-label={color} className={color === value ? "is-active" : ""} style={{ backgroundColor: color }} onClick={() => { onChange(color); setOpen(false); }}>{color === value && <Check size={11} weight="bold" />}</button>)}
        </div>
      )}
    </div>
  );
}

function Dialog({ title, subtitle, onClose, wide = false, children }: { title: string; subtitle: string; onClose: () => void; wide?: boolean; children: ReactNode }) {
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`dialog${wide ? " dialog--wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <header><div><h2 id="dialog-title">{title}</h2><p>{subtitle}</p></div><button type="button" aria-label="关闭" onClick={onClose}><X size={20} /></button></header>
        <div className="dialog-body">{children}</div>
      </section>
    </div>
  );
}

function DialogActions({ onCancel, onConfirm, confirmDisabled = false }: { onCancel: () => void; onConfirm: () => void; confirmDisabled?: boolean }) {
  return <div className="dialog-actions"><button type="button" onClick={onCancel}>取消</button><button type="button" className="dialog-confirm" onClick={onConfirm} disabled={confirmDisabled}>确定</button></div>;
}

function Toast({ message, onClose }: { message: Exclude<StatusMessage, null>; onClose: () => void }) {
  const Icon = message.type === "error" ? WarningCircle : message.type === "success" ? Check : Info;
  return <div className={`toast toast--${message.type}`} role="status"><Icon size={17} weight="bold" /><span>{message.text}</span><button type="button" aria-label="关闭提示" onClick={onClose}><X size={15} /></button></div>;
}
