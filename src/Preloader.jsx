import React, { useState, useEffect, useRef } from 'react';
import { useProgress } from '@react-three/drei';
import { motion, AnimatePresence } from 'framer-motion';
import { videoTextureCache } from './App';
import './Preloader.css';

const resolveAssetUrl = (url) => {
  if (!url) return '';
  let finalUrl = url;
  if (url.startsWith('/obsah/')) finalUrl = url;
  else if (url.startsWith('obsah/')) finalUrl = '/' + url;
  else if (url.startsWith('/')) finalUrl = url;
  else finalUrl = '/obsah/' + url;
  return encodeURI(finalUrl);
};

export function Preloader({ activeVideoUrl, onLoaded }) {
  const { progress: dreiProgress, total: dreiTotal } = useProgress();
  const [displayedProgress, setDisplayedProgress] = useState(0);
  const [isDone, setIsDone] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  const targetProgressRef = useRef(0);
  const startTimeRef = useRef(Date.now());
  const onLoadedFiredRef = useRef(false);

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
      let combined = 0;
      if (dreiTotal > 0) {
        combined = Math.floor(dreiProgress * 0.4 + videoPct * 0.6);
      } else {
        combined = videoPct;
      }

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
        let step = 1;
        const diff = target - current;
        if (diff > 40) step = 4;
        else if (diff > 20) step = 3;
        else if (diff > 10) step = 2;
        else if (diff > 0) step = 1;
        else step = 0;

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

  const circumference = 502.65; // 2 * Math.PI * 80
  const strokeDashoffset = circumference * (1 - displayedProgress / 100);

  const formattedNum = displayedProgress < 10 ? `0${displayedProgress}` : `${displayedProgress}`;

  return (
    <AnimatePresence onExitComplete={() => setIsDone(true)}>
      {!isExiting && (
        <motion.div
          className="preloader-overlay"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.04 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="preloader-bg-glow" />

          <div className="preloader-svg-container">
            <svg
              className="preloader-svg"
              viewBox="0 0 800 600"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                {/* Diagonal hatch pattern matching reference */}
                <pattern
                  id="at-diagonal-hatch"
                  width="10"
                  height="10"
                  patternTransform="rotate(45 0 0)"
                  patternUnits="userSpaceOnUse"
                >
                  <line
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="10"
                    stroke="#00f0ff"
                    strokeWidth="1.2"
                    strokeOpacity="0.45"
                  />
                </pattern>

                {/* Soft glow filter */}
                <filter id="cyan-glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="3.5" result="coloredBlur" />
                  <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>

                {/* Vertical wave gradient */}
                <linearGradient id="wave-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00f0ff" stopOpacity="0" />
                  <stop offset="50%" stopColor="#00f0ff" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#00f0ff" stopOpacity="0" />
                </linearGradient>

                {/* Soft flare gradient */}
                <linearGradient id="spike-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#70f3ff" stopOpacity="1" />
                  <stop offset="100%" stopColor="#0088aa" stopOpacity="0.2" />
                </linearGradient>
              </defs>

              {/* Sinuous resonance wave ripples on far left & right */}
              <g opacity="0.45">
                <path
                  d="M 120 150 C 75 230, 165 370, 115 450"
                  fill="none"
                  stroke="url(#wave-grad)"
                  strokeWidth="1.6"
                  className="preloader-wave-left"
                />
                <path
                  d="M 175 180 C 150 245, 198 355, 165 420"
                  fill="none"
                  stroke="url(#wave-grad)"
                  strokeWidth="1.2"
                  className="preloader-wave-left"
                />
                <path
                  d="M 680 150 C 725 230, 635 370, 685 450"
                  fill="none"
                  stroke="url(#wave-grad)"
                  strokeWidth="1.6"
                  className="preloader-wave-right"
                />
                <path
                  d="M 625 180 C 650 245, 602 355, 635 420"
                  fill="none"
                  stroke="url(#wave-grad)"
                  strokeWidth="1.2"
                  className="preloader-wave-right"
                />
              </g>

              {/* Magnetic field lines flanking the circle */}
              <g className="preloader-side-arcs">
                {/* Left outer & inner field loops */}
                <path
                  d="M 335 218 C 255 242, 238 300, 238 300 C 238 300, 255 358, 335 382"
                  fill="none"
                  stroke="#00e5ff"
                  strokeWidth="1.2"
                  opacity="0.5"
                />
                <path
                  d="M 346 232 C 290 252, 274 300, 274 300 C 274 300, 290 348, 346 368"
                  fill="none"
                  stroke="#00e5ff"
                  strokeWidth="1.6"
                  opacity="0.8"
                />

                {/* Right outer & inner field loops */}
                <path
                  d="M 465 218 C 545 242, 562 300, 562 300 C 562 300, 545 358, 465 382"
                  fill="none"
                  stroke="#00e5ff"
                  strokeWidth="1.2"
                  opacity="0.5"
                />
                <path
                  d="M 454 232 C 510 252, 526 300, 526 300 C 526 300, 510 348, 454 368"
                  fill="none"
                  stroke="#00e5ff"
                  strokeWidth="1.6"
                  opacity="0.8"
                />
              </g>

              {/* Energetic vertical & diagonal flares */}
              <g className="preloader-core-flare">
                {/* Top spire with curved base matching Active Theory reference */}
                <path
                  d="M 368 226 Q 396 215 400 135 Q 404 215 432 226"
                  fill="none"
                  stroke="#00f0ff"
                  strokeWidth="1.8"
                  filter="url(#cyan-glow)"
                />
                {/* Bottom spire */}
                <path
                  d="M 368 374 Q 396 385 400 465 Q 404 385 432 374"
                  fill="none"
                  stroke="#00f0ff"
                  strokeWidth="1.8"
                  filter="url(#cyan-glow)"
                />

                {/* Diagonal rays */}
                <path
                  d="M 345 244 Q 328 205 315 170"
                  fill="none"
                  stroke="#00d8f0"
                  strokeWidth="1.4"
                  opacity="0.75"
                />
                <path
                  d="M 455 244 Q 472 205 485 170"
                  fill="none"
                  stroke="#00d8f0"
                  strokeWidth="1.4"
                  opacity="0.75"
                />
                <path
                  d="M 345 356 Q 328 395 315 430"
                  fill="none"
                  stroke="#00d8f0"
                  strokeWidth="1.4"
                  opacity="0.75"
                />
                <path
                  d="M 455 356 Q 472 395 485 430"
                  fill="none"
                  stroke="#00d8f0"
                  strokeWidth="1.4"
                  opacity="0.75"
                />
              </g>

              {/* Dark inner circle background */}
              <circle
                cx="400"
                cy="300"
                r="79"
                fill="rgba(2, 14, 20, 0.94)"
              />

              {/* Diagonal hatch pattern circle */}
              <circle
                cx="400"
                cy="300"
                r="79"
                fill="url(#at-diagonal-hatch)"
              />

              {/* Circular progress track */}
              <circle
                cx="400"
                cy="300"
                r="80"
                fill="none"
                stroke="rgba(0, 240, 255, 0.18)"
                strokeWidth="2"
              />

              {/* Animated Progress Ring */}
              <circle
                cx="400"
                cy="300"
                r="80"
                fill="none"
                stroke="#00f0ff"
                strokeWidth="2.5"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                transform="rotate(-90 400 300)"
                filter="url(#cyan-glow)"
              />

              {/* Faint telemetry glyphs */}
              <text x="350" y="272" className="preloader-telemetry">9</text>
              <text x="446" y="272" className="preloader-telemetry">9</text>
              <text x="340" y="328" className="preloader-telemetry">9</text>
              <text x="456" y="328" className="preloader-telemetry">9</text>

              {/* Center Counter Display */}
              <text
                x="400"
                y="308"
                textAnchor="middle"
                dominantBaseline="central"
                className="preloader-counter-text"
              >
                {`/ ${formattedNum}`}
              </text>
            </svg>
          </div>

          <div className="preloader-status-bar">
            <div className="preloader-status-line" />
            <span className="preloader-status-text">INITIALIZING SCENE</span>
            <div className="preloader-status-line" style={{ transform: 'rotate(180deg)' }} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
