"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type RestartableGifProps = {
  className?: string;
  src: string;
  alt: string;
};

export function RestartableGif({ className, src, alt }: RestartableGifProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  const sourceBase = useMemo(() => src.replace(/\.gif$/i, ""), [src]);
  const startAtSeconds = 4;

  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    setIsVisible(false);

    const startFromBeginning = () => {
      video.currentTime = startAtSeconds;
      setIsVisible(true);
      void video.play().catch(() => {});
    };

    video.pause();
    video.currentTime = 0;
    video.load();
    video.addEventListener("loadeddata", startFromBeginning, { once: true });

    return () => {
      video.removeEventListener("loadeddata", startFromBeginning);
    };
  }, [sourceBase, startAtSeconds]);

  return (
    <video
      ref={videoRef}
      className={className}
      aria-label={alt}
      muted
      loop
      autoPlay
      playsInline
      preload="auto"
      style={{ visibility: isVisible ? "visible" : "hidden" }}
    >
      <source src={`${sourceBase}.webm`} type="video/webm" />
      <source src={`${sourceBase}.mp4`} type="video/mp4" />
    </video>
  );
}
