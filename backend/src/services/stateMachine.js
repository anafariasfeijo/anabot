const { getLeadByTelefone, updateLead } = require('../db/leadsRepository');
const { getMensagem } = require('../db/fluxosRepository');
const { salvarMensagem } = require('../db/mensagensRepository');
const EvolutionApiProvider = require('../integrations/whatsapp/EvolutionApiProvider');

const provider = new EvolutionApiProvider();
const MAX_MENSAGENS_BOT = 6;
const DEBOUNCE_MS = 60000; // espera 1 minuto após a última mensagem antes de responder

const filasPorTelefone = new Map();
const buffersPorTelefone = new Map();

function delayAleatorio() {
  const min = 20000;
  const max = 40000;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function delayRapido() {
  // Delay curto pra simular sequência rápida de mensagens (rajada)
  const min = 3000;
  const max = 6000;
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

async function enviarRespostaRapida(lead, texto) {
  const duracao = delayRapido();
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

// Rajada: alguns nichos mandam o próximo passo automaticamente,
// em sequência rápida, sem esperar resposta do lead
async function enviarRajada(lead, passo, delayMs) {
  setTimeout(async () => {
    try {
      const mensagem = await getMensagem(lead.nicho, passo);
      if (!mensagem) {
        console.log(`Sem mensagem configurada pra nicho "${lead.nicho}" passo ${passo}.`);
        return;
      }
      const texto = montarTexto(mensagem, lead);
      await enviarRespostaRapida(lead, texto);

      await updateLead(lead.id, {
        passo_atual: passo,
        contador_mensagens_bot: lead.contador_mensagens_bot + 1,
      });
    } catch (error) {
      console.error(`Erro ao enviar rajada passo ${passo} pro lead ${lead.id}:`, error);
    }
  }, delayMs);
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

  // PASSO 0: respondeu ao "Olá, tudo bem?" -> manda pergunta de nicho (passo 1)
  if (lead.passo_atual === 0) {
    if (intencao === 'negativo') {
      await enviarEncerramentoNegativo(lead);
      return;
    }

    const mensagem = await getMensagem(lead.nicho, 1);
    if (!mensagem) {
      console.log(`Sem mensagem configurada pra nicho "${lead.nicho}" passo 1.`);
      await enviarHandoff(lead);
      return;
    }

    const texto = montarTexto(mensagem, lead);
    await enviarResposta(lead, texto);

    await updateLead(lead.id, {
      passo_atual: 1,
      estado: 'em_qualificacao',
      contador_mensagens_bot: lead.contador_mensagens_bot + 1,
    });
    return;
  }

  // PASSO 1: respondeu se "aceita falar"
  if (lead.passo_atual === 1) {
    if (intencao === 'negativo') {
      await enviarEncerramentoNegativo(lead);
      return;
    }

    if (intencao === 'indefinido') {
      await enviarHandoff(lead);
      return;
    }

    const mensagem = await getMensagem(lead.nicho, 2);
    if (!mensagem) {
      console.log(`Sem mensagem configurada pra nicho "${lead.nicho}" passo 2.`);
      await enviarHandoff(lead);
      return;
    }

    const texto = montarTexto(mensagem, lead);
    await enviarResposta(lead, texto);

    await updateLead(lead.id, {
      passo_atual: 2,
      estado: 'em_qualificacao',
      contador_mensagens_bot: lead.contador_mensagens_bot + 1,
    });

    if (lead.nicho === 'barbearia') {
      await enviarRajada(lead, 3, 2000);
    }

    return;
  }

  // PASSO 2: respondeu se "aceita ver" -> se positivo/indefinido, handoff
  if (lead.passo_atual === 2) {
    if (intencao === 'negativo') {
      await enviarEncerramentoNegativo(lead);
      return;
    }

    await enviarHandoff(lead);
    return;
  }

  await enviarHandoff(lead);
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