"use client";

import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { HashLink } from "./HashLink";

const navItems = [
  { label: "画布", href: "#canvas" },
  { label: "上下文", href: "#context" },
  { label: "决策流", href: "#candidates" },
  { label: "路线图", href: "#roadmap" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={scrolled ? "site-header is-scrolled" : "site-header"}>
      <HashLink className="brand" href="#top" aria-label="灵构首页">
        <img className="brand-logo-image" src="/logo.png" alt="灵构" />
        <span>灵构</span>
      </HashLink>

      <nav className={open ? "site-nav is-open" : "site-nav"} aria-label="主要导航">
        {navItems.map((item) => (
          <HashLink key={item.href} href={item.href as `#${string}`} onClick={() => setOpen(false)}>
            {item.label}
          </HashLink>
        ))}
      </nav>

      <HashLink className="header-cta" href="#canvas">了解产品</HashLink>

      <button
        className="menu-button"
        type="button"
        aria-label={open ? "关闭导航" : "打开导航"}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>
    </header>
  );
}
