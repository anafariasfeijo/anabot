const supabase = require('../db/supabaseClient');
const { getMensagem } = require('../db/fluxosRepository');
const { updateLead } = require('../db/leadsRepository');
const EvolutionApiProvider = require('../integrations/whatsapp/EvolutionApiProvider');

const provider = new EvolutionApiProvider();

const LIMITE_DIARIO = 20; // ajuste conforme for aumentando o volume com segurança
const DELAY_ENTRE_ENVIOS_MS = 30000; // 30 segundos entre cada disparo, pra não parecer robô

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
  const textoAbertura = abertura?.texto_sem_nome || 'Oi! 😊 Tudo bem?';

  for (const lead of leads) {
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

    await delay(DELAY_ENTRE_ENVIOS_MS);
  }
}

module.exports = { dispararPrimeiroContato };