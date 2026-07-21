const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { importarLeads } = require('../services/importService');

const router = express.Router();

// Salva o arquivo temporariamente na pasta 'uploads' antes de processar
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
    // Renomeia pra ter a extensão certa (.csv, .xlsx), já que o multer não coloca
    fs.renameSync(caminhoTemp, caminhoComExtensao);

    const resultado = await importarLeads(caminhoComExtensao);

    res.json(resultado);
  } catch (error) {
    console.error('Erro ao importar arquivo:', error);
    res.status(500).json({ erro: error.message });
  } finally {
    // Remove o arquivo temporário depois de processar (com ou sem sucesso)
    if (fs.existsSync(caminhoComExtensao)) {
      fs.unlinkSync(caminhoComExtensao);
    }
  }
});

module.exports = router;
