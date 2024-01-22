import { server } from './server.js';

server.ready().then((_) => {
  console.log('server is ready');
});
