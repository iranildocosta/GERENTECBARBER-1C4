const express = require("express");
const axios = require("axios");
const dayjs = require("dayjs");
const { Low, JSONFile } = require("lowdb");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(express.json());

// 🔐 CONFIGURE AQUI
const TOKEN = "SEU_TOKEN";
const INSTANCE = "SUA_INSTANCIA";

// 🗄️ Banco simples (arquivo JSON)
const adapter = new JSONFile("db.json");
const db = new Low(adapter);

async function initDB() {
  await db.read();
  db.data ||= { agendamentos: [] };
  await db.write();
}
initDB();

// 📩 Enviar mensagem WhatsApp
async function enviar(numero, texto) {
  try {
    await axios.post(
      `https://api.z-api.io/instances/${INSTANCE}/token/${TOKEN}/send-text`,
      { phone: numero, message: texto }
    );
  } catch (err) {
    console.error("Erro ao enviar:", err.message);
  }
}

// 🧠 Estado dos usuários
let clientes = {};

// ⏰ Horários disponíveis
const horarios = ["14:00", "15:00", "16:00", "17:00"];

// 🔍 Verifica disponibilidade
function horarioDisponivel(data, horario) {
  return !db.data.agendamentos.some(
    a => a.data === data && a.horario === horario
  );
}

// 💾 Salvar agendamento
async function salvarAgendamento(dados) {
  db.data.agendamentos.push({
    id: uuidv4(),
    ...dados
  });
  await db.write();
}

// 🤖 WEBHOOK
app.post("/webhook", async (req, res) => {
  const numero = req.body.phone;
  const msg = (req.body.text?.message || "").toLowerCase().trim();

  if (!numero) return res.sendStatus(200);

  if (!clientes[numero]) {
    clientes[numero] = { etapa: "inicio" };
  }

  let c = clientes[numero];

  // 👋 INÍCIO
  if (msg === "oi" || msg === "olá") {
    c.etapa = "menu";

    await enviar(numero,
`💈 *Barbearia Premium*

1️⃣ Agendar horário
2️⃣ Ver serviços
3️⃣ Cancelar agendamento`);

    return res.sendStatus(200);
  }

  // 📋 MENU
  if (c.etapa === "menu") {
    if (msg === "1") {
      c.etapa = "nome";
      return await enviar(numero, "Qual seu nome?");
    }

    if (msg === "2") {
      return await enviar(numero,
`💈 Serviços:
Corte - R$30
Barba - R$20
Combo - R$45`);
    }

    if (msg === "3") {
      c.etapa = "cancelar";
      return await enviar(numero, "Digite a data do agendamento para cancelar:");
    }
  }

  // 👤 NOME
  if (c.etapa === "nome") {
    c.nome = msg;
    c.etapa = "data";
    return await enviar(numero, "Digite a data (ex: 25/04):");
  }

  // 📅 DATA
  if (c.etapa === "data") {
    c.data = msg;

    // mostrar horários livres
    let livres = horarios.filter(h => horarioDisponivel(c.data, h));

    if (livres.length === 0) {
      return await enviar(numero, "❌ Sem horários disponíveis nessa data.");
    }

    c.etapa = "horario";
    return await enviar(numero,
`Horários disponíveis:
${livres.join(", ")}`);
  }

  // ⏰ HORÁRIO
  if (c.etapa === "horario") {
    if (!horarioDisponivel(c.data, msg)) {
      return await enviar(numero, "❌ Horário já ocupado, escolha outro.");
    }

    c.horario = msg;

    await salvarAgendamento({
      nome: c.nome,
      telefone: numero,
      data: c.data,
      horario: c.horario
    });

    c.etapa = "fim";

    return await enviar(numero,
`✅ *Agendamento confirmado!*

👤 ${c.nome}
📅 ${c.data}
⏰ ${c.horario}`);
  }

  // ❌ CANCELAR
  if (c.etapa === "cancelar") {
    db.data.agendamentos = db.data.agendamentos.filter(
      a => !(a.telefone === numero && a.data === msg)
    );
    await db.write();

    c.etapa = "menu";

    return await enviar(numero, "❌ Agendamento cancelado.");
  }

  await enviar(numero, "Digite 'oi' para começar.");
  res.sendStatus(200);
});

// 🚀 START
app.listen(3000, () => {
  console.log("🚀 Bot rodando na porta 3000");
});
