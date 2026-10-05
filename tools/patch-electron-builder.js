'use strict';

const fs = require('node:fs');
const path = require('node:path');

// electron-builder 26.15.3's portable NSIS template handles x64-only and
// ia32-only directory embedding, but misses the arm64-only + useZip branch.
// In that case it emits a tiny launcher with no application payload. Keep this
// narrow, fail-closed patch until the upstream template includes the branch.
const templatePath = path.join(
  __dirname,
  '..',
  'node_modules',
  'app-builder-lib',
  'templates',
  'nsis',
  'portable.nsi'
);

const original = `  !else
    !ifdef APP_DIR_32
      File /r "\${APP_DIR_32}\\*.*"
    !else
      !insertmacro extractEmbeddedAppPackage
    !endif
  !endif
`;

const replacement = `  !else
    !ifdef APP_DIR_ARM64
      File /r "\${APP_DIR_ARM64}\\*.*"
    !else
      !ifdef APP_DIR_32
        File /r "\${APP_DIR_32}\\*.*"
      !else
        !insertmacro extractEmbeddedAppPackage
      !endif
    !endif
  !endif
`;

const source = fs.readFileSync(templatePath, 'utf8');
if (source.includes(replacement)) {
  console.log('OK electron-builder ARM64 portable template already patched');
} else if (source.includes(original)) {
  fs.writeFileSync(templatePath, source.replace(original, replacement), 'utf8');
  console.log('OK patched electron-builder ARM64 portable template');
} else {
  throw new Error('Unsupported electron-builder portable template; refusing an unverified patch.');
}
