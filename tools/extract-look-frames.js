'use strict';

const { app, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const WIDTH = 192;
const HEIGHT = 208;

app.whenReady().then(() => {
  const outputDir = path.join(__dirname, '..', 'assets', 'source', 'look-frames');
  fs.mkdirSync(outputDir, { recursive: true });
  for (const pet of ['big', 'alien']) {
    const atlasPath = path.join(__dirname, '..', 'assets', `just-${pet === 'big' ? 'big' : 'alien'}-cat.png`);
    const atlas = nativeImage.createFromPath(atlasPath);
    if (atlas.isEmpty()) throw new Error(`Unable to load ${atlasPath}`);
    for (let index = 0; index < 16; index += 1) {
      const row = index < 8 ? 9 : 10;
      const column = index < 8 ? index : index - 8;
      const frame = atlas
        .crop({ x: column * WIDTH, y: row * HEIGHT, width: WIDTH, height: HEIGHT })
        .resize({ width: WIDTH * 4, height: HEIGHT * 4, quality: 'best' });
      const output = path.join(outputDir, `${pet}-${String(index).padStart(2, '0')}.png`);
      fs.writeFileSync(output, frame.toPNG());
      console.log(`OK ${output}`);
    }
  }
  app.exit(0);
});
