import _ from 'lodash';
import request from 'request-promise-native';
import config from 'config';

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

class Connector {
  constructor(settings) {
    this.iotAgentUrl = `http://${settings.hostname}:${settings.port}`;
  }

  async start() {
    await createService(this.iotAgentUrl, '/device', 'default', 'device');
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
  }

  async removeDevice(id) {
    const url = `${this.iotAgentUrl}/iot/devices/${id}`;
    const headers = {
      'fiware-service': 'knot',
      'fiware-servicepath': '/device',
    };

    await request.delete({ url, headers });
  }

  async listDevices() { // eslint-disable-line no-empty-function,no-unused-vars
  }

  // Device (fog) to cloud

  async publishData(id, data) { // eslint-disable-line no-empty-function,no-unused-vars
  }

  async updateSchema(id, schemaList) {
    const sensors = [];
    const url = `${this.iotAgentUrl}/iot/devices`;

    const headers = {
      'fiware-service': 'knot',
      'fiware-servicepath': `/device/${id}`,
    };

    schemaList.map(schema => sensors.push(mapSensorToFiware(id, schema)));

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
  onDataRequested(cb) { // eslint-disable-line no-empty-function,no-unused-vars
  }

  // cb(event) where event is { id, sensorId, data }
  onDataUpdated(cb) { // eslint-disable-line no-empty-function,no-unused-vars
  }
}

export { Connector }; // eslint-disable-line import/prefer-default-export
