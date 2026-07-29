// Share card (§9). Draws a 1080×1920 story-ratio PNG entirely on-device and
// saves it via the Web Share API, falling back to a download. Nothing is ever
// uploaded — the canvas never leaves the device.

import { createElement } from 'react';
import { charactersById } from '../game/characters';
import { formatGooHero } from '../game/format';
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

export interface ProgressShare {
  goo: number;
  collectionCount: number;
  total: number;
  titleHe?: string; // e.g. a milestone headline
  factHe?: string; // e.g. the milestone fact
}

/** Draw a "look how far I got" brag card: the big goo total + an optional
 * milestone fact + collection progress. All on-device; nothing is uploaded. */
async function buildProgress(s: ProgressShare): Promise<Blob> {
  try {
    await document.fonts.load('700 120px "Suez One"');
    await document.fonts.load('700 48px Rubik');
    await document.fonts.ready;
  } catch {
    /* fallback fonts are fine */
  }

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');

  ctx.fillStyle = '#1A0B2E';
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, 760, 80, W / 2, 760, 820);
  glow.addColorStop(0, 'rgba(163,255,18,0.42)');
  glow.addColorStop(0.5, 'rgba(255,46,136,0.28)');
  glow.addColorStop(1, 'rgba(26,11,46,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.lineWidth = 8;
  ctx.strokeStyle = '#A3FF12';
  roundRect(ctx, 48, 48, W - 96, H - 96, 64);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.direction = 'rtl';

  // Optional milestone emoji + headline up top.
  if (s.titleHe) {
    ctx.fillStyle = '#FFD84D';
    ctx.font = '400 92px "Suez One"';
    ctx.fillText(s.titleHe, W / 2, 470);
  }

  // The giant goo number — the hero of the card.
  ctx.fillStyle = '#FFF4E0';
  ctx.font = '400 92px Rubik';
  ctx.fillText('צברתי', W / 2, 690);
  ctx.fillStyle = '#A3FF12';
  ctx.font = '400 230px "Suez One"';
  ctx.fillText(formatGooHero(s.goo), W / 2, 900);
  ctx.fillStyle = '#FFF4E0';
  ctx.font = '400 92px Rubik';
  ctx.fillText('גּוּ!', W / 2, 1010);

  // The fact, wrapped to fit.
  if (s.factHe) {
    ctx.fillStyle = '#00E5FF';
    ctx.font = '400 52px Rubik';
    wrapText(ctx, s.factHe, W / 2, 1180, W - 220, 74);
  }

  // Collection progress line.
  ctx.fillStyle = '#FFF4E0';
  ctx.font = '400 56px Rubik';
  ctx.fillText(`אספתי ${s.collectionCount} מתוך ${s.total} יצורים`, W / 2, 1560);

  // Wordmark.
  ctx.fillStyle = '#A3FF12';
  ctx.font = '400 96px "Suez One"';
  ctx.fillText('בלורבו', W / 2, 1760);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
  });
}

/** Center-wrapped text helper. */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): void {
  const words = text.split(' ');
  let line = '';
  let cy = y;
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cy);
      line = word;
      cy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cy);
}

async function deliver(blob: Blob, filename: string, title: string): Promise<ShareResult> {
  const file = new File([blob], filename, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] }) && typeof nav.share === 'function') {
    try {
      await nav.share({ files: [file], title });
      return 'shared';
    } catch {
      /* cancelled — fall through to download */
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}

/** Build and share the progress brag card. */
export async function shareProgress(s: ProgressShare): Promise<ShareResult> {
  const blob = await buildProgress(s);
  return deliver(blob, 'blorbo-progress.png', 'בלורבו — כמה גּוּ צברתי!');
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
