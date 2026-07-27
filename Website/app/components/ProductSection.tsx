"use client";

import { useEffect, useRef, useState } from "react";
import { HashLink } from "./HashLink";

export type ProductSectionData = {
  id: string;
  title: string;
  description: string;
  image: string;
  imageAlt: string;
  direction?: "text-left" | "image-left";
  tone?: "ink" | "graphite" | "violet" | "ember" | "blue";
};

type ProductSectionProps = {
  section: ProductSectionData;
  index: number;
};

export function ProductSection({ section, index }: ProductSectionProps) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "-10% 0px", threshold: 0.12 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let frame = 0;
    const updateFocus = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
      const node = ref.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const viewportCenter = window.innerHeight / 2;
      const sectionCenter = rect.top + rect.height / 2;
      const distance = Math.abs(sectionCenter - viewportCenter);
      const focus = Math.max(0, Math.min(1, 1 - distance / (window.innerHeight * 0.78)));
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
    <section
      id={section.id}
      ref={ref}
      className={`product-section tone-${section.tone ?? "ink"} ${visible ? "is-visible" : ""}`}
    >
      <div
        className={`section-shell ${section.direction === "image-left" ? "reverse" : ""}`}
      >
        <div className="section-copy">
          <h2>{section.title}</h2>
          <p>{section.description}</p>
          <HashLink className="section-link" href={(index === 4 ? "#top" : `#${index === 3 ? "roadmap" : sectionsNext[index]}`) as `#${string}`}>
            {index === 4 ? "回到顶部" : "继续探索"}
          </HashLink>
        </div>

        <div className="visual-wrap">
          <div className="visual-grid" aria-hidden="true" />
          <div className="visual-card">
            <img src={section.image} alt={section.imageAlt} loading="lazy" />
            <div className="visual-sheen" aria-hidden="true" />
          </div>
        </div>
      </div>
    </section>
  );
}

const sectionsNext = ["context", "candidates", "memory", "roadmap"];
