import type { DatabaseSync } from "node:sqlite";
import { randomBytes, scryptSync } from "node:crypto";
import { quizQuestions } from "./domain";
import type { Lesson, Question } from "./model-types";

const schema = `
CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,dealer_code TEXT NOT NULL UNIQUE,name TEXT NOT NULL,market_code TEXT NOT NULL,tier TEXT NOT NULL CHECK(tier IN ('TIER_1','TIER_2','TIER_3')),lifecycle_status TEXT NOT NULL CHECK(lifecycle_status IN ('NEW','ESTABLISHED')),status TEXT NOT NULL DEFAULT 'ACTIVE');
CREATE TABLE IF NOT EXISTS contacts(id TEXT PRIMARY KEY,display_name TEXT NOT NULL,email TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'ACTIVE');
CREATE TABLE IF NOT EXISTS account_contact_relations(id TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES accounts(id),contact_id TEXT NOT NULL REFERENCES contacts(id),relationship_role TEXT NOT NULL CHECK(relationship_role IN ('EMPLOYEE','CUSTOMER')),job_role TEXT,is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),UNIQUE(account_id,contact_id,relationship_role));
CREATE UNIQUE INDEX IF NOT EXISTS one_employer ON account_contact_relations(contact_id) WHERE relationship_role='EMPLOYEE' AND is_active=1;
CREATE TABLE IF NOT EXISTS app_users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,display_name TEXT NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('INTERNAL_ADMIN','DEALER_SALES')),contact_id TEXT UNIQUE REFERENCES contacts(id),dealer_account_id TEXT REFERENCES accounts(id),status TEXT NOT NULL DEFAULT 'ACTIVE',CHECK((role='INTERNAL_ADMIN' AND dealer_account_id IS NULL) OR (role='DEALER_SALES' AND contact_id IS NOT NULL AND dealer_account_id IS NOT NULL)));
CREATE TABLE IF NOT EXISTS user_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES app_users(id),expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY,product_code TEXT NOT NULL UNIQUE,model_name TEXT NOT NULL,trim_name TEXT NOT NULL,model_year INTEGER NOT NULL,market_code TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PUBLISHED');
CREATE TABLE IF NOT EXISTS opportunities(id TEXT PRIMARY KEY,dealer_account_id TEXT NOT NULL REFERENCES accounts(id),sales_consultant_contact_id TEXT NOT NULL REFERENCES contacts(id),product_id TEXT NOT NULL REFERENCES products(id),stage TEXT NOT NULL,amount_minor INTEGER NOT NULL CHECK(amount_minor>=0),currency_code TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS opportunity_contact_roles(id TEXT PRIMARY KEY,opportunity_id TEXT NOT NULL REFERENCES opportunities(id),contact_id TEXT NOT NULL REFERENCES contacts(id),role TEXT NOT NULL,is_primary INTEGER NOT NULL CHECK(is_primary IN(0,1)),UNIQUE(opportunity_id,contact_id,role));
CREATE UNIQUE INDEX IF NOT EXISTS primary_buyer ON opportunity_contact_roles(opportunity_id) WHERE is_primary=1;
CREATE TABLE IF NOT EXISTS leads(id TEXT PRIMARY KEY,dealer_account_id TEXT NOT NULL REFERENCES accounts(id),assigned_sales_contact_id TEXT NOT NULL REFERENCES contacts(id),name TEXT NOT NULL,email TEXT,status TEXT NOT NULL,interested_product_id TEXT REFERENCES products(id),converted_contact_id TEXT REFERENCES contacts(id),converted_opportunity_id TEXT REFERENCES opportunities(id),converted_at TEXT);
CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY,vin TEXT NOT NULL UNIQUE,product_id TEXT NOT NULL REFERENCES products(id),dealer_account_id TEXT NOT NULL REFERENCES accounts(id),owner_contact_id TEXT REFERENCES contacts(id),delivered_from_opportunity_id TEXT UNIQUE REFERENCES opportunities(id),delivery_date TEXT,status TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS asset_warranties(id TEXT PRIMARY KEY,asset_id TEXT NOT NULL REFERENCES assets(id),coverage_type TEXT NOT NULL,start_date TEXT NOT NULL,end_date TEXT NOT NULL,terms_snapshot TEXT NOT NULL,source_reference TEXT NOT NULL,status TEXT NOT NULL,CHECK(end_date>=start_date));
CREATE TABLE IF NOT EXISTS learning_courses(id TEXT PRIMARY KEY,course_code TEXT NOT NULL,version INTEGER NOT NULL CHECK(version>0),title TEXT NOT NULL,body TEXT NOT NULL,lessons_json TEXT NOT NULL,quiz_json TEXT NOT NULL,pass_mark_percent INTEGER NOT NULL CHECK(pass_mark_percent BETWEEN 1 AND 100),market_code TEXT NOT NULL,product_id TEXT REFERENCES products(id),status TEXT NOT NULL CHECK(status IN ('DRAFT','PUBLISHED','RETIRED')),created_by TEXT NOT NULL REFERENCES app_users(id),created_at TEXT NOT NULL,UNIQUE(course_code,version));
CREATE TABLE IF NOT EXISTS learning_assignments(id TEXT PRIMARY KEY,course_id TEXT NOT NULL REFERENCES learning_courses(id),target_type TEXT NOT NULL CHECK(target_type IN ('DEALER_SEGMENT','ACCOUNT','CONTACT')),account_id TEXT REFERENCES accounts(id),contact_id TEXT REFERENCES contacts(id),criteria_json TEXT,required INTEGER NOT NULL CHECK(required IN(0,1)),due_in_days INTEGER NOT NULL CHECK(due_in_days BETWEEN 1 AND 365),status TEXT NOT NULL CHECK(status IN('ACTIVE','PAUSED')),created_by TEXT NOT NULL REFERENCES app_users(id),created_at TEXT NOT NULL,CHECK((target_type='DEALER_SEGMENT' AND criteria_json IS NOT NULL AND account_id IS NULL AND contact_id IS NULL) OR (target_type='ACCOUNT' AND account_id IS NOT NULL AND contact_id IS NULL AND criteria_json IS NULL) OR (target_type='CONTACT' AND contact_id IS NOT NULL AND account_id IS NULL AND criteria_json IS NULL)));
CREATE TABLE IF NOT EXISTS enrollments(id TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES accounts(id),learner_contact_id TEXT NOT NULL REFERENCES contacts(id),course_id TEXT NOT NULL REFERENCES learning_courses(id),status TEXT NOT NULL CHECK(status IN('ASSIGNED','IN_PROGRESS','COMPLETED','CANCELLED')),lesson_progress_json TEXT NOT NULL DEFAULT '[]',first_opened_at TEXT,completed_at TEXT,UNIQUE(learner_contact_id,course_id));
CREATE TABLE IF NOT EXISTS enrollment_sources(enrollment_id TEXT NOT NULL REFERENCES enrollments(id),assignment_id TEXT NOT NULL REFERENCES learning_assignments(id),assigned_at TEXT NOT NULL,due_at TEXT NOT NULL,PRIMARY KEY(enrollment_id,assignment_id));
CREATE TRIGGER IF NOT EXISTS source_course_match BEFORE INSERT ON enrollment_sources WHEN (SELECT course_id FROM enrollments WHERE id=NEW.enrollment_id)!=(SELECT course_id FROM learning_assignments WHERE id=NEW.assignment_id) BEGIN SELECT RAISE(ABORT,'Assignment and enrollment course mismatch'); END;
CREATE TABLE IF NOT EXISTS quiz_attempts(id TEXT PRIMARY KEY,enrollment_id TEXT NOT NULL REFERENCES enrollments(id),attempt_number INTEGER NOT NULL,answers_json TEXT NOT NULL,grading_json TEXT NOT NULL,score INTEGER NOT NULL,total INTEGER NOT NULL CHECK(total>0),passed INTEGER NOT NULL CHECK(passed IN(0,1)),submitted_at TEXT NOT NULL,request_id TEXT NOT NULL,source TEXT NOT NULL CHECK(source IN('LIVE_SUBMISSION','PREPARED')),UNIQUE(enrollment_id,attempt_number),UNIQUE(enrollment_id,request_id),CHECK(score>=0 AND score<=total));
CREATE TRIGGER IF NOT EXISTS immutable_course BEFORE UPDATE OF title,body,lessons_json,quiz_json,pass_mark_percent,market_code,product_id,course_code,version ON learning_courses WHEN OLD.status!='DRAFT' BEGIN SELECT RAISE(ABORT,'Published course versions are immutable'); END;
CREATE TRIGGER IF NOT EXISTS immutable_assignment BEFORE UPDATE OF course_id,target_type,account_id,contact_id,criteria_json,required,due_in_days ON learning_assignments BEGIN SELECT RAISE(ABORT,'Create a new assignment instead'); END;
CREATE TRIGGER IF NOT EXISTS immutable_attempt BEFORE UPDATE ON quiz_attempts BEGIN SELECT RAISE(ABORT,'Quiz attempts are immutable'); END;
CREATE TABLE IF NOT EXISTS knowledge_articles(id TEXT PRIMARY KEY,article_key TEXT NOT NULL,version INTEGER NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,source_url TEXT,product_id TEXT REFERENCES products(id),market_code TEXT NOT NULL,audience TEXT NOT NULL CHECK(audience IN('DEALER','INTERNAL','BOTH')),status TEXT NOT NULL CHECK(status IN('PUBLISHED','RETIRED')),effective_from TEXT,effective_to TEXT,UNIQUE(article_key,version));
CREATE TABLE IF NOT EXISTS chat_sessions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES app_users(id),account_id TEXT REFERENCES accounts(id),created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS chat_messages(id TEXT PRIMARY KEY,session_id TEXT NOT NULL REFERENCES chat_sessions(id),role TEXT NOT NULL CHECK(role IN('user','assistant')),text TEXT NOT NULL,sources_json TEXT NOT NULL DEFAULT '[]',mode TEXT NOT NULL,model TEXT,prompt_version TEXT,created_at TEXT NOT NULL);
`;

function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function initializeModel(db: DatabaseSync) {
  db.exec(schema);
  const cols = db.prepare("PRAGMA table_info(audit_events)").all();
  if (!cols.some((c) => c.name === "actor_user_id"))
    db.exec(
      "ALTER TABLE audit_events ADD COLUMN actor_user_id TEXT REFERENCES app_users(id)",
    );
  if (db.prepare("SELECT version FROM schema_migrations WHERE version=1").get())
    return;
  db.exec("BEGIN IMMEDIATE");
  try {
    const now = new Date().toISOString(),
      due = new Date(Date.now() + 14 * 86400000).toISOString();
    const insert = (table: string, cols: string, values: unknown[]) =>
      db
        .prepare(
          `INSERT INTO ${table} (${cols}) VALUES (${values.map(() => "?").join(",")})`,
        )
        .run(...(values as (string | number | null)[]));
    for (const r of [
      [
        "dealer-a",
        "AU-MEL",
        "Melbourne Central",
        "AU",
        "TIER_1",
        "ESTABLISHED",
      ],
      ["dealer-b", "AU-GEE", "Geelong Riverside", "AU", "TIER_2", "NEW"],
    ])
      insert(
        "accounts",
        "id,dealer_code,name,market_code,tier,lifecycle_status",
        r,
      );
    for (const r of [
      ["contact-olivia", "Olivia Bennett", "olivia@example.com"],
      ["contact-ben", "Ben Wilson", "ben@example.com"],
      ["contact-priya", "Priya Shah", "priya@example.com"],
      ["contact-alex", "Alex Morgan", "alex@example.com"],
      ["contact-sophie", "Sophie Chen", "sophie@example.com"],
      ["contact-oliver", "Oliver Williams", "oliver@example.com"],
      ["contact-noah", "Noah Clarke", "noah@example.com"],
    ])
      insert("contacts", "id,display_name,email", r);
    for (const [person, account, role] of [
      ["olivia", "a", "EMPLOYEE"],
      ["ben", "a", "EMPLOYEE"],
      ["priya", "b", "EMPLOYEE"],
      ["alex", "a", "CUSTOMER"],
      ["sophie", "a", "CUSTOMER"],
      ["oliver", "a", "CUSTOMER"],
      ["noah", "b", "CUSTOMER"],
    ])
      insert(
        "account_contact_relations",
        "id,account_id,contact_id,relationship_role,job_role",
        [
          `rel-${person}`,
          `dealer-${account}`,
          `contact-${person}`,
          role,
          role === "EMPLOYEE" ? "SALES_CONSULTANT" : null,
        ],
      );
    insert(
      "app_users",
      "id,email,display_name,password_hash,role,contact_id,dealer_account_id",
      [
        "user-internal",
        "internal@demo.local",
        "Hyundai Learning Team",
        passwordHash(process.env.INTERNAL_DEMO_PASSWORD || "InternalDemo!2026"),
        "INTERNAL_ADMIN",
        null,
        null,
      ],
    );
    insert(
      "app_users",
      "id,email,display_name,password_hash,role,contact_id,dealer_account_id",
      [
        "user-dealer",
        "dealer@demo.local",
        "Olivia Bennett",
        passwordHash(process.env.DEALER_DEMO_PASSWORD || "DealerDemo!2026"),
        "DEALER_SALES",
        "contact-olivia",
        "dealer-a",
      ],
    );
    for (const [id, name] of [
      ["ioniq5", "IONIQ 5"],
      ["tucson", "TUCSON Hybrid"],
      ["kona", "KONA Electric"],
    ])
      insert(
        "products",
        "id,product_code,model_name,trim_name,model_year,market_code",
        [
          `product-${id}`,
          `AU-DEMO-${id}`,
          name,
          "Demo specification",
          2026,
          "AU",
        ],
      );
    const opps = [
      ["opp-001", "a", "olivia", "ioniq5", "Proposal", 7200000, "alex"],
      ["opp-002", "a", "olivia", "tucson", "Test drive", 5400000, "sophie"],
      ["opp-003", "a", "ben", "kona", "Discovery", 5800000, "oliver"],
      ["opp-004", "b", "priya", "ioniq5", "Proposal", 7100000, "noah"],
      ["opp-005", "a", "olivia", "kona", "Delivered", 4900000, "alex"],
    ] as const;
    for (const [id, a, s, p, stage, amount, buyer] of opps) {
      insert(
        "opportunities",
        "id,dealer_account_id,sales_consultant_contact_id,product_id,stage,amount_minor,currency_code",
        [
          id,
          `dealer-${a}`,
          `contact-${s}`,
          `product-${p}`,
          stage,
          amount,
          "AUD",
        ],
      );
      insert(
        "opportunity_contact_roles",
        "id,opportunity_id,contact_id,role,is_primary",
        [`buyer-${id}`, id, `contact-${buyer}`, "PRIMARY_BUYER", 1],
      );
    }
    insert(
      "leads",
      "id,dealer_account_id,assigned_sales_contact_id,name,email,status,interested_product_id",
      [
        "lead-001",
        "dealer-a",
        "contact-olivia",
        "Casey Taylor",
        "casey@example.com",
        "NEW",
        "product-ioniq5",
      ],
    );
    insert(
      "leads",
      "id,dealer_account_id,assigned_sales_contact_id,name,email,status,interested_product_id,converted_contact_id,converted_opportunity_id,converted_at",
      [
        "lead-002",
        "dealer-a",
        "contact-olivia",
        "Alex Morgan",
        "alex@example.com",
        "CONVERTED",
        "product-ioniq5",
        "contact-alex",
        "opp-001",
        now,
      ],
    );
    for (const [id, a, owner, p, opp, vin] of [
      ["asset-001", "a", "alex", "kona", "opp-005", "DEMO0000000000001"],
      ["asset-002", "b", "noah", "ioniq5", null, "DEMO0000000000002"],
    ]) {
      insert(
        "assets",
        "id,vin,product_id,dealer_account_id,owner_contact_id,delivered_from_opportunity_id,delivery_date,status",
        [
          id,
          vin,
          `product-${p}`,
          `dealer-${a}`,
          `contact-${owner}`,
          opp,
          "2026-09-01",
          "DELIVERED",
        ],
      );
      for (const type of ["Vehicle", "Battery"])
        insert(
          "asset_warranties",
          "id,asset_id,coverage_type,start_date,end_date,terms_snapshot,source_reference,status",
          [
            `${id}-${type}`,
            id,
            type,
            "2026-09-01",
            "2027-09-01",
            "Fictional demonstration coverage. Actual terms, exclusions and eligibility need verification.",
            "Prepared demo data",
            "DEMO_RECORD",
          ],
        );
    }
    const q: Question[] = quizQuestions.map((x, i) => ({
      ...x,
      correct: [1, 0, 2][i],
    }));
    const extra: Question[] = [
      {
        question: "When should you promise a specific charging time?",
        options: [
          "Whenever the customer has a driveway.",
          "After checking the exact vehicle, charger and conditions.",
          "Use a different market’s headline figure.",
        ],
        correct: 1,
      },
      {
        question: "What should you do when approved information is missing?",
        options: [
          "Make a confident estimate.",
          "Guarantee the best case.",
          "Explain what needs to be verified.",
        ],
        correct: 2,
      },
    ];
    const lessons: Lesson[] = [
      {
        id: "discover",
        title: "Start with the customer",
        body: "Ask about everyday journeys, longer trips, passengers, luggage and charging access. Confirm the two main priorities before introducing features.",
      },
      {
        id: "range",
        title: "Explain range with conditions",
        body: "Published test-cycle range is a comparison figure, not a guarantee. Weather, motorway speed, heating, driving style and load affect actual range. Check the customer’s route. No Australian trim-specific range is verified in this demo.",
      },
      {
        id: "charging",
        title: "Rapid charging and home charging",
        body: "Separate public DC rapid charging from home AC charging. Confirm the Australian vehicle, battery, charger power, temperature and installation before quoting a time. A driveway does not establish installation suitability.",
      },
      {
        id: "walkaround",
        title: "Turn features into useful benefits",
        body: "Link relevant features to needs, invite the customer to check the actual vehicle and propose a test drive with a clear purpose and an agreed time.",
      },
    ];
    for (const [id, code, title, ls, questions] of [
      [
        "course-ev-v1",
        "EV01",
        "EV sales essentials",
        lessons,
        [...q, ...extra],
      ],
      [
        "course-charging-v1",
        "EV02",
        "Charging confidence",
        lessons.filter((x) => ["range", "charging"].includes(x.id)),
        [...q, ...extra],
      ],
      [
        "course-onboarding-v1",
        "NEW01",
        "New dealer foundations",
        [lessons[0], lessons[3]],
        q,
      ],
    ] as const)
      insert(
        "learning_courses",
        "id,course_code,version,title,body,lessons_json,quiz_json,pass_mark_percent,market_code,status,created_by,created_at",
        [
          id,
          code,
          1,
          title,
          ls.map((x) => x.body).join("\n\n"),
          JSON.stringify(ls),
          JSON.stringify(questions),
          80,
          "AU",
          "PUBLISHED",
          "user-internal",
          now,
        ],
      );
    const assignments = [
      [
        "assignment-tier1",
        "course-ev-v1",
        "DEALER_SEGMENT",
        null,
        null,
        JSON.stringify({ tier: "TIER_1" }),
      ],
      [
        "assignment-new",
        "course-onboarding-v1",
        "DEALER_SEGMENT",
        null,
        null,
        JSON.stringify({ lifecycle: "NEW" }),
      ],
      [
        "assignment-olivia",
        "course-charging-v1",
        "CONTACT",
        null,
        "contact-olivia",
        null,
      ],
    ] as const;
    for (const [id, course, target, account, contact, criteria] of assignments)
      insert(
        "learning_assignments",
        "id,course_id,target_type,account_id,contact_id,criteria_json,required,due_in_days,status,created_by,created_at",
        [
          id,
          course,
          target,
          account,
          contact,
          criteria,
          1,
          14,
          "ACTIVE",
          "user-internal",
          now,
        ],
      );
    for (const [person, a, course, rule] of [
      ["olivia", "a", "ev", "tier1"],
      ["ben", "a", "ev", "tier1"],
      ["priya", "b", "onboarding", "new"],
      ["olivia", "a", "charging", "olivia"],
    ]) {
      const id = `enrollment-${person}-${course}`;
      insert(
        "enrollments",
        "id,account_id,learner_contact_id,course_id,status",
        [
          id,
          `dealer-${a}`,
          `contact-${person}`,
          `course-${course}-v1`,
          "ASSIGNED",
        ],
      );
      insert(
        "enrollment_sources",
        "enrollment_id,assignment_id,assigned_at,due_at",
        [id, `assignment-${rule}`, now, due],
      );
    }
    const grade = (answers: number[], qs: Question[]) =>
      qs.map((x, i) => ({
        correct: answers[i] === x.correct,
        answer: x.correct,
      }));
    insert(
      "quiz_attempts",
      "id,enrollment_id,attempt_number,answers_json,grading_json,score,total,passed,submitted_at,request_id,source",
      [
        "attempt-ben-prepared",
        "enrollment-ben-ev",
        1,
        "[1,0,2,1,1]",
        JSON.stringify(grade([1, 0, 2, 1, 1], [...q, ...extra])),
        4,
        5,
        1,
        now,
        "prepared-ben",
        "PREPARED",
      ],
    );
    db.prepare(
      "UPDATE enrollments SET status='COMPLETED',lesson_progress_json=?,first_opened_at=?,completed_at=? WHERE id='enrollment-ben-ev'",
    ).run(JSON.stringify(lessons.map((x) => x.id)), now, now);
    insert(
      "quiz_attempts",
      "id,enrollment_id,attempt_number,answers_json,grading_json,score,total,passed,submitted_at,request_id,source",
      [
        "attempt-priya-prepared",
        "enrollment-priya-onboarding",
        1,
        "[0,0,0]",
        JSON.stringify(grade([0, 0, 0], q)),
        1,
        3,
        0,
        now,
        "prepared-priya",
        "PREPARED",
      ],
    );
    db.prepare(
      "UPDATE enrollments SET status='IN_PROGRESS',lesson_progress_json='[\"discover\"]',first_opened_at=? WHERE id='enrollment-priya-onboarding'",
    ).run(now);
    const articles = [
      ["AU-TRAIN-01", "Range conversations", lessons[1].body, "BOTH"],
      ["AU-TRAIN-02", "Charging confidence", lessons[2].body, "BOTH"],
      [
        "AU-TRAIN-03",
        "Needs-led walk-around",
        lessons[0].body + " " + lessons[3].body,
        "BOTH",
      ],
      [
        "INT-POLICY-01",
        "Internal learning allocation policy",
        "Internal only: review Tier 1 and new-dealer assignment coverage with the learning team. This operational policy is not dealer guidance.",
        "INTERNAL",
      ],
    ];
    for (const [key, title, body, audience] of articles)
      insert(
        "knowledge_articles",
        "id,article_key,version,title,body,market_code,audience,status",
        [`${key}-v1`, key, 1, title, body, "AU", audience, "PUBLISHED"],
      );
    insert("schema_migrations", "version,applied_at", [1, now]);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
