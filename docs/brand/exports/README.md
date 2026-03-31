# ERNE Brand Assets

Exported brand assets for the ERNE (Everything React Native & Expo) project.

---

## Directory Structure

```
exports/
├── svg/
│   ├── erne-logo.svg          Master — full detail with all glow filters
│   ├── erne-logo-simple.svg   Simplified — no blur filters, no stars
│   └── erne-favicon.svg       Favicon-optimized — bold strokes, 64x64 viewBox
├── png/
│   ├── erne-logo-16.png
│   ├── erne-logo-32.png
│   ├── erne-logo-48.png
│   ├── erne-logo-64.png
│   ├── erne-logo-128.png
│   ├── erne-logo-180.png       Apple Touch Icon source
│   ├── erne-logo-192.png       Android Chrome source
│   ├── erne-logo-512.png       PWA / splash screen
│   └── erne-logo-1024.png      App Store / marketing
├── favicon/
│   ├── favicon.ico             Multi-size: 16, 32, 48px
│   ├── favicon.svg             Modern browsers (SVG favicon)
│   ├── favicon-16x16.png
│   ├── favicon-32x32.png
│   ├── apple-touch-icon.png    180x180
│   └── android-chrome-192.png
└── og/
    ├── og-image.svg            Source SVG
    └── og-image.png            1200x630 Open Graph image
```

---

## SVG Variants

| File | Description | Use When |
|------|-------------|----------|
| `svg/erne-logo.svg` | Master file — full glow filters, stars, all effects | Large displays, marketing, print (SVG) |
| `svg/erne-logo-simple.svg` | Same design, no Gaussian blur filters, no stars | Email clients, older SVG renderers, React Native SVG |
| `svg/erne-favicon.svg` | Heavily simplified — 3 bold orbits + bright core, 64x64 viewBox | Favicons, small icons, app icons |

---

## PNG Sizes

| File | Size | Recommended Use |
|------|------|-----------------|
| `png/erne-logo-16.png` | 16×16 | Browser favicon (legacy) |
| `png/erne-logo-32.png` | 32×32 | Browser favicon, Windows taskbar |
| `png/erne-logo-48.png` | 48×48 | Windows site icon, browser toolbar |
| `png/erne-logo-64.png` | 64×64 | macOS Dock (small), browser extension |
| `png/erne-logo-128.png` | 128×128 | macOS Dock, Chrome Web Store |
| `png/erne-logo-180.png` | 180×180 | Apple Touch Icon (iOS home screen) |
| `png/erne-logo-192.png` | 192×192 | Android Chrome, PWA manifest |
| `png/erne-logo-512.png` | 512×512 | PWA splash screen, PWA manifest |
| `png/erne-logo-1024.png` | 1024×1024 | App Store (iOS), Google Play (requires export from design tool at this size for production) |

---

## Favicon Setup

Complete HTML `<head>` snippet for maximum browser coverage:

```html
<!-- SVG favicon — modern browsers (Chrome 80+, Firefox 41+, Safari 12+) -->
<link rel="icon" type="image/svg+xml" href="/favicon.svg">

<!-- ICO fallback — older browsers and IE -->
<link rel="icon" type="image/x-icon" href="/favicon.ico">

<!-- Apple Touch Icon — iOS home screen -->
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">

<!-- Android Chrome -->
<link rel="icon" type="image/png" sizes="192x192" href="/android-chrome-192.png">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">

<!-- Web App Manifest (PWA) -->
<link rel="manifest" href="/site.webmanifest">
```

### site.webmanifest example

```json
{
  "name": "ERNE",
  "short_name": "ERNE",
  "description": "Everything React Native & Expo",
  "icons": [
    { "src": "/android-chrome-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/erne-logo-512.png", "sizes": "512x512", "type": "image/png" }
  ],
  "theme_color": "#030810",
  "background_color": "#030810",
  "display": "standalone"
}
```

---

## Open Graph Image

Place `og/og-image.png` at your public root and add these meta tags:

```html
<meta property="og:image" content="https://erne.dev/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:type" content="image/png">
<meta property="og:image:alt" content="ERNE — Everything React Native & Expo">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://erne.dev/og-image.png">
```

---

## Regenerating Assets

All PNGs were generated from the SVG sources using `rsvg-convert` (part of `librsvg`):

```bash
# Install (macOS)
brew install librsvg

# Regenerate a specific size
rsvg-convert -w 512 -h 512 svg/erne-logo.svg -o png/erne-logo-512.png

# Regenerate favicon PNGs
rsvg-convert -w 16 -h 16 svg/erne-favicon.svg -o favicon/favicon-16x16.png
rsvg-convert -w 32 -h 32 svg/erne-favicon.svg -o favicon/favicon-32x32.png
rsvg-convert -w 180 -h 180 svg/erne-favicon.svg -o favicon/apple-touch-icon.png

# Regenerate OG image
rsvg-convert -w 1200 -h 630 og/og-image.svg -o og/og-image.png

# Regenerate favicon.ico (requires Pillow)
pip install Pillow
python3 -c "
from PIL import Image
img16 = Image.open('favicon/favicon-16x16.png').convert('RGBA')
img32 = Image.open('favicon/favicon-32x32.png').convert('RGBA')
img16.save('favicon/favicon.ico', format='ICO', sizes=[(16,16),(32,32),(48,48)])
"
```

---

## Master SVG Source

The master source file lives at:

```
docs/brand/erne-atom-logo.svg
```

All SVG variants in `exports/svg/` are derived from this master.
