import { Connector } from './Connector';
import _ from 'lodash';

const settings = {
	hostname: 'localhost',
	port: 4061,
}

async function init() {
	const connector = new Connector(settings);

	// await connector.start();

	// const devices = await connector.listDevices();
	// console.log(devices);

	// await connector.addDevice({
	// 	id: 'knot04',
	// 	name: 'KNoTThing'
	// });

	const sensors = await connector.updateSchema('knot03', [
  	{
	    sensor_id: 1,
	    value_type: 0xFFF1, // Switch
	    unit: 0, // NA
	    type_id: 3, // Boolean
	    name: 'Door lock',
  	},
  	{
	    sensor_id: 2,
	    value_type: 0xFFF4, // Switch
	    unit: 0, // NA
	    type_id: 3, // Boolean
	    name: 'Light',
  	}]);	

  	console.log(sensors);

	// await connector.publishData('knot01', {
	// 	sensor_id: '1',
	// 	value: 'false'
	// });

	// await connector.removeDevice('ABCDEF123');
}

init();

export default Connector;
