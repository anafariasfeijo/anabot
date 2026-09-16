const supabase = require('./supabaseClient');

async function getMensagem(nicho, ordem, pais = 'BR') {
  const { data, error } = await supabase
    .from('fluxos_mensagens')
    .select('*')
    .eq('nicho', nicho)
    .eq('ordem', ordem)
    .eq('pais', pais)
    .eq('ativo', true)
    .maybeSingle();

  if (error) throw error;
  return data;
}

module.exports = { getMensagem };