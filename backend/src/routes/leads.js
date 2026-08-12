const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { importarLeads } = require('../services/importService');
const {
  dispararPrimeiroContato,
  pausarDisparo,
  retomarDisparo,
  estaPausado,
  estaEmAndamento,
} = require('../services/disparoService');

const router = express.Router();

const upload = multer({ dest: 'uploads/' });

router.post('/importar', upload.single('arquivo'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ erro: 'Nenhum arquivo enviado.' });
  }

  const caminhoTemp = req.file.path;
  const nomeOriginal = req.file.originalname;
  const extensao = path.extname(nomeOriginal);
  const caminhoComExtensao = caminhoTemp + extensao;

  try {
    fs.renameSync(caminhoTemp, caminhoComExtensao);
    const resultado = await importarLeads(caminhoComExtensao);
    res.json(resultado);
  } catch (error) {
    console.error('Erro ao importar arquivo:', error);
    res.status(500).json({ erro: error.message });
  } finally {
    if (fs.existsSync(caminhoComExtensao)) {
      fs.unlinkSync(caminhoComExtensao);
    }
  }
});

router.post('/disparar', (req, res) => {
  if (estaPausado()) {
    return res.status(409).json({ status: 'erro', mensagem: 'O bot está desligado. Ligue-o antes de disparar.' });
  }

  if (estaEmAndamento()) {
    return res.status(409).json({ status: 'erro', mensagem: 'Já existe um disparo em andamento.' });
  }

  dispararPrimeiroContato().catch((error) => {
    console.error('Erro ao disparar:', error);
  });

  res.json({ status: 'ok', mensagem: 'Disparo iniciado.' });
});

router.post('/bot/desligar', async (req, res) => {
  try {
    await pausarDisparo();
    res.json({ status: 'ok', mensagem: 'Bot desligado. Disparos e respostas automáticas pausados.' });
  } catch (error) {
    console.error('Erro ao desligar bot:', error);
    res.status(500).json({ erro: error.message });
  }
});

router.post('/bot/ligar', async (req, res) => {
  try {
    await retomarDisparo();
    res.json({ status: 'ok', mensagem: 'Bot ligado. Disparos e respostas automáticas retomados.' });
  } catch (error) {
    console.error('Erro ao ligar bot:', error);
    res.status(500).json({ erro: error.message });
  }
});

router.get('/bot/status', (req, res) => {
  res.json({
    ligado: !estaPausado(),
    disparoEmAndamento: estaEmAndamento(),
  });
});

module.exports = router;
