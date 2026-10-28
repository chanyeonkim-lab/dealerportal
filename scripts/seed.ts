import { database } from "../lib/db";
const db = database();
const tables = [
  "accounts",
  "contacts",
  "app_users",
  "products",
  "opportunities",
  "leads",
  "assets",
  "asset_warranties",
  "learning_courses",
  "learning_assignments",
  "enrollments",
  "quiz_attempts",
  "knowledge_articles",
];
console.log(
  "Dealer prototype data is ready. Seeding is idempotent; existing records are preserved.",
);
console.table(
  Object.fromEntries(
    tables.map((t) => [
      t,
      Number(db.prepare(`SELECT count(*) AS n FROM ${t}`).get()?.n),
    ]),
  ),
);
console.log(
  "Demo accounts: dealer@demo.local and internal@demo.local. See README for first-run passwords.",
);
