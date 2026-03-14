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
  const [playbackNonce, setPlaybackNonce] = useState("initial");

  const sourceBase = useMemo(() => src.replace(/\.gif$/i, ""), [src]);
  const startAtSeconds = 4;

  useEffect(() => {
    setPlaybackNonce(Date.now().toString(36));
  }, []);

  useEffect(() => {
    const video = videoRef.current;

    if (!video || playbackNonce === "initial") {
      return;
    }

    setIsVisible(false);

    let fallbackTimeout: ReturnType<typeof setTimeout> | null = null;
    let hasStarted = false;

    const playFromStartPoint = () => {
      if (hasStarted) {
        return;
      }

      hasStarted = true;
      setIsVisible(true);
      void video.play().catch(() => {});
    };

    const seekToStartPoint = () => {
      const safeStartTime =
        Number.isFinite(video.duration) && video.duration > startAtSeconds
          ? startAtSeconds
          : 0;

      if (Math.abs(video.currentTime - safeStartTime) <= 0.05) {
        playFromStartPoint();
        return;
      }

      video.currentTime = safeStartTime;
      fallbackTimeout = setTimeout(playFromStartPoint, 180);
    };

    video.pause();
    video.currentTime = 0;
    video.load();
    video.addEventListener("loadedmetadata", seekToStartPoint, { once: true });
    video.addEventListener("seeked", playFromStartPoint, { once: true });

    return () => {
      if (fallbackTimeout !== null) {
        clearTimeout(fallbackTimeout);
      }

      video.removeEventListener("loadedmetadata", seekToStartPoint);
      video.removeEventListener("seeked", playFromStartPoint);
    };
  }, [sourceBase, startAtSeconds, playbackNonce]);

  return (
    <video
      ref={videoRef}
      className={className}
      aria-label={alt}
      muted
      loop
      playsInline
      preload="auto"
      style={{ visibility: isVisible ? "visible" : "hidden" }}
    >
      <source src={`${sourceBase}.webm?v=${playbackNonce}`} type="video/webm" />
      <source src={`${sourceBase}.mp4?v=${playbackNonce}`} type="video/mp4" />
    </video>
  );
}
