"use client";

import { useState } from "react";

// mestate.jp(BiNDup で作っている事務所サイト)と同じメニュー。
// サービス案内(/plan など)を見に来た方が、事務所サイトの各ページへ移れるようにする。
const SITE = "https://mestate.jp/";
const NAVY = "#001C46";

export const SITE_NAV_ITEMS: { label: string; href: string; current?: boolean }[] = [
  { label: "事務所について", href: `${SITE}company.html` },
  { label: "業務内容", href: `${SITE}service.html` },
  { label: "専門家紹介", href: `${SITE}specialist.html` },
  { label: "報酬・ご契約の流れ", href: `${SITE}price-flow.html` },
  { label: "ストレスチェック", href: "/plan", current: true },
];

const CONTACT_HREF = `${SITE}contact.html`;
const LOGIN_HREF = `${SITE}member/`;

// 事務所サイトのメニューを出すページ(ログイン後の画面には出さない)
export const SITE_NAV_PATHS = ["/plan", "/plan/terms", "/plan/tokushoho", "/plan/signup", "/privacy"];

export function showSiteNav(pathname: string) {
  return SITE_NAV_PATHS.includes(pathname.replace(/\/$/, "") || "/");
}

function LockIcon() {
  return (
    <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true" style={{ display: "block" }}>
      <path d="M3 6V4a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="1" y="6" width="10" height="8" rx="1.5" fill="currentColor" />
    </svg>
  );
}

export function SiteNav() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="site-nav" aria-label="うえまつ産業医事務所のメニュー">
      {/* スマートフォンでは「メニュー」ボタンで開閉する */}
      <button
        type="button"
        className="site-nav-toggle"
        aria-expanded={open}
        aria-controls="site-nav-body"
        aria-label={open ? "メニューを閉じる" : "メニューを開く"}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true" style={{ fontSize: 20, lineHeight: 1 }}>
          {open ? "×" : "☰"}
        </span>
        <span aria-hidden="true" style={{ fontSize: 9, lineHeight: 1 }}>
          MENU
        </span>
      </button>
      <div id="site-nav-body" className={`site-nav-body${open ? " is-open" : ""}`}>
        <ul className="site-nav-list">
          {SITE_NAV_ITEMS.map((item) => (
            <li key={item.label}>
              <a
                href={item.href}
                className={`site-nav-link${item.current ? " is-current" : ""}`}
                aria-current={item.current ? "page" : undefined}
                style={{ color: NAVY }}
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="site-nav-actions">
          <a href={CONTACT_HREF} className="site-nav-contact">
            お問い合わせ
          </a>
          <a href={LOGIN_HREF} className="site-nav-login">
            <LockIcon />
            ご契約企業ログイン
          </a>
        </div>
      </div>
    </nav>
  );
}
