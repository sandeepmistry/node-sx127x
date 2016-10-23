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

  // add a event listener for data events
  sx127x.on('data', function(data, rssi) {
    console.log('data:', '\'' + data.toString() + '\'', rssi);
  });

  // enable receive mode
  sx127x.receive(function(err) {
    console.log('receive', err ? err : 'success');
  });
});

process.on('SIGINT', function() {
  // close the device
  sx127x.close(function(err) {
    console.log('close', err ? err : 'success');
    process.exit();
  });
});
