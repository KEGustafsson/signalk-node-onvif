/* eslint-disable guard-for-in */
(function nodeOnvifWeb() {
  /*-------------------------------------------------------------------
   * Constructor
   * ---------------------------------------------------------------- */
  function OnvifManager() {
    this.ws = null; // WebSocket object
    this.el = {
      // jQuery objects for the HTML elements
      frm_con: $('#connect-form'),
      sel_dev: $('#connect-form select[name="device"]'),
      inp_usr: $('#connect-form input[name="user"]'),
      inp_pas: $('#connect-form input[name="pass"]'),
      btn_con: $('#connect-form button[name="connect"]'),
      div_pnl: $('#connected-device'),
      img_snp: $('#connected-device img.snapshot'),
      btn_dcn: $('#connected-device button[name="disconnect"]'),
      mdl_msg: $('#message-modal'),
      ptz_spd: $('input[name="ptz-speed"]'),
      btn_hme: $('#connected-device div.ptz-pad-box button.ptz-goto-home'),
      ptz_pad: $('#connected-device div.ptz-pad-box'),
      zom_in: $('#connected-device div.ptz-zom-ctl-box button.ptz-zom-in'),
      zom_out: $('#connected-device div.ptz-zom-ctl-box button.ptz-zom-ot'),
    };
    this.selected_address = '';
    this.device_connected = false;
    this.ptz_moving = false;
    this.snapshot_w = 400;
    this.snapshot_h = 300;
  }

  // eslint-disable-next-line func-names
  OnvifManager.prototype.init = function () {
    this.initWebSocketConnection();
    $(window).on('resize', this.adjustSize.bind(this));
    this.el.btn_con.on('click', this.pressedConnectButton.bind(this));
    this.el.btn_dcn.on('click', this.pressedConnectButton.bind(this));
    $(document.body).on('keydown', this.ptzMove.bind(this));
    $(document.body).on('keyup', this.ptzStop.bind(this));
    this.el.btn_hme.on('click', this.ptzGotoHome.bind(this));
    this.el.btn_hme.on('touchstart', this.ptzGotoHome.bind(this));
    this.el.btn_hme.on('touchend', this.ptzGotoHome.bind(this));
    this.el.ptz_pad.on('mousedown', this.ptzMove.bind(this));
    this.el.ptz_pad.on('mouseup', this.ptzStop.bind(this));
    this.el.ptz_pad.on('touchstart', this.ptzMove.bind(this));
    this.el.ptz_pad.on('touchend', this.ptzStop.bind(this));
    this.el.zom_in.on('mousedown', this.ptzMove.bind(this));
    this.el.zom_in.on('mouseup', this.ptzStop.bind(this));
    this.el.zom_in.on('touchstart', this.ptzMove.bind(this));
    this.el.zom_in.on('touchend', this.ptzStop.bind(this));
    this.el.zom_out.on('mousedown', this.ptzMove.bind(this));
    this.el.zom_out.on('mouseup', this.ptzStop.bind(this));
    this.el.zom_out.on('touchstart', this.ptzMove.bind(this));
    this.el.zom_out.on('touchend', this.ptzStop.bind(this));
  };

  OnvifManager.prototype.adjustSize = function () {
    const divDomEl = this.el.div_pnl.get(0);
    const rect = divDomEl.getBoundingClientRect();
    const x = rect.left + window.pageXOffset;
    const y = rect.top + window.pageYOffset;
    const w = rect.width;
    const h = window.innerHeight - y - 10;
    divDomEl.style.height = `${h}px`;
    const aspectRatio = w / h;
    const snapshotAspectRatio = this.snapshot_w / this.snapshot_h;
    const imgDomEl = this.el.img_snp.get(0);

    if (snapshotAspectRatio > aspectRatio) {
      const imgW = w;
      const imgH = w / snapshotAspectRatio;
      imgDomEl.style.width = `${imgW}px`;
      imgDomEl.style.height = `${imgH}px`;
      imgDomEl.style.left = '0px';
      imgDomEl.style.top = `${(h - imgH) / 2}px`;
    } else {
      const imgH = h;
      const imgW = h * snapshotAspectRatio;
      imgDomEl.style.height = `${imgH}px`;
      imgDomEl.style.width = `${imgW}px`;
      imgDomEl.style.left = `${(w - imgW) / 2}px`;
      imgDomEl.style.top = '0px';
    }
  };

  OnvifManager.prototype.initWebSocketConnection = function () {
    this.ws = new WebSocket(`wss://${window.location.hostname}:8880`);
    this.ws.onopen = function () {
      console.log('WebSocket connection established.');
      this.sendRequest('startDiscovery');
    }.bind(this);
    this.ws.onclose = function () {
      console.log('WebSocket connection closed.');
      this.ws = new WebSocket(`ws://${window.location.hostname}:8880`);
      this.ws.onopen = function () {
        console.log('WebSocket connection established.');
        this.sendRequest('startDiscovery');
      }.bind(this);
      this.ws.onmessage = function (res) {
        const data = JSON.parse(res.data);
        const { id } = data;
        if (id === 'startDiscovery') {
          this.startDiscoveryCallback(data);
        } else if (id === 'connect') {
          this.connectCallback(data);
        } else if (id === 'fetchSnapshot') {
          this.fetchSnapshotCallback(data);
        } else if (id === 'ptzMove') {
          this.ptzMoveCallback(data);
        } else if (id === 'ptzStop') {
          this.ptzStopCallback(data);
        } else if (id === 'ptzHome') {
          this.ptzHomeCallback(data);
        }
      }.bind(this);
    }.bind(this);
    this.ws.onmessage = function (res) {
      const data = JSON.parse(res.data);
      const { id } = data;
      if (id === 'startDiscovery') {
        this.startDiscoveryCallback(data);
      } else if (id === 'connect') {
        this.connectCallback(data);
      } else if (id === 'fetchSnapshot') {
        this.fetchSnapshotCallback(data);
      } else if (id === 'ptzMove') {
        this.ptzMoveCallback(data);
      } else if (id === 'ptzStop') {
        this.ptzStopCallback(data);
      } else if (id === 'ptzHome') {
        this.ptzHomeCallback(data);
      }
    }.bind(this);
  };

  OnvifManager.prototype.sendRequest = function (method, params) {
    this.ws.send(
      JSON.stringify({
        method,
        params,
      }),
    );
  };

  OnvifManager.prototype.pressedConnectButton = function () {
    if (this.device_connected === true) {
      this.disconnectDevice();
    } else {
      this.connectDevice();
    }
  };

  OnvifManager.prototype.disconnectDevice = function () {
    this.el.img_snp.removeAttr('src');
    this.el.div_pnl.hide();
    this.el.frm_con.show();
    this.device_connected = false;
    this.disabledLoginForm(false);
    this.el.btn_con.text('Connect');
  };

  OnvifManager.prototype.connectDevice = function () {
    this.disabledLoginForm(true);
    this.el.btn_con.text('Connecting...');
    this.sendRequest('connect', {
      address: this.el.sel_dev.val(),
      user: this.el.inp_usr.val(),
      pass: this.el.inp_pas.val(),
    });
  };

  OnvifManager.prototype.disabledLoginForm = function (disabled) {
    this.el.sel_dev.prop('disabled', disabled);
    this.el.inp_usr.prop('disabled', disabled);
    this.el.inp_pas.prop('disabled', disabled);
    this.el.btn_con.prop('disabled', disabled);
  };

  OnvifManager.prototype.startDiscoveryCallback = function (data) {
    const devices = data.result;
    this.el.sel_dev.empty();
    this.el.sel_dev.append($('<option>Select a device</option>'));
    let n = 0;
    for (const key in devices) {
      const device = devices[key];
      const optionEl = $('<option></option>');
      optionEl.val(device.address);
      optionEl.text(`${device.name} (${device.address})`);
      this.el.sel_dev.append(optionEl);
      n++;
    }
    if (n === 0) {
      this.showMessageModal(
        'Error',
        'No device was found. Reload this page to discover ONVIF devices again.',
      );
    } else {
      this.disabledLoginForm(false);
    }
  };

  OnvifManager.prototype.connectCallback = function (data) {
    this.el.btn_con.prop('disabled', false);
    if (data.result) {
      this.selected_address = this.el.sel_dev.val();
      this.showConnectedDeviceInfo(this.selected_address, data.result);
      this.el.btn_con.text('Disconnect');
      this.el.frm_con.hide();
      this.el.div_pnl.show();
      this.device_connected = true;
    } else if (data.error) {
      this.el.div_pnl.hide();
      this.el.sel_dev.prop('disabled', false);
      this.el.inp_usr.prop('disabled', false);
      this.el.inp_pas.prop('disabled', false);
      this.el.btn_con.text('Connect');
      this.el.frm_con.show();
      this.showMessageModal(
        'Error',
        `Failed to connect to the device.${data.error.toString()}`,
      );
      this.device_connected = false;
    }
  };

  OnvifManager.prototype.showMessageModal = function (title, message) {
    this.el.mdl_msg.find('.modal-title').text(title);
    this.el.mdl_msg.find('.modal-message').text(message);
    this.el.mdl_msg.modal('show');
  };

  OnvifManager.prototype.showConnectedDeviceInfo = function (address, data) {
    this.el.div_pnl
      .find('span.name')
      .text(`${data.Manufacturer} ${data.Model}`);
    this.el.div_pnl.find('span.address').text(address);
    this.fetchSnapshot();
  };

  OnvifManager.prototype.fetchSnapshot = function () {
    this.sendRequest('fetchSnapshot', {
      address: this.selected_address,
    });
  };

  OnvifManager.prototype.fetchSnapshotCallback = function (data) {
    if (data.result) {
      this.el.img_snp.attr('src', data.result);
      window.setTimeout(
        () => {
          this.snapshot_w = this.el.img_snp.get(0).naturalWidth;
          this.snapshot_h = this.el.img_snp.get(0).naturalHeight;
          this.adjustSize();
          if (this.device_connected === true) {
            this.fetchSnapshot();
          }
        },
        10,
      );
    } else if (data.error) {
      console.log(data.error);
    }
  };

  OnvifManager.prototype.ptzGotoHome = function (event) {
    event.preventDefault();
    event.stopPropagation();
    if (event.type === 'touchstart') {
      return;
    }
    if (this.device_connected === false || this.ptz_moving === true) {
      return;
    }
    this.ptz_moving = true;
    this.sendRequest('ptzHome', {
      address: this.selected_address,
      timeout: 30,
    });
  };

  OnvifManager.prototype.ptzMove = function (event) {
    if (this.device_connected === false || this.ptz_moving === true) {
      return;
    }
    this.ptz_moving = true;
    const pos = { x: 0, y: 0, z: 0 };
    let speed = 1.0;

    if (event.type === 'keydown') {
      this.el.ptz_spd.each(
        (index, el) => {
          if ($(el).prop('checked') === true) {
            speed = parseFloat($(el).val());
          }
        },
      );
      const c = event.keyCode;
      const s = event.shiftKey;
      if (c === 38) {
        // Up
        pos.y = speed;
      } else if (c === 40) {
        // Down
        pos.y = 0 - speed;
      } else if (c === 37) {
        // Left
        pos.x = 0 - speed;
      } else if (c === 39) {
        // Right
        pos.x = speed;
      } else if (c === 107 || c === 187) {
        // Zoom in
        pos.z = speed;
      } else if (c === 109 || c === 189) {
        // Zoom out
        pos.z = 0 - speed;
      } else {
        return;
      }
    } else if (event.type.match(/^(mousedown|touchstart)$/)) {
      if (event.currentTarget.classList.contains('ptz-pad-box')) {
        const rect = event.currentTarget.getBoundingClientRect();
        let cx = event.clientX;
        let cy = event.clientY;
        if (event.type === 'touchstart') {
          if (event.targetTouches[0]) {
            cx = event.targetTouches[0].clientX;
            cy = event.targetTouches[0].clientY;
          } else if (event.changedTouches[0]) {
            cx = event.changedTouches[0].clientX;
            cy = event.changedTouches[0].clientY;
          }
        }
        const mx = cx - rect.left;
        const my = cy - rect.top;
        const w = rect.width;
        const h = rect.height;
        const r = Math.max(w, h) / 2;
        const x = mx - r;
        const y = r - my;
        const d = Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2)) / r;
        const rad = Math.atan2(y, x);
        pos.x = d * Math.cos(rad);
        pos.y = d * Math.sin(rad);
      } else if (event.currentTarget.classList.contains('ptz-zom')) {
        if (event.currentTarget.classList.contains('ptz-zom-ot')) {
          pos.z = -1.0;
        } else if (event.currentTarget.classList.contains('ptz-zom-in')) {
          pos.z = 1.0;
        } else {
          return;
        }
      } else {
        return;
      }
    } else {
      return;
    }

    this.sendRequest('ptzMove', {
      address: this.selected_address,
      speed: pos,
      timeout: 30,
    });
    event.preventDefault();
    event.stopPropagation();
  };

  OnvifManager.prototype.ptzStop = function () {
    if (!this.selected_address) {
      return;
    }
    this.sendRequest('ptzStop', {
      address: this.selected_address,
    });
    this.ptz_moving = false;
  };

  OnvifManager.prototype.ptzMoveCallback = function () {
    // do nothing
  };

  OnvifManager.prototype.ptzStopCallback = function () {
    // do nothing
  };

  OnvifManager.prototype.ptzHomeCallback = function () {
    // do nothing
  };

  $(document).ready(() => {
    new OnvifManager().init();
  });
}());
