const axios = require('axios');
const config = require('../../config/env');
const WhatsAppProvider = require('./WhatsAppProvider');

class EvolutionApiProvider extends WhatsAppProvider {
  constructor() {
    super();
    this.client = axios.create({
      baseURL: config.evolution.apiUrl,
      headers: {
        apikey: config.evolution.apiKey,
      },
    });
    this.instanceName = config.evolution.instanceName;
  }

  async sendMessage(telefone, texto) {
    try {
      const response = await this.client.post(
        `/message/sendText/${this.instanceName}`,
        {
          number: telefone,
          text: texto,
        }
      );
      console.log(`Mensagem enviada para ${telefone}: "${texto}"`);
      return response.data;
    } catch (error) {
      console.error('Erro ao enviar mensagem via Evolution API:');
      console.error('Status HTTP:', error.response?.status);
      console.dir(error.response?.data, { depth: null });
      throw error;
    }
  }
  async sendPresence(telefone, duracaoMs) {
    try {
      await this.client.post(`/chat/sendPresence/${this.instanceName}`, {
        number: telefone,
        presence: 'composing',
        delay: duracaoMs,
      });
    } catch (error) {
      // Se falhar, não é crítico — só não vai mostrar "digitando", mas a mensagem ainda será enviada
      console.error('Erro ao enviar presence (não crítico):', error.message);
    }
  }
}

module.exports = EvolutionApiProvider;