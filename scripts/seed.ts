import "./env";
import bcrypt from "bcryptjs";
import { Pool, type PoolClient } from "pg";
import { encodePng } from "./png";
import { renderTexture, type TextureKind } from "./textures";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const USERS = [
  // email, name, role
  ["admin@trtnobox.com", "Chidi Nwosu", "ADMIN"],
  ["factory@trtnobox.com", "Tunde Balogun", "FACTORY_MANAGER"],
  ["nobox@trtnobox.com", "Adaeze Okafor", "NOBOX_MANAGER"],
  ["design@trtnobox.com", "Zainab Bello", "DESIGNER"],
] as const;

type Look = [TextureKind, string, string];

type ItemSeed = {
  sku: string; name: string; category: string; unit: string; reorder: number;
  colour?: string; spec?: string; factory?: number; nobox?: number; look: Look;
};

/** `factory` / `nobox` are the quantity held on each side; absent means that side does not stock it. */
const ITEMS: ItemSeed[] = [
  { sku: "MEL-18-WHT", name: "18mm White Melamine Board", category: "Boards & Panels", unit: "sheet", reorder: 40, colour: "White", spec: "2440 × 1220 × 18mm", factory: 96, nobox: 14, look: ["melamine", "#eceae5", "#ffffff"] },
  { sku: "MEL-18-OAK", name: "18mm Natural Oak Melamine Board", category: "Boards & Panels", unit: "sheet", reorder: 30, colour: "Natural oak", spec: "2440 × 1220 × 18mm", factory: 54, nobox: 6, look: ["board", "#c69a63", "#e6c48f"] },
  { sku: "MEL-18-ANT", name: "18mm Anthracite Melamine Board", category: "Boards & Panels", unit: "sheet", reorder: 25, colour: "Anthracite grey", spec: "2440 × 1220 × 18mm", factory: 18, look: ["melamine", "#3f4247", "#585c63"] },
  { sku: "MDF-16-RAW", name: "16mm Raw MDF Panel", category: "Boards & Panels", unit: "sheet", reorder: 35, spec: "2440 × 1220 × 16mm", factory: 77, look: ["board", "#b98a5c", "#d4a878"] },
  { sku: "PLY-12-MAR", name: "12mm Marine Plywood", category: "Boards & Panels", unit: "sheet", reorder: 20, spec: "2440 × 1220 × 12mm", factory: 9, nobox: 4, look: ["board", "#d2a774", "#efcb9b"] },
  { sku: "HDF-3-BCK", name: "3mm HDF Backing Board", category: "Boards & Panels", unit: "sheet", reorder: 50, spec: "2440 × 1220 × 3mm", factory: 144, look: ["melamine", "#8d6a4c", "#a98461"] },

  { sku: "EDG-22-WHT", name: "22mm PVC Edge Tape — White", category: "Edge Tapes", unit: "roll", reorder: 12, colour: "White", spec: "22mm × 100m", factory: 33, nobox: 5, look: ["tape", "#f2f0ec", "#ffffff"] },
  { sku: "EDG-22-OAK", name: "22mm PVC Edge Tape — Natural Oak", category: "Edge Tapes", unit: "roll", reorder: 10, colour: "Natural oak", spec: "22mm × 100m", factory: 11, look: ["tape", "#c39a67", "#e0bb8d"] },
  { sku: "EDG-22-ANT", name: "22mm PVC Edge Tape — Anthracite", category: "Edge Tapes", unit: "roll", reorder: 10, colour: "Anthracite", spec: "22mm × 100m", factory: 4, look: ["tape", "#3e4146", "#585c63"] },
  { sku: "EDG-42-WHT", name: "42mm ABS Edge Tape — White", category: "Edge Tapes", unit: "roll", reorder: 6, colour: "White", spec: "42mm × 75m", factory: 11, look: ["tape", "#eae8e4", "#ffffff"] },

  { sku: "HNG-SC-35", name: "35mm Soft-Close Concealed Hinge", category: "Hardware & Accessories", unit: "pcs", reorder: 400, spec: "110° full overlay", factory: 1420, nobox: 260, look: ["metal", "#9aa0a8", "#cfd4da"] },
  { sku: "RUN-BM-450", name: "450mm Ball-Bearing Drawer Runner", category: "Hardware & Accessories", unit: "set", reorder: 100, spec: "45kg load, full extension", factory: 254, nobox: 38, look: ["metal", "#8e949c", "#c6cbd2"] },
  { sku: "HDL-BAR-160", name: "160mm Brushed Steel Bar Handle", category: "Hardware & Accessories", unit: "pcs", reorder: 150, colour: "Brushed steel", factory: 96, nobox: 120, look: ["metal", "#a7adb5", "#d8dde2"] },
  { sku: "LEG-ADJ-100", name: "100mm Adjustable Cabinet Leg", category: "Hardware & Accessories", unit: "pcs", reorder: 200, factory: 540, look: ["metal", "#7f858d", "#b4bac1"] },
  { sku: "SCR-CHIP-40", name: "4 × 40mm Chipboard Screw", category: "Hardware & Accessories", unit: "pack", reorder: 25, spec: "Box of 500", factory: 76, nobox: 12, look: ["metal", "#96795a", "#c3a781"] },
  { sku: "LFT-GAS-100", name: "100N Gas Lift Strut", category: "Hardware & Accessories", unit: "pcs", reorder: 40, factory: 0, nobox: 16, look: ["metal", "#6f757d", "#a5abb3"] },

  { sku: "ADH-CNT-4L", name: "Contact Adhesive 4L", category: "Adhesives & Consumables", unit: "litre", reorder: 20, spec: "4 litre tin", factory: 43, look: ["tin", "#b8b3ab", "#c8783c"] },
  { sku: "ADH-PVA-5L", name: "PVA Wood Glue 5L", category: "Adhesives & Consumables", unit: "litre", reorder: 15, factory: 27, nobox: 8, look: ["tin", "#c2bdb5", "#3f7fbf"] },
  { sku: "CHM-THN-4L", name: "Cleaning Thinner 4L", category: "Adhesives & Consumables", unit: "litre", reorder: 18, factory: 16, look: ["tin", "#aeb3b8", "#c0392b"] },
  { sku: "ABR-SAND-120", name: "120 Grit Sanding Sheet", category: "Adhesives & Consumables", unit: "pack", reorder: 20, spec: "Pack of 50", factory: 41, look: ["fabric", "#96704a", "#b28b60"] },

  { sku: "HWD-IRO-2X4", name: "Iroko Hardwood 2×4", category: "Hardwood", unit: "m", reorder: 120, spec: "50 × 100mm, kiln dried", factory: 408, look: ["timber", "#a9713c", "#cf9560"] },
  { sku: "HWD-MAH-1X6", name: "Mahogany Board 1×6", category: "Hardwood", unit: "m", reorder: 80, spec: "25 × 150mm", factory: 56, look: ["timber", "#8a4632", "#b56a4c"] },

  { sku: "FOM-HD-100", name: "High-Density Foam 100mm", category: "Upholstery", unit: "sheet", reorder: 8, spec: "1900 × 900 × 100mm", factory: 20, nobox: 3, look: ["foam", "#dcd2c0", "#efe7d8"] },
  { sku: "FAB-LIN-GRY", name: "Linen Upholstery Fabric — Grey", category: "Upholstery", unit: "m", reorder: 60, colour: "Warm grey", spec: "1.4m wide", factory: 82, nobox: 140, look: ["fabric", "#8d8b86", "#a9a7a1"] },
  { sku: "FAB-VLV-OLV", name: "Velvet Upholstery Fabric — Olive", category: "Upholstery", unit: "m", reorder: 30, colour: "Olive", spec: "1.4m wide", nobox: 64, look: ["fabric", "#5f6b3c", "#7b8850"] },
  { sku: "WEB-ELS-50", name: "50mm Elasticated Webbing", category: "Upholstery", unit: "m", reorder: 100, factory: 46, look: ["webbing", "#4e5257", "#6d7278"] },

  { sku: "PKG-NYL-STR", name: "Stretch Nylon Wrap", category: "Packaging", unit: "roll", reorder: 15, factory: 28, nobox: 9, look: ["tape", "#a9b6bd", "#cdd7db"] },
  { sku: "PKG-CRT-LRG", name: "Large Double-Wall Carton", category: "Packaging", unit: "pcs", reorder: 80, spec: "1200 × 800 × 600mm", factory: 150, look: ["carton", "#a07a4f", "#bd9668"] },
];

async function image(client: PoolClient, sku: string, [kind, base, accent]: Look, userId: string) {
  // Seed from the SKU so the same item always renders identically.
  const seed = [...sku].reduce((n, ch) => n + ch.charCodeAt(0), 0) % 997;
  const png = encodePng(512, 384, renderTexture(kind, 512, 384, base, accent, seed));
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO images (filename, mime_type, byte_size, data, uploaded_by)
     VALUES ($1,'image/png',$2,$3,$4) RETURNING id`,
    [`${sku.toLowerCase()}.png`, png.byteLength, png, userId],
  );
  return rows[0].id;
}

async function seed(client: PoolClient) {
  const already = await client.query("SELECT COUNT(*)::int AS n FROM users");
  if (already.rows[0].n > 0) {
    console.log("Database already has users — seeding would duplicate data. Run db:reset first.");
    return;
  }

  const password = await bcrypt.hash("trtnobox2026", 10);
  const userIds = new Map<string, string>();
  for (const [email, name, role] of USERS) {
    const { rows } = await client.query<{ id: string }>(
      "INSERT INTO users (email, password_hash, full_name, role) VALUES ($1,$2,$3,$4) RETURNING id",
      [email, password, name, role],
    );
    userIds.set(role, rows[0].id);
  }
  console.log(`  ${USERS.length} users (password: trtnobox2026)`);

  let count = 0;
  for (const item of ITEMS) {
    const sides = [
      ["FACTORY", item.factory, userIds.get("FACTORY_MANAGER")!],
      ["NOBOX", item.nobox, userIds.get("NOBOX_MANAGER")!],
    ] as const;
    for (const [source, quantity, userId] of sides) {
      if (quantity === undefined) continue;
      const imageId = await image(client, item.sku, item.look, userId);
      await client.query(
        "INSERT INTO categories (source, name, created_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
        [source, item.category, userId],
      );
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO items (source, sku, name, category, colour, spec, unit, quantity, reorder_level,
                            image_id, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11) RETURNING id`,
        [source, item.sku, item.name, item.category, item.colour ?? null, item.spec ?? null,
         // Nobox is the smaller store, so it flags low stock at a quarter of the Factory level.
         item.unit, quantity, source === "NOBOX" ? Math.ceil(item.reorder / 4) : item.reorder, imageId, userId],
      );
      await client.query(
        `INSERT INTO item_movements (item_id, source, kind, delta, balance_after, note, created_by)
         VALUES ($1,$2,'CREATE',$3,$3,'Opening stock',$4)`,
        [rows[0].id, source, quantity, userId],
      );
      count += 1;
    }
  }
  console.log(`  ${count} items across Factory and Nobox, each with a rendered swatch`);

  // Two open reservations, so the Factory has something waiting to issue.
  const designer = userIds.get("DESIGNER")!;
  const RESERVATIONS = [
    ["MEL-18-WHT", 12, "Ikoyi Kitchen & Wardrobes", "Island and tall units"],
    ["HNG-SC-35", 80, "Victoria Island Office Refit", null],
  ] as const;
  for (const [sku, quantity, project, notes] of RESERVATIONS) {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO reservations (item_id, source, quantity, project, notes, reserved_by)
       SELECT id, source, $2, $3, $4, $5 FROM items WHERE source = 'FACTORY' AND sku = $1
       RETURNING id`,
      [sku, quantity, project, notes, designer],
    );
    await client.query(
      "INSERT INTO reservation_events (reservation_id, action, note, created_by) VALUES ($1, 'RESERVED', $2, $3)",
      [rows[0].id, notes, designer],
    );
  }
  console.log(`  ${RESERVATIONS.length} reservations waiting to be issued`);
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await seed(client);
    await client.query("COMMIT");
    console.log("seed complete");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
