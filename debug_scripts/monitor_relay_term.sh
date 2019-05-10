#!/bin/bash

# Copyright (c) 2018, Arm Limited and affiliates.
# SPDX-License-Identifier: Apache-2.0
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

START_RELAY_TERM="/etc/init.d/relayterm start"

# Monitor the relay term process, untill its added to maestro
function run_relay_term() {
    while true; do
        if ! pgrep -f "relay-term" > /dev/null
        then
            # Only start edge-core if maestro is running
            if pgrep "maestro" > /dev/null; then
                # Give enough time for maestro to setup keystore
                sleep 15
                $START_RELAY_TERM &
            fi
        fi
        sleep 10
    done
}

run_relay_term