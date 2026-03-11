/**
 * ERNE Dashboard — Procedural 32x32 pixel-art agent sprites with animations
 * Supports walking between desk and conference room positions.
 */
(function () {
  'use strict';

  const FRAME_SIZE = 32;
  const SHEET_COLS = 4;
  const SHEET_ROWS = 4;
  const SHEET_W = FRAME_SIZE * SHEET_COLS; // 128
  const SHEET_H = FRAME_SIZE * SHEET_ROWS; // 128
  const ANIM_FPS = 12;
  const MOVE_SPEED = 180; // pixels per second

  const SKIN = '#FDBCB4';
  const HAIR = '#4A3728';
  const LEGS_COLOR = '#2c3e50';

  const AGENT_DEFS = {
    architect:              { bodyColor: '#3498db', traitColor: '#2980b9', trait: 'hardhat' },
    'native-bridge-builder': { bodyColor: '#e74c3c', traitColor: '#c0392b', trait: 'wrench' },
    'expo-config-resolver': { bodyColor: '#9b59b6', traitColor: '#8e44ad', trait: 'gear' },
    'ui-designer':          { bodyColor: '#e91e63', traitColor: '#c2185b', trait: 'paintbrush' },
    'code-reviewer':        { bodyColor: '#2ecc71', traitColor: '#27ae60', trait: 'glasses' },
    'upgrade-assistant':    { bodyColor: '#f39c12', traitColor: '#e67e22', trait: 'arrow' },
    'tdd-guide':            { bodyColor: '#1abc9c', traitColor: '#16a085', trait: 'testtube' },
    'performance-profiler': { bodyColor: '#e67e22', traitColor: '#d35400', trait: 'stopwatch' },
    'senior-developer':     { bodyColor: '#3455db', traitColor: '#2a44b0', trait: 'laptop' },
    'feature-builder':      { bodyColor: '#00bcd4', traitColor: '#0097a7', trait: 'hammer' },
  };

  // Conference room seating positions (pixels) — around the table
  // Conference room: tile (27,19), size 24x14
  // Table center pixel: (27+12)*16=624, (19+7)*16=416
  const CONFERENCE_SEATS = {
    'architect':              { x: 570, y: 370 },
    'senior-developer':       { x: 610, y: 370 },
    'feature-builder':        { x: 650, y: 370 },
    'code-reviewer':          { x: 690, y: 370 },
    'native-bridge-builder':  { x: 570, y: 462 },
    'expo-config-resolver':   { x: 610, y: 462 },
    'ui-designer':            { x: 650, y: 462 },
    'upgrade-assistant':      { x: 690, y: 462 },
    'tdd-guide':              { x: 538, y: 400 },
    'performance-profiler':   { x: 538, y: 432 },
  };

  /* ---- Drawing primitives ---- */

  const drawCharacter = (ctx, ox, oy, def, headBob, typing, armOffset) => {
    const hb = headBob || 0;
    const ao = armOffset || 0;

    ctx.fillStyle = LEGS_COLOR;
    ctx.fillRect(ox + 11, oy + 24, 4, 6);
    ctx.fillRect(ox + 17, oy + 24, 4, 6);

    ctx.fillStyle = def.bodyColor;
    ctx.fillRect(ox + 9, oy + 14, 14, 11);
    ctx.fillStyle = def.traitColor;
    ctx.fillRect(ox + 14, oy + 15, 4, 3);

    ctx.fillStyle = def.bodyColor;
    ctx.fillRect(ox + 5, oy + 15 + ao, 4, 8);
    ctx.fillRect(ox + 23, oy + 15 - ao, 4, 8);

    ctx.fillStyle = SKIN;
    ctx.fillRect(ox + 5, oy + 23 + ao, 4, 3);
    ctx.fillRect(ox + 23, oy + 23 - ao, 4, 3);

    ctx.fillStyle = SKIN;
    ctx.fillRect(ox + 10, oy + 4 + hb, 12, 11);

    ctx.fillStyle = HAIR;
    ctx.fillRect(ox + 9, oy + 3 + hb, 14, 4);
    ctx.fillRect(ox + 9, oy + 4 + hb, 2, 6);

    ctx.fillStyle = '#222';
    ctx.fillRect(ox + 13, oy + 8 + hb, 2, 2);
    ctx.fillRect(ox + 18, oy + 8 + hb, 2, 2);

    ctx.fillStyle = '#c0392b';
    ctx.fillRect(ox + 14, oy + 12 + hb, 4, 1);

    drawTrait(ctx, ox, oy + hb, def);
  };

  const drawWalkingCharacter = (ctx, ox, oy, def, legOffset) => {
    const lo = legOffset || 0;

    ctx.fillStyle = LEGS_COLOR;
    ctx.fillRect(ox + 11, oy + 24 + lo, 4, 6);
    ctx.fillRect(ox + 17, oy + 24 - lo, 4, 6);

    ctx.fillStyle = def.bodyColor;
    ctx.fillRect(ox + 9, oy + 14, 14, 11);
    ctx.fillStyle = def.traitColor;
    ctx.fillRect(ox + 14, oy + 15, 4, 3);

    ctx.fillStyle = def.bodyColor;
    ctx.fillRect(ox + 5, oy + 15 - lo, 4, 8);
    ctx.fillRect(ox + 23, oy + 15 + lo, 4, 8);
    ctx.fillStyle = SKIN;
    ctx.fillRect(ox + 5, oy + 23 - lo, 4, 3);
    ctx.fillRect(ox + 23, oy + 23 + lo, 4, 3);

    ctx.fillStyle = SKIN;
    ctx.fillRect(ox + 10, oy + 4, 12, 11);
    ctx.fillStyle = HAIR;
    ctx.fillRect(ox + 9, oy + 3, 14, 4);
    ctx.fillRect(ox + 9, oy + 4, 2, 6);
    ctx.fillStyle = '#222';
    ctx.fillRect(ox + 13, oy + 8, 2, 2);
    ctx.fillRect(ox + 18, oy + 8, 2, 2);
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(ox + 14, oy + 12, 4, 1);

    drawTrait(ctx, ox, oy, def);
  };

  const drawTrait = (ctx, ox, oy, def) => {
    switch (def.trait) {
      case 'hardhat':
        ctx.fillStyle = '#f1c40f';
        ctx.fillRect(ox + 8, oy + 1, 16, 4);
        ctx.fillRect(ox + 10, oy - 1, 12, 3);
        break;
      case 'wrench':
        ctx.fillStyle = def.traitColor;
        ctx.fillRect(ox + 24, oy + 5, 3, 8);
        ctx.fillRect(ox + 23, oy + 4, 5, 3);
        break;
      case 'gear':
        ctx.fillStyle = def.traitColor;
        ctx.fillRect(ox + 25, oy + 5, 5, 5);
        ctx.fillStyle = def.bodyColor;
        ctx.fillRect(ox + 26, oy + 6, 3, 3);
        break;
      case 'paintbrush':
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(ox + 25, oy + 6, 2, 10);
        ctx.fillStyle = def.traitColor;
        ctx.fillRect(ox + 24, oy + 4, 4, 3);
        break;
      case 'glasses':
        ctx.fillStyle = '#FFD700';
        ctx.fillRect(ox + 11, oy + 7, 6, 4);
        ctx.fillRect(ox + 16, oy + 7, 6, 4);
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(ox + 12, oy + 8, 4, 2);
        ctx.fillRect(ox + 17, oy + 8, 4, 2);
        ctx.fillStyle = '#FFD700';
        ctx.fillRect(ox + 17, oy + 8, 1, 1);
        break;
      case 'arrow':
        ctx.fillStyle = def.traitColor;
        ctx.fillRect(ox + 25, oy + 4, 3, 8);
        ctx.fillStyle = '#fff';
        ctx.fillRect(ox + 24, oy + 3, 5, 3);
        ctx.fillRect(ox + 25, oy + 2, 3, 2);
        break;
      case 'testtube':
        ctx.fillStyle = '#ecf0f1';
        ctx.fillRect(ox + 25, oy + 4, 3, 10);
        ctx.fillStyle = '#2ecc71';
        ctx.fillRect(ox + 25, oy + 10, 3, 4);
        ctx.fillRect(ox + 24, oy + 13, 5, 2);
        break;
      case 'stopwatch':
        ctx.fillStyle = def.traitColor;
        ctx.fillRect(ox + 24, oy + 4, 6, 6);
        ctx.fillStyle = '#fff';
        ctx.fillRect(ox + 25, oy + 5, 4, 4);
        ctx.fillStyle = '#333';
        ctx.fillRect(ox + 27, oy + 5, 1, 3);
        ctx.fillRect(ox + 26, oy + 3, 2, 2);
        break;
      case 'laptop':
        ctx.fillStyle = '#333';
        ctx.fillRect(ox + 23, oy + 8, 7, 5);
        ctx.fillStyle = '#5dade2';
        ctx.fillRect(ox + 24, oy + 9, 5, 3);
        ctx.fillStyle = '#555';
        ctx.fillRect(ox + 22, oy + 13, 9, 2);
        break;
      case 'hammer':
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(ox + 26, oy + 6, 2, 10);
        ctx.fillStyle = def.traitColor;
        ctx.fillRect(ox + 23, oy + 3, 8, 4);
        break;
    }
  };

  const drawCheckmark = (ctx, ox, oy, frame) => {
    const bounce = Math.max(0, 3 - frame);
    ctx.fillStyle = '#2ecc71';
    ctx.fillRect(ox + 10, oy - 6 - bounce, 12, 10);
    ctx.fillStyle = '#fff';
    ctx.fillRect(ox + 13, oy - 2 - bounce, 2, 2);
    ctx.fillRect(ox + 14, oy - 1 - bounce, 2, 2);
    ctx.fillRect(ox + 15, oy - 2 - bounce, 2, 2);
    ctx.fillRect(ox + 16, oy - 3 - bounce, 2, 2);
    ctx.fillRect(ox + 17, oy - 4 - bounce, 2, 2);
  };

  /* ---- Sprite sheet generation ---- */

  const generateSpriteSheet = (agentName) => {
    const def = AGENT_DEFS[agentName];
    if (!def) return null;

    const canvas = document.createElement('canvas');
    canvas.width = SHEET_W;
    canvas.height = SHEET_H;
    const ctx = canvas.getContext('2d');

    // Row 0: IDLE (4 frames, head bob on frames 1,2)
    for (let f = 0; f < 4; f++) {
      const hb = (f === 1 || f === 2) ? -1 : 0;
      drawCharacter(ctx, f * FRAME_SIZE, 0, def, hb, false, 0);
    }

    // Row 1: WORKING (4 frames, typing arm offset alternating)
    for (let f = 0; f < 4; f++) {
      const ao = (f % 2 === 0) ? -2 : 2;
      drawCharacter(ctx, f * FRAME_SIZE, FRAME_SIZE, def, 0, true, ao);
    }

    // Row 2: MOVING (4 frames, walk cycle leg offset)
    const legOffsets = [-2, 0, 2, 0];
    for (let f = 0; f < 4; f++) {
      drawWalkingCharacter(ctx, f * FRAME_SIZE, FRAME_SIZE * 2, def, legOffsets[f]);
    }

    // Row 3: DONE (4 frames, checkmark popup)
    for (let f = 0; f < 4; f++) {
      drawCharacter(ctx, f * FRAME_SIZE, FRAME_SIZE * 3, def, 0, false, 0);
      drawCheckmark(ctx, f * FRAME_SIZE, FRAME_SIZE * 3, f);
    }

    return canvas;
  };

  /* ---- State manager ---- */

  const STATUS_TO_ROW = {
    idle: 0,
    working: 1,
    moving: 2,
    done: 3,
    planning: 0, // seated at conference table, use idle animation
  };

  const agentSprites = {};

  const initAgentSprites = () => {
    for (const name of Object.keys(AGENT_DEFS)) {
      const pos = window.OfficeCanvas.getAgentDeskPosition(name);
      if (!pos) continue;
      agentSprites[name] = {
        sheet: generateSpriteSheet(name),
        x: pos.x,
        y: pos.y,
        homeX: pos.x,
        homeY: pos.y,
        targetX: pos.x,
        targetY: pos.y,
        status: 'idle',
        isMoving: false,
        pendingStatus: null,
        frame: 0,
        frameTimer: 0,
      };
    }
  };

  const updateAgentState = (name, status) => {
    const sprite = agentSprites[name];
    if (!sprite) return;

    if (status === 'planning') {
      // Move to conference room
      const seat = CONFERENCE_SEATS[name];
      if (seat) {
        sprite.targetX = seat.x;
        sprite.targetY = seat.y;
        sprite.isMoving = true;
        sprite.pendingStatus = 'planning';
      }
    } else if (sprite.status === 'planning' || sprite.pendingStatus === 'planning') {
      // Return to desk
      sprite.targetX = sprite.homeX;
      sprite.targetY = sprite.homeY;
      sprite.isMoving = true;
      sprite.pendingStatus = status;
    } else {
      sprite.status = status;
      sprite.frame = 0;
      sprite.frameTimer = 0;
    }
  };

  const updateAgentSprites = (dt) => {
    for (const [name, sprite] of Object.entries(agentSprites)) {
      // Handle movement
      if (sprite.isMoving) {
        const dx = sprite.targetX - sprite.x;
        const dy = sprite.targetY - sprite.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 3) {
          // Arrived
          sprite.x = sprite.targetX;
          sprite.y = sprite.targetY;
          sprite.isMoving = false;
          if (sprite.pendingStatus) {
            sprite.status = sprite.pendingStatus;
            sprite.pendingStatus = null;
            sprite.frame = 0;
            sprite.frameTimer = 0;
          }
        } else {
          const step = MOVE_SPEED * dt;
          sprite.x += (dx / dist) * Math.min(step, dist);
          sprite.y += (dy / dist) * Math.min(step, dist);
        }
      }

      // Advance animation
      sprite.frameTimer += dt;
      const frameDuration = 1 / ANIM_FPS;
      if (sprite.frameTimer >= frameDuration) {
        sprite.frameTimer -= frameDuration;
        sprite.frame = (sprite.frame + 1) % SHEET_COLS;
      }
    }
  };

  const STATUS_DOT_COLORS = {
    idle: '#9E9E9E',
    working: '#4CAF50',
    done: '#2196F3',
    planning: '#FF9800',
  };

  const drawAgentSprites = (ctx) => {
    for (const [name, sprite] of Object.entries(agentSprites)) {
      // Use moving row while walking, otherwise status row
      const row = sprite.isMoving
        ? STATUS_TO_ROW.moving
        : (STATUS_TO_ROW[sprite.status] || 0);
      const sx = sprite.frame * FRAME_SIZE;
      const sy = row * FRAME_SIZE;

      ctx.drawImage(
        sprite.sheet,
        sx, sy, FRAME_SIZE, FRAME_SIZE,
        sprite.x - FRAME_SIZE / 2, sprite.y - FRAME_SIZE / 2,
        FRAME_SIZE, FRAME_SIZE
      );

      // Status dot
      const dotColor = sprite.isMoving
        ? '#FF9800'
        : (STATUS_DOT_COLORS[sprite.status] || '#9E9E9E');
      ctx.fillStyle = dotColor;
      ctx.beginPath();
      ctx.arc(sprite.x, sprite.y - FRAME_SIZE / 2 - 4, 3, 0, Math.PI * 2);
      ctx.fill();

      // Name label
      ctx.fillStyle = '#E0E0E0';
      ctx.font = '8px monospace';
      ctx.textAlign = 'center';
      const shortName = name.length > 12 ? name.substring(0, 11) + '\u2026' : name;
      ctx.fillText(shortName, sprite.x, sprite.y + FRAME_SIZE / 2 + 8);
    }
  };

  window.AgentSprites = {
    AGENT_DEFS,
    agentSprites,
    initAgentSprites,
    updateAgentState,
    updateAgentSprites,
    drawAgentSprites,
  };
})();
