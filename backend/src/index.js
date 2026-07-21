const express = require('express');
const config = require('./config/env');
const webhookRoutes = require('./routes/webhook');
const leadsRoutes = require('./routes/leads');
const { iniciarAgendador } = require('./services/agendador');

const app = express();
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Backend do bot de prospecção rodando!' });
});

app.use('/webhook', webhookRoutes);
app.use('/leads', leadsRoutes);

app.listen(config.port, () => {
  console.log(`Servidor rodando em http://localhost:${config.port}`);
  iniciarAgendador();
});
