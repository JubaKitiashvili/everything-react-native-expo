/**
 * ERNE Dashboard — Sidebar status panel
 */
(function () {
  'use strict';

  const SIDEBAR_W = 220;
  const SIDEBAR_PAD = 12;
  const ROW_H = 52;

  const STATUS_COLORS = {
    idle: '#9E9E9E',
    working: '#4CAF50',
    moving: '#FF9800',
    done: '#2196F3',
  };

  const STATUS_LABELS = {
    idle: 'IDLE',
    working: 'WORKING',
    moving: 'MOVING',
    done: 'DONE',
  };

  const drawSidebar = (ctx, agents, canvasW, canvasH) => {
    const sx = canvasW;

    // Background
    ctx.fillStyle = '#12121e';
    ctx.fillRect(sx, 0, SIDEBAR_W, canvasH);

    // Header
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(sx, 0, SIDEBAR_W, 36);
    ctx.fillStyle = '#E0E0E0';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('AGENTS', sx + SIDEBAR_W / 2, 24);

    // Separator
    ctx.fillStyle = '#4A3F5C';
    ctx.fillRect(sx + SIDEBAR_PAD, 36, SIDEBAR_W - SIDEBAR_PAD * 2, 1);

    // Agent list
    const agentNames = Object.keys(agents);
    let y = 40;

    for (let i = 0; i < agentNames.length; i++) {
      const name = agentNames[i];
      const agent = agents[name];
      const status = agent.status || 'idle';
      const task = agent.task || '';

      // Alternating row background
      ctx.fillStyle = i % 2 === 0 ? '#16162a' : '#1a1a30';
      ctx.fillRect(sx, y, SIDEBAR_W, ROW_H);

      // Status dot
      ctx.fillStyle = STATUS_COLORS[status] || STATUS_COLORS.idle;
      ctx.beginPath();
      ctx.arc(sx + SIDEBAR_PAD + 6, y + 16, 5, 0, Math.PI * 2);
      ctx.fill();

      // Agent name
      ctx.fillStyle = '#E0E0E0';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(name, sx + SIDEBAR_PAD + 18, y + 18);

      // Status label
      ctx.fillStyle = STATUS_COLORS[status] || STATUS_COLORS.idle;
      ctx.font = '9px monospace';
      ctx.fillText(STATUS_LABELS[status] || 'IDLE', sx + SIDEBAR_PAD + 18, y + 30);

      // Task text (truncated)
      if (task) {
        ctx.fillStyle = '#888';
        ctx.font = '8px monospace';
        const truncated = task.length > 24 ? task.substring(0, 23) + '\u2026' : task;
        ctx.fillText(truncated, sx + SIDEBAR_PAD + 18, y + 42);
      }

      y += ROW_H;
    }
  };

  const drawConnectionIndicator = (ctx, canvasW, canvasH, connected) => {
    const sx = canvasW + SIDEBAR_W - SIDEBAR_PAD - 10;
    const sy = canvasH - SIDEBAR_PAD - 5;

    ctx.fillStyle = connected ? '#4CAF50' : '#f44336';
    ctx.beginPath();
    ctx.arc(sx, sy, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#888';
    ctx.font = '8px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(connected ? 'LIVE' : 'OFFLINE', sx - 10, sy + 3);
  };

  window.Sidebar = {
    SIDEBAR_W,
    drawSidebar,
    drawConnectionIndicator,
  };
})();
