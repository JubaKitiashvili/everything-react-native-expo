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
    wall: '#2C2137',
    wallLight: '#4A3F5C',
    floor: '#8B7355',
    floorAlt: '#7A6548',
    desk: '#5C4033',
    deskTop: '#8B6914',
    computer: '#1a1a2e',
    computerScreen: '#16213e',
    door: '#6B4226',
    doorFrame: '#8B5A2B',
    whiteboard: '#E8E8E8',
    whiteboardFrame: '#666666',
    chair: '#4A3F5C',
    headerBg: '#1a1a2e',
    headerText: '#E0E0E0',
    plant: '#2d8a4e',
    plantDark: '#1e6b3a',
    plantPot: '#8B5A2B',
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
    ],
    testing: [
      { x: 4, y: 5, agent: 'tdd-guide' },
      { x: 13, y: 5, agent: 'performance-profiler' },
    ],
    conference: [
      { x: 12, y: 5, agent: 'pipeline-orchestrator' },
    ],
  };

  const ROOM_LABELS = {
    development: 'DEVELOPMENT',
    review: 'CODE REVIEW',
    testing: 'TESTING',
    conference: 'CONFERENCE',
  };

  // Short display names for canvas labels
  const SHORT_NAMES = {
    'architect': 'architect',
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
    ctx.fillStyle = '#5a3a1a';
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
    ctx.fillStyle = '#3da85e';
    ctx.fillRect(x + 5, y + 3, 2, 3);
    ctx.fillRect(x + 12, y + 4, 2, 3);
  };

  const drawCoffeeMachine = (ctx, x, y) => {
    // Machine body
    ctx.fillStyle = '#444';
    ctx.fillRect(x, y, 24, 28);
    ctx.fillStyle = '#555';
    ctx.fillRect(x + 2, y + 2, 20, 10);
    // Display
    ctx.fillStyle = '#0f3460';
    ctx.fillRect(x + 4, y + 3, 16, 7);
    // Text on display
    ctx.fillStyle = '#2e86c1';
    ctx.fillRect(x + 6, y + 5, 6, 1);
    ctx.fillRect(x + 6, y + 7, 10, 1);
    // Drip area
    ctx.fillStyle = '#333';
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
    ctx.fillStyle = '#bbb';
    ctx.fillRect(x + 2, y + 18, 16, 12);
    ctx.fillStyle = '#999';
    ctx.fillRect(x + 4, y + 20, 12, 8);
    // Tap
    ctx.fillStyle = '#2196F3';
    ctx.fillRect(x + 7, y + 16, 6, 4);
    // Water bottle
    ctx.fillStyle = '#81D4FA';
    ctx.fillRect(x + 4, y, 12, 17);
    ctx.fillStyle = '#B3E5FC';
    ctx.fillRect(x + 6, y + 2, 8, 13);
    // Water highlight
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(x + 7, y + 3, 2, 10);
    // Cap
    ctx.fillStyle = '#ddd';
    ctx.fillRect(x + 5, y - 2, 10, 3);
  };

  const drawBookshelf = (ctx, x, y) => {
    // Shelf frame
    ctx.fillStyle = '#5C4033';
    ctx.fillRect(x, y, 36, 28);
    ctx.fillStyle = '#6B4226';
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
    ctx.fillStyle = '#444';
    ctx.fillRect(x - 1, y - 1, 22, 18);
    // Poster background
    if (type === 'code') {
      ctx.fillStyle = '#1a1a2e';
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
      ctx.fillStyle = '#16213e';
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
    var hrAngle = (hr + mn / 60) * (Math.PI * 2 / 12) - Math.PI / 2;
    var mnAngle = mn * (Math.PI * 2 / 60) - Math.PI / 2;
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
    ctx.fillStyle = '#C0A060';
    ctx.fillRect(doorC * TILE_SIZE + 10, (ry + rh - 1) * TILE_SIZE + 7, 3, 3);

    // Room label
    ctx.fillStyle = COLORS.headerText;
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(
      ROOM_LABELS[name] || name.toUpperCase(),
      (rx + rw / 2) * TILE_SIZE,
      ry * TILE_SIZE + 11
    );

    // Desks
    const desks = DESK_POSITIONS[name] || [];
    for (const d of desks) {
      drawDesk(ctx, (rx + d.x) * TILE_SIZE, (ry + d.y) * TILE_SIZE);
    }

    // Room-specific decorations
    if (name === 'development') {
      drawWhiteboard(ctx, (rx + rw - 5) * TILE_SIZE, (ry + 1) * TILE_SIZE);
      drawPlant(ctx, (rx + 1) * TILE_SIZE + 2, (ry + 1) * TILE_SIZE + 2);
      drawBookshelf(ctx, (rx + rw - 5) * TILE_SIZE - 4, (ry + rh - 3) * TILE_SIZE);
      drawPoster(ctx, (rx + rw - 3) * TILE_SIZE, (ry + 1) * TILE_SIZE + 2, 'code');
    }

    if (name === 'review') {
      drawWhiteboard(ctx, (rx + rw - 5) * TILE_SIZE, (ry + 1) * TILE_SIZE);
      drawPlant(ctx, (rx + 1) * TILE_SIZE + 2, (ry + 1) * TILE_SIZE + 2);
      drawPlant(ctx, (rx + rw - 3) * TILE_SIZE, (ry + rh - 3) * TILE_SIZE);
      drawBookshelf(ctx, (rx + 2) * TILE_SIZE, (ry + rh - 3) * TILE_SIZE);
      drawPoster(ctx, (rx + 1) * TILE_SIZE + 2, (ry + 5) * TILE_SIZE, 'chart');
    }

    if (name === 'testing') {
      drawWhiteboard(ctx, (rx + rw - 5) * TILE_SIZE, (ry + 1) * TILE_SIZE);
      drawPlant(ctx, (rx + 1) * TILE_SIZE + 2, (ry + 1) * TILE_SIZE + 2);
      drawPlant(ctx, (rx + rw - 3) * TILE_SIZE, (ry + 1) * TILE_SIZE + 2);
      drawPoster(ctx, (rx + 1) * TILE_SIZE + 2, (ry + 5) * TILE_SIZE, 'code');
    }

    // Conference table + rug
    if (name === 'conference') {
      // Rug under conference table
      const cx = (rx + rw / 2) * TILE_SIZE;
      const cy = (ry + rh / 2) * TILE_SIZE;
      drawRug(ctx, cx - 96, cy - 50, 192, 100, 'rgba(74, 63, 92, 0.35)');
      drawConferenceTable(ctx, rx, ry, rw, rh);
      drawPlant(ctx, (rx + 1) * TILE_SIZE + 2, (ry + 1) * TILE_SIZE + 2);
      drawPlant(ctx, (rx + rw - 3) * TILE_SIZE, (ry + 1) * TILE_SIZE + 2);
    }
  };

  const drawDesk = (ctx, x, y) => {
    // Desk legs
    ctx.fillStyle = '#3a2a1a';
    ctx.fillRect(x + 2, y + 22, 4, 18);
    ctx.fillRect(x + 40, y + 22, 4, 18);
    // Desk body
    ctx.fillStyle = COLORS.desk;
    ctx.fillRect(x - 2, y + 16, 50, 8);
    // Desk top surface
    ctx.fillStyle = COLORS.deskTop;
    ctx.fillRect(x - 3, y + 14, 52, 4);
    // Desk top highlight
    ctx.fillStyle = '#9B7924';
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
    ctx.fillStyle = '#0a1628';
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
    ctx.fillStyle = '#3a2f4a';
    ctx.fillRect(x + 12, y + 30, 22, 4);
    // Chair seat
    ctx.fillStyle = COLORS.chair;
    ctx.fillRect(x + 10, y + 34, 26, 10);
    // Chair cushion highlight
    ctx.fillStyle = '#5a4f6c';
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
      // Active green code
      ctx.fillStyle = '#0a2010';
      ctx.fillRect(sx, sy, 30, 14);
      // Scanlines
      ctx.fillStyle = 'rgba(0,255,0,0.03)';
      for (let i = 0; i < 7; i++) {
        ctx.fillRect(sx, sy + i * 2, 30, 1);
      }
      // Green code lines
      ctx.fillStyle = '#00cc44';
      ctx.fillRect(sx + 2, sy + 2, 10, 1);
      ctx.fillStyle = '#00ff55';
      ctx.fillRect(sx + 2, sy + 4, 16, 1);
      ctx.fillStyle = '#00cc44';
      ctx.fillRect(sx + 4, sy + 6, 12, 1);
      ctx.fillStyle = '#00ff55';
      ctx.fillRect(sx + 4, sy + 8, 8, 1);
      ctx.fillStyle = '#00cc44';
      ctx.fillRect(sx + 2, sy + 10, 18, 1);
      // Cursor blink
      if (Math.floor(Date.now() / 500) % 2 === 0) {
        ctx.fillStyle = '#00ff55';
        ctx.fillRect(sx + 22, sy + 10, 4, 2);
      }
    } else if (status === 'done') {
      // Blue success screen
      ctx.fillStyle = '#0a1628';
      ctx.fillRect(sx, sy, 30, 14);
      ctx.fillStyle = '#2196F3';
      ctx.fillRect(sx + 10, sy + 3, 10, 8);
      // Checkmark
      ctx.fillStyle = '#fff';
      ctx.fillRect(sx + 12, sy + 7, 2, 2);
      ctx.fillRect(sx + 13, sy + 8, 2, 2);
      ctx.fillRect(sx + 14, sy + 7, 2, 2);
      ctx.fillRect(sx + 15, sy + 6, 2, 2);
      ctx.fillRect(sx + 16, sy + 5, 2, 2);
    } else if (status === 'planning') {
      // Orange planning screen
      ctx.fillStyle = '#1a1008';
      ctx.fillRect(sx, sy, 30, 14);
      ctx.fillStyle = '#FF9800';
      ctx.fillRect(sx + 2, sy + 2, 6, 1);
      ctx.fillRect(sx + 2, sy + 4, 14, 1);
      ctx.fillStyle = '#FFB74D';
      ctx.fillRect(sx + 4, sy + 7, 20, 1);
      ctx.fillRect(sx + 4, sy + 9, 12, 1);
      ctx.fillStyle = '#FF9800';
      ctx.fillRect(sx + 2, sy + 11, 8, 1);
    } else {
      // Idle — screensaver
      ctx.fillStyle = '#0a0a14';
      ctx.fillRect(sx, sy, 30, 14);
      // Floating pixels screensaver
      var t = Date.now() / 2000;
      var colors = ['#1a5276', '#0f3460', '#16213e'];
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
    ctx.fillStyle = '#9B7924';
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
    ctx.fillStyle = '#888';
    ctx.fillRect(x + 4, y + 4, 12, 2);
    ctx.fillRect(x + 4, y + 8, 18, 2);
    ctx.fillRect(x + 4, y + 12, 8, 2);
    // Marker tray
    ctx.fillStyle = '#555';
    ctx.fillRect(x, y + 18, 32, 3);
    // Markers
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(x + 4, y + 18, 6, 2);
    ctx.fillStyle = '#2ecc71';
    ctx.fillRect(x + 12, y + 18, 6, 2);
    ctx.fillStyle = '#3498db';
    ctx.fillRect(x + 20, y + 18, 6, 2);
  };

  const drawHeader = (ctx) => {
    ctx.fillStyle = COLORS.headerBg;
    ctx.fillRect(0, 0, CANVAS_W, 3 * TILE_SIZE);
    ctx.fillStyle = COLORS.headerText;
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ERNE HQ', CANVAS_W / 2, 30);
    // Decorative line
    ctx.fillStyle = COLORS.wallLight;
    ctx.fillRect(CANVAS_W / 2 - 60, 38, 120, 2);
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
      ctx.fillStyle = '#d32f2f';
      ctx.font = 'bold 7px monospace';
      ctx.textAlign = 'left';
      const text = planningTask.length > 20 ? planningTask.substring(0, 19) + '\u2026' : planningTask;
      ctx.fillText(text, wx + 3, wy + 11);
    } else {
      // Static scribbles
      ctx.fillStyle = '#888';
      ctx.fillRect(wx + 4, wy + 4, 18, 2);
      ctx.fillRect(wx + 4, wy + 8, 28, 2);
      ctx.fillRect(wx + 4, wy + 12, 12, 2);
    }
    // Marker tray
    ctx.fillStyle = '#555';
    ctx.fillRect(wx, wy + 18, 48, 3);
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(wx + 4, wy + 18, 8, 2);
    ctx.fillStyle = '#FF9800';
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
    const color = status === 'planning' ? 'rgba(255, 152, 0, 0.12)' : 'rgba(76, 175, 80, 0.10)';
    const borderColor = status === 'planning' ? 'rgba(255, 152, 0, 0.35)' : 'rgba(76, 175, 80, 0.30)';

    ctx.fillStyle = color;
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 1, py + 1, pw - 2, ph - 2);
  };

  const drawOffice = (ctx, agents) => {
    if (!ctx) return;
    // Background
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

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
            fillTile(ctx, c, r, (r + c) % 2 === 0 ? '#3a3040' : '#332a3a');
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
        const status = (agents && agents[d.agent]) ? agents[d.agent].status : 'idle';
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
        if (canvasX >= ax - half && canvasX <= ax + half &&
            canvasY >= ay - half && canvasY <= ay + half) {
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
