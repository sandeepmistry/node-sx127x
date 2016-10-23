var util = require('util');
var events = require('events');

var async = require('async');
var onoff = require('onoff');
var spi = require('spi-device');

var SPI_OPTIONS = {
  mode: spi.MODE0,
  maxSpeedHz: 12E6
};

// registers
var REG_FIFO                 = 0x00;
var REG_OP_MODE              = 0x01;
var REG_FRF                  = 0x06;
var REG_PA_CONFIG            = 0x09;
var REG_FIFO_ADDR_PTR        = 0x0d;
var REG_FIFO_TX_BASE_ADDR    = 0x0e;
var REG_FIFO_RX_BASE_ADDR    = 0x0f;
var REG_FIFO_RX_CURRENT_ADDR = 0x10;
var REG_IRQ_FLAGS            = 0x12;
var REG_RX_NB_BYTES          = 0x13;
var REG_PKT_RSSI_VALUE       = 0x1a;
var REG_PAYLOAD_LENGTH       = 0x22;
var REG_DIO_MAPPING_1        = 0x40;
var REG_VERSION              = 0x42;

// modes
var MODE_LONG_RANGE_MODE     = 0x80;
var MODE_SLEEP               = 0x00;
var MODE_STDBY               = 0x01;
var MODE_TX                  = 0x03;
var MODE_RX_CONTINUOUS       = 0x05;

// PA config
var PA_BOOST                 = 0x80;

function SX127x(options) {
  this._spiBus = options.spiBus || 0;
  this._spiDevice = options.spiDevice || 0;
  this._resetPin = options.resetPin || 24;
  this._dio0Pin = options.dio0Pin || 25;
  this._frequency = options.frequency || 915e6;
}

util.inherits(SX127x, events.EventEmitter);

SX127x.prototype.open = function(callback)
{
  try {
    this._dio0Gpio = new onoff.Gpio(this._dio0Pin, 'in', 'rising');
    this._resetGpio = new onoff.Gpio(this._resetPin, 'out');
  } catch (e) {
    return callback(e);
  }

  async.series([
    function(callback) {
      this._spi = spi.open(this._spiBus, this._spiDevice, SPI_OPTIONS, callback);
    }.bind(this), function(callback) {
      this._reset(callback);
    }.bind(this), function(callback) {
      this.readVersion(callback);
    }.bind(this), function(callback) {
      this.sleep(callback);
    }.bind(this), function(callback) {
      this.writeFrequency(this._frequency, callback);
    }.bind(this), function(callback) {
      this._writeRegister(REG_FIFO_TX_BASE_ADDR, 0, callback);
    }.bind(this), function(callback) {
      this._writeRegister(REG_FIFO_RX_BASE_ADDR, 0, callback);
    }.bind(this), function(callback) {
      this.writeTxPower(17, callback);
    }.bind(this), function(callback) {
      this.idle(callback);
    }.bind(this)
  ], function(err, results) {
    if (err) {
      return callback(err);
    }

    var version = results[2];

    if (version != 0x12) {
      return callback(new Error('Invalid version ' + version + ', expected 0x12'));
    }

    this._dio0Gpio.watch(this._onDio0Rise.bind(this));

    callback();
  }.bind(this));
};

SX127x.prototype.close = function(callback) {
  this._spi.close(function(err) {
    if (err) {
      return callback(err);
    }

    this._spi = null;
    this._dio0Gpio.unexport();
    this._resetGpio.unexport();

    callback();
  }.bind(this));
};

SX127x.prototype.readVersion = function(callback) {
  this._readRegister(REG_VERSION, callback);
};

SX127x.prototype.writeFrequency = function(frequency, callback) {
  this._frequency = frequency;

  var frequencyBuffer = new Buffer(4);

  frequencyBuffer.writeInt32BE(Math.floor((frequency / 32000000) * 524288));

  frequencyBuffer = frequencyBuffer.slice(1);

  this._writeRegister(REG_FRF, frequencyBuffer, callback);
};

SX127x.prototype.writeTxPower = function(level, callback) {
  if (level < 2) {
    level = 2;
  } else if (level > 17) {
    level = 17;
  }

  this._writeRegister(REG_PA_CONFIG, PA_BOOST | (level - 2), callback);
};

SX127x.prototype.sleep = function(callback) {
  this._writeRegister(REG_OP_MODE, MODE_LONG_RANGE_MODE | MODE_SLEEP, callback);
};

SX127x.prototype.idle = function(callback) {
  this._writeRegister(REG_OP_MODE, MODE_LONG_RANGE_MODE | MODE_STDBY, callback);
};

SX127x.prototype.receive = function(callback) {
  this._writeRegister(REG_DIO_MAPPING_1, 0x00, function(err) {
    if (err) {
      return callback(err);
    }

    this._writeRegister(REG_OP_MODE, MODE_LONG_RANGE_MODE | MODE_RX_CONTINUOUS, callback);
  }.bind(this));
};

SX127x.prototype.write = function(data, callback) {
  this._writeCallback = callback;

  async.series([
    function(callback) {
      this.idle(callback);
    }.bind(this), function(callback) {
      this._writeRegister(REG_FIFO_ADDR_PTR, 0, callback);
    }.bind(this), function(callback) {
      this._writeRegister(REG_PAYLOAD_LENGTH, data.length, callback);
    }.bind(this), function(callback) {
      this._writeRegister(REG_FIFO, data, callback);
    }.bind(this), function(callback) {
      this._writeRegister(REG_DIO_MAPPING_1, 0x40, callback);
    }.bind(this), function(callback) {
      this._writeRegister(REG_OP_MODE, MODE_LONG_RANGE_MODE | MODE_TX, callback);
    }.bind(this)
  ]);
};

SX127x.prototype._reset = function(callback) {
  async.series([
    function(callback) {
      this._resetGpio.write(0, callback);
    }.bind(this), function(callback) {
      setTimeout(callback, 10);
    }.bind(this), function(callback) {
      this._resetGpio.write(1, callback);
    }.bind(this), function(callback) {
      setTimeout(callback, 10);
    }.bind(this)
  ], function(err) {
    callback(err);
  });
};

SX127x.prototype._readRegister = function(register, callback) {
  var readMessage = {
    sendBuffer: new Buffer([register & 0x7f, 0x00]),
    receiveBuffer: new Buffer(2),
    byteLength: 2
  };

  this._spi.transfer([readMessage], function(err, messages) {
    if (err) {
      return callback(err);
    }

    callback(null, messages[0].receiveBuffer.readUInt8(1));
  }.bind(this));
};

SX127x.prototype._readRegisterBytes = function(register, length, callback) {
  var sendBuffer = Buffer.concat([
    new Buffer([register & 0x7f]),
    new Buffer(length)
  ]);

  var readMessage = {
    sendBuffer: sendBuffer,
    receiveBuffer: new Buffer(sendBuffer.length),
    byteLength: sendBuffer.length
  };

  this._spi.transfer([readMessage], function(err, messages) {
    if (err) {
      return callback(err);
    }

    callback(null, messages[0].receiveBuffer.slice(1));
  }.bind(this));
};

SX127x.prototype._writeRegister = function(register, value, callback) {
  var sendBuffer;

  if (Buffer.isBuffer(value)) {
    sendBuffer = Buffer.concat([
      new Buffer([register | 0x80]),
      value
    ]);
  } else {
    sendBuffer = new Buffer([register | 0x80, value]);
  }

  var writeMessage = {
    sendBuffer: sendBuffer,
    byteLength: sendBuffer.length
  };

  this._spi.transfer([writeMessage], function(err) {
    if (err) {
      return callback(err);
    }

    callback();
  }.bind(this));
};

SX127x.prototype._onDio0Rise = function(err, value) {
  if (err || value === 0) {
    return;
  }

  if (this._writeCallback) {
    async.waterfall([
      function(callback) {
        this._readRegister(REG_IRQ_FLAGS, callback);
      }.bind(this), function(irqFlags, callback) {
        this._writeRegister(REG_IRQ_FLAGS, irqFlags, callback);
      }.bind(this), function(callback) {
        this._writeCallback();

        this._writeCallback = null;
      }.bind(this)
    ]);
  } else {
    var event = {};

    async.waterfall([
      function(callback) {
        this._readRegister(REG_IRQ_FLAGS, callback);
      }.bind(this), function(irqFlags, callback) {
        this._writeRegister(REG_IRQ_FLAGS, irqFlags, callback);
      }.bind(this), function(callback) {
        this._readRegister(REG_FIFO_RX_CURRENT_ADDR, callback);
      }.bind(this), function(rxAddr, callback) {
        this._writeRegister(REG_FIFO_ADDR_PTR, rxAddr, callback);
      }.bind(this), function(callback) {
        this._readRegister(REG_RX_NB_BYTES, callback);
      }.bind(this), function(nbBytes, callback) {
        this._readRegisterBytes(REG_FIFO, nbBytes, callback);
      }.bind(this), function(data, callback) {
        event.data = data;
        this._readRegister(REG_PKT_RSSI_VALUE, callback);
      }.bind(this), function(rssi, callback) {
        event.rssi = rssi - (this._frequency < 868E6 ? 164 : 157);
        this._writeRegister(REG_FIFO_ADDR_PTR, 0x00, callback);
      }.bind(this), function() {
        this.emit('data', event.data, event.rssi);
      }.bind(this)
    ]);
  }
};

module.exports = SX127x;
