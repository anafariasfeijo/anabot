const { importarLeads } = require('./services/importService');

const caminho = process.argv[2];

if (!caminho) {
  console.log('Uso: node src/testImport.js caminho/para/arquivo.csv');
  process.exit(1);
}

importarLeads(caminho)
  .then((resultado) => {
    console.log('\n=== Resultado da importação ===');
    console.log(`Total de linhas: ${resultado.total}`);
    console.log(`Importados com sucesso: ${resultado.sucesso}`);
    console.log(`Erros: ${resultado.erros.length}`);
    if (resultado.erros.length > 0) {
      console.log('\nDetalhes dos erros:');
      resultado.erros.forEach((e) => console.log(' - ' + e));
    }
  })
  .catch((error) => {
    console.error('Erro ao importar:', error);
  });