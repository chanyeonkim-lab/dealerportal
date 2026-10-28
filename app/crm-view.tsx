"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/client-api";
import type { AccountSummary } from "@/lib/model-types";
type Contact = {
  id: string;
  name: string;
  email: string;
  account_name: string;
  relationship: string;
  job: string | null;
};
type Asset = {
  id: string;
  vin: string;
  product: string;
  owner: string;
  status: string;
  account_id: string;
};
type Warranty = {
  id: string;
  asset_id: string;
  coverage_type: string;
  start_date: string;
  end_date: string;
  terms_snapshot: string;
};
type Lead = {
  id: string;
  name: string;
  status: string;
  converted_contact_id: string | null;
  converted_opportunity_id: string | null;
};
export type CRMData = {
  accounts: AccountSummary[];
  contacts: Contact[];
  assets: Asset[];
  warranties: Warranty[];
  leads: Lead[];
};
export function CRMView({ internal = false }: { internal?: boolean }) {
  const [data, setData] = useState<CRMData | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    const r = await apiFetch("/api/crm"),
      d = await r.json();
    if (!r.ok) throw Error(d.error);
    setData(d);
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, []);
  async function save(id: string, tier: string, lifecycle: string) {
    setBusy(true);
    try {
      const r = await apiFetch("/api/crm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId: id, tier, lifecycle }),
        }),
        d = await r.json();
      if (!r.ok) throw Error(d.error);
      setNotice(
        `Dealer updated. ${d.added} new enrollments; ${d.sourcesAdded} assignment reasons added.`,
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="admin-stack">
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
      {internal && data && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Dealer network</h2>
              <p>
                Dealer attributes determine learning assignments. Completion is
                calculated from individual records.
              </p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Dealer</th>
                  <th>Tier</th>
                  <th>Lifecycle</th>
                  <th>Sales staff</th>
                  <th>Required learning</th>
                  <th>Complete</th>
                  <th>Unassigned staff</th>
                </tr>
              </thead>
              <tbody>
                {data.accounts.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <strong>{a.name}</strong>
                      <small>{a.market} · Account</small>
                    </td>
                    <td>
                      <select
                        aria-label={"Tier for " + a.name}
                        disabled={busy}
                        value={a.tier}
                        onChange={(e) =>
                          void save(a.id, e.target.value, a.lifecycle)
                        }
                      >
                        {["TIER_1", "TIER_2", "TIER_3"].map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        aria-label={"Lifecycle for " + a.name}
                        disabled={busy}
                        value={a.lifecycle}
                        onChange={(e) =>
                          void save(a.id, a.tier, e.target.value)
                        }
                      >
                        <option>NEW</option>
                        <option>ESTABLISHED</option>
                      </select>
                    </td>
                    <td>{a.staff}</td>
                    <td>
                      {a.completed}/{a.required}
                    </td>
                    <td>
                      {a.completionRate === null
                        ? "N/A"
                        : Math.round(a.completionRate) + "%"}
                    </td>
                    <td>{a.unassigned}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>
              {internal
                ? "People and dealer relationships"
                : "Your customers and profile"}
            </h2>
            <p>
              Employees and buyers share Contact records. Their relationship to
              the dealer distinguishes their role.
            </p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Person</th>
                <th>Dealer</th>
                <th>Relationship</th>
                <th>Job</th>
              </tr>
            </thead>
            <tbody>
              {data?.contacts.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.name}</strong>
                    <small>{c.email}</small>
                  </td>
                  <td>{c.account_name}</td>
                  <td>
                    {c.relationship === "EMPLOYEE" ? "Employee" : "Customer"}
                  </td>
                  <td>
                    {c.job === "SALES_CONSULTANT" ? "Sales consultant" : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Vehicles and warranty records</h2>
            <p>
              Each vehicle references a product model and its buyer. Warranty
              examples are fictional, not eligibility decisions.
            </p>
          </div>
        </div>
        {data?.assets.map((a) => (
          <article className="model-asset" key={a.id}>
            <div>
              <h3>{a.product}</h3>
              <p>
                Owner: {a.owner} · {a.status}
              </p>
              <small>Fictional VIN: {a.vin}</small>
            </div>
            <div className="model-warranties">
              {data.warranties
                .filter((w) => w.asset_id === a.id)
                .map((w) => (
                  <div key={w.id}>
                    <strong>{w.coverage_type} coverage</strong>
                    <p>
                      {w.start_date} — {w.end_date}
                    </p>
                    <small>{w.terms_snapshot}</small>
                  </div>
                ))}
            </div>
          </article>
        ))}
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Lead conversion</h2>
            <p>
              Unconverted enquiries and converted Contact / Opportunity
              references remain distinct.
            </p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Enquiry</th>
                <th>Status</th>
                <th>Converted contact</th>
                <th>Opportunity</th>
              </tr>
            </thead>
            <tbody>
              {data?.leads.map((l) => (
                <tr key={l.id}>
                  <td>{l.name}</td>
                  <td>{l.status}</td>
                  <td>
                    {l.converted_contact_id
                      ? data.contacts.find(
                          (c) => c.id === l.converted_contact_id,
                        )?.name || "Linked contact"
                      : "Not converted"}
                  </td>
                  <td>{l.converted_opportunity_id || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
