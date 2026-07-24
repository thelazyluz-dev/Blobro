// Share card (§9). Draws a 1080×1920 story-ratio PNG entirely on-device and
// saves it via the Web Share API, falling back to a download. Nothing is ever
// uploaded — the canvas never leaves the device.

import { createElement } from 'react';
import { charactersById } from '../game/characters';
import type { CharId } from '../game/types';
import { CharacterBody } from './characters';
import { rarityColor, rarityLabelHe } from './rarity';

const W = 1080;
const H = 1920;

async function loadCreatureImage(id: CharId): Promise<HTMLImageElement> {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const markup = renderToStaticMarkup(createElement(CharacterBody, { id }));
  const svg = markup.replace(
    '<svg ',
    '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" ',
  );
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const img = new Image();
  img.decoding = 'async';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('svg load failed'));
    img.src = url;
  });
  return img;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function buildBlob(id: CharId): Promise<Blob> {
  const def = charactersById[id];
  const color = rarityColor[def.rarity];
  const legendary = def.rarity === 'legendary';

  // Fonts must be ready or the canvas silently falls back.
  try {
    await document.fonts.load('700 120px "Suez One"');
    await document.fonts.load('700 48px Rubik');
    await document.fonts.ready;
  } catch {
    /* proceed with fallback fonts if loading fails */
  }

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');

  // Background: deep void with a large rarity-colored glow behind the creature.
  ctx.fillStyle = '#1A0B2E';
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W / 2, 720, 80, W / 2, 720, 760);
  if (legendary) {
    glow.addColorStop(0, 'rgba(255,216,77,0.55)');
    glow.addColorStop(0.5, 'rgba(255,46,136,0.35)');
    glow.addColorStop(1, 'rgba(26,11,46,0)');
  } else {
    glow.addColorStop(0, `${color}CC`);
    glow.addColorStop(0.55, `${color}33`);
    glow.addColorStop(1, 'rgba(26,11,46,0)');
  }
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Rounded "card" frame.
  ctx.lineWidth = 8;
  ctx.strokeStyle = legendary ? '#FFD84D' : color;
  roundRect(ctx, 48, 48, W - 96, H - 96, 64);
  ctx.stroke();

  // Creature, large and centered.
  const img = await loadCreatureImage(id);
  const size = 720;
  ctx.drawImage(img, (W - size) / 2, 360, size, size);

  ctx.textAlign = 'center';
  ctx.direction = 'rtl';

  // Rarity badge.
  const badge = rarityLabelHe[def.rarity];
  ctx.font = '700 44px Rubik';
  const bw = ctx.measureText(badge).width + 80;
  ctx.fillStyle = legendary ? '#FFD84D' : color;
  roundRect(ctx, (W - bw) / 2, 1170, bw, 84, 42);
  ctx.fill();
  ctx.fillStyle = '#1A0B2E';
  ctx.fillText(badge, W / 2, 1226);

  // Hebrew name (display face).
  ctx.fillStyle = legendary ? '#FFD84D' : color;
  ctx.font = '400 148px "Suez One"';
  ctx.fillText(def.nameHe, W / 2, 1420);

  // Latin name.
  ctx.fillStyle = '#FFF4E0';
  ctx.font = '400 56px Rubik';
  ctx.fillText(def.nameLatin, W / 2, 1500);

  // Wordmark at the bottom.
  ctx.fillStyle = '#A3FF12';
  ctx.font = '400 88px "Suez One"';
  ctx.fillText('בלורבו', W / 2, 1760);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
  });
}

export type ShareResult = 'shared' | 'downloaded';

/** Build the card and share or download it. Returns how it was delivered. */
export async function shareCreature(id: CharId): Promise<ShareResult> {
  const blob = await buildBlob(id);
  const def = charactersById[id];
  const file = new File([blob], `blorbo-${def.nameLatin.replace(/\s+/g, '-').toLowerCase()}.png`, {
    type: 'image/png',
  });

  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
  };
  if (nav.canShare?.({ files: [file] }) && typeof nav.share === 'function') {
    try {
      await nav.share({ files: [file], title: `${def.nameHe} — בלורבו` });
      return 'shared';
    } catch {
      // user cancelled or share failed — fall through to download
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}
