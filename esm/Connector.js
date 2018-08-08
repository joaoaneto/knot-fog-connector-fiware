import * as socket from 'socket.io-client';

class Connector {
  async start(host, port) {
    this.iotaUrl = `http://${host}:${port}`;
    this.ioc = socket.connect(this.iotaUrl);
    if (this.ioc.connected) {
      return Promise.resolve(`Connected to ${this.iotaUrl}`);
    }
    return Promise.reject(new Error(`Error connecting to IoT Agent (${this.iotaUrl})`));
  }

  async addDevice(device) {
    this.ioc.emit('addDevice', device, (response) => {
      if (response === 'ok') {
        return Promise.resolve(`Device ${device.id} added`);
      }
      return Promise.reject(new Error(`Error adding device ${device.id}: ${response}`));
    });
  }

  async removeDevice(id) {
    this.ioc.emit('removeDevice', id, (response) => {
      if (response === 'ok') {
        return Promise.resolve(`Device ${id} removed`);
      }
      return Promise.reject(new Error(`Error removing device ${id}: ${response}`));
    });
  }

  async listDevices() { // eslint-disable-line no-empty-function,no-unused-vars
  }

  // Device (fog) to cloud

  async publishData(id, data) {
    this.ioc.emit('publishData', id, data, (response) => {
      if (response === 'ok') {
        return Promise.resolve(`Device ${id} data published`);
      }
      return Promise.reject(new Error(`Error updating data for device ${id}: ${response}`));
    });
  }

  async updateSchema(id, schema) {
    this.ioc.emit('updateSchema', id, schema, (response) => {
      if (response === 'ok') {
        return Promise.resolve(`Device ${id} schema updated`);
      }
      return Promise.reject(new Error(`Error updating schema for device ${id}: ${response}`));
    });
  }

  async updateProperties(id, properties) {
    this.ioc.emit('updateProperties', id, properties, (response) => {
      if (response === 'ok') {
        return Promise.resolve(`Device ${id} properties updated`);
      }
      return Promise.reject(new Error(`Error updating properties for device ${id}: ${response}`));
    });
  }

  // Cloud to device (fog)

  // cb(event) where event is { id, config: {} }
  onConfigUpdated(cb) {
    this.ioc.on('onConfigUpdated', (data) => {
      cb(data);
    });
  }

  // cb(event) where event is { id, properties: {} }
  onPropertiesUpdated(cb) {
    this.ioc.on('onPropertiesUpdated', (data) => {
      cb(data);
    });
  }

  // cb(event) where event is { id, sensorId }
  onDataRequested(cb) {
    this.ioc.on('onDataRequested', (data) => {
      cb(data);
    });
  }

  // cb(event) where event is { id, sensorId, data }
  onDataUpdated(cb) {
    this.ioc.on('onDataUpdated', (data) => {
      cb(data);
    });
  }
}

export { Connector }; // eslint-disable-line import/prefer-default-export
