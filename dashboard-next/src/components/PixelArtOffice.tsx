import { useRef, useEffect, useCallback } from 'react';
import type { AgentMap } from '../types';

// canvas.js and agents.js are loaded as static scripts in index.html
// They export to window.OfficeCanvas and window.AgentSprites
declare global {
  interface Window {
    OfficeCanvas?: {
      CANVAS_W: number;
      CANVAS_H: number;
      drawOffice: (ctx: CanvasRenderingContext2D) => void;
      getAgentAtPoint: (x: number, y: number) => string | null;
    };
    AgentSprites?: {
      initAgentSprites: () => void;
      updateAgentState: (agents: Record<string, { status: string }>) => void;
      updateAgentSprites: (dt: number) => void;
      drawAgentSprites: (ctx: CanvasRenderingContext2D) => void;
      setAgentTasks: (tasks: Record<string, { task: string | null }>) => void;
    };
  }
}

interface PixelArtOfficeProps {
  agents: AgentMap;
  onAgentClick?: (agentName: string) => void;
  className?: string;
}

export function PixelArtOffice({ agents, onAgentClick, className = '' }: PixelArtOfficeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const scriptsLoadedRef = useRef(false);

  // Load canvas.js and agents.js scripts
  useEffect(() => {
    if (scriptsLoadedRef.current) return;
    if (window.OfficeCanvas && window.AgentSprites) {
      scriptsLoadedRef.current = true;
      return;
    }

    let mounted = true;
    const loadScript = (src: string): Promise<void> =>
      new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
          resolve();
          return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(script);
      });

    (async () => {
      try {
        await loadScript('/canvas.js');
        await loadScript('/agents.js');
        if (mounted) {
          scriptsLoadedRef.current = true;
          window.AgentSprites?.initAgentSprites();
        }
      } catch {
        // Scripts not available — pixel art won't render
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // Update agent states when they change
  useEffect(() => {
    if (!window.AgentSprites) return;
    window.AgentSprites.updateAgentState(agents);
    const tasks: Record<string, { task: string | null }> = {};
    for (const [name, state] of Object.entries(agents)) {
      tasks[name] = { task: state.task };
    }
    window.AgentSprites.setAgentTasks(tasks);
  }, [agents]);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = (time: number) => {
      const dt = lastTimeRef.current ? (time - lastTimeRef.current) / 1000 : 0;
      lastTimeRef.current = time;

      if (window.OfficeCanvas && window.AgentSprites) {
        window.OfficeCanvas.drawOffice(ctx);
        window.AgentSprites.updateAgentSprites(dt);
        window.AgentSprites.drawAgentSprites(ctx);
      } else {
        // Fallback — dark background with text
        ctx.fillStyle = '#0d1117';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#484f58';
        ctx.font = '14px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Loading pixel-art office...', canvas.width / 2, canvas.height / 2);
      }

      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!window.OfficeCanvas || !onAgentClick) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      const agent = window.OfficeCanvas.getAgentAtPoint(x, y);
      if (agent) onAgentClick(agent);
    },
    [onAgentClick],
  );

  return (
    <canvas
      ref={canvasRef}
      width={832}
      height={576}
      onClick={handleClick}
      className={`rounded-lg cursor-pointer ${className}`}
      style={{
        imageRendering: 'pixelated',
        width: '100%',
        aspectRatio: '832 / 576',
      }}
    />
  );
}
