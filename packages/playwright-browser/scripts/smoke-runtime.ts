import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";

import { chromium } from "playwright-core";

const runtime = await readFile(
  resolve(import.meta.dirname, "../src/generated/injectedScript.js"),
  "utf8"
);
const fixture = `<!doctype html>
<div class="list"><button class="item">First</button><button class="item" hidden>Hidden</button><button class="item">Last</button></div>
<script type="module" src="/runtime.js"></script>
<script type="module">
  const runtime = new globalThis.AymePlaywrightRuntime.InjectedScript(window, {
    browserName: "chromium", customEngines: [], frameSeq: 1, isUnderTest: false,
    sdkLanguage: "javascript", stableRafCount: 2, testIdAttributeName: "data-testid",
  });
  const last = document.querySelector(".item:last-child");
  const generated = runtime.generateSelector(last, { testIdAttributeName: "data-testid" });
  const generatedMatches = runtime.querySelectorAll(runtime.parseSelector(generated.selector), document).length;
  const chainedMatches = runtime.querySelectorAll(runtime.parseSelector("css=.list >> css=.item"), document).length;
  const negativeNth = runtime.querySelectorAll(runtime.parseSelector("css=.item >> nth=-1"), document)[0]?.textContent;
  const visible = runtime.elementState(document.querySelector(".item"), "visible").matches;
  const hidden = runtime.elementState(document.querySelector("[hidden]"), "hidden").matches;
  const aria = runtime.ariaSnapshot(document.body, { mode: "ai" });
  let dynamicSourceDisabled = false;
  try {
    new globalThis.AymePlaywrightRuntime.InjectedScript(window, {
      browserName: "chromium",
      customEngines: [{ name: "custom", source: "({ queryAll: () => [] })" }],
      frameSeq: 1, isUnderTest: false, sdkLanguage: "javascript",
      stableRafCount: 2, testIdAttributeName: "data-testid",
    });
  } catch (error) {
    dynamicSourceDisabled = error instanceof Error && error.message === "Dynamic source execution is disabled in this browser runtime.";
  }
  document.body.dataset.result = JSON.stringify({ aria, chainedMatches, dynamicSourceDisabled, generatedMatches, hidden, negativeNth, visible });
</script>`;
const server = createServer((request, response) => {
  response.writeHead(200, {
    "content-type":
      request.url === "/runtime.js" ? "text/javascript" : "text/html",
  });
  response.end(request.url === "/runtime.js" ? runtime : fixture);
});

await new Promise<void>((start) => server.listen(0, "127.0.0.1", start));
const address = server.address();
if (!address || typeof address === "string")
  throw new Error("No local smoke server address.");
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;

try {
  browser = await chromium.launch({ headless: true, timeout: 10_000 });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${address.port}`, {
    timeout: 10_000,
    waitUntil: "domcontentloaded",
  });
  await page.locator("body[data-result]").waitFor({ timeout: 10_000 });
  const result = JSON.parse(
    (await page.locator("body").getAttribute("data-result")) ?? "{}"
  ) as {
    aria: string;
    chainedMatches: number;
    dynamicSourceDisabled: boolean;
    generatedMatches: number;
    hidden: boolean;
    negativeNth: string;
    visible: boolean;
  };
  if (
    result.chainedMatches !== 3 ||
    result.dynamicSourceDisabled !== true ||
    result.generatedMatches !== 1 ||
    result.hidden !== true ||
    result.negativeNth !== "Last" ||
    result.visible !== true ||
    !result.aria.includes("button")
  )
    throw new Error(
      `Unexpected generated-runtime smoke result: ${JSON.stringify(result)}`
    );
  console.log(
    "Chromium smoke passed: selectors, state, ARIA, and fail-closed dynamic source."
  );
} finally {
  await browser?.close();
  await new Promise<void>((stop) => server.close(() => stop()));
}
