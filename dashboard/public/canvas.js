/**
 * ERNE Dashboard — Pixel-art office canvas renderer
 * Draws 4 rooms with walls, floors, doors, desks, and computers.
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
  };

  const ROOMS = {
    development: { x: 1, y: 3, w: 24, h: 14 },
    review: { x: 27, y: 3, w: 24, h: 14 },
    testing: { x: 1, y: 19, w: 24, h: 14 },
    conference: { x: 27, y: 19, w: 24, h: 14 },
  };

  const DESK_POSITIONS = {
    development: [
      { x: 4, y: 4, agent: 'architect' },
      { x: 12, y: 4, agent: 'native-bridge-builder' },
      { x: 4, y: 9, agent: 'expo-config-resolver' },
      { x: 12, y: 9, agent: 'ui-designer' },
      { x: 20, y: 4, agent: 'senior-developer' },
      { x: 20, y: 9, agent: 'feature-builder' },
    ],
    review: [
      { x: 4, y: 4, agent: 'code-reviewer' },
      { x: 12, y: 4, agent: 'upgrade-assistant' },
    ],
    testing: [
      { x: 4, y: 4, agent: 'tdd-guide' },
      { x: 12, y: 4, agent: 'performance-profiler' },
    ],
    conference: [],
  };

  const ROOM_LABELS = {
    development: 'DEVELOPMENT',
    review: 'CODE REVIEW',
    testing: 'TESTING',
    conference: 'CONFERENCE',
  };

  /* ---- Drawing helpers ---- */

  const fillTile = (ctx, col, row, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
  };

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

    // Whiteboards for development and testing
    if (name === 'development' || name === 'testing') {
      drawWhiteboard(ctx, (rx + 20) * TILE_SIZE, (ry + 1) * TILE_SIZE);
    }

    // Conference table
    if (name === 'conference') {
      drawConferenceTable(ctx, rx, ry, rw, rh);
    }
  };

  const drawDesk = (ctx, x, y) => {
    // Desk body
    ctx.fillStyle = COLORS.desk;
    ctx.fillRect(x, y + 12, 32, 18);
    // Desk top
    ctx.fillStyle = COLORS.deskTop;
    ctx.fillRect(x - 2, y + 10, 36, 4);
    // Computer monitor
    ctx.fillStyle = COLORS.computer;
    ctx.fillRect(x + 8, y, 16, 12);
    // Screen
    ctx.fillStyle = COLORS.computerScreen;
    ctx.fillRect(x + 10, y + 2, 12, 8);
    // Screen glow
    ctx.fillStyle = '#0f3460';
    ctx.fillRect(x + 11, y + 3, 10, 6);
    // Keyboard
    ctx.fillStyle = '#333';
    ctx.fillRect(x + 6, y + 14, 20, 4);
    // Chair
    ctx.fillStyle = COLORS.chair;
    ctx.fillRect(x + 10, y + 22, 12, 8);
    ctx.fillRect(x + 12, y + 18, 8, 4);
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

  const drawOffice = (ctx) => {
    // Background
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    drawHeader(ctx);

    // Hallway floor between rooms
    for (let r = 0; r < OFFICE_ROWS; r++) {
      for (let c = 0; c < OFFICE_COLS; c++) {
        // Only fill hallway areas (outside rooms, below header)
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
    for (const [name, room] of Object.entries(ROOMS)) {
      drawRoom(ctx, room, name);
    }
  };

  const getAgentDeskPosition = (agentName) => {
    for (const [roomName, desks] of Object.entries(DESK_POSITIONS)) {
      for (const d of desks) {
        if (d.agent === agentName) {
          const room = ROOMS[roomName];
          return {
            x: (room.x + d.x) * TILE_SIZE + 10,
            y: (room.y + d.y) * TILE_SIZE + 20,
            room: roomName,
          };
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
    drawOffice,
    getAgentDeskPosition,
  };
})();
