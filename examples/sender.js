var SX127x = require('../index'); // or require('sx127x')

var sx127x = new SX127x({
  frequency: 915e6
});

var count = 0;

// open the device
sx127x.open(function(err) {
  console.log('open', err ? err : 'success');

  if (err) {
    throw err;
  }

  // send a message every second
  setInterval(function() {
    console.log('write: hello ' + count);
    sx127x.write(new Buffer('hello ' + count++), function(err) {
      console.log('\t', err ? err : 'success');
    });
  }, 1000);
});

process.on('SIGINT', function() {
  // close the device
  sx127x.close(function(err) {
    console.log('close', err ? err : 'success');
    process.exit();
  });
});
