# Calgary Watch Image Setup Guide

## Image Files Required

This project now uses local images instead of external CDN images for better performance and brand consistency.

### Required Image Files

#### 1. **Calgary Images** (in `public/images/`)
Place these images in the `public/images/` directory:

- **calgary1.jpg** - Portrait/vertical orientation image for:
  - Landing page hero section (skyline background)
  - Feature cards background
  - About page imagery
  - **Recommended dimensions**: 1600px × 1200px minimum (4:3 or 16:12 aspect ratio)
  - **File size**: Keep under 300KB for web optimization

- **calgary2.jpg** - Landscape/horizontal orientation image for:
  - Landing page skyline section
  - About page features
  - Timeline cards
  - **Recommended dimensions**: 1600px × 900px minimum (16:9 aspect ratio)
  - **File size**: Keep under 350KB for web optimization

#### 2. **Project Icon** (in `public/`)
Place this image in the `public/` root directory:

- **icon.png** - Project icon/logo (square format)
  - **Used for**:
    - Browser tab favicon
    - Apple touch icon (mobile home screen)
    - Navigation header logo (replaces ShieldCheck icon)
    - Open Graph image (social media sharing)
    - Twitter Card image
  - **Recommended dimensions**: 512px × 512px or 1024px × 1024px
  - **Format**: PNG with transparency support (RGB or RGBA)
  - **File size**: Keep under 100KB

## Where These Images Are Used

### Landing Page (`src/pages/LandingPage.tsx`)
- Hero background image: `calgary1.jpg` (skyline)
- Problem section image: `calgary1.jpg`
- Feature cards: `calgary2.jpg` (Calgary Tower)
- Workflow section: Both images in rotation

### About Page (`src/pages/AboutPage.tsx`)
- Hero section: Both `calgary1.jpg` and `calgary2.jpg`
- Features section: `calgary2.jpg`
- Calgary Identity traits: Visual accent imagery

### Header Navigation
- Logo/Icon: `icon.png` (displays in top-left of navbar)

### Metadata & SEO
- Browser tab icon: `icon.png`
- Apple touch icon: `icon.png`
- Open Graph (social sharing): `icon.png`
- Twitter Card: `icon.png`

## Setup Instructions

### Step 1: Prepare Your Images

1. **calgary1.jpg** - Image with portrait orientation
   - Export as JPG with quality 75-85%
   - Minimum 1600px width for high DPI displays
   - Example: Image of Calgary skyline from a ground-level angle

2. **calgary2.jpg** - Image with landscape orientation
   - Export as JPG with quality 75-85%
   - Minimum 1600px width for high DPI displays
   - Example: Image of Calgary skyline or downtown from a higher vantage point

3. **icon.png** - Square project icon
   - Export as PNG (transparent background recommended)
   - Square dimensions (512px × 512px or larger)
   - This is your brand icon/logo

### Step 2: Install Files

Place files in these exact locations:

```
Calgary-Watch--main/
├── public/
│   ├── icon.png                 ← Project icon (square)
│   ├── robots.txt
│   ├── sitemap.xml
│   └── images/
│       ├── calgary1.jpg         ← Portrait orientation
│       └── calgary2.jpg         ← Landscape orientation
```

### Step 3: Verify Setup

The system automatically references these images:
- Navigation automatically uses `/icon.png`
- Landing page uses `/images/calgary1.jpg` and `/images/calgary2.jpg`
- About page uses the same image set
- Meta tags automatically pull `/icon.png` for social sharing

No code changes needed after files are in place!

## Performance Tips

1. **Image Optimization**
   - Use online tools like TinyJPG/TinyPNG for compression
   - JPGs should be 75-85% quality for web
   - PNGs should be 8-bit where possible

2. **Responsive Delivery**
   - Images are served with `loading="lazy"` for performance
   - Critical images (hero, header) use eager loading
   - CDN/server will automatically cache these files

3. **SEO Best Practices**
   - Ensure icon.png is recognizable as your brand
   - Use high-quality images for social sharing
   - Image alt-text is automatically provided in code

## Troubleshooting

**Images not appearing?**
- Verify files are named exactly: `calgary1.jpg`, `calgary2.jpg`, `icon.png` (case-sensitive on Linux)
- Check file locations match paths above
- Clear browser cache: Ctrl+Shift+Delete

**Icon not showing in header?**
- Verify `icon.png` exists in `/public/` root
- Check file is valid PNG format
- Try refreshing with hard refresh: Ctrl+Shift+R

**Images pixelated or blurry?**
- Ensure source images are at least 1600px wide
- Check DPI is 72 or higher
- Re-export with better quality settings

## Alternative: Using External URL

If you prefer to use the external URL provided:
```
https://w0.peakpx.com/wallpaper/93/734/HD-wallpaper-calgary-canadian-city-evening-skyscrapers-modern-architecture-alberta-canada.jpg
```

You can temporarily update `src/pages/LandingPage.tsx`:
```javascript
const calgaryImages = {
  skyline: 'https://w0.peakpx.com/wallpaper/93/734/HD-wallpaper-calgary-canadian-city-evening-skyscrapers-modern-architecture-alberta-canada.jpg',
  // ... rest of images
};
```

However, **local images are recommended** for:
- Better performance (no external HTTP requests)
- Guaranteed availability (no broken links)
- Faster loading times
- Better SEO & caching
- Brand consistency

---

**Questions?** Check `index.html` for meta tag references or `vite.config.ts` for build optimization settings.
