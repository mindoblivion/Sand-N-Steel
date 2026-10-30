# Google Play listing assets — Sand & Steel

Uploads for the Play Console store listing. Nothing here ships inside the app: only `public/` is
packaged into the APK/AAB, so these files are listing material only.

## Ready to upload

| Play Console field | file | spec | status |
|---|---|---|---|
| Store listing → App icon | `public/icons/icon-512.png` | 512×512 PNG, opaque (no alpha) | ready |
| Store listing → Feature graphic | `store/play/feature-graphic-1024x500.png` | 1024×500, 24-bit PNG (no alpha), 1.2 MB | ready |
| Store listing → Phone screenshots | `store/play/screenshot-phone-01-1080x2160.jpg`, `store/play/screenshot-phone-02-1080x2160.jpg` | 1080×2160 (2.000:1), 24-bit JPEG, no alpha | ready |

The feature graphic is derived mechanically from the supplied artwork
(`store/play/source/artwork-1488x720.jpg`): the 1488×720 source is 2.0667:1 and Play wants exactly
2.048:1, so 7 px is trimmed from each side and the frame is scaled to 1024×500. The full height of
the artwork — including the "SAND & STEEL / GLADIATOR RISING" lettering — is preserved.

To regenerate it after replacing the artwork:

```bash
# inside the web container (sharp is already installed there)
bun -e 'const s=require("sharp");const m=await s("/tmp/art.jpg").metadata();
const w=Math.round(m.height*(1024/500));
await s("/tmp/art.jpg").extract({left:Math.round((m.width-w)/2),top:0,width:w,height:m.height})
  .resize(1024,500,{fit:"fill"}).removeAlpha().png({compressionLevel:9}).toFile("store/play/feature-graphic-1024x500.png")'
```

## Phone screenshots — ready to upload

| file | spec | scene |
|---|---|---|
| `store/play/screenshot-phone-01-1080x2160.jpg` | 1080×2160 (2.000:1), 24-bit JPEG, no alpha, 194 KB | arena with the fountain |
| `store/play/screenshot-phone-02-1080x2160.jpg` | 1080×2160 (2.000:1), 24-bit JPEG, no alpha, 293 KB | desert gate, shield raised |

Both come from Chrome captures on a 20:9 phone, so the raw files are 1080×2340 (2.17:1) — over Play's
2:1 ceiling. **A retake cannot fix that: 2340 is the phone's native height, so every capture on this
device is 2.17:1.** The crop is the fix, and it is purely mechanical:

- **105 px off the top.** Rows 0–104 are dead black in both captures (pure `#0B0A08`, no status icons,
  no URL bar) — the browser's hidden-chrome area, not game pixels.
- **Then down to y = 2265.** That stops 3 px above the in-game bottom navigation strip (2268–2339), so
  the six-icon nav bar is dropped and the frame ends on scene. Nothing interactive is clipped: a
  bounding-box scan of the cropped files finds no crimson (ATTACK) or yellow (joystick) control pixel
  past y = 2075, and the top profile card, currency counters and SETTINGS button are all inside.
- Result: 1080×2160, exactly 2.000:1, JPEG, no alpha, well inside Play's 320–3840 px and 8 MB limits.

Regenerate (inside the `web` container, `sharp` is already installed there):

```bash
bun -e 'const s=require("sharp");await s("store/play/source/screenshot-phone-02-arena-1080x2340-chrome.jpg")
  .extract({left:0,top:105,width:1080,height:2160})
  .jpeg({quality:92,mozjpeg:true,chromaSubsampling:"4:4:4"}).toFile("store/play/screenshot-phone-01-1080x2160.jpg")'
```

Play's rules: JPEG or 24-bit PNG (no alpha), 320–3840 px per side, long side no more than twice the
short side, two screenshots minimum. 1080×1920 (16:9) is still the ideal; a 16:9 capture needs a
camera that renders 16:9 rather than the device screen's 20:9.

## Source files

`store/play/source/` keeps the supplied originals so the feature graphic can be regenerated and so
the screenshot problem stays reproducible. They are reference material, not uploads.
