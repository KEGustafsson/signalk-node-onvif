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

"use strict";
process.chdir(__dirname);

const onvif = require("./lib/node-onvif.js");
const WebSocketServer = require("websocket").server;

module.exports = function createPlugin(app) {
  const plugin = {};
  plugin.id = "signalk-node-onvif";
  plugin.name = "Signal K node-onvif";
  plugin.description = "Signal K node-onvif ";
  let dummy;
  const setStatus = app.setPluginStatus || app.setProviderStatus;

  const https = require("https");
  const http = require("http");
  const fs = require("fs");
  let port = 8880;
  let wsServer;
  let http_server;
  const path = "/home/node/.signalk/ssl-key.pem";

  plugin.start = function (options, restartPlugin) {
    fs.access(path, fs.F_OK, (err) => {
      if (err) {
        http_server = http.createServer(httpServerRequest);
        http_server.listen(port, function () {
          console.log("Node-onvif http/ws server listening on port " + port);
        });
        wsServer = new WebSocketServer({
          httpServer: http_server,
        });
        wsServer.on("request", wsServerRequest);
      } else {
        const httpsSec = {
          key: fs.readFileSync("/home/node/.signalk/ssl-key.pem"),
          cert: fs.readFileSync("/home/node/.signalk/ssl-cert.pem"),
        };
        http_server = https.createServer(httpsSec, httpServerRequest);
        http_server.listen(port, function () {
          console.log("Node-onvif https/wss server listening on port " + port);
        });
        wsServer = new WebSocketServer({
          httpServer: http_server,
        });
        wsServer.on("request", wsServerRequest);
      }
    });
    app.debug("Plugin started");
  };

  plugin.stop = function stop() {
    if (http_server) {
      wsServer.shutDown();
      http_server.close(() => {
        console.log("Node-onvif HTTP server closed");
      });
    }
  };

  plugin.schema = {
    type: "object",
    properties: {
      dummy: {
        type: "integer",
        default: 1,
        title: "dummy",
      },
    },
  };

  function httpServerRequest(req, res) {
    var path = req.url.replace(/\?.*$/, "");
    if (path.match(/\.{2,}/) || path.match(/[^a-zA-Z\d\_\-\.\/]/)) {
      httpServerResponse404(req.url, res);
      return;
    }
    if (path === "/") {
      path = "/index.html";
    }
    var fpath = "." + path;
    fs.readFile(fpath, "utf-8", function (err, data) {
      if (err) {
        httpServerResponse404(req.url, res);
        return;
      } else {
        var ctype = getContentType(fpath);
        res.writeHead(200, { "Content-Type": ctype });
        res.write(data);
        res.end();
      }
    });
  }

  function getContentType(fpath) {
    var ext = fpath.split(".").pop().toLowerCase();
    if (ext.match(/^(html|htm)$/)) {
      return "text/html";
    } else if (ext.match(/^(jpeg|jpg)$/)) {
      return "image/jpeg";
    } else if (ext.match(/^(png|gif)$/)) {
      return "image/" + ext;
    } else if (ext === "css") {
      return "text/css";
    } else if (ext === "js") {
      return "text/javascript";
    } else if (ext === "woff2") {
      return "application/font-woff";
    } else if (ext === "woff") {
      return "application/font-woff";
    } else if (ext === "ttf") {
      return "application/font-ttf";
    } else if (ext === "svg") {
      return "image/svg+xml";
    } else if (ext === "eot") {
      return "application/vnd.ms-fontobject";
    } else if (ext === "oft") {
      return "application/x-font-otf";
    } else {
      return "application/octet-stream";
    }
  }

  function httpServerResponse404(url, res) {
    res.write("404 Not Found: " + url);
    res.end();
    console.log("HTTP : 404 Not Found : " + url);
  }

  var client_list = [];

  function wsServerRequest(request) {
    var conn = request.accept(null, request.origin);
    conn.on("message", function (message) {
      if (message.type !== "utf8") {
        return;
      }
      var data = JSON.parse(message.utf8Data);
      var method = data["method"];
      var params = data["params"];
      if (method === "startDiscovery") {
        startDiscovery(conn);
      } else if (method === "connect") {
        connect(conn, params);
      } else if (method === "fetchSnapshot") {
        fetchSnapshot(conn, params);
      } else if (method === "ptzMove") {
        ptzMove(conn, params);
      } else if (method === "ptzStop") {
        ptzStop(conn, params);
      } else if (method === "ptzHome") {
        ptzHome(conn, params);
      }
    });

    conn.on("close", function (message) {});
    conn.on("error", function (error) {
      console.log(error);
    });
  }

  var devices = {};
  function startDiscovery(conn) {
    devices = {};
    let names = {};
    onvif
      .startProbe()
      .then((device_list) => {
        device_list.forEach((device) => {
          let odevice = new onvif.OnvifDevice({
            xaddr: device.xaddrs[0],
          });
          let addr = odevice.address;
          devices[addr] = odevice;
          names[addr] = device.name;
        });
        var devs = {};
        for (var addr in devices) {
          devs[addr] = {
            name: names[addr],
            address: addr,
          };
        }
        let res = { id: "startDiscovery", result: devs };
        conn.send(JSON.stringify(res));
      })
      .catch((error) => {
        let res = { id: "connect", error: error.message };
        conn.send(JSON.stringify(res));
      });
  }

  function connect(conn, params) {
    var device = devices[params.address];
    if (!device) {
      var res = {
        id: "connect",
        error: "The specified device is not found: " + params.address,
      };
      conn.send(JSON.stringify(res));
      return;
    }
    if (params.user) {
      device.setAuth(params.user, params.pass);
    }
    device.init((error, result) => {
      var res = { id: "connect" };
      if (error) {
        res["error"] = error.toString();
      } else {
        res["result"] = result;
      }
      conn.send(JSON.stringify(res));
    });
  }

  function fetchSnapshot(conn, params) {
    var device = devices[params.address];
    if (!device) {
      var res = {
        id: "fetchSnapshot",
        error: "The specified device is not found: " + params.address,
      };
      conn.send(JSON.stringify(res));
      return;
    }
    device.fetchSnapshot((error, result) => {
      var res = { id: "fetchSnapshot" };
      if (error) {
        res["error"] = error.toString();
      } else {
        var ct = result["headers"]["content-type"];
        var buffer = result["body"];
        var b64 = buffer.toString("base64");
        var uri = "data:" + ct + ";base64," + b64;
        res["result"] = uri;
      }
      conn.send(JSON.stringify(res));
    });
  }

  function ptzMove(conn, params) {
    var device = devices[params.address];
    if (!device) {
      var res = {
        id: "ptzMove",
        error: "The specified device is not found: " + params.address,
      };
      conn.send(JSON.stringify(res));
      return;
    }
    device.ptzMove(params, (error) => {
      var res = { id: "ptzMove" };
      if (error) {
        res["error"] = error.toString();
      } else {
        res["result"] = true;
      }
      conn.send(JSON.stringify(res));
    });
  }

  function ptzStop(conn, params) {
    var device = devices[params.address];
    if (!device) {
      var res = {
        id: "ptzStop",
        error: "The specified device is not found: " + params.address,
      };
      conn.send(JSON.stringify(res));
      return;
    }
    device.ptzStop((error) => {
      var res = { id: "ptzStop" };
      if (error) {
        res["error"] = error.toString();
      } else {
        res["result"] = true;
      }
      conn.send(JSON.stringify(res));
    });
  }

  function ptzHome(conn, params) {
    var device = devices[params.address];
    if (!device) {
      var res = {
        id: "ptzMove",
        error: "The specified device is not found: " + params.address,
      };
      conn.send(JSON.stringify(res));
      return;
    }
    if (!device.services.ptz) {
      var res = {
        id: "ptzHome",
        error: "The specified device does not support PTZ.",
      };
      conn.send(JSON.stringify(res));
      return;
    }

    var ptz = device.services.ptz;
    var profile = device.getCurrentProfile();
    var params = {
      ProfileToken: profile["token"],
      Speed: 1,
    };
    ptz.gotoHomePosition(params, (error, result) => {
      var res = { id: "ptzMove" };
      if (error) {
        res["error"] = error.toString();
      } else {
        res["result"] = true;
      }
      conn.send(JSON.stringify(res));
    });
  }

  return plugin;
};
