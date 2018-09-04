import _ from 'lodash';
import request from 'request-promise-native';
import mqtt from 'async-mqtt';

const headers = {
  'fiware-service': 'knot',
  'fiware-servicepath': '/'
}

const apiKey = 'test';

function mapSchemaToFiware(schema) {
  let schemaAttributes = [];

  _.forOwn(schema, (value, key) => {
    schemaAttributes.push({
      name: key,
      type: typeof value,
      value: value
    });
  });

  return schemaAttributes;
}

function mapDeviceToFiware(device) {
  return {
    devices: [{
      device_id: device.id,
      entity_name: device.id,
      entity_type: 'device',
      protocol:'IoTA-UL',
      transport: 'MQTT',
      attributes: [{
          name: 'online',
          type: 'Boolean'
      }],
      static_attributes: [{
          name: 'name',
          type: 'string',
          value: device.name
      }]
    }]
  }
}

function mapSensorToFiware(id, schema) {
  return {
    device_id: schema.sensor_id,
    entity_name: schema.sensor_id,
    entity_type: 'sensor',
    protocol:'IoTA-UL',
    transport: 'MQTT',
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
    }].concat(mapSchemaToFiware(schema)),
  }
}

class Connector {
  constructor(settings) {
    this.iotaUrl = `http://${settings.hostname}:${settings.port}/iot/devices`;
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.client = mqtt.connect('mqtt://localhost');

      this.client.on('connect', () => resolve('connected'));
      this.client.on('reconnect', () => reject('trying to reconnect'));
      this.client.on('close', () => reject('disconnected'));
      this.client.on('error', (error) => reject(`connection error: ${error}`));      
    });
  }

  async addDevice(device) {
    const fiwareDevice = mapDeviceToFiware(device);
    
    console.log(fiwareDevice);

    await request.post({url: this.iotaUrl, headers: headers, body: fiwareDevice, json: true});
  }

  async removeDevice(id) {
    const url = `${this.iotaUrl}/${id}`;
    await request.delete({url, headers: headers});
  }

  async listDevices() {
    return request.get({url: this.iotaUrl, headers:headers});
  }

  // Device (fog) to cloud

  async publishData(id, data) {
    await this.client.publish(`/${apiKey}/${id}/attrs/o`, data.value);
  }

  async updateSchema(id, schemaList) {
    let sensors = [];

    schemaList.map((schema) => {
      sensors.push(mapSensorToFiware(id, schema));
    });

    await request.post({url: this.iotaUrl, headers: headers, body: sensors, json: true});
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
