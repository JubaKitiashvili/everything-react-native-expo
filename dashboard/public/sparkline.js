(function () {
  'use strict';

  function sanitizeColor(c) {
    if (!c || typeof c !== 'string') return null;
    // Allow hex, rgb(), rgba(), hsl(), hsla(), and named colors only
    if (/^#[0-9a-fA-F]{3,8}$/.test(c)) return c;
    if (/^(rgb|rgba|hsl|hsla)\(\s*[\d.,\s%]+\)$/.test(c)) return c;
    if (/^[a-zA-Z]{1,20}$/.test(c)) return c;
    return null;
  }

  function draw(canvasEl, dataPoints, opts) {
    if (!canvasEl || !dataPoints || dataPoints.length < 2) return;

    var o = opts || {};
    var w = o.width || 120;
    var h = o.height || 30;
    var color = sanitizeColor(o.color) || '#4CAF50';
    var fillColor = sanitizeColor(o.fillColor) || 'rgba(76,175,80,0.1)';
    var lineWidth = o.lineWidth || 1.5;

    canvasEl.width = w;
    canvasEl.height = h;
    var ctx = canvasEl.getContext('2d');

    var min = Math.min.apply(null, dataPoints);
    var max = Math.max.apply(null, dataPoints);
    var range = max - min || 1;

    var stepX = w / (dataPoints.length - 1);
    var padding = 2;
    var plotH = h - padding * 2;

    // Build points
    var points = dataPoints.map(function (val, i) {
      var x = i * stepX;
      var y = padding + plotH - ((val - min) / range) * plotH;
      return { x: x, y: y };
    });

    // Fill area
    ctx.beginPath();
    ctx.moveTo(points[0].x, h);
    points.forEach(function (p) { ctx.lineTo(p.x, p.y); });
    ctx.lineTo(points[points.length - 1].x, h);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();

    // Draw line
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (var i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    // End dot
    var last = points[points.length - 1];
    ctx.beginPath();
    ctx.arc(last.x, last.y, 2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  window.Sparkline = { draw: draw };
})();
