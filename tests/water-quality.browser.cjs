"use strict";
// Run with node --test tests/water-quality.browser.cjs.
// OMAX_PLAYWRIGHT_PATH can point to an existing Playwright installation.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require(process.env.OMAX_PLAYWRIGHT_PATH || "playwright");

test("water quality: local date, validation, session rows and protected-data isolation", { timeout:45000 }, async t => {
  const root = path.resolve(__dirname, "..");
  const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const file = path.resolve(root, "." + pathname + (pathname.endsWith("/") ? "index.html" : ""));
    if (!file.startsWith(root + path.sep) || pathname.split("/").some(part => part.startsWith("."))){ res.writeHead(403).end(); return; }
    try {
      const content = await fs.readFile(file);
      res.writeHead(200, { "Content-Type":({ ".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".svg":"image/svg+xml" })[path.extname(file)] || "text/plain" }).end(content);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless:true, ...(process.platform === "win32" ? { channel:"msedge" } : {}) });
  t.after(() => browser.close());
  const context = await browser.newContext({ timezoneId:"America/Chicago", viewport:{ width:1280, height:900 } });
  // Fresh browser profile; never allow real Firebase or other external services.
  await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.fulfill({ status:200, contentType:"text/javascript", body:"" }));
  const page = await context.newPage(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.setDefaultTimeout(8000);
  // UTC is October 20; Chicago's local calendar date is still October 19.
  await page.clock.setFixedTime(new Date("2026-10-20T02:30:00Z"));
  await page.goto(origin + "/?devsafe=1");
  await page.waitForFunction(() => window.OMAXDevSafe?.active && window.__initialAdoptComplete);
  assert.equal(await page.evaluate(() => typeof firebase), "undefined");
  const form = page.locator("#waterQualityForm"), rows = page.locator("#waterQualityRows tr");
  assert.equal(await form.isVisible(), true);
  assert.equal(await page.locator("#waterQualityDate").inputValue(), "2026-10-19");
  assert.equal(await rows.count(), 0);
  const cloud = () => page.evaluate(() => readCurrentCloudStateReadOnly());
  const snapshot = () => page.evaluate(() => compactStateForStorage(snapshotState({ skipLocalFileCacheSync:true })));
  const beforeCloud = await cloud(), beforeState = await snapshot();
  await page.evaluate(() => {
    window.__waterQualityWrites = [];
    for (const name of ["saveCloudNow", "saveCloudDebounced"]){
      const original = window[name];
      window[name] = function(...args){ __waterQualityWrites.push(name); return original.apply(this, args); };
    }
    for (const [prototype, names] of [[Storage.prototype, ["setItem", "removeItem", "clear"]], [IDBObjectStore.prototype, ["put", "add", "delete", "clear"]]]){
      for (const name of names){
        const original = prototype[name];
        prototype[name] = function(...args){ __waterQualityWrites.push(name); return original.apply(this, args); };
      }
    }
  });
  const fill = async ({ date="2026-10-19", ppm="125.5", result="Pass", initials="RY" } = {}) => {
    await page.locator("#waterQualityDate").fill(date);
    await page.locator("#waterQualityPPM").fill(ppm);
    await page.locator("#waterQualityResult").selectOption(result);
    await page.locator("#waterQualityInitials").fill(initials);
  };
  const submit = () => form.locator('button[type="submit"]').click();
  for (const invalid of [{ date:"" }, { ppm:"" }, { result:"" }, { initials:"" }, { initials:"   " }]){
    await fill(invalid);
    await submit();
    assert.equal(await form.evaluate(element => element.checkValidity()), false);
    assert.equal(await rows.count(), 0);
  }
  for (const [id, value] of [["waterQualityDate", "2026-02-30"], ["waterQualityPPM", "NaN"], ["waterQualityPPM", "Infinity"]]){
    await fill();
    await page.locator("#" + id).evaluate((input, value) => { input.value = value; }, value);
    await submit();
    assert.equal(await rows.count(), 0, `reject ${value}`);
  }
  await fill({ date:"2026-10-18", initials:" RY " });
  await submit();
  assert.equal(await rows.count(), 1);
  assert.deepEqual(await rows.first().locator("td").allTextContents(), ["2026-10-18", "125.5", "Pass", "RY"]);
  assert.equal(await page.locator("#waterQualityPPM").inputValue(), "");
  assert.equal(await page.locator("#waterQualityResult").inputValue(), "");
  assert.equal(await page.locator("#waterQualityInitials").inputValue(), " RY ");
  await fill({ ppm:"0", result:"Fail", initials:"AB" });
  await submit();
  assert.equal(await rows.count(), 2);
  assert.deepEqual(await rows.first().locator("td").allTextContents(), ["2026-10-19", "0", "Fail", "AB"]);
  await fill({ ppm:"999999", result:"Pass", initials:"<b>RY</b>" });
  await submit();
  assert.equal(await rows.count(), 3); // Result stays manual, independent of PPM.
  assert.equal(await rows.first().locator("td").last().textContent(), "<b>RY</b>");
  assert.equal(await rows.locator("b").count(), 0);
  for (const [label, className] of [["Pass", "status-approved"], ["Fail", "status-denied"]]){
    const badge = rows.locator("." + className).first();
    assert.equal(await badge.isVisible(), true);
    assert.equal(await badge.textContent(), label);
    const contrast = await badge.evaluate(element => {
      const luminance = color => {
        const rgb = color.match(/[\d.]+/g).slice(0, 3).map(value => {
          const channel = Number(value) / 255;
          return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
        });
        return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
      };
      const style = getComputedStyle(element), a = luminance(style.color), b = luminance(style.backgroundColor);
      return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    });
    assert.ok(contrast >= 4.5, `${label} contrast ${contrast}`);
  }
  assert.deepEqual(await page.evaluate(() => __waterQualityWrites), []);
  assert.deepEqual(await cloud(), beforeCloud);
  assert.deepEqual(await snapshot(), beforeState);
  if (process.env.OMAX_WQ_SCREENSHOT) await page.locator(".water-quality-block").screenshot({ path:process.env.OMAX_WQ_SCREENSHOT });
  // Exercise surrounding dashboard controls without changing protected records.
  const range = await page.locator("#calendarRangeLabel").textContent();
  await page.locator("#calendarNextMonthBtn").click();
  assert.notEqual(await page.locator("#calendarRangeLabel").textContent(), range);
  await page.locator("#calendarPrevMonthBtn").click();
  assert.equal(await page.locator("#calendarRangeLabel").textContent(), range);
  await page.locator("#tab-tolerance").click();
  await page.waitForFunction(() => !document.getElementById("waterQualityForm"));
  await page.locator("#tab-dashboard").click();
  await form.waitFor();
  assert.equal(await rows.count(), 3);
  await page.setViewportSize({ width:390, height:844 });
  assert.equal(await form.isVisible(), true);
  assert.equal(await form.evaluate(element => element.getBoundingClientRect().right <= innerWidth), true);
  await page.reload();
  await form.waitFor();
  assert.equal(await rows.count(), 0);
  assert.equal(await page.locator("#waterQualityDate").inputValue(), "2026-10-19");
  assert.deepEqual(await cloud(), beforeCloud);
  assert.deepEqual(errors, []);
});
