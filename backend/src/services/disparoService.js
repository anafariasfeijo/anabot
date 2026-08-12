const supabase = require('../db/supabaseClient');
const { getMensagem } = require('../db/fluxosRepository');
const { updateLead } = require('../db/leadsRepository');
const { getSaudacao } = require('../utils/saudacao');
const EvolutionApiProvider = require('../integrations/whatsapp/EvolutionApiProvider');

const provider = new EvolutionApiProvider();

const LIMITE_DIARIO = 20;
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

async function contarEnviosHoje() {
  const inicioDoDia = new Date();
  inicioDoDia.setHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .neq('estado', 'novo')
    .gte('atualizado_em', inicioDoDia.toISOString());

  if (error) throw error;
  return count || 0;
}

async function buscarLeadsNovos(limite) {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('estado', 'novo')
    .order('criado_em', { ascending: true })
    .limit(limite);

  if (error) throw error;
  return data;
}

async function dispararPrimeiroContato() {
  if (pausado) {
    console.log('[Disparo] Bot está desligado, disparo não iniciado.');
    return;
  }

  if (disparoEmAndamento) {
    console.log('Já existe um disparo em andamento, ignorando nova chamada.');
    return;
  }

  disparoEmAndamento = true;

  try {
    const jaEnviadosHoje = await contarEnviosHoje();
    const vagasRestantes = LIMITE_DIARIO - jaEnviadosHoje;

    if (vagasRestantes <= 0) {
      console.log('Limite diário de disparos atingido. Nenhum envio agora.');
      return;
    }

    const leads = await buscarLeadsNovos(vagasRestantes);

    if (leads.length === 0) {
      console.log('Nenhum lead novo pra disparar.');
      return;
    }

    console.log(`Disparando primeiro contato para ${leads.length} lead(s)...`);

    const abertura = await getMensagem('geral', 0);
    const templateAbertura = abertura?.texto_sem_nome || '{saudacao}! Tudo bem??';

    for (const lead of leads) {
      if (pausado) {
        console.log('[Disparo] Bot foi desligado. Interrompendo antes do próximo lead.');
        break;
      }

      const textoAbertura = templateAbertura.replace('{saudacao}', getSaudacao());

      try {
        await provider.sendMessage(lead.telefone, textoAbertura);
        await updateLead(lead.id, {
          estado: 'primeiro_contato_enviado',
          passo_atual: 0,
          contador_mensagens_bot: 1,
        });
        console.log(`Primeiro contato enviado para lead ${lead.id} (${lead.telefone})`);
      } catch (error) {
        console.error(`Falha ao enviar para lead ${lead.id}:`, error.message);
      }

      if (pausado) {
        console.log('[Disparo] Bot foi desligado após o envio atual.');
        break;
      }

      await delay(DELAY_ENTRE_ENVIOS_MS);
    }
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
