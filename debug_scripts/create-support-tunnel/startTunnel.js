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

var exec = require('child_process').exec;
var minPort = 19991;
var maxPort = 19000;
var supportIP = 'tunnel.wigwag.com';

function randomInt(low, high) {
    return Math.floor(Math.random() * (high - low)) + low;
}

function startTunnel() {
    console.log('startTunnel');
    randomPort = randomInt(minPort, maxPort);
    var command = 'ssh -f -N -R ' + randomPort + ':localhost:22 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null support@' + supportIP + ' -i ' + process.argv[2];
    var sshSupport = exec(command, function(error, stdout, stderr) {
        console.log("Ended Support Tunnel");
    });
}

startTunnel();