var commander = require('commander');



commander
  .version('0.0.1')
  .option('--appcache', 'enable appcache')
  .parse(process.argv);


