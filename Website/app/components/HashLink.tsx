"use client";

import type { AnchorHTMLAttributes, MouseEvent } from "react";

type HashLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: `#${string}`;
};

export function HashLink({ href, onClick, ...props }: HashLinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation?.();
    onClick?.(event);
    const target = document.getElementById(href.slice(1));
    if (target) {
      window.history.pushState(null, "", href);
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return <a {...props} href={href} onClick={handleClick} />;
}
