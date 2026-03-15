'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');

// We test the pure point calculation logic. The canvas drawing is tested manually.
describe('sparkline point calculation', () => {
  function computePoints(dataPoints, w, h, padding) {
    var min = Math.min.apply(null, dataPoints);
    var max = Math.max.apply(null, dataPoints);
    var range = max - min || 1;
    var stepX = w / (dataPoints.length - 1);
    var plotH = h - padding * 2;
    return dataPoints.map(function (val, i) {
      return { x: i * stepX, y: padding + plotH - ((val - min) / range) * plotH };
    });
  }

  it('normalizes points within canvas bounds', () => {
    var points = computePoints([0, 50, 100], 120, 30, 2);
    assert.strictEqual(points.length, 3);
    assert.strictEqual(points[0].y, 28); // min value at bottom
    assert.strictEqual(points[2].y, 2);  // max value at top
  });

  it('handles flat data (all same values)', () => {
    var points = computePoints([50, 50, 50], 120, 30, 2);
    points.forEach(function (p) {
      assert.ok(p.y >= 2 && p.y <= 28);
    });
  });

  it('spaces X coordinates evenly', () => {
    var points = computePoints([10, 20, 30, 40], 120, 30, 2);
    assert.strictEqual(points[0].x, 0);
    assert.strictEqual(points[1].x, 40);
    assert.strictEqual(points[2].x, 80);
    assert.strictEqual(points[3].x, 120);
  });
});
