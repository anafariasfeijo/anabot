const supabase = require('./supabaseClient');

async function getLeadByTelefone(telefone) {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('telefone', telefone)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function updateLead(id, fields) {
  const { error } = await supabase
    .from('leads')
    .update({ ...fields, atualizado_em: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

module.exports = { getLeadByTelefone, updateLead };