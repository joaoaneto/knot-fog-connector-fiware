import _ from 'lodash';
import request from 'request-promise-native';
import mqtt from 'async-mqtt';

async function deviceExists(url, headers) {
  try {
    await request.get({ url, headers, json: true });
  } catch (error) {
    if (error.response.statusCode === 404) {
      return false;
    }
  }

  return true;
}

async function deviceExistsOnIoTA(iotAgentUrl, id) {
  const url = `${iotAgentUrl}/iot/devices/${id}`;
  const headers = {
    'fiware-service': 'knot',
    'fiware-servicepath': '/device',
  };

  return deviceExists(url, headers);
}

async function deviceExistsOnOrion(orionUrl, id) {
  const url = `${orionUrl}/v2/entities/${id}`;
  const headers = {
    'fiware-service': 'knot',
    'fiware-servicepath': '/device',
  };

  return deviceExists(url, headers);
}

async function serviceExists(url, headers) {
  const service = await request.get({ url, headers, json: true });
  return service.count > 0;
}

async function createService(iotAgentUrl, orionUrl, servicePath, apiKey, entityType) {
  const url = `${iotAgentUrl}/iot/services`;
  const service = {
    name: 'knot',
    resource: '/iot/d',
  };
  const headers = {
    'fiware-service': service.name,
    'fiware-servicepath': servicePath,
  };

  if (await serviceExists(url, headers)) {
    return;
  }

  service.entity_type = entityType;
  service.apikey = apiKey;
  service.cbroker = orionUrl;

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
    device_id: schema.sensorId.toString(),
    entity_name: schema.sensorId.toString(),
    entity_type: 'sensor',
    protocol: 'IoTA-UL',
    transport: 'MQTT',
    static_attributes: [{
      name: 'device',
      type: 'string',
      value: id,
    }].concat(schemaList),
    attributes: [{
      name: 'value',
      type: 'string',
    }],
    commands: [
      {
        name: 'setData',
        type: 'command',
      },
      {
        name: 'getData',
        type: 'command',
      },
    ],
  };
}

function mapSensorFromFiware(device) {
  const schema = {};

  schema.sensorId = parseInt(device.device_id, 10);

  device.static_attributes.forEach((attr) => {
    if (attr.name === 'valueType') {
      schema.valueType = attr.value;
    } else if (attr.name === 'unit') {
      schema.unit = attr.value;
    } else if (attr.name === 'typeId') {
      schema.typeId = attr.value;
    } else if (attr.name === 'name') {
      schema.name = attr.value;
    }
  });

  return schema;
}

function parseStringValue(valueType, value) {
  switch (valueType) {
    case 1:
      return parseInt(value, 10);
    case 2:
      return Number(value);
    case 3:
      return (value === 'true');
    case 4:
      return Buffer.from(value).toString('base64');
    default:
      break;
  }

  return value;
}

function parseULMessage(topic, message, devices) {
  /*
  FIWARE's IoT Agent for Ultralight 2.0 commands syntax adheres
  the following format: <device-id>@<command-name>|<command-value>
  for this reason, a regex expression is used below to split the
  incoming payload (message) using the '@' and '|' delimiters.
  */
  const [entityId, command, strValue] = message.split(/[@|]/);
  const apiKey = topic.split('/')[1];
  const id = apiKey === 'default' ? entityId : apiKey;

  const device = devices.find(obj => obj.id === apiKey);
  const sensor = device.schema.find(obj => obj.sensorId === Number(entityId));
  const value = parseStringValue(sensor.valueType, strValue);

  return {
    id,
    entityId,
    command,
    value,
  };
}

async function removeDeviceFromIoTAgent(iotAgentUrl, id) {
  let url = `${iotAgentUrl}/iot/devices/${id}`;
  const headers = {
    'fiware-service': 'knot',
    'fiware-servicepath': '/device',
  };

  if (!await deviceExistsOnIoTA(iotAgentUrl, id)) {
    return;
  }

  await request.delete({ url, headers, json: true });

  headers['fiware-servicepath'] = `/device/${id}`;
  url = `${iotAgentUrl}/iot/devices`;
  const sensors = await request.get({ url, headers, json: true });
  if (sensors.count === 0) {
    return;
  }

  await Promise.all(sensors.devices.map(async (sensor) => {
    url = `${iotAgentUrl}/iot/devices/${sensor.device_id}`;
    return request.delete({ url, headers, json: true });
  }));

  url = `${iotAgentUrl}/iot/services/?resource=/iot/d&apikey=${id}`;
  await request.delete({ url, headers, json: true });
}

async function removeDeviceFromOrion(orionUrl, id) {
  let url = `${orionUrl}/v2/entities/${id}`;
  const headers = {
    'fiware-service': 'knot',
    'fiware-servicepath': '/device',
  };

  if (!await deviceExistsOnOrion(orionUrl, id)) {
    return;
  }

  await request.delete({ url, headers, json: true });

  headers['fiware-servicepath'] = `/device/${id}`;
  url = `${orionUrl}/v2/entities`;
  const sensors = await request.get({ url, headers, json: true });
  if (sensors.length === 0) {
    return;
  }

  await Promise.all(sensors.map(async (sensor) => {
    url = `${orionUrl}/v2/entities/${sensor.id}`;
    return request.delete({ url, headers, json: true });
  }));
}

async function subscribeToEntities(client, devices) {
  await Promise.all(devices.map(async ({ id, schema }) => {
    client.subscribe(`/default/${id}/cmd`);
    return schema.map(async ({ sensorId }) => client.subscribe(`/${id}/${sensorId}/cmd`));
  }));
}

function isBase64(value) {
  try {
    return (Buffer.from(value, 'base64').toString('base64') === value);
  } catch (error) {
    return false;
  }
}

class Connector {
  constructor(settings) {
    this.client = null;
    this.iotAgentUrl = `http://${settings.iota.hostname}:${settings.iota.port}`;
    this.orionUrl = `http://${settings.orion.hostname}:${settings.orion.port}`;
    this.iotAgentMQTT = `mqtt://${settings.iota.hostname}`;
  }

  async start() {
    this.onDataUpdatedCb = _.noop();
    this.onDataRequestedCb = _.noop();
    this.onDeviceUnregisteredCb = _.noop();
    this.onDisconnectedCb = _.noop();
    this.onReconnectedCb = _.noop();

    await createService(this.iotAgentUrl, this.orionUrl, '/device', 'default', 'device');
    await this.connectMQTT();
    await this.connectDevices();
  }

  async connectMQTT() {
    this.client = await mqtt.connectAsync(this.iotAgentMQTT);
  }

  async connectDevices() {
    await this.setupDevices();
    this.client.on('message', async (topic, payload) => {
      await this.messageHandler(topic, payload);
    });
  }

  async setupDevices() {
    const devices = await this.listDevices();
    await subscribeToEntities(this.client, devices);
  }

  async messageHandler(topic, payload) {
    const devices = await this.listDevices();
    const message = parseULMessage(topic, payload.toString(), devices);

    if (message.command === 'setData') {
      await this.handleSetData(topic, payload, message);
    } else if (message.command === 'getData') {
      await this.handleGetData(topic, payload, message);
    }
  }

  async handleSetData(topic, payload, message) {
    const data = [{
      sensorId: parseInt(message.entityId, 10),
      value: message.value,
    }];
    await this.client.publish(`${topic}exe`, payload);
    this.onDataUpdatedCb(message.id, data);
  }

  async handleGetData(topic, payload, message) {
    const sensorIds = [parseInt(message.entityId, 10)];
    await this.client.publish(`${topic}exe`, payload);
    this.onDataRequestedCb(message.id, sensorIds);
  }

  async addDevice(device) {
    const url = `${this.iotAgentUrl}/iot/devices`;
    const headers = {
      'fiware-service': 'knot',
      'fiware-servicepath': '/device',
    };

    if (await deviceExistsOnIoTA(this.iotAgentUrl, device.id)) {
      return { id: device.id, token: device.id };
    }

    const fiwareDevice = mapDeviceToFiware(device);

    await request.post({
      url, headers, body: { devices: [fiwareDevice] }, json: true,
    });
    await createService(this.iotAgentUrl, this.orionUrl, `/device/${device.id}`, device.id, 'sensor');
    await this.client.subscribe(`/default/${device.id}/cmd`);

    return { id: device.id, token: device.id };
  }

  async removeDevice(id) {
    await removeDeviceFromIoTAgent(this.iotAgentUrl, id);
    await removeDeviceFromOrion(this.orionUrl, id);
    this.onDeviceUnregisteredCb(id);
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
    await Promise.all(dataList.map(async (data) => {
      const value = isBase64(data.value)
        ? Buffer.from(data.value, 'base64').toString()
        : data.value.toString();
      return this.client.publish(`/${id}/${data.sensorId}/attrs/value`, value);
    }));
  }

  async updateSchema(id, schemaList) {
    const url = `${this.iotAgentUrl}/iot/devices`;
    const headers = {
      'fiware-service': 'knot',
      'fiware-servicepath': `/device/${id}`,
    };

    const sensors = await Promise.all(schemaList.map(async (schema) => {
      this.client.subscribe(`/${id}/${schema.sensorId}/cmd`);
      return mapSensorToFiware(id, schema);
    }));

    await request.post({
      url, headers, body: { devices: sensors }, json: true,
    });
  }

  // Connection callbacks

  async onDisconnected(cb) {
    this.onDisconnectedCb = cb;
  }

  async onReconnected(cb) {
    this.onReconnectedCb = cb;
  }

  // Cloud to device (fog)

  // cb(event) where event is { id, [ sensorIds ] }
  async onDataRequested(cb) {
    this.onDataRequestedCb = cb;
  }

  // cb(event) where event is { id, [{ sensorId, value }] }
  async onDataUpdated(cb) {
    this.onDataUpdatedCb = cb;
  }

  // cb(event) where event is { id }
  async onDeviceUnregistered(cb) {
    this.onDeviceUnregisteredCb = cb;
  }
}

export { Connector }; // eslint-disable-line import/prefer-default-export
