"use client";

import { useRef, useState } from "react";
import { CaretDown } from "./Icons";
import type { ExerciseMode } from "../lib/types";
import {
  CHINESE_MODES,
  ENGLISH_MODES,
  MODE_LABELS,
  MODE_ROUTES,
} from "../lib/ui-data";

function Menu({
  label,
  activePrefix,
  modes,
  activeMode,
  menuId,
  open,
  onToggle,
  onNavigate,
}: {
  label: string;
  activePrefix: string;
  modes: ExerciseMode[];
  activeMode?: ExerciseMode;
  menuId: string;
  open: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}) {
  const active = activeMode ? modes.includes(activeMode) : false;
  const currentLabel = activeMode && active
    ? `${activePrefix} · ${MODE_LABELS[activeMode]}`
    : label;

  return (
    <div className={`site-nav__menu${active ? " site-nav__menu--active" : ""}${open ? " is-open" : ""}`}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-controls={menuId} onClick={onToggle}>
        {currentLabel}
        <CaretDown size={14} weight="bold" aria-hidden="true" />
      </button>
      <div className="site-nav__dropdown" id={menuId} role="menu">
        {modes.map((mode) => (
          <a
            key={mode}
            href={MODE_ROUTES[mode]}
            role="menuitem"
            aria-current={activeMode === mode ? "page" : undefined}
            onClick={onNavigate}
          >
            {MODE_LABELS[mode]}
          </a>
        ))}
      </div>
    </div>
  );
}

export default function SiteHeader({ activeMode, activeDonate = false }: { activeMode?: ExerciseMode; activeDonate?: boolean }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const mobileToggleRef = useRef<HTMLButtonElement>(null);
  const closeNavigation = () => {
    setMobileOpen(false);
    setOpenMenu(null);
  };

  return (
    <header className="site-header desktop-only">
      <nav
        className="site-nav"
        aria-label="字帖类型导航"
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          closeNavigation();
          if (mobileOpen) mobileToggleRef.current?.focus();
        }}
      >
        <a className="site-logo" href="/" aria-label="字帖首页" onClick={closeNavigation}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-h.png" alt="" />
        </a>
        <button
          ref={mobileToggleRef}
          className="site-nav__mobile-toggle"
          type="button"
          aria-label={mobileOpen ? "收起网站导航" : "打开网站导航"}
          aria-expanded={mobileOpen}
          aria-controls="site-primary-nav"
          onClick={() => {
            setMobileOpen((open) => !open);
            setOpenMenu(null);
          }}
        >
          <span aria-hidden="true">☰</span>{mobileOpen ? "收起" : "菜单"}
        </button>
        <div className={`site-nav__links${mobileOpen ? " is-open" : ""}`} id="site-primary-nav">
          <Menu
            label="语文字帖"
            activePrefix="语文"
            modes={CHINESE_MODES}
            activeMode={activeMode}
            menuId="chinese-worksheet-menu"
            open={openMenu === "chinese"}
            onToggle={() => setOpenMenu((current) => current === "chinese" ? null : "chinese")}
            onNavigate={closeNavigation}
          />
          <Menu
            label="英文字帖"
            activePrefix="英文"
            modes={ENGLISH_MODES}
            activeMode={activeMode}
            menuId="english-worksheet-menu"
            open={openMenu === "english"}
            onToggle={() => setOpenMenu((current) => current === "english" ? null : "english")}
            onNavigate={closeNavigation}
          />
          <a className={activeMode === "number" ? "is-active" : ""} href={MODE_ROUTES.number} onClick={closeNavigation}>数字字帖</a>
          <a className={activeMode === "pinyin" ? "is-active" : ""} href={MODE_ROUTES.pinyin} onClick={closeNavigation}>拼音字帖</a>
          <a className={activeMode === "penControl" ? "is-active" : ""} href={MODE_ROUTES.penControl} onClick={closeNavigation}>控笔练习</a>
          <a
            className={`site-nav__donate${activeDonate ? " is-active" : ""}`}
            href="/donate/"
            aria-current={activeDonate ? "page" : undefined}
            onClick={closeNavigation}
          >
            捐赠支持
          </a>
        </div>
      </nav>
    </header>
  );
}
