const cron = require('node-cron');
const { dispararPrimeiroContato, estaPausado } = require('./disparoService');

function getDataHoraBrasilia() {
  const agora = new Date();
  const dataBrasilia = new Date(
    agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })
  );

  return {
    hora: dataBrasilia.getHours(),
    minuto: dataBrasilia.getMinutes(),
    diaDaSemana: dataBrasilia.getDay(),
  };
}

function dentroDoHorarioComercial() {
  const { hora, minuto, diaDaSemana } = getDataHoraBrasilia();
  const minutosAgora = hora * 60 + minuto;

  const FIM = 22 * 60; // 22h00

  const ehSegundaASexta = diaDaSemana >= 1 && diaDaSemana <= 5;
  const ehSabado = diaDaSemana === 6;

  if (ehSegundaASexta) {
    const INICIO_SEMANA = 7 * 60; // 7h00
    return minutosAgora >= INICIO_SEMANA && minutosAgora < FIM;
  }

  if (ehSabado) {
    const INICIO_SABADO = 8 * 60; // 8h00
    return minutosAgora >= INICIO_SABADO && minutosAgora < FIM;
  }

  return false; // domingo, não envia
}

function iniciarAgendador() {
  cron.schedule('*/3 * * * *', async () => {
    if (estaPausado()) {
      console.log('[Agendador] Disparo pausado manualmente, aguardando retomada.');
      return;
    }

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

  console.log('[Agendador] Ativado — verificando leads novos a cada 3 minutos (seg-sex 7h-22h, sáb 8h-22h).');
}

module.exports = { iniciarAgendador };