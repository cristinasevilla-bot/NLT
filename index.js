import express from "express";

const app = express();
app.use(express.json());

app.get("/", (req, res) => res.status(200).send("OK"));

/** ========= TELEGRAM ========= **/

// Telegram will POST updates here
app.post("/telegram", async (req, res) => {
  try {
    const update = req.body;

    // Acknowledge fast to Telegram
    res.sendStatus(200);

    const msg = update.message;
    if (!msg || !msg.chat || !msg.text) return;

    const chatId = msg.chat.id;
    const text = msg.text.trim();

    const chatId = msg.chat.id;
const text = msg.text.trim().toUpperCase();

let state = userState.get(chatId) || { dateISO: null, slotIndex: 0 };

if (["/START", "START", "MENU", "HOLA", "HI", "HELLO"].includes(text)) {
  await telegramSendMessage(chatId, "¡Hola! 😊 Escribe: RESERVAR o FAQ");
  return;
}

if (text === "FAQ") {
  await telegramSendMessage(chatId, "FAQ rápida:\n- HORARIOS\n- UBICACION\n- PRECIOS\n\nEscribe una opción o RESERVAR.");
  return;
}

if (["HORARIOS", "UBICACION", "PRECIOS"].includes(text)) {
  const answers = {
    HORARIOS: "Horarios: (pon aquí el texto real). ¿Quieres RESERVAR una visita?",
    UBICACION: "Ubicación: (pon aquí el texto real). ¿Quieres RESERVAR una visita?",
    PRECIOS: "Precios: (pon aquí el texto real). ¿Quieres RESERVAR una visita?"
  };
  await telegramSendMessage(chatId, answers[text]);
  return;
}

if (text === "RESERVAR") {
  const minDate = addBusinessDays(new Date(), 2); // L-V
  state.dateISO = toISODate(minDate);
  state.slotIndex = 0;
  userState.set(chatId, state);

  const slots = generateSlots(minDate);
  const pack = pick3(slots, state.slotIndex);

  await telegramSendMessage(
    chatId,
    `Perfecto ✅\nPrimera fecha disponible: ${prettyDate(minDate)}.\n\nOpciones (30 min):\n1) ${pack[0]}\n2) ${pack[1]}\n3) ${pack[2]}\n\nResponde con 1, 2 o 3.\nO escribe: OTRAS (mismo día) / OTRO DIA`
  );
  return;
}

if (text === "OTRAS") {
  if (!state.dateISO) {
    await telegramSendMessage(chatId, "Aún no has empezado. Escribe: RESERVAR");
    return;
  }
  const d = fromISODate(state.dateISO);
  const slots = generateSlots(d);

  state.slotIndex += 3;
  if (state.slotIndex >= slots.length) state.slotIndex = 0; // vuelve al inicio si se acaban
  userState.set(chatId, state);

  const pack = pick3(slots, state.slotIndex);
  await telegramSendMessage(
    chatId,
    `Más opciones para ${prettyDate(d)}:\n1) ${pack[0]}\n2) ${pack[1]}\n3) ${pack[2]}\n\nResponde 1, 2 o 3.\nO escribe: OTRO DIA`
  );
  return;
}

if (text === "OTRO DIA") {
  if (!state.dateISO) {
    await telegramSendMessage(chatId, "Aún no has empezado. Escribe: RESERVAR");
    return;
  }
  const d = fromISODate(state.dateISO);
  const next = addBusinessDays(d, 1); // siguiente laborable
  state.dateISO = toISODate(next);
  state.slotIndex = 0;
  userState.set(chatId, state);

  const slots = generateSlots(next);
  const pack = pick3(slots, 0);

  await telegramSendMessage(
    chatId,
    `Vale 👍 Siguiente día: ${prettyDate(next)}\n\nOpciones:\n1) ${pack[0]}\n2) ${pack[1]}\n3) ${pack[2]}\n\nResponde 1, 2 o 3.\nO escribe: OTRAS / OTRO DIA`
  );
  return;
}

// Elegir 1/2/3
if (["1", "2", "3"].includes(text)) {
  if (!state.dateISO) {
    await telegramSendMessage(chatId, "Primero escribe: RESERVAR");
    return;
  }
  const d = fromISODate(state.dateISO);
  const slots = generateSlots(d);
  const idx = state.slotIndex + (Number(text) - 1);
  const chosen = slots[idx];

  if (!chosen) {
    await telegramSendMessage(chatId, "Esa opción no está disponible. Escribe: OTRAS u OTRO DIA");
    return;
  }

  await telegramSendMessage(
    chatId,
    `Confirmo: Visita a recepción el ${prettyDate(d)} a las ${chosen} (30 min).\n\nResponde: CONFIRMAR o CAMBIAR`
  );
  // guardamos selección temporal
  userState.set(chatId, { ...state, pendingTime: chosen });
  return;
}

if (text === "CAMBIAR") {
  if (!state.dateISO) {
    await telegramSendMessage(chatId, "Escribe: RESERVAR");
    return;
  }
  await telegramSendMessage(chatId, "Ok. Escribe: OTRAS (mismo día) u OTRO DIA");
  return;
}

if (text === "CONFIRMAR") {
  const s = userState.get(chatId);
  if (!s?.dateISO || !s?.pendingTime) {
    await telegramSendMessage(chatId, "No tengo una selección pendiente. Escribe: RESERVAR");
    return;
  }
  const d = fromISODate(s.dateISO);
  await telegramSendMessage(chatId, `¡Listo! ✅ Reservado para ${prettyDate(d)} a las ${s.pendingTime}.\nSi necesitas cambiar: CAMBIAR`);
  // En V2 aquí creamos evento en Google Calendar
  userState.set(chatId, { dateISO: s.dateISO, slotIndex: 0 });
  return;
}

// fallback
await telegramSendMessage(chatId, "No te he entendido 😅 Escribe: RESERVAR o FAQ");

  } catch (e) {
    console.error("TELEGRAM ERROR:", e);
  }
});

async function telegramSendMessage(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Missing TELEGRAM_BOT_TOKEN env var");

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}
function isWeekend(d) {
  const day = d.getDay(); // 0 Sun ... 6 Sat
  return day === 0 || day === 6;
}

function addBusinessDays(date, businessDays) {
  const d = new Date(date);
  let added = 0;
  while (added < businessDays) {
    d.setDate(d.getDate() + 1);
    if (!isWeekend(d)) added++;
  }
  return d;
}

function toISODate(d) {
  // YYYY-MM-DD in local time
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function fromISODate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function prettyDate(d) {
  // Simple ES format: miércoles 12/02
  const days = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
  const dayName = days[d.getDay()];
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dayName} ${dd}/${mm}`;
}

function generateSlots(date) {
  // 30-min slots within: 10:30-12:00 and 17:00-20:00
  // We'll output times as HH:MM
  const slots = [];
  const ranges = [
    { start: "10:30", end: "12:00" },
    { start: "17:00", end: "20:00" }
  ];
  for (const r of ranges) {
    let t = toMinutes(r.start);
    const end = toMinutes(r.end);
    while (t + 30 <= end) {
      slots.push(fromMinutes(t));
      t += 30;
    }
  }
  return slots;
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function fromMinutes(mins) {
  const h = String(Math.floor(mins / 60)).padStart(2, "0");
  const m = String(mins % 60).padStart(2, "0");
  return `${h}:${m}`;
}

function pick3(arr, startIndex) {
  // always returns 3 strings (wrap-around)
  const out = [];
  for (let i = 0; i < 3; i++) {
    out.push(arr[(startIndex + i) % arr.length]);
  }
  return out;
}

/** ========= START ========= **/
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on ${PORT}`));
