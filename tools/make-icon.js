'use strict';

const { app, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

function makeSinglePngIco(png) {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt8(0, 6);
  header.writeUInt8(0, 7);
  header.writeUInt8(0, 8);
  header.writeUInt8(0, 9);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18);
  return Buffer.concat([header, png]);
}

app.whenReady().then(() => {
  const source = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'just-big-cat.png'));
  if (source.isEmpty()) {
    console.error('Unable to create icon: source image is empty.');
    app.exit(1);
    return;
  }
  const icon = source
    .crop({ x: 0, y: 0, width: 192, height: 208 })
    .resize({ width: 256, height: 256, quality: 'best' });
  const png = icon.toPNG();
  const outputDir = path.join(__dirname, '..', 'build');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'icon.png'), png);
  fs.writeFileSync(path.join(outputDir, 'icon.ico'), makeSinglePngIco(png));
  console.log('OK build/icon.ico');
  app.exit(0);
});
