import type { LocalFontSelection } from "./types";

export interface FontDataLike extends LocalFontSelection {
  blob(): Promise<Blob>;
}

declare global {
  interface Window {
    queryLocalFonts?: () => Promise<FontDataLike[]>;
  }
}

export interface RegisteredLocalFont {
  alias: string;
  selection: LocalFontSelection;
  dispose: () => void;
}

export function supportsLocalFontAccess(): boolean {
  return typeof window !== "undefined" && typeof window.queryLocalFonts === "function";
}

export async function requestLocalFonts(): Promise<FontDataLike[]> {
  if (!supportsLocalFontAccess() || !window.queryLocalFonts) {
    throw new Error("当前浏览器不支持加载本机字体，请使用桌面版 Chrome 或 Edge。");
  }
  const fonts = await window.queryLocalFonts();
  return [...fonts].sort((a, b) =>
    `${a.family}${a.fullName}`.localeCompare(`${b.family}${b.fullName}`, "zh-CN"),
  );
}

export function findMatchingLocalFont(
  fonts: FontDataLike[],
  saved: LocalFontSelection,
): FontDataLike | undefined {
  return (
    fonts.find((font) => font.postscriptName === saved.postscriptName) ??
    fonts.find(
      (font) =>
        font.family === saved.family &&
        font.fullName === saved.fullName &&
        font.style === saved.style,
    )
  );
}

export async function registerLocalFont(
  font: FontDataLike,
): Promise<RegisteredLocalFont> {
  const blob = await font.blob();
  const objectUrl = URL.createObjectURL(blob);
  const safeName = font.postscriptName.replace(/[^a-zA-Z0-9_-]/g, "_");
  const alias = `OnlineZitieLocal_${safeName}_${Date.now().toString(36)}`;
  const face = new FontFace(alias, `url(${objectUrl})`, {
    style: font.style || "normal",
  });

  try {
    await face.load();
    document.fonts.add(face);
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }

  let disposed = false;
  return {
    alias,
    selection: {
      postscriptName: font.postscriptName,
      family: font.family,
      fullName: font.fullName,
      style: font.style,
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      document.fonts.delete(face);
      URL.revokeObjectURL(objectUrl);
    },
  };
}
