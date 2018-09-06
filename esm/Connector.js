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

class Connector {
  constructor(settings) {
    this.iotAgentUrl = `http://${settings.hostname}:${settings.port}`;
  }

  async start() {
    await createService(this.iotAgentUrl, '/devices', 'default', 'device');
  }

  async addDevice(device) { // eslint-disable-line no-empty-function,no-unused-vars
  }

  async removeDevice(id) { // eslint-disable-line no-empty-function,no-unused-vars
  }

  async listDevices() { // eslint-disable-line no-empty-function,no-unused-vars
  }

  // Device (fog) to cloud

  async publishData(id, data) { // eslint-disable-line no-empty-function,no-unused-vars
  }

  async updateSchema(id, schema) { // eslint-disable-line no-empty-function,no-unused-vars
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
