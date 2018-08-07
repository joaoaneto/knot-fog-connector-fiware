const ioc = require('socket.io-client');

class Connector {
  async start(host, port) { // eslint-disable-line no-empty-function
    ioc.connect(`${host}:${port}/`);

    ioc.on('onConfigUpdated', (data) => {
      console.log(data);
    });

    ioc.on('onPropertiesUpdated', (data) => {
      console.log(data);
    });

    ioc.on('onDataRequested', (data) => {
      console.log(data);
    });
  }

  async addDevice(device) { // eslint-disable-line no-empty-function,no-unused-vars
    ioc.emit('addDevice', device);
  }

  async removeDevice(id) { // eslint-disable-line no-empty-function,no-unused-vars
    ioc.emit('removeDevice', id);
  }

  async listDevices() { // eslint-disable-line no-empty-function,no-unused-vars
  }

  // Device (fog) to cloud

  async publishData(id, data) { // eslint-disable-line no-empty-function,no-unused-vars
    ioc.emit('publishData', id, data);
  }

  async updateSchema(id, schema) { // eslint-disable-line no-empty-function,no-unused-vars
    ioc.emit('updateSchema', id, schema);
  }

  async updateProperties(id, properties) { // eslint-disable-line no-empty-function,no-unused-vars
    ioc.emit('updateProperties', id, properties);
  }

  // Cloud to device (fog)

  // cb(event) where event is { id, config: {} }
  onConfigUpdated(cb) { // eslint-disable-line no-empty-function,no-unused-vars
    ioc.on('onConfigUpdated', (data) => {
      cb(data);
    });
  }

  // cb(event) where event is { id, properties: {} }
  onPropertiesUpdated(cb) { // eslint-disable-line no-empty-function,no-unused-vars
    ioc.on('onPropertiesUpdated', (data) => {
      cb(data);
    });
  }

  // cb(event) where event is { id, sensorId }
  onDataRequested(cb) { // eslint-disable-line no-empty-function,no-unused-vars
    ioc.on('onDataRequested', (data) => {
      cb(data);
    });
  }

  // cb(event) where event is { id, sensorId, data }
  onDataUpdated(cb) { // eslint-disable-line no-empty-function,no-unused-vars
    ioc.on('onDataUpdated', (data) => {
      cb(data);
    });
  }
}

export { Connector }; // eslint-disable-line import/prefer-default-export
