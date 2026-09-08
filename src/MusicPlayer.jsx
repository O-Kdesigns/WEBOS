import React, { useState, useEffect, useRef } from 'react';
import defaultTracks from './tracks.json';
import './MusicPlayer.css';

const COOL_TITLES = [
  "BXRDV",
  "CYBER_NEON",
  "NIGHT_DRIVE",
  "SYNTHWAVE_01",
  "ECHO_CHAMBER",
  "ORBITAL_DRIFT",
  "RETRO_HORIZON",
  "GLITCH_CITY",
  "VELOCITY",
  "DEEP_SPACE",
  "HYPER_PULSE",
  "VOID_RUNNER"
];

// Vite automaticky najde všechny audio soubory ve složce /public/music/
const detectedAudioFiles = Object.keys(
  import.meta.glob('/public/music/*.{mp3,wav,ogg,m4a,aac,flac}', { eager: true })
);

function getInitialTracks(customTracks) {
  if (customTracks && customTracks.length > 0) {
    return customTracks;
  }
  
  if (detectedAudioFiles && detectedAudioFiles.length > 0) {
    return detectedAudioFiles.map((fullPath, idx) => {
      const fileUrl = fullPath.replace('/public', '');
      const existing = defaultTracks.find(t => t.file === fileUrl);
      const title = existing?.title || COOL_TITLES[idx % COOL_TITLES.length];
      return {
        id: idx + 1,
        title: title,
        file: fileUrl
      };
    });
  }

  return defaultTracks;
}

// Fisher-Yates shuffle pro náhodné pořadí při každém refreshi
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function MusicPlayer({ tracks, volume = 0.4, isSuspended = false }) {
  const [playlist, setPlaylist] = useState(() => {
    const baseList = getInitialTracks(tracks);
    return shuffleArray(baseList);
  });
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasError, setHasError] = useState(false);
  const audioRef = useRef(null);
  const userInteractedRef = useRef(false);
  const autoPlayTimerRef = useRef(null);
  const wasPlayingBeforeSuspendRef = useRef(false);

  useEffect(() => {
    if (!audioRef.current) return;
    if (isSuspended) {
      wasPlayingBeforeSuspendRef.current = isPlaying;
      if (isPlaying) {
        audioRef.current.pause();
      }
    } else if (wasPlayingBeforeSuspendRef.current) {
      audioRef.current.play().catch(() => {});
    }
  }, [isSuspended]);

  const currentTrack = playlist[currentIndex] || playlist[0];

  // Inicializace audia a obsluha autoplay po 5 sekundách
  useEffect(() => {
    const audio = new Audio();
    audio.volume = volume;
    audioRef.current = audio;

    const handleEnded = () => {
      setCurrentIndex((prev) => (prev + 1) % playlist.length);
    };

    const handleError = () => {
      setHasError(true);
      setIsPlaying(false);
    };

    const handlePlay = () => {
      setIsPlaying(true);
      setHasError(false);
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    // Automatické spuštění zvuku 5 sekund po načtení
    autoPlayTimerRef.current = setTimeout(() => {
      if (audioRef.current && audioRef.current.paused) {
        audioRef.current.play().then(() => {
          setIsPlaying(true);
        }).catch(() => {
          // Pokud prohlížeč vyžaduje gesto, spustí se při prvním kliku
        });
      }
    }, 5000);

    // První kliknutí / dotyk kdekoliv na stránce (prohlížečové restrikce)
    const handleFirstUserInteraction = () => {
      userInteractedRef.current = true;
      if (audioRef.current && audioRef.current.paused) {
        audioRef.current.play().then(() => {
          setIsPlaying(true);
        }).catch(() => {});
      }
      window.removeEventListener('pointerdown', handleFirstUserInteraction);
      window.removeEventListener('keydown', handleFirstUserInteraction);
    };

    window.addEventListener('pointerdown', handleFirstUserInteraction, { once: true });
    window.addEventListener('keydown', handleFirstUserInteraction, { once: true });

    return () => {
      if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.pause();
      audio.src = '';
      window.removeEventListener('pointerdown', handleFirstUserInteraction);
      window.removeEventListener('keydown', handleFirstUserInteraction);
    };
  }, [playlist.length, volume]);

  // Změna skladby
  useEffect(() => {
    if (!audioRef.current || !currentTrack) return;
    setHasError(false);
    audioRef.current.src = currentTrack.file;
    audioRef.current.load();

    if (userInteractedRef.current || isPlaying) {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(() => {
        setHasError(true);
        setIsPlaying(false);
      });
    }
  }, [currentIndex, currentTrack]);

  const handlePrev = (e) => {
    e.stopPropagation();
    if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
    userInteractedRef.current = true;
    setCurrentIndex((prev) => (prev - 1 + playlist.length) % playlist.length);
  };

  const handleNext = (e) => {
    e.stopPropagation();
    if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
    userInteractedRef.current = true;
    setCurrentIndex((prev) => (prev + 1) % playlist.length);
  };

  const togglePlay = () => {
    if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
    userInteractedRef.current = true;
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
        setHasError(false);
      }).catch(() => {
        setHasError(true);
      });
    }
  };

  if (!currentTrack) return null;

  return (
    <div className="hud-music-player">
      <button className="hud-btn" onClick={handlePrev} title="Předchozí skladba">
        &lt;&lt;
      </button>

      <div className="hud-display" onClick={togglePlay} title={isPlaying ? "Klikněte pro vypnutí (OFF)" : "Klikněte pro zapnutí (ON)"}>
        <div className={`hud-tag ${isPlaying ? 'on' : 'off'}`}>
          <span className={isPlaying ? "hud-playing-dot" : "hud-paused-dot"}></span>
          {isPlaying ? 'ON' : 'OFF'}
        </div>
        <div className={`hud-title ${hasError ? 'has-error' : ''}`}>
          {currentIndex + 1}. {hasError ? `${currentTrack.title} (CHYBA MP3)` : currentTrack.title}
        </div>
      </div>

      <button className="hud-btn" onClick={handleNext} title="Další skladba">
        &gt;&gt;
      </button>
    </div>
  );
}
