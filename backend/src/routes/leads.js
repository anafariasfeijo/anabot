const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { importarLeads } = require('../services/importService');
const { dispararPrimeiroContato } = require('../services/disparoService');

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

router.post('/disparar', async (req, res) => {
  try {
    await dispararPrimeiroContato();
    res.json({ status: 'ok', mensagem: 'Disparo executado com sucesso.' });
  } catch (error) {
    console.error('Erro ao disparar:', error);
    res.status(500).json({ erro: error.message });
  }
});

module.exports = router;
