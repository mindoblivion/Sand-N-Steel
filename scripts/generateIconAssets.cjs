const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SOURCE_IMAGE = path.join(__dirname, '../public/icons/icon-source.svg');

// The SVG master is the single source of truth for Android and PWA icons.
// Its important artwork is composed inside Android's central 66% circular safe zone.


async function createCircularMask(size) {
  const svg = `<svg width="${size}" height="${size}">
    <circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="#ffffff"/>
  </svg>`;
  return Buffer.from(svg);
}

async function createAdaptiveForeground(canvasSize) {
  // Render the complete square SVG into the adaptive canvas. The source artwork
  // itself keeps both fighters and the wordmark inside Android's circular safe zone.
  return await sharp(SOURCE_IMAGE)
    .resize(canvasSize, canvasSize, { fit: 'contain' })
    .png()
    .toBuffer();
}

async function createAdaptiveBackground(canvasSize) {
  // Dark Roman arena theme background matching #0c0a09 / #141110 with a subtle golden glow
  const background = await sharp({
    create: {
      width: canvasSize,
      height: canvasSize,
      channels: 4,
      background: { r: 12, g: 10, b: 9, alpha: 1 } // #0c0a09
    }
  })
  .png()
  .toBuffer();

  return background;
}

async function createSquareIcon(size) {
  return await sharp(SOURCE_IMAGE)
    .resize(size, size, { fit: 'cover' })
    .png()
    .toBuffer();
}

async function createRoundIcon(size) {
  const square = await sharp(SOURCE_IMAGE)
    .resize(size, size, { fit: 'cover' })
    .toBuffer();

  const mask = await createCircularMask(size);

  return await sharp(square)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

async function createMaskablePwaIcon(size) {
  // Maskable icon requires 80% safe zone inside square
  const innerSize = Math.round(size * 0.80);
  const offset = Math.round((size - innerSize) / 2);

  const resizedArt = await sharp(SOURCE_IMAGE)
    .resize(innerSize, innerSize, { fit: 'contain' })
    .toBuffer();

  return await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 12, g: 10, b: 9, alpha: 1 } // #0c0a09
    }
  })
  .composite([
    {
      input: resizedArt,
      top: offset,
      left: offset
    }
  ])
  .png()
  .toBuffer();
}

async function buildAllIcons() {
  console.log('Generating all Sand & Steel Android and PWA icon resources...');

  const densities = [
    { name: 'ldpi', legacySize: 36, adaptiveCanvas: 81 },
    { name: 'mdpi', legacySize: 48, adaptiveCanvas: 108 },
    { name: 'hdpi', legacySize: 72, adaptiveCanvas: 162 },
    { name: 'xhdpi', legacySize: 96, adaptiveCanvas: 216 },
    { name: 'xxhdpi', legacySize: 144, adaptiveCanvas: 324 },
    { name: 'xxxhdpi', legacySize: 192, adaptiveCanvas: 432 }
  ];

  for (const d of densities) {
    const dir = path.join(__dirname, `../android/app/src/main/res/mipmap-${d.name}`);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Legacy square
    const sq = await createSquareIcon(d.legacySize);
    fs.writeFileSync(path.join(dir, 'ic_launcher.png'), sq);

    // Legacy round
    const rnd = await createRoundIcon(d.legacySize);
    fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), rnd);

    // Adaptive foreground
    const fg = await createAdaptiveForeground(d.adaptiveCanvas);
    fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), fg);

    // Adaptive background
    const bg = await createAdaptiveBackground(d.adaptiveCanvas);
    fs.writeFileSync(path.join(dir, 'ic_launcher_background.png'), bg);

    console.log(`Generated mipmap-${d.name}: legacy ${d.legacySize}x${d.legacySize}, adaptive ${d.adaptiveCanvas}x${d.adaptiveCanvas}`);
  }

  // PWA Icons in public/icons/
  const pwaDir = path.join(__dirname, '../public/icons');
  if (!fs.existsSync(pwaDir)) fs.mkdirSync(pwaDir, { recursive: true });

  fs.writeFileSync(path.join(pwaDir, 'icon-192.png'), await createSquareIcon(192));
  fs.writeFileSync(path.join(pwaDir, 'icon-512.png'), await createSquareIcon(512));
  fs.writeFileSync(path.join(pwaDir, 'icon-maskable-512.png'), await createMaskablePwaIcon(512));
  fs.writeFileSync(path.join(pwaDir, 'apple-touch-icon.png'), await createSquareIcon(180));

  console.log('PWA icons updated in public/icons/');
}

buildAllIcons().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
