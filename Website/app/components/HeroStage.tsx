"use client";

import { useEffect, useRef, useState } from "react";

type HeroStageProps = {
  image: string;
};

export function HeroStage({ image }: HeroStageProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;
    const updateFocus = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
      const node = ref.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const viewportCenter = window.innerHeight / 2;
      const stageCenter = rect.top + rect.height / 2;
      const distance = Math.abs(stageCenter - viewportCenter);
      const focus = Math.max(0, Math.min(1, 1 - distance / (window.innerHeight * 0.9)));
      node.style.setProperty("--focus-opacity", String(0.3 + focus * 0.7));
      });
    };
    updateFocus();
    window.addEventListener("scroll", updateFocus, { passive: true });
    window.addEventListener("resize", updateFocus);
    return () => {
      window.removeEventListener("scroll", updateFocus);
      window.removeEventListener("resize", updateFocus);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={ref} className="hero-stage" aria-hidden="true">
      <img src={image} alt="NodeCanvas 产品视觉占位图" />
    </div>
  );
}
