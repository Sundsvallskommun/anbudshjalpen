// Builds Anbudshjälpen's icon set from its one source, public/favicon.svg (the mark, which the top bar also shows): the
// ICO fallback and the home-screen icons in public/, and the logo the README shows in docs/assets/. Run from
// frontend/ with `npm run icons` after changing the mark.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const publicDir = `${repo}frontend/public/`;
const docsAssets = `${repo}docs/assets/`;

// The mark's own ground: a full-bleed icon fills its corners with it, so the rounded square looks cut by the system.
const GROUND = "#0B1220";
const mark = readFileSync(`${publicDir}favicon.svg`, "utf8");

/** An ICO file holding PNG images, which every browser that still asks for /favicon.ico reads. */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length + 16 * images.length;
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size % 256, 0);
    entry.writeUInt8(size % 256, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map(({ png }) => png)]);
}

/** Playwright's own Chromium, or the installed Chrome when that is not downloaded (PLAYWRIGHT_CHANNEL picks one). */
async function launch() {
  if (process.env.PLAYWRIGHT_CHANNEL) return chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL });
  try {
    return await chromium.launch();
  } catch {
    return chromium.launch({ channel: "chrome" });
  }
}

const browser = await launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

/**
 * The mark as a PNG of `size` × `size` pixels. `scale` shrinks it inside the square and `ground` fills the square
 * behind it; without a ground the corners stay transparent.
 */
async function png(size, { scale = 1, ground } = {}) {
  const side = Math.round(size * scale);
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<!doctype html><body style="margin:0">` +
      `<div style="width:${size}px;height:${size}px;display:grid;place-items:center;background:${ground ?? "transparent"}">` +
      mark.replace("<svg ", `<svg width="${side}" height="${side}" style="display:block" `) +
      `</div></body>`,
  );
  return page.locator("div").screenshot({ omitBackground: !ground });
}

const written = [];
function write(path, data) {
  writeFileSync(path, data);
  written.push(path.replace(repo, ""));
}

write(`${publicDir}favicon.ico`, ico([{ size: 16, png: await png(16) }, { size: 32, png: await png(32) }]));
write(`${publicDir}apple-touch-icon.png`, await png(180, { ground: GROUND }));
write(`${publicDir}icon-192.png`, await png(192));
write(`${publicDir}icon-512.png`, await png(512));
// A maskable icon keeps what matters inside the middle 80 %: at 62 % of the side the chevrons stay well inside it.
write(`${publicDir}icon-maskable-512.png`, await png(512, { scale: 0.62, ground: GROUND }));
await browser.close();

// The README shows the mark itself, on light and dark pages alike (it brings its own ground).
mkdirSync(docsAssets, { recursive: true });
for (const name of ["logo.svg", "logo-dark.svg"]) {
  copyFileSync(`${publicDir}favicon.svg`, `${docsAssets}${name}`);
  written.push(`docs/assets/${name}`);
}

console.log(`Built from frontend/public/favicon.svg:\n  ${written.join("\n  ")}`);
