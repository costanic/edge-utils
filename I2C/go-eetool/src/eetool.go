package main

// Copyright (c) 2018, Arm Limited and affiliates.
// SPDX-License-Identifier: Apache-2.0
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.


import (
    "fmt"
    I2C "golang.org/x/exp/io/i2c"
    "regexp"
    "encoding/hex"
    "os/exec"
    "log"
    "syscall"
    "io/ioutil"
)

func check(err error) {
    if err != nil { 
        log.Fatal(err) 
    }
}

type eeprom_anatomy struct {
    name string
    pageaddr int
    memaddr byte
    length int
} 

type eeData struct {
    name string
    data string
}

//Need to define two file names because one cert needs to be concatenated
type certs_anatomy struct {
    metavariable string
    fname1 string
    fname2 string
}

var sslCerts = []certs_anatomy {
    certs_anatomy { "ARCH_CLIENT_KEY_PEM", "/mnt/.boot/.ssl/client.key.pem", ""},
    certs_anatomy { "ARCH_CLIENT_CERT_PEM", "/mnt/.boot/.ssl/client.cert.pem", ""},
    certs_anatomy { "ARCH_SERVER_KEY_PEM", "/mnt/.boot/.ssl/server.key.pem", ""},
    certs_anatomy { "ARCH_SERVER_CERT_PEM", "/mnt/.boot/.ssl/server.cert.pem", ""},
    certs_anatomy { "ARCH_CA_CERT_PEM", "/mnt/.boot/.ssl/ca.cert.pem", ""},
    certs_anatomy { "ARCH_INTERMEDIATE_CERT_PEM", "/mnt/.boot/.ssl/intermediate.cert.pem", ""},
    certs_anatomy { "ARCH_CA_CHAIN_CERT_PEM", "/mnt/.boot/.ssl/ca.cert.pem", "/mnt/.boot/.ssl/intermediate.cert.pem"},
}

var metadata = []eeprom_anatomy {
    eeprom_anatomy {"ARCH_BRAND",             0x50, 0, 2   },
    eeprom_anatomy {"ARCH_DEVICE",            0x50, 2, 2   },
    eeprom_anatomy {"ARCH_UUID",              0x50, 4, 6   },
    eeprom_anatomy {"ARCH_RELAYID",           0x50, 0, 10  },
    eeprom_anatomy {"ARCH_HARDWARE_VERSION",  0x50, 10, 5  },
    eeprom_anatomy {"ARCH_WW_PLATFORM",       0x50, 10, 5  },
    eeprom_anatomy {"ARCH_FIRMWARE_VERSION",  0x50, 15, 5  },
    eeprom_anatomy {"ARCH_RADIO_CONFIG",      0x50, 20, 2  },
    eeprom_anatomy {"ARCH_YEAR",              0x50, 22, 1  },
    eeprom_anatomy {"ARCH_MONTH",             0x50, 23, 1  },
    eeprom_anatomy {"ARCH_BATCH",             0x50, 24, 1  },
    eeprom_anatomy {"ARCH_ETHERNET_MAC",      0x50, 25, 6  },
    eeprom_anatomy {"ARCH_SIXLBR_MAC",        0x50, 31, 8  },
    eeprom_anatomy {"ARCH_RELAY_SECRET",      0x50, 39, 32 },
    eeprom_anatomy {"ARCH_PAIRING_CODE",      0x50, 71, 25 },
    eeprom_anatomy {"ARCH_LED_CONFIG",        0x50, 96, 2  },
    eeprom_anatomy {"ARCH_LED_COLOR_PROFILE", 0x50, 96, 2  },
    eeprom_anatomy {"ARCH_CLOUD_URL",         0x51, 0, 250 },
    eeprom_anatomy {"ARCH_CLOUD_DEVJS_URL",   0x52, 0, 250 },
    eeprom_anatomy {"ARCH_CLOUD_DDB_URL",     0x53, 0, 250 },
}

var regex = "[^a-zA-Z0-9.:/-]"

func get_eeprom(prop eeprom_anatomy) (eeData, error) {

    bus, err := I2C.Open(&I2C.Devfs{Dev: "/dev/i2c-1"}, prop.pageaddr)
    if err != nil {
        return eeData{"", ""}, err
    }

    data := make([]byte, prop.length)

    err = bus.ReadReg(prop.memaddr, data)
    if err != nil {
        return eeData{"", ""}, err
    }

    dataStr := string(data)

    r, _ := regexp.Compile(regex)
    dataStr = r.ReplaceAllString(string(data), "")

    if prop.name == "ARCH_WW_PLATFORM" {
        dataStr = "wwrelay_v" + dataStr
    }

    if prop.name == "ARCH_ETHERNET_MAC" || prop.name == "ARCH_SIXLBR_MAC" {
        dataStr = hex.EncodeToString(data)
    }

    if prop.name == "ARCH_LED_COLOR_PROFILE" {
        if dataStr == "02" {
            dataStr = "RBG"
        } else {
            dataStr = "RGB"
        }
    }

    bus.Close()

    return eeData{prop.name, dataStr}, err
}

func read_file(cert certs_anatomy) (eeData, error) {

    data, err := ioutil.ReadFile(cert.fname1)
    if err != nil {
        return eeData{"", ""}, err
    }

    dataStr := string(data)

    if cert.fname2 != "" {
        data2, err := ioutil.ReadFile(cert.fname2)
        if err != nil {
            return eeData{"", ""}, err
        }

        dataStr = dataStr + string(data2)
    }

    return eeData{cert.metavariable, dataStr}, err
}

func GetPlatformVars() (err error) {
    eepromData := make([]eeData, len(metadata) + len(sslCerts))

    for i := 0; i < len(metadata); i++ {
        eepromData[i], err = get_eeprom(metadata[i])
        if err != nil {
            return
        }

        fmt.Printf("%s --> %s\n", eepromData[i].name, eepromData[i].data)
    }
    
    cmd := exec.Command("mount", "/dev/mmcblk0p1", "/mnt/.boot/")

    err = cmd.Run()
    exitCode := 0
    if err != nil {
        if exitError, ok := err.(*exec.ExitError); ok {
            ws := exitError.Sys().(syscall.WaitStatus)
            exitCode = ws.ExitStatus()
        }
        log.Printf("command result, exitCode: %v", exitCode) 
        //if exitCode is 32 that means it is already mounted
        if exitCode == 32 {
            err = nil
            log.Printf("Already mounted... continuing reading certs")
        } else {
            return
        }
    }


    for i := len(metadata); i < (len(metadata) + len(sslCerts)); i++ {
        eepromData[i], err = read_file(sslCerts[i - len(metadata)])
        if err != nil {
            return
        }

        fmt.Printf("%s --> %s\n", eepromData[i].name, eepromData[i].data)
    }
    return

}

func main() {
    GetPlatformVars()
}  
