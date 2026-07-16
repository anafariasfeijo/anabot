const { dispararPrimeiroContato } = require('./services/disparoService');

dispararPrimeiroContato()
  .then(() => {
    console.log('Disparo de teste concluído.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Erro no disparo de teste:', error);
    process.exit(1);
  });