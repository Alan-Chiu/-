
import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  isActive: boolean;
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ isActive }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!isActive || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    const bars = 30;
    const barWidth = canvas.width / bars;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      for (let i = 0; i < bars; i++) {
        const height = isActive ? Math.random() * canvas.height : 2;
        const x = i * barWidth;
        const y = canvas.height - height;
        
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, '#fde047'); // Yellow
        gradient.addColorStop(1, '#b91c1c'); // Red
        
        ctx.fillStyle = gradient;
        ctx.fillRect(x + 2, y, barWidth - 4, height);
      }
      
      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [isActive]);

  return (
    <div className="w-full h-16 bg-slate-900/50 rounded-lg overflow-hidden border border-slate-700">
      <canvas 
        ref={canvasRef} 
        width={400} 
        height={64} 
        className="w-full h-full"
      />
    </div>
  );
};

export default AudioVisualizer;
