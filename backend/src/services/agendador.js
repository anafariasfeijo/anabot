const cron = require('node-cron');
const { dispararPrimeiroContato, estaPausado } = require('./disparoService');

function getDataHoraBrasilia() {
  const agora = new Date();
  const hora = parseInt(
    agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false })
  );
  const minuto = parseInt(
    agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', minute: '2-digit' })
  );
  const diaDaSemana = parseInt(
    agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'numeric' })
  );
  return { hora, minuto, diaDaSemana };
}

function dentroDoHorarioComercial() {
  const { hora, minuto, diaDaSemana } = getDataHoraBrasilia();
  const minutosAgora = hora * 60 + minuto;

  const FIM = 19 * 60 + 30;

  const ehSegundaASexta = diaDaSemana >= 1 && diaDaSemana <= 5;
  const ehSabado = diaDaSemana === 6;

  if (ehSegundaASexta) {
    const INICIO_SEMANA = 8 * 60;
    return minutosAgora >= INICIO_SEMANA && minutosAgora < FIM;
  }

  if (ehSabado) {
    const INICIO_SABADO = 8 * 60;
    return minutosAgora >= INICIO_SABADO && minutosAgora < FIM;
  }

  return false;
}

function iniciarAgendador() {
  cron.schedule('*/15 * * * *', async () => {
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

  console.log('[Agendador] Ativado — verificando leads novos a cada 15 minutos (seg-sex 7h-19h30, sáb 8h-19h30).');
}

module.exports = { iniciarAgendador };
