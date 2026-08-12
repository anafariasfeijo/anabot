const { getLeadByTelefone, updateLead } = require('../db/leadsRepository');
const { getMensagem } = require('../db/fluxosRepository');
const { salvarMensagem } = require('../db/mensagensRepository');
const { estaPausado } = require('./disparoService');
const EvolutionApiProvider = require('../integrations/whatsapp/EvolutionApiProvider');

const provider = new EvolutionApiProvider();
const MAX_MENSAGENS_BOT = 6;
const DEBOUNCE_MS = 60000;

const filasPorTelefone = new Map();
const buffersPorTelefone = new Map();

function delayAleatorio() {
  const min = 60000;
  const max = 80000;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
    'fechou', 'fechamos', 'não funciona mais', 'nao funciona mais',
    'depois', 'depois a gente vê', 'depois eu vejo', 'depois falamos',
    'te chamo depois', 'entramos em contato', 'entro em contato',
    'vou pensar', 'deixa eu pensar', 'deixa eu ver',
  ];
  const positivos = [
    'sim', 'quero', 'pode', 'claro', 'manda', 'envia', 'bora',
    'com certeza', 'perfeito', 'ok', 'beleza', 'positivo',
    'pois não', 'pois nao', 'pode falar', 'qual seria', 'qual a ideia',
  ];

  if (negativos.some((p) => t.includes(p))) return 'negativo';
  if (positivos.some((p) => t.includes(p))) return 'positivo';
  return 'indefinido';
}

async function enviarHandoff(lead) {
  const mensagemFinal = await getMensagem('geral', 4);
  const texto = mensagemFinal
    ? montarTexto(mensagemFinal, lead)
    : 'Perfeito! Vou te mostrar um exemplo que preparei.';

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

  await salvarMensagem({
    leadId: lead.id,
    remetente: 'cliente',
    conteudo: textoCliente,
    whatsappMessageId,
  });

  if (estaPausado()) {
    console.log(`Bot está pausado, mensagem de ${telefone} salva mas sem resposta.`);
    return;
  }

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

  const intencao = classificarResposta(textoCliente);

  if (intencao === 'negativo') {
    await enviarEncerramentoNegativo(lead);
    return;
  }

  const proximoPasso = lead.passo_atual + 1;
  const mensagem = await getMensagem(lead.nicho, proximoPasso);

  if (!mensagem) {
    await enviarHandoff(lead);
    return;
  }

  const texto = montarTexto(mensagem, lead);
  await enviarResposta(lead, texto);

  await updateLead(lead.id, {
    passo_atual: proximoPasso,
    estado: 'em_qualificacao',
    contador_mensagens_bot: lead.contador_mensagens_bot + 1,
  });
}

function enfileirarProcessamento(telefone, textoCliente, whatsappMessageId) {
  const filaAnterior = filasPorTelefone.get(telefone) || Promise.resolve();

  const filaAtual = filaAnterior
    .then(() => processarMensagemInterna(telefone, textoCliente, whatsappMessageId))
    .catch((error) => {
      console.error(`Erro ao processar mensagem de ${telefone}:`, error);
    });

  filasPorTelefone.set(telefone, filaAtual);
  return filaAtual;
}

async function processarMensagemRecebida(telefone, textoCliente, whatsappMessageId) {
  let buffer = buffersPorTelefone.get(telefone);

  if (!buffer) {
    buffer = { mensagens: [], timer: null, ultimoMessageId: null };
    buffersPorTelefone.set(telefone, buffer);
  }

  buffer.mensagens.push(textoCliente);
  buffer.ultimoMessageId = whatsappMessageId;

  if (buffer.timer) clearTimeout(buffer.timer);

  buffer.timer = setTimeout(() => {
    const textoCombinado = buffer.mensagens.join(' ');
    const messageId = buffer.ultimoMessageId;
    buffersPorTelefone.delete(telefone);
    enfileirarProcessamento(telefone, textoCombinado, messageId);
  }, DEBOUNCE_MS);
}

module.exports = { processarMensagemRecebida };
