import { expect, type Page } from "@playwright/test";
export async function login(page: Page, internal = false) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Welcome to your workspace." }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: internal ? /^Hyundai internal/ : /^Dealer consultant/,
    })
    .click();
  await page
    .getByLabel("Password", { exact: true })
    .fill(
      internal
        ? process.env.INTERNAL_DEMO_PASSWORD || "InternalDemo!2026"
        : process.env.DEALER_DEMO_PASSWORD || "DealerDemo!2026",
    );
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome to your workspace." }),
  ).toBeHidden();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}
export async function switchAccount(page: Page, internal: boolean) {
  if (!(await page.getByRole("button", { name: "Switch account" }).isVisible()))
    await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("button", { name: "Switch account" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome to your workspace." }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: internal ? /^Hyundai internal/ : /^Dealer consultant/,
    })
    .click();
  await page
    .getByLabel("Password", { exact: true })
    .fill(
      internal
        ? process.env.INTERNAL_DEMO_PASSWORD || "InternalDemo!2026"
        : process.env.DEALER_DEMO_PASSWORD || "DealerDemo!2026",
    );
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome to your workspace." }),
  ).toBeHidden();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}
