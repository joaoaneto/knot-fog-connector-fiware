import _ from 'lodash';
import request from 'request-promise-native';
import config from 'config';
import mqtt from 'async-mqtt';

async function serviceExists(url, headers) {
  const service = await request.get({ url, headers, json: true });
  if (service.count > 0) {
    return true;
  }

  return false;
}

async function createService(iotAgentUrl, servicePath, apiKey, entityType) {
  const url = `${iotAgentUrl}/iot/services`;
  const service = config.get('service');
  const headers = {
    'fiware-service': service.name,
    'fiware-servicepath': servicePath,
  };

  if (await serviceExists(url, headers)) {
    return;
  }

  service.entity_type = entityType;
  service.apikey = apiKey;

  if (entityType === 'device') {
    service.attributes = [{
      name: 'online',
      type: 'Boolean',
    }];
  } else if (entityType === 'sensor') {
    service.attributes = [{
      name: 'value',
      type: 'string',
    }];
    service.commands = [
      {
        name: 'setData',
        type: 'command',
      },
      {
        name: 'getData',
        type: 'command',
      },
    ];
  }

  await request.post({
    url, headers, body: { services: [service] }, json: true,
  });
}

function mapDeviceToFiware(device) {
  return {
    device_id: device.id,
    entity_name: device.id,
    entity_type: 'device',
    protocol: 'IoTA-UL',
    transport: 'MQTT',
    static_attributes: [{
      name: 'name',
      type: 'string',
      value: device.name,
    }],
  };
}

function mapSchemaToFiware(schema) {
  const schemaAttributes = [];

  _.forOwn(schema, (value, key) => {
    schemaAttributes.push({
      name: key,
      type: typeof value,
      value,
    });
  });

  return schemaAttributes;
}

function mapSensorToFiware(id, schema) {
  return {
    device_id: schema.sensor_id.toString(),
    entity_name: schema.sensor_id.toString(),
    entity_type: 'sensor',
    protocol: 'IoTA-UL',
    transport: 'MQTT',
    static_attributes: [{
      name: 'device',
      type: 'string',
      value: id,
    }].concat(mapSchemaToFiware(schema)),
  };
}

function getDeviceSchema(device) {
  const schema = {};

  schema.sensor_id = parseInt(device.device_id, 10);

  device.static_attributes.forEach((attr) => {
    if (attr.name === 'value_type') {
      schema.value_type = attr.value;
    } else if (attr.name === 'unit') {
      schema.unit = attr.value;
    } else if (attr.name === 'type_id') {
      schema.type_id = attr.value;
    } else if (attr.name === 'name') {
      schema.name = attr.value;
    }
  });

  return schema;
}

function parseULValue(value) {
  if (value.indexOf('=') === -1) {
    return value;
  }

  const objValue = {};
  const attrs = value.split('|');

  attrs.forEach((attr) => {
    objValue[attr.slice(0, attr.indexOf('='))] = attr.slice(attr.indexOf('=') + 1, attr.length);
  });

  return objValue;
}

function parseULMessage(topic, message) {
  const apiKey = topic.split('/')[1];

  const entityId = message.slice(0, message.indexOf('@'));
  const command = message.slice(message.indexOf('@') + 1, message.indexOf('|'));
  const value = parseULValue(message.slice(message.indexOf('|') + 1, message.length));

  const id = apiKey === 'default' ? entityId : apiKey;

  return {
    id,
    entityId,
    command,
    value,
  };
}

class Connector {
  constructor(settings) {
    this.iotAgentUrl = `http://${settings.hostname}:${settings.port}`;
    this.iotAgentMQTT = `mqtt://${settings.hostname}`;
  }

  async start() {
    await createService(this.iotAgentUrl, '/device', 'default', 'device');

    return new Promise((resolve, reject) => {
      this.client = mqtt.connect(this.iotAgentMQTT);

      this.client.on('connect', () => resolve('connected'));
      this.client.on('reconnect', () => reject(new Error('trying to reconnect')));
      this.client.on('close', () => reject(new Error('disconnected')));
      this.client.on('error', error => reject(error));
    });
  }

  async addDevice(device) {
    const url = `${this.iotAgentUrl}/iot/devices`;
    const headers = {
      'fiware-service': 'knot',
      'fiware-servicepath': '/device',
    };

    const fiwareDevice = mapDeviceToFiware(device);

    await request.post({
      url, headers, body: { devices: [fiwareDevice] }, json: true,
    });
    await createService(this.iotAgentUrl, `/device/${device.id}`, device.id, 'sensor');
    await this.client.subscribe(`/default/${device.id}/cmd`);
  }

  async removeDevice(id) {
    const url = `${this.iotAgentUrl}/iot/devices/${id}`;
    const headers = {
      'fiware-service': 'knot',
      'fiware-servicepath': '/device',
    };

    await request.delete({ url, headers });
  }

  async listDevices() {
    const url = `${this.iotAgentUrl}/iot/devices`;
    const headers = {
      'fiware-service': 'knot',
      'fiware-servicepath': '/device',
    };

    const devices = await request.get({ url, headers, json: true });
    if (devices.count === 0) {
      return [];
    }

    const deviceList = [];
    const schemaList = [];

    const promises = devices.devices.map(async (device) => {
      const name = device.static_attributes.find(obj => obj.name === 'name').value;

      headers['fiware-servicepath'] = `/device/${device.device_id}`;
      const sensors = await request.get({ url, headers, json: true });

      sensors.devices.forEach(sensor => schemaList.push(getDeviceSchema(sensor)));

      deviceList.push({ id: device.device_id, name, schema: schemaList });
    });

    return new Promise(resolve => Promise.all(promises).then(() => resolve(deviceList)));
  }

  // Device (fog) to cloud

  async publishData(id, data) {
    await this.client.publish(`/${id}/${data.sensor_id}/attrs/value`, data.value);
  }

  async updateSchema(id, schemaList) {
    const sensors = [];
    const url = `${this.iotAgentUrl}/iot/devices`;

    const headers = {
      'fiware-service': 'knot',
      'fiware-servicepath': `/device/${id}`,
    };

    schemaList.map(async (schema) => {
      sensors.push(mapSensorToFiware(id, schema));
      await this.client.subscribe(`/${id}/${schema.sensor_id}/cmd`);
    });

    await request.post({
      url, headers, body: { devices: sensors }, json: true,
    });
  }

  async updateProperties(id, properties) {
    const url = `${this.iotAgentUrl}/iot/devices/${id}`;
    const headers = {
      'fiware-service': 'knot',
      'fiware-servicepath': '/device',
    };

    const property = Object.keys(properties)[0];
    const value = properties[property];

    const attribute = {
      name: property,
      type: typeof value,
    };

    await request.put({
      url, headers, body: { attributes: [attribute] }, json: true,
    });
    await this.client.publish(`/default/${id}/attrs/${property}`, value.toString());
  }

  // Cloud to device (fog)

  // cb(event) where event is { id, config: {} }
  onConfigUpdated(cb) {
    this.client.on('message', async (topic, payload) => {
      const msg = parseULMessage(topic.toString(), payload.toString());

      if (msg.command === 'setConfig') {
        const requiredProperties = ['sensor_id', 'event_flags', 'time_sec'];
        const configKeys = Object.keys(msg.value);

        if (!requiredProperties.every(val => configKeys.includes(val))) {
          const response = 'Some properties are required: sensor_id, event_flags and time_sec';
          await this.client.publish(`${topic}exe`, `${msg.id}@setConfig|${response}`);
          return;
        }

        _.forEach(msg.value, (value, key) => {
          msg.value[key] = !Number.isNaN(parseInt(value, 10))
            && Number.isFinite(parseInt(value, 10))
            ? parseInt(value, 10) : value;
        });

        await this.client.publish(`${topic}exe`, `${msg.id}@setConfig|`);

        cb({ id: msg.id, config: msg.value });
      }
    });
  }

  // cb(event) where event is { id, properties: {} }
  onPropertiesUpdated(cb) { // eslint-disable-line no-empty-function,no-unused-vars
  }

  // cb(event) where event is { id, sensorId }
  onDataRequested(cb) {
    this.client.on('message', async (topic, payload) => {
      const msg = parseULMessage(topic.toString(), payload.toString());

      if (msg.command === 'getData') {
        await this.client.publish(`${topic}exe`, payload);
        cb({ id: msg.id, sensorId: parseInt(msg.entityId, 10) });
      }
    });
  }

  // cb(event) where event is { id, sensorId, data }
  async onDataUpdated(cb) {
    this.client.on('message', async (topic, payload) => {
      const msg = parseULMessage(topic.toString(), payload.toString());

      if (msg.command === 'setData') {
        await this.client.publish(`${topic}exe`, payload);
        cb({ id: msg.id, sensorId: parseInt(msg.entityId, 10), data: msg.value });
      }
    });
  }
}

export { Connector }; // eslint-disable-line import/prefer-default-export
