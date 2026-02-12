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

    // Simple reply for MVP test
    let reply = "OK ✅ Estoy vivo. Dime: RESERVAR o FAQ";
    if (/^hola|hello|hi$/i.test(text)) reply = "¡Hola! 😊 ¿Quieres RESERVAR o ver FAQ?";
    if (/^faq$/i.test(text)) reply = "FAQ: Horarios / Ubicación / Precios. Escribe: HORARIOS, UBICACION o PRECIOS.";
    if (/^reservar$/i.test(text)) reply = "Perfecto. Primera fecha posible según reglas. (Luego metemos tu lógica de días/horas).";

    await telegramSendMessage(chatId, reply);
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

/** ========= START ========= **/
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on ${PORT}`));
