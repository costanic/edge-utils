'use strict'

const http = require('http');
const mocha = require('mocha');
const assert = require('assert');
const fs = require('fs'); 
const os = require('os');
const path = require('path');
const process = require('process');
const { spawn } = require('child_process');

function runCreateNewEeprom(port, tmpdir, timeout, done) {
    let proc = spawn(
      "bash ./debug_scripts/create-new-eeprom-with-self-signed-certs.sh "
      + path.join(process.cwd(), "debug_scripts") + " " + port + " " + tmpdir
      , { shell: true, timeout: timeout, env: {
        NODE_PATH: path.join(process.cwd(), "node_modules")
      }});
    var done_called = false
    proc.on('exit', function(status, signal) {
      proc.status = status;
      proc.signal = signal;
      if (! done_called) {
        done();
        done_called = true;
      }
    })
    proc.on('close', function(status) {
      proc.status = status;
      if (! done_called) {
        done();
        done_called = true;
      }
    })
    return proc
}

describe("create-new-eeprom-with-self-signed-certs.sh", function() {
  describe("without edge-core", function() {
    const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "without-edge-core"));
    var script;
    before(function (done) {
      script = runCreateNewEeprom(9000, tmpdir, 2000, done);
    });

    it("exits with 1 status", function() {
      assert.equal(script.status, 1);
    });
    it("does not create an identity file", function () {
      assert(! fs.existsSync(path.join(tmpdir, "identity.json")));
    });
    it("completes in less than 200ms", function () {
      assert.equal(script.signal, null);
    });
  });
  describe("when edge-core is disconnected", function() {
    const port = 9001;
    var server = http.createServer(function(request, response) {
      response.end(JSON.stringify({
        "account-id":"0157be9a987802420a010f0d00000000",
        "edge-version":"0.9.0-HEAD-7f13ed705161784478faa6a889b1f26beddd3f9a-",
        "endpoint-name":"016cb5be29d200000000000100100087",
        "internal-id":"016cb5be29d200000000000100100087",
        "lwm2m-server-uri":"coaps://lwm2m.us-east-1.mbedcloud.com:5684?aid=0157be9a987802420a010f0d00000000&iep=016cb5be29d200000000000100100087",
        "status":"disconnected"
      }));
    }).listen(port);
    const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "without-edge-core"));
    var script;
    before(function (done) {
      script = runCreateNewEeprom(port, tmpdir, 2000, done);
    });

    it("exits with 1 status", function() {
      assert.equal(script.status, 1);
    });
    it("does not create an identity file", function () {
      assert(! fs.existsSync(path.join(tmpdir, "identity.json")));
    });
    it("completes in less than 200ms", function () {
      assert.equal(script.signal, null);
    })
    after(function(){
      server.close();
    })
  });
  describe("when edge-core is connected and no old identity is present", function() {
    const port = 9002;
    const edge_core_response = {
      "account-id":"0157be9a987802420a010f0d00000000",
      "edge-version":"0.9.0-HEAD-7f13ed705161784478faa6a889b1f26beddd3f9a-",
      "endpoint-name":"016cb5be29d200000000000100100087",
      "internal-id":"016cb5be29d200000000000100100087",
      "lwm2m-server-uri":"coaps://lwm2m.us-east-1.mbedcloud.com:5684?aid=0157be9a987802420a010f0d00000000&iep=016cb5be29d200000000000100100087",
      "status":"connected"
    };
    var server = http.createServer(function(request, response) {
      response.end(JSON.stringify(edge_core_response));
    }).listen(port);
    const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "without-edge-core"));
    var script;
    var identity;
    before(function (done) {
      script = runCreateNewEeprom(port, tmpdir, 2000, function(){
        identity = JSON.parse(fs.readFileSync(path.join(tmpdir, "identity.json")));
        done();
      });
    });

    it("exits with 0 status", function() {
      assert.equal(script.status, 0);
    });
    it("creates an identity file", function () {
      assert(fs.existsSync(path.join(tmpdir, "identity.json")));
    });
    it("account id matches edge core's values", function () {
      assert.equal(identity.OU, edge_core_response["account-id"]);
    });
    it("device id matches edge core's values", function () {
      assert.equal(identity.deviceID, edge_core_response["internal-id"]);
    });
    it("idenity contains client certificates", function () {
      assert(identity.ssl.client);
      assert(identity.ssl.client.key);
      assert(identity.ssl.client.certificate);
    });
    it("idenity contains server certificates", function () {
      assert(identity.ssl.server);
      assert(identity.ssl.server.key);
      assert(identity.ssl.server.certificate);
    });
    it("idenity contains certificates authority", function () {
      assert(identity.ssl.ca);
      assert(identity.ssl.ca.ca);
      assert(identity.ssl.ca.intermediate);
    });
    it("idenity contains led config", function () {
      assert(identity.ledConfig);
    })
    it("idenity contains radio config", function () {
      assert(identity.radioConfig);
    })
    it("idenity category is development", function () {
      assert.equal(identity.category, "development");
    })
    it("idenity gateway address matches coap url", function () {
      assert.equal(identity.gatewayServicesAddress, "https://gateways.us-east-1.mbedcloud.com");
    })
    it("Ethernet Mac is the correct length", function () {
      assert.equal(identity.ethernetMAC.length, 6);
    })
    it("Six Mac is the correct length", function () {
      assert.equal(identity.sixBMAC.length, 8);
    })
    it("Serial number starts with DEV", function () {
      assert.equal(identity.serialNumber.slice(0, 3), "DEV");
    })
    it("completes in less than 200ms", function () {
      assert.equal(script.signal, null);
    })
    after(function(){
      server.close();
    })
  });
  describe("when edge-core is connected and a matching old identity is present", function() {
    const port = 9003;
    const edge_core_response = {
      "account-id":"0157be9a987802420a010f0d00000000",
      "edge-version":"0.9.0-HEAD-7f13ed705161784478faa6a889b1f26beddd3f9a-",
      "endpoint-name":"016cb5be29d200000000000100100087",
      "internal-id":"016cb5be29d200000000000100100087",
      "lwm2m-server-uri":"coaps://lwm2m.us-east-1.mbedcloud.com:5684?aid=0157be9a987802420a010f0d00000000&iep=016cb5be29d200000000000100100087",
      "status":"connected"
    };
    var server = http.createServer(function(request, response) {
      response.end(JSON.stringify(edge_core_response));
    }).listen(port);
    const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "without-edge-core"));
    var old_identity = {
      serialNumber: "PROD0000000",
      OU: edge_core_response["account-id"],
      deviceID: edge_core_response["internal-id"],
      ledConfig: "22",
      radioConfig: "22",
      catogory: "foo",
      ethernetMAC: [0x00, 0x11, 0x22, 0x33, 0x44, 0x55],
      sixBMAC: [0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77],
      gatewayServicesAddress: "not-an-address",
      ssl: {
        client: {
          key: "ssl-client-key",
          certificate: "ssl-client-certificate"
        },
        server: {
          key: "ssl-server-key",
          certificate: "ssl-server-certificate"
        },
        ca: {
          ca: "ssl-ca-ca",
          intermediate: "ssl-ca-intermediate"
        }
      }
    }
    fs.writeFileSync(path.join(tmpdir, "identity.json"), JSON.stringify(old_identity));
    var script;
    var identity;
    before(function (done) {
      script = runCreateNewEeprom(port, tmpdir, 2000, function(){
        identity = JSON.parse(fs.readFileSync(path.join(tmpdir, "identity.json")));
        done();
      });
    });

    it("exits with 0 status", function() {
      assert.equal(script.status, 0);
    });
    it("does not remove identity file", function () {
      assert(fs.existsSync(path.join(tmpdir, "identity.json")));
    });
    it("account id matches edge core's values", function () {
      assert.equal(identity.OU, edge_core_response["account-id"]);
    });
    it("device id matches edge core's values", function () {
      assert.equal(identity.deviceID, edge_core_response["internal-id"]);
    });
    it("idenity client certificates remain unchanged", function () {
      assert.equal(identity.ssl.client.key, old_identity.ssl.client.key);
      assert.equal(identity.ssl.client.certificate, old_identity.ssl.client.certificate);
    });
    it("idenity server certificates remain unchanged", function () {
      assert.equal(identity.ssl.server.key, old_identity.ssl.server.key);
      assert.equal(identity.ssl.server.certificate, old_identity.ssl.server.certificate);
    });
    it("idenity certificates authority remain unchanged", function () {
      assert.equal(identity.ssl.ca.ca, old_identity.ssl.ca.ca);
      assert.equal(identity.ssl.ca.intermediate, old_identity.ssl.ca.intermediate);
    });
    it("idenity retains led config", function () {
      assert.equal(identity.ledConfig, old_identity.ledConfig);
    })
    it("idenity retains radio config", function () {
      assert.equal(identity.radioConfig, old_identity.radioConfig);
    })
    it("idenity retains category", function () {
      assert.equal(identity.category, old_identity.category);
    })
    // This one might not be the correct behavior
    it("idenity retains gateway address", function () {
      assert.equal(identity.getwayServicesAddress, old_identity.getwayServicesAddress);
    })
    it("Ethernet Mac is the same", function () {
      assert.deepEqual(identity.ethernetMAC, old_identity.ethernetMAC);
    })
    it("Six Mac is the same", function () {
      assert.deepEqual(identity.sixBMAC, old_identity.sixBMAC);
    })
    it("Serial number is the same", function () {
      assert.equal(identity.serialNumber, old_identity.serialNumber);
    })
    it("completes in less than 200ms", function () {
      assert.equal(script.signal, null);
    })
    after(function(){
      server.close();
    })
  });
  describe("when edge-core is connected and a different old identity is present", function() {
    const port = 9004;
    const edge_core_response = {
      "account-id":"0157be9a987802420a010f0d00000000",
      "edge-version":"0.9.0-HEAD-7f13ed705161784478faa6a889b1f26beddd3f9a-",
      "endpoint-name":"016cb5be29d200000000000100100088",
      "internal-id":"016cb5be29d200000000000100100088",
      "lwm2m-server-uri":"coaps://lwm2m.us-east-1.mbedcloud.com:5684?aid=0157be9a987802420a010f0d00000000&iep=016cb5be29d200000000000100100088",
      "status":"connected"
    };
    var server = http.createServer(function(request, response) {
      response.end(JSON.stringify(edge_core_response));
    }).listen(port);
    const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "without-edge-core"));
    var old_identity = {
      serialNumber: "PROD0000000",
      OU: edge_core_response["account-id"],
      deviceID: "016cb5be29d200000000000100100087",
      ledConfig: "22",
      radioConfig: "22",
      catogory: "foo",
      ethernetMAC: [0x00, 0x11, 0x22, 0x33, 0x44, 0x55],
      sixBMAC: [0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77],
      gatewayServicesAddress: "not-an-address",
      ssl: {
        client: {
          key: "ssl-client-key",
          certificate: "ssl-client-certificate"
        },
        server: {
          key: "ssl-server-key",
          certificate: "ssl-server-certificate"
        },
        ca: {
          ca: "ssl-ca-ca",
          intermediate: "ssl-ca-intermediate"
        }
      }
    }
    fs.writeFileSync(path.join(tmpdir, "identity.json"), JSON.stringify(old_identity));
    var script;
    var identity;
    before(function (done) {
      script = runCreateNewEeprom(port, tmpdir, 2000, function(){
        let contents = fs.readFileSync(path.join(tmpdir, "identity.json"));
        identity = JSON.parse(contents);
        done();
      });
    });

    it("exits with 0 status", function() {
      assert.equal(script.status, 0);
    });
    it("does not remove identity file", function () {
      assert(fs.existsSync(path.join(tmpdir, "identity.json")));
    });
    it("account id matches edge core's values", function () {
      assert.equal(identity.OU, edge_core_response["account-id"]);
    });
    it("device id matches edge core's values", function () {
      assert.equal(identity.deviceID, edge_core_response["internal-id"]);
    });
    it("idenity has new client certificates", function () {
      assert.notEqual(identity.ssl.client.key, old_identity.ssl.client.key);
      assert.notEqual(identity.ssl.client.certificate, old_identity.ssl.client.certificate);
    });
    it("idenity has new server certificates", function () {
      assert.notEqual(identity.ssl.server.key, old_identity.ssl.server.key);
      assert.notEqual(identity.ssl.server.certificate, old_identity.ssl.server.certificate);
    });
    it("idenity has new certificate authority", function () {
      assert.notEqual(identity.ssl.ca.ca, old_identity.ssl.ca.ca);
      assert.notEqual(identity.ssl.ca.intermediate, old_identity.ssl.ca.intermediate);
    });
    it("idenity has new led config", function () {
      assert.notEqual(identity.ledConfig, old_identity.ledConfig);
    })
    it("idenity has new radio config", function () {
      assert.notEqual(identity.radioConfig, old_identity.radioConfig);
    })
    it("idenity has new category", function () {
      assert.notEqual(identity.category, old_identity.category);
    })
    // This one might not be the correct behavior
    it("idenity has new gateway address", function () {
      assert.notEqual(identity.gatewayServicesAddress, old_identity.gatewayServicesAddress);
    })
    it("Ethernet Mac is new", function () {
      assert.notDeepEqual(identity.ethernetMAC, old_identity.ethernetMAC);
    })
    it("Six Mac is new", function () {
      assert.notDeepEqual(identity.sixBMAC, old_identity.sixBMAC);
    })
    it("Serial number is new", function () {
      assert.notEqual(identity.serialNumber, old_identity.serialNumber);
    })
    it("completes in less than 200ms", function () {
      assert.equal(script.signal, null);
    })
    after(function(){
      server.close();
    })
  });
});
