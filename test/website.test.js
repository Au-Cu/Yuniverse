'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'website', 'yuniverse', 'dist');
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(dist, 'app.js'), 'utf8');
const worker = fs.readFileSync(path.join(dist, '_worker.js'), 'utf8');
const adminHtml = fs.readFileSync(path.join(dist, 'admin', 'index.html'), 'utf8');

test('public site keeps internal delivery notes out of user-facing copy', () => {
  for (const forbidden of [
    '代码签名证书持续签署',
    'Microsoft Store',
    'Apple Developer Program',
    'Hardened Runtime',
    '签名凭据',
    'Get-FileHash',
    'shasum -a 256',
    '核对 SHA-256',
    '抬头保持克制',
    '五官不会挤在一起',
    '完整眼形会随视线',
    '侧脸也保持干净',
    '保留外星猫的体态',
    '同时保持熟悉的神态',
    '不会只是整只身体平移',
    'signature-status',
    'signature-paths'
  ]) {
    assert.equal(html.includes(forbidden), false, `public site contains forbidden delivery copy: ${forbidden}`);
  }
});

test('site sections follow introduction, preview, download, installation order', () => {
  const positions = ['id="members"', 'id="preview"', 'id="download"', 'id="install"']
    .map((marker) => html.indexOf(marker));
  assert.equal(positions.every((position) => position >= 0), true);
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
});

test('one global member selector controls both motion previews', () => {
  assert.equal((html.match(/data-preview-pet=/g) || []).length, 3);
  assert.equal(html.includes('data-follow-pet='), false);
  assert.equal(html.includes('data-walk-pet='), false);
  for (const id of [
    'follow-preview-image',
    'follow-preview-title',
    'walk-preview-image',
    'walk-preview-title'
  ]) {
    assert.equal(html.includes(`id="${id}"`), true);
  }
  assert.equal(html.includes('JUST 大猫 · 跟随鼠标转头'), false);
  assert.equal(html.includes('JUST 大猫 · 走近你的光标'), false);
  assert.equal(html.includes('id="follow-preview-title">跟随鼠标转头</h3>'), true);
  assert.equal(html.includes('id="walk-preview-title">走近你的光标</h3>'), true);
});

test('all packaged preview media exists and is non-empty', () => {
  const previewDir = path.join(dist, 'assets', 'previews');
  const motionFiles = ['big', 'alien', 'minbird']
    .flatMap((pet) => ['follow', 'walk']
      .flatMap((action) => ['webp', 'gif', 'png']
        .map((extension) => `${pet}-${action}.${extension}`)));
  for (const fileName of [
    ...motionFiles,
    'big-selector.png',
    'alien-selector.png',
    'minbird-selector.png',
    'sitting.png',
    'sleeping.png',
    'README.txt'
  ]) {
    const stat = fs.statSync(path.join(previewDir, fileName));
    assert.equal(stat.isFile(), true);
    assert.ok(stat.size > 0, `${fileName} is empty`);
  }
});

test('all local image and script references resolve inside the site build', () => {
  const references = [...html.matchAll(/(?:src|srcset)="\.\/([^"\s]+)"/g)]
    .map((match) => match[1]);
  assert.ok(references.length > 0);
  for (const reference of references) {
    assert.equal(fs.existsSync(path.join(dist, reference)), true, `missing site asset: ${reference}`);
  }
});

test('download statistics record anonymous start and completion events', () => {
  assert.equal(app.includes('recordDownloadEvent("started"'), true);
  assert.equal(app.includes('recordDownloadEvent("completed"'), true);
  assert.equal(app.includes('version: "1.0.0"'), true);
  assert.equal(worker.includes('created_at_ms'), true);
  assert.equal(worker.includes('precision: "millisecond"'), true);
  for (const forbidden of ['user_agent', 'ip_address', 'cf-connecting-ip']) {
    assert.equal(worker.toLowerCase().includes(forbidden), false);
  }
});

test('private analytics dashboard and author credit are packaged', () => {
  for (const fileName of ['index.html', 'admin.css', 'admin.js']) {
    const file = path.join(dist, 'admin', fileName);
    assert.ok(fs.statSync(file).size > 0, `${fileName} is empty`);
  }
  assert.equal(adminHtml.includes('下载统计'), true);
  assert.equal(adminHtml.includes('作者 Au_Cu'), true);
  assert.equal(html.includes('作者 <strong>Au_Cu</strong>'), true);
  assert.equal(adminHtml.includes('noindex,nofollow'), true);
});

test('website and desktop metadata remain at 1.0.0 with Au_Cu credited', () => {
  const desktopPackage = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const websitePackage = JSON.parse(fs.readFileSync(path.join(root, 'website', 'yuniverse', 'package.json'), 'utf8'));
  assert.equal(desktopPackage.version, '1.0.0');
  assert.equal(websitePackage.version, '1.0.0');
  assert.equal(desktopPackage.author.name, 'Au_Cu');
  assert.equal(desktopPackage.build.copyright.includes('Au_Cu'), true);
});
