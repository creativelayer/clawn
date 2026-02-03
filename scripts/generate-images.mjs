#!/usr/bin/env node
/**
 * Generate placeholder images for Farcaster mini-app
 * - og-image.png: 1200x630 (social share card)
 * - splash.png: 200x200 (loading screen)
 * - icon.png: 100x100 (app icon)
 */

import sharp from "sharp";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "../frontend/public");

// Brand colors
const PURPLE = "#1a0a2e";
const PINK = "#ff1493";
const YELLOW = "#ffd700";

// Create OG image (1200x630)
async function createOgImage() {
  const width = 1200;
  const height = 630;

  // Create SVG with gradient background and text
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${PURPLE}"/>
          <stop offset="100%" style="stop-color:#2d1b4e"/>
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg)"/>
      
      <!-- Clown emoji -->
      <text x="600" y="200" font-size="120" text-anchor="middle" fill="white">🤡</text>
      
      <!-- Title -->
      <text x="600" y="340" font-family="Arial Black, sans-serif" font-size="72" font-weight="bold" text-anchor="middle" fill="${PINK}" filter="url(#glow)">CLOWN ROAST BATTLE</text>
      
      <!-- Subtitle -->
      <text x="600" y="420" font-family="Arial, sans-serif" font-size="36" text-anchor="middle" fill="white" opacity="0.8">Funniest clown wins the $CLAWN pool</text>
      
      <!-- Token badge -->
      <rect x="450" y="480" width="300" height="60" rx="30" fill="${PINK}" opacity="0.2"/>
      <text x="600" y="520" font-family="Arial, sans-serif" font-size="28" text-anchor="middle" fill="${YELLOW}">💰 50K CLAWN to enter</text>
    </svg>
  `;

  await sharp(Buffer.from(svg))
    .png()
    .toFile(join(publicDir, "og-image.png"));
  
  console.log("✅ Created og-image.png (1200x630)");
}

// Create splash image (200x200)
async function createSplashImage() {
  const size = 200;

  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="splash-bg" cx="50%" cy="50%" r="70%">
          <stop offset="0%" style="stop-color:#2d1b4e"/>
          <stop offset="100%" style="stop-color:${PURPLE}"/>
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#splash-bg)"/>
      <text x="100" y="90" font-size="60" text-anchor="middle">🤡</text>
      <text x="100" y="140" font-family="Arial Black, sans-serif" font-size="18" font-weight="bold" text-anchor="middle" fill="${PINK}">CLOWN</text>
      <text x="100" y="165" font-family="Arial Black, sans-serif" font-size="14" font-weight="bold" text-anchor="middle" fill="white" opacity="0.7">ROAST BATTLE</text>
    </svg>
  `;

  await sharp(Buffer.from(svg))
    .png()
    .toFile(join(publicDir, "splash.png"));
  
  console.log("✅ Created splash.png (200x200)");
}

// Create icon (100x100)
async function createIconImage() {
  const size = 100;

  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="icon-bg" cx="50%" cy="50%" r="70%">
          <stop offset="0%" style="stop-color:#2d1b4e"/>
          <stop offset="100%" style="stop-color:${PURPLE}"/>
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" rx="20" fill="url(#icon-bg)"/>
      <text x="50" y="62" font-size="50" text-anchor="middle">🤡</text>
    </svg>
  `;

  await sharp(Buffer.from(svg))
    .png()
    .toFile(join(publicDir, "icon.png"));
  
  console.log("✅ Created icon.png (100x100)");
}

// Run all
async function main() {
  console.log("Generating images...\n");
  await createOgImage();
  await createSplashImage();
  await createIconImage();
  console.log("\n🎪 All images created in frontend/public/");
}

main().catch(console.error);
