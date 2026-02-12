import express from "express";

// Node 18+ ya trae fetch. Si tu entorno fuera más viejo, habría que instalar node-fetch.
const app = express();
app.use(express.json());

// ====== PILOTO: estado en memoria (luego lo pasamos a BD) ======
const userState = new Map(); // key: chatId -> { dateISO, slotIndex, pendingTime }

// Health check
app.get("/", (req, res) => res.status(200).send("OK ✅"));

/** ========= TELEGRAM WEBHOOK ========= **/
app.post("/telegram", async (req, res) => {
  try {
    const update = req.body;

    // Responder rápido a Telegram
    res.sendStatus(200);

    const msg = update?.message;
    if (!msg?.chat?.id || !msg?.text) return;

    const chatId = msg.chat.id;
    const text = msg.text.trim().toUpperCase();

    let state = userState.get(chatId) || { dateISO: null, slotIndex: 0 };

    // ====== MENU / START ======
    if (["/START", "START", "MENU", "HOLA", "HI", "HELLO"].includes(text)) {
      await telegramSendMessage(chatId, "OK ✅ Estoy vivo.\nDime: RESERVAR o FAQ");
      return;
    }

    // ====== FAQ ======
    if (text === "FAQ") {
      await telegramSendMessage(
        chatId,
        "FAQ rápida:\n- HORARIOS\n- UBICACION\n- PRECIOS\n\nEscribe una opción o RESERVAR."
      );
      return;
    }

    if (["HORARIOS", "UBICACION", "PRECIOS"].includes(text)) {
      const answers = {
        HORARIOS:
          "Horarios de visitas:\n• 10:30–12:00\n• 17:00–20:00\n(Visitas de 30 min)\n\n¿Quieres RESERVAR una visita?",
        UBICACION: "Ubicación: (pon aquí el texto real)\n\n¿Quieres RESERVAR una visita?",
        PRECIOS: "Precios: (pon aquí el texto real)\n\n¿Quieres RESERVAR una visita?"
      };
      await telegramSendMessage(chatId, answers[text]);
      return;
    }

    // ====== RESERVAR ======
    if (text === "RESERVAR") {
      const minDate = addBusinessDays(new Date(), 2); // +2 laborables (L-V)

      state = { dateISO: toISODate(minDate), slotIndex: 0, pendingTime: null };
      userState.set(chatId, state);

      const slots = generateSlots(minDate);
      const pack = pick3(slots, 0);

      await telegramSendMessage(
        chatId,
        `Perfecto ✅\nPrimera fecha posible: ${prettyDate(minDate)}.\n\nOpciones (30 min):\n1) ${pack[0]}\n2) ${pack[1]}\n3) ${pack[2]}\n\nResponde con 1, 2 o 3.\nO escribe: OTRAS (mismo día) / OTRO DIA`
      );
      return;
    }

    // ====== OTRAS (mismo día) ======
    if (text === "OTRAS") {
      if (!state?.dateISO) {
        await telegramSendMessage(chatId, "Aún no has empezado. Escribe: RESERVAR");
        return;
      }

      const d = fromISODate(state.dateISO);
      const slots = generateSlots(d);

      const nextSlotIndex = (state.slotIndex + 3) % slots.length;
      state = { ...state, slotIndex: nextSlotIndex, pendingTime: null };
      userState.set(chatId, state);

      const pack = pick3(slots, nextSlotIndex);

      await telegramSendMessage(
        chatId,
        `Más opciones para ${prettyDate(d)}:\n1) ${pack[0]}\n2) ${pack[1]}\n3) ${pack[2]}\n\nResponde 1, 2 o 3.\nO escribe: OTRO DIA`
      );
      return;
    }

    // ====== OTRO DIA ======
    if (text === "OTRO DIA" || text === "OTRO DÍA") {
      if (!state?.dateISO) {
        await telegramSendMessage(chatId, "Aún no has empezado. Escribe: RESERVAR");
        return;
      }

      const current = fromISODate(state.dateISO);
      const next = addBusinessDays(current, 1); // siguiente laborable

      state = { dateISO: toISODate(next), slotIndex: 0, pendingTime: null };
      userState.set(chatId, state);

      const slots = generateSlots(next);
      const pack = pick3(slots, 0);

      await telegramSendMessage(
        chatId,
        `Vale 👍 Siguiente día: ${prettyDate(next)}\n\nOpciones:\n1) ${pack[0]}\n2) ${pack[1]}\n3) ${pack[2]}\n\nResponde 1, 2 o 3.\nO escribe: OTRAS / OTRO DIA`
      );
      return;
    }

    // ====== Elegir 1/2/3 ======
    if (["1", "2", "3"].includes(text)) {
      if (!state?.dateISO) {
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

      state = { ...state, pendingTime: chosen };
      userState.set(chatId, state);

      await telegramSendMessage(
        chatId,
        `Confirmo: Visita a recepción el ${prettyDate(d)} a las ${chosen} (30 min).\n\nResponde: CONFIRMAR o CAMBIAR`
      );
      return;
    }

    // ====== CAMBIAR ======
    if (text === "CAMBIAR") {
      if (!state?.dateISO) {
        await telegramSendMessage(chatId, "Escribe: RESERVAR");
        return;
      }
      await telegramSendMessage(chatId, "Ok. Escribe: OTRAS (mismo día) u OTRO DIA");
      return;
    }

    // ====== CONFIRMAR ======
    if (text === "CONFIRMAR") {
      const s = userState.get(chatId);
      if (!s?.dateISO || !s?.pendingTime) {
        await telegramSendMessage(chatId, "No tengo una selección pendiente. Escribe: RESERVAR");
        return;
      }

      const d = fromISODate(s.dateISO);

      await telegramSendMessage(
        chatId,
        `¡Listo! ✅ Reservado (demo) para ${prettyDate(d)} a las ${s.pendingTime}.\n\nSi necesitas cambiar: CAMBIAR`
      );

      // En V2: aquí crearíamos el evento en Google Calendar.
      userState.set(chatId, { dateISO: s.dateISO, slotIndex: 0, pendingTime: null });
      return;
    }

    // ====== Fallback ======
    await telegramSendMessage(chatId, "No te he entendido 😅 Escribe: RESERVAR o FAQ");
  } catch (e) {
    console.error("TELEGRAM ERROR:", e);
    // Ojo: ya respondimos 200 arriba; aquí solo log.
  }
});

/** ========= SEND MESSAGE ========= **/
async function telegramSendMessage(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Missing TELEGRAM_BOT_TOKEN env var");

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Telegram sendMessage failed: ${resp.status} ${body}`);
  }
}

/** ========= DATE/TIME HELPERS ========= **/
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
  const days = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const dayName = days[d.getDay()];
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dayName} ${dd}/${mm}/${yyyy}`;
}

function generateSlots(_date) {
  // 30-min slots within: 10:30-12:00 and 17:00-20:00
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
  const out = [];
  for (let i = 0; i < 3; i++) out.push(arr[(startIndex + i) % arr.length]);
  return out;
}

/** ========= START ========= **/
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on ${PORT}`));
