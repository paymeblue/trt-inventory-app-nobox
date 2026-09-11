import "./env";
import { Pool, type PoolClient } from "pg";
import { FLOWS } from "./flow-data";

/**
 * Loads the process flows from the workbook extract. Safe to re-run: flows are
 * matched on code and their stages replaced, so re-extracting the workbook
 * updates the app without touching any runs in progress.
 */
export async function seedProcessFlows(client: PoolClient) {
  let stageCount = 0;

  for (const [index, flow] of FLOWS.entries()) {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO process_flows (code, name, category, summary, source_sheet, app_route, sort_order)
            VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (code) DO UPDATE
          SET name = EXCLUDED.name,
              category = EXCLUDED.category,
              summary = EXCLUDED.summary,
              source_sheet = EXCLUDED.source_sheet,
              app_route = EXCLUDED.app_route,
              sort_order = EXCLUDED.sort_order,
              is_active = true
       RETURNING id`,
      [flow.code, flow.name, flow.category, flow.summary, flow.sourceSheet, flow.appRoute, index],
    );
    const flowId = rows[0].id;

    for (const stage of flow.stages) {
      await client.query(
        `INSERT INTO process_stages
           (flow_id, seq, name, action_by, steps, documents, decision_maker, criteria, stakeholders, duration)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (flow_id, seq) DO UPDATE
            SET name = EXCLUDED.name,
                action_by = EXCLUDED.action_by,
                steps = EXCLUDED.steps,
                documents = EXCLUDED.documents,
                decision_maker = EXCLUDED.decision_maker,
                criteria = EXCLUDED.criteria,
                stakeholders = EXCLUDED.stakeholders,
                duration = EXCLUDED.duration`,
        [flowId, stage.seq, stage.name, stage.actionBy, stage.steps, stage.documents,
         stage.decisionMaker, stage.criteria, stage.stakeholders, stage.duration],
      );
      stageCount += 1;
    }

    // Drop stages that no longer exist in the workbook.
    await client.query("DELETE FROM process_stages WHERE flow_id = $1 AND seq > $2",
      [flowId, flow.stages.length]);
  }

  return { flows: FLOWS.length, stages: stageCount };
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await seedProcessFlows(client);
    await client.query("COMMIT");
    console.log(`${r.flows} process flows, ${r.stages} stages loaded`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1]?.endsWith("seed-flows.ts")) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
