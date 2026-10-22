// Демо-дані: акаунти для швидкого входу і торги в різних станах.
// Запуск: npm run seed   (повторний запуск видаляє старі торги й створює свіжі — так демо «оновлюється»)
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.NEXT_PUBLIC_DEMO_PASSWORD;
if (!url || !serviceKey || !password) {
  console.error("Заповніть у .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_DEMO_PASSWORD");
  process.exit(1);
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } });

const USERS = [
  { email: "admin@demo.local", company: "СталеТрейд (демо-продавець)", contact_name: "Олена Адмін", phone: "+380000000001", role: "admin" },
  { email: "buyer1@demo.local", company: "ТОВ «Метал Плюс»", contact_name: "Андрій Коваль", phone: "+380000000002", role: "buyer" },
  { email: "buyer2@demo.local", company: "Pipe Trading GmbH", contact_name: "Anna Weber", phone: "+490000000003", role: "buyer" },
];

async function ensureUser(u) {
  const { data: list } = await db.auth.admin.listUsers({ perPage: 1000 });
  let user = list.users.find((x) => x.email === u.email);
  if (!user) {
    const { data, error } = await db.auth.admin.createUser({
      email: u.email, password, email_confirm: true,
      user_metadata: { company: u.company, contact_name: u.contact_name, phone: u.phone },
    });
    if (error) throw error;
    user = data.user;
  } else {
    await db.auth.admin.updateUserById(user.id, { password });
  }
  const { error } = await db.from("profiles")
    .update({ company: u.company, contact_name: u.contact_name, phone: u.phone, role: u.role }).eq("id", user.id);
  if (error) throw error;
  return user.id;
}

const H = 3600_000;
const at = (ms) => new Date(Date.now() + ms).toISOString();
const PIPES = [
  { name: "Труба 159×6", size: "159×6 мм", steel_grade: "Ст20", volume: "42 т", defects: "Поверхнева корозія до 5%" },
  { name: "Труба 219×8", size: "219×8 мм", steel_grade: "09Г2С", volume: "35 т", defects: "Овальність кінців" },
  { name: "Труба 325×10", size: "325×10 мм", steel_grade: "Ст20", volume: "28 т", defects: "Відхилення довжини ±0,5 м" },
  { name: "Труба 426×12", size: "426×12 мм", steel_grade: "17Г1С", volume: "19 т", defects: "Сліди ізоляції" },
];

async function createAuction(adminId, a, lots) {
  const { data, error } = await db.from("auctions").insert({ ...a, created_by: adminId }).select().single();
  if (error) throw error;
  const { data: rows, error: e2 } = await db.from("lots")
    .insert(lots.map((l, i) => ({ ...l, auction_id: data.id, position: i + 1 }))).select().order("position");
  if (e2) throw e2;
  return { auction: data, lots: rows };
}

// Історія ставок напряму (service role): ті самі поля, що заповнює place_bid.
async function addBids(auction, lots, buyers, rounds) {
  let t = new Date(auction.starts_at).getTime() + 10 * 60_000;
  for (let r = 0; r < rounds; r++) {
    for (const lot of lots) {
      if ((r + lot.position) % 3 === 0) continue; // не всі лоти однаково «гарячі»
      const user = buyers[(r + lot.position) % buyers.length];
      const amount = lot.current_price == null ? Number(lot.start_price) : Number(lot.current_price) + Number(auction.step);
      t += 7 * 60_000;
      const { error } = await db.from("bids").insert({ auction_id: auction.id, lot_id: lot.id, user_id: user, amount, created_at: new Date(t).toISOString() });
      if (error) throw error;
      lot.current_price = amount; lot.leader_id = user; lot.bid_count = (lot.bid_count ?? 0) + 1;
    }
  }
  for (const lot of lots) {
    await db.from("lots").update({ current_price: lot.current_price, leader_id: lot.leader_id, bid_count: lot.bid_count ?? 0 }).eq("id", lot.id);
  }
}

const [adminId, b1, b2] = [await ensureUser(USERS[0]), await ensureUser(USERS[1]), await ensureUser(USERS[2])];
await db.from("auctions").delete().not("id", "is", null);

const live = await createAuction(adminId, {
  title: "Труби другого сорту, партія А-17 (склад Дніпро)",
  description: "Безшовні та електрозварні труби другого сорту після складського перерахунку. Огляд — за попереднім записом. Документи: сертифікати якості, специфікація у форматі Excel.",
  currency: "USD", delivery_type: "FCA Дніпро, самовивіз", starts_at: at(-2 * H), ends_at: at(26 * H),
  timezone: "Asia/Kolkata", step: 50, anti_snipe_minutes: 2,
}, PIPES.map((p, i) => ({ ...p, start_price: [24000, 31000, 27500, 21000][i] })));
await addBids(live.auction, live.lots, [b1, b2], 4);

await createAuction(adminId, {
  title: "Обсадні труби 2-го сорту, партія Б-03",
  description: "Партія відкривається завтра. Можна заздалегідь ознайомитися з лотами.",
  currency: "EUR", delivery_type: "DAP Варшава", starts_at: at(20 * H), ends_at: at(44 * H),
  timezone: "Europe/Warsaw", step: 100, anti_snipe_minutes: 2,
}, PIPES.slice(0, 3).map((p, i) => ({ ...p, start_price: [18000, 22500, 26000][i] })));

const ended = await createAuction(adminId, {
  title: "Труби великого діаметру, партія В-11 (завершено)",
  description: "Приклад завершених торгів: підсумки та лог ставок доступні в адмін-панелі.",
  currency: "USD", delivery_type: "FCA Одеса, порт", starts_at: at(-30 * H), ends_at: at(-6 * H),
  timezone: "Europe/Kyiv", step: 100, anti_snipe_minutes: 2,
}, PIPES.slice(1).map((p, i) => ({ ...p, start_price: [30000, 26000, 20000][i] })));
await addBids(ended.auction, ended.lots, [b1, b2], 5);

const priv = await createAuction(adminId, {
  title: "Закриті торги: залишки труб 108×4 для постійних партнерів",
  description: "Тільки для запрошених учасників. Посилання-запрошення — в адмін-панелі.",
  currency: "UAH", delivery_type: "Самовивіз, Київ", starts_at: at(-1 * H), ends_at: at(8 * H),
  timezone: "Europe/Kyiv", step: 1000, anti_snipe_minutes: 3, is_private: true,
}, [{ name: "Труба 108×4", size: "108×4 мм", steel_grade: "Ст10", volume: "12 т", defects: "Нерівномірний обріз", start_price: 380000 }]);
await db.from("auction_access").insert({ auction_id: priv.auction.id, user_id: b1 });

console.log("Готово: 3 демо-акаунти, 4 торгів. Запрошення на закриті торги: /join/" + priv.auction.invite_token);
