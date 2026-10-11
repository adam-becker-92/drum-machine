import { useEffect, useRef } from 'react';
import { engine } from '../audio/core/engineInstance';
import type { OutputModule } from '../audio/modules/effects';

interface ScopeProps {
  nodeId: string;
  width: number;
  height: number;
}

// Live oscilloscope of whatever reaches an Output node.
export function Scope({ nodeId, width, height }: ScopeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const g = canvas?.getContext('2d');
    if (!canvas || !g) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    g.scale(dpr, dpr);
    const styles = getComputedStyle(canvas);
    const stroke = styles.getPropertyValue('--amber').trim() || '#e8a33d';
    const grid = styles.getPropertyValue('--step-off').trim() || '#38383b';
    let data = new Uint8Array(0);
    let frame = 0;

    const draw = () => {
      frame = requestAnimationFrame(draw);
      const analyser = engine.getModule<OutputModule>(nodeId)?.analyser;
      g.clearRect(0, 0, width, height);
      g.strokeStyle = grid;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(0, height / 2);
      g.lineTo(width, height / 2);
      g.stroke();
      if (!analyser) return;
      if (data.length !== analyser.fftSize) data = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(data);
      g.strokeStyle = stroke;
      g.lineWidth = 1.5;
      g.beginPath();
      for (let i = 0; i < data.length; i++) {
        const x = (i / (data.length - 1)) * width;
        const y = (data[i] / 255) * height;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [nodeId, width, height]);

  return <canvas ref={canvasRef} className="scope" style={{ width, height }} />;
}
