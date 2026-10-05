'use strict';

const { app, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const W = 192;
const H = 208;
// Stored left-to-right in the strip as: up, upper-right (3), upper-left (3).
// Keep the first-edition head turn and face drawing intact.  Its only visual
// problem was that the face sat too high inside the head, making the cat look
// as if it had thrown its head all the way back.  The corrected frames move
// that original face down as one rigid drawing; eyes, nose, mouth and mole are
// never independently rotated or stretched.
const UPPER_DIRECTIONS = [0, 1, 2, 3, 13, 14, 15];
const OLD_FACE_REGIONS = [
  { minX: 48, maxX: 146, minY: 21, maxY: 68 },
  { minX: 46, maxX: 142, minY: 26, maxY: 84 },
  { minX: 41, maxX: 137, minY: 34, maxY: 100 },
  { minX: 42, maxX: 134, minY: 39, maxY: 108 }
];
const FACE_OFFSETS = [
  { x: 0, y: 32 },
  { x: 0, y: 27 },
  { x: 0, y: 22 },
  { x: 0, y: 17 }
];
const HEAD_VERTICAL_SCALES = [0.88, 0.9, 0.92, 0.94];
const NECK_Y = 136;

function luminance(bitmap, index) {
  const offset = index * 4;
  const alpha = bitmap[offset + 3];
  if (alpha === 0) return 255;
  const factor = 255 / alpha;
  const blue = Math.min(255, bitmap[offset] * factor);
  const green = Math.min(255, bitmap[offset + 1] * factor);
  const red = Math.min(255, bitmap[offset + 2] * factor);
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function colorAt(bitmap, x, y) {
  const offset = (y * W + x) * 4;
  return {
    b: bitmap[offset],
    g: bitmap[offset + 1],
    r: bitmap[offset + 2],
    a: bitmap[offset + 3]
  };
}

function findComponents(bitmap, region) {
  const visited = new Uint8Array(W * H);
  const queue = new Int32Array(W * H);
  const components = [];

  for (let y = region.minY; y <= region.maxY; y += 1) {
    for (let x = region.minX; x <= region.maxX; x += 1) {
      const index = y * W + x;
      if (visited[index] || luminance(bitmap, index) >= 90) continue;

      let head = 0;
      let tail = 0;
      let minX = W;
      let minY = H;
      let maxX = -1;
      let maxY = -1;
      let count = 0;
      const members = [];
      visited[index] = 1;
      queue[tail++] = index;

      while (head < tail) {
        const current = queue[head++];
        const currentX = current % W;
        const currentY = Math.floor(current / W);
        members.push(current);
        minX = Math.min(minX, currentX);
        minY = Math.min(minY, currentY);
        maxX = Math.max(maxX, currentX);
        maxY = Math.max(maxY, currentY);
        count += 1;

        for (let yOffset = -1; yOffset <= 1; yOffset += 1) {
          for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
            if (xOffset === 0 && yOffset === 0) continue;
            const nextX = currentX + xOffset;
            const nextY = currentY + yOffset;
            if (
              nextX < region.minX || nextX > region.maxX
              || nextY < region.minY || nextY > region.maxY
            ) continue;
            const next = nextY * W + nextX;
            if (!visited[next] && luminance(bitmap, next) < 90) {
              visited[next] = 1;
              queue[tail++] = next;
            }
          }
        }
      }

      const touchesBoundary = minX <= region.minX || maxX >= region.maxX
        || minY <= region.minY || maxY >= region.maxY;
      const width = maxX - minX + 1;
      const height = maxY - minY + 1;
      const centerX = (minX + maxX) / 2;
      const keepTinyCentralFeature = count >= 8 || (centerX >= 66 && centerX <= 126);
      if (
        !touchesBoundary && keepTinyCentralFeature
        && count >= 2 && count <= 1500 && width <= 68 && height <= 52
      ) {
        components.push({ minX, minY, maxX, maxY, count, members });
      }
    }
  }

  if (components.length < 4) {
    throw new Error(`Unable to isolate face: found ${components.length} components`);
  }
  return components;
}

function dominantInteriorColor(bitmap) {
  const frequencies = new Map();
  for (let y = 76; y <= 119; y += 1) {
    for (let x = 60; x <= 132; x += 1) {
      const index = y * W + x;
      const offset = index * 4;
      if (bitmap[offset + 3] < 250 || luminance(bitmap, index) < 130) continue;
      const key = `${bitmap[offset]},${bitmap[offset + 1]},${bitmap[offset + 2]},${bitmap[offset + 3]}`;
      frequencies.set(key, (frequencies.get(key) || 0) + 1);
    }
  }
  const [key] = [...frequencies.entries()].sort((a, b) => b[1] - a[1])[0] || [];
  if (!key) return colorAt(bitmap, 96, 90);
  const [b, g, r, a] = key.split(',').map(Number);
  return { b, g, r, a };
}

function fillPixel(bitmap, x, y, color) {
  const offset = (y * W + x) * 4;
  bitmap[offset] = color.b;
  bitmap[offset + 1] = color.g;
  bitmap[offset + 2] = color.r;
  bitmap[offset + 3] = color.a;
}

function compressHeadVertically(shell, original, scale) {
  const compressed = Buffer.alloc(original.length);

  // The body remains pixel-for-pixel unchanged.  Only the head shell above
  // the neck is shortened, anchored at the neck so no seam can open between
  // head and torso.
  for (let y = NECK_Y; y < H; y += 1) {
    const start = y * W * 4;
    original.copy(compressed, start, start, start + W * 4);
  }

  for (let targetY = 0; targetY < NECK_Y; targetY += 1) {
    const sourceY = NECK_Y - (NECK_Y - targetY) / scale;
    if (sourceY < 0 || sourceY >= NECK_Y) continue;
    const y0 = Math.floor(sourceY);
    const y1 = Math.min(NECK_Y - 1, y0 + 1);
    const fraction = sourceY - y0;
    for (let x = 0; x < W; x += 1) {
      const targetOffset = (targetY * W + x) * 4;
      const topOffset = (y0 * W + x) * 4;
      const bottomOffset = (y1 * W + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        compressed[targetOffset + channel] = Math.round(
          shell[topOffset + channel] * (1 - fraction)
          + shell[bottomOffset + channel] * fraction
        );
      }
    }
  }
  return compressed;
}

function buildFeatureMask(bitmap, components, fillLum, radius = 2) {
  const mask = new Uint8Array(W * H);
  for (const component of components) {
    for (const index of component.members) {
      const centerX = index % W;
      const centerY = Math.floor(index / W);
      for (let yOffset = -radius; yOffset <= radius; yOffset += 1) {
        for (let xOffset = -radius; xOffset <= radius; xOffset += 1) {
          const x = centerX + xOffset;
          const y = centerY + yOffset;
          if (x < 0 || x >= W || y < 0 || y >= H) continue;
          const candidate = y * W + x;
          if (luminance(bitmap, candidate) < fillLum - 1) mask[candidate] = 1;
        }
      }
    }
  }
  return mask;
}

function regenerateNearEye(output, source, nearEye, farEye, fillLum, offset) {
  const coverage = new Float32Array(W * H);
  const mask = buildFeatureMask(source, [farEye], fillLum, 2);
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    coverage[index] = Math.max(0, Math.min(1, 1 - luminance(source, index) / fillLum));
  }

  const padding = 2;
  const sourceMinX = farEye.minX - padding;
  const sourceMaxX = farEye.maxX + padding;
  const sourceMinY = farEye.minY - padding;
  const sourceMaxY = farEye.maxY + padding;
  const targetMinX = nearEye.minX - padding;
  const targetMaxX = nearEye.maxX + padding;
  const targetMinY = nearEye.minY - padding;
  const targetMaxY = nearEye.maxY + padding;

  for (let targetSourceY = targetMinY; targetSourceY <= targetMaxY; targetSourceY += 1) {
    for (let targetSourceX = targetMinX; targetSourceX <= targetMaxX; targetSourceX += 1) {
      const xRatio = (targetSourceX - targetMinX) / Math.max(1, targetMaxX - targetMinX);
      const yRatio = (targetSourceY - targetMinY) / Math.max(1, targetMaxY - targetMinY);
      const sourceX = sourceMinX + xRatio * (sourceMaxX - sourceMinX);
      const sourceY = sourceMinY + yRatio * (sourceMaxY - sourceMinY);
      const opacity = sampleCoverage(coverage, sourceX, sourceY);
      if (opacity <= 0.005) continue;
      const targetX = targetSourceX + offset.x;
      const targetY = targetSourceY + offset.y;
      if (targetX < 0 || targetX >= W || targetY < 0 || targetY >= H) continue;
      const targetOffset = (targetY * W + targetX) * 4;
      const inverse = 1 - opacity;
      output[targetOffset] = Math.round(output[targetOffset] * inverse);
      output[targetOffset + 1] = Math.round(output[targetOffset + 1] * inverse);
      output[targetOffset + 2] = Math.round(output[targetOffset + 2] * inverse);
      output[targetOffset + 3] = Math.max(output[targetOffset + 3], Math.round(255 * opacity));
    }
  }
}

function buildOuterBoundaryMask(bitmap) {
  const mask = new Uint8Array(W * H);
  const queue = new Int32Array(W * H);
  let queueHead = 0;
  let queueTail = 0;
  const maxY = 145;

  // Seed the mask with every visible pixel that directly touches the
  // transparent exterior.  This keeps the antialiased outside edge intact.
  for (let y = 0; y <= maxY; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const index = y * W + x;
      if (bitmap[index * 4 + 3] === 0) continue;
      let touchesTransparency = false;
      for (let yOffset = -1; yOffset <= 1 && !touchesTransparency; yOffset += 1) {
        for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
          const nextX = x + xOffset;
          const nextY = y + yOffset;
          if (nextX < 0 || nextX >= W || nextY < 0 || nextY >= H) {
            touchesTransparency = true;
            break;
          }
          if (bitmap[(nextY * W + nextX) * 4 + 3] === 0) {
            touchesTransparency = true;
            break;
          }
        }
      }
      if (touchesTransparency) {
        mask[index] = 1;
        queue[queueTail++] = index;
      }
    }
  }

  // The original erase pass can reach several pixels into the thick black
  // contour when an eye sits close to the cheek.  Restoring only the outermost
  // antialias pixel leaves a fill-coloured rectangular nub on the silhouette.
  // Flood through connected dark pixels so the complete contour is protected;
  // the eyes remain separate components and therefore are still movable.
  while (queueHead < queueTail) {
    const current = queue[queueHead++];
    const currentX = current % W;
    const currentY = Math.floor(current / W);
    for (let yOffset = -1; yOffset <= 1; yOffset += 1) {
      for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
        if (xOffset === 0 && yOffset === 0) continue;
        const nextX = currentX + xOffset;
        const nextY = currentY + yOffset;
        if (nextX < 0 || nextX >= W || nextY < 0 || nextY > maxY) continue;
        const next = nextY * W + nextX;
        if (mask[next] || luminance(bitmap, next) >= 100) continue;
        mask[next] = 1;
        queue[queueTail++] = next;
      }
    }
  }
  return mask;
}

function buildReferenceFace(bitmap) {
  const components = findComponents(bitmap, LOWER_FACE_REGION);
  const fill = dominantInteriorColor(bitmap);
  const fillLum = fill.r * 0.2126 + fill.g * 0.7152 + fill.b * 0.0722;
  const mask = buildFeatureMask(bitmap, components, fillLum, 2);
  const coverage = new Float32Array(W * H);
  let minX = W;
  let minY = H;
  let maxX = -1;
  let maxY = -1;

  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    const x = index % W;
    const y = Math.floor(index / W);
    const value = Math.max(0, Math.min(1, 1 - luminance(bitmap, index) / fillLum));
    if (value <= 0.005) continue;
    coverage[index] = value;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  console.log(
    `lower-face template=${minX},${minY}-${maxX},${maxY}`
    + ` components=${components.length}`
  );
  return {
    coverage,
    minX,
    minY,
    maxX,
    maxY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2
  };
}

function sampleCoverage(coverage, x, y) {
  if (x < 0 || x >= W - 1 || y < 0 || y >= H - 1) return 0;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const top = coverage[y0 * W + x0] * (1 - fx) + coverage[y0 * W + x0 + 1] * fx;
  const bottom = coverage[(y0 + 1) * W + x0] * (1 - fx)
    + coverage[(y0 + 1) * W + x0 + 1] * fx;
  return top * (1 - fy) + bottom * fy;
}

function drawTransformedFace(output, face, target) {
  const angle = (target.angle * Math.PI) / 180;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const radius = Math.ceil(Math.hypot(face.maxX - face.minX, face.maxY - face.minY) / 2) + 3;

  for (let y = Math.max(0, Math.floor(target.centerY - radius)); y <= Math.min(H - 1, Math.ceil(target.centerY + radius)); y += 1) {
    for (let x = Math.max(0, Math.floor(target.centerX - radius)); x <= Math.min(W - 1, Math.ceil(target.centerX + radius)); x += 1) {
      const targetX = x + 0.5 - target.centerX;
      const targetY = y + 0.5 - target.centerY;
      const sourceX = face.centerX + cosine * targetX + sine * targetY;
      const sourceY = face.centerY - sine * targetX + cosine * targetY;
      const opacity = sampleCoverage(face.coverage, sourceX, sourceY);
      if (opacity <= 0.005) continue;
      const offset = (y * W + x) * 4;
      const inverse = 1 - opacity;
      output[offset] = Math.round(output[offset] * inverse);
      output[offset + 1] = Math.round(output[offset + 1] * inverse);
      output[offset + 2] = Math.round(output[offset + 2] * inverse);
    }
  }
}

function composeCorrectedFrame(atlas, index) {
  const sourceFrame = atlas.crop({ x: index * W, y: 9 * H, width: W, height: H });
  const source = sourceFrame.toBitmap();
  const shell = Buffer.from(source);
  const fill = dominantInteriorColor(source);
  const fillLum = fill.r * 0.2126 + fill.g * 0.7152 + fill.b * 0.0722;
  const oldComponents = findComponents(source, OLD_FACE_REGIONS[index]);
  const eyes = oldComponents
    .filter((component) => component.count >= 250 && component.maxY - component.minY >= 10)
    .sort((a, b) => a.minX - b.minX);
  const shouldRegenerateNearEye = index > 0 && eyes.length === 2;
  const nearEye = shouldRegenerateNearEye ? eyes[0] : null;
  const farEye = shouldRegenerateNearEye ? eyes[1] : null;
  const copiedComponents = nearEye
    ? oldComponents.filter((component) => component !== nearEye)
    : oldComponents;
  const faceMask = buildFeatureMask(source, copiedComponents, fillLum, 2);
  // A wider erase-only mask clears the antialiased fringe from the original
  // position.  It must not be reused for copying because an eye close to the
  // cheek outline could otherwise drag a sliver of that outline along with it.
  const eraseMask = buildFeatureMask(source, oldComponents, fillLum, 5);
  const outlineMask = buildOuterBoundaryMask(source);

  for (let sourceIndex = 0; sourceIndex < eraseMask.length; sourceIndex += 1) {
    if (!eraseMask[sourceIndex]) continue;
    const x = sourceIndex % W;
    const y = Math.floor(sourceIndex / W);
    fillPixel(shell, x, y, fill);
  }

  for (let sourceIndex = 0; sourceIndex < outlineMask.length; sourceIndex += 1) {
    if (!outlineMask[sourceIndex]) continue;
    const offset = sourceIndex * 4;
    shell[offset] = source[offset];
    shell[offset + 1] = source[offset + 1];
    shell[offset + 2] = source[offset + 2];
    shell[offset + 3] = source[offset + 3];
  }

  const scale = HEAD_VERTICAL_SCALES[index];
  const output = compressHeadVertically(shell, source, scale);
  const offset = FACE_OFFSETS[index];
  for (let sourceIndex = 0; sourceIndex < faceMask.length; sourceIndex += 1) {
    if (!faceMask[sourceIndex]) continue;
    const sourceX = sourceIndex % W;
    const sourceY = Math.floor(sourceIndex / W);
    const targetX = sourceX + offset.x;
    const targetY = sourceY + offset.y;
    if (targetX < 0 || targetX >= W || targetY < 0 || targetY >= H) continue;
    const sourceOffset = sourceIndex * 4;
    const targetOffset = (targetY * W + targetX) * 4;
    output[targetOffset] = source[sourceOffset];
    output[targetOffset + 1] = source[sourceOffset + 1];
    output[targetOffset + 2] = source[sourceOffset + 2];
    output[targetOffset + 3] = source[sourceOffset + 3];
  }
  if (nearEye && farEye) regenerateNearEye(output, source, nearEye, farEye, fillLum, offset);
  console.log(
    `direction=${index} oldComponents=${oldComponents.length}`
    + ` features=${oldComponents.map((component) => `${component.minX},${component.minY}-${component.maxX},${component.maxY}:${component.count}`).join('|')}`
    + ` offset=${JSON.stringify(offset)} headScale=${scale}`
  );
  return output;
}

function mirrorFrame(frame) {
  const mirrored = Buffer.alloc(frame.length);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const sourceOffset = (y * W + x) * 4;
      const targetOffset = (y * W + (W - 1 - x)) * 4;
      frame.copy(mirrored, targetOffset, sourceOffset, sourceOffset + 4);
    }
  }
  return mirrored;
}

app.whenReady().then(() => {
  const previewDir = path.join(__dirname, '..', 'assets', 'source', 'look-corrected-preview');
  fs.mkdirSync(previewDir, { recursive: true });

  for (const pet of ['big', 'alien']) {
    const atlasPath = path.join(__dirname, '..', 'assets', `just-${pet === 'big' ? 'big' : 'alien'}-cat.png`);
    const atlas = nativeImage.createFromPath(atlasPath);
    if (atlas.isEmpty()) throw new Error(`Unable to load ${atlasPath}`);
    const correctedFrames = new Map();
    for (const index of [0, 1, 2, 3]) {
      correctedFrames.set(index, composeCorrectedFrame(atlas, index));
    }
    correctedFrames.set(13, mirrorFrame(correctedFrames.get(3)));
    correctedFrames.set(14, mirrorFrame(correctedFrames.get(2)));
    correctedFrames.set(15, mirrorFrame(correctedFrames.get(1)));

    const strip = Buffer.alloc(W * UPPER_DIRECTIONS.length * H * 4);
    for (let column = 0; column < UPPER_DIRECTIONS.length; column += 1) {
      const index = UPPER_DIRECTIONS[column];
      const frame = correctedFrames.get(index);
      for (let y = 0; y < H; y += 1) {
        const sourceStart = y * W * 4;
        const targetStart = (y * W * UPPER_DIRECTIONS.length + column * W) * 4;
        frame.copy(strip, targetStart, sourceStart, sourceStart + W * 4);
      }
      const preview = nativeImage.createFromBitmap(frame, { width: W, height: H, scaleFactor: 1 })
        .resize({ width: W * 4, height: H * 4, quality: 'best' });
      fs.writeFileSync(
        path.join(previewDir, `${pet}-${String(index).padStart(2, '0')}.png`),
        preview.toPNG()
      );
    }

    const outputPath = path.join(__dirname, '..', 'assets', `just-${pet}-look-up.png`);
    const output = nativeImage.createFromBitmap(strip, {
      width: W * UPPER_DIRECTIONS.length,
      height: H,
      scaleFactor: 1
    });
    fs.writeFileSync(outputPath, output.toPNG());
    console.log(`OK ${outputPath}`);
  }

  app.exit(0);
});
