"use client";
import { apiFetch } from "@/lib/client-api";
import { useEffect, useState, useRef } from "react";
import { AdminWorkspace } from "./admin";
import { DealerLearning } from "./learning";
import { SessionGate } from "./session-gate";
import { CRMView } from "./crm-view";
import type { Actor, OpportunityView } from "@/lib/model-types";
import {
  ArrowUpRight,
  ArrowRight,
  LayoutDashboard,
  Users,
  FileCheck2,
  GraduationCap,
  Sparkles,
  Search,
  Bell,
  ChevronDown,
  Plus,
  Upload,
  X,
  Check,
  ShieldCheck,
  Send,
  BookOpen,
  CircleHelp,
  Car,
  LoaderCircle,
  CheckCircle2,
  Menu,
  ChevronRight,
  MapPin,
  Clock3,
  CircleDot,
} from "lucide-react";
import { sampleExtraction, type Extraction } from "@/lib/domain";
type Section =
  | "Overview"
  | "Sales pipeline"
  | "Contracts"
  | "Learning hub"
  | "Customers & vehicles";
type Contract = {
  id: string;
  opportunityId: string;
  fields: Extraction["fields"];
  source: string;
  reviewedAt: string;
};
type Message = {
  role: "user" | "assistant";
  text: string;
  sources?: { id: string; title: string }[];
  mode?: string;
};
const money = (value: number) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(value);
export default function Home() {
  return (
    <SessionGate>
      {(actor, signOut) => <Workspace actor={actor} signOut={signOut} />}
    </SessionGate>
  );
}
function Workspace({ actor, signOut }: { actor: Actor; signOut: () => void }) {
  const [menu, setMenu] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const navigationRef = useRef<HTMLElement>(null);
  const role = actor.role === "INTERNAL_ADMIN" ? "internal" : "dealer";
  const initials = actor.name
    .split(" ")
    .map((x) => x[0])
    .slice(0, 2)
    .join("");
  const [seed, setSeed] = useState<OpportunityView[]>([]),
    [sessionId, setSessionId] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("Overview"),
    [chat, setChat] = useState(false),
    [contracts, setContracts] = useState<Contract[]>([]),
    [live, setLive] = useState(false),
    [modal, setModal] = useState(false),
    [result, setResult] = useState<Extraction | null>(null),
    [source, setSource] = useState<"sample" | "live">("sample"),
    [opp, setOpp] = useState("opp-001"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [reviewed, setReviewed] = useState(false),
    [notice, setNotice] = useState(""),
    [filter, setFilter] = useState("");
  const [messages, setMessages] = useState<Message[]>([]),
    [question, setQuestion] = useState(""),
    [asking, setAsking] = useState(false);
  async function refresh() {
    try {
      const r = await apiFetch("/api/dashboard");
      if (!r.ok) throw Error();
      const d = await r.json();
      setContracts(d.contracts);
      setSeed(d.opportunities);
      setLive(d.liveAI);
    } catch {
      setNotice("Could not load saved records. Refresh to retry.");
    }
  }
  useEffect(() => {
    void refresh();
    void apiFetch("/api/assistant")
      .then((r) => r.json())
      .then((d) => {
        if (d.messages) {
          setMessages(d.messages);
          setSessionId(d.sessionId);
        }
      })
      .catch(() => {});
  }, []);
  function openReview(id = "opp-001") {
    setOpp(id);
    setResult(null);
    setError("");
    setReviewed(false);
    setModal(true);
  }
  async function extract(file?: File) {
    setBusy(true);
    setError("");
    setReviewed(false);
    try {
      let body: BodyInit, headers: HeadersInit | undefined;
      if (file) {
        const form = new FormData();
        form.append("file", file);
        form.append("opportunityId", opp);
        body = form;
      } else {
        body = JSON.stringify({ action: "sample", opportunityId: opp });
        headers = { "Content-Type": "application/json" };
      }
      const r = await apiFetch("/api/contracts", {
        method: "POST",
        body,
        headers,
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setResult(d.result);
      setSource(d.source);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!result) return;
    setBusy(true);
    setError("");
    try {
      const r = await apiFetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opportunityId: opp,
          fields: result.fields,
          source,
          reviewed,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      await refresh();
      setModal(false);
      setNotice(
        "Contract saved and linked to the opportunity. Review event recorded.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function ask(text = question) {
    if (!text.trim() || asking) return;
    setQuestion("");
    setMessages((m) => [...m, { role: "user", text }]);
    setAsking(true);
    try {
      const r = await apiFetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: text,
          ...(sessionId ? { sessionId } : {}),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setSessionId(d.sessionId);
      setMessages((m) => [
        ...m,
        { role: "assistant", text: d.answer, sources: d.sources, mode: d.mode },
      ]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: (e as Error).message },
      ]);
    } finally {
      setAsking(false);
    }
  }

  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const elements = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select, summary, [tabindex="0"]',
        ) || [],
      ).filter((el) => el.getClientRects().length > 0);
    elements()[0]?.focus();
    function keydown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setModal(false);
        return;
      }
      if (e.key !== "Tab") return;
      const items = elements(),
        first = items[0],
        last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", keydown);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", keydown);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [modal]);
  useEffect(() => {
    if (!menu) return;
    const previous = document.activeElement as HTMLElement | null;
    const items = () =>
      Array.from(
        navigationRef.current?.querySelectorAll<HTMLElement>("a,button") || [],
      ).filter((el) => el.getClientRects().length > 0);
    items()[0]?.focus();
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(false);
      if (e.key === "Tab") {
        const els = items();
        if (e.shiftKey && document.activeElement === els[0]) {
          e.preventDefault();
          els.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === els.at(-1)) {
          e.preventDefault();
          els[0]?.focus();
        }
      }
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [menu]);
  function navigate(next: Section) {
    setSection(next);
    setFilter("");
    setMenu(false);
    void refresh();
  }
  const nav = [
    { name: "Overview" as const, icon: LayoutDashboard },
    { name: "Sales pipeline" as const, icon: Users },
    { name: "Customers & vehicles" as const, icon: Car },
    { name: "Contracts" as const, icon: FileCheck2 },
    { name: "Learning hub" as const, icon: GraduationCap },
  ];
  return (
    <div className="shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      {menu && (
        <button
          className="menu-scrim"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <aside
        ref={navigationRef}
        className={"sidebar " + (menu ? "is-open" : "")}
        id="workspace-navigation"
      >
        <a className="brand" href="/" aria-label="Hyundai dealer workspace">
          <span className="brand-mark">H</span>
          <span>
            HYUNDAI<small>Dealer workspace</small>
          </span>
        </a>
        <div className="dealer">
          <span className="dealer-avatar">
            <MapPin size={19} />
          </span>
          <div>
            {actor.accountName || "Hyundai Australia"}
            <small>
              Australia <span className="dot" /> Demo dealership
            </small>
          </div>
        </div>
        <div className="model-session">
          <span>
            {role === "dealer" ? "Dealer consultant" : "Hyundai internal"}
          </span>
          <button className="text-button" onClick={signOut}>
            Switch account
          </button>
        </div>
        <div className="nav-label">Your workspace</div>
        <nav aria-label="Workspace navigation">
          {role === "dealer" ? (
            nav.map(({ name, icon: Icon }) => (
              <button
                key={name}
                aria-label={name}
                aria-current={section === name ? "page" : undefined}
                className={section === name ? "nav active" : "nav"}
                onClick={() => navigate(name)}
              >
                <Icon size={19} />
                <span>{name}</span>
                {name === "Contracts" && (
                  <span className="count">{contracts.length}</span>
                )}
              </button>
            ))
          ) : (
            <div className="model-internal-navigation">
              <GraduationCap size={21} />
              <strong>Dealer development</strong>
              <p>Network, learning and knowledge management</p>
            </div>
          )}
          <button
            aria-label="Sales assistant"
            className={"nav " + (chat ? "chat-active" : "")}
            onClick={() => {
              setChat(true);
              setMenu(false);
            }}
          >
            <Sparkles size={19} />
            <span>Sales assistant</span>
            <span className="new">AI</span>
          </button>
        </nav>
        <div className="sidebar-feature">
          <div className="pixel-mark" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </div>
          <p>
            Every conversation.
            <br />A little more confidence.
          </p>
          <span>Australian dealer prototype</span>
        </div>
        <div className="sidebar-bottom">
          <div className="safe">
            <ShieldCheck size={16} />
            <span>AI assists. You stay in control.</span>
          </div>
          <div className="profile">
            <span className="avatar">{initials}</span>
            <div>
              {actor.name}
              <small>
                {role === "dealer"
                  ? "Sales consultant"
                  : "Internal learning team"}
              </small>
            </div>
            <span className="online" />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header>
          <div className="header-left">
            <button
              className="icon-button menu-toggle"
              aria-label={menu ? "Close menu" : "Open menu"}
              aria-expanded={menu}
              aria-controls="workspace-navigation"
              onClick={() => setMenu(!menu)}
            >
              <Menu size={22} />
            </button>
            <div className="breadcrumb">
              Workspace <ChevronRight size={13} />{" "}
              <strong>
                {role === "internal" ? "Internal management" : section}
              </strong>
            </div>
          </div>
          <div className="header-right">
            <span className="market">
              <span className="market-dot" /> Australia <span>/</span> AUD
            </span>
            <span className="demo-badge">Demo</span>
            <button
              className="icon-button"
              aria-label="Show workspace status"
              onClick={() =>
                setNotice(
                  "Demo workspace. Customer records and prices are fictional. No external DMS is connected.",
                )
              }
            >
              <Bell size={19} />
            </button>
            <span className="avatar small">{initials}</span>
          </div>
        </header>
        <main id="main-content">
          {process.env.NEXT_PUBLIC_STATIC_PREVIEW === "1" && (
            <div className="preview-note" role="status">
              <CircleDot size={13} />
              <span>
                Read-only design preview · Example data only · Sign in to the
                server app for shared records
              </span>
            </div>
          )}
          <div className="page-title">
            <div>
              <p className="page-context">
                {role === "internal"
                  ? "Hyundai Australia / Internal management"
                  : `${actor.accountName} / Dealer workspace`}
              </p>
              <h1>
                {role === "internal"
                  ? "Your network, at a glance."
                  : section === "Overview"
                    ? "Your dealership, in motion."
                    : section === "Sales pipeline"
                      ? "Every customer. A next step."
                      : section === "Contracts"
                        ? "Contracts, with confidence."
                        : section === "Customers & vehicles"
                          ? "People, vehicles and relationships."
                          : "Better conversations start here."}
              </h1>
              <p>
                {role === "internal"
                  ? "Follow sales activity and learning outcomes across your demo workspace."
                  : section === "Overview"
                    ? `Welcome back, ${actor.name.split(" ")[0]}. Let’s move your next conversation forward.`
                    : section === "Contracts"
                      ? "Review the details, check the evidence, and keep the final say."
                      : section === "Learning hub"
                        ? "Practical EV knowledge, ready for the showroom."
                        : "Prepare, follow up, and keep every opportunity moving."}
              </p>
            </div>
            <button className="primary" onClick={() => openReview()}>
              <Plus size={17} />
              New contract
            </button>
          </div>
          {notice && (
            <div className="notice" role="status">
              <CheckCircle2 size={18} />
              <span>{notice}</span>
              <button aria-label="Dismiss notice" onClick={() => setNotice("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {role === "internal" ? (
            <AdminWorkspace />
          ) : (
            <>
              {section === "Overview" && (
                <div className="overview-intro">
                  <section className="hero">
                    <div className="hero-content">
                      <span className="hero-kicker">
                        <span className="pixel-mini" /> Ready for your next
                        customer
                      </span>
                      <h2>
                        Every customer.
                        <br />A confident answer.
                      </h2>
                      <p>
                        Know the product. Understand the customer.
                        <br />
                        Build your confidence in the showroom.
                      </p>
                      <button
                        className="primary"
                        onClick={() => navigate("Learning hub")}
                      >
                        Continue learning <ArrowUpRight size={17} />
                      </button>
                    </div>
                    <div className="hero-art">
                      <div className="studio-window" aria-hidden="true" />
                      <div className="studio-floor" aria-hidden="true" />
                      <img
                        src="/ev-studio.svg"
                        alt="Illustrated electric crossover in a light-filled showroom"
                      />
                      <div className="vehicle-caption">
                        <span className="pixel-mini" />
                        <span>
                          Electric possibilities.
                          <small>Illustration for this independent demo</small>
                        </span>
                      </div>
                    </div>
                  </section>
                  <div className="stats">
                    <Stat
                      label="Active opportunities"
                      value={String(
                        seed.filter((o) => o.stage !== "Delivered").length,
                      ).padStart(2, "0")}
                      detail="Customers in your pipeline"
                      icon={<Users size={18} />}
                    />
                    <Stat
                      label="Demo pipeline value"
                      value={money(
                        seed
                          .filter((o) => o.stage !== "Delivered")
                          .reduce((n, o) => n + o.value, 0),
                      )}
                      detail="Illustrative amounts · AUD"
                      icon={<Car size={18} />}
                    />
                    <Stat
                      label="Reviewed contracts"
                      value={String(contracts.length).padStart(2, "0")}
                      detail="Saved in this workspace"
                      icon={<FileCheck2 size={18} />}
                    />
                    <Stat
                      label="Your learning focus"
                      value="EV confidence"
                      detail="Assigned lessons and knowledge checks"
                      icon={<GraduationCap size={18} />}
                    />
                  </div>
                </div>
              )}
              <div
                className={
                  section === "Overview" ? "overview-work" : "section-content"
                }
              >
                {(section === "Overview" || section === "Sales pipeline") && (
                  <section className="panel pipeline">
                    <div className="panel-heading">
                      <div>
                        <span className="section-category">
                          Customer relationships
                        </span>
                        <h2>
                          Your sales pipeline{" "}
                          <span className="sub-count">
                            {seed.length} opportunities
                          </span>
                        </h2>
                        <p>A useful next step for every conversation.</p>
                      </div>
                      {section === "Overview" ? (
                        <button
                          className="text-button"
                          onClick={() => navigate("Sales pipeline")}
                        >
                          View pipeline <ArrowUpRight size={16} />
                        </button>
                      ) : (
                        <label className="search">
                          <Search size={17} />
                          <input
                            aria-label="Search opportunities"
                            placeholder="Search customers or vehicles"
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                          />
                        </label>
                      )}
                    </div>
                    <div
                      className="table-wrap"
                      tabIndex={0}
                      aria-label="Sales opportunities"
                    >
                      <table>
                        <thead>
                          <tr>
                            <th>Customer</th>
                            <th>Vehicle</th>
                            <th>Stage</th>
                            <th>Demo value</th>
                            <th>Next step</th>
                          </tr>
                        </thead>
                        <tbody>
                          {seed
                            .filter((o) =>
                              (o.name + " " + o.vehicle)
                                .toLowerCase()
                                .includes(filter.toLowerCase()),
                            )
                            .map((o) => (
                              <tr key={o.id}>
                                <td>
                                  <div className="customer">
                                    <span
                                      className={"customer-avatar " + o.colour}
                                    >
                                      {o.initials}
                                    </span>
                                    <span>
                                      <strong>{o.name}</strong>
                                      <small>{o.email}</small>
                                    </span>
                                  </div>
                                </td>
                                <td>{o.vehicle}</td>
                                <td>
                                  <span className={"stage " + o.colour}>
                                    <span />
                                    {o.stage}
                                  </span>
                                </td>
                                <td className="amount">{money(o.value)}</td>
                                <td>
                                  <button
                                    className="row-action"
                                    onClick={() =>
                                      o.id === "opp-001"
                                        ? openReview(o.id)
                                        : (setChat(true),
                                          setQuestion(
                                            `Help me prepare a ${o.vehicle} sales consultation.`,
                                          ))
                                    }
                                  >
                                    {o.action}
                                    <ArrowUpRight size={14} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                      {filter &&
                        !seed.some((o) =>
                          (o.name + " " + o.vehicle)
                            .toLowerCase()
                            .includes(filter.toLowerCase()),
                        ) && (
                          <div className="search-empty">
                            <Search size={24} />
                            <h3>No matching opportunities</h3>
                            <p>Try another customer name or vehicle.</p>
                            <button
                              className="text-button"
                              onClick={() => setFilter("")}
                            >
                              Clear search
                            </button>
                          </div>
                        )}
                    </div>
                    <div className="table-footer">
                      <span>
                        <span className="dot" /> Fictional customer records
                      </span>
                      <span>AU market · AUD</span>
                    </div>
                  </section>
                )}
                {section === "Overview" && (
                  <div className="bottom-grid">
                    <section className="panel learning-card">
                      <div className="learning-symbol">
                        <GraduationCap size={26} />
                        <span>Dealer development</span>
                      </div>
                      <div>
                        <span className="course-tag">EV sales essentials</span>
                        <h2>
                          Make electric
                          <br />
                          feel familiar.
                        </h2>
                        <p>
                          Build confidence in the questions customers ask about
                          range and charging.
                        </p>
                      </div>
                      <div className="course-bottom">
                        <span>
                          <BookOpen size={15} /> Reading + knowledge check
                        </span>
                        <button
                          className="dark-button"
                          onClick={() => navigate("Learning hub")}
                        >
                          Start learning <ArrowUpRight size={16} />
                        </button>
                      </div>
                    </section>
                    <section className="panel assistant-card">
                      <div className="assistant-heading">
                        <div className="tile-icon">
                          <Sparkles size={21} />
                        </div>
                        <span className="card-eyebrow">Sales assistant</span>
                        <span className="assistant-status">
                          <span className="dot" />{" "}
                          {live ? "Live" : "Example mode"}
                        </span>
                      </div>
                      <h2>
                        A good answer
                        <br />
                        starts with a question.
                      </h2>
                      <p>
                        Find practical guidance for your next EV conversation.
                      </p>
                      <button
                        className="suggestion"
                        onClick={() => {
                          setChat(true);
                          void ask(
                            "How should I answer a customer asking about IONIQ 5 winter range?",
                          );
                        }}
                      >
                        How do I explain range in winter?{" "}
                        <ArrowUpRight size={16} />
                      </button>
                      <button
                        className="text-button"
                        onClick={() => setChat(true)}
                      >
                        Open sales assistant <ArrowRight size={16} />
                      </button>
                    </section>
                  </div>
                )}
              </div>
              {section === "Contracts" && (
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <span className="section-category">
                        From document to record
                      </span>
                      <h2>Reviewed contracts</h2>
                      <p>
                        Your checked records, linked to their sales
                        opportunities.
                      </p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => openReview()}
                    >
                      Upload document <Upload size={16} />
                    </button>
                  </div>
                  {contracts.length === 0 ? (
                    <div className="empty">
                      <div className="empty-icon">
                        <FileCheck2 size={36} />
                      </div>
                      <h3>Your next contract starts here.</h3>
                      <p>
                        Upload a document for extraction or try a prepared
                        example.
                        <br />
                        You’ll review every detail before saving.
                      </p>
                      <button className="primary" onClick={() => openReview()}>
                        Review a contract <ArrowRight size={16} />
                      </button>
                    </div>
                  ) : (
                    <div
                      className="table-wrap"
                      tabIndex={0}
                      aria-label="Reviewed contracts"
                    >
                      <table>
                        <thead>
                          <tr>
                            <th>Customer / record</th>
                            <th>Vehicle</th>
                            <th>Amount</th>
                            <th>Opportunity</th>
                            <th>Source</th>
                          </tr>
                        </thead>
                        <tbody>
                          {contracts.map((c) => (
                            <tr key={c.id}>
                              <td>
                                <strong>{c.fields.customerName}</strong>
                                <small>{c.id.slice(0, 8)} · Reviewed</small>
                              </td>
                              <td>{c.fields.vehicle}</td>
                              <td className="amount">
                                {money(c.fields.totalPrice || 0)}
                              </td>
                              <td>
                                {
                                  seed.find((o) => o.id === c.opportunityId)
                                    ?.name
                                }
                              </td>
                              <td>
                                <span className="stage blue">
                                  {c.source === "sample"
                                    ? "Prepared example"
                                    : "Live AI extraction"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )}
              {section === "Customers & vehicles" && <CRMView />}
              {section === "Learning hub" && <DealerLearning />}
            </>
          )}
          <footer>
            <span>
              HYUNDAI <b>/</b> Dealer workspace
            </span>
            <span>
              Independent prototype. Not affiliated with Hyundai. All prices are
              fictional.
            </span>
            <button
              onClick={() =>
                setNotice(
                  "This prototype uses fictional records and two demo accounts. No live sales or warranty service is connected.",
                )
              }
            >
              <CircleHelp size={15} /> About this demo
            </button>
          </footer>
        </main>
      </div>
      {modal && (
        <div className="overlay">
          <section
            ref={dialogRef}
            className={"modal " + (result ? "has-result" : "")}
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-title"
          >
            <div className="modal-header">
              <div>
                <span className="section-category">Document workspace</span>
                <h2 id="review-title">Contract review</h2>
              </div>
              <button
                className="icon-button"
                aria-label="Close contract review"
                onClick={() => !busy && setModal(false)}
              >
                <X size={22} />
              </button>
            </div>
            <div className="modal-body">
              <div className="source-note">
                <ShieldCheck size={18} />
                <span>
                  {process.env.NEXT_PUBLIC_STATIC_PREVIEW === "1"
                    ? "Example-only preview. No documents are uploaded and no live AI calls are made."
                    : "Use fictional documents only. Live extraction sends the document to OpenAI. Original files are not retained."}
                </span>
              </div>
              <div className="review-workspace">
                <div className="review-form">
                  <label className="field">
                    Link to opportunity
                    <select
                      value={opp}
                      onChange={(e) => {
                        setOpp(e.target.value);
                        setReviewed(false);
                      }}
                    >
                      {seed.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name} · {o.vehicle}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className={"upload-zone " + (result ? "compact" : "")}>
                    <Upload size={26} />
                    <div>
                      <h3>
                        {result
                          ? "Choose another document"
                          : "Start with a signed contract"}
                      </h3>
                      <p>JPG, PNG or PDF · up to 10 MB</p>
                    </div>
                    <label
                      className={
                        "primary upload-button " + (busy ? "disabled" : "")
                      }
                    >
                      {busy ? (
                        <LoaderCircle size={16} className="spin" />
                      ) : (
                        <Upload size={16} />
                      )}{" "}
                      {busy ? "Processing…" : "Choose document"}
                      <input
                        disabled={busy}
                        type="file"
                        accept="image/jpeg,image/png,application/pdf"
                        onChange={(e) => {
                          if (e.target.files?.[0])
                            void extract(e.target.files[0]);
                        }}
                      />
                    </label>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => void extract()}
                    >
                      Or explore a prepared example <ArrowRight size={15} />
                    </button>
                    {!result && (
                      <small>
                        {live
                          ? "Live API configured"
                          : "Prepared example available · Live API not configured"}
                      </small>
                    )}
                  </div>
                  {error && (
                    <div role="alert" className="error">
                      {error}
                    </div>
                  )}
                  {result && (
                    <>
                      <div className="result-heading">
                        <h3>Review extracted details</h3>
                        <span className="stage blue">
                          {source === "sample"
                            ? "PREPARED EXAMPLE"
                            : "LIVE AI · UNVERIFIED"}
                        </span>
                      </div>
                      <div className="form-grid">
                        {Object.entries(result.fields).map(([key, value]) => (
                          <label
                            className={
                              "field " + (value === null ? "missing" : "")
                            }
                            key={key}
                          >
                            {
                              {
                                customerName: "Customer name",
                                email: "Email",
                                vehicle: "Vehicle",
                                vin: "VIN",
                                totalPrice: "Total price (AUD)",
                                deposit: "Deposit (AUD)",
                                signedDate: "Signed date",
                              }[key]
                            }
                            {value === null && (
                              <span className="missing-label">
                                Not provided
                              </span>
                            )}
                            <input
                              type={
                                key === "totalPrice" || key === "deposit"
                                  ? "number"
                                  : key === "signedDate"
                                    ? "date"
                                    : "text"
                              }
                              value={value ?? ""}
                              onChange={(e) => {
                                const v = e.target.value;
                                setReviewed(false);
                                setResult({
                                  ...result,
                                  fields: {
                                    ...result.fields,
                                    [key]:
                                      v === ""
                                        ? null
                                        : ["totalPrice", "deposit"].includes(
                                              key,
                                            )
                                          ? Number(v)
                                          : v,
                                  },
                                });
                              }}
                            />
                          </label>
                        ))}
                      </div>
                      <label className="review-check">
                        <input
                          type="checkbox"
                          checked={reviewed}
                          onChange={(e) => setReviewed(e.target.checked)}
                        />
                        <span>
                          I have checked these details and the selected
                          opportunity.{" "}
                          {source === "sample" &&
                            "I understand this is fictional example data."}
                        </span>
                      </label>
                    </>
                  )}
                </div>
                {result && (
                  <aside className="review-reference">
                    <div className="reference-heading">
                      <FileCheck2 size={17} />
                      <h3>
                        {source === "sample"
                          ? "Prepared example reference"
                          : "Extraction evidence"}
                      </h3>
                    </div>
                    {source === "sample" && (
                      <div className="paper">
                        <div className="paper-brand">
                          HYUNDAI <span>Demo</span>
                        </div>
                        <h4>Vehicle purchase agreement</h4>
                        <p className="paper-caption">
                          Fictional example · Not a legal document
                        </p>
                        <dl>
                          <div>
                            <dt>Purchaser</dt>
                            <dd>{sampleExtraction.fields.customerName}</dd>
                          </div>
                          <div>
                            <dt>Email</dt>
                            <dd>{sampleExtraction.fields.email}</dd>
                          </div>
                          <div>
                            <dt>Vehicle</dt>
                            <dd>{sampleExtraction.fields.vehicle}</dd>
                          </div>
                          <div>
                            <dt>VIN</dt>
                            <dd className="paper-missing">Not provided</dd>
                          </div>
                          <div>
                            <dt>Signed date</dt>
                            <dd>{sampleExtraction.fields.signedDate}</dd>
                          </div>
                          <div className="paper-total">
                            <dt>Purchase price</dt>
                            <dd>AUD 72,000</dd>
                          </div>
                          <div>
                            <dt>Deposit paid</dt>
                            <dd>AUD 2,000</dd>
                          </div>
                        </dl>
                        <div className="paper-stamp">
                          <ShieldCheck size={16} /> Example data only
                        </div>
                      </div>
                    )}
                    <div className="warning">
                      <strong>Before you save</strong>
                      {result.warnings.map((w) => (
                        <p key={w}>{w}</p>
                      ))}
                    </div>
                    <details className="evidence" open>
                      <summary>
                        View extraction evidence ({result.evidence.length})
                      </summary>
                      {result.evidence.map((e, i) => (
                        <div key={i}>
                          <strong>
                            {e.field} {e.page && `· page ${e.page}`}
                          </strong>
                          <p>“{e.quote}”</p>
                        </div>
                      ))}
                    </details>
                  </aside>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <span>
                <ShieldCheck size={16} /> Your review is the final check
              </span>
              <button
                className="primary"
                disabled={!reviewed || busy || !result}
                onClick={() => void save()}
              >
                Save contract <Check size={16} />
              </button>
            </div>
          </section>
        </div>
      )}
      {chat && (
        <aside className="chat-panel" aria-label="Sales assistant">
          <div className="chat-header">
            <div className="tile-icon">
              <Sparkles size={21} />
            </div>
            <div>
              <h3>Sales assistant</h3>
              <small>
                {live ? "Live assistance" : "Prepared guidance · Example mode"}
              </small>
            </div>
            <button
              className="icon-button"
              aria-label="Close assistant"
              onClick={() => setChat(false)}
            >
              <X size={20} />
            </button>
          </div>
          <div className="chat-messages" aria-live="polite">
            {messages.length === 0 && (
              <div className="chat-welcome">
                <div className="pixel-mark" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
                <h2>
                  Ready for the
                  <br />
                  next question.
                </h2>
                <p>
                  Prepare for range and charging conversations. Australian
                  specifications and promotions still need verification.
                </p>
                {[
                  "How do I explain winter range?",
                  "How do I discuss home charging?",
                  "Help me prepare a family walk-around.",
                ].map((q) => (
                  <button key={q} onClick={() => void ask(q)}>
                    {q}
                    <ArrowUpRight size={15} />
                  </button>
                ))}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={"message " + m.role}>
                {m.role === "assistant" && (
                  <div className="message-label">
                    <Sparkles size={13} />
                    {m.mode === "sample"
                      ? "PREPARED GUIDANCE"
                      : "SALES ASSISTANT"}
                  </div>
                )}
                <p>{m.text}</p>
                {m.sources?.map((s) => (
                  <span className="citation" key={s.id}>
                    <BookOpen size={12} />
                    {s.id} · {s.title}
                  </span>
                ))}
              </div>
            ))}
            {asking && (
              <div className="message assistant">
                <LoaderCircle size={18} className="spin" /> Retrieving guidance…
              </div>
            )}
          </div>
          <form
            className="chat-compose"
            onSubmit={(e) => {
              e.preventDefault();
              void ask();
            }}
          >
            <input
              aria-label="Question for sales assistant"
              placeholder="Ask a sales question…"
              value={question}
              maxLength={2000}
              onChange={(e) => setQuestion(e.target.value)}
            />
            <button
              aria-label="Send question"
              disabled={asking || !question.trim()}
            >
              <Send size={18} />
            </button>
          </form>
          <div className="chat-disclaimer">
            Verify guidance before advising a customer.
          </div>
        </aside>
      )}
    </div>
  );
}
function Stat({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="stat">
      <div className="stat-label">
        {label}
        {icon}
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-detail">{detail}</div>
    </div>
  );
}
