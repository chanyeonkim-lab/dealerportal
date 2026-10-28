"use client";
import { apiFetch } from "@/lib/client-api";
import { useEffect, useState } from "react";
import {
  BookOpen,
  Check,
  CheckCircle2,
  ArrowRight,
  RotateCcw,
} from "lucide-react";
import type { LearnerCourse, Grade } from "@/lib/model-types";
export function DealerLearning() {
  const [courses, setCourses] = useState<LearnerCourse[]>([]),
    [selected, setSelected] = useState(""),
    [answers, setAnswers] = useState<number[]>([]),
    [grade, setGrade] = useState<Grade | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [step, setStep] = useState<"learn" | "check" | "progress">("learn");
  async function load(preferred?: string) {
    const r = await apiFetch("/api/training"),
      d = await r.json();
    if (!r.ok) throw Error(d.error);
    setCourses(d.courses);
    if (!selected && !preferred && d.courses[0]) {
      setSelected(d.courses[0].id);
      setAnswers(d.courses[0].questions.map(() => -1));
    }
    return d.courses as LearnerCourse[];
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, []); // initial assignment list; opening a lesson is an explicit action
  const course = courses.find((c) => c.id === selected);
  async function action(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setError("");
    try {
      const r = await apiFetch("/api/training", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, enrollmentId: selected, ...extra }),
        }),
        d = await r.json();
      if (!r.ok) throw Error(d.error);
      if (action === "submit") setGrade(d);
      await load(selected);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function select(id: string) {
    const c = courses.find((x) => x.id === id);
    setSelected(id);
    setAnswers(c?.questions.map(() => -1) || []);
    setGrade(null);
    setStep("learn");
    setError("");
  }
  return (
    <div className="model-learning">
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className="model-course-list">
        {courses.map((c) => (
          <button
            key={c.id}
            className={
              "model-course-choice " + (selected === c.id ? "selected" : "")
            }
            onClick={() => select(c.id)}
          >
            <span>
              {c.code} · Version {c.version}
            </span>
            <strong>{c.title}</strong>
            <span>
              {c.progress}% complete ·{" "}
              {c.status === "COMPLETED"
                ? "Completed"
                : c.passed
                  ? "Quiz passed"
                  : "Assigned to you"}
            </span>
            <div className="model-progress-track">
              <span style={{ width: c.progress + "%" }} />
            </div>
          </button>
        ))}
      </div>
      {course ? (
        <>
          <div className="model-learning-heading">
            <div>
              <span className="course-tag">
                {course.code} · Version {course.version}
              </span>
              <h2>{course.title}</h2>
              <p>
                {course.reasons.join(" / ")} · Due{" "}
                {new Date(course.dueAt).toLocaleDateString("en-AU")}
              </p>
            </div>
            <strong className="model-big-progress">
              {course.progress}
              <small>%</small>
            </strong>
          </div>
          <nav className="model-steps" aria-label="Learning steps">
            {(["learn", "check", "progress"] as const).map((s, i) => (
              <button
                key={s}
                aria-current={step === s ? "step" : undefined}
                onClick={() => setStep(s)}
              >
                <span>{i + 1}</span>
                {s === "learn"
                  ? "Learn"
                  : s === "check"
                    ? "Knowledge check"
                    : "Your progress"}
              </button>
            ))}
          </nav>
          {step === "learn" && (
            <div className="model-lessons">
              {course.lessons.map((lesson, i) => (
                <section className="panel model-lesson" key={lesson.id}>
                  <span className="course-tag">
                    Lesson {i + 1} of {course.lessons.length}
                  </span>
                  <h3>{lesson.title}</h3>
                  <p>{lesson.body}</p>
                  <button
                    className={
                      course.completedLessons.includes(lesson.id)
                        ? "text-button"
                        : "primary"
                    }
                    disabled={
                      busy || course.completedLessons.includes(lesson.id)
                    }
                    onClick={() =>
                      void action("completeLesson", { lessonId: lesson.id })
                    }
                  >
                    {course.completedLessons.includes(lesson.id) ? (
                      <>
                        <CheckCircle2 size={17} />
                        Lesson completed
                      </>
                    ) : (
                      <>
                        Mark lesson complete
                        <Check size={17} />
                      </>
                    )}
                  </button>
                </section>
              ))}
              <button className="primary" onClick={() => setStep("check")}>
                Check your knowledge
                <ArrowRight size={17} />
              </button>
            </div>
          )}
          {step === "check" && (
            <section className="panel model-quiz">
              <div className="panel-heading">
                <div>
                  <h3>Knowledge check</h3>
                  <p>
                    {course.questions.length} questions · Pass mark{" "}
                    {course.passMark}% · Every attempt is retained
                  </p>
                </div>
                <BookOpen size={24} />
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void action("submit", {
                    answers,
                    requestId: crypto.randomUUID(),
                  });
                }}
              >
                {course.questions.map((q, i) => (
                  <fieldset key={i}>
                    <legend>
                      <span>{i + 1}.</span> {q.question}
                    </legend>
                    {q.options.map((o, j) => (
                      <label
                        className={
                          "option " + (answers[i] === j ? "selected" : "")
                        }
                        key={j}
                      >
                        <input
                          type="radio"
                          name={`q-${i}`}
                          checked={answers[i] === j}
                          onChange={() => {
                            setAnswers((a) =>
                              a.map((v, k) => (k === i ? j : v)),
                            );
                            setGrade(null);
                          }}
                        />
                        {o}
                      </label>
                    ))}
                    {grade && (
                      <p
                        className={
                          grade.feedback[i].correct ? "correct" : "incorrect"
                        }
                      >
                        {grade.feedback[i].correct
                          ? "Correct."
                          : "Review: " + q.options[grade.feedback[i].answer]}
                      </p>
                    )}
                  </fieldset>
                ))}
                <button
                  className="primary"
                  disabled={
                    busy ||
                    answers.length !== course.questions.length ||
                    answers.includes(-1)
                  }
                >
                  {busy ? "Saving your result…" : "Submit knowledge check"}
                  <Check size={17} />
                </button>
              </form>
              {grade && (
                <div className="model-grade" role="status">
                  <strong>
                    {grade.score}/{grade.total} correct ·{" "}
                    {grade.passed
                      ? "Knowledge check passed"
                      : "Review and retry"}
                  </strong>
                  <p>
                    Attempt saved. Complete every required lesson and pass the
                    quiz to finish the course. This is not official
                    certification.
                  </p>
                  <button
                    className="text-button"
                    onClick={() => setStep("progress")}
                  >
                    View your scorecard
                    <ArrowRight size={15} />
                  </button>
                </div>
              )}
            </section>
          )}
          {step === "progress" && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h3>Your learning record</h3>
                  <p>
                    Latest:{" "}
                    {course.latestScore === null
                      ? "Not submitted"
                      : Math.round(course.latestScore) + "%"}{" "}
                    · Best:{" "}
                    {course.bestScore === null
                      ? "Not submitted"
                      : Math.round(course.bestScore) + "%"}{" "}
                    · {course.attempts.length} attempts
                  </p>
                </div>
                <button
                  className="text-button"
                  onClick={() => {
                    setStep("check");
                    setAnswers(course.questions.map(() => -1));
                    setGrade(null);
                  }}
                >
                  <RotateCcw size={16} />
                  Practise the quiz again
                </button>
              </div>
              {!course.attempts.length ? (
                <p className="model-empty">
                  No attempts yet. Your submitted results will appear here.
                </p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Attempt</th>
                        <th>Score</th>
                        <th>Outcome</th>
                        <th>Submitted</th>
                        <th>Record</th>
                      </tr>
                    </thead>
                    <tbody>
                      {course.attempts.map((a) => (
                        <tr key={a.id}>
                          <td>{a.number}</td>
                          <td>
                            {a.score}/{a.total}
                          </td>
                          <td>{a.passed ? "Passed" : "Review and retry"}</td>
                          <td>
                            {new Date(a.submittedAt).toLocaleString("en-AU")}
                          </td>
                          <td>
                            {a.source === "PREPARED"
                              ? "Prepared sample"
                              : "Your submission"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </>
      ) : (
        <p className="model-empty">
          Your assigned courses will appear here. Contact the learning team if
          no course is assigned.
        </p>
      )}
    </div>
  );
}
