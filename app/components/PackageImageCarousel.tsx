/* eslint-disable @next/next/no-img-element */
"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useRef, useState, type TouchEvent } from "react";
import type { TravelPackageImage } from "../../lib/travel-packages";
import styles from "./PackageImageCarousel.module.css";

type Props = {
  images?: TravelPackageImage[];
  fallbackSrc: string;
  alt: string;
  imagePosition?: string;
  className?: string;
  fill?: boolean;
  shade?: boolean;
  eager?: boolean;
};

export default function PackageImageCarousel({
  images,
  fallbackSrc,
  alt,
  imagePosition = "center",
  className = "",
  fill = false,
  shade = false,
  eager = false,
}: Props) {
  const items = useMemo(() => {
    const seen = new Set<string>();
    const normalized = (images || []).flatMap((image) => {
      const url = typeof image?.url === "string" ? image.url.trim() : "";
      if (!url || seen.has(url)) return [];
      seen.add(url);
      return [{ ...image, url }];
    });
    return normalized.length ? normalized : [{ url: fallbackSrc, alt }];
  }, [images, fallbackSrc, alt]);
  const [requestedIndex, setRequestedIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const index = Math.min(requestedIndex, items.length - 1);
  const active = items[index];
  const multiple = items.length > 1;

  function move(delta: number) {
    setRequestedIndex((current) => {
      const safe = Math.min(current, items.length - 1);
      return (safe + delta + items.length) % items.length;
    });
  }

  function onTouchStart(event: TouchEvent<HTMLDivElement>) {
    touchStartX.current = event.changedTouches[0]?.clientX ?? null;
  }

  function onTouchEnd(event: TouchEvent<HTMLDivElement>) {
    if (touchStartX.current == null) return;
    const distance = (event.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(distance) < 42) return;
    move(distance > 0 ? -1 : 1);
  }

  return (
    <div
      className={`${styles.root} ${fill ? styles.fill : ""} ${className}`}
      role="group"
      aria-roledescription="carrusel"
      aria-label={`Fotos de ${alt}`}
      tabIndex={multiple ? 0 : undefined}
      onKeyDown={(event) => {
        if (!multiple || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
        event.preventDefault();
        move(event.key === "ArrowLeft" ? -1 : 1);
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      data-image-count={items.length}
    >
      <img
        key={`${active.url}-${index}`}
        className={styles.image}
        src={active.url}
        alt={active.alt || `${alt}, foto ${index + 1} de ${items.length}`}
        style={{ objectPosition: imagePosition }}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        onError={(event) => {
          if (!fallbackSrc || event.currentTarget.getAttribute("src") === fallbackSrc) return;
          event.currentTarget.src = fallbackSrc;
        }}
      />
      {shade ? <span className={styles.shade} aria-hidden="true" /> : null}
      {multiple ? (
        <>
          <button
            className={`${styles.nav} ${styles.previous}`}
            type="button"
            aria-label="Ver foto anterior"
            onClick={(event) => { event.stopPropagation(); move(-1); }}
          >
            <ChevronLeft />
          </button>
          <button
            className={`${styles.nav} ${styles.next}`}
            type="button"
            aria-label="Ver foto siguiente"
            onClick={(event) => { event.stopPropagation(); move(1); }}
          >
            <ChevronRight />
          </button>
          {items.length <= 8 ? (
            <div className={styles.dots} aria-label="Seleccionar foto">
              {items.map((image, dotIndex) => (
                <button
                  key={`${image.url}-${dotIndex}`}
                  className={dotIndex === index ? styles.activeDot : ""}
                  type="button"
                  aria-label={`Ver foto ${dotIndex + 1}`}
                  aria-current={dotIndex === index ? "true" : undefined}
                  onClick={(event) => { event.stopPropagation(); setRequestedIndex(dotIndex); }}
                />
              ))}
            </div>
          ) : null}
          <span className={styles.counter} aria-hidden="true">{index + 1}/{items.length}</span>
          <span className={styles.status} aria-live="polite">Foto {index + 1} de {items.length}</span>
        </>
      ) : null}
    </div>
  );
}
