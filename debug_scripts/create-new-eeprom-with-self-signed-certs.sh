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

WIGWAG_ROOT=${1:-"/wigwag"}
EDGE_CORE_PORT=${2:-9101}
IDENTITY_DIR=${3:-/userdata/edge_gw_config}
SCRIPT_DIR="$WIGWAG_ROOT/wwrelay-utils/debug_scripts"
PATH=$SCRIPT_DIR/get_new_gw_identity/developer_gateway_identity/bin:$NODE_PATH/developer_identity/bin:$PATH

getEdgeStatus() {
  tmpfile=$(mktemp)
  curl localhost:${EDGE_CORE_PORT}/status > $tmpfile
  status=$(jq -r .status $tmpfile)
  internalid=$(jq -r .['"internal-id"'] $tmpfile)
  lwm2mserveruri=$(jq -r .['"lwm2m-server-uri"'] $tmpfile)
  OU=$(jq -r .['"account-id"'] $tmpfile)
}

readEeprom() {
  deviceID=$(jq -r .deviceID ${IDENTITY_DIR}/identity.json)
}

execute () {
  if [ "x$status" = "xconnected" ]; then
    echo "Edge-core is connected..."
    readEeprom
    if [ ! -f ${IDENTITY_DIR}/identity.json -o  "x$internalid" != "x$deviceID"  ]; then
      echo "Creating developer self-signed certificate."
      mkdir -p ${IDENTITY_DIR}
      if [ -f ${IDENTITY_DIR}/identity.json ] ; then
        cp ${IDENTITY_DIR}/identity.json ${IDENTITY_DIR}/identity_original.json
      fi
      create-dev-identity\
        -g $lwm2mserveruri\
        -p DEV0\
        -o $OU\
        --temp-cert-dir $(mktemp -d)\
        --identity-dir ${IDENTITY_DIR}\
        --internal-id $internalid
    fi
  else
    echo "Error: edge-core is not connected yet. Its status is- $status. Exited with code $?."
  fi
}

getEdgeStatus
execute
