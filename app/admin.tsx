"use client";
import { apiFetch } from "@/lib/client-api";
import { useEffect, useState } from "react";
import { BookOpen, Plus, RefreshCw, CheckCircle2 } from "lucide-react";
import { quizQuestions } from "@/lib/domain";
import type { Course } from "@/lib/training-schema";
import type { AccountSummary, OpportunityView } from "@/lib/model-types";
import { CRMView, type CRMData } from "./crm-view";
type Attempt = {
  id: string;
  number: number;
  score: number;
  total: number;
  passed: boolean;
  submittedAt: string;
  source: string;
};
type Report = {
  id: string;
  learnerId: string;
  learner: string;
  accountId: string;
  account: string;
  courseId: string;
  course: string;
  version: number;
  status: string;
  progress: number;
  attempts: Attempt[];
};
type Assignment = {
  id: string;
  courseTitle: string;
  version: number;
  targetType: string;
  criteria: Record<string, string> | null;
  accountId: string | null;
  contactId: string | null;
  status: string;
  required: boolean;
  dueDays: number;
};
type Article = {
  id: string;
  title: string;
  key: string;
  version: number;
  text: string;
  audience: string;
};
const money = (v: number) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(v);
export function AdminWorkspace() {
  const [tab, setTab] = useState("Dealer network"),
    [courses, setCourses] = useState<Course[]>([]),
    [reports, setReports] = useState<Report[]>([]),
    [assignments, setAssignments] = useState<Assignment[]>([]),
    [accounts, setAccounts] = useState<AccountSummary[]>([]),
    [people, setPeople] = useState<CRMData["contacts"]>([]),
    [opportunities, setOpportunities] = useState<OpportunityView[]>([]),
    [articles, setArticles] = useState<Article[]>([]),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const [title, setTitle] = useState(""),
    [body, setBody] = useState(""),
    [code, setCode] = useState("CUSTOM01"),
    [passMark, setPassMark] = useState(80),
    [questions, setQuestions] = useState(
      quizQuestions.map((q) => ({ ...q, correct: 0 })),
    );
  const [courseId, setCourseId] = useState("course-ev-v1"),
    [targetType, setTargetType] = useState("DEALER_SEGMENT"),
    [tier, setTier] = useState("TIER_1"),
    [lifecycle, setLifecycle] = useState(""),
    [accountId, setAccountId] = useState("dealer-a"),
    [contactId, setContactId] = useState("contact-olivia"),
    [dueDays, setDueDays] = useState(14),
    [required, setRequired] = useState(true),
    [preview, setPreview] = useState<{
      staffCount: number;
      accountCount: number;
    } | null>(null);
  const [reportAccount, setReportAccount] = useState(""),
    [reportContact, setReportContact] = useState(""),
    [articleTitle, setArticleTitle] = useState(""),
    [articleKey, setArticleKey] = useState("AU-CUSTOM-01"),
    [articleBody, setArticleBody] = useState(""),
    [audience, setAudience] = useState("BOTH");
  async function load() {
    const responses = await Promise.all(
      [
        "/api/training?view=admin",
        "/api/crm",
        "/api/dashboard",
        "/api/knowledge",
      ].map((u) => apiFetch(u)),
    );
    const [a, b, c, d] = await Promise.all(responses.map((r) => r.json()));
    if (responses.some((r) => !r.ok))
      throw Error(
        a.error ||
          b.error ||
          c.error ||
          d.error ||
          "Could not load management data.",
      );
    setCourses(a.courses);
    setReports(a.enrollments);
    setAssignments(a.assignments);
    setAccounts(a.accounts);
    setPeople(b.contacts);
    setOpportunities(c.opportunities);
    setArticles(d.articles);
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, []);
  async function post(url: string, value: unknown, message: string) {
    setSaving(true);
    setError("");
    try {
      const r = await apiFetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(value),
        }),
        d = await r.json();
      if (!r.ok) throw Error(d.error);
      setNotice(message);
      await load();
      return d;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setSaving(false);
    }
  }
  function target() {
    return {
      courseId,
      targetType,
      ...(targetType === "ACCOUNT"
        ? { accountId }
        : targetType === "CONTACT"
          ? { contactId }
          : {
              criteria: {
                ...(tier ? { tier } : {}),
                ...(lifecycle ? { lifecycle } : {}),
              },
            }),
      dueDays,
      required,
    };
  }
  async function previewTarget() {
    const d = await post(
      "/api/training",
      { action: "previewAssignment", assignment: target() },
      "Assignment preview ready.",
    );
    if (d) setPreview(d);
  }
  async function publish(draft = false) {
    const d = await post(
      "/api/training",
      {
        action: draft ? "draft" : "publish",
        course: { title, body, courseCode: code, passMark, questions },
      },
      draft
        ? "Draft saved. Publish when ready."
        : "Course version published. Choose its assignment targets below.",
    );
    if (d) {
      setTitle("");
      setBody("");
      setCourseId(d.id);
      setPreview(null);
    }
  }
  const filtered = reports.filter(
    (r) =>
      (!reportAccount || r.accountId === reportAccount) &&
      (!reportContact || r.learnerId === reportContact),
  );
  const attempts = filtered.flatMap((r) =>
      r.attempts.map((a) => ({
        ...a,
        learner: r.learner,
        account: r.account,
        course: r.course,
        version: r.version,
      })),
    ),
    requiredCount = accounts.reduce((n, a) => n + a.required, 0),
    completedCount = accounts.reduce((n, a) => n + a.completed, 0);
  return (
    <>
      <div className="model-management-intro">
        <span>Hyundai internal</span>
        <p>
          Manage dealer requirements and follow individual learning in one
          shared workspace.
        </p>
        <button
          className="text-button"
          onClick={() => void load().catch((e) => setError(e.message))}
        >
          <RefreshCw size={15} />
          Refresh records
        </button>
      </div>
      <nav className="admin-toolbar" aria-label="Management sections">
        {[
          "Dealer network",
          "Training management",
          "Learning performance",
          "Knowledge library",
          "Sales overview",
        ].map((t) => (
          <button
            key={t}
            aria-current={tab === t ? "page" : undefined}
            className={tab === t ? "selected" : ""}
            onClick={() => {
              setTab(t);
              setNotice("");
              setError("");
              void load().catch((e) => setError(e.message));
            }}
          >
            {t}
          </button>
        ))}
      </nav>
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
      {tab === "Dealer network" && (
        <>
          <div className="stats">
            <Metric
              label="Dealer accounts"
              value={String(accounts.length)}
              detail="Shared network records"
            />
            <Metric
              label="Sales consultants"
              value={String(accounts.reduce((s, a) => s + a.staff, 0))}
              detail="Contacts with employee relationships"
            />
            <Metric
              label="Required learning"
              value={`${completedCount}/${requiredCount}`}
              detail="Completed / required enrollments"
            />
            <Metric
              label="Completion rate"
              value={
                requiredCount
                  ? Math.round((completedCount / requiredCount) * 100) + "%"
                  : "N/A"
              }
              detail="Individual enrollments, not course opens"
            />
          </div>
          <CRMView internal />
        </>
      )}
      {tab === "Training management" && (
        <div className="admin-stack">
          <div className="admin-columns">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Publish training & quiz</h2>
                  <p>
                    New versions preserve previous learners’ records.
                    Publication does not assign a course.
                  </p>
                </div>
                <BookOpen size={22} />
              </div>
              <form
                className="admin-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void publish();
                }}
              >
                <label className="field">
                  Course code
                  <input
                    value={code}
                    required
                    pattern="[A-Z0-9_-]{2,40}"
                    onChange={(e) => setCode(e.target.value)}
                  />
                </label>
                <label className="field">
                  Course title
                  <input
                    value={title}
                    required
                    minLength={3}
                    maxLength={160}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
                <label className="field">
                  Training material
                  <textarea
                    value={body}
                    required
                    minLength={30}
                    maxLength={12000}
                    onChange={(e) => setBody(e.target.value)}
                  />
                </label>
                <label className="field">
                  Pass mark (%)
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={passMark}
                    onChange={(e) => setPassMark(Number(e.target.value))}
                  />
                </label>
                <p className="model-helper">
                  Review the questions and select each correct answer before
                  publishing.
                </p>
                {questions.map((q, i) => (
                  <fieldset className="model-editor-question" key={i}>
                    <legend>Question {i + 1}</legend>
                    <label className="field">
                      Question text {i + 1}
                      <input
                        required
                        minLength={5}
                        maxLength={500}
                        value={q.question}
                        onChange={(e) =>
                          setQuestions((qs) =>
                            qs.map((v, k) =>
                              k === i ? { ...v, question: e.target.value } : v,
                            ),
                          )
                        }
                      />
                    </label>
                    {q.options.map((o, j) => (
                      <label className="field" key={j}>
                        Question {i + 1} option {j + 1}
                        <input
                          required
                          value={o}
                          onChange={(e) =>
                            setQuestions((qs) =>
                              qs.map((v, k) =>
                                k === i
                                  ? {
                                      ...v,
                                      options: v.options.map((x, l) =>
                                        l === j ? e.target.value : x,
                                      ),
                                    }
                                  : v,
                              ),
                            )
                          }
                        />
                      </label>
                    ))}
                    <label className="field">
                      Correct option for question {i + 1}
                      <select
                        value={q.correct}
                        onChange={(e) =>
                          setQuestions((qs) =>
                            qs.map((v, k) =>
                              k === i
                                ? { ...v, correct: Number(e.target.value) }
                                : v,
                            ),
                          )
                        }
                      >
                        {q.options.map((_, j) => (
                          <option key={j} value={j}>
                            Option {j + 1}
                          </option>
                        ))}
                      </select>
                    </label>
                    {questions.length > 1 && (
                      <button
                        type="button"
                        className="text-button"
                        onClick={() =>
                          setQuestions((qs) => qs.filter((_, j) => i !== j))
                        }
                      >
                        Remove question {i + 1}
                      </button>
                    )}
                  </fieldset>
                ))}
                <div className="model-actions">
                  <button
                    type="button"
                    className="text-button"
                    disabled={questions.length >= 20}
                    onClick={() =>
                      setQuestions((qs) => [
                        ...qs,
                        { question: "", options: ["", "", ""], correct: 0 },
                      ])
                    }
                  >
                    <Plus size={16} />
                    Add question
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    disabled={saving}
                    onClick={() => void publish(true)}
                  >
                    Save draft
                  </button>
                  <button className="primary" disabled={saving}>
                    {saving ? "Saving…" : "Publish course & quiz"}
                  </button>
                </div>
              </form>
            </section>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Course versions</h2>
                  <p>
                    Published versions are fixed. Reuse a course code to create
                    the next version.
                  </p>
                </div>
              </div>
              {courses.map((c) => (
                <article className="model-course-summary" key={c.id}>
                  <span className="course-tag">
                    {c.code} · Version {c.version} · {c.status}
                  </span>
                  <h3>{c.title}</h3>
                  <p>
                    {c.questions.length} questions · Pass mark {c.passMark}%
                  </p>
                  <p>{c.body.slice(0, 150)}…</p>
                  {c.status === "DRAFT" && (
                    <button
                      className="text-button"
                      disabled={saving}
                      onClick={() =>
                        void post(
                          "/api/training",
                          { action: "publishDraft", courseId: c.id },
                          "Draft published. Ready to assign.",
                        )
                      }
                    >
                      Publish this draft
                    </button>
                  )}
                </article>
              ))}
            </section>
          </div>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Assign learning</h2>
                <p>
                  Choose a dealer segment, a dealer account or one sales
                  consultant. Matching rules share the same enrollment.
                </p>
              </div>
            </div>
            <div className="admin-form model-assignment-form">
              <label className="field">
                Assigned course
                <select
                  value={courseId}
                  onChange={(e) => {
                    setCourseId(e.target.value);
                    setPreview(null);
                  }}
                >
                  {courses
                    .filter((c) => c.status === "PUBLISHED")
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title} · v{c.version}
                      </option>
                    ))}
                </select>
              </label>
              <label className="field">
                Target type
                <select
                  value={targetType}
                  onChange={(e) => {
                    setTargetType(e.target.value);
                    setPreview(null);
                  }}
                >
                  <option value="DEALER_SEGMENT">Dealer segment</option>
                  <option value="ACCOUNT">Specific dealer</option>
                  <option value="CONTACT">Specific consultant</option>
                </select>
              </label>
              {targetType === "DEALER_SEGMENT" ? (
                <>
                  <label className="field">
                    Dealer tier
                    <select
                      value={tier}
                      onChange={(e) => {
                        setTier(e.target.value);
                        setPreview(null);
                      }}
                    >
                      <option value="">Any tier</option>
                      {["TIER_1", "TIER_2", "TIER_3"].map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Dealer lifecycle
                    <select
                      value={lifecycle}
                      onChange={(e) => {
                        setLifecycle(e.target.value);
                        setPreview(null);
                      }}
                    >
                      <option value="">Any lifecycle</option>
                      <option value="NEW">New dealer</option>
                      <option value="ESTABLISHED">Established dealer</option>
                    </select>
                  </label>
                </>
              ) : targetType === "ACCOUNT" ? (
                <label className="field">
                  Dealer account
                  <select
                    value={accountId}
                    onChange={(e) => {
                      setAccountId(e.target.value);
                      setPreview(null);
                    }}
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="field">
                  Sales consultant
                  <select
                    value={contactId}
                    onChange={(e) => {
                      setContactId(e.target.value);
                      setPreview(null);
                    }}
                  >
                    {people
                      .filter((p) => p.relationship === "EMPLOYEE")
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · {p.account_name}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <label className="field">
                Due in days
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={dueDays}
                  onChange={(e) => {
                    setDueDays(Number(e.target.value));
                    setPreview(null);
                  }}
                />
              </label>
              <label className="model-checkbox">
                <input
                  type="checkbox"
                  checked={required}
                  onChange={(e) => {
                    setRequired(e.target.checked);
                    setPreview(null);
                  }}
                />
                Required learning
              </label>
              <div className="model-actions">
                <button
                  className="text-button"
                  disabled={saving}
                  onClick={() => void previewTarget()}
                >
                  Preview recipients
                </button>
                <button
                  className="primary"
                  disabled={saving || !preview}
                  onClick={() =>
                    void post(
                      "/api/training",
                      { action: "assign", assignment: target() },
                      "Learning assigned. Existing progress has been preserved.",
                    )
                  }
                >
                  Assign learning
                </button>
              </div>
              {preview && (
                <p className="model-assignment-result" role="status">
                  {preview.staffCount} sales consultants across{" "}
                  {preview.accountCount} dealer accounts match.
                </p>
              )}
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Course</th>
                    <th>Target</th>
                    <th>Required</th>
                    <th>Due</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((a) => (
                    <tr key={a.id}>
                      <td>
                        {a.courseTitle}
                        <small>Version {a.version}</small>
                      </td>
                      <td>
                        {a.criteria
                          ? Object.entries(a.criteria)
                              .map(([k, v]) => `${k}: ${v}`)
                              .join(" and ")
                          : a.accountId
                            ? accounts.find((x) => x.id === a.accountId)?.name
                            : people.find((p) => p.id === a.contactId)?.name}
                      </td>
                      <td>{a.required ? "Yes" : "Optional"}</td>
                      <td>{a.dueDays} days</td>
                      <td>
                        <button
                          className="text-button"
                          disabled={saving}
                          onClick={() =>
                            void post(
                              "/api/training",
                              {
                                action: "assignmentStatus",
                                id: a.id,
                                status:
                                  a.status === "ACTIVE" ? "PAUSED" : "ACTIVE",
                              },
                              "Assignment updated. Existing learner records are retained.",
                            )
                          }
                        >
                          {a.status === "ACTIVE"
                            ? "Pause new assignments"
                            : "Resume assignments"}
                        </button>
                        <small>{a.status}</small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
      {tab === "Learning performance" && (
        <div className="admin-stack">
          <div className="model-filters">
            <label className="field">
              Filter learning by dealer
              <select
                value={reportAccount}
                onChange={(e) => {
                  setReportAccount(e.target.value);
                  setReportContact("");
                }}
              >
                <option value="">All dealers</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Filter learning by consultant
              <select
                value={reportContact}
                onChange={(e) => setReportContact(e.target.value)}
              >
                <option value="">All consultants</option>
                {people
                  .filter(
                    (p) =>
                      p.relationship === "EMPLOYEE" &&
                      (!reportAccount ||
                        accounts.find((a) => a.name === p.account_name)?.id ===
                          reportAccount),
                  )
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Individual learning</h2>
                <p>
                  Account totals and personal scorecards use these same
                  enrollment records.
                </p>
              </div>
              <CheckCircle2 size={22} />
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Consultant</th>
                    <th>Dealer</th>
                    <th>Course</th>
                    <th>Progress</th>
                    <th>Status</th>
                    <th>Latest / Best</th>
                    <th>Attempts</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id}>
                      <td>{r.learner}</td>
                      <td>{r.account}</td>
                      <td>
                        {r.course}
                        <small>Version {r.version}</small>
                      </td>
                      <td>{r.progress}%</td>
                      <td>{r.status.replaceAll("_", " ")}</td>
                      <td>
                        {r.attempts.length
                          ? `${Math.round((r.attempts[0].score / r.attempts[0].total) * 100)}% / ${Math.round(Math.max(...r.attempts.map((a) => a.score / a.total)) * 100)}%`
                          : "Not submitted"}
                      </td>
                      <td>{r.attempts.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Quiz scorecards</h2>
                <p>
                  Prepared examples and actual submissions are labelled
                  separately. Retrying never overwrites an attempt.
                </p>
              </div>
            </div>
            {attempts.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Consultant</th>
                      <th>Course</th>
                      <th>Attempt</th>
                      <th>Score</th>
                      <th>Outcome</th>
                      <th>Record</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attempts.map((a) => (
                      <tr key={a.id}>
                        <td>
                          {a.learner}
                          <small>{a.account}</small>
                        </td>
                        <td>
                          {a.course} · v{a.version}
                        </td>
                        <td>{a.number}</td>
                        <td>
                          {a.score}/{a.total}
                        </td>
                        <td>{a.passed ? "Passed" : "Retry recommended"}</td>
                        <td>
                          {a.source === "PREPARED"
                            ? "Prepared sample"
                            : "Actual submission"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="model-empty">
                No quiz attempts for this selection.
              </p>
            )}
          </section>
        </div>
      )}
      {tab === "Knowledge library" && (
        <div className="admin-columns">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Publish a knowledge article</h2>
                <p>
                  Only permitted published articles can ground chatbot answers.
                </p>
              </div>
            </div>
            <form
              className="admin-form"
              onSubmit={(e) => {
                e.preventDefault();
                void post(
                  "/api/knowledge",
                  {
                    key: articleKey,
                    title: articleTitle,
                    body: articleBody,
                    audience,
                  },
                  "Knowledge article published.",
                ).then((d) => {
                  if (d) {
                    setArticleTitle("");
                    setArticleBody("");
                  }
                });
              }}
            >
              <label className="field">
                Article key
                <input
                  required
                  pattern="[A-Z0-9_-]{3,60}"
                  value={articleKey}
                  onChange={(e) => setArticleKey(e.target.value)}
                />
              </label>
              <label className="field">
                Article title
                <input
                  required
                  minLength={3}
                  value={articleTitle}
                  onChange={(e) => setArticleTitle(e.target.value)}
                />
              </label>
              <label className="field">
                Knowledge content
                <textarea
                  required
                  minLength={30}
                  value={articleBody}
                  onChange={(e) => setArticleBody(e.target.value)}
                />
              </label>
              <label className="field">
                Audience
                <select
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                >
                  <option value="BOTH">Dealer and internal</option>
                  <option value="DEALER">Dealer only</option>
                  <option value="INTERNAL">Internal only</option>
                </select>
              </label>
              <button className="primary" disabled={saving}>
                Publish article
              </button>
            </form>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Knowledge articles</h2>
                <p>Quiz answer keys and customer documents are excluded.</p>
              </div>
            </div>
            {articles.map((a) => (
              <article className="model-course-summary" key={a.id}>
                <span className="course-tag">
                  {a.key} · v{a.version} · {a.audience}
                </span>
                <h3>{a.title}</h3>
                <p>{a.text}</p>
              </article>
            ))}
          </section>
        </div>
      )}
      {tab === "Sales overview" && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Shared sales records</h2>
              <p>
                Each opportunity has a dealer, a sales consultant, a product and
                a buyer Contact Role. Amounts are fictional.
              </p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Buyer</th>
                  <th>Dealer</th>
                  <th>Sales consultant</th>
                  <th>Product</th>
                  <th>Stage</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {opportunities.map((o) => (
                  <tr key={o.id}>
                    <td>{o.name}</td>
                    <td>{o.accountName}</td>
                    <td>{o.consultant}</td>
                    <td>{o.vehicle}</td>
                    <td>{o.stage}</td>
                    <td>{money(o.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-detail">{detail}</div>
    </div>
  );
}
