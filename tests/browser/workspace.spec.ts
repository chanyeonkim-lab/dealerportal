import { test, expect } from "@playwright/test";
import { login, switchAccount } from "./helpers";

test("authenticated contract review persists and respects its opportunity", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "New contract", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save contract" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Or explore a prepared example" })
    .click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Save contract" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Contracts", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("cell", { name: "Alex Morgan", exact: false }).first(),
  ).toBeVisible();
  const response = await page.request.get("/api/contracts");
  expect((await response.json()).contracts.length).toBeGreaterThan(0);
});

test("internal course publication, individual assignment, learning and scorecards share data", async ({
  page,
}) => {
  test.setTimeout(60000);
  const title = "E2E charging " + Date.now();
  await login(page, true);
  await page
    .getByRole("button", { name: "Training management", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Course code", exact: true })
    .fill("E2E" + Date.now());
  await page
    .getByRole("textbox", { name: "Course title", exact: true })
    .fill(title);
  await page
    .getByRole("textbox", { name: "Training material", exact: true })
    .fill(
      "Explain charging with conditions, check installation suitability and plan the customer’s longer journey.",
    );
  for (const [i, answer] of [1, 0, 2].entries())
    await page
      .getByRole("combobox", {
        name: `Correct option for question ${i + 1}`,
        exact: true,
      })
      .selectOption(String(answer));
  await page.getByRole("button", { name: "Publish course & quiz" }).click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Target type", exact: true })
    .selectOption("CONTACT");
  await page
    .getByRole("combobox", { name: "Sales consultant", exact: true })
    .selectOption("contact-olivia");
  await page.getByRole("button", { name: "Preview recipients" }).click();
  await expect(
    page.getByText("1 sales consultants across 1 dealer accounts match.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Assign learning", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Learning assigned." }),
  ).toBeVisible();
  await switchAccount(page, false);
  await page.getByRole("button", { name: "Learning hub", exact: true }).click();
  await page.getByRole("button", { name: new RegExp(title) }).click();
  await page.getByRole("button", { name: "Mark lesson complete" }).click();
  await expect(
    page.getByRole("button", { name: "Lesson completed" }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Learning steps" })
    .getByRole("button", { name: /Knowledge check/ })
    .click();
  await page
    .getByRole("radio", {
      name: "Explain the conditions and check their route and charging options.",
    })
    .check();
  await page
    .getByRole("radio", {
      name: "Installation suitability, vehicle, power supply and routine.",
    })
    .check();
  await page
    .getByRole("radio", {
      name: "Link relevant features to needs and invite practical checks.",
    })
    .check();
  await page.getByRole("button", { name: "Submit knowledge check" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "3/3 correct" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "View your scorecard" }).click();
  await expect(
    page.getByRole("cell", { name: "Your submission", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/learner-scorecard.png",
    fullPage: true,
  });
  await page.reload();
  await page.getByRole("button", { name: "Learning hub", exact: true }).click();
  await page.getByRole("button", { name: new RegExp(title) }).click();
  await expect(page.locator(".model-big-progress")).toHaveText("100%");
  await switchAccount(page, true);
  await page
    .getByRole("button", { name: "Learning performance", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Filter learning by consultant" })
    .selectOption("contact-olivia");
  await expect(
    page.getByRole("row").filter({ hasText: title }).first(),
  ).toContainText("COMPLETED");
  await expect(
    page.getByRole("cell", { name: "Actual submission", exact: true }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/internal-learning.png",
    fullPage: true,
  });
});

test("network attributes and overlapping assignment rules do not duplicate enrollments", async ({
  page,
}) => {
  await login(page, true);
  await page
    .getByRole("combobox", { name: "Tier for Geelong Riverside" })
    .selectOption("TIER_1");
  await expect(
    page.getByRole("status").filter({ hasText: "Dealer updated." }),
  ).toBeVisible();
  const body = {
    action: "assign",
    assignment: {
      courseId: "course-ev-v1",
      targetType: "DEALER_SEGMENT",
      criteria: { lifecycle: "NEW" },
    },
  };
  expect(
    (await page.request.post("/api/training", { data: body })).status(),
  ).toBe(201);
  expect(
    (
      await page.request.post("/api/training", { data: { action: "reapply" } })
    ).status(),
  ).toBe(200);
  const result = await (
    await page.request.get("/api/training?view=admin")
  ).json();
  expect(
    result.enrollments.filter(
      (r: { learnerId: string; courseId: string }) =>
        r.learnerId === "contact-priya" && r.courseId === "course-ev-v1",
    ),
  ).toHaveLength(1);
  await page.screenshot({
    path: "test-results/internal-network.png",
    fullPage: true,
  });
});

test("dealer API access cannot be escalated using URLs, IDs or role fields", async ({
  page,
}) => {
  await login(page);
  expect((await page.request.get("/api/training?view=admin")).status()).toBe(
    403,
  );
  expect(
    (
      await page.request.post("/api/training", {
        data: {
          action: "submit",
          enrollmentId: "enrollment-priya-onboarding",
          answers: [1, 0, 2],
          requestId: crypto.randomUUID(),
        },
      })
    ).status(),
  ).toBe(404);
  const result = await (await page.request.get("/api/crm")).json();
  expect(
    result.contacts.some((c: { name: string }) => c.name === "Priya Shah"),
  ).toBe(false);
  expect(result.assets).toHaveLength(1);
});

test("assistant shows sample citations and restores only the owner’s history", async ({
  page,
}) => {
  await login(page);
  await page
    .getByRole("button", { name: "Open sales assistant", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Question for sales assistant" })
    .fill("winter range");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(
    page.getByText("PREPARED GUIDANCE", { exact: true }).last(),
  ).toBeVisible();
  await expect(
    page
      .getByText("AU-TRAIN-01-v1 · Range conversations", { exact: true })
      .last(),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Open sales assistant", exact: true })
    .click();
  await expect(
    page
      .getByText("AU-TRAIN-01-v1 · Range conversations", { exact: true })
      .last(),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/knowledge-chat.png",
    fullPage: true,
  });
});

test("mobile navigation and relationship views stay inside the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await login(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Open menu" }).click();
  await page
    .getByRole("button", { name: "Customers & vehicles", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Vehicles and warranty records" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/mobile-relationships.png",
    fullPage: true,
  });
});
