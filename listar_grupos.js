const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const pino = require('pino');

async function listarGrupos() {
  const { state, saveCreds } = await useMultiFileAuthState('sessao');

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['MatchZap', 'Chrome', '1.0.0'],
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection } = update;

    if (connection === 'open') {
      console.log('✅ Conectado. Buscando grupos...\n');

      const grupos = await sock.groupFetchAllParticipating();
      const lista = Object.values(grupos);

      lista.forEach((g, i) => {
        console.log(`${i + 1}. ${g.subject} — ${g.id}`);
      });

      console.log(`\nTotal: ${lista.length} grupos`);
      process.exit(0);
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

listarGrupos();