const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const QRCode = require('qrcode');
const { exec } = require('child_process');

async function main() {
  const { state, saveCreds } = await useMultiFileAuthState('sessao');
  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    fireInitQueries: false,
    browser: ['MatchZap', 'Chrome', '1.0.0'],
  });

  sock.ev.on('creds.update', saveCreds);

  let qrSalvo = false;

  sock.ev.on('connection.update', async (update) => {
    const { qr, connection, lastDisconnect } = update;

    if (qr) {
      await QRCode.toFile('qr_matchzap.png', qr, {
        width: 400,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      });
      qrSalvo = true;
      console.log('QR_PRONTO');
      exec('start qr_matchzap.png');
    }

    if (connection === 'open') {
      console.log('JA_CONECTADO');
      process.exit(0);
    }

    if (connection === 'close') {
      const err = lastDisconnect?.error;
      const statusCode = err instanceof Boom ? err.output.statusCode : 0;

      if (statusCode === DisconnectReason.loggedOut) {
        console.error('SESSAO_INVALIDA');
        process.exit(1);
      }

      // Ignora fechamento antes de autenticar (normal no fluxo QR)
      if (!qrSalvo) {
        console.log('Reconectando...');
        main();
      }
      // Se QR já foi mostrado, aguarda o usuário escanear — conexão pode fechar/reabrir
    }
  });

  setTimeout(() => {
    console.log('TIMEOUT');
    process.exit(1);
  }, 90000);
}

main().catch(err => {
  console.error('ERRO:', err.message);
  process.exit(1);
});
