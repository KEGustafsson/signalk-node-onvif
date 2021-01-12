const app = {
  debug: (msg) => { console.log(msg); },
};

const plugin = require('.')(app);

plugin.start({});

setTimeout(() => {
  console.log('calling stop');
  plugin.stop();
  console.log('stop called');
}, 1000);
