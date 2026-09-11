import "./env";
import bcrypt from "bcryptjs";
import { Pool, type PoolClient } from "pg";
import { seedProductImages } from "./seed-images";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const COMPANIES = [
  // code, name, short name, parent code, accent colour
  ["TRT", "TRT Furniture Ltd", "TRT", null, "#f0a52a"],
  ["NBX", "Nobox Interiors Ltd", "Nobox", "TRT", "#7ba2ff"],
] as const;

const LOCATIONS = [
  // code, name, kind, address, owning company
  ["WH1", "Main Warehouse", "WAREHOUSE", "Km 12 Lekki-Epe Expressway, Lagos", "TRT"],
  ["FAC", "Factory Floor", "FACTORY", "TRT Production Facility, Ikorodu", "TRT"],
  ["UPH", "Upholstery Section", "FACTORY", "TRT Production Facility, Ikorodu", "TRT"],
  ["SITE-A", "Lekki Phase 1 Site", "SITE", "Plot 14, Admiralty Way, Lekki Phase 1", "TRT"],
  ["NBX-WH", "Nobox Store", "WAREHOUSE", "18 Kudirat Abiola Way, Oregun, Lagos", "NBX"],
  ["TRN", "In Transit", "TRANSIT", null, "TRT"],
] as const;

const USERS = [
  // email, name, role, based at, company scope (null = sees the whole group)
  ["admin@trtnobox.com", "Chidi Nwosu", "ADMIN", "WH1", null],
  ["ops@trtnobox.com", "Amara Eze", "OPERATIONS_MANAGER", "WH1", null],
  ["factory@trtnobox.com", "Tunde Balogun", "FACTORY_MANAGER", "FAC", "TRT"],
  ["store@trtnobox.com", "Ngozi Adeyemi", "STOREKEEPER", "WH1", "TRT"],
  ["inventory@trtnobox.com", "Bola Fashola", "INVENTORY_OFFICER", "WH1", "TRT"],
  ["procurement@trtnobox.com", "Ifeanyi Obi", "PROCUREMENT_OFFICER", "WH1", null],
  ["site@trtnobox.com", "Kemi Alabi", "PROJECT_SUPERVISOR", "SITE-A", "TRT"],
  ["qc@trtnobox.com", "Segun Oyelaran", "QUALITY_CONTROL", "FAC", "TRT"],
  ["logistics@trtnobox.com", "Halima Yusuf", "LOGISTICS_OFFICER", "WH1", null],
  ["design@trtnobox.com", "Zainab Bello", "VIEWER", null, null],
  ["nobox.store@trtnobox.com", "Emeka Nwachukwu", "STOREKEEPER", "NBX-WH", "NBX"],
  ["nobox.ops@trtnobox.com", "Adaeze Okafor", "OPERATIONS_MANAGER", "NBX-WH", "NBX"],
] as const;

const CATEGORIES = [
  ["Boards & Panels", "Melamine, MDF, plywood and blockboard sheets"],
  ["Edge Tapes", "PVC and ABS edging in matching finishes"],
  ["Hardware & Accessories", "Hinges, runners, handles and fittings"],
  ["Adhesives & Consumables", "Glues, thinner, abrasives and cleaning agents"],
  ["Hardwood", "Solid timber for frames and mouldings"],
  ["Upholstery", "Foam, fabric, webbing and trims"],
  ["Packaging", "Nylon, cartons, foam and polystyrene for delivery"],
] as const;

const SUPPLIERS = [
  ["Prime Board Nigeria Ltd", "Emeka Duru", "sales@primeboard.ng", "+234 803 441 2290", "Apapa, Lagos", true],
  ["Edgeline Trading Co.", "Fatima Sani", "orders@edgeline.ng", "+234 805 112 7743", "Ojota, Lagos", true],
  ["Blum Hardware Distributors", "Yemi Adebayo", "info@blumdist.ng", "+234 802 330 9915", "Ikeja, Lagos", true],
  ["Chemcoat Adhesives", "Peter Okoro", "sales@chemcoat.ng", "+234 807 664 2018", "Mushin, Lagos", false],
  ["Timber Republic", "Grace Ubah", "grace@timberrepublic.ng", "+234 806 229 4471", "Mile 12, Lagos", true],
  ["ComfortFoam Industries", "Ahmed Lawal", "sales@comfortfoam.ng", "+234 809 553 8820", "Sango Ota, Ogun", false],
] as const;

type ProductSeed = {
  sku: string; name: string; category: string; supplier: string; unit: string;
  cost: number; reorder: number; colour?: string; spec?: string; shelf?: string;
  stock: Partial<Record<"WH1" | "FAC" | "UPH" | "SITE-A", number>>;
};

const PRODUCTS: ProductSeed[] = [
  { sku: "MEL-18-WHT", name: "18mm White Melamine Board", category: "Boards & Panels", supplier: "Prime Board Nigeria Ltd", unit: "sheet", cost: 32500, reorder: 40, colour: "White", spec: "2440 × 1220 × 18mm", shelf: "A-01", stock: { WH1: 84, FAC: 12 } },
  { sku: "MEL-18-OAK", name: "18mm Natural Oak Melamine Board", category: "Boards & Panels", supplier: "Prime Board Nigeria Ltd", unit: "sheet", cost: 36800, reorder: 30, colour: "Natural oak", spec: "2440 × 1220 × 18mm", shelf: "A-02", stock: { WH1: 46, FAC: 8 } },
  { sku: "MEL-18-ANT", name: "18mm Anthracite Melamine Board", category: "Boards & Panels", supplier: "Prime Board Nigeria Ltd", unit: "sheet", cost: 37200, reorder: 25, colour: "Anthracite grey", spec: "2440 × 1220 × 18mm", shelf: "A-03", stock: { WH1: 18 } },
  { sku: "MDF-16-RAW", name: "16mm Raw MDF Panel", category: "Boards & Panels", supplier: "Prime Board Nigeria Ltd", unit: "sheet", cost: 24900, reorder: 35, spec: "2440 × 1220 × 16mm", shelf: "A-05", stock: { WH1: 62, FAC: 15 } },
  { sku: "PLY-12-MAR", name: "12mm Marine Plywood", category: "Boards & Panels", supplier: "Prime Board Nigeria Ltd", unit: "sheet", cost: 28400, reorder: 20, spec: "2440 × 1220 × 12mm", shelf: "A-07", stock: { WH1: 9 } },
  { sku: "HDF-3-BCK", name: "3mm HDF Backing Board", category: "Boards & Panels", supplier: "Prime Board Nigeria Ltd", unit: "sheet", cost: 8600, reorder: 50, spec: "2440 × 1220 × 3mm", shelf: "A-09", stock: { WH1: 120, FAC: 24 } },

  { sku: "EDG-22-WHT", name: "22mm PVC Edge Tape — White", category: "Edge Tapes", supplier: "Edgeline Trading Co.", unit: "roll", cost: 9800, reorder: 12, colour: "White", spec: "22mm × 100m", shelf: "B-01", stock: { WH1: 27, FAC: 6 } },
  { sku: "EDG-22-OAK", name: "22mm PVC Edge Tape — Natural Oak", category: "Edge Tapes", supplier: "Edgeline Trading Co.", unit: "roll", cost: 11200, reorder: 10, colour: "Natural oak", spec: "22mm × 100m", shelf: "B-02", stock: { WH1: 8, FAC: 3 } },
  { sku: "EDG-22-ANT", name: "22mm PVC Edge Tape — Anthracite", category: "Edge Tapes", supplier: "Edgeline Trading Co.", unit: "roll", cost: 11200, reorder: 10, colour: "Anthracite", spec: "22mm × 100m", shelf: "B-03", stock: { WH1: 4 } },
  { sku: "EDG-42-WHT", name: "42mm ABS Edge Tape — White", category: "Edge Tapes", supplier: "Edgeline Trading Co.", unit: "roll", cost: 15600, reorder: 6, colour: "White", spec: "42mm × 75m", shelf: "B-05", stock: { WH1: 11 } },

  { sku: "HNG-SC-35", name: "35mm Soft-Close Concealed Hinge", category: "Hardware & Accessories", supplier: "Blum Hardware Distributors", unit: "pcs", cost: 2350, reorder: 400, spec: "110° full overlay", shelf: "C-01", stock: { WH1: 1240, FAC: 180 } },
  { sku: "RUN-BM-450", name: "450mm Ball-Bearing Drawer Runner", category: "Hardware & Accessories", supplier: "Blum Hardware Distributors", unit: "set", cost: 6800, reorder: 100, spec: "45kg load, full extension", shelf: "C-04", stock: { WH1: 214, FAC: 40 } },
  { sku: "HDL-BAR-160", name: "160mm Brushed Steel Bar Handle", category: "Hardware & Accessories", supplier: "Blum Hardware Distributors", unit: "pcs", cost: 3200, reorder: 150, colour: "Brushed steel", shelf: "C-06", stock: { WH1: 96 } },
  { sku: "LEG-ADJ-100", name: "100mm Adjustable Cabinet Leg", category: "Hardware & Accessories", supplier: "Blum Hardware Distributors", unit: "pcs", cost: 950, reorder: 200, shelf: "C-08", stock: { WH1: 480, FAC: 60 } },
  { sku: "SCR-CHIP-40", name: "4 × 40mm Chipboard Screw", category: "Hardware & Accessories", supplier: "Blum Hardware Distributors", unit: "pack", cost: 4200, reorder: 25, spec: "Box of 500", shelf: "C-11", stock: { WH1: 62, FAC: 14 } },
  { sku: "LFT-GAS-100", name: "100N Gas Lift Strut", category: "Hardware & Accessories", supplier: "Blum Hardware Distributors", unit: "pcs", cost: 5400, reorder: 40, shelf: "C-13", stock: { WH1: 0 } },

  { sku: "ADH-CNT-4L", name: "Contact Adhesive 4L", category: "Adhesives & Consumables", supplier: "Chemcoat Adhesives", unit: "litre", cost: 12800, reorder: 20, spec: "4 litre tin", shelf: "D-01", stock: { WH1: 34, FAC: 9 } },
  { sku: "ADH-PVA-5L", name: "PVA Wood Glue 5L", category: "Adhesives & Consumables", supplier: "Chemcoat Adhesives", unit: "litre", cost: 9600, reorder: 15, shelf: "D-02", stock: { WH1: 22, FAC: 5 } },
  { sku: "CHM-THN-4L", name: "Cleaning Thinner 4L", category: "Adhesives & Consumables", supplier: "Chemcoat Adhesives", unit: "litre", cost: 7400, reorder: 18, shelf: "D-04", stock: { WH1: 12, FAC: 4 } },
  { sku: "ABR-SAND-120", name: "120 Grit Sanding Sheet", category: "Adhesives & Consumables", supplier: "Chemcoat Adhesives", unit: "pack", cost: 3600, reorder: 20, spec: "Pack of 50", shelf: "D-06", stock: { WH1: 41 } },

  { sku: "HWD-IRO-2X4", name: "Iroko Hardwood 2×4", category: "Hardwood", supplier: "Timber Republic", unit: "m", cost: 5800, reorder: 120, spec: "50 × 100mm, kiln dried", shelf: "E-01", stock: { WH1: 340, FAC: 68 } },
  { sku: "HWD-MAH-1X6", name: "Mahogany Board 1×6", category: "Hardwood", supplier: "Timber Republic", unit: "m", cost: 7200, reorder: 80, spec: "25 × 150mm", shelf: "E-03", stock: { WH1: 56 } },

  { sku: "FOM-HD-100", name: "High-Density Foam 100mm", category: "Upholstery", supplier: "ComfortFoam Industries", unit: "sheet", cost: 42000, reorder: 8, spec: "1900 × 900 × 100mm", shelf: "F-01", stock: { UPH: 14, WH1: 6 } },
  { sku: "FAB-LIN-GRY", name: "Linen Upholstery Fabric — Grey", category: "Upholstery", supplier: "ComfortFoam Industries", unit: "m", cost: 8900, reorder: 60, colour: "Warm grey", spec: "1.4m wide", shelf: "F-04", stock: { UPH: 82 } },
  { sku: "WEB-ELS-50", name: "50mm Elasticated Webbing", category: "Upholstery", supplier: "ComfortFoam Industries", unit: "m", cost: 1400, reorder: 100, shelf: "F-06", stock: { UPH: 46 } },

  { sku: "PKG-NYL-STR", name: "Stretch Nylon Wrap", category: "Packaging", supplier: "Edgeline Trading Co.", unit: "roll", cost: 6200, reorder: 15, shelf: "G-01", stock: { WH1: 28 } },
  { sku: "PKG-CRT-LRG", name: "Large Double-Wall Carton", category: "Packaging", supplier: "Edgeline Trading Co.", unit: "pcs", cost: 2100, reorder: 80, spec: "1200 × 800 × 600mm", shelf: "G-03", stock: { WH1: 150 } },
  { sku: "PKG-PSY-SHT", name: "Polystyrene Protection Sheet", category: "Packaging", supplier: "Edgeline Trading Co.", unit: "sheet", cost: 1800, reorder: 100, shelf: "G-05", stock: { WH1: 64 } },
];

const PROJECTS = [
  // code, name, client, site, status, supervisor, delivering company
  ["TRT-041", "Lekki Phase 1 Duplex Fit-out", "Mr & Mrs Adewale", "Plot 14, Admiralty Way, Lekki Phase 1", "INSTALLATION", "site@trtnobox.com", "TRT"],
  ["TRT-042", "Victoria Island Office Refit", "Hallmark Capital Ltd", "3rd Floor, Adeola Odeku, VI", "IN_PRODUCTION", "site@trtnobox.com", "TRT"],
  ["TRT-043", "Ikoyi Kitchen & Wardrobes", "Dr Ngozi Umeh", "22 Bourdillon Road, Ikoyi", "PLANNING", null, "TRT"],
  ["TRT-039", "Maryland Showroom Build", "TRT Furniture Ltd", "Maryland Mall, Ikeja", "COMPLETED", null, "TRT"],
  ["NBX-018", "Yaba Co-working Fit-out", "Stack Hub Ltd", "9 Commercial Avenue, Yaba", "IN_PRODUCTION", null, "NBX"],
  ["NBX-019", "Ajah Retail Counters", "Brightline Stores", "Lekki-Epe Expressway, Ajah", "PLANNING", null, "NBX"],
] as const;

async function seed(client: PoolClient) {
  const already = await client.query("SELECT COUNT(*)::int AS n FROM users");
  if (already.rows[0].n > 0) {
    console.log("Database already has users — seeding would duplicate data. Run db:reset first.");
    return;
  }

  const companyIds = new Map<string, string>();
  for (const [code, name, shortName, parent, colour] of COMPANIES) {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO companies (code, name, short_name, parent_id, colour)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [code, name, shortName, parent ? companyIds.get(parent) : null, colour],
    );
    companyIds.set(code, rows[0].id);
  }
  console.log(`  ${COMPANIES.length} companies (TRT with Nobox under it)`);

  const locationIds = new Map<string, string>();
  for (const [code, name, kind, address, company] of LOCATIONS) {
    const { rows } = await client.query<{ id: string }>(
      "INSERT INTO locations (code, name, kind, address, company_id) VALUES ($1,$2,$3,$4,$5) RETURNING id",
      [code, name, kind, address, companyIds.get(company)],
    );
    locationIds.set(code, rows[0].id);
  }
  console.log(`  ${LOCATIONS.length} locations`);

  const password = await bcrypt.hash("trtnobox2026", 10);
  const userIds = new Map<string, string>();
  for (const [email, name, role, loc, company] of USERS) {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, full_name, role, location_id, company_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [email, password, name, role, loc ? locationIds.get(loc) : null,
       company ? companyIds.get(company) : null],
    );
    userIds.set(email, rows[0].id);
  }
  console.log(`  ${USERS.length} users (password: trtnobox2026)`);

  const categoryIds = new Map<string, string>();
  for (const [name, description] of CATEGORIES) {
    const { rows } = await client.query<{ id: string }>(
      "INSERT INTO categories (name, description) VALUES ($1,$2) RETURNING id",
      [name, description],
    );
    categoryIds.set(name, rows[0].id);
  }

  const supplierIds = new Map<string, string>();
  for (const [name, contact, email, phone, address, approved] of SUPPLIERS) {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO suppliers (name, contact_person, email, phone, address, is_approved)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [name, contact, email, phone, address, approved],
    );
    supplierIds.set(name, rows[0].id);
  }
  console.log(`  ${CATEGORIES.length} categories, ${SUPPLIERS.length} suppliers`);

  const storekeeper = userIds.get("store@trtnobox.com")!;
  const productIds = new Map<string, string>();

  for (const p of PRODUCTS) {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO products
         (sku, name, category_id, supplier_id, unit, unit_cost, reorder_level,
          colour, spec, shelf_ref, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [
        p.sku, p.name, categoryIds.get(p.category), supplierIds.get(p.supplier),
        p.unit, p.cost, p.reorder, p.colour ?? null, p.spec ?? null, p.shelf ?? null,
        storekeeper,
      ],
    );
    const id = rows[0].id;
    productIds.set(p.sku, id);

    for (const [code, quantity] of Object.entries(p.stock)) {
      if (!quantity) continue;
      const locationId = locationIds.get(code)!;
      await client.query(
        `INSERT INTO stock_levels (product_id, location_id, on_hand) VALUES ($1,$2,$3)`,
        [id, locationId, quantity],
      );
      // Backdate opening balances so the trend chart is not a single spike.
      await client.query(
        `INSERT INTO stock_movements
           (product_id, movement_type, quantity, to_location_id, unit_cost, reference, created_by, created_at)
         VALUES ($1,'OPENING',$2,$3,$4,'Opening balance',$5, now() - ($6 || ' days')::interval)`,
        [id, quantity, locationId, p.cost, storekeeper, 20 + Math.floor(Math.random() * 10)],
      );
    }
  }
  console.log(`  ${PRODUCTS.length} materials with opening stock`);

  // Nobox keeps its own store. Some materials are common to both companies —
  // that overlap is the whole point of the group view: check inside the group
  // before buying outside it.
  const noboxStore = locationIds.get("NBX-WH")!;
  const noboxStock: [string, number][] = [
    ["MEL-18-WHT", 33],
    ["MEL-18-ANT", 31],
    ["MDF-16-RAW", 18],
    ["HDF-3-BCK", 40],
    ["EDG-22-WHT", 9],
    ["EDG-22-ANT", 14],
    ["HNG-SC-35", 710],
    ["RUN-BM-450", 88],
    ["HDL-BAR-160", 240],
    ["LFT-GAS-100", 65],
    ["ADH-CNT-4L", 11],
    ["PKG-CRT-LRG", 45],
    ["ADH-PVA-5L", 4],
  ];

  for (const [sku, quantity] of noboxStock) {
    const productId = productIds.get(sku);
    if (!productId) continue;
    const locationId = noboxStore;
    await client.query(
      `INSERT INTO stock_levels (product_id, location_id, on_hand) VALUES ($1,$2,$3)
       ON CONFLICT (product_id, location_id)
       DO UPDATE SET on_hand = stock_levels.on_hand + EXCLUDED.on_hand`,
      [productId, locationId, quantity],
    );
    await client.query(
      `INSERT INTO stock_movements
         (product_id, movement_type, quantity, to_location_id, reference, created_by, created_at)
       VALUES ($1,'OPENING',$2,$3,'Opening balance',$4, now() - ($5 || ' days')::interval)`,
      [productId, quantity, locationId, userIds.get("nobox.store@trtnobox.com"),
       18 + Math.floor(Math.random() * 8)],
    );
  }
  console.log(`  ${noboxStock.length} opening balances in the Nobox store`);

  const images = await seedProductImages(client, userIds.get("admin@trtnobox.com") ?? null);
  console.log(`  ${images} material images rendered`);

  const projectIds = new Map<string, string>();
  for (const [code, name, client_name, address, status, supervisor, company] of PROJECTS) {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO projects (code, name, client_name, site_address, status, supervisor_id, company_id, start_date, target_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7, current_date - 30, current_date + 21) RETURNING id`,
      [code, name, client_name, address, status, supervisor ? userIds.get(supervisor) : null,
       companyIds.get(company)],
    );
    projectIds.set(code, rows[0].id);
  }
  console.log(`  ${PROJECTS.length} projects`);

  // A spread of recent issues so the dashboard and reports have something real
  // to show on first sign-in.
  const factory = locationIds.get("FAC")!;
  const warehouse = locationIds.get("WH1")!;
  const factoryManager = userIds.get("factory@trtnobox.com")!;

  const recentIssues: [string, number, string, number][] = [
    ["MEL-18-WHT", 14, "TRT-041", 11],
    ["EDG-22-WHT", 3, "TRT-041", 11],
    ["HNG-SC-35", 96, "TRT-041", 10],
    ["RUN-BM-450", 24, "TRT-041", 10],
    ["MEL-18-OAK", 9, "TRT-042", 8],
    ["EDG-22-OAK", 2, "TRT-042", 8],
    ["MDF-16-RAW", 11, "TRT-042", 6],
    ["ADH-CNT-4L", 5, "TRT-042", 6],
    ["HDL-BAR-160", 32, "TRT-041", 5],
    ["HWD-IRO-2X4", 48, "TRT-042", 4],
    ["MEL-18-WHT", 8, "TRT-042", 3],
    ["SCR-CHIP-40", 6, "TRT-041", 3],
    ["CHM-THN-4L", 3, "TRT-041", 2],
    ["HDF-3-BCK", 16, "TRT-042", 2],
    ["LEG-ADJ-100", 40, "TRT-041", 1],
  ];

  for (const [sku, quantity, projectCode, daysAgo] of recentIssues) {
    const productId = productIds.get(sku);
    if (!productId) continue;
    await client.query(
      `INSERT INTO stock_movements
         (product_id, movement_type, quantity, from_location_id, to_location_id,
          project_id, reference, created_by, created_at)
       VALUES ($1,'TRANSFER',$2,$3,$4,$5,$6,$7, now() - ($8 || ' days')::interval)`,
      [productId, quantity, warehouse, factory, projectIds.get(projectCode),
       `${projectCode} production issue`, factoryManager, daysAgo],
    );
    await client.query(
      `INSERT INTO stock_levels (product_id, location_id, on_hand) VALUES ($1,$2,$3)
       ON CONFLICT (product_id, location_id)
       DO UPDATE SET on_hand = stock_levels.on_hand + EXCLUDED.on_hand`,
      [productId, warehouse, -quantity],
    );
    await client.query(
      `INSERT INTO stock_levels (product_id, location_id, on_hand) VALUES ($1,$2,$3)
       ON CONFLICT (product_id, location_id)
       DO UPDATE SET on_hand = stock_levels.on_hand + EXCLUDED.on_hand`,
      [productId, factory, quantity],
    );
  }

  // A few recent receipts so inbound flow is visible too.
  const recentReceipts: [string, number, number][] = [
    ["MEL-18-WHT", 30, 9],
    ["HNG-SC-35", 500, 7],
    ["ADH-CNT-4L", 12, 5],
    ["MDF-16-RAW", 20, 4],
    ["PKG-CRT-LRG", 60, 2],
  ];
  for (const [sku, quantity, daysAgo] of recentReceipts) {
    const productId = productIds.get(sku);
    if (!productId) continue;
    await client.query(
      `INSERT INTO stock_movements
         (product_id, movement_type, quantity, to_location_id, reference, created_by, created_at)
       VALUES ($1,'RECEIPT',$2,$3,$4,$5, now() - ($6 || ' days')::interval)`,
      [productId, quantity, warehouse, "Supplier delivery", storekeeper, daysAgo],
    );
    await client.query(
      `INSERT INTO stock_levels (product_id, location_id, on_hand) VALUES ($1,$2,$3)
       ON CONFLICT (product_id, location_id)
       DO UPDATE SET on_hand = stock_levels.on_hand + EXCLUDED.on_hand`,
      [productId, warehouse, quantity],
    );
  }
  console.log(`  ${recentIssues.length + recentReceipts.length} recent stock movements`);

  // Production consumption: material leaving the factory floor into finished
  // work. These are what the consumption and waste reports are built on.
  const upholstery = locationIds.get("UPH")!;
  const consumed: [string, number, string, number, "ISSUE" | "WASTE"][] = [
    ["MEL-18-WHT", 11, "FAC", 9, "ISSUE"],
    ["MDF-16-RAW", 8, "FAC", 8, "ISSUE"],
    ["EDG-22-WHT", 2, "FAC", 8, "ISSUE"],
    ["HNG-SC-35", 74, "FAC", 7, "ISSUE"],
    ["MEL-18-OAK", 6, "FAC", 6, "ISSUE"],
    ["RUN-BM-450", 18, "FAC", 6, "ISSUE"],
    ["ADH-CNT-4L", 4, "FAC", 5, "ISSUE"],
    ["HWD-IRO-2X4", 32, "FAC", 5, "ISSUE"],
    ["FAB-LIN-GRY", 14, "UPH", 4, "ISSUE"],
    ["FOM-HD-100", 3, "UPH", 4, "ISSUE"],
    ["HDF-3-BCK", 12, "FAC", 3, "ISSUE"],
    ["SCR-CHIP-40", 5, "FAC", 3, "ISSUE"],
    ["LEG-ADJ-100", 28, "FAC", 2, "ISSUE"],
    ["MEL-18-WHT", 2, "FAC", 2, "WASTE"],
    ["EDG-22-OAK", 1, "FAC", 1, "WASTE"],
  ];

  for (const [sku, quantity, locCode, daysAgo, kind] of consumed) {
    const productId = productIds.get(sku);
    if (!productId) continue;
    const locationId = locCode === "UPH" ? upholstery : factory;
    await client.query(
      `INSERT INTO stock_movements
         (product_id, movement_type, quantity, from_location_id, project_id, reference, created_by, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, now() - ($8 || ' days')::interval)`,
      [productId, kind, quantity, locationId,
       projectIds.get(daysAgo % 2 === 0 ? "TRT-041" : "TRT-042"),
       kind === "WASTE" ? "Damaged during cutting" : "Production consumption",
       factoryManager, daysAgo],
    );
    await client.query(
      `INSERT INTO stock_levels (product_id, location_id, on_hand) VALUES ($1,$2,$3)
       ON CONFLICT (product_id, location_id)
       DO UPDATE SET on_hand = stock_levels.on_hand + EXCLUDED.on_hand`,
      [productId, locationId, -quantity],
    );
  }
  console.log(`  ${consumed.length} production consumption entries`);


  // One requisition at each interesting stage of the workflow.
  const supervisor = userIds.get("site@trtnobox.com")!;
  const stages: [string, string, string, string | null][] = [
    ["MIV-2026-0001", "Wardrobe carcass materials — Lekki Phase 1", "SUBMITTED", "TRT-041"],
    ["MIV-2026-0002", "Kitchen island build — Victoria Island", "APPROVED", "TRT-042"],
    ["MIV-2026-0003", "Site installation consumables", "ISSUED", "TRT-041"],
  ];

  for (const [ref, title, status, projectCode] of stages) {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO requisitions
         (ref, title, project_id, from_location_id, to_location_id, status, priority,
          needed_by, requested_by, approved_by, approved_at, issued_by, issued_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, current_date + 5, $8,
               CASE WHEN $6 IN ('APPROVED','ISSUED') THEN $9::uuid END,
               CASE WHEN $6 IN ('APPROVED','ISSUED') THEN now() - interval '2 days' END,
               CASE WHEN $6 = 'ISSUED' THEN $10::uuid END,
               CASE WHEN $6 = 'ISSUED' THEN now() - interval '1 day' END)
       RETURNING id`,
      [ref, title, projectCode ? projectIds.get(projectCode) : null, warehouse,
       locationIds.get("SITE-A"), status, status === "ISSUED" ? "HIGH" : "NORMAL",
       supervisor, factoryManager, storekeeper],
    );
    const requisitionId = rows[0].id;

    const lines: [string, number][] =
      status === "SUBMITTED"
        ? [["MEL-18-WHT", 12], ["EDG-22-WHT", 3], ["HNG-SC-35", 64]]
        : status === "APPROVED"
          ? [["MEL-18-OAK", 8], ["HWD-IRO-2X4", 24], ["ADH-PVA-5L", 2]]
          : [["SCR-CHIP-40", 4], ["CHM-THN-4L", 2], ["PKG-NYL-STR", 3]];

    for (const [sku, quantity] of lines) {
      const productId = productIds.get(sku);
      if (!productId) continue;
      await client.query(
        `INSERT INTO requisition_items
           (requisition_id, product_id, qty_requested, qty_approved, qty_issued)
         VALUES ($1,$2,$3,
                 CASE WHEN $4 IN ('APPROVED','ISSUED') THEN $3::numeric END,
                 CASE WHEN $4 = 'ISSUED' THEN $3::numeric ELSE 0 END)`,
        [requisitionId, productId, quantity, status],
      );

      // An issued requisition must have real ledger entries behind it, or the
      // site balance and the movement log disagree with the document.
      if (status !== "ISSUED") continue;
      await client.query(
        `INSERT INTO stock_movements
           (product_id, movement_type, quantity, from_location_id, to_location_id,
            requisition_id, project_id, reference, created_by, created_at)
         VALUES ($1,'TRANSFER',$2,$3,$4,$5,$6,$7,$8, now() - interval '1 day')`,
        [productId, quantity, warehouse, locationIds.get("SITE-A"), requisitionId,
         projectCode ? projectIds.get(projectCode) : null, ref, storekeeper],
      );
      await client.query(
        `INSERT INTO stock_levels (product_id, location_id, on_hand) VALUES ($1,$2,$3)
         ON CONFLICT (product_id, location_id)
         DO UPDATE SET on_hand = stock_levels.on_hand + EXCLUDED.on_hand`,
        [productId, warehouse, -quantity],
      );
      await client.query(
        `INSERT INTO stock_levels (product_id, location_id, on_hand) VALUES ($1,$2,$3)
         ON CONFLICT (product_id, location_id)
         DO UPDATE SET on_hand = stock_levels.on_hand + EXCLUDED.on_hand`,
        [productId, locationIds.get("SITE-A"), quantity],
      );
    }
  }
  console.log(`  ${stages.length} requisitions across the workflow`);
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await seed(client);
    await client.query("COMMIT");
    console.log("\nSeed complete.\n");
    console.log("  Sign in with any of:");
    for (const [email, name, role] of USERS) {
      console.log(`    ${email.padEnd(28)} ${name.padEnd(18)} ${role}`);
    }
    console.log("\n  Password for every account: trtnobox2026\n");
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
