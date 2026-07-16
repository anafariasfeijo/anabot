const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const XLSX = require('xlsx');
const supabase = require('../db/supabaseClient');

const NICHOS_VALIDOS = ['salao_beleza', 'barbearia', 'clinica', 'academia', 'loja_roupas', 'restaurante'];

function normalizarTelefone(valor) {
  if (!valor) return null;
  const apenasNumeros = String(valor).replace(/\D/g, '');

  if (apenasNumeros.length === 10 || apenasNumeros.length === 11) {
    return '55' + apenasNumeros;
  }
  if (apenasNumeros.length === 12 || apenasNumeros.length === 13) {
    return apenasNumeros;
  }
  return null;
}

function lerArquivo(caminho) {
  const extensao = path.extname(caminho).toLowerCase();

  if (extensao === '.csv') {
    const conteudo = fs.readFileSync(caminho, 'utf-8');
    return parse(conteudo, { columns: true, skip_empty_lines: true, trim: true });
  }

  if (extensao === '.xlsx' || extensao === '.xls') {
    const workbook = XLSX.readFile(caminho);
    const primeiraAba = workbook.SheetNames[0];
    return XLSX.utils.sheet_to_json(workbook.Sheets[primeiraAba]);
  }

  throw new Error(`Formato de arquivo não suportado: ${extensao}`);
}

async function importarLeads(caminhoArquivo) {
  const linhas = lerArquivo(caminhoArquivo);

  const resultado = { total: linhas.length, sucesso: 0, erros: [] };

  const { data: importacao } = await supabase
    .from('importacoes')
    .insert({
      arquivo_nome: path.basename(caminhoArquivo),
      total_linhas: linhas.length,
      status: 'processando',
    })
    .select()
    .single();

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    const numeroLinha = i + 2;

    const nome = linha.nome || linha.Nome || null;
    const telefoneOriginal = linha.telefone || linha.Telefone || linha.whatsapp || linha.Whatsapp;
    const nicho = (linha.nicho || linha.Nicho || '').toString().trim().toLowerCase();

    const telefone = normalizarTelefone(telefoneOriginal);

    if (!telefone) {
      resultado.erros.push(`Linha ${numeroLinha}: telefone inválido ("${telefoneOriginal}")`);
      continue;
    }

    if (!NICHOS_VALIDOS.includes(nicho)) {
      resultado.erros.push(`Linha ${numeroLinha}: nicho "${nicho}" não reconhecido`);
      continue;
    }

    const { error } = await supabase.from('leads').insert({
      nome,
      telefone,
      nicho,
      origem: path.basename(caminhoArquivo),
      estado: 'novo',
      passo_atual: 0,
      contador_mensagens_bot: 0,
    });

    if (error) {
      if (error.code === '23505') {
        resultado.erros.push(`Linha ${numeroLinha}: telefone "${telefone}" já cadastrado`);
      } else {
        resultado.erros.push(`Linha ${numeroLinha}: erro ao salvar - ${error.message}`);
      }
      continue;
    }

    resultado.sucesso++;
  }

  if (importacao) {
    await supabase
      .from('importacoes')
      .update({
        linhas_com_erro: resultado.erros.length,
        status: resultado.erros.length > 0 ? 'com_erros' : 'concluida',
      })
      .eq('id', importacao.id);
  }

  return resultado;
}

module.exports = { importarLeads, NICHOS_VALIDOS };