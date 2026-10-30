# Google Play listing assets — Sand & Steel

Uploads for the Play Console store listing. Nothing here ships inside the app: only `public/` is
packaged into the APK/AAB, so these files are listing material only.

## Ready to upload

| Play Console field | file | spec | status |
|---|---|---|---|
| Store listing → App icon | `public/icons/icon-512.png` | 512×512 PNG, opaque (no alpha) | ready |
| Store listing → Feature graphic | `store/play/feature-graphic-1024x500.png` | 1024×500, 24-bit PNG (no alpha), 1.2 MB | ready |
| Store listing → Phone screenshots | — | see below | not yet |

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

## Phone screenshots — what is wrong with the two supplied

Both supplied files are 1080×2340 (2.17:1) and both carry non-game pixels, so neither can be
uploaded as given.

| file | problem |
|---|---|
| `store/play/source/screenshot-phone-01-1080x2340.jpg` | 2.17:1 is over Play's 2:1 limit, and the top ~144 px is non-game chrome (status bar plus a uniform white strip that ends at y ≈ 144). |
| second supplied screenshot (not imported) | Same 2:1 problem, and it contains Base44 development UI: URL bar, Preview/Dashboard tabs, "Create PR", plus the in-game "Chat to Edit" pill. Never usable on a public listing. |

Play's rules: JPEG or 24-bit PNG (no alpha), 320–3840 px per side, and the long side no more than
twice the short side. Two screenshots minimum; 1080×1920 (16:9) is the safe capture size.

The clean way to satisfy all of it: install the current build on the phone, take the captures in the
app itself (no browser or dev chrome) framed at 16:9. That yields 1080×1920, which passes validation
with no cropping.

## Source files

`store/play/source/` keeps the supplied originals so the feature graphic can be regenerated and so
the screenshot problem stays reproducible. They are reference material, not uploads.
