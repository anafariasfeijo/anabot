const { getLeadByTelefone, updateLead } = require('../db/leadsRepository');
const { getMensagem } = require('../db/fluxosRepository');
const { salvarMensagem } = require('../db/mensagensRepository');
const EvolutionApiProvider = require('../integrations/whatsapp/EvolutionApiProvider');

const provider = new EvolutionApiProvider();
const MAX_MENSAGENS_BOT = 6;

const filasPorTelefone = new Map();

function delayAleatorio() {
  const min = 3000;
  const max = 8000;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Envia a mensagem com delay E já salva no histórico
async function enviarResposta(lead, texto) {
  const duracao = delayAleatorio();
  await provider.sendPresence(lead.telefone, duracao);
  await esperar(duracao);
  await provider.sendMessage(lead.telefone, texto);

  await salvarMensagem({
    leadId: lead.id,
    remetente: 'bot',
    conteudo: texto,
  });
}

function montarTexto(mensagem, lead) {
  if (lead.nome && mensagem.texto_com_nome) {
    return mensagem.texto_com_nome.replace('{empresa}', lead.nome);
  }
  return mensagem.texto_sem_nome;
}

function classificarResposta(texto) {
  const t = texto.toLowerCase().trim();

  const negativos = [
    'não', 'nao', 'não quero', 'nao quero', 'agora não', 'agora nao',
    'não precisa', 'nao precisa', 'não obrigado', 'nao obrigado',
    'não obrigada', 'nao obrigada', 'não por enquanto', 'nao por enquanto',
  ];
  const positivos = [
    'sim', 'quero', 'pode', 'claro', 'manda', 'envia', 'bora',
    'com certeza', 'perfeito', 'ok', 'beleza', 'positivo',
  ];

  if (negativos.some((p) => t.includes(p))) return 'negativo';
  if (positivos.some((p) => t.includes(p))) return 'positivo';
  return 'indefinido';
}

async function enviarHandoff(lead) {
  const mensagemFinal = await getMensagem(lead.nicho, 4);
  const texto = mensagemFinal
    ? montarTexto(mensagemFinal, lead)
    : 'Perfeito! Vou te chamar por aqui em instantes.';

  await enviarResposta(lead, texto);

  await updateLead(lead.id, {
    estado: 'aguardando_atendimento_humano',
    contador_mensagens_bot: lead.contador_mensagens_bot + 1,
  });

  console.log(`Lead ${lead.id} encaminhado para atendimento humano.`);
}

async function enviarEncerramentoNegativo(lead) {
  const mensagem = await getMensagem('geral', 998);
  const texto = mensagem
    ? mensagem.texto_sem_nome
    : 'Sem problemas! Agradeço muito seu tempo, e fico à disposição se mudar de ideia. 😊';

  await enviarResposta(lead, texto);

  await updateLead(lead.id, {
    estado: 'encerrado_sem_interesse',
    contador_mensagens_bot: lead.contador_mensagens_bot + 1,
  });

  console.log(`Lead ${lead.id} encerrado sem interesse.`);
}

async function processarMensagemInterna(telefone, textoCliente, whatsappMessageId) {
  const lead = await getLeadByTelefone(telefone);

  if (!lead) {
    console.log(`Mensagem de número não cadastrado (${telefone}), ignorando.`);
    return;
  }

  // Salva a mensagem do cliente, sempre — mesmo que o bot não vá responder
  await salvarMensagem({
    leadId: lead.id,
    remetente: 'cliente',
    conteudo: textoCliente,
    whatsappMessageId,
  });

  if (
    lead.estado === 'aguardando_atendimento_humano' ||
    lead.estado === 'encerrado_sem_interesse'
  ) {
    console.log(`Lead ${lead.id} está em "${lead.estado}", bot não responde.`);
    return;
  }

  if (lead.contador_mensagens_bot >= MAX_MENSAGENS_BOT) {
    await enviarHandoff(lead);
    return;
  }

  const proximoPasso = lead.passo_atual + 1;

  if (proximoPasso === 3) {
    const intencao = classificarResposta(textoCliente);

    if (intencao === 'negativo') {
      await enviarEncerramentoNegativo(lead);
      return;
    }

    const perguntaSite = await getMensagem('geral', 3);
    const texto = perguntaSite
      ? perguntaSite.texto_sem_nome
      : 'Perfeito! Só por curiosidade: hoje vocês já possuem um site? 😊';

    await enviarResposta(lead, texto);

    await updateLead(lead.id, {
      passo_atual: 3,
      estado: 'em_qualificacao',
      contador_mensagens_bot: lead.contador_mensagens_bot + 1,
    });
    return;
  }

  if (proximoPasso >= 4) {
    await enviarHandoff(lead);
    return;
  }

  const mensagem = await getMensagem(lead.nicho, proximoPasso);

  if (!mensagem) {
    console.log(`Sem mensagem configurada pra nicho "${lead.nicho}" passo ${proximoPasso}.`);
    await enviarHandoff(lead);
    return;
  }

  const texto = montarTexto(mensagem, lead);
  await enviarResposta(lead, texto);

  await updateLead(lead.id, {
    passo_atual: proximoPasso,
    estado:'em_qualificacao',
    contador_mensagens_bot: lead.contador_mensagens_bot + 1,
  });
}

async function processarMensagemRecebida(telefone, textoCliente, whatsappMessageId) {
  const filaAnterior = filasPorTelefone.get(telefone) || Promise.resolve();

  const filaAtual = filaAnterior
    .then(() => processarMensagemInterna(telefone, textoCliente, whatsappMessageId))
    .catch((error) => {
      console.error(`Erro ao processar mensagem de ${telefone}:`, error);
    });

  filasPorTelefone.set(telefone, filaAtual);
  await filaAtual;
}

module.exports = { processarMensagemRecebida };