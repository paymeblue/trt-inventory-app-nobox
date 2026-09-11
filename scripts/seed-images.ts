import "./env";
import { Pool, type PoolClient } from "pg";
import { encodePng } from "./png";
import { renderTexture, type TextureKind } from "./textures";

const WIDTH = 512;
const HEIGHT = 384;

/** Appearance for each seeded material: texture, body colour, highlight colour. */
const LOOKS: Record<string, [TextureKind, string, string]> = {
  "MEL-18-WHT":   ["melamine", "#eceae5", "#ffffff"],
  "MEL-18-OAK":   ["board",    "#c69a63", "#e6c48f"],
  "MEL-18-ANT":   ["melamine", "#3f4247", "#585c63"],
  "MDF-16-RAW":   ["board",    "#b98a5c", "#d4a878"],
  "PLY-12-MAR":   ["board",    "#d2a774", "#efcb9b"],
  "HDF-3-BCK":    ["melamine", "#8d6a4c", "#a98461"],

  "EDG-22-WHT":   ["tape", "#f2f0ec", "#ffffff"],
  "EDG-22-OAK":   ["tape", "#c39a67", "#e0bb8d"],
  "EDG-22-ANT":   ["tape", "#3e4146", "#585c63"],
  "EDG-42-WHT":   ["tape", "#eae8e4", "#ffffff"],

  "HNG-SC-35":    ["metal", "#9aa0a8", "#cfd4da"],
  "RUN-BM-450":   ["metal", "#8e949c", "#c6cbd2"],
  "HDL-BAR-160":  ["metal", "#a7adb5", "#d8dde2"],
  "LEG-ADJ-100":  ["metal", "#7f858d", "#b4bac1"],
  "SCR-CHIP-40":  ["metal", "#96795a", "#c3a781"],
  "LFT-GAS-100":  ["metal", "#6f757d", "#a5abb3"],

  "ADH-CNT-4L":   ["tin", "#b8b3ab", "#c8783c"],
  "ADH-PVA-5L":   ["tin", "#c2bdb5", "#3f7fbf"],
  "CHM-THN-4L":   ["tin", "#aeb3b8", "#c0392b"],
  "ABR-SAND-120": ["fabric", "#96704a", "#b28b60"],

  "HWD-IRO-2X4":  ["timber", "#a9713c", "#cf9560"],
  "HWD-MAH-1X6":  ["timber", "#8a4632", "#b56a4c"],

  "FOM-HD-100":   ["foam", "#dcd2c0", "#efe7d8"],
  "FAB-LIN-GRY":  ["fabric", "#8d8b86", "#a9a7a1"],
  "WEB-ELS-50":   ["webbing", "#4e5257", "#6d7278"],

  "PKG-NYL-STR":  ["tape", "#a9b6bd", "#cdd7db"],
  "PKG-CRT-LRG":  ["carton", "#a07a4f", "#bd9668"],
  "PKG-PSY-SHT":  ["foam", "#e6e6e6", "#ffffff"],
};

/** Renders a swatch for every known SKU and points the product row at it. */
export async function seedProductImages(client: PoolClient, userId: string | null) {
  const { rows: products } = await client.query<{ id: string; sku: string; name: string }>(
    "SELECT id, sku, name FROM products WHERE image_id IS NULL",
  );

  let made = 0;
  for (const product of products) {
    const look = LOOKS[product.sku.toUpperCase()];
    if (!look) continue;

    const [kind, base, accent] = look;
    // Seed from the SKU so the same material always renders identically.
    const seed = [...product.sku].reduce((n, ch) => n + ch.charCodeAt(0), 0) % 997;
    const png = encodePng(WIDTH, HEIGHT, renderTexture(kind, WIDTH, HEIGHT, base, accent, seed));

    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO images (filename, mime_type, byte_size, data, uploaded_by)
       VALUES ($1,'image/png',$2,$3,$4) RETURNING id`,
      [`${product.sku.toLowerCase()}.png`, png.byteLength, png, userId],
    );
    await client.query("UPDATE products SET image_id = $1, updated_at = now() WHERE id = $2", [
      rows[0].id,
      product.id,
    ]);
    made += 1;
  }
  return made;
}

/** Standalone entry point: `npm run db:images` backfills an existing database. */
async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ id: string }>(
      "SELECT id FROM users WHERE role = 'ADMIN' ORDER BY created_at LIMIT 1",
    );
    const made = await seedProductImages(client, rows[0]?.id ?? null);
    await client.query("COMMIT");
    console.log(`${made} material images generated`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1]?.endsWith("seed-images.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
