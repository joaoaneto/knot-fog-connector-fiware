import request from 'request-promise-native';
import mqtt from 'mqtt';

const headers = {
  'fiware-service': 'knot',
  'fiware-servicepath': '/'
}

const apiKey = 'knot123';

function mapDeviceToFiware(device) {
  return {
    devices: [{
      device_id: device.id,
      entity_name: device.name,
      entity_type: 'device',
      protocol:'IoTA-UL',
      transport: 'MQTT',
      attributes: [{
          object_id: 'o',
          name: 'online',
          type: 'Boolean'
      }]
    }]
  }
}

function mapSensorToFiware(id, schema) {
  return {
    devices: [{
      device_id: schema[0].sensor_id,
      entity_name: schema[0].name,
      entity_type: 'sensor',
      protocol:'IoTA-UL',
      transport: 'MQTT',
      attributes: [{
          object_id: 'o',
          name: 'online',
          type: 'Boolean'
      }],
      commands: [
        {
          name: 'setData',
          type: 'command'
        },
        {
          name: 'getData',
          type: 'command'
        }
      ],
      static_attributes: [{
          name: 'device',
          type: 'string',
          value: id
      }]
    }]
  }
}

class Connector {
  async start() {

  }

  async addDevice(device) {
    const url = '';
    const fiwareDevice = mapDeviceToFiware(device);
    await request.post({url, headers: headers, json: true}).form(fiwareDevice);
  }

  async removeDevice(id) {
    const url = `http://localhost:4041/iot/devices/${id}`;
    await request.delete({url, headers: headers});
  }

  async listDevices() {
    const url = 'http://localhost:4041/iot/devices';
    return request.get({url, headers:headers});
  }

  // Device (fog) to cloud

  async publishData(id, data) {
    this.iota.publish(`/${apiKey}/${data.sensor_id}/attrs/${data.sensor_id}`, data.value);
  }

  async updateSchema(id, schema) {
    schema.forEach((schema) => {
      const sensorFiware = mapSensorToFiware(id, schema);
      await request.post({url, headers: headers, json: true}).form(sensorFiware);
    });
  }

  async updateProperties(id, properties) {
  }

  // Cloud to device (fog)

  // cb(event) where event is { id, config: {} }
  onConfigUpdated(cb) {
  }

  // cb(event) where event is { id, properties: {} }
  onPropertiesUpdated(cb) {
  }

  // cb(event) where event is { id, sensorId }
  onDataRequested(cb) {
    // subscribe to listen getData command
    this.iota.subscribe(`/${apiKey}/#/cmd`);
  }

  // cb(event) where event is { id, sensorId, data }
  onDataUpdated(cb) {
    // subscribe to listen setData command
  }
}

export { Connector }; // eslint-disable-line import/prefer-default-export
