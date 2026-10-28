import { database, atomic, audit } from "./db";
import { requireAdmin } from "./auth";
import { AppError } from "./errors";
import { applyAssignments, accountSummaries } from "./training";
import type { Actor, OpportunityView } from "./model-types";
import { z } from "zod";
export function listOpportunities(actor: Actor): OpportunityView[] {
  const where =
    actor.role === "INTERNAL_ADMIN"
      ? ""
      : "WHERE o.dealer_account_id=? AND o.sales_consultant_contact_id=?";
  return database()
    .prepare(
      `SELECT o.*,p.model_name,c.display_name,c.email,a.name AS account_name,s.display_name AS consultant FROM opportunities o JOIN products p ON p.id=o.product_id JOIN accounts a ON a.id=o.dealer_account_id JOIN contacts s ON s.id=o.sales_consultant_contact_id JOIN opportunity_contact_roles r ON r.opportunity_id=o.id AND r.is_primary=1 JOIN contacts c ON c.id=r.contact_id ${where} ORDER BY o.id`,
    )
    .all(
      ...(actor.role === "INTERNAL_ADMIN"
        ? []
        : [actor.accountId!, actor.contactId!]),
    )
    .map((r) => ({
      id: String(r.id),
      name: String(r.display_name),
      initials: String(r.display_name)
        .split(" ")
        .map((x) => x[0])
        .join(""),
      email: String(r.email),
      vehicle: String(r.model_name),
      stage: String(r.stage),
      value: Number(r.amount_minor) / 100,
      action: r.stage === "Delivered" ? "View customer" : "Review contract",
      colour: r.stage === "Discovery" ? "orange" : "blue",
      accountId: String(r.dealer_account_id),
      accountName: String(r.account_name),
      salesContactId: String(r.sales_consultant_contact_id),
      consultant: String(r.consultant),
    }));
}
export function crmData(actor: Actor) {
  const db = database(),
    admin = actor.role === "INTERNAL_ADMIN";
  const contacts = admin
    ? db
        .prepare(
          `SELECT c.id,c.display_name AS name,c.email,r.account_id,a.name AS account_name,r.relationship_role AS relationship,r.job_role AS job FROM contacts c JOIN account_contact_relations r ON r.contact_id=c.id JOIN accounts a ON a.id=r.account_id WHERE r.is_active=1`,
        )
        .all()
    : db
        .prepare(
          `SELECT c.id,c.display_name AS name,c.email,r.account_id,a.name AS account_name,r.relationship_role AS relationship,r.job_role AS job FROM contacts c JOIN account_contact_relations r ON r.contact_id=c.id JOIN accounts a ON a.id=r.account_id WHERE r.is_active=1 AND r.account_id=? AND ((r.relationship_role='EMPLOYEE' AND c.id=?) OR (r.relationship_role='CUSTOMER' AND EXISTS(SELECT 1 FROM opportunity_contact_roles cr JOIN opportunities o ON o.id=cr.opportunity_id WHERE cr.contact_id=c.id AND o.dealer_account_id=? AND o.sales_consultant_contact_id=?)))`,
        )
        .all(
          actor.accountId!,
          actor.contactId!,
          actor.accountId!,
          actor.contactId!,
        );
  const assets = db
    .prepare(
      `SELECT v.id,v.vin,v.dealer_account_id AS account_id,v.status,v.delivery_date,p.model_name AS product,c.display_name AS owner,v.owner_contact_id FROM assets v JOIN products p ON p.id=v.product_id LEFT JOIN contacts c ON c.id=v.owner_contact_id ${admin ? "" : `WHERE v.dealer_account_id=? AND EXISTS(SELECT 1 FROM opportunity_contact_roles r JOIN opportunities o ON o.id=r.opportunity_id WHERE r.contact_id=v.owner_contact_id AND o.dealer_account_id=v.dealer_account_id AND o.sales_consultant_contact_id=?)`}`,
    )
    .all(...(admin ? [] : [actor.accountId!, actor.contactId!]));
  const ids = assets.map((v) => String(v.id));
  const warranties = ids.length
    ? db
        .prepare(
          `SELECT id,asset_id,coverage_type,start_date,end_date,terms_snapshot,status FROM asset_warranties WHERE asset_id IN (${ids.map(() => "?").join(",")})`,
        )
        .all(...ids)
    : [];
  const leads = db
    .prepare(
      `SELECT id,name,status,converted_contact_id,converted_opportunity_id,dealer_account_id FROM leads ${admin ? "" : "WHERE dealer_account_id=? AND assigned_sales_contact_id=?"}`,
    )
    .all(...(admin ? [] : [actor.accountId!, actor.contactId!]));
  return {
    accounts: admin
      ? accountSummaries(actor)
      : db
          .prepare(
            "SELECT id,name,tier,lifecycle_status AS lifecycle,market_code AS market FROM accounts WHERE id=?",
          )
          .all(actor.accountId!),
    contacts,
    opportunities: listOpportunities(actor),
    leads,
    products: db
      .prepare(
        "SELECT id,model_name AS name,trim_name AS trim,model_year AS year,market_code AS market FROM products WHERE market_code=? AND status='PUBLISHED'",
      )
      .all(actor.market),
    assets,
    warranties,
  };
}
export function updateAccount(input: unknown, actor: Actor) {
  requireAdmin(actor);
  const value = z
    .object({
      accountId: z.string(),
      tier: z.enum(["TIER_1", "TIER_2", "TIER_3"]),
      lifecycle: z.enum(["NEW", "ESTABLISHED"]),
    })
    .strict()
    .parse(input);
  return atomic(() => {
    if (
      !database()
        .prepare("UPDATE accounts SET tier=?,lifecycle_status=? WHERE id=?")
        .run(value.tier, value.lifecycle, value.accountId).changes
    )
      throw new AppError("Dealer not found.", 404);
    audit(actor, "account.segment_updated", value.accountId);
    return applyAssignments(actor);
  });
}
