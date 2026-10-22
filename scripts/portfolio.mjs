// Скріншоти та відео для портфоліо. Потрібні: запущений `npm run dev`, локальний Supabase і свіжий `npm run seed`.
// Запуск: node --env-file=.env.local scripts/portfolio.mjs [вихідна_папка]
import { chromium, devices } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const BASE = process.env.PORTFOLIO_BASE_URL ?? "http://localhost:3000";
const OUT = process.argv[2] ?? "portfolio";
const PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD;
mkdirSync(OUT, { recursive: true });

const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: live } = await service.from("auctions").select("id").ilike("title", "Труби другого сорту%").order("created_at", { ascending: false }).limit(1).single();
const { data: upcoming } = await service.from("auctions").select("id").ilike("title", "Обсадні%").limit(1).single();

async function apiUser(email) {
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return { c, id: data.user.id };
}

async function loginAs(page, label) {
  await page.goto(BASE);
  await page.getByRole("button", { name: /Вхід \/ Реєстрація|Log in \/ Sign up/ }).click();
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.waitForURL(BASE + "/");
  await page.getByRole("button", { name: /Вийти|Log out/ }).waitFor();
}

const settle = (page, ms = 1500) => page.waitForTimeout(ms);
const shot = (page, name, fullPage = false) => page.screenshot({ path: join(OUT, name), fullPage });

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "chrome" }); // системний Chrome, окремий чистий профіль

// ---------- скріншоти (десктоп) ----------
if (!process.env.ONLY_VIDEO) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: "uk-UA", timezoneId: "Europe/Kyiv" });
  const page = await ctx.newPage();
  await loginAs(page, "Покупець 1");
  await settle(page);
  await shot(page, "01_список_торгів.png");

  await page.goto(`${BASE}/auction/${live.id}`);
  await settle(page, 2500);
  await shot(page, "02_сторінка_торгів.png", true);

  const outbidRow = page.locator("tr", { hasText: "Вас перебили" }).first();
  if (await outbidRow.count()) {
    await outbidRow.getByRole("button").click();
    await page.getByText("Ставку прийнято").waitFor();
    await settle(page, 400);
    await shot(page, "03_ставку_прийнято.png");
  }

  await page.getByRole("button", { name: "Вийти" }).click();
  await page.waitForTimeout(1000);
  await loginAs(page, "Адміністратор");
  await page.goto(`${BASE}/admin`);
  await settle(page);
  await shot(page, "04_адмінка_список.png");
  await page.goto(`${BASE}/admin/auctions/${live.id}/log`);
  await settle(page);
  await shot(page, "05_підсумки_і_лог_ставок.png", true);
  await page.goto(`${BASE}/admin/auctions/${upcoming.id}`);
  await settle(page);
  await shot(page, "06_форма_торгів.png", true);

  await ctx.addCookies([{ name: "lang", value: "en", url: BASE }]);
  await page.goto(`${BASE}/auction/${live.id}`);
  await settle(page, 2000);
  await shot(page, "07_english_version.png");
  await ctx.close();
}

// ---------- мобільна версія ----------
if (!process.env.ONLY_VIDEO) {
  const ctx = await browser.newContext({ ...devices["iPhone 14"], locale: "uk-UA", timezoneId: "Europe/Kyiv" });
  const page = await ctx.newPage();
  await loginAs(page, "Покупець 1");
  await page.goto(`${BASE}/auction/${live.id}`);
  await settle(page, 2500);
  await shot(page, "08_мобільна_версія.png");
  await ctx.close();
}

// ---------- відео: ставки в реальному часі ----------
{
  const b1 = await apiUser("buyer1@demo.local");
  const b2 = await apiUser("buyer2@demo.local");
  await b1.c.rpc("place_bulk_bid", { p_auction_id: live.id }); // старт: покупець 1 лідирує на всіх лотах
  const lotsByPos = async () => {
    const { data } = await b2.c.from("lots").select("*").eq("auction_id", live.id).order("position");
    return data;
  };
  const b2bid = async (pos) => {
    const l = (await lotsByPos()).find((x) => x.position === pos);
    await b2.c.rpc("place_bid", { p_lot_id: l.id, p_amount: Number(l.current_price) + 50 });
  };

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: "uk-UA", timezoneId: "Europe/Kyiv" });
  const page = await ctx.newPage();
  await loginAs(page, "Покупець 1");
  await page.goto(`${BASE}/auction/${live.id}`);
  await page.getByRole("button", { name: "Ставка на всі лоти" }).waitFor();
  await page.waitForTimeout(1500); // після гідрації, інакше прокрутку скидає
  // Кадр screencast у headless Chrome нижчий за viewport (~632 px), тож кнопку ставимо в межі кадру.
  // Тільки для відео: запас для прокрутки і сповіщення вище за нижню смугу, яку screencast обрізає.
  await page.addStyleTag({ content: "body{padding-bottom:320px} [aria-live=polite]{bottom:120px!important}" });
  await page.getByRole("button", { name: "Ставка на всі лоти" }).evaluate((el) => window.scrollBy(0, el.getBoundingClientRect().bottom - 560));

  // Запис кадрів через DevTools-протокол Chrome; відео потім збирає системний ffmpeg.
  const FRAMES = join(OUT, ".frames");
  rmSync(FRAMES, { recursive: true, force: true });
  mkdirSync(FRAMES);
  const frames = [];
  const cdp = await ctx.newCDPSession(page);
  cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
    const file = join(FRAMES, `${String(frames.length).padStart(5, "0")}.jpg`);
    writeFileSync(file, Buffer.from(data, "base64"));
    frames.push({ file, t: metadata.timestamp });
    await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: 1280, maxHeight: 720 });
  await page.waitForTimeout(300);

  // Підпис поверх сторінки — тільки для відео, у застосунку його немає.
  const caption = (text) => page.evaluate((t) => {
    let el = document.getElementById("demo-caption");
    if (!el) {
      el = Object.assign(document.createElement("div"), { id: "demo-caption" });
      el.style.cssText = "position:fixed;left:20px;top:16px;z-index:9999;max-width:560px;padding:12px 16px;border-radius:10px;background:#0f172a;color:#fff;font:600 16px Inter,system-ui;box-shadow:0 10px 30px rgba(0,0,0,.3)";
      document.body.appendChild(el);
    }
    el.textContent = t;
  }, text);

  await caption("Покупець 1 лідирує на всіх лотах");
  await page.waitForTimeout(2500);
  await caption("Покупець 2 перебиває лот 2 з іншого пристрою…");
  await b2bid(2);
  await page.waitForTimeout(2500);
  await caption("Ціна й статус оновились без перезавантаження. Відповідаємо ставкою «+ крок»");
  await page.waitForTimeout(1200);
  await page.locator("tr", { hasText: "2. Труба" }).getByRole("button").click();
  await page.waitForTimeout(2500);
  await caption("Покупець 2 перебиває ще два лоти…");
  await b2bid(3);
  await page.waitForTimeout(900);
  await b2bid(4);
  await page.waitForTimeout(2500);
  await caption("«Ставка на всі лоти»: одна транзакція — або всі ставки, або жодної");
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Ставка на всі лоти" }).click();
  await page.waitForTimeout(3000);
  await caption("Знову лідер на всіх лотах — без жодного перезавантаження сторінки");
  await page.waitForTimeout(3000);

  await cdp.send("Page.stopScreencast");
  await ctx.close();

  // Кадри приходять лише при змінах на екрані — тривалість кожного беремо з часових міток.
  const list = frames.map((f, i) => {
    const dur = i < frames.length - 1 ? frames[i + 1].t - f.t : 1;
    return `file '${f.file.replaceAll("'", "'\\''")}'\nduration ${Math.max(dur, 0.01).toFixed(3)}`;
  });
  list.push(`file '${frames.at(-1).file.replaceAll("'", "'\\''")}'`);
  const listFile = join(FRAMES, "list.txt");
  writeFileSync(listFile, list.join("\n"));
  const mp4 = join(OUT, "realtime_demo.mp4");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listFile,
    "-vf", "fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p", "-c:v", "libx264", "-crf", "20", "-movflags", "+faststart", mp4]);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", mp4, "-vf",
    "fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer",
    join(OUT, "realtime_demo.gif")]);
  rmSync(FRAMES, { recursive: true, force: true });
  console.log(`Відео: ${frames.length} кадрів → realtime_demo.mp4 + .gif`);
}

await browser.close();
console.log("Готово:", OUT);
