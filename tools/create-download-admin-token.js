'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const releaseDir = path.join(root, 'release');
const outputPath = path.join(releaseDir, 'Yuniverse-下载统计后台.txt');

fs.mkdirSync(releaseDir, { recursive: true });

if (!fs.existsSync(outputPath)) {
  const token = crypto.randomBytes(32).toString('base64url');
  const content = [
    'Yuniverse 下载统计后台',
    '',
    '后台地址：https://yuniverse411.pages.dev/admin/',
    `管理口令：${token}`,
    '',
    '说明：',
    '1. 此口令只用于查看下载统计，请勿放入网页、截图或公开仓库。',
    '2. 后台会显示下载开始、下载完成、平台架构、来源站点和精确时间。',
    '3. 网站不保存账号、IP 地址或设备标识。',
    '4. 桌宠与安装包版本仍为 1.0.0。',
    ''
  ].join('\r\n');
  fs.writeFileSync(outputPath, content, { encoding: 'utf8', mode: 0o600 });
}

console.log(`Admin credential file ready: ${outputPath}`);
