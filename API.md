# node-sx127x API

## Import Library

```js
var SX127x = require('sx127x');
```

## Create device

```js
var options = {
  // ...
};

var sx127x = new SX127x(options);
```

Supported options:

| Name | Default | Description |
|------|---------|-------------|
| `spiBus` | `0` | SPI bus to use |
| `spiDevice` | `0` | SPI chip select/enable to use |
| `resetPin` | `24` | GPIO pin number of reset pin |
| `dio0Pin` | `25` | GPIO pin number of DIO0 pin |
| `frequency` | `915e6` | Frequency of radio in Hz, see [setFrequency](#frequency) for supported values |
| `spreadingFactor` | `7` | Spreading factor of radio, see [setSpreadingFactor](#spreading-factor) for supported values  |
| `signalBandwidth` | `125E3` | Signal bandwidth of radio in Hz, see [setSignalBandwidth](#signal-bandwidth) for supported values  |
| `codingRate` | `4 / 5` | Coding rate of radio, see [setCodingRate](#coding-rate) for supported values |
| `preambleLength` | `8` | Preamble length of radio, see [setPreambleLength](#preamble-length) for supported values |
| `syncWord` | `0x12` | Sync word of radio, see [setSyncWord](#sync-word) for supported values |
| `txPower` | `17` | TX power of radio, see [setTxPower](#tx-power) for supported values |
| `crc` | `false` | Enable or disable CRC usage |


## Open

Open and configure the device:

```js
sx127x.open(callback(err));
```

### Close

Close the device:

```js
sx127x.close(callback(err));
```

## Sending data

```js
var data = new Buffer(/* ... */);

// ...

sx127x.write(data [, implicitHeader, callabck(err)]);
```

 * `data` - Node.js Buffer containing data to send.
 * `implicitHeader` - (optional) if `true`, sends data in implicit header mode, otherwise explicit header mode is used. Defaults to `false`.

## Receiving data

```js
sx127x.on('data', function(data, rssi, snr) {
  // ...
});

sx127x.receive([length, callback(err)]);
```

 * `length` - (optional) if `> 0`, receives data of size `length` in implicit header mode, otherwise explicit header mode is used. Defaults to `0`.

`data` event:

  * `data` - Node.js Buffer containing received data.
  * `rssi` - RSSI of received data.
  * `snr` - SNR of received data.

### Sleep mode

Put the radio in sleep mode.

```js
sx127x.sleep(callback(err));
```

### Idle mode

Put the radio in idle mode.

```js
sx127x.idle(callback(err));
```

## Radio parameters

### TX Power

Change the TX power of the radio.

```js
sx127x.setTxPower(txPower, callback(err));
```
 * `txPower` - TX power in dB, defaults to `17`

 Supported values are between `2` and `17`.

### Frequency

Change the frequency of the radio.

```js
sx127x.setFrequency(frequency, callback(error));
```
 * `frequency` - frequency in Hz (`433E6`, `866E6`, `915E6`)

### Spreading Factor

Change the spreading factor of the radio.

```js
sx127x.setSpreadingFactor(spreadingFactor, callback(err));
```
 * `spreadingFactor` - spreading factor, defaults to `7`

Supported values are between `6` and `12`. If a spreading factor of `6` is set, implicit header mode must be used to transmit and receive packets.

### Signal Bandwidth

Change the signal bandwidth of the radio.

```js
sx127x.setSignalBandwidth(signalBandwidth, callback(err));
```

 * `signalBandwidth` - signal bandwidth in Hz, defaults to `125E3`.

Supported values are `7.8E3`, `10.4E3`, `15.6E3`, `20.8E3`, `31.25E3`, `41.7E3`, `62.5E3`, `125E3`, and `250E3`.

### Coding Rate

Change the coding rate of the radio.

```js
sx127x.setCodingRate4(codingRate, callback(err));
```

 * `codingRate` - coding rate, defaults to `4/5`

Supported values are `4/5`, `4/6`, `4/7` and `4/8`.

### Preamble Length

Change the preamble length of the radio.

```js
sx127x.setPreambleLength(preambleLength, callback(err));
```

 * `preambleLength` - preamble length in symbols, defaults to `8`

Supported values are between `6` and `65535`.

### Sync Word

Change the sync word of the radio.

```js
sx127x.setSyncWord(syncWord, callback(err));
```

 * `syncWord` - byte value to use as the sync word, defaults to `0x34`

### CRC

Enable or disable CRC usage, by default a CRC is not used.

```js
sx127x.crc(crc, callback(err));
```

 * `crc` - `true` to enable CRC, `false` to disable

## Other functions

### Random

Generate a random byte, based on the Wideband RSSI measurement.

```js
sx127x.readRandom(callback(err, data));
```
