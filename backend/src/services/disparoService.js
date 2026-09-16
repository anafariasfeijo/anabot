const supabase = require('../db/supabaseClient');
const { getMensagem } = require('../db/fluxosRepository');
const { updateLead } = require('../db/leadsRepository');
const { getSaudacao } = require('../utils/saudacao');
const EvolutionApiProvider = require('../integrations/whatsapp/EvolutionApiProvider');

const provider = new EvolutionApiProvider();

const LIMITE_DIARIO_POR_PAIS = { BR: 20, PT: 20 };
const DELAY_ENTRE_ENVIOS_MS = 30000;

let pausado = false;
let disparoEmAndamento = false;

async function carregarEstadoInicial() {
  try {
    const { data, error } = await supabase
      .from('configuracoes')
      .select('valor')
      .eq('chave', 'bot_pausado')
      .single();

    if (error) throw error;
    pausado = data?.valor === 'true';
    console.log(`[Bot] Estado carregado do Supabase: ${pausado ? 'DESLIGADO' : 'LIGADO'}`);
  } catch (error) {
    console.error('[Bot] Não foi possível carregar estado salvo, iniciando como LIGADO por padrão:', error.message);
    pausado = false;
  }
}

carregarEstadoInicial();

async function salvarEstado(novoPausado) {
  const { error } = await supabase
    .from('configuracoes')
    .update({ valor: String(novoPausado), atualizado_em: new Date().toISOString() })
    .eq('chave', 'bot_pausado');

  if (error) {
    console.error('[Bot] Erro ao salvar estado no Supabase:', error.message);
  }
}

async function pausarDisparo() {
  pausado = true;
  await salvarEstado(true);
  console.log('[Bot] Desligado — disparos e respostas automáticas pausados.');
}

async function retomarDisparo() {
  pausado = false;
  await salvarEstado(false);
  console.log('[Bot] Ligado — disparos e respostas automáticas retomados.');
}

function estaPausado() {
  return pausado;
}

function estaEmAndamento() {
  return disparoEmAndamento;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Detecta o país do lead pelo DDI do telefone
function detectarPais(telefone) {
  const tel = String(telefone || '').replace(/\D/g, ''); // remove tudo que não é número
  if (tel.startsWith('351')) return 'PT';
  if (tel.startsWith('55')) return 'BR';
  return 'BR'; // fallback: se não identificar, assume BR
}

async function contarEnviosHoje(pais) {
  const inicioDoDia = new Date();
  inicioDoDia.setHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('pais', pais)
    .neq('estado', 'novo')
    .gte('atualizado_em', inicioDoDia.toISOString());

  if (error) throw error;
  return count || 0;
}

async function buscarLeadsNovos(limite, pais) {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('estado', 'novo')
    .eq('pais', pais)
    .order('criado_em', { ascending: true })
    .limit(limite);

  if (error) throw error;
  return data;
}

function montarTexto(mensagem, lead) {
  if (lead.nome && mensagem.texto_com_nome) {
    return mensagem.texto_com_nome.replace('{empresa}', lead.nome);
  }
  return mensagem.texto_sem_nome;
}

async function dispararParaPais(pais) {
  const jaEnviadosHoje = await contarEnviosHoje(pais);
  const limite = LIMITE_DIARIO_POR_PAIS[pais];
  const vagasRestantes = limite - jaEnviadosHoje;

  if (vagasRestantes <= 0) {
    console.log(`[Disparo][${pais}] Limite diário de ${limite} já atingido hoje.`);
    return;
  }

  const leads = await buscarLeadsNovos(vagasRestantes, pais);

  if (leads.length === 0) {
    console.log(`[Disparo][${pais}] Nenhum lead novo pra disparar.`);
    return;
  }

  console.log(`[Disparo][${pais}] Iniciando envio pra ${leads.length} leads.`);

  for (const lead of leads) {
    if (pausado) {
      console.log(`[Disparo][${pais}] Pausado pelo usuário, parando aqui.`);
      break;
    }

    try {
      const saudacao = getSaudacao();
      const texto = `${saudacao}! Tudo bem?`;

      await provider.sendPresence(lead.telefone, 3000);
      await delay(3000);
      await provider.sendMessage(lead.telefone, texto);

      await updateLead(lead.id, {
        estado: 'primeiro_contato_enviado',
        passo_atual: 0,
        contador_mensagens_bot: 1,
      });

      console.log(`[Disparo][${pais}] Mensagem enviada pro lead ${lead.id} (${lead.telefone}).`);
    } catch (error) {
      console.error(`[Disparo][${pais}] Erro ao enviar pro lead ${lead.id}:`, error);
    }

    await delay(DELAY_ENTRE_ENVIOS_MS);
  }

  console.log(`[Disparo][${pais}] Finalizado.`);
}

async function dispararPrimeiroContato() {
  if (disparoEmAndamento) {
    console.log('Já existe um disparo em andamento, ignorando nova chamada.');
    return;
  }

  disparoEmAndamento = true;
  pausado = false; // toda nova chamada de disparo começa "despausada"

  try {
    for (const pais of ['BR', 'PT']) {
      if (pausado) break;
      await dispararParaPais(pais);
    }
  } catch (error) {
    console.error('[Disparo] Erro geral:', error);
  } finally {
    disparoEmAndamento = false;
  }
}

module.exports = {
  dispararPrimeiroContato,
  pausarDisparo,
  retomarDisparo,
  estaPausado,
  estaEmAndamento,
};