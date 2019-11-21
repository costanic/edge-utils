'use strict'

/*
 * Copyright (c) 2018, Arm Limited and affiliates.
 * SPDX-License-Identifier: Apache-2.0
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const inquirer = require('inquirer');
const uuid = require('uuid');
const crypto = require('crypto');
const execSync = require('child_process').execSync;
const fs = require('fs');
const IDGenerator = require('./IDgenerator');
const program = require('commander');

program
	.version('1.0.0')
  .option('-g, --gatewayServicesAddress []', 'The gateway services API address')
  .option('-a, --apiServerAddress []', 'API server address')
  .option('-p, --serialNumberPrefix []', 'Serial Number Prefix')
  .option('-o, --organizationUnit []', 'Account ID', uuid.v4().replace(/-/g, ""))
  .option('--temp-cert-dir []', 'Directory that contains the temporary certs', './temp_certs')
  .option('--script-dir []', 'Directory that contains the generate_self_signed_certs.sh script', '.')
  .option('--identity-dir []', 'Directory to place identity.json into', '.')
  .option('--internal-id []', 'Device identity obtained from edge-core', generateRandomEUI())
  .parse(process.argv);

var validHostURI = /^(https\:\/\/)?((?:(?:[a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9])\.)*(?:[A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\-]*[A-Za-z0-9]))$/;

function gatewayAddressQuestion(_default) {
    if (!_default || typeof _default == 'string' || _default.length < 0) {
        _default = '';
    }
    let message = 'Enter the gateway services API address?';
    if (_default.length > 0) {
        message += ' ('+_default+')';
    }
    return inquirer.prompt([{
        type: 'input',
        name: 'gatewayServicesAddress',
        message: message,
        validate: function(answer) {
            if(answer.length) {
                var m = validHostURI.exec(answer);
                if (m && m.length > 2) {
                    if (typeof m[1] != 'string' || m[1].length < 1) {
                        answer = 'https://' + m[2];
                    }
                    return true;
                }
                return 'Please enter the gateway services address?';
            } else {
                return 'Please enter the gateway services address?';
            }
        }
    }]);
}

function apiAddressQuestion(_default) {
    if (!_default || typeof _default == 'string' || _default.length < 0) {
        _default = '';
    }
    let message = 'Enter API server address?';
    if (_default.length > 0) {
        message += ' ('+_default+')';
    }
    return inquirer.prompt([{
        type: 'input',
        name: 'apiServerAddress',
        message: message,
        validate: function(answer) {
            if(answer.length) {
                var m = validHostURI.exec(answer);
                if (m && m.length > 2) {
                    if (typeof m[1] != 'string' || m[1].length < 1) {
                        answer = 'https://' + m[2];
                    }
                    return true;
                }
                return 'Please enter API server address?';
            } else {
                return 'Please enter API server address?';
            }
        }
    }])
}

function cleanupURL(answer) {
    var m = validHostURI.exec(answer);
    if (m && m.length > 2) {
        if (typeof m[1] != 'string' || m[1].length < 1) {
            answer = 'https://' + m[2];
        }
        return answer;
    }    
}

var addrs = {};

async function confirmAddresses() {
    let ok = {confirmed: false};
    var ret = {};
    while (!ok.confirmed) {
        addrs.apiAddr = await apiAddressQuestion();
        addrs.gwAddr = await gatewayAddressQuestion();
        ret.gatewayServicesAddress = cleanupURL(addrs.gwAddr.gatewayServicesAddress);
        ret.apiServerAddress = cleanupURL(addrs.apiAddr.apiServerAddress);
        console.log("API address: %s\nGateway services API addresss: %s\n",ret.apiServerAddress,ret.gatewayServicesAddress);
        ok = await inquirer.prompt([{
            type: 'confirm',
            name: 'confirmed',
            message: 'Confirm these are the correct addresses.',
            validate: function(answer) {
                console.log("HEY!!!");
                if (answer == 'y' || answer == 'Y') {
                    ok = true;
                    return true;
                }
            }
        }]);
    }
    return ret;
}

function generateRandomEUI() {
    return [crypto.randomBytes(1)[0], crypto.randomBytes(1)[0], crypto.randomBytes(1)[0]];
}


function findGatewayServiceAddressFromMDS(server_uri) {
    return findServiceAddressFromMDS(server_uri, "gateways")
}

function findEdgeK8sServiceAddressFromMDS(server_uri) {
    return findServiceAddressFromMDS(server_uri, "edge-k8s")
}

function findServiceAddressFromMDS(server_uri, service_name) {
    var integrationLab = /.*mds-integration-lab.*/;
    var systemtest = /.*mds-systemtest.*/;
    var usEast = /.*lwm2m.us-east-1.*/;
    var apNortheast = /.*lwm2m.ap-northeast-1.*/;
    if (integrationLab.exec(server_uri)) {
        return "https://" + service_name + ".mbedcloudintegration.net";
    } else if (systemtest.exec(server_uri)) {
        return "https://" + service_name + ".mbedcloudstaging.net";
    } else if (usEast.exec(server_uri)) {
        return "https://" + service_name + ".us-east-1.mbedcloud.com";
    } else if (apNortheast.exec(server_uri)) {
        return "https://" + service_name + ".ap-northeast-1.mbedcloud.com";
    } else {
        return "https://unknown.mbedcloud.com";
    }
}

const run = async() => {
    let identity_obj = {};

    let currentSerialNumber = crypto.randomBytes(2).readUInt16BE(0, true);
    identity_obj.serialNumber = IDGenerator.SerialIDGenerator(program.serialNumberPrefix || 'SOFT', currentSerialNumber, currentSerialNumber + 1);
    identity_obj.OU = program.organizationUnit;
    identity_obj.deviceID = program.internalId;
    identity_obj.hardwareVersion = "rpi3bplus";
    identity_obj.radioConfig = "00";
    identity_obj.ledConfig = "01";
    identity_obj.category = "development";
    let eui = generateRandomEUI();
    identity_obj.ethernetMAC = [0, 165, 9].concat(eui);
    identity_obj.sixBMAC = [0, 165, 9, 0, 1].concat(eui);
    identity_obj.hash = [];

    if(!program.gatewayServicesAddress)
        addrs = await confirmAddresses();
    else
        addrs = {
            gatewayServicesAddress: findGatewayServiceAddressFromMDS(program.gatewayServicesAddress),
            edgek8sServicesAddress: findEdgeK8sServiceAddressFromMDS(program.gatewayServicesAddress)
        };

    identity_obj = Object.assign({}, identity_obj, addrs);
    identity_obj.cloudAddress = identity_obj.gatewayServicesAddress;

    identity_obj.ssl = {};
    execSync('OU=' + identity_obj.OU + ' internalid=' + identity_obj.deviceID + ' ' +  program.scriptDir +'/generate_self_signed_certs.sh ' + program.tempCertDir);
    const device_key = fs.readFileSync(program.tempCertDir + '/device_private_key.pem', 'utf8');
    const device_cert = fs.readFileSync(program.tempCertDir + '/device_cert.pem', 'utf8');
    const root_cert = fs.readFileSync(program.tempCertDir + '/root_cert.pem', 'utf8');
    const intermediate_cert = fs.readFileSync(program.tempCertDir + '/intermediate_cert.pem', 'utf8');

    identity_obj.ssl.client = {};
    identity_obj.ssl.client.key = device_key;
    identity_obj.ssl.client.certificate = device_cert;

    identity_obj.ssl.server = {};
    identity_obj.ssl.server.key = device_key;
    identity_obj.ssl.server.certificate = device_cert;

    identity_obj.ssl.ca = {};
    identity_obj.ssl.ca.ca = root_cert;
    identity_obj.ssl.ca.intermediate = intermediate_cert;

    execSync('rm -rf ' + program.tempCertDir);

    console.log('Writing developer identity file with serialNumber=%s, identity.json', identity_obj.serialNumber);
    fs.writeFileSync(program.identityDir + '/identity.json', JSON.stringify(identity_obj, null, 4), 'utf8');
    console.log('Success. Bye!');
}

run();
