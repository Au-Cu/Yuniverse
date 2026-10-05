(function exposePetCore(root) {
  'use strict';

  const ANIMATIONS = Object.freeze({
    idle: { row: 0, frames: 6, durations: [280, 110, 110, 140, 140, 320] },
    walking: { row: 1, frames: 8, durations: [120, 120, 120, 120, 120, 120, 120, 220] },
    waving: { row: 3, frames: 4, durations: [140, 140, 140, 280] },
    sleeping: { row: 5, frames: 8, durations: [140, 140, 140, 140, 140, 140, 140, 240] }
  });

  function vectorToDirectionIndex(dx, dy) {
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return null;
    const clockwiseFromUp = (Math.atan2(dx, -dy) * 180) / Math.PI;
    return Math.round(((clockwiseFromUp + 360) % 360) / 22.5) % 16;
  }

  function directionToCell(index) {
    if (!Number.isInteger(index) || index < 0 || index > 15) return null;
    return index < 8
      ? { row: 9, column: index }
      : { row: 10, column: index - 8 };
  }

  function correctedLookColumn(index) {
    if (!Number.isInteger(index)) return null;
    if (index >= 0 && index <= 3) return index;
    if (index >= 13 && index <= 15) return index - 9;
    return null;
  }

  function horizontalDirection(currentCenterX, cursorX, tolerance = 10) {
    if (!Number.isFinite(currentCenterX) || !Number.isFinite(cursorX)) return 0;
    const delta = cursorX - currentCenterX;
    if (Math.abs(delta) <= Math.max(0, tolerance)) return 0;
    return delta > 0 ? 1 : -1;
  }

  function reachableTargetCenterX(cursorX, bounds, workArea) {
    if (
      !Number.isFinite(cursorX)
      || !bounds
      || !workArea
      || !Number.isFinite(bounds.width)
      || !Number.isFinite(workArea.x)
      || !Number.isFinite(workArea.width)
    ) return cursorX;

    const halfWidth = Math.max(0, bounds.width) / 2;
    const minimum = workArea.x + halfWidth;
    const maximum = workArea.x + workArea.width - halfWidth;
    if (maximum < minimum) return workArea.x + workArea.width / 2;
    return Math.min(maximum, Math.max(minimum, cursorX));
  }

  const api = Object.freeze({
    ANIMATIONS,
    vectorToDirectionIndex,
    directionToCell,
    correctedLookColumn,
    horizontalDirection,
    reachableTargetCenterX
  });
  root.PetCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
