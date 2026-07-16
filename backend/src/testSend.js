const EvolutionApiProvider = require('./integrations/whatsapp/EvolutionApiProvider');

const provider = new EvolutionApiProvider();

// Troque pelo número que você quer testar (com código do país, sem espaços ou símbolos)
// Exemplo: 5521999999999
const numeroTeste = '5521983486744';

provider.sendMessage(numeroTeste, 'Oi! Isso é um teste do meu bot 🚀')
  .then(() => console.log('Teste concluído com sucesso!'))
  .catch(() => console.log('Teste falhou, veja o erro acima.'));