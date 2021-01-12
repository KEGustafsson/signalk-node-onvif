/* eslint-disable no-restricted-syntax */
/* eslint-disable guard-for-in */
/*
MIT License

Copyright (c) 2020 Karl-Erik Gustafsson

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

process.chdir(__dirname);

const WebSocketServer = require('websocket').server;
const https = require('https');
const http = require('http');
const fs = require('fs');
const onvif = require('./lib/node-onvif.js');

module.exports = function createPlugin(app) {
  const plugin = {};
  plugin.id = 'signalk-node-onvif';
  plugin.name = 'Signal K node-onvif';
  plugin.description = 'Signal K node-onvif ';
  const setStatus = app.setPluginStatus || app.setProviderStatus;

  const port = 8880;
  let wsServer;
  let webServer;
  const certPath = '/home/node/.signalk/ssl-key.pem';

  function httpServerResponse404(url, res) {
    res.write(`404 Not Found: ${url}`);
    res.end();
    console.log(`HTTP : 404 Not Found : ${url}`);
  }

  function getContentType(fpath) {
    const ext = fpath.split('.').pop().toLowerCase();
    if (ext.match(/^(html|htm)$/)) {
      return 'text/html';
    } if (ext.match(/^(jpeg|jpg)$/)) {
      return 'image/jpeg';
    } if (ext.match(/^(png|gif)$/)) {
      return `image/${ext}`;
    } if (ext === 'css') {
      return 'text/css';
    } if (ext === 'js') {
      return 'text/javascript';
    } if (ext === 'woff2') {
      return 'application/font-woff';
    } if (ext === 'woff') {
      return 'application/font-woff';
    } if (ext === 'ttf') {
      return 'application/font-ttf';
    } if (ext === 'svg') {
      return 'image/svg+xml';
    } if (ext === 'eot') {
      return 'application/vnd.ms-fontobject';
    } if (ext === 'oft') {
      return 'application/x-font-otf';
    }
    return 'application/octet-stream';
  }

  function httpServerRequest(req, res) {
    let path = req.url.replace(/\?.*$/, '');
    if (path.match(/\.{2,}/) || path.match(/[^a-zA-Z\d_\-./]/)) {
      httpServerResponse404(req.url, res);
      return;
    }
    if (path === '/') {
      path = '/index.html';
    }
    const fpath = `.${path}`;
    fs.readFile(fpath, 'utf-8', (err, data) => {
      if (err) {
        httpServerResponse404(req.url, res);
      } else {
        const ctype = getContentType(fpath);
        res.writeHead(200, { 'Content-Type': ctype });
        res.write(data);
        res.end();
      }
    });
  }

  let devices = {};
  function startDiscovery(conn) {
    devices = {};
    const names = {};
    onvif
      .startProbe()
      .then((deviceList) => {
        deviceList.forEach((device) => {
          const odevice = new onvif.OnvifDevice({
            xaddr: device.xaddrs[0],
          });
          const addr = odevice.address;
          devices[addr] = odevice;
          names[addr] = device.name;
        });
        const devs = {};
        for (const addr in devices) {
          devs[addr] = {
            name: names[addr],
            address: addr,
          };
        }
        const res = { id: 'startDiscovery', result: devs };
        conn.send(JSON.stringify(res));
      })
      .catch((error) => {
        const res = { id: 'connect', error: error.message };
        conn.send(JSON.stringify(res));
      });
  }

  function connect(conn, params) {
    const device = devices[params.address];
    if (!device) {
      const res = {
        id: 'connect',
        error: `The specified device is not found: ${params.address}`,
      };
      conn.send(JSON.stringify(res));
      return;
    }
    if (params.user) {
      device.setAuth(params.user, params.pass);
    }
    device.init((error, result) => {
      const res = { id: 'connect' };
      if (error) {
        res.error = error.toString();
      } else {
        res.result = result;
      }
      conn.send(JSON.stringify(res));
    });
  }

  function fetchSnapshot(conn, params) {
    const device = devices[params.address];
    if (!device) {
      const res = {
        id: 'fetchSnapshot',
        error: `The specified device is not found: ${params.address}`,
      };
      conn.send(JSON.stringify(res));
      return;
    }
    device.fetchSnapshot((error, result) => {
      const res = { id: 'fetchSnapshot' };
      if (error) {
        res.error = error.toString();
      } else {
        const ct = result.headers['content-type'];
        const buffer = result.body;
        const b64 = buffer.toString('base64');
        const uri = `data:${ct};base64,${b64}`;
        res.result = uri;
      }
      conn.send(JSON.stringify(res));
    });
  }

  function ptzMove(conn, params) {
    const device = devices[params.address];
    if (!device) {
      const res = {
        id: 'ptzMove',
        error: `The specified device is not found: ${params.address}`,
      };
      conn.send(JSON.stringify(res));
      return;
    }
    device.ptzMove(params, (error) => {
      const res = { id: 'ptzMove' };
      if (error) {
        res.error = error.toString();
      } else {
        res.result = true;
      }
      conn.send(JSON.stringify(res));
    });
  }

  function ptzStop(conn, params) {
    const device = devices[params.address];
    if (!device) {
      const res = {
        id: 'ptzStop',
        error: `The specified device is not found: ${params.address}`,
      };
      conn.send(JSON.stringify(res));
      return;
    }
    device.ptzStop((error) => {
      const res = { id: 'ptzStop' };
      if (error) {
        res.error = error.toString();
      } else {
        res.result = true;
      }
      conn.send(JSON.stringify(res));
    });
  }

  function ptzHome(conn, params) {
    const device = devices[params.address];
    if (!device) {
      const res = {
        id: 'ptzMove',
        error: `The specified device is not found: ${params.address}`,
      };
      conn.send(JSON.stringify(res));
      return;
    }
    if (!device.services.ptz) {
      const res = {
        id: 'ptzHome',
        error: 'The specified device does not support PTZ.',
      };
      conn.send(JSON.stringify(res));
      return;
    }

    const { ptz } = device.services;
    const profile = device.getCurrentProfile();
    const param = {
      ProfileToken: profile.token,
      Speed: 1,
    };
    ptz.gotoHomePosition(param, (error) => {
      const res = { id: 'ptzMove' };
      if (error) {
        res.error = error.toString();
      } else {
        res.result = true;
      }
      conn.send(JSON.stringify(res));
    });
  }

  function wsServerRequest(request) {
    const conn = request.accept(null, request.origin);
    conn.on('message', (message) => {
      if (message.type !== 'utf8') {
        return;
      }
      const data = JSON.parse(message.utf8Data);
      const { method } = data;
      const { params } = data;
      if (method === 'startDiscovery') {
        startDiscovery(conn);
      } else if (method === 'connect') {
        connect(conn, params);
      } else if (method === 'fetchSnapshot') {
        fetchSnapshot(conn, params);
      } else if (method === 'ptzMove') {
        ptzMove(conn, params);
      } else if (method === 'ptzStop') {
        ptzStop(conn, params);
      } else if (method === 'ptzHome') {
        ptzHome(conn, params);
      }
    });

    conn.on('close', () => { });
    conn.on('error', (error) => {
      console.log(error);
    });
  }

  plugin.start = function (options, restartPlugin) {
    fs.access(certPath, fs.F_OK, (err) => {
      if (err) {
        webServer = http.createServer(httpServerRequest);
        webServer.listen(port, () => {
          console.log(`Node-onvif http/ws server listening on port ${port}`);
        });
        wsServer = new WebSocketServer({
          httpServer: webServer,
        });
        wsServer.on('request', wsServerRequest);
      } else {
        const httpsSec = {
          key: fs.readFileSync('/home/node/.signalk/ssl-key.pem'),
          cert: fs.readFileSync('/home/node/.signalk/ssl-cert.pem'),
        };
        webServer = https.createServer(httpsSec, httpServerRequest);
        webServer.listen(port, () => {
          console.log(`Node-onvif https/wss server listening on port ${port}`);
        });
        wsServer = new WebSocketServer({
          httpServer: webServer,
        });
        wsServer.on('request', wsServerRequest);
      }
    });
    app.debug('Plugin started');
  };

  plugin.stop = function stop() {
    if (webServer) {
      wsServer.shutDown();
      webServer.close(() => {
        console.log('Node-onvif HTTP server closed');
      });
    }
  };

  plugin.schema = {
    type: 'object',
    properties: {
      dummy: {
        type: 'integer',
        default: 1,
        title: 'dummy',
      },
    },
  };

  return plugin;
};
