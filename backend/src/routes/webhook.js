const express = require('express');
const router = express.Router();
const { processarMensagemRecebida } = require('../services/stateMachine');

router.post('/', async (req, res) => {
  res.sendStatus(200); // confirma recebimento pro Evolution API imediatamente

  try {
    const body = req.body;
    if (body.event !== 'messages.upsert') return;

    const data = body.data;
    if (!data || data.key?.fromMe) return; // ignora mensagens que o próprio bot mandou

    const remoteJid = data.key?.remoteJid || '';
    if (remoteJid.includes('@g.us')) return; // ignora mensagens de grupo, por enquanto

    const telefone = remoteJid.replace('@s.whatsapp.net', '');
    const texto = data.message?.conversation || data.message?.extendedTextMessage?.text;
    if (!texto) return;

    console.log(`Mensagem recebida de ${telefone}: "${texto}"`);
    const whatsappMessageId = data.key?.id || null;
    await processarMensagemRecebida(telefone, texto, whatsappMessageId);
  } catch (error) {
    console.error('Erro ao processar webhook:', error);
  }
});

module.exports = router;