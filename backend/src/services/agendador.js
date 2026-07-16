const cron = require('node-cron');
const { dispararPrimeiroContato } = require('./disparoService');

const HORARIO_INICIO = 9;  // 9h
const HORARIO_FIM = 19;    // 19h

function dentroDoHorarioComercial() {
  const agora = new Date();
  const hora = agora.getHours();
  const diaDaSemana = agora.getDay(); // 0 = domingo, 6 = sábado

  const ehDiaUtil = diaDaSemana >= 1 && diaDaSemana <= 5; // segunda a sexta
  const ehHorarioComercial = hora >= HORARIO_INICIO && hora < HORARIO_FIM;

  return ehDiaUtil && ehHorarioComercial;
}

function iniciarAgendador() {
  // Roda a cada 15 minutos
  cron.schedule('*/15 * * * *', async () => {
    if (!dentroDoHorarioComercial()) {
      console.log('[Agendador] Fora do horário comercial, disparo pausado.');
      return;
    }

    console.log('[Agendador] Verificando leads novos para disparo...');
    try {
      await dispararPrimeiroContato();
    } catch (error) {
      console.error('[Agendador] Erro ao disparar:', error);
    }
  });

  console.log('[Agendador] Ativado — verificando leads novos a cada 15 minutos (horário comercial, seg-sex).');
}

module.exports = { iniciarAgendador };