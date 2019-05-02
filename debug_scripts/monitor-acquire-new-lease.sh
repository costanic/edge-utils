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

it=0

function acquireNewLease() {
    while true; do
        if [ -e "/var/run/acquireNewLease" ]; then
            # If file exists then we need to go get new IP lease
            echo "Acquiring new IP..."
            if ! pgrep -f "udhcpc" > /dev/null
            then
                echo "Starting udhcpc"
                udhcpc eth0 &
                if [ $? -eq 0 ]; then
                    echo "Hurray! successfully acquired new IP."
                    rm -rf /var/run/acquireNewLease
                fi
            else
                # If udhcpc is running then wait then let if finish before killing it
                # 25 * 5 = 125 seconds (~2 mins) has lapsed and udhcpc is still running
                # Time to kill it
                if [ $it -gt 5 ]; then
                    it=0
                    echo "udhcpc failed to acquire IP, restarting the command!"
                    kill -9 $(pgrep -f "udhcpc");
                fi
                echo "Working on it... $it"
                let "it++"
                sleep 10
            fi
        fi
        sleep 15
    done
}

acquireNewLease