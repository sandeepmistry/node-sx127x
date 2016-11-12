# node-sx127x

Node.js driver for [Semtech SX1276/77/78/79](http://www.semtech.com/apps/product.php?pn=SX1276) based LoRa radios.

Requires a **Linux** computer with SPI hardware, like a Raspberry Pi.

Built on top of [@fivdi](https://github.com/fivdi)'s [onoff](https://github.com/fivdi/onoff) and [spi-device](https://github.com/fivdi/spi-device) modules.

## Prerequisites

 * Linux computer with SPI hardware
 * Node.js installed
 * SPI driver installed and enabled
   * [Instructions for Raspberry Pi](https://www.raspberrypi.org/documentation/hardware/raspberrypi/spi/README.md)

# Hardware Wiring

| Semtech SX1276/77/78/79 | Generic Linux | Raspberry Pi |
| :---------------------: | :-----------: | :----------: |
| VCC | 3.3V | 3.3V |
| GND | GND | GND |
| SCK | SCK | SCK (pin 11) |
| MISO | MISO | MISO (pin 10) |
| MOSI | MOSI | MOSI (pin 9) |
| NSS | Chip enable/select | CS0 (pin 8) or CS1 (pin 7) |
| NRESET | GPIO pin | GPIO pin |
| DIO0 | GPIO pin | GPIO pin |

## Installation

```sh
npm install sx127x
```

## API

See [API.md](API.md).

## Examples

See [examples](examples) folder.

## License

This libary is [licensed](LICENSE) under the [MIT Licence](http://en.wikipedia.org/wiki/MIT_License).
