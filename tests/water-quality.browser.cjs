"use strict";
// Run with node --test tests/water-quality.browser.cjs.
// OMAX_PLAYWRIGHT_PATH can point to an existing Playwright installation.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require(process.env.OMAX_PLAYWRIGHT_PATH || "playwright");

test("water quality: local time, modal editing, refresh persistence and protected-data isolation", { timeout:60000 }, async t => {
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
  const key = "omax.waterQualityChecks.v1";
  const form = page.locator("#waterQualityForm"), modal = page.locator("#waterQualityModal");
  const editor = page.locator("#waterQualityEditForm"), rows = page.locator("#waterQualityRows tr");
  const entry = name => form.locator(`[name="${name}"]`);
  const field = name => editor.locator(`[name="${name}"]`);
  const stored = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
  const open = () => page.getByRole("button", { name:"View Water Quality Log", exact:true }).click();
  const close = () => page.getByRole("button", { name:"Close Water Quality Log", exact:true }).click();
  const fill = async (values = {}, target = form) => {
    const defaults = { date:"2026-10-19", time:"21:30", ppm:"125.5", softness:"Pass", initials:"RY", note:"" };
    for (const [name, value] of Object.entries({ ...defaults, ...values })){
      const input = target.locator(`[name="${name}"]`);
      if (name === "softness") await input.selectOption(value);
      else await input.fill(value);
    }
  };
  const submit = () => form.getByRole("button", { name:"Submit", exact:true }).click();
  assert.equal(await form.isVisible(), true);
  assert.equal(await entry("date").inputValue(), "2026-10-19");
  assert.equal(await entry("time").inputValue(), "21:30");
  assert.equal(await form.getByLabel("Water Softness").count(), 1);
  assert.equal(await modal.isHidden(), true);
  assert.equal(await page.locator(".water-quality-block table").count(), 0);
  const cloud = () => page.evaluate(() => readCurrentCloudStateReadOnly());
  const snapshot = () => page.evaluate(() => compactStateForStorage(snapshotState({ skipLocalFileCacheSync:true })));
  const beforeCloud = await cloud(), beforeState = await snapshot();
  await page.evaluate(() => {
    window.__waterQualityWrites = [];
    for (const name of ["saveCloudNow", "saveCloudDebounced"]){
      const original = window[name];
      window[name] = function(...args){ __waterQualityWrites.push([name]); return original.apply(this, args); };
    }
    for (const [prototype, names] of [[Storage.prototype, ["setItem", "removeItem", "clear"]], [IDBObjectStore.prototype, ["put", "add", "delete", "clear"]]]){
      for (const name of names){
        const original = prototype[name];
        prototype[name] = function(...args){ __waterQualityWrites.push([name, args[0]]); return original.apply(this, args); };
      }
    }
  });
  for (const invalid of [{ date:"" }, { time:"" }, { ppm:"" }, { softness:"" }, { initials:"" }, { initials:"   " }]){
    await fill(invalid); await submit();
    assert.equal(await form.evaluate(element => element.checkValidity()), false);
    assert.equal(await rows.count(), 0);
  }
  for (const [name, value] of [["date", "2026-02-30"], ["time", "25:00"], ["ppm", "NaN"], ["ppm", "Infinity"]]){
    await fill();
    await entry(name).evaluate((input, value) => { input.value = value; }, value);
    await submit(); assert.equal(await rows.count(), 0, `reject ${value}`);
  }
  assert.deepEqual(await page.evaluate(() => __waterQualityWrites), []);
  await fill({ date:"2026-10-18", time:"08:15", initials:" RY " }); await submit();
  assert.equal(await entry("ppm").inputValue(), "");
  assert.equal(await entry("softness").inputValue(), "");
  assert.equal(await entry("time").inputValue(), "21:30");
  await fill({ ppm:"0", softness:"Fail", initials:"AB", note:"Softener needs checking" }); await submit();
  await fill({ ppm:"999999", softness:"Pass", initials:"<b>RY</b>", note:"<b>Test note</b>" }); await submit();
  const initial = await stored();
  assert.equal(initial.length, 3);
  assert.equal(new Set(initial.map(check => check.id)).size, 3);
  assert.equal(initial[2].note, "");
  await open();
  assert.equal(await modal.isVisible(), true);
  assert.deepEqual(await modal.locator("th").allTextContents(), ["Date", "Time", "PPM", "Water Softness", "Initials", "Note", "Edit"]);
  assert.deepEqual(await rows.nth(2).locator("td").allTextContents(), ["2026-10-18", "08:15", "125.5", "Pass", "RY", "", "Edit"]);
  assert.equal(await rows.first().locator("td").nth(5).textContent(), "<b>Test note</b>");
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
  await rows.nth(1).getByRole("button", { name:"Edit", exact:true }).click();
  assert.equal(await field("date").inputValue(), initial[1].date);
  assert.equal(await field("time").inputValue(), initial[1].time);
  await fill({ note:"Discard this draft" }, editor);
  await editor.getByRole("button", { name:"Cancel", exact:true }).click();
  assert.deepEqual(await stored(), initial);
  await rows.nth(1).getByRole("button", { name:"Edit", exact:true }).click();
  await fill({ date:"2026-10-17", time:"07:05", ppm:"42.25", softness:"Pass", initials:"CD", note:"Rechecked water" }, editor);
  await editor.getByRole("button", { name:"Save", exact:true }).click();
  const edited = await stored();
  assert.deepEqual(edited[0], initial[0]); assert.deepEqual(edited[2], initial[2]);
  assert.deepEqual(edited[1], { id:initial[1].id, date:"2026-10-17", time:"07:05", ppm:42.25, softness:"Pass", initials:"CD", note:"Rechecked water" });
  assert.deepEqual(await rows.nth(1).locator("td").allTextContents(), ["2026-10-17", "07:05", "42.25", "Pass", "CD", "Rechecked water", "Edit"]);
  const writes = await page.evaluate(() => __waterQualityWrites);
  assert.equal(writes.length, 4);
  assert.ok(writes.every(([operation, storageKey]) => operation === "setItem" && storageKey === key));
  assert.deepEqual(await cloud(), beforeCloud); assert.deepEqual(await snapshot(), beforeState);
  // Failed edit/save and submit must leave storage and displayed saved rows intact.
  await page.evaluate(key => {
    window.__wqSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(name, value){
      if (name === key) throw new DOMException("Storage full", "QuotaExceededError");
      return __wqSetItem.call(this, name, value);
    };
  }, key);
  await rows.nth(1).getByRole("button", { name:"Edit", exact:true }).click();
  await field("note").fill("Unsaved edit");
  await editor.getByRole("button", { name:"Save", exact:true }).click();
  assert.equal(await editor.isVisible(), true);
  assert.match(await page.locator("#waterQualityLogStatus").textContent(), /Could not save/);
  assert.deepEqual(await stored(), edited);
  await editor.getByRole("button", { name:"Cancel", exact:true }).click();
  await close(); await fill({ note:"Unsaved new check" }); await submit();
  assert.match(await page.locator("#waterQualityStatus").textContent(), /Could not save/);
  assert.equal(await entry("note").inputValue(), "Unsaved new check");
  assert.deepEqual(await stored(), edited);
  await page.evaluate(() => { Storage.prototype.setItem = __wqSetItem; });
  const range = await page.locator("#calendarRangeLabel").textContent();
  await page.locator("#calendarNextMonthBtn").click();
  assert.notEqual(await page.locator("#calendarRangeLabel").textContent(), range);
  await page.locator("#calendarPrevMonthBtn").click();
  assert.equal(await page.locator("#calendarRangeLabel").textContent(), range);
  await page.locator("#calendarAddBtn").click();
  assert.equal(await page.locator("#dashboardAddModal").isVisible(), true);
  await page.locator("#dashboardModalClose").click();
  await page.locator("#tab-tolerance").click();
  await page.waitForFunction(() => !document.getElementById("waterQualityForm"));
  await page.locator("#tab-dashboard").click(); await form.waitFor();
  await open(); assert.equal(await rows.count(), 3);
  // Existing modal conventions: close button, Escape, backdrop, focus trap/return.
  await page.keyboard.press("Shift+Tab");
  assert.equal(await modal.locator(":focus").count(), 1);
  await page.keyboard.press("Escape"); assert.equal(await modal.isHidden(), true);
  assert.equal(await page.locator("#waterQualityViewLog").evaluate(element => element === document.activeElement), true);
  await open(); await modal.click({ position:{ x:2, y:2 } }); assert.equal(await modal.isHidden(), true);
  await page.setViewportSize({ width:390, height:844 });
  assert.equal(await form.evaluate(element => element.getBoundingClientRect().right <= innerWidth), true);
  await open();
  const layout = await modal.locator(".water-quality-table-wrap").evaluate(element => ({
    scrolls:element.scrollWidth > element.clientWidth,
    inside:element.getBoundingClientRect().right <= innerWidth,
    documentFits:document.documentElement.scrollWidth <= innerWidth
  }));
  assert.deepEqual(layout, { scrolls:true, inside:true, documentFits:true });
  await rows.nth(1).getByRole("button", { name:"Edit", exact:true }).click();
  assert.equal(await editor.isVisible(), true);
  assert.equal(await editor.evaluate(element => element.getBoundingClientRect().right <= innerWidth), true);
  assert.equal(await field("time").inputValue(), "07:05");
  if (process.env.OMAX_WQ_SCREENSHOT) await modal.screenshot({ path:process.env.OMAX_WQ_SCREENSHOT });
  await editor.getByRole("button", { name:"Cancel", exact:true }).click();
  await close(); await page.reload(); await form.waitFor(); await open();
  assert.equal(await rows.count(), 3); assert.deepEqual(await stored(), edited);
  assert.deepEqual(await rows.nth(1).locator("td").allTextContents(), ["2026-10-17", "07:05", "42.25", "Pass", "CD", "Rechecked water", "Edit"]);
  assert.deepEqual(await cloud(), beforeCloud);
  await close();
  // Malformed data is never overwritten by rendering or by a new submission.
  for (const corrupt of ["not-json", '{"unexpected":true}', '[{"id":"invalid"}]']){
    await page.evaluate(({ key, corrupt }) => localStorage.setItem(key, corrupt), { key, corrupt });
    await page.reload(); await form.waitFor();
    assert.match(await page.locator("#waterQualityStatus").textContent(), /Could not read/);
    await fill(); await submit();
    assert.match(await page.locator("#waterQualityStatus").textContent(), /Could not save/);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), key), corrupt);
  }
  // Browser security settings can make even getItem throw; other storage stays usable.
  await page.evaluate(({ key, edited }) => localStorage.setItem(key, JSON.stringify(edited)), { key, edited });
  await page.addInitScript(key => {
    const getItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function(name){
      if (String(name).endsWith(key)) throw new DOMException("Unavailable", "SecurityError");
      return getItem.call(this, name);
    };
  }, key);
  await page.reload(); await form.waitFor();
  assert.match(await page.locator("#waterQualityStatus").textContent(), /Could not read/);
  await fill(); await submit();
  assert.match(await page.locator("#waterQualityStatus").textContent(), /Could not save/);
  assert.equal(await entry("ppm").inputValue(), "125.5");
  assert.deepEqual(await cloud(), beforeCloud);
  assert.deepEqual(errors, []);
});
