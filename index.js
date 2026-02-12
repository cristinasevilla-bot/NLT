import express from "express";

const app = express();
app.use(express.json());

app.get("/", (req, res) => res.status(200).send("OK"));

// Verificación del webhook de Meta (GET)
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.META_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Mensajes entrantes (POST)
app.post("/webhook", (req, res) => {
  console.log("INCOMING:", JSON.stringify(req.body, null, 2));
  return res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on ${PORT}`));
