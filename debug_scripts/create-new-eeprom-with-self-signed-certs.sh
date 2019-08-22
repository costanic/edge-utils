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

bold=$(tput bold)
red=$(tput setaf 1)
green=$(tput setaf 2)
normal=$(tput sgr0)

output () {
  echo "${green}"$1"${normal}"
}

error () {
  echo "${red}"$1"${normal}"
	exit 1
}

WIGWAG_ROOT=${1:-"/wigwag"}
EDGE_CORE_PORT=${2:-9101}
IDENTITY_DIR=${3:-/userdata/edge_gw_config}
BIN_DIR="$WIGWAG_ROOT/system/bin"
BASHLIB_DIR="$WIGWAG_ROOT/system/lib/bash"
SCRIPT_DIR="$WIGWAG_ROOT/wwrelay-utils/debug_scripts"
I2C_DIR="$WIGWAG_ROOT/wwrelay-utils/I2C"
export NODE_PATH="$WIGWAG_ROOT/devicejs-core-modules/node_modules/"

temp_certs=$(mktemp -d)

cleanup () {
  rm -rf $temp_certs
}

getEdgeStatus() {
  curl localhost:${EDGE_CORE_PORT}/status > $temp_certs/status.json
  status=$(jq -r .status $temp_certs/status.json)
  internalid=$(jq -r .['"internal-id"'] $temp_certs/status.json)
  lwm2mserveruri=$(jq -r .['"lwm2m-server-uri"'] $temp_certs/status.json)
  OU=$(jq -r .['"account-id"'] $temp_certs/status.json)
}

createRootPrivateKey() {
  openssl ecparam -out $temp_certs/root_key.pem -name prime256v1 -genkey
}

createRootCA() {
  ( echo '[ req ]';\
    echo 'distinguished_name=dn';\
    echo 'prompt = no';\
    echo '[ ext ]';\
    echo 'basicConstraints = CA:TRUE';\
    echo 'keyUsage = digitalSignature,\
    keyCertSign, cRLSign';\
    echo '[ dn ]'\
    ) > $temp_certs/ca_config.cnf
  ( cat $temp_certs/ca_config.cnf;\
    echo 'C=US';\
    echo 'ST=Texas';\
    echo 'L=Austin';\
    echo 'O=WigWag Inc';\
    echo 'CN=relays_wigwag.io_relay_ca';\
    ) > $temp_certs/root.cnf
  openssl req -key $temp_certs/root_key.pem -new -sha256 -x509 -days 12775\
    -out $temp_certs/root_cert.pem -config $temp_certs/root.cnf -extensions ext
}

createIntermediatePrivateKey() {
	openssl ecparam -out $temp_certs/intermediate_key.pem -name prime256v1 -genkey
}

createIntermediateCA() {
	( cat $temp_certs/ca_config.cnf;\
    echo 'C=US';\
    echo 'ST=Texas';\
    echo 'L=Austin';\
    echo 'O=WigWag Inc';\
    echo 'CN=relays_wigwag.io_relay_ca_intermediate';\
    ) > $temp_certs/int.cnf
	openssl req -new -sha256 -key $temp_certs/intermediate_key.pem \
    -out $temp_certs/intermediate_csr.pem  -config $temp_certs/int.cnf
	openssl x509 -sha256 -req -in $temp_certs/intermediate_csr.pem \
    -out $temp_certs/intermediate_cert.pem -CA $temp_certs/root_cert.pem \
    -CAkey $temp_certs/root_key.pem -days 7300 \
    -extfile $temp_certs/ca_config.cnf -extensions ext -CAcreateserial
}

createDevicePrivateKey() {
	openssl ecparam -out $temp_certs/device_private_key.pem -name prime256v1 -genkey
}

createDeviceCertificate() {
	( echo '[ req ]';\
    echo 'distinguished_name=dn';\
    echo 'prompt = no';\
    echo '[ dn ]';\
    echo 'C=US';\
    echo 'ST=Texas';\
    echo 'L=Austin';\
    echo 'O=WigWag Inc';\
    echo "OU=$OU";\
    echo "CN=$internalid";\
    ) > $temp_certs/device.cnf
	openssl req -key $temp_certs/device_private_key.pem -new -sha256 \
    -out $temp_certs/device_csr.pem -config $temp_certs/device.cnf
	openssl x509 -sha256 -req -in $temp_certs/device_csr.pem \
    -out $temp_certs/device_cert.pem -CA $temp_certs/intermediate_cert.pem \
    -CAkey $temp_certs/intermediate_key.pem -days 7300 -extensions ext -CAcreateserial
}

readEeprom() {
  deviceID=$(jq -r .deviceID ${IDENTITY_DIR}/identity.json)
  OU=$(jq -r .OU ${IDENTITY_DIR}/identity.json)
}

findGatewayServiceAddressFromMDS() {
  if [ $lwm2mserveruri = *"mds-integration-lab"* ]; then
    gatewayAddress="https://gateways.mbedcloudintegration.net"
  elif [ $lwm2mserveruri = *"mds-systemtest"* ]; then
    gatewayAddress="https://gateways.mbedcloudstaging.net"
  elif [ $lwm2mserveruri = *"lwm2m.us-east-1"* ]; then
    gatewayAddress="https://gateways.us-east-1.mbedcloud.com"
  elif [ $lwm2mserveruri = *"lwm2m.ap-northeast-1"* ]; then
    gatewayAddress="https://gateways.ap-northeast-1.mbedcloud.com"
  else
    gatewayAddress="https://unknown.mbedcloud.com"
  fi
}

burnEeprom() {
  cd $I2C_DIR
  node writeEEPROM.js $eeprom_file
  if [ $? != 0 ]; then
    output "Failed to write eeprom. Trying again in 5 seconds..."
    sleep 5
    burnEeprom
  fi
}

factoryReset() {
  cd $SCRIPT_DIR
  chmod 755 factory_wipe_gateway.sh
  ./factory_wipe_gateway.sh
}

resetDatabase() {
	output "Deleting gateway database"
	rm -rf /userdata/etc/devicejs/db
}

restart_services() {
	cd $SCRIPT_DIR
	chmod 755 reboot_edge_gw.sh
	source ./reboot_edge_gw.sh
}

execute () {
  if [ "x$status" = "xconnected" ]; then
    output "Edge-core is connected..."
    if [ ! -f ${IDENTITY_DIR}/identity.json ]; then
      # Assume we are not in factory mode (either BYOC or developer)
      output "Creating developer self-signed certificate."
      findGatewayServiceAddressFromMDS
      mkdir -p ${IDENTITY_DIR}
      $SCRIPT_DIR/get_new_gw_identity/developer_gateway_identity/bin/create-dev-identity\
        -g $gatewayAddress\
        -p DEV0\
        -o $OU\
        --temp-cert-dir $(mktemp -d)\
        --identity-dir ${IDENTITY_DIR}
      cp ${IDENTITY_DIR}/identity.json ${IDENTITY_DIR}/identity_original.json
    fi
    if [ -f ${IDENTITY_DIR}/identity.json ]; then
      output "Checking if deviceID is same..."
      readEeprom
      if [ "x$internalid" = "x$deviceID" ]; then
        output "EEPROM already has the same deviceID. No need for new eeprom."
        exit 0
      fi
    fi

    readEeprom

    if [ "x$internalid" != "x$deviceID" ]; then
      output "Generating device keys using CN=$internalid, OU=$OU"
      createRootPrivateKey
      createRootCA
      createIntermediatePrivateKey
      createIntermediateCA
      createDevicePrivateKey
      createDeviceCertificate
      if [ $? -eq 0 ]; then
        resetDatabase
        output "Creating new eeprom with new self signed certificate..."
        cd ${IDENTITY_DIR}
        node $SCRIPT_DIR/generate-new-eeprom.js $internalid
        if [ $? -eq 0 ]; then
          cleanup
          output "Success. Writing the new eeprom."
          eeprom_file="${IDENTITY_DIR}/new_eeprom.json"
          burnEeprom
          /etc/init.d/deviceOS-watchdog start
          sleep 5
          restart_services
        else
          error "Failed to create new eeprom."
        fi
      else
        error "Failed to read existing eeprom."
      fi
    else
      output "EEPROM already has the same deviceID. No need for new eeprom."
      exit 0
    fi
  else
    error "Edge-core is not connected yet. Its status is- $status. Exited with code $?."
  fi
}

getEdgeStatus
execute
