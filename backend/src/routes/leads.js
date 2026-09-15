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

// Inicia o disparo em segundo plano — não espera terminar todos os envios
// pra responder, assim o botão "Parar" consegue interromper de fato.
router.post('/disparar', (req, res) => {
  if (estaEmAndamento()) {
    return res.status(409).json({ status: 'erro', mensagem: 'Já existe um disparo em andamento.' });
  }

  dispararPrimeiroContato().catch((error) => {
    console.error('Erro ao disparar:', error);
  });

  res.json({ status: 'ok', mensagem: 'Disparo iniciado.' });
});

router.post('/parar', (req, res) => {
  pausarDisparo();
  res.json({ status: 'ok', mensagem: 'Disparo será interrompido após o envio atual.' });
});

router.post('/retomar', (req, res) => {
  retomarDisparo();
  res.json({ status: 'ok', mensagem: 'Disparo retomado.' });
});

router.get('/status-disparo', (req, res) => {
  res.json({
    emAndamento: estaEmAndamento(),
    pausado: estaPausado(),
  });
});

module.exports = router;