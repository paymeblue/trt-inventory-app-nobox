import { clamp255, hexToRgb, mix, shade, smoothNoise, type RGB } from "./png";

export type TextureKind =
  | "board" | "melamine" | "tape" | "metal" | "fabric"
  | "foam" | "tin" | "carton" | "timber" | "webbing";

type Ctx = { w: number; h: number; base: RGB; accent: RGB; seed: number };

/**
 * Each painter returns the colour of one pixel. Keeping them as pure functions
 * of (x, y) makes the swatches deterministic and easy to tune.
 */
type Painter = (x: number, y: number, c: Ctx) => RGB;

const softVignette = (x: number, y: number, c: Ctx, strength = 0.16): number => {
  const dx = (x / c.w - 0.5) * 2;
  const dy = (y / c.h - 0.5) * 2;
  return 1 - Math.min(1, (dx * dx + dy * dy) * 0.5) * strength;
};

/** Sheet material shown at a slight angle, with the cut edge visible. */
const boardPainter = (grainStrength: number): Painter => (x, y, c) => {
  const edgeStart = c.h * 0.82;

  if (y > edgeStart) {
    // The exposed core of the board — darker, flecked chipboard.
    const t = (y - edgeStart) / (c.h - edgeStart);
    const core = mix(shade(c.base, -0.55), shade(c.base, -0.35), t);
    const fleck = smoothNoise(x * 0.9, y * 0.9, c.seed + 9, 2) * 26;
    return [clamp255(core[0] + fleck), clamp255(core[1] + fleck), clamp255(core[2] + fleck)];
  }

  // Face: many fine grain lines running the length of the sheet. Raising the
  // sine to a power turns the smooth wave into thin dark lines on a light
  // ground, which is what board grain actually looks like.
  const drift = smoothNoise(x * 0.006, y * 0.02, c.seed, 3) * 16;
  const wave = Math.sin((y + drift) * 0.19 + Math.sin(x * 0.004 + c.seed) * 2.1);
  const grain = Math.sign(wave) * Math.pow(Math.abs(wave), 2.6);
  const fine = smoothNoise(x * 0.6, y * 2.2, c.seed + 3, 2);

  const amount = grain * grainStrength + fine * 0.05;
  const col = mix(c.base, amount > 0 ? c.accent : shade(c.base, -0.42), Math.min(1, Math.abs(amount)));
  const lift = softVignette(x, y, c);
  return [clamp255(col[0] * lift), clamp255(col[1] * lift), clamp255(col[2] * lift)];
};

/** Flat faced panel — near-solid with a fine speckle and a sheen. */
const melaminePainter: Painter = (x, y, c) => {
  const edgeStart = c.h * 0.84;
  if (y > edgeStart) {
    const t = (y - edgeStart) / (c.h - edgeStart);
    const core = mix(shade(c.base, -0.5), shade(c.base, -0.3), t);
    const fleck = smoothNoise(x * 1.1, y * 1.1, c.seed + 5, 2) * 22;
    return [clamp255(core[0] + fleck), clamp255(core[1] + fleck), clamp255(core[2] + fleck)];
  }
  const speckle = smoothNoise(x * 1.9, y * 1.9, c.seed, 2) * 11;
  // A soft diagonal sheen so flat colours still read as a surface.
  const sheen = Math.max(0, 1 - Math.abs((x / c.w + y / c.h) / 2 - 0.34) * 2.6) * 16;
  const lift = softVignette(x, y, c, 0.2);
  return [
    clamp255((c.base[0] + speckle + sheen) * lift),
    clamp255((c.base[1] + speckle + sheen) * lift),
    clamp255((c.base[2] + speckle + sheen) * lift),
  ];
};

/** A roll of edge tape seen face on. */
const tapePainter: Painter = (x, y, c) => {
  const bg: RGB = [26, 26, 29];
  const cx = c.w * 0.5;
  const cy = c.h * 0.5;
  const r = Math.hypot(x - cx, (y - cy) * 1.06);
  const outer = Math.min(c.w, c.h) * 0.40;
  const inner = outer * 0.34;

  if (r > outer + 2) return bg;
  if (r > outer) return mix(bg, shade(c.base, -0.4), 0.5);
  if (r < inner) {
    // Core hole with a soft shadow.
    const t = r / inner;
    return mix(shade(bg, 0.06), shade(bg, -0.3), 1 - t);
  }

  // Coiled tape: fine concentric layers.
  const coil = Math.sin(r * 1.35) * 0.5 + 0.5;
  const band = mix(shade(c.base, -0.16), shade(c.base, 0.1), coil);
  const angle = Math.atan2(y - cy, x - cx);
  const light = Math.cos(angle + 0.9) * 0.09;
  const col = shade(band, light);
  return [clamp255(col[0]), clamp255(col[1]), clamp255(col[2])];
};

/** Brushed steel — vertical streaks with a broad highlight. */
const metalPainter: Painter = (x, y, c) => {
  const streak = smoothNoise(x * 2.4, y * 0.06, c.seed, 2) * 20;
  const across = x / c.w;
  const highlight = Math.exp(-Math.pow((across - 0.36) * 3.1, 2)) * 46;
  const falloff = Math.exp(-Math.pow((across - 0.86) * 2.4, 2)) * -22;
  const lift = softVignette(x, y, c, 0.22);
  return [
    clamp255((c.base[0] + streak + highlight + falloff) * lift),
    clamp255((c.base[1] + streak + highlight + falloff) * lift),
    clamp255((c.base[2] + streak + highlight + falloff) * lift),
  ];
};

/** Woven fabric — a crosshatch of warp and weft. */
const fabricPainter: Painter = (x, y, c) => {
  const warp = Math.sin(x * 0.62) * 0.5 + 0.5;
  const weft = Math.sin(y * 0.62) * 0.5 + 0.5;
  const weave = (warp * 0.6 + weft * 0.4) * 2 - 1;
  const slub = smoothNoise(x * 0.25, y * 0.25, c.seed, 3) * 0.32;
  const amount = weave * 0.12 + slub * 0.14;
  const col = shade(c.base, amount);
  const lift = softVignette(x, y, c, 0.24);
  return [clamp255(col[0] * lift), clamp255(col[1] * lift), clamp255(col[2] * lift)];
};

/** Open-cell foam — irregular blotches. */
const foamPainter: Painter = (x, y, c) => {
  const cells = smoothNoise(x * 0.55, y * 0.55, c.seed, 4);
  const fine = smoothNoise(x * 2.1, y * 2.1, c.seed + 2, 2);
  const col = shade(c.base, cells * 0.2 + fine * 0.07);
  const edgeStart = c.h * 0.8;
  if (y > edgeStart) {
    const t = (y - edgeStart) / (c.h - edgeStart);
    return shade(col, -0.12 - t * 0.16);
  }
  const lift = softVignette(x, y, c, 0.2);
  return [clamp255(col[0] * lift), clamp255(col[1] * lift), clamp255(col[2] * lift)];
};

/** A tin or drum standing on a neutral ground. */
const tinPainter: Painter = (x, y, c) => {
  const bg: RGB = [24, 24, 27];
  const left = c.w * 0.27;
  const right = c.w * 0.73;
  const top = c.h * 0.2;
  const bottom = c.h * 0.86;

  if (x < left || x > right || y < top || y > bottom) {
    // Contact shadow under the tin.
    const shadow = y > bottom && y < bottom + c.h * 0.06 && x > left * 0.9 && x < right * 1.1;
    return shadow ? mix(bg, [0, 0, 0], 0.5) : bg;
  }

  const across = (x - left) / (right - left);
  const body = shade(c.base, Math.cos((across - 0.35) * 2.6) * 0.24 - 0.06);

  // Lid band and a label stripe.
  if (y < top + c.h * 0.06) return shade(c.accent, Math.cos((across - 0.35) * 2.6) * 0.2);
  const labelTop = top + (bottom - top) * 0.34;
  const labelBottom = top + (bottom - top) * 0.62;
  if (y > labelTop && y < labelBottom) {
    return shade(c.accent, Math.cos((across - 0.35) * 2.6) * 0.22 - 0.02);
  }
  return [clamp255(body[0]), clamp255(body[1]), clamp255(body[2])];
};

/** Kraft carton with fold lines and tape. */
const cartonPainter: Painter = (x, y, c) => {
  const grain = smoothNoise(x * 0.7, y * 0.7, c.seed, 3) * 12;
  const base: RGB = [
    clamp255(c.base[0] + grain),
    clamp255(c.base[1] + grain),
    clamp255(c.base[2] + grain),
  ];

  // Centre seam plus the flap edges.
  const seam = Math.abs(x - c.w * 0.5) < 2.2;
  const flapLeft = Math.abs(y - c.h * 0.28) < 1.6 && x < c.w * 0.5;
  const flapRight = Math.abs(y - c.h * 0.36) < 1.6 && x > c.w * 0.5;
  if (seam || flapLeft || flapRight) return shade(base, -0.28);

  // Packing tape down the seam.
  if (Math.abs(x - c.w * 0.5) < c.w * 0.06) return mix(base, [214, 196, 150], 0.45);

  const lift = softVignette(x, y, c, 0.26);
  return [clamp255(base[0] * lift), clamp255(base[1] * lift), clamp255(base[2] * lift)];
};

/** Sawn hardwood — strong directional grain and end-grain at the foot. */
const timberPainter: Painter = (x, y, c) => {
  const wobble = smoothNoise(x * 0.016, y * 0.006, c.seed, 4) * 14;
  const rings = Math.sin((y + wobble * 6) * 0.15 + Math.sin(x * 0.008 + c.seed) * 2.2);
  const sharp = Math.sign(rings) * Math.pow(Math.abs(rings), 2.2);
  const knot = Math.exp(-Math.pow((x - c.w * 0.68) / (c.w * 0.09), 2)
                        - Math.pow((y - c.h * 0.62) / (c.h * 0.1), 2));
  const amount = sharp * 0.42 + smoothNoise(x * 0.7, y * 1.8, c.seed + 4, 2) * 0.07 - knot * 0.35;
  const col = mix(c.base, amount > 0 ? c.accent : shade(c.base, -0.42), Math.min(1, Math.abs(amount)));
  const lift = softVignette(x, y, c, 0.2);
  return [clamp255(col[0] * lift), clamp255(col[1] * lift), clamp255(col[2] * lift)];
};

/** Elasticated webbing — a flat strap with woven ribs. */
const webbingPainter: Painter = (x, y, c) => {
  const bg: RGB = [24, 24, 27];
  const top = c.h * 0.3;
  const bottom = c.h * 0.7;
  if (y < top || y > bottom) return bg;
  const rib = Math.sin(x * 0.9) * 0.5 + 0.5;
  const edge = Math.min(y - top, bottom - y) / (c.h * 0.06);
  const col = shade(c.base, rib * 0.16 - 0.05 - Math.max(0, 1 - edge) * 0.3);
  return [clamp255(col[0]), clamp255(col[1]), clamp255(col[2])];
};

export const PAINTERS: Record<TextureKind, Painter> = {
  board: boardPainter(0.5),
  melamine: melaminePainter,
  tape: tapePainter,
  metal: metalPainter,
  fabric: fabricPainter,
  foam: foamPainter,
  tin: tinPainter,
  carton: cartonPainter,
  timber: timberPainter,
  webbing: webbingPainter,
};

export function renderTexture(
  kind: TextureKind,
  width: number,
  height: number,
  baseHex: string,
  accentHex: string,
  seed: number,
): Uint8Array {
  const painter = PAINTERS[kind];
  const ctx: Ctx = {
    w: width,
    h: height,
    base: hexToRgb(baseHex),
    accent: hexToRgb(accentHex),
    seed,
  };
  const out = new Uint8Array(width * height * 3);
  let i = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = painter(x, y, ctx);
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
      i += 3;
    }
  }
  return out;
}
