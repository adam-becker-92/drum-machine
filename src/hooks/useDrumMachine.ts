import { useCallback, useEffect, useRef, useState } from 'react';
import { DrumEngine } from '../audio/engine';
import { createEmptyPattern } from '../audio/tracks';
import type { Pattern } from '../audio/types';

const MIN_BPM = 40;
const MAX_BPM = 240;

export function useDrumMachine() {
  const engineRef = useRef<DrumEngine | null>(null);
  const [pattern, setPattern] = useState<Pattern>(createEmptyPattern);
  const [bpm, setBpm] = useState(120);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [samplesReady, setSamplesReady] = useState(false);

  useEffect(() => {
    const engine = new DrumEngine();
    engineRef.current = engine;
    engine.setOnStepChange(setCurrentStep);
    engine.loadSamples().then(() => setSamplesReady(true));
    return () => engine.stop();
  }, []);

  useEffect(() => {
    engineRef.current?.setPattern(pattern);
  }, [pattern]);

  useEffect(() => {
    engineRef.current?.setBpm(bpm);
  }, [bpm]);

  const toggleStep = useCallback((trackId: string, step: number) => {
    setPattern((prev) => {
      const nextTrack = [...prev[trackId]];
      nextTrack[step] = !nextTrack[step];
      return { ...prev, [trackId]: nextTrack };
    });
  }, []);

  const clearPattern = useCallback(() => {
    setPattern(createEmptyPattern());
  }, []);

  const play = useCallback(async () => {
    await engineRef.current?.start();
    setIsPlaying(true);
  }, []);

  const stop = useCallback(() => {
    engineRef.current?.stop();
    setIsPlaying(false);
    setCurrentStep(-1);
  }, []);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      stop();
    } else {
      play();
    }
  }, [isPlaying, play, stop]);

  const updateBpm = useCallback((value: number) => {
    setBpm(Math.min(MAX_BPM, Math.max(MIN_BPM, value)));
  }, []);

  return {
    pattern,
    toggleStep,
    clearPattern,
    bpm,
    setBpm: updateBpm,
    minBpm: MIN_BPM,
    maxBpm: MAX_BPM,
    isPlaying,
    togglePlay,
    currentStep,
    samplesReady,
  };
}
