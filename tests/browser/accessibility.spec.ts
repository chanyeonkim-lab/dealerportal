import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { login, switchAccount } from "./helpers";
test("sign-in, dealer learning and management screens pass automated accessibility checks", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  async function check(name: string) {
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          reason: n.failureSummary,
        })),
      })),
      name,
    ).toEqual([]);
  }
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Welcome to your workspace." }),
  ).toBeVisible();
  await check("Sign in");
  await page.screenshot({ path: "test-results/sign-in.png", fullPage: true });
  await login(page);
  await check("Dealer overview");
  await page.screenshot({
    path: "test-results/dealer-overview.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Learning hub", exact: true }).click();
  await expect(
    page.getByRole("navigation", { name: "Learning steps" }),
  ).toBeVisible();
  await check("Assigned learning");
  await page.screenshot({
    path: "test-results/dealer-learning.png",
    fullPage: true,
  });
  await page
    .getByRole("navigation", { name: "Learning steps" })
    .getByRole("button", { name: /Knowledge check/ })
    .click();
  await check("Knowledge check");
  await switchAccount(page, true);
  await expect(
    page.getByRole("heading", { name: "Dealer network", exact: true }),
  ).toBeVisible();
  await check("Internal network");
  await page
    .getByRole("button", { name: "Training management", exact: true })
    .click();
  await check("Training management");
  await page
    .getByRole("button", { name: "Learning performance", exact: true })
    .click();
  await check("Learning performance");
  await page
    .getByRole("button", { name: "Knowledge library", exact: true })
    .click();
  await check("Knowledge library");
  await page.setViewportSize({ width: 390, height: 844 });
  await switchAccount(page, false);
  await check("Mobile overview");
});
