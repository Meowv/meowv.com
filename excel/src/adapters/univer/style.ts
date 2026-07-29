import type {
  BooleanNumber,
  BorderStyleTypes,
  HorizontalAlign,
  IBorderStyleData,
  IStyleData,
  VerticalAlign,
  WrapStrategy,
} from "@univerjs/presets";

import type {
  NormalizedBorderSide,
  NormalizedBorderStyle,
  NormalizedCellBorders,
  NormalizedCellStyle,
  NormalizedHorizontalAlignment,
  NormalizedVerticalAlignment,
} from "../../types/normalized-workbook";

const FALSE = 0 as BooleanNumber;
const TRUE = 1 as BooleanNumber;

function normalizedBorderStyle(value: number): NormalizedBorderStyle | undefined {
  switch (value) {
    case 1:
      return "thin";
    case 2:
      return "hair";
    case 3:
      return "dotted";
    case 4:
    case 9:
      return "dashed";
    case 5:
    case 10:
    case 12:
      return "dashDot";
    case 6:
    case 11:
      return "dashDotDot";
    case 7:
      return "double";
    case 8:
      return "medium";
    case 13:
      return "thick";
    default:
      return undefined;
  }
}

function univerBorderStyle(value: NormalizedBorderStyle): BorderStyleTypes {
  switch (value) {
    case "thin":
      return 1 as BorderStyleTypes;
    case "hair":
      return 2 as BorderStyleTypes;
    case "dotted":
      return 3 as BorderStyleTypes;
    case "dashed":
      return 4 as BorderStyleTypes;
    case "dashDot":
      return 5 as BorderStyleTypes;
    case "dashDotDot":
      return 6 as BorderStyleTypes;
    case "double":
      return 7 as BorderStyleTypes;
    case "medium":
      return 8 as BorderStyleTypes;
    case "thick":
      return 13 as BorderStyleTypes;
  }
}

function normalizeColor(
  color: { rgb?: string | null | void } | null | undefined | void,
): string | undefined {
  return typeof color?.rgb === "string" ? color.rgb : undefined;
}

function normalizeBorder(
  value: IBorderStyleData | null | undefined | void,
): NormalizedBorderSide | undefined {
  if (!value) {
    return undefined;
  }
  const style = normalizedBorderStyle(value.s);
  return style ? { style, color: normalizeColor(value.cl) } : undefined;
}

function normalizeHorizontalAlignment(
  value: number | null | undefined | void,
): NormalizedHorizontalAlignment | undefined {
  switch (value) {
    case 1:
      return "left";
    case 2:
      return "center";
    case 3:
      return "right";
    case 4:
    case 5:
      return "justify";
    case 6:
      return "distributed";
    default:
      return undefined;
  }
}

function normalizeVerticalAlignment(
  value: number | null | undefined | void,
): NormalizedVerticalAlignment | undefined {
  switch (value) {
    case 1:
      return "top";
    case 2:
      return "middle";
    case 3:
      return "bottom";
    default:
      return undefined;
  }
}

export function univerStyleToNormalized(style: IStyleData | null | undefined | void): {
  style?: NormalizedCellStyle;
  numberFormat?: string;
} {
  if (!style) {
    return {};
  }

  const borders: NormalizedCellBorders = {
    top: normalizeBorder(style.bd?.t),
    right: normalizeBorder(style.bd?.r),
    bottom: normalizeBorder(style.bd?.b),
    left: normalizeBorder(style.bd?.l),
  };
  const normalized: NormalizedCellStyle = {
    font:
      style.ff ||
      style.fs !== undefined ||
      style.bl !== undefined ||
      style.it !== undefined ||
      style.ul !== undefined ||
      style.st !== undefined ||
      style.cl !== undefined
        ? {
            family: style.ff ?? undefined,
            size: style.fs,
            bold: style.bl === 1,
            italic: style.it === 1,
            underline: style.ul?.s === 1,
            strike: style.st?.s === 1,
            color: normalizeColor(style.cl),
          }
        : undefined,
    fillColor: normalizeColor(style.bg),
    horizontalAlignment: normalizeHorizontalAlignment(style.ht),
    verticalAlignment: normalizeVerticalAlignment(style.vt),
    wrapText: style.tb === 3 ? true : style.tb === 1 || style.tb === 2 ? false : undefined,
    textRotation: style.tr?.a,
    borders: Object.values(borders).some(Boolean) ? borders : undefined,
  };

  return {
    style: Object.values(normalized).some((value) => value !== undefined) ? normalized : undefined,
    numberFormat: style.n?.pattern,
  };
}

function univerHorizontalAlignment(
  value: NormalizedHorizontalAlignment | undefined,
): HorizontalAlign | undefined {
  switch (value) {
    case "left":
      return 1 as HorizontalAlign;
    case "center":
      return 2 as HorizontalAlign;
    case "right":
      return 3 as HorizontalAlign;
    case "justify":
      return 4 as HorizontalAlign;
    case "distributed":
      return 6 as HorizontalAlign;
    default:
      return undefined;
  }
}

function univerVerticalAlignment(
  value: NormalizedVerticalAlignment | undefined,
): VerticalAlign | undefined {
  switch (value) {
    case "top":
      return 1 as VerticalAlign;
    case "middle":
      return 2 as VerticalAlign;
    case "bottom":
      return 3 as VerticalAlign;
    default:
      return undefined;
  }
}

function univerBorder(side: NormalizedBorderSide | undefined): IBorderStyleData | undefined {
  if (!side) {
    return undefined;
  }

  return {
    s: univerBorderStyle(side.style),
    cl: { rgb: side.color ?? "#000000" },
  };
}

export function normalizedStyleToUniver(
  style: NormalizedCellStyle | undefined,
  numberFormat: string | undefined,
): IStyleData | undefined {
  if (!style && !numberFormat) {
    return undefined;
  }

  const result: IStyleData = {};
  if (style?.font) {
    result.ff = style.font.family;
    result.fs = style.font.size;
    result.bl = style.font.bold === undefined ? undefined : style.font.bold ? TRUE : FALSE;
    result.it = style.font.italic === undefined ? undefined : style.font.italic ? TRUE : FALSE;
    result.ul =
      style.font.underline === undefined
        ? undefined
        : {
            s: style.font.underline ? TRUE : FALSE,
          };
    result.st =
      style.font.strike === undefined
        ? undefined
        : {
            s: style.font.strike ? TRUE : FALSE,
          };
    result.cl = style.font.color ? { rgb: style.font.color } : undefined;
  }
  result.bg = style?.fillColor ? { rgb: style.fillColor } : undefined;
  result.ht = univerHorizontalAlignment(style?.horizontalAlignment);
  result.vt = univerVerticalAlignment(style?.verticalAlignment);
  result.tb =
    style?.wrapText === undefined ? undefined : ((style.wrapText ? 3 : 1) as WrapStrategy);
  result.tr = style?.textRotation === undefined ? undefined : { a: style.textRotation, v: FALSE };
  if (style?.borders) {
    result.bd = {
      t: univerBorder(style.borders.top),
      r: univerBorder(style.borders.right),
      b: univerBorder(style.borders.bottom),
      l: univerBorder(style.borders.left),
    };
  }
  result.n = numberFormat ? { pattern: numberFormat } : undefined;
  return result;
}
