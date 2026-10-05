'use strict';

const { app, nativeImage } = require('electron');
const path = require('node:path');

const WIDTH = 1536;
const HEIGHT = 2288;
const CELL_WIDTH = 192;
const CELL_HEIGHT = 208;
const REQUIRED = [6, 8, 8, 4, 5, 8, 6, 6, 6, 8, 8];
const FILES = ['just-big-cat.png', 'just-alien-cat.png', 'just-minbird.png'];
const SITTING_FILES = ['just-big-sit.png', 'just-alien-sit.png', 'just-minbird-rest.png'];
const LOOK_FILES = ['just-big-look-up.png', 'just-alien-look-up.png', 'just-minbird-look-up.png'];

function alphaCount(bitmap, imageWidth, row, column) {
  let count = 0;
  const startX = column * CELL_WIDTH;
  const startY = row * CELL_HEIGHT;
  for (let y = startY; y < startY + CELL_HEIGHT; y += 1) {
    for (let x = startX; x < startX + CELL_WIDTH; x += 1) {
      if (bitmap[(y * imageWidth + x) * 4 + 3] > 0) count += 1;
    }
  }
  return count;
}

function verifyMinbirdLegMotion(bitmap, imageWidth, failures) {
  const leftCentroids = [];
  const rightCentroids = [];
  const lowestPixels = [];
  for (let column = 0; column < 8; column += 1) {
    let leftX = 0;
    let leftCount = 0;
    let rightX = 0;
    let rightCount = 0;
    let lowestY = -1;
    for (let localY = 166; localY < CELL_HEIGHT; localY += 1) {
      for (let localX = 71; localX < CELL_WIDTH; localX += 1) {
        const x = column * CELL_WIDTH + localX;
        const y = CELL_HEIGHT + localY;
        const offset = (y * imageWidth + x) * 4;
        const blue = bitmap[offset];
        const green = bitmap[offset + 1];
        const red = bitmap[offset + 2];
        const alpha = bitmap[offset + 3];
        const brownLeg = alpha > 10 && red > 50 && red > green * 1.10 && red - blue > 25;
        const darkClaw = alpha > 10 && localY > 177 && red < 105 && green < 90 && blue < 85;
        if (!brownLeg && !darkClaw) continue;
        lowestY = Math.max(lowestY, localY);
        if (localX < 112) {
          leftX += localX;
          leftCount += 1;
        } else {
          rightX += localX;
          rightCount += 1;
        }
      }
    }
    if (!leftCount || !rightCount) {
      failures.push(`just-minbird.png: walking frame ${column} is missing a readable leg`);
      return;
    }
    leftCentroids.push(leftX / leftCount);
    rightCentroids.push(rightX / rightCount);
    lowestPixels.push(lowestY);
  }

  const range = (values) => Math.max(...values) - Math.min(...values);
  if (range(leftCentroids) < 5 || range(rightCentroids) < 4 || range(lowestPixels) < 5) {
    failures.push('just-minbird.png: walking feet do not articulate independently enough');
  } else {
    console.log('OK just-minbird.png: eight walking frames contain independent two-foot motion');
  }
}

function verifyAlienDownEye(bitmap, imageWidth, failures) {
  const frameStartX = 6 * CELL_WIDTH;
  const frameStartY = 9 * CELL_HEIGHT;
  let gaps = 0;
  for (let localY = 120; localY <= 126; localY += 1) {
    let first = null;
    let last = null;
    for (let localX = 101; localX <= 140; localX += 1) {
      const offset = ((frameStartY + localY) * imageWidth + frameStartX + localX) * 4;
      const luminance = bitmap[offset + 2] * 0.2126
        + bitmap[offset + 1] * 0.7152
        + bitmap[offset] * 0.0722;
      if (luminance < 80) {
        if (first === null) first = localX;
        last = localX;
      }
    }
    if (first === null || last === null) {
      gaps += 1;
      continue;
    }
    for (let localX = first; localX <= last; localX += 1) {
      const offset = ((frameStartY + localY) * imageWidth + frameStartX + localX) * 4;
      const luminance = bitmap[offset + 2] * 0.2126
        + bitmap[offset + 1] * 0.7152
        + bitmap[offset] * 0.0722;
      if (luminance >= 80) gaps += 1;
    }
  }
  if (gaps) failures.push(`just-alien-cat.png: lower-right eye contains ${gaps} split pixels`);
  else console.log('OK just-alien-cat.png: lower-right eye is one continuous solid shape');
}

function verifyUpperLookContours(file, bitmap, imageWidth, failures) {
  let missingDarkBands = 0;
  const directionsWithNearSideEyes = [1, 2, 3, 4, 5, 6];

  for (const column of directionsWithNearSideEyes) {
    const frameStartX = column * CELL_WIDTH;
    for (let localY = 55; localY <= 102; localY += 1) {
      let left = null;
      let right = null;
      for (let localX = 0; localX < CELL_WIDTH; localX += 1) {
        const alpha = bitmap[(localY * imageWidth + frameStartX + localX) * 4 + 3];
        if (alpha > 48) {
          if (left === null) left = localX;
          right = localX;
        }
      }
      if (left === null || right === null) continue;

      for (const [edge, step] of [[left, 1], [right, -1]]) {
        let darkBand = false;
        for (let depth = 0; depth <= 5; depth += 1) {
          const localX = edge + step * depth;
          if (localX < 0 || localX >= CELL_WIDTH) continue;
          const offset = (localY * imageWidth + frameStartX + localX) * 4;
          const alpha = bitmap[offset + 3];
          if (alpha < 96) continue;
          const factor = 255 / alpha;
          const luminance = Math.min(255, bitmap[offset + 2] * factor) * 0.2126
            + Math.min(255, bitmap[offset + 1] * factor) * 0.7152
            + Math.min(255, bitmap[offset] * factor) * 0.0722;
          if (luminance < 110) {
            darkBand = true;
            break;
          }
        }
        if (!darkBand) missingDarkBands += 1;
      }
    }
  }

  if (missingDarkBands > 4) {
    failures.push(`${file}: upper-turn cheek contour has ${missingDarkBands} unoutlined edge rows`);
  } else {
    console.log(`OK ${file}: upper-turn cheek contour has no protruding fill block`);
  }
}

function verifyUpperLookEyes(file, bitmap, imageWidth, failures) {
  for (let column = 0; column < 7; column += 1) {
    const frameStartX = column * CELL_WIDTH;
    const minX = 34;
    const maxX = 158;
    const minY = 44;
    const maxY = 120;
    const visited = new Uint8Array(CELL_WIDTH * CELL_HEIGHT);
    const components = [];

    for (let localY = minY; localY <= maxY; localY += 1) {
      for (let localX = minX; localX <= maxX; localX += 1) {
        const localIndex = localY * CELL_WIDTH + localX;
        if (visited[localIndex]) continue;
        const offset = (localY * imageWidth + frameStartX + localX) * 4;
        const alpha = bitmap[offset + 3];
        const factor = alpha ? 255 / alpha : 1;
        const luminance = Math.min(255, bitmap[offset + 2] * factor) * 0.2126
          + Math.min(255, bitmap[offset + 1] * factor) * 0.7152
          + Math.min(255, bitmap[offset] * factor) * 0.0722;
        if (alpha < 128 || luminance >= 90) continue;

        const queue = [localIndex];
        visited[localIndex] = 1;
        let cursor = 0;
        let count = 0;
        let componentMinX = CELL_WIDTH;
        let componentMaxX = -1;
        let componentMinY = CELL_HEIGHT;
        let componentMaxY = -1;
        let touchesRegionBoundary = false;
        while (cursor < queue.length) {
          const current = queue[cursor++];
          const x = current % CELL_WIDTH;
          const y = Math.floor(current / CELL_WIDTH);
          count += 1;
          componentMinX = Math.min(componentMinX, x);
          componentMaxX = Math.max(componentMaxX, x);
          componentMinY = Math.min(componentMinY, y);
          componentMaxY = Math.max(componentMaxY, y);
          touchesRegionBoundary ||= x === minX || x === maxX || y === minY || y === maxY;
          for (let yOffset = -1; yOffset <= 1; yOffset += 1) {
            for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
              if (xOffset === 0 && yOffset === 0) continue;
              const nextX = x + xOffset;
              const nextY = y + yOffset;
              if (nextX < minX || nextX > maxX || nextY < minY || nextY > maxY) continue;
              const nextIndex = nextY * CELL_WIDTH + nextX;
              if (visited[nextIndex]) continue;
              const nextOffset = (nextY * imageWidth + frameStartX + nextX) * 4;
              const nextAlpha = bitmap[nextOffset + 3];
              const nextFactor = nextAlpha ? 255 / nextAlpha : 1;
              const nextLuminance = Math.min(255, bitmap[nextOffset + 2] * nextFactor) * 0.2126
                + Math.min(255, bitmap[nextOffset + 1] * nextFactor) * 0.7152
                + Math.min(255, bitmap[nextOffset] * nextFactor) * 0.0722;
              if (nextAlpha >= 128 && nextLuminance < 90) {
                visited[nextIndex] = 1;
                queue.push(nextIndex);
              }
            }
          }
        }
        if (!touchesRegionBoundary && count >= 150) {
          components.push({
            count,
            width: componentMaxX - componentMinX + 1,
            height: componentMaxY - componentMinY + 1
          });
        }
      }
    }

    const eyes = components.sort((a, b) => b.count - a.count).slice(0, 2);
    if (eyes.length !== 2) {
      failures.push(`${file}: corrected look cell ${column} does not contain two complete eyes`);
      continue;
    }
    for (const eye of eyes) {
      const fillRatio = eye.count / (eye.width * eye.height);
      const minimumFillRatio = column === 3 || column === 4 ? 0.685 : 0.65;
      if (fillRatio < minimumFillRatio) {
        failures.push(`${file}: corrected look cell ${column} contains a clipped eye (${fillRatio.toFixed(3)} fill ratio)`);
      }
    }
  }
  if (!failures.some((failure) => failure.startsWith(`${file}: corrected look cell`))) {
    console.log(`OK ${file}: all upper-turn eyes are continuous and complete`);
  }
}

app.whenReady().then(() => {
  const failures = [];
  const notices = [];
  for (const file of FILES) {
    const filePath = path.join(__dirname, '..', 'assets', file);
    const image = nativeImage.createFromPath(filePath);
    const size = image.getSize();
    if (image.isEmpty() || size.width !== WIDTH || size.height !== HEIGHT) {
      failures.push(`${file}: expected ${WIDTH}x${HEIGHT}, got ${size.width}x${size.height}`);
      continue;
    }
    const bitmap = image.toBitmap();
    for (let row = 0; row < REQUIRED.length; row += 1) {
      for (let column = 0; column < 8; column += 1) {
        const pixels = alphaCount(bitmap, WIDTH, row, column);
        if (column < REQUIRED[row] && pixels === 0) {
          failures.push(`${file}: required cell row ${row}, column ${column} is empty`);
        }
        if (row === 0 && column === 6 && pixels !== 0) {
          notices.push(`${file}: preserved legacy idle pose at row 0, column 6 (runtime intentionally ignores it)`);
        } else if (column >= REQUIRED[row] && pixels !== 0) {
          failures.push(`${file}: unused cell row ${row}, column ${column} is not transparent`);
        }
      }
    }
    console.log(`OK ${file}: v2 atlas, 73 populated frames`);
    if (file === 'just-minbird.png') verifyMinbirdLegMotion(bitmap, WIDTH, failures);
    if (file === 'just-alien-cat.png') verifyAlienDownEye(bitmap, WIDTH, failures);
  }

  for (const file of SITTING_FILES) {
    const filePath = path.join(__dirname, '..', 'assets', file);
    const image = nativeImage.createFromPath(filePath);
    const size = image.getSize();
    if (image.isEmpty() || size.width !== CELL_WIDTH || size.height !== CELL_HEIGHT) {
      failures.push(`${file}: expected ${CELL_WIDTH}x${CELL_HEIGHT}, got ${size.width}x${size.height}`);
      continue;
    }
    const bitmap = image.toBitmap();
    let visiblePixels = 0;
    for (let index = 3; index < bitmap.length; index += 4) {
      if (bitmap[index] > 0) visiblePixels += 1;
    }
    if (visiblePixels < 3000) failures.push(`${file}: sitting sprite is unexpectedly sparse`);
    else console.log(`OK ${file}: ${CELL_WIDTH}x${CELL_HEIGHT}, ${visiblePixels} visible pixels`);

    if (file === 'just-minbird-rest.png') {
      const atlas = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'just-minbird.png'));
      const atlasBitmap = atlas.toBitmap();
      let maximumAlphaDelta = 0;
      let opaqueColorMismatches = 0;
      for (let y = 0; y < CELL_HEIGHT; y += 1) {
        for (let x = 0; x < CELL_WIDTH; x += 1) {
          const sittingOffset = (y * CELL_WIDTH + x) * 4;
          const atlasOffset = (y * WIDTH + x) * 4;
          const sittingAlpha = bitmap[sittingOffset + 3];
          const atlasAlpha = atlasBitmap[atlasOffset + 3];
          maximumAlphaDelta = Math.max(maximumAlphaDelta, Math.abs(sittingAlpha - atlasAlpha));
          if (sittingAlpha <= 240 || atlasAlpha <= 240) continue;
          for (let channel = 0; channel < 3; channel += 1) {
            if (Math.abs(bitmap[sittingOffset + channel] - atlasBitmap[atlasOffset + channel]) > 3) {
              opaqueColorMismatches += 1;
              break;
            }
          }
        }
      }
      // GDI+ and Electron use slightly different premultiplied-alpha rounding,
      // so tolerate a small edge-only mismatch while rejecting another pose.
      if (maximumAlphaDelta > 3 || opaqueColorMismatches > 1000) {
        failures.push(
          'just-minbird-rest.png: sitting no longer matches the awake normal pose'
          + ` (alpha delta ${maximumAlphaDelta}, opaque mismatches ${opaqueColorMismatches})`
        );
      } else {
        console.log('OK just-minbird-rest.png: sitting matches the awake normal pose');
      }
    }
  }

  for (const file of LOOK_FILES) {
    const filePath = path.join(__dirname, '..', 'assets', file);
    const image = nativeImage.createFromPath(filePath);
    const size = image.getSize();
    const expectedWidth = CELL_WIDTH * 7;
    if (image.isEmpty() || size.width !== expectedWidth || size.height !== CELL_HEIGHT) {
      failures.push(`${file}: expected ${expectedWidth}x${CELL_HEIGHT}, got ${size.width}x${size.height}`);
      continue;
    }
    const bitmap = image.toBitmap();
    let transparentPixels = 0;
    for (let index = 3; index < bitmap.length; index += 4) {
      if (bitmap[index] === 0) transparentPixels += 1;
    }
    for (let column = 0; column < 7; column += 1) {
      const visiblePixels = alphaCount(bitmap, expectedWidth, 0, column);
      if (visiblePixels < 3000) {
        failures.push(`${file}: corrected look cell ${column} is unexpectedly sparse`);
      }
    }
    if (file === 'just-big-look-up.png' || file === 'just-alien-look-up.png') {
      verifyUpperLookContours(file, bitmap, expectedWidth, failures);
      verifyUpperLookEyes(file, bitmap, expectedWidth, failures);
    }
    if (transparentPixels === 0) failures.push(`${file}: corrected look strip has no transparency`);
    else console.log(`OK ${file}: seven corrected upper-look frames`);
  }

  if (failures.length) {
    for (const failure of failures) console.error(failure);
    app.exit(1);
  } else {
    for (const notice of notices) console.log(`NOTICE ${notice}`);
    app.exit(0);
  }
});
