const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const { Boom } = require('@hapi/boom');

let reconectando = false;

async function conectar() {
  if (reconectando) return;
  reconectando = true;

  const { state, saveCreds } = await useMultiFileAuthState('sessao');

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['MatchZap', 'Chrome', '1.0.0'],
    syncFullHistory: false,
    markOnlineOnConnect: false,
    fireInitQueries: false,
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n📱 Escaneie o QR code com o WhatsApp do número dedicado:\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      reconectando = false;
      console.log('\n✅ Conectado! MatchZap ativo.');
    }

    if (connection === 'close') {
      reconectando = false;
      const erro = lastDisconnect?.error;
      const statusCode = (erro instanceof Boom) ? erro.output.statusCode : 0;

      console.log('❌ Conexão caiu.');
      console.log('   Motivo:', erro?.message || 'desconhecido');
      console.log('   Código:', statusCode);

      if (statusCode === DisconnectReason.loggedOut) {
        console.log('   Sessão expirada. Apague a pasta sessao e reconecte.');
      } else {
        console.log('   Reconectando em 5 segundos...');
        setTimeout(conectar, 5000);
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

conectar();