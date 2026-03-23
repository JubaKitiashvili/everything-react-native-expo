/**
 * ERNE Dashboard — Pixel-art office canvas renderer
 * Draws 4 rooms with walls, floors, doors, desks, computers, and decorations.
 */
(function () {
  'use strict';

  const TILE_SIZE = 16;
  const OFFICE_COLS = 52;
  const OFFICE_ROWS = 36;
  const CANVAS_W = OFFICE_COLS * TILE_SIZE; // 832
  const CANVAS_H = OFFICE_ROWS * TILE_SIZE; // 576

  const COLORS = {
    wall: '#14141f',
    wallLight: '#1e1e30',
    floor: '#1a1a28',
    floorAlt: '#161622',
    desk: '#1e1e2e',
    deskTop: '#2a2a3e',
    computer: '#0f0f1a',
    computerScreen: '#0a0a14',
    door: '#252538',
    doorFrame: '#2a2a40',
    whiteboard: '#e2e8f0',
    whiteboardFrame: '#475569',
    chair: '#1e1e30',
    headerBg: '#0a0a0f',
    headerText: '#e2e8f0',
    plant: '#34d399',
    plantDark: '#059669',
    plantPot: '#3b3b50',
  };

  const ROOMS = {
    development: { x: 1, y: 3, w: 24, h: 14 },
    review: { x: 27, y: 3, w: 24, h: 14 },
    testing: { x: 1, y: 19, w: 24, h: 14 },
    conference: { x: 27, y: 19, w: 24, h: 14 },
  };

  const DESK_POSITIONS = {
    development: [
      { x: 2, y: 4, agent: 'architect' },
      { x: 9, y: 4, agent: 'native-bridge-builder' },
      { x: 16, y: 4, agent: 'senior-developer' },
      { x: 2, y: 9, agent: 'expo-config-resolver' },
      { x: 9, y: 9, agent: 'ui-designer' },
      { x: 16, y: 9, agent: 'feature-builder' },
    ],
    review: [
      { x: 4, y: 5, agent: 'code-reviewer' },
      { x: 13, y: 5, agent: 'upgrade-assistant' },
      { x: 4, y: 10, agent: 'documentation-generator' },
    ],
    testing: [
      { x: 4, y: 5, agent: 'tdd-guide' },
      { x: 13, y: 5, agent: 'performance-profiler' },
      { x: 4, y: 10, agent: 'visual-debugger' },
    ],
    conference: [{ x: 12, y: 5, agent: 'pipeline-orchestrator' }],
  };

  const ROOM_LABELS = {
    development: 'DEVELOPMENT',
    review: 'CODE REVIEW',
    testing: 'TESTING',
    conference: 'CONFERENCE',
  };

  // Short display names for canvas labels
  const SHORT_NAMES = {
    architect: 'architect',
    'native-bridge-builder': 'bridge-builder',
    'expo-config-resolver': 'config-resolver',
    'ui-designer': 'ui-designer',
    'code-reviewer': 'code-reviewer',
    'upgrade-assistant': 'upgrader',
    'tdd-guide': 'tdd-guide',
    'performance-profiler': 'profiler',
    'senior-developer': 'senior-dev',
    'feature-builder': 'feat-builder',
    'pipeline-orchestrator': 'orchestrator',
    'visual-debugger': 'vis-debugger',
    'documentation-generator': 'doc-gen',
  };

  /* ---- Drawing helpers ---- */

  const fillTile = (ctx, col, row, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
  };

  /* ---- Decoration drawing ---- */

  const drawPlant = (ctx, x, y) => {
    // Pot
    ctx.fillStyle = COLORS.plantPot;
    ctx.fillRect(x + 2, y + 12, 12, 8);
    ctx.fillRect(x, y + 10, 16, 3);
    // Soil
    ctx.fillStyle = '#2a2a3a';
    ctx.fillRect(x + 3, y + 10, 10, 2);
    // Leaves
    ctx.fillStyle = COLORS.plant;
    ctx.fillRect(x + 4, y + 2, 8, 9);
    ctx.fillRect(x + 1, y + 4, 4, 6);
    ctx.fillRect(x + 11, y + 3, 4, 7);
    ctx.fillStyle = COLORS.plantDark;
    ctx.fillRect(x + 6, y + 4, 4, 6);
    ctx.fillRect(x + 3, y + 6, 3, 3);
    // Highlights
    ctx.fillStyle = '#6ee7b7';
    ctx.fillRect(x + 5, y + 3, 2, 3);
    ctx.fillRect(x + 12, y + 4, 2, 3);
  };

  const drawCoffeeMachine = (ctx, x, y) => {
    // Machine body
    ctx.fillStyle = '#1e1e30';
    ctx.fillRect(x, y, 24, 28);
    ctx.fillStyle = '#252540';
    ctx.fillRect(x + 2, y + 2, 20, 10);
    // Display
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(x + 4, y + 3, 16, 7);
    // Text on display
    ctx.fillStyle = '#818cf8';
    ctx.fillRect(x + 6, y + 5, 6, 1);
    ctx.fillRect(x + 6, y + 7, 10, 1);
    // Drip area
    ctx.fillStyle = '#14141f';
    ctx.fillRect(x + 4, y + 16, 16, 10);
    // Coffee cup
    ctx.fillStyle = '#ddd';
    ctx.fillRect(x + 8, y + 18, 8, 7);
    ctx.fillStyle = '#6B4226';
    ctx.fillRect(x + 9, y + 19, 6, 3);
    // Steam
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(x + 10, y + 14, 2, 3);
    ctx.fillRect(x + 13, y + 13, 2, 4);
    // Buttons
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(x + 5, y + 13, 3, 2);
    ctx.fillStyle = '#2ecc71';
    ctx.fillRect(x + 10, y + 13, 3, 2);
  };

  const drawWaterCooler = (ctx, x, y) => {
    // Base
    ctx.fillStyle = '#2a2a40';
    ctx.fillRect(x + 2, y + 18, 16, 12);
    ctx.fillStyle = '#1e1e30';
    ctx.fillRect(x + 4, y + 20, 12, 8);
    // Tap
    ctx.fillStyle = '#818cf8';
    ctx.fillRect(x + 7, y + 16, 6, 4);
    // Water bottle
    ctx.fillStyle = 'rgba(129,140,248,0.3)';
    ctx.fillRect(x + 4, y, 12, 17);
    ctx.fillStyle = 'rgba(129,140,248,0.2)';
    ctx.fillRect(x + 6, y + 2, 8, 13);
    // Water highlight
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(x + 7, y + 3, 2, 10);
    // Cap
    ctx.fillStyle = '#3b3b50';
    ctx.fillRect(x + 5, y - 2, 10, 3);
  };

  const drawBookshelf = (ctx, x, y) => {
    // Shelf frame
    ctx.fillStyle = '#1e1e2e';
    ctx.fillRect(x, y, 36, 28);
    ctx.fillStyle = '#252538';
    ctx.fillRect(x + 2, y + 2, 32, 12);
    ctx.fillRect(x + 2, y + 16, 32, 10);
    // Books top shelf
    var bookColors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#e91e63'];
    for (var i = 0; i < 6; i++) {
      ctx.fillStyle = bookColors[i];
      ctx.fillRect(x + 3 + i * 5, y + 3, 4, 10);
      // Book spine detail
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(x + 3 + i * 5, y + 5, 4, 1);
    }
    // Books bottom shelf
    var bookColors2 = ['#1abc9c', '#e67e22', '#3455db', '#c0392b', '#8e44ad'];
    for (var i = 0; i < 5; i++) {
      ctx.fillStyle = bookColors2[i];
      ctx.fillRect(x + 4 + i * 6, y + 17, 5, 8);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(x + 5 + i * 6, y + 18, 1, 6);
    }
  };

  const drawPoster = (ctx, x, y, type) => {
    // Frame
    ctx.fillStyle = '#252538';
    ctx.fillRect(x - 1, y - 1, 22, 18);
    // Poster background
    if (type === 'code') {
      ctx.fillStyle = '#0f0f1a';
      ctx.fillRect(x, y, 20, 16);
      // Code lines
      ctx.fillStyle = '#2ecc71';
      ctx.fillRect(x + 2, y + 3, 8, 1);
      ctx.fillRect(x + 2, y + 5, 12, 1);
      ctx.fillStyle = '#3498db';
      ctx.fillRect(x + 4, y + 7, 10, 1);
      ctx.fillRect(x + 4, y + 9, 6, 1);
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(x + 2, y + 11, 14, 1);
      ctx.fillStyle = '#f39c12';
      ctx.fillRect(x + 2, y + 13, 8, 1);
    } else {
      // Chart poster
      ctx.fillStyle = '#0f0f1a';
      ctx.fillRect(x, y, 20, 16);
      // Bar chart
      ctx.fillStyle = '#3498db';
      ctx.fillRect(x + 3, y + 10, 3, 4);
      ctx.fillStyle = '#2ecc71';
      ctx.fillRect(x + 7, y + 6, 3, 8);
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(x + 11, y + 8, 3, 6);
      ctx.fillStyle = '#f39c12';
      ctx.fillRect(x + 15, y + 4, 3, 10);
    }
  };

  const drawClock = (ctx, x, y) => {
    // Clock face
    ctx.fillStyle = '#ddd';
    ctx.beginPath();
    ctx.arc(x + 8, y + 8, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x + 8, y + 8, 6, 0, Math.PI * 2);
    ctx.fill();
    // Hour marks
    ctx.fillStyle = '#333';
    ctx.fillRect(x + 7, y + 2, 2, 2);
    ctx.fillRect(x + 7, y + 12, 2, 2);
    ctx.fillRect(x + 12, y + 7, 2, 2);
    ctx.fillRect(x + 2, y + 7, 2, 2);
    // Hands (based on real time)
    var now = new Date();
    var hr = now.getHours() % 12;
    var mn = now.getMinutes();
    var hrAngle = (hr + mn / 60) * ((Math.PI * 2) / 12) - Math.PI / 2;
    var mnAngle = mn * ((Math.PI * 2) / 60) - Math.PI / 2;
    // Hour hand
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 8, y + 8);
    ctx.lineTo(x + 8 + Math.cos(hrAngle) * 4, y + 8 + Math.sin(hrAngle) * 4);
    ctx.stroke();
    // Minute hand
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 8, y + 8);
    ctx.lineTo(x + 8 + Math.cos(mnAngle) * 5, y + 8 + Math.sin(mnAngle) * 5);
    ctx.stroke();
    // Center dot
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(x + 7, y + 7, 2, 2);
  };

  const drawRug = (ctx, x, y, w, h, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    // Border pattern
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x + 2, y + 2, w - 4, 2);
    ctx.fillRect(x + 2, y + h - 4, w - 4, 2);
    ctx.fillRect(x + 2, y + 2, 2, h - 4);
    ctx.fillRect(x + w - 4, y + 2, 2, h - 4);
  };

  /* ---- Room drawing ---- */

  const drawRoom = (ctx, room, name) => {
    const rx = room.x;
    const ry = room.y;
    const rw = room.w;
    const rh = room.h;

    // Floor — checkerboard
    for (let r = ry; r < ry + rh; r++) {
      for (let c = rx; c < rx + rw; c++) {
        const alt = (r + c) % 2 === 0;
        fillTile(ctx, c, r, alt ? COLORS.floor : COLORS.floorAlt);
      }
    }

    // Walls — top and sides
    for (let c = rx; c < rx + rw; c++) {
      fillTile(ctx, c, ry, COLORS.wall);
      // Highlight strip
      ctx.fillStyle = COLORS.wallLight;
      ctx.fillRect(c * TILE_SIZE, ry * TILE_SIZE + TILE_SIZE - 3, TILE_SIZE, 3);
    }
    for (let r = ry; r < ry + rh; r++) {
      fillTile(ctx, rx, r, COLORS.wall);
      fillTile(ctx, rx + rw - 1, r, COLORS.wall);
    }
    // Bottom wall
    for (let c = rx; c < rx + rw; c++) {
      fillTile(ctx, c, ry + rh - 1, COLORS.wall);
    }

    // Door — bottom center
    const doorC = rx + Math.floor(rw / 2);
    fillTile(ctx, doorC, ry + rh - 1, COLORS.door);
    fillTile(ctx, doorC - 1, ry + rh - 1, COLORS.doorFrame);
    fillTile(ctx, doorC + 1, ry + rh - 1, COLORS.doorFrame);
    // Door knob
    ctx.fillStyle = '#818cf8';
    ctx.fillRect(doorC * TILE_SIZE + 10, (ry + rh - 1) * TILE_SIZE + 7, 3, 3);

    // Room label
    ctx.fillStyle = '#818cf8';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(
      '[' + (ROOM_LABELS[name] || name.toUpperCase()) + ']',
      (rx + rw / 2) * TILE_SIZE,
      ry * TILE_SIZE + 11,
    );

    // Desks
    const desks = DESK_POSITIONS[name] || [];
    for (const d of desks) {
      drawDesk(ctx, (rx + d.x) * TILE_SIZE, (ry + d.y) * TILE_SIZE);
    }

    // Ceiling lights — subtle glow spots on ceiling/wall
    const lightSpacing = Math.floor(rw / 3);
    for (let i = 1; i < 3; i++) {
      const lx = (rx + i * lightSpacing) * TILE_SIZE;
      const ly = ry * TILE_SIZE;
      // Light fixture
      ctx.fillStyle = '#2a2a40';
      ctx.fillRect(lx + 2, ly + 8, 12, 4);
      // Glow
      ctx.fillStyle = 'rgba(255,255,200,0.06)';
      ctx.fillRect(lx - 8, ly + 12, 32, 48);
      ctx.fillStyle = 'rgba(255,255,200,0.03)';
      ctx.fillRect(lx - 16, ly + 12, 48, 80);
    }

    // Room-specific decorations
    if (name === 'development') {
      // Blue rug under desks
      drawRug(
        ctx,
        (rx + 2) * TILE_SIZE,
        (ry + 6) * TILE_SIZE,
        20 * TILE_SIZE,
        3 * TILE_SIZE,
        'rgba(59, 130, 246, 0.05)',
      );
      drawWhiteboard(ctx, (rx + rw - 5) * TILE_SIZE, (ry + 1) * TILE_SIZE);
      drawPlant(ctx, (rx + 1) * TILE_SIZE + 2, (ry + 1) * TILE_SIZE + 2);
      drawBookshelf(ctx, (rx + rw - 5) * TILE_SIZE - 4, (ry + rh - 3) * TILE_SIZE);
      drawPoster(ctx, (rx + rw - 3) * TILE_SIZE, (ry + 1) * TILE_SIZE + 2, 'code');
      // Server rack in corner
      drawServerRack(ctx, (rx + rw - 3) * TILE_SIZE, (ry + rh - 4) * TILE_SIZE);
    }

    if (name === 'review') {
      // Green rug
      drawRug(
        ctx,
        (rx + 3) * TILE_SIZE,
        (ry + 3) * TILE_SIZE,
        18 * TILE_SIZE,
        8 * TILE_SIZE,
        'rgba(34, 197, 94, 0.04)',
      );
      drawWhiteboard(ctx, (rx + rw - 5) * TILE_SIZE, (ry + 1) * TILE_SIZE);
      drawPlant(ctx, (rx + 1) * TILE_SIZE + 2, (ry + 1) * TILE_SIZE + 2);
      drawPlant(ctx, (rx + rw - 3) * TILE_SIZE, (ry + rh - 3) * TILE_SIZE);
      drawBookshelf(ctx, (rx + 2) * TILE_SIZE, (ry + rh - 3) * TILE_SIZE);
      drawPoster(ctx, (rx + 1) * TILE_SIZE + 2, (ry + 5) * TILE_SIZE, 'chart');
      // Standing lamp
      drawStandingLamp(ctx, (rx + rw - 2) * TILE_SIZE, (ry + 2) * TILE_SIZE);
    }

    if (name === 'testing') {
      // Red rug
      drawRug(
        ctx,
        (rx + 3) * TILE_SIZE,
        (ry + 3) * TILE_SIZE,
        18 * TILE_SIZE,
        8 * TILE_SIZE,
        'rgba(239, 68, 68, 0.04)',
      );
      drawWhiteboard(ctx, (rx + rw - 5) * TILE_SIZE, (ry + 1) * TILE_SIZE);
      drawPlant(ctx, (rx + 1) * TILE_SIZE + 2, (ry + 1) * TILE_SIZE + 2);
      drawPlant(ctx, (rx + rw - 3) * TILE_SIZE, (ry + 1) * TILE_SIZE + 2);
      drawPoster(ctx, (rx + 1) * TILE_SIZE + 2, (ry + 5) * TILE_SIZE, 'code');
      // Bug trophy on wall
      drawPoster(ctx, (rx + rw - 3) * TILE_SIZE, (ry + rh - 5) * TILE_SIZE, 'chart');
    }

    // Conference table + rug
    if (name === 'conference') {
      const cx = (rx + rw / 2) * TILE_SIZE;
      const cy = (ry + rh / 2) * TILE_SIZE;
      drawRug(ctx, cx - 96, cy - 50, 192, 100, 'rgba(129, 140, 248, 0.06)');
      drawConferenceTable(ctx, rx, ry, rw, rh);
      drawPlant(ctx, (rx + 1) * TILE_SIZE + 2, (ry + 1) * TILE_SIZE + 2);
      drawPlant(ctx, (rx + rw - 3) * TILE_SIZE, (ry + 1) * TILE_SIZE + 2);
      // Projector screen on wall
      drawProjectorScreen(ctx, (rx + rw / 2 - 3) * TILE_SIZE, (ry + 1) * TILE_SIZE);
    }
  };

  const drawDesk = (ctx, x, y) => {
    // Desk legs
    ctx.fillStyle = '#16161e';
    ctx.fillRect(x + 2, y + 22, 4, 18);
    ctx.fillRect(x + 40, y + 22, 4, 18);
    // Desk body
    ctx.fillStyle = COLORS.desk;
    ctx.fillRect(x - 2, y + 16, 50, 8);
    // Desk top surface
    ctx.fillStyle = COLORS.deskTop;
    ctx.fillRect(x - 3, y + 14, 52, 4);
    // Desk top highlight
    ctx.fillStyle = '#353550';
    ctx.fillRect(x - 1, y + 14, 48, 2);

    // Monitor stand
    ctx.fillStyle = '#222';
    ctx.fillRect(x + 19, y + 6, 8, 8);
    ctx.fillRect(x + 15, y + 12, 16, 3);
    // Monitor
    ctx.fillStyle = COLORS.computer;
    ctx.fillRect(x + 6, y - 10, 34, 18);
    // Monitor bezel
    ctx.fillStyle = '#111';
    ctx.fillRect(x + 6, y - 10, 34, 2);
    // Screen — drawn dynamically by drawDeskScreen()
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(x + 8, y - 8, 30, 14);

    // Keyboard
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(x + 8, y + 18, 28, 6);
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(x + 9, y + 19, 26, 4);
    // Key rows
    ctx.fillStyle = '#444';
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(x + 10 + i * 5, y + 19, 4, 2);
      ctx.fillRect(x + 10 + i * 5, y + 21, 4, 1);
    }

    // Mouse
    ctx.fillStyle = '#333';
    ctx.fillRect(x + 38, y + 19, 6, 4);
    ctx.fillStyle = '#444';
    ctx.fillRect(x + 39, y + 19, 4, 2);

    // Chair backrest
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(x + 12, y + 30, 22, 4);
    // Chair seat
    ctx.fillStyle = COLORS.chair;
    ctx.fillRect(x + 10, y + 34, 26, 10);
    // Chair cushion highlight
    ctx.fillStyle = '#252540';
    ctx.fillRect(x + 12, y + 35, 22, 3);
    // Chair wheels
    ctx.fillStyle = '#222';
    ctx.fillRect(x + 12, y + 44, 4, 3);
    ctx.fillRect(x + 30, y + 44, 4, 3);
  };

  // Draw monitor screen content based on agent status
  const drawDeskScreen = (ctx, x, y, status) => {
    const sx = x + 8;
    const sy = y - 8;
    if (status === 'working') {
      // Active indigo code
      ctx.fillStyle = '#0a0a1a';
      ctx.fillRect(sx, sy, 30, 14);
      // Scanlines
      ctx.fillStyle = 'rgba(129,140,248,0.04)';
      for (let i = 0; i < 7; i++) {
        ctx.fillRect(sx, sy + i * 2, 30, 1);
      }
      // Indigo code lines
      ctx.fillStyle = '#818cf8';
      ctx.fillRect(sx + 2, sy + 2, 10, 1);
      ctx.fillStyle = '#a5b4fc';
      ctx.fillRect(sx + 2, sy + 4, 16, 1);
      ctx.fillStyle = '#818cf8';
      ctx.fillRect(sx + 4, sy + 6, 12, 1);
      ctx.fillStyle = '#a5b4fc';
      ctx.fillRect(sx + 4, sy + 8, 8, 1);
      ctx.fillStyle = '#818cf8';
      ctx.fillRect(sx + 2, sy + 10, 18, 1);
      // Cursor blink
      if (Math.floor(Date.now() / 500) % 2 === 0) {
        ctx.fillStyle = '#a5b4fc';
        ctx.fillRect(sx + 22, sy + 10, 4, 2);
      }
      // Active glow
      ctx.shadowColor = '#818cf8';
      ctx.shadowBlur = 6;
      ctx.fillStyle = 'rgba(129,140,248,0)';
      ctx.fillRect(sx, sy, 30, 14);
      ctx.shadowBlur = 0;
    } else if (status === 'done') {
      // Indigo success screen
      ctx.fillStyle = '#0a0a1a';
      ctx.fillRect(sx, sy, 30, 14);
      ctx.fillStyle = '#818cf8';
      ctx.fillRect(sx + 10, sy + 3, 10, 8);
      // Checkmark
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(sx + 12, sy + 7, 2, 2);
      ctx.fillRect(sx + 13, sy + 8, 2, 2);
      ctx.fillRect(sx + 14, sy + 7, 2, 2);
      ctx.fillRect(sx + 15, sy + 6, 2, 2);
      ctx.fillRect(sx + 16, sy + 5, 2, 2);
    } else if (status === 'planning') {
      // Amber planning screen
      ctx.fillStyle = '#0f0f1a';
      ctx.fillRect(sx, sy, 30, 14);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(sx + 2, sy + 2, 6, 1);
      ctx.fillRect(sx + 2, sy + 4, 14, 1);
      ctx.fillStyle = '#fcd34d';
      ctx.fillRect(sx + 4, sy + 7, 20, 1);
      ctx.fillRect(sx + 4, sy + 9, 12, 1);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(sx + 2, sy + 11, 8, 1);
    } else {
      // Idle — screensaver
      ctx.fillStyle = '#0a0a0f';
      ctx.fillRect(sx, sy, 30, 14);
      // Floating pixels screensaver
      var t = Date.now() / 2000;
      var colors = ['#1e1e30', '#14141f', '#0f0f1a'];
      for (var i = 0; i < 5; i++) {
        var px = sx + 4 + Math.floor(Math.sin(t + i * 1.3) * 10 + 11);
        var py = sy + 2 + Math.floor(Math.cos(t + i * 0.9) * 4 + 4);
        ctx.fillStyle = colors[i % colors.length];
        ctx.fillRect(px, py, 3, 3);
      }
    }
  };

  const drawConferenceTable = (ctx, rx, ry, rw, rh) => {
    const cx = (rx + rw / 2) * TILE_SIZE;
    const cy = (ry + rh / 2) * TILE_SIZE;
    const tw = 10 * TILE_SIZE;
    const th = 5 * TILE_SIZE;
    // Table shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(cx - tw / 2 + 3, cy - th / 2 + 3, tw, th);
    // Table
    ctx.fillStyle = COLORS.desk;
    ctx.fillRect(cx - tw / 2, cy - th / 2, tw, th);
    ctx.fillStyle = COLORS.deskTop;
    ctx.fillRect(cx - tw / 2 + 2, cy - th / 2 + 2, tw - 4, th - 4);
    // Table edge highlight
    ctx.fillStyle = '#353550';
    ctx.fillRect(cx - tw / 2 + 2, cy - th / 2 + 2, tw - 4, 2);
    // Chairs around table
    ctx.fillStyle = COLORS.chair;
    for (let i = 0; i < 4; i++) {
      const chairX = cx - tw / 2 + 20 + i * 40;
      ctx.fillRect(chairX, cy - th / 2 - 14, 12, 10);
      ctx.fillRect(chairX, cy + th / 2 + 4, 12, 10);
    }
    for (let i = 0; i < 2; i++) {
      const chairY = cy - th / 2 + 14 + i * 30;
      ctx.fillRect(cx - tw / 2 - 14, chairY, 10, 12);
      ctx.fillRect(cx + tw / 2 + 4, chairY, 10, 12);
    }
  };

  const drawWhiteboard = (ctx, x, y) => {
    // Frame
    ctx.fillStyle = COLORS.whiteboardFrame;
    ctx.fillRect(x - 2, y - 2, 36, 22);
    // Board
    ctx.fillStyle = COLORS.whiteboard;
    ctx.fillRect(x, y, 32, 18);
    // Some scribbles
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(x + 4, y + 4, 12, 2);
    ctx.fillRect(x + 4, y + 8, 18, 2);
    ctx.fillRect(x + 4, y + 12, 8, 2);
    // Marker tray
    ctx.fillStyle = '#2a2a40';
    ctx.fillRect(x, y + 18, 32, 3);
    // Markers
    ctx.fillStyle = '#f87171';
    ctx.fillRect(x + 4, y + 18, 6, 2);
    ctx.fillStyle = '#34d399';
    ctx.fillRect(x + 12, y + 18, 6, 2);
    ctx.fillStyle = '#818cf8';
    ctx.fillRect(x + 20, y + 18, 6, 2);
  };

  const drawServerRack = (ctx, x, y) => {
    ctx.fillStyle = '#14141f';
    ctx.fillRect(x, y, 20, 32);
    ctx.fillStyle = '#1e1e2e';
    ctx.fillRect(x + 2, y + 2, 16, 28);
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = '#252538';
      ctx.fillRect(x + 3, y + 3 + i * 7, 14, 5);
      ctx.fillStyle = i === 0 ? '#22c55e' : i === 1 ? '#3b82f6' : '#22c55e';
      ctx.fillRect(x + 4, y + 5 + i * 7, 2, 2);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(x + 7, y + 5 + i * 7, 2, 2);
      if (Math.floor(Date.now() / 700 + i * 200) % 3 === 0) {
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(x + 10, y + 5 + i * 7, 2, 2);
      }
    }
  };

  const drawStandingLamp = (ctx, x, y) => {
    ctx.fillStyle = '#2a2a40';
    ctx.fillRect(x + 2, y + 24, 12, 4);
    ctx.fillStyle = '#3b3b50';
    ctx.fillRect(x + 7, y + 6, 2, 18);
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(x + 2, y + 2, 12, 6);
    ctx.fillStyle = 'rgba(251,191,36,0.08)';
    ctx.fillRect(x - 8, y + 8, 32, 24);
  };

  const drawProjectorScreen = (ctx, x, y) => {
    ctx.fillStyle = '#252538';
    ctx.fillRect(x, y - 2, 48, 22);
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(x + 2, y, 44, 18);
    ctx.fillStyle = '#3b82f6';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ERNE', x + 24, y + 10);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '6px monospace';
    ctx.fillText('Sprint Review', x + 24, y + 16);
  };

  const drawHeader = (ctx) => {
    ctx.fillStyle = COLORS.headerBg;
    ctx.fillRect(0, 0, CANVAS_W, 3 * TILE_SIZE);
    // Bottom border
    ctx.fillStyle = 'rgba(129, 140, 248, 0.15)';
    ctx.fillRect(0, 3 * TILE_SIZE - 1, CANVAS_W, 1);
    // Title
    ctx.fillStyle = '#818cf8';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ERNE HQ', CANVAS_W / 2, 28);
    // Decorative line
    ctx.fillStyle = 'rgba(129, 140, 248, 0.2)';
    ctx.fillRect(CANVAS_W / 2 - 50, 36, 100, 1);
  };

  // Hallway decorations
  const drawHallwayDecorations = (ctx) => {
    // Coffee machine — between top rooms
    drawCoffeeMachine(ctx, 25 * TILE_SIZE + 6, 4 * TILE_SIZE + 2);
    // Water cooler — between bottom rooms
    drawWaterCooler(ctx, 25 * TILE_SIZE + 6, 20 * TILE_SIZE + 2);
    // Plants in hallway corners
    drawPlant(ctx, 0 * TILE_SIZE + 4, 17 * TILE_SIZE + 4);
    drawPlant(ctx, 51 * TILE_SIZE - 4, 17 * TILE_SIZE + 4);
    // Clocks on hallway wall (between rooms)
    drawClock(ctx, 25 * TILE_SIZE + 4, 3 * TILE_SIZE + 2);
    drawClock(ctx, 25 * TILE_SIZE + 4, 19 * TILE_SIZE + 2);
  };

  // Conference whiteboard — shows planning task text
  let planningTask = null;

  const setPlanningTask = (task) => {
    planningTask = task;
  };

  const drawConferenceWhiteboard = (ctx, rx, ry) => {
    const wx = (rx + 2) * TILE_SIZE;
    const wy = (ry + 1) * TILE_SIZE;
    // Frame
    ctx.fillStyle = COLORS.whiteboardFrame;
    ctx.fillRect(wx - 2, wy - 2, 52, 22);
    // Board
    ctx.fillStyle = planningTask ? '#fff' : COLORS.whiteboard;
    ctx.fillRect(wx, wy, 48, 18);

    if (planningTask) {
      // Show planning task on whiteboard
      ctx.fillStyle = '#818cf8';
      ctx.font = 'bold 7px monospace';
      ctx.textAlign = 'left';
      const text =
        planningTask.length > 20 ? planningTask.substring(0, 19) + '\u2026' : planningTask;
      ctx.fillText(text, wx + 3, wy + 11);
    } else {
      // Static scribbles
      ctx.fillStyle = '#888';
      ctx.fillRect(wx + 4, wy + 4, 18, 2);
      ctx.fillRect(wx + 4, wy + 8, 28, 2);
      ctx.fillRect(wx + 4, wy + 12, 12, 2);
    }
    // Marker tray
    ctx.fillStyle = '#2a2a40';
    ctx.fillRect(wx, wy + 18, 48, 3);
    ctx.fillStyle = '#f87171';
    ctx.fillRect(wx + 4, wy + 18, 8, 2);
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(wx + 14, wy + 18, 8, 2);
  };

  // Room activity glow
  const getRoomActivity = (agents) => {
    const activity = { development: false, review: false, testing: false, conference: false };
    if (!agents) return activity;
    for (const [name, agent] of Object.entries(agents)) {
      if (agent.status === 'working' || agent.status === 'planning') {
        for (const [roomName, desks] of Object.entries(DESK_POSITIONS)) {
          for (const d of desks) {
            if (d.agent === name) {
              activity[roomName] = agent.status;
            }
          }
        }
      }
    }
    for (const agent of Object.values(agents || {})) {
      if (agent.status === 'planning') {
        activity.conference = 'planning';
        break;
      }
    }
    return activity;
  };

  const drawRoomGlow = (ctx, room, status) => {
    if (!status) return;
    const px = room.x * TILE_SIZE;
    const py = room.y * TILE_SIZE;
    const pw = room.w * TILE_SIZE;
    const ph = room.h * TILE_SIZE;
    const color = status === 'planning' ? 'rgba(251, 191, 36, 0.08)' : 'rgba(129, 140, 248, 0.08)';
    const borderColor =
      status === 'planning' ? 'rgba(251, 191, 36, 0.25)' : 'rgba(129, 140, 248, 0.25)';

    ctx.fillStyle = color;
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 1, py + 1, pw - 2, ph - 2);
  };

  const drawOffice = (ctx, agents) => {
    if (!ctx) return;
    // Background
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Subtle grid texture
    ctx.strokeStyle = 'rgba(129, 140, 248, 0.03)';
    ctx.lineWidth = 0.5;
    for (let gx = 0; gx < CANVAS_W; gx += 20) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, CANVAS_H);
      ctx.stroke();
    }
    for (let gy = 0; gy < CANVAS_H; gy += 20) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(CANVAS_W, gy);
      ctx.stroke();
    }

    drawHeader(ctx);

    // Hallway floor between rooms
    for (let r = 0; r < OFFICE_ROWS; r++) {
      for (let c = 0; c < OFFICE_COLS; c++) {
        if (r >= 3) {
          let inRoom = false;
          for (const room of Object.values(ROOMS)) {
            if (c >= room.x && c < room.x + room.w && r >= room.y && r < room.y + room.h) {
              inRoom = true;
              break;
            }
          }
          if (!inRoom) {
            fillTile(ctx, c, r, (r + c) % 2 === 0 ? '#111120' : '#0e0e1c');
          }
        }
      }
    }

    // Draw rooms
    const roomActivity = getRoomActivity(agents);
    for (const [name, room] of Object.entries(ROOMS)) {
      drawRoom(ctx, room, name);
      drawRoomGlow(ctx, room, roomActivity[name]);
    }

    // Draw desk screens based on agent status
    for (const [roomName, desks] of Object.entries(DESK_POSITIONS)) {
      for (const d of desks) {
        const room = ROOMS[roomName];
        const status = agents && agents[d.agent] ? agents[d.agent].status : 'idle';
        drawDeskScreen(ctx, (room.x + d.x) * TILE_SIZE, (room.y + d.y) * TILE_SIZE, status);
      }
    }

    // Hallway decorations
    drawHallwayDecorations(ctx);

    // Conference whiteboard (drawn after room so it's on top)
    const confRoom = ROOMS.conference;
    drawConferenceWhiteboard(ctx, confRoom.x, confRoom.y);
  };

  const getAgentDeskPosition = (agentName) => {
    for (const [roomName, desks] of Object.entries(DESK_POSITIONS)) {
      for (const d of desks) {
        if (d.agent === agentName) {
          const room = ROOMS[roomName];
          return {
            x: (room.x + d.x) * TILE_SIZE + 22,
            y: (room.y + d.y) * TILE_SIZE + 28,
            room: roomName,
          };
        }
      }
    }
    return null;
  };

  const getAgentAtPoint = (canvasX, canvasY) => {
    for (const [roomName, desks] of Object.entries(DESK_POSITIONS)) {
      for (const d of desks) {
        const room = ROOMS[roomName];
        const ax = (room.x + d.x) * TILE_SIZE + 22;
        const ay = (room.y + d.y) * TILE_SIZE + 28;
        const half = 28;
        if (
          canvasX >= ax - half &&
          canvasX <= ax + half &&
          canvasY >= ay - half &&
          canvasY <= ay + half
        ) {
          return d.agent;
        }
      }
    }
    return null;
  };

  window.OfficeCanvas = {
    TILE_SIZE,
    CANVAS_W,
    CANVAS_H,
    COLORS,
    ROOMS,
    DESK_POSITIONS,
    SHORT_NAMES,
    drawOffice,
    getAgentDeskPosition,
    getAgentAtPoint,
    setPlanningTask,
  };
})();
