import type { Browser, Page } from "playwright";

/**
 * Countable, checkable details about a homepage. These are what make a cold email
 * specific ("the menu has 23 links") instead of generic ("improve your navigation").
 */
export interface SiteFacts {
  headline: string | null;
  menuLinks: number;
  bookingLabels: string[];
  bookingPlatform: string | null;
  desktopBookingAboveFold: boolean;
  mobile: {
    bookingOnFirstScreen: boolean;
    phoneOnFirstScreen: boolean;
    /** Share of the first phone screen covered by a fixed popup, cookie notice or chat widget. */
    coveredShare: number;
    coveredBy: string | null;
  } | null;
}

const PLATFORMS: [RegExp, string][] = [
  [/splose/i, "Splose"],
  [/zanda|power-?diary/i, "Zanda (Power Diary)"],
  [/halaxy/i, "Halaxy"],
  [/cliniko/i, "Cliniko"],
  [/nookal/i, "Nookal"],
  [/coreplus/i, "Coreplus"],
  [/janeapp|\.jane\.app/i, "Jane"],
  [/healthengine/i, "HealthEngine"],
  [/hotdoc/i, "HotDoc"],
  [/calendly/i, "Calendly"],
  [/acuityscheduling/i, "Acuity"],
  [/simplepractice/i, "SimplePractice"],
  [/practicebetter/i, "Practice Better"],
  [/setmore/i, "Setmore"],
];

/**
 * Some TypeScript runners (tsx, esbuild with keepNames) wrap functions in a __name() helper.
 * Code passed to page.evaluate runs in the browser, where that helper does not exist.
 */
export const NAME_SHIM = "globalThis.__name = globalThis.__name || ((fn) => fn);";

const BOOKING_WORDS = "book|appointment|schedule|consult|reach out|get in touch|enquire|enquiry|contact us|get started|start here|make a time";

/** Reads desktop facts from a page that is already loaded at 1280px. */
export async function desktopFacts(page: Page): Promise<Omit<SiteFacts, "mobile" | "bookingPlatform"> & { urls: string[] }> {
  await page.evaluate(NAME_SHIM);
  return page.evaluate((words) => {
    const pattern = new RegExp(words, "i");
    const visible = (el: Element) => {
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const menu = new Set(
      Array.from(document.querySelectorAll("header a, nav a"))
        .map((a) => (a as HTMLElement).innerText.trim().toLowerCase())
        .filter((text) => text && text.length < 40),
    );
    const actions = Array.from(document.querySelectorAll("a, button")).filter((el) => {
      const text = (el as HTMLElement).innerText.trim();
      return text && text.length < 40 && pattern.test(text) && visible(el);
    });
    const labels: string[] = [];
    for (const el of actions) {
      const text = (el as HTMLElement).innerText.trim().replace(/\s+/g, " ");
      if (!labels.some((label) => label.toLowerCase() === text.toLowerCase())) labels.push(text);
    }
    const urls = [
      ...Array.from(document.querySelectorAll("a[href]")).map((a) => (a as HTMLAnchorElement).href),
      ...Array.from(document.querySelectorAll("iframe[src], script[src]")).map((el) => el.getAttribute("src") ?? ""),
    ];
    return {
      headline: (document.querySelector("h1") as HTMLElement | null)?.innerText.trim().slice(0, 160) || null,
      menuLinks: menu.size,
      bookingLabels: labels.slice(0, 6),
      desktopBookingAboveFold: actions.some((el) => el.getBoundingClientRect().top < 900),
      urls,
    };
  }, BOOKING_WORDS);
}

export function detectPlatform(urls: string[]): string | null {
  for (const [pattern, name] of PLATFORMS) {
    if (urls.some((url) => pattern.test(url))) return name;
  }
  return null;
}

/** Loads the page as a phone and checks what the first screen offers. */
export async function mobileFacts(browser: Browser, url: string): Promise<SiteFacts["mobile"]> {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    ignoreHTTPSErrors: true,
  });
  await context.addInitScript(NAME_SHIM);
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.waitForTimeout(2500);
    return await page.evaluate((words) => {
      const pattern = new RegExp(words, "i");
      const height = window.innerHeight;
      const width = window.innerWidth;
      const onScreen = (el: Element) => {
        const box = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return (
          box.width > 0 &&
          box.height > 0 &&
          box.top < height &&
          box.bottom > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          Number(style.opacity) > 0.1
        );
      };
      const bookingOnFirstScreen = Array.from(document.querySelectorAll("a, button")).some((el) => {
        const text = (el as HTMLElement).innerText.trim();
        return text.length < 40 && pattern.test(text) && onScreen(el);
      });
      const phoneOnFirstScreen = Array.from(document.querySelectorAll("a[href^='tel:']")).some(onScreen);

      // Sample what is actually on top across the screen. A fixed layer only counts when it
      // sits above the content and paints something; fixed backgrounds and header bars do not.
      const overlayOf = (el: Element | null): HTMLElement | null => {
        for (let node = el; node && node !== document.body; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (style.position !== "fixed") continue;
          const box = node.getBoundingClientRect();
          if (box.top <= 1 && box.height < 120) return null;
          const painted =
            !/rgba\(\d+, \d+, \d+, 0\)|transparent/.test(style.backgroundColor) || style.backgroundImage !== "none";
          return painted ? (node as HTMLElement) : null;
        }
        return null;
      };
      const counts = new Map<HTMLElement, number>();
      let samples = 0;
      for (let y = 0.15; y < 1; y += 0.14) {
        for (let x = 0.1; x < 1; x += 0.2) {
          samples += 1;
          const overlay = overlayOf(document.elementFromPoint(width * x, height * y));
          if (overlay) counts.set(overlay, (counts.get(overlay) ?? 0) + 1);
        }
      }
      let covered = 0;
      let coveredBy: string | null = null;
      for (const [el, hits] of counts) {
        const share = hits / samples;
        if (share <= covered) continue;
        covered = share;
        const hint = `${el.id} ${typeof el.className === "string" ? el.className : ""} ${el.innerText.slice(0, 160)}`.toLowerCase();
        coveredBy = /cookie|consent|privacy/.test(hint)
          ? "a cookie notice"
          : /chat|message us|help\?/.test(hint)
            ? "a chat widget"
            : /subscribe|newsletter|sign up|offer|discount/.test(hint)
              ? "a sign-up popup"
              : "a popup";
      }
      return {
        bookingOnFirstScreen,
        phoneOnFirstScreen,
        coveredShare: Math.round(covered * 100) / 100,
        coveredBy: covered >= 0.25 ? coveredBy : null,
      };
    }, BOOKING_WORDS);
  } catch {
    return null;
  } finally {
    await context.close();
  }
}

/** Plain lines for a model prompt. Only states what was measured. */
export function describeFacts(facts: SiteFacts | null | undefined): string {
  if (!facts) return "No measured site facts.";
  const lines: string[] = [];
  if (facts.headline) lines.push(`Homepage headline: "${facts.headline}"`);
  if (facts.menuLinks >= 12) lines.push(`The menu has ${facts.menuLinks} links.`);
  if (facts.bookingLabels.length >= 3) {
    lines.push(
      `Booking-type buttons use ${facts.bookingLabels.length} different labels: ${facts.bookingLabels.map((label) => `"${label}"`).join(", ")}.`,
    );
  }
  if (facts.bookingPlatform) lines.push(`Online booking runs on ${facts.bookingPlatform}. A redesign can keep it exactly as it is.`);
  else lines.push("No online booking platform was detected. Booking may be by form or phone only.");
  if (!facts.desktopBookingAboveFold) lines.push("On desktop there is no booking button on the first screen.");
  if (facts.mobile) {
    if (!facts.mobile.bookingOnFirstScreen && !facts.mobile.phoneOnFirstScreen) {
      lines.push("On a phone, the first screen has no way to book or call.");
    } else if (!facts.mobile.bookingOnFirstScreen) {
      lines.push("On a phone, the first screen has no booking button.");
    }
    if (facts.mobile.coveredBy) {
      lines.push(
        `On a phone, ${facts.mobile.coveredBy} covers about ${Math.round(facts.mobile.coveredShare * 100)}% of the first screen.`,
      );
    }
  }
  return lines.map((line) => `- ${line}`).join("\n");
}
