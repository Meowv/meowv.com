import type { CSSProperties, ReactNode, SVGAttributes } from 'react';

type IconProps = Omit<SVGAttributes<SVGSVGElement>, 'children'> & {
  size?: number;
  weight?: 'light' | 'regular' | 'bold' | 'fill';
};

type IconContent = ReactNode | ((filled: boolean) => ReactNode);

/**
 * 轻量级界面图标：使用统一 SVG 视图盒与描边规则，避免字体图标在不同设备上的字形、基线不一致。
 * 所有图标均为装饰性元素，按钮和链接本身提供了可访问的文字或 aria-label。
 */
function createIcon(content: IconContent) {
  return function Icon({ size = 16, weight = 'regular', className, style, ...props }: IconProps) {
    const iconStyle: CSSProperties = {
      display: 'block',
      width: size,
      height: size,
      flex: '0 0 auto',
      ...style,
    };
    const strokeWidth = weight === 'light' ? 1.45 : weight === 'bold' ? 2.15 : 1.8;
    const filled = weight === 'fill';
    const iconContent = typeof content === 'function' ? content(filled) : content;

    return (
      <svg
        {...props}
        aria-hidden="true"
        className={`ui-icon${className ? ` ${className}` : ''}`}
        fill="none"
        focusable="false"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        style={iconStyle}
        viewBox="0 0 24 24"
      >
        {iconContent}
      </svg>
    );
  };
}

export const ArrowRight = createIcon(
  <>
    <path d="M5 12h14" />
    <path d="m13 6 6 6-6 6" />
  </>,
);
export const CaretDown = createIcon(<path d="m7 9.5 5 5 5-5" />);
export const CaretLeft = createIcon(<path d="m14.5 5.5-6.5 6.5 6.5 6.5" />);
export const CaretRight = createIcon(<path d="m9.5 5.5 6.5 6.5-6.5 6.5" />);
export const Check = createIcon(<path d="m5 12.5 4.3 4.3L19 7.3" />);
export const CheckCircle = createIcon((filled) => (
  <>
    <circle cx="12" cy="12" r="8.5" fill={filled ? 'currentColor' : 'none'} />
    <path d="m8 12.2 2.6 2.6 5.4-5.6" stroke={filled ? '#fff' : 'currentColor'} />
  </>
));
export const Copy = createIcon(
  <>
    <rect x="8" y="8" width="10" height="11" rx="1.5" />
    <path d="M6 15H5.5A1.5 1.5 0 0 1 4 13.5v-8A1.5 1.5 0 0 1 5.5 4h8A1.5 1.5 0 0 1 15 5.5V6" />
  </>,
);
export const Desktop = createIcon(
  <>
    <rect x="3.5" y="4" width="17" height="12" rx="1.5" />
    <path d="M8.5 20h7M12 16v4" />
  </>,
);
export const DownloadSimple = createIcon(
  <>
    <path d="M12 4v10" />
    <path d="m8.5 10.5 3.5 3.5 3.5-3.5" />
    <path d="M5 19h14" />
  </>,
);
export const FilePdf = createIcon(
  <>
    <path d="M6.5 3.5h7l4 4v13H6.5z" />
    <path d="M13.5 3.5v4h4" />
    <path d="M8.5 15.5h7M8.5 12.5h4" />
  </>,
);
export const ImageSquare = createIcon(
  <>
    <rect x="3.5" y="4" width="17" height="16" rx="1.8" />
    <circle cx="9" cy="9" r="1.5" />
    <path d="m5.5 17 4.5-4.5 3 3 2-2 3.5 3.5" />
  </>,
);
export const Images = createIcon(
  <>
    <rect x="6.5" y="6" width="13" height="12" rx="1.6" />
    <path d="M4.5 16V5.5A1.5 1.5 0 0 1 6 4h10" />
    <path d="m8.5 15 3.2-3.2 2.2 2.2 1.5-1.5 2.1 2.1" />
  </>,
);
export const Info = createIcon(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 10.7v5" />
    <path d="M12 7.8h.01" />
  </>,
);
export const MagnifyingGlass = createIcon(
  <>
    <circle cx="10.5" cy="10.5" r="5.5" />
    <path d="m15 15 4.2 4.2" />
  </>,
);
export const Minus = createIcon(<path d="M5.5 12h13" />);
export const Plus = createIcon(<path d="M12 5.5v13M5.5 12h13" />);
export const Printer = createIcon(
  <>
    <path d="M7 8V4.5h10V8" />
    <rect x="5" y="8" width="14" height="9" rx="1.5" />
    <path d="M7.5 14.5h9V20h-9zM16 11.5h.01" />
  </>,
);
export const Sparkle = createIcon((filled) => (
  <path
    d="M12 3.5c.6 4.8 3.2 7.4 8 8.5-4.8.8-7.4 3.5-8 8.5-.7-5-3.3-7.7-8-8.5 4.7-1.1 7.3-3.7 8-8.5Z"
    fill={filled ? 'currentColor' : 'none'}
  />
));
export const Trash = createIcon(
  <>
    <path d="M5.5 7h13M10 4h4M8 7l.7 12h6.6L16 7M10.5 10.5v5M13.5 10.5v5" />
  </>,
);
export const WarningCircle = createIcon(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 8v5" />
    <path d="M12 16.5h.01" />
  </>,
);
export const X = createIcon(<path d="m7 7 10 10M17 7 7 17" />);
