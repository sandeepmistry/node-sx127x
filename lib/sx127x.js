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
var REG_FIFO                   = 0x00;
var REG_OP_MODE                = 0x01;
var REG_FRF                    = 0x06;
var REG_PA_CONFIG              = 0x09;
var REG_LNA                    = 0x0c;
var REG_FIFO_ADDR_PTR          = 0x0d;
var REG_FIFO_TX_BASE_ADDR      = 0x0e;
var REG_FIFO_RX_BASE_ADDR      = 0x0f;
var REG_FIFO_RX_CURRENT_ADDR   = 0x10;
var REG_IRQ_FLAGS              = 0x12;
var REG_RX_NB_BYTES            = 0x13;
var REG_PKT_RSSI_VALUE         = 0x1a;
var REG_PKT_SNR_VALUE          = 0x1b;
var REG_MODEM_CONFIG_1         = 0x1d;
var REG_MODEM_CONFIG_2         = 0x1e;
var REG_PREAMBLE               = 0x20;
var REG_PAYLOAD_LENGTH         = 0x22;
var REG_MODEM_CONFIG_3         = 0x26;
var REG_RSSI_WIDEBAND          = 0x2c;
var REG_DETECTION_OPTIMIZE     = 0x31;
var REG_DETECTION_THRESHOLD    = 0x37;
var REG_SYNC_WORD              = 0x39;
var REG_DIO_MAPPING_1          = 0x40;
var REG_VERSION                = 0x42;

// modes
var MODE_LONG_RANGE_MODE       = 0x80;
var MODE_SLEEP                 = 0x00;
var MODE_STDBY                 = 0x01;
var MODE_TX                    = 0x03;
var MODE_RX_CONTINUOUS         = 0x05;

// PA config
var PA_BOOST                   = 0x80;

// IRQ masks
var IRQ_PAYLOAD_CRC_ERROR_MASK = 0x20;

function SX127x(options) {
  this._spiBus = options.spiBus || 0;
  this._spiDevice = options.spiDevice || 0;
  this._resetPin = options.resetPin || 24;
  this._dio0Pin = options.dio0Pin || 25;
  this._frequency = options.frequency || 915e6;
  this._spreadingFactor = options.spreadingFactor || 7;
  this._signalBandwidth = options.signalBandwidth || 125E3;
  this._codingRate = options.codingRate || (4 / 5);
  this._preambleLength = options.preambleLength || 8;
  this._syncWord = options.syncWord || 0x12;
  this._txPower = options.txPower || 17;
  this._crc = options.crc || false;
  this._implicitHeaderMode = false;
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
      this.setFrequency(this._frequency, callback);
    }.bind(this), function(callback) {
      this.setSpreadingFactor(this._spreadingFactor, callback);
    }.bind(this), function(callback) {
      this.setSignalBandwidth(this._signalBandwidth, callback);
    }.bind(this), function(callback) {
      this.setCodingRate(this._codingRate, callback);
    }.bind(this), function(callback) {
      this.setPreambleLength(this._preambleLength, callback);
    }.bind(this), function(callback) {
      this.setSyncWord(this._syncWord, callback);
    }.bind(this), function(callback) {
      this.setCrc(this._crc, callback);
    }.bind(this), function(callback) {
      this._writeRegister(REG_FIFO_TX_BASE_ADDR, 0, callback);
    }.bind(this), function(callback) {
      this._writeRegister(REG_FIFO_RX_BASE_ADDR, 0, callback);
    }.bind(this), function(callback) {
      this.setLnaBoost(true, callback);
    }.bind(this), function(callback) {
      // auto AGC
      this._writeRegister(REG_MODEM_CONFIG_3, 0x04, callback);
    }.bind(this), function(callback) {
      this.setTxPower(this._txPower, callback);
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

SX127x.prototype.setFrequency = function(frequency, callback) {
  this._frequency = frequency;

  var frequencyBuffer = new Buffer(4);

  frequencyBuffer.writeInt32BE(Math.floor((frequency / 32000000) * 524288));

  frequencyBuffer = frequencyBuffer.slice(1);

  this._writeRegister(REG_FRF, frequencyBuffer, callback);
};

SX127x.prototype.setLnaBoost = function(boost, callback) {
  async.waterfall([
    function(callback) {
      this._readRegister(REG_LNA, callback);
    }.bind(this), function(lna) {
      if (boost) {
        lna |= 0x03;
      } else {
        lna &= 0xfc;
      }

      this._writeRegister(REG_LNA, lna, callback);
    }.bind(this)
  ]);
};

SX127x.prototype.setTxPower = function(level, callback) {
  if (level < 2) {
    level = 2;
  } else if (level > 17) {
    level = 17;
  }

  this._txPower = level;

  this._writeRegister(REG_PA_CONFIG, PA_BOOST | (level - 2), callback);
};

SX127x.prototype.setSpreadingFactor = function(sf, callback) {
  if (sf < 6) {
    sf = 6;
  } else if (sf > 12) {
    sf = 12;
  }

  this._spreadingFactor = sf;

  var detectionOptimize = (sf === 6) ? 0xc5 : 0xc3;
  var detectionThreshold = (sf === 6) ? 0x0c : 0x0a;

  async.waterfall([
    function(callback) {
      this._writeRegister(REG_DETECTION_OPTIMIZE, detectionOptimize, callback);
    }.bind(this), function(callback) {
      this._writeRegister(REG_DETECTION_THRESHOLD, detectionThreshold, callback);
    }.bind(this), function(callback) {
      this._readRegister(REG_MODEM_CONFIG_2, callback);
    }.bind(this), function(regModemConfig2) {
      regModemConfig2 &= 0x0f;
      regModemConfig2 |= (sf << 4);

      this._writeRegister(REG_MODEM_CONFIG_2, regModemConfig2, callback);
    }.bind(this)
  ]);
};

SX127x.prototype.setSignalBandwidth = function(sbw, callback) {
  var bw;

  if (sbw <= 7.8E3) {
    bw = 0;
  } else if (sbw <= 10.4E3) {
    bw = 1;
  } else if (sbw <= 15.6E3) {
    bw = 2;
  } else if (sbw <= 20.8E3) {
    bw = 3;
  } else if (sbw <= 31.25E3) {
    bw = 4;
  } else if (sbw <= 41.7E3) {
    bw = 5;
  } else if (sbw <= 62.5E3) {
    bw = 6;
  } else if (sbw <= 125E3) {
    bw = 7;
  } else if (sbw <= 250E3) {
    bw = 8;
  } else /*if (sbw <= 250E3)*/ {
    bw = 9;
  }

  this._signalBandwidth = sbw;

  async.waterfall([
    function(callback) {
      this._readRegister(REG_MODEM_CONFIG_1, callback);
    }.bind(this), function(regModemConfig1) {
      regModemConfig1 &= 0x0f;
      regModemConfig1 |= (bw << 4);

      this._writeRegister(REG_MODEM_CONFIG_1, regModemConfig1, callback);
    }.bind(this)
  ]);
};

SX127x.prototype.setCodingRate = function(cr, callback) {
  var denominator;
  
  if (cr <= (4/8)) { denominator = 8; } else if (cr <= (4/7)) { denominator = 7; } else if (cr <= (4/6)) { denominator = 6; } else { denominator = 5; }
  
  this._codingRate = (4 / denominator);

  cr = denominator - 4;

  async.waterfall([
    function(callback) {
      this._readRegister(REG_MODEM_CONFIG_1, callback);
    }.bind(this), function(regModemConfig1) {
      regModemConfig1 &= 0xf1;
      regModemConfig1 |= (cr << 1);

      this._writeRegister(REG_MODEM_CONFIG_1, regModemConfig1, callback);
    }.bind(this)
  ]);
};

SX127x.prototype.setPreambleLength = function(length, callback) {
  var lengthBuffer = new Buffer(2);

  this._preambleLength = length;

  lengthBuffer.writeUInt16BE(length, 0);

  this._writeRegister(REG_PREAMBLE, lengthBuffer, callback);
};

SX127x.prototype.setSyncWord = function(sw, callback) {
  this._syncWord = sw;

  this._writeRegister(REG_SYNC_WORD, sw, callback);
};

SX127x.prototype.setCrc = function(crc, callback) {
  this._crc = crc;

  async.waterfall([
    function(callback) {
      this._readRegister(REG_MODEM_CONFIG_2, callback);
    }.bind(this), function(regModemConfig2) {
      if (crc) {
        regModemConfig2 |= 0x04;
      } else {
        regModemConfig2 &= 0xfb;
      }

      this._writeRegister(REG_MODEM_CONFIG_2, regModemConfig2, callback);
    }.bind(this)
  ]);
};

SX127x.prototype.readRandom = function(callback) {
  this._readRegister(REG_RSSI_WIDEBAND, callback);
};

SX127x.prototype.sleep = function(callback) {
  this._writeRegister(REG_OP_MODE, MODE_LONG_RANGE_MODE | MODE_SLEEP, callback);
};

SX127x.prototype.idle = function(callback) {
  this._writeRegister(REG_OP_MODE, MODE_LONG_RANGE_MODE | MODE_STDBY, callback);
};

SX127x.prototype.receive = function(length, callback) {
  if (arguments.length === 1) {
    callback = length;
    length = 0;
  }

  this._implicitHeaderMode = (length) ? true : false;

  async.waterfall([
    function(callback) {
      this._readRegister(REG_MODEM_CONFIG_1, callback);
    }.bind(this), function(regModemConfig1, callback) {
      if (this._implicitHeaderMode) {
        regModemConfig1 |= 0x01;
      } else {
        regModemConfig1 &= 0xfe;
      }

      this._writeRegister(REG_MODEM_CONFIG_1, regModemConfig1, callback);
    }.bind(this), function(callback) {
      this._writeRegister(REG_PAYLOAD_LENGTH, length, callback);
    }.bind(this), function(callback) {
      this._writeRegister(REG_DIO_MAPPING_1, 0x00, callback);
    }.bind(this), function() {
      this._writeRegister(REG_OP_MODE, MODE_LONG_RANGE_MODE | MODE_RX_CONTINUOUS, callback);
    }.bind(this)
  ]);
};

SX127x.prototype.write = function(data, implicitHeader, callback) {
  if (arguments.length === 2) {
    callback = implicitHeader;
    implicitHeader = false;
  }

  this._writeCallback = callback;

  async.waterfall([
    function(callback) {
      this._readRegister(REG_MODEM_CONFIG_1, callback);
    }.bind(this), function(regModemConfig1, callback) {
      if (implicitHeader) {
        regModemConfig1 |= 0x01;
      } else {
        regModemConfig1 &= 0xfe;
      }

      this._writeRegister(REG_MODEM_CONFIG_1, regModemConfig1, callback);
    }.bind(this), function(callback) {
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
  ], function (err, success) {
        if (err) {
          return callback(err);
        }
        callback();
  });
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
      }.bind(this), function() {
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
        event.irqFlags = irqFlags;
        this._writeRegister(REG_IRQ_FLAGS, irqFlags, callback);
      }.bind(this), function(callback) {
        this._readRegister(REG_FIFO_RX_CURRENT_ADDR, callback);
      }.bind(this), function(rxAddr, callback) {
        this._writeRegister(REG_FIFO_ADDR_PTR, rxAddr, callback);
      }.bind(this), function(callback) {
        this._readRegister(this._implicitHeaderMode ? REG_PAYLOAD_LENGTH : REG_RX_NB_BYTES, callback);
      }.bind(this), function(nbBytes, callback) {
        this._readRegisterBytes(REG_FIFO, nbBytes, callback);
      }.bind(this), function(data, callback) {
        event.data = data;
        this._readRegister(REG_PKT_RSSI_VALUE, callback);
      }.bind(this), function(rssi, callback) {
        event.rssi = rssi - (this._frequency < 868E6 ? 164 : 157);
        this._readRegister(REG_PKT_SNR_VALUE, callback);
      }.bind(this), function(snr, callback) {
        event.snr = (new Buffer([snr])).readInt8() * 0.25;
        this._writeRegister(REG_FIFO_ADDR_PTR, 0x00, callback);
      }.bind(this), function() {
        if ((event.irqFlags & 0x20) === 0) {
          this.emit('data', event.data, event.rssi, event.snr);
        } else {
          this.emit('error', event.data, event.rssi, event.snr);
        }
      }.bind(this)
    ]);
  }
};

module.exports = SX127x;
