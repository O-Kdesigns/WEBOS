import { useState, useEffect, useRef } from 'react';
import { useProgress } from '@react-three/drei';
import { motion, AnimatePresence } from 'framer-motion';
import { videoTextureCache } from './App';
import { resolveAssetUrl } from './assetUrl';
import { startPreloaderCanvas } from './PreloaderCanvas';
import './Preloader.css';


export function Preloader({ activeVideoUrl, onLoaded }) {
  const { progress: dreiProgress, total: dreiTotal } = useProgress();
  const [displayedProgress, setDisplayedProgress] = useState(0);
  const [isDone, setIsDone] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  const targetProgressRef = useRef(0);
  const startTimeRef = useRef(0);
  const onLoadedFiredRef = useRef(false);
  const progressRef = useRef(0);
  const canvasRef = useRef(null);

  useEffect(() => {
    progressRef.current = displayedProgress;
  }, [displayedProgress]);

  // 2D line animation (helix drawing itself with the progress)
  useEffect(() => {
    if (isDone || !canvasRef.current) return;
    return startPreloaderCanvas(canvasRef.current, progressRef);
  }, [isDone]);

  useEffect(() => {
    startTimeRef.current = Date.now();
  }, []);

  // Monitor active video buffer + 3D assets
  useEffect(() => {
    const resolvedUrl = resolveAssetUrl(activeVideoUrl);
    let checkInterval = null;

    const evaluateProgress = () => {
      // 1. Check Video Buffer
      let videoPct = 0;
      const entry = resolvedUrl ? videoTextureCache.get(resolvedUrl) : null;
      const video = entry?.video;

      if (!resolvedUrl || !video) {
        // Video texture not in cache yet or no video specified
        // Give progressive score based on elapsed time up to 70%
        const elapsed = Date.now() - startTimeRef.current;
        videoPct = Math.min(70, Math.floor((elapsed / 1200) * 70));
      } else {
        if (video.readyState >= 4) {
          // HAVE_ENOUGH_DATA
          videoPct = 100;
        } else if (video.duration > 0 && video.buffered.length > 0) {
          const bufferedEnd = video.buffered.end(video.buffered.length - 1);
          // 10% buffer target (or 3 seconds of video)
          const targetBufferSeconds = Math.min(video.duration * 0.10, 3.0);
          videoPct = Math.min(100, Math.round((bufferedEnd / targetBufferSeconds) * 100));
        } else if (video.readyState >= 3) {
          videoPct = 85;
        } else if (video.readyState >= 2) {
          videoPct = 50;
        } else if (video.readyState >= 1) {
          videoPct = 30;
        }
      }

      // 2. Combine with Drei 3D asset progress
      let combined = dreiTotal > 0
        ? Math.floor(dreiProgress * 0.4 + videoPct * 0.6)
        : videoPct;

      // Safety timeout: after 4.5 seconds, force 100%
      const totalElapsed = Date.now() - startTimeRef.current;
      if (totalElapsed > 4500) {
        combined = 100;
      }

      if (combined > targetProgressRef.current) {
        targetProgressRef.current = combined;
      }
    };

    checkInterval = setInterval(evaluateProgress, 40);

    // Event listeners on video if already available
    const entry = resolvedUrl ? videoTextureCache.get(resolvedUrl) : null;
    const video = entry?.video;
    if (video) {
      video.addEventListener('progress', evaluateProgress);
      video.addEventListener('canplay', evaluateProgress);
      video.addEventListener('canplaythrough', evaluateProgress);
      video.addEventListener('loadeddata', evaluateProgress);
    }

    return () => {
      if (checkInterval) clearInterval(checkInterval);
      if (video) {
        video.removeEventListener('progress', evaluateProgress);
        video.removeEventListener('canplay', evaluateProgress);
        video.removeEventListener('canplaythrough', evaluateProgress);
        video.removeEventListener('loadeddata', evaluateProgress);
      }
    };
  }, [activeVideoUrl, dreiProgress, dreiTotal]);

  // Smooth counter animation ticker
  useEffect(() => {
    if (isDone) return;

    const timer = setInterval(() => {
      setDisplayedProgress((current) => {
        const target = targetProgressRef.current;
        if (current >= 100) {
          return 100;
        }

        // Active Theory rapid count-up feeling
        const diff = target - current;
        let step = 0;
        if (diff > 40) step = 4;
        else if (diff > 20) step = 3;
        else if (diff > 10) step = 2;
        else if (diff > 0) step = 1;

        const next = Math.min(100, current + step);

        if (next >= 100 && !onLoadedFiredRef.current) {
          onLoadedFiredRef.current = true;
          // Ensure min display time of 800ms so it doesn't flicker away instantly
          const elapsed = Date.now() - startTimeRef.current;
          const remainingTime = Math.max(200, 800 - elapsed);

          setTimeout(() => {
            onLoaded?.();
            setIsExiting(true);
          }, remainingTime);
        }

        return next;
      });
    }, 22);

    return () => clearInterval(timer);
  }, [isDone, onLoaded]);

  if (isDone) return null;

  return (
    <AnimatePresence onExitComplete={() => setIsDone(true)}>
      {!isExiting && (
        <motion.div
          className="preloader-overlay"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <canvas ref={canvasRef} className="preloader-canvas" aria-hidden="true" />
          <span className="preloader-sr">{`Loading ${displayedProgress} %`}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
