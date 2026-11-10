const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SOURCE_IMAGE = path.join(__dirname, '../public/assets/aistudio/file_00000000445881f587bb682b9f8ef1bb_a38986d0.png');

// Keep the complete approved artwork for store/legacy icons. Adaptive icons
// need a tighter composition: trim only the decorative outer 4% before fitting
// the art inside Android's central circular safe zone.
// A square's diagonal must fit within the 66% safe-zone circle.
// 0.46 is a conservative inscribed-square ratio (0.66 / sqrt(2) ≈ 0.467). 
const ADAPTIVE_SAFE_ZONE_RATIO = 0.46;
const ADAPTIVE_EDGE_CROP_RATIO = 0.04;

async function createCircularMask(size) {
  const svg = `<svg width="${size}" height="${size}">
    <circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="#ffffff"/>
  </svg>`;
  return Buffer.from(svg);
}

async function createAdaptiveForeground(canvasSize) {
  // Android adaptive icons use a 108dp canvas with a central ~66dp safe zone.
  // Crop the decorative frame slightly so the title/gladiators read larger,
  // while keeping all four foreground corners inside the circular safe-zone boundary.
  const innerSize = Math.round(canvasSize * ADAPTIVE_SAFE_ZONE_RATIO);
  const offset = Math.round((canvasSize - innerSize) / 2);
  const metadata = await sharp(SOURCE_IMAGE).metadata();
  if (!metadata.width || !metadata.height) throw new Error('Unable to read launcher source dimensions');
  const cropX = Math.round(metadata.width * ADAPTIVE_EDGE_CROP_RATIO);
  const cropY = Math.round(metadata.height * ADAPTIVE_EDGE_CROP_RATIO);
  const cropWidth = metadata.width - cropX * 2;
  const cropHeight = metadata.height - cropY * 2;

  // Adaptive-only crop; all other icon outputs retain the full original artwork.
  const resizedArt = await sharp(SOURCE_IMAGE)
    .extract({ left: cropX, top: cropY, width: cropWidth, height: cropHeight })
    .resize(innerSize, innerSize, { fit: 'cover' })
    .png()
    .toBuffer();

  // Center the inscribed square on the transparent adaptive-icon canvas.
  const foreground = await sharp({
    create: {
      width: canvasSize,
      height: canvasSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
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

  return foreground;
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
