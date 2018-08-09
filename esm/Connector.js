/* eslint-disable no-console */
import * as socket from 'socket.io-client';

class Connector {
  async start(host, port) {
    this.iotaUrl = `http://${host}:${port}`;
    this.ioc = socket.connect(this.iotaUrl);

    // TODO: Remove events after tests
    this.ioc.on('error', () => { console.log('Socket error.'); });
    this.ioc.on('disconnect', () => { console.log('Socket disconnect.'); });
    this.ioc.on('reconnect', () => { console.log('Socket reconnected.'); });
    this.ioc.on('reconnect_attempt', () => { console.log('Socket attempt.'); });
    this.ioc.on('reconnecting', () => { console.log('Socket reconnecting.'); });
    this.ioc.on('reconnect_error', () => { console.log('Socket reconnect error.'); });
    this.ioc.on('reconnect_failed', () => { console.log('Socket reconnect failed.'); });

    return new Promise((resolve, reject) => {
      this.ioc.on('connected', () => { resolve(`Connected to ${this.iotaUrl}`); });
      this.ioc.on('connect_error', () => { reject(new Error(`Connection to ${this.iotaUrl} error.`)); });
      this.ioc.on('connect_timeout', () => { reject(new Error(`Connection to ${this.iotaUrl} timeout.`)); });
    });
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

  async listDevices() {
    this.ioc.emit('listDevices', (response) => {
      if (response === 'ok') {
        return Promise.resolve('Devices listed');
      }
      return Promise.reject(new Error(`Error removing device ${id}: ${response}`));
    });
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
    this.ioc.on('onDataUpdated', (device, attributes) => {
      const sensorId = device.id;
      let id = null;
      const data = attributes.value;
      const sat = device.staticAttributes;
      for (let i = 0; i < sat.length; i += 1) {
        if (sat[i].name === 'thing') {
          id = sat[i].value;
        }
      }
      cb(id, sensorId, data);
    });
  }
}

export { Connector }; // eslint-disable-line import/prefer-default-export
