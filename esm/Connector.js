import _ from 'lodash';
import request from 'request-promise-native';
import mqtt from 'async-mqtt';

async function serviceExists(url, headers) {
  const service = await request.get({ url, headers, json: true });
  return service.count > 0;
}

async function createService(iotAgentUrl, serviceConfig, servicePath, apiKey, entityType) {
  const url = `${iotAgentUrl}/iot/services`;
  const service = serviceConfig;
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
    service.commands = [
      {
        name: 'setConfig',
        type: 'command',
      },
      {
        name: 'setProperties',
        type: 'command',
      },
    ];
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

function mapSensorToFiware(id, schema) {
  const schemaList = _.map(schema, (value, key) => ({ name: key, type: typeof value, value }));

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
    }].concat(schemaList),
  };
}

function mapSensorFromFiware(device) {
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

async function messageHandler(topic, payload) {
  const message = parseULMessage(topic.toString(), payload.toString());
  if (message.command === 'setData') {
    await this.client.publish(`${topic}exe`, payload);
    this.onDataUpdatedCb(
      { id: message.id, sensorId: parseInt(message.entityId, 10), data: message.value },
    );
  } else if (message.command === 'getData') {
    await this.client.publish(`${topic}exe`, payload);
    this.onDataRequestedCb(
      { id: message.id, sensorId: parseInt(message.sensorId, 10) },
    );
  }
}

class Connector {
  constructor(settings) {
    this.serviceConfig = settings.service;
    this.iotAgentUrl = `http://${settings.hostname}:${settings.port}`;
    this.iotAgentMQTT = `mqtt://${settings.hostname}`;
  }

  async start() {
    this.onDataUpdatedCb = _.noop();
    this.onDataRequestedCb = _.noop();

    await createService(this.iotAgentUrl, this.serviceConfig, '/device', 'default', 'device');

    return new Promise((resolve, reject) => {
      this.client = mqtt.connect(this.iotAgentMQTT);

      this.client.on('connect', () => {
        this.client.on('message', async (topic, payload) => {
          messageHandler.call(this, topic, payload);
        });
        return resolve();
      });
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
    await createService(this.iotAgentUrl, this.serviceConfig, `/device/${device.id}`, device.id, 'sensor');
  }

  async removeDevice(id) { // eslint-disable-line no-empty-function,no-unused-vars
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

    return Promise.all(devices.devices.map(async (device) => {
      const name = device.static_attributes.find(obj => obj.name === 'name').value;

      headers['fiware-servicepath'] = `/device/${device.device_id}`;
      const sensors = await request.get({ url, headers, json: true });

      const schemaList = sensors.devices.map(sensor => mapSensorFromFiware(sensor));

      return { id: device.device_id, name, schema: schemaList };
    }));
  }

  // Device (fog) to cloud

  async publishData(id, dataList) {
    const promises = dataList.map(async (data) => {
      await this.client.publish(`/${id}/${data.sensor_id}/attrs/value`, data.value);
    });

    await Promise.all(promises);
  }

  async updateSchema(id, schemaList) {
    const url = `${this.iotAgentUrl}/iot/devices`;
    const headers = {
      'fiware-service': 'knot',
      'fiware-servicepath': `/device/${id}`,
    };

    const sensors = await Promise.all(schemaList.map(async (schema) => {
      await this.client.subscribe(`/${id}/${schema.sensor_id}/cmd`);
      return mapSensorToFiware(id, schema);
    }));

    await request.post({
      url, headers, body: { devices: sensors }, json: true,
    });
  }

  async updateProperties(id, properties) { // eslint-disable-line no-empty-function,no-unused-vars
  }

  // Cloud to device (fog)

  // cb(event) where event is { id, config: {} }
  onConfigUpdated(cb) { // eslint-disable-line no-empty-function,no-unused-vars
  }

  // cb(event) where event is { id, properties: {} }
  onPropertiesUpdated(cb) { // eslint-disable-line no-empty-function,no-unused-vars
  }

  // cb(event) where event is { id, sensorId }
  async onDataRequested(cb) {
    this.onDataRequestedCb = cb;
  }

  // cb(event) where event is { id, sensorId, data }
  async onDataUpdated(cb) {
    this.onDataUpdatedCb = cb;
  }
}

export { Connector }; // eslint-disable-line import/prefer-default-export
