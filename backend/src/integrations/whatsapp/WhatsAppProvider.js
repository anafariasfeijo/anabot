// Contrato genérico que qualquer provedor de WhatsApp deve seguir.
// Isso mantém o resto do sistema independente de qual tecnologia está por trás.
class WhatsAppProvider {
  async sendMessage(telefone, texto) {
    throw new Error('sendMessage precisa ser implementado pelo provedor específico');
  }
}

module.exports = WhatsAppProvider;