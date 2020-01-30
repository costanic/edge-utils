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

cert_dir=${1:-temp_certs}

cleanup () {
	rm -rf ${cert_dir}
}

_createRootPrivateKey() {
	openssl ecparam -out ${cert_dir}/root_key.pem -name prime256v1 -genkey
}
_createRootCA() {
	(echo '[ req ]'; echo 'distinguished_name=dn'; echo 'prompt = no'; echo '[ ext ]'; echo 'basicConstraints = CA:TRUE'; echo 'keyUsage = digitalSignature, keyCertSign, cRLSign'; echo '[ dn ]') > ${cert_dir}/ca_config.cnf
	(cat ${cert_dir}/ca_config.cnf; echo 'C=US'; echo 'ST=Texas';echo 'L=Austin';echo 'O=ARM';echo 'CN=relays_arm.io_gateway_ca';) > ${cert_dir}/root.cnf
	openssl req -key ${cert_dir}/root_key.pem -new -sha256 -x509 -days 12775 -out ${cert_dir}/root_cert.pem -config ${cert_dir}/root.cnf -extensions ext
}

_createIntermediatePrivateKey() {
	openssl ecparam -out ${cert_dir}/intermediate_key.pem -name prime256v1 -genkey
}

_createIntermediateCA() {
	(cat ${cert_dir}/ca_config.cnf; echo 'C=US'; echo 'ST=Texas'; echo 'L=Austin';echo 'O=ARM';echo 'CN=relays_arm.io_gateway_ca_intermediate';) > ${cert_dir}/int.cnf
	openssl req -new -sha256 -key ${cert_dir}/intermediate_key.pem -out ${cert_dir}/intermediate_csr.pem  -config ${cert_dir}/int.cnf
	openssl x509 -sha256 -req -in ${cert_dir}/intermediate_csr.pem -out ${cert_dir}/intermediate_cert.pem -CA ${cert_dir}/root_cert.pem -CAkey ${cert_dir}/root_key.pem -days 7300 -extfile ${cert_dir}/ca_config.cnf -extensions ext -CAcreateserial
}

_createDevicePrivateKey() {
	openssl ecparam -out ${cert_dir}/device_private_key.pem -name prime256v1 -genkey
}

_createDeviceCertificate() {
	(echo '[ req ]'; echo 'distinguished_name=dn'; echo 'prompt = no'; echo '[ dn ]'; echo 'C=US'; echo 'ST=Texas';echo 'L=Austin';echo 'O=ARM';echo "OU=$OU";echo "CN=$internalid";) > ${cert_dir}/device.cnf
	openssl req -key ${cert_dir}/device_private_key.pem -new -sha256 -out ${cert_dir}/device_csr.pem -config ${cert_dir}/device.cnf
	openssl x509 -sha256 -req -in ${cert_dir}/device_csr.pem -out ${cert_dir}/device_cert.pem -CA ${cert_dir}/intermediate_cert.pem -CAkey ${cert_dir}/intermediate_key.pem -days 7300 -extensions ext -CAcreateserial
}

generate_self_signed_certs() {
    mkdir -p ${cert_dir}
    _createRootPrivateKey
    _createRootCA
    _createIntermediatePrivateKey
    _createIntermediateCA
    _createDevicePrivateKey
    _createDeviceCertificate
}

generate_self_signed_certs
