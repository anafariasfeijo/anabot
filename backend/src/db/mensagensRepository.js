const supabase = require('./supabaseClient');

async function getOuCriarConversa(leadId) {
  const { data: existente, error: erroConsulta } = await supabase
    .from('conversas')
    .select('*')
    .eq('lead_id', leadId)
    .maybeSingle();

  if (erroConsulta) throw erroConsulta;
  if (existente) return existente;

  const { data: nova, error: erroCriacao } = await supabase
    .from('conversas')
    .insert({ lead_id: leadId, estado_atual: 'novo' })
    .select()
    .single();

  if (erroCriacao) throw erroCriacao;
  return nova;
}

async function salvarMensagem({ leadId, remetente, conteudo, whatsappMessageId = null, intencaoDetectada = null }) {
  const conversa = await getOuCriarConversa(leadId);

  const { error } = await supabase.from('mensagens').insert({
    conversa_id: conversa.id,
    remetente,
    conteudo,
    whatsapp_message_id: whatsappMessageId,
    intencao_detectada: intencaoDetectada,
  });

  if (error) throw error;

  await supabase
    .from('conversas')
    .update({ ultima_interacao_em: new Date().toISOString() })
    .eq('id', conversa.id);
}

module.exports = { salvarMensagem };