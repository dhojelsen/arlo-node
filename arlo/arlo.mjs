import mfa from "./mfa.mjs";
import { gotScraping } from 'got-scraping'
import {readFile, writeFile} from 'fs/promises'

const TOKEN_FILE = './sessions/tokens.json';
const ARLO_BASEURL = 'https://myapi.arlo.com';
const GENERATEDHEADEROPTIONS = {
    browsers: [
        {
            name: 'chrome',
            minVersion: 110,
            maxVersion: 110
        }
    ],
    devices: ['desktop'],
    locales: ['en-US'],
    operatingSystems: ['linux'],
}

export default class arlo {

    #arloUser;
    #arloPassword;
    #emailUser;
    #emailPassword;
    #emailServer;
    #arloAuthObject = false;
    #defaultHeaders = {
        "content-type": "application/json; charset=UTF-8",
        "origin": "https://my.arlo.com",
        "referer": "https://my.arlo.com/",
        "auth-version": 2,
        "schemaversion": 1
    }

    constructor(arloUser, arloPassword, emailUser, emailPassword, emailServer) {
        this.#arloUser = arloUser;
        this.#arloPassword = arloPassword;
        this.#emailUser = emailUser;
        this.#emailPassword = emailPassword;
        this.#emailServer = emailServer;
    }

    async #loadAuth() {

        try { 
            this.#setAuthObject(JSON.parse(await readFile(TOKEN_FILE))[this.#arloUser]) 
        } catch(e) {
            this.#arloAuthObject = {}
        }
    }

    async #getAuthToken() {

        const arloMFA = new mfa(this.#arloUser,
                                this.#arloPassword,
                                this.#emailUser,
                                this.#emailPassword,
                                this.#emailServer);

        this.#setAuthObject(await arloMFA.getAuthToken());

        let tokens = {};

        // try reading the file
        try { 
            tokens = JSON.parse(await readFile(TOKEN_FILE))
        } catch(e) {}

        tokens[this.#arloUser] = this.#arloAuthObject;

        writeFile(TOKEN_FILE,JSON.stringify(tokens));
    }

    #setAuthObject(arloAuthObject) {
        this.#arloAuthObject = arloAuthObject
        this.#defaultHeaders['authorization'] = arloAuthObject.arloToken;
    }

    async #authorize() {

        // load file if first time
        if(!this.#arloAuthObject) {
            await this.#loadAuth()
        }

        // is arloAuthObject not set or too old?
        if(!this.#arloAuthObject.arloTokenExpiry || this.#arloAuthObject.arloTokenExpiry < Math.round(Date.now() / 1000)) {

            await this.#getAuthToken()

        }

    }

    eventHandler(data) {
        
        // parse and trigger event
        let event = JSON.parse(
            data.toString() // convert to string
            .replace(/\n/g,'') // remove newlines
            .replace(/^event: messagedata: /,'') // strip text to leave JSON
        )

        console.log(event);
    }

    async getDevices() {

        // make sure the client is authorized
        await this.#authorize();

        const resultRaw = await gotScraping(ARLO_BASEURL + '/hmsweb/users/devices', {
            method: 'GET',
            headers: this.#defaultHeaders,
            headerGeneratorOptions: GENERATEDHEADEROPTIONS
        })

        const response = JSON.parse(resultRaw.body)

        console.log(response)
    
    }

    async armDevice(deviceId, mode=1) {

        // make sure the client is authorized
        await this.#authorize();

        let headers = this.#defaultHeaders;
        
        const resultRaw = await gotScraping(ARLO_BASEURL + '/hmsweb/users/devices/automation/active', {
            method: 'POST',
            headers: headers,
            headerGeneratorOptions: GENERATEDHEADEROPTIONS,
            body: JSON.stringify({
                "activeAutomations": [
                    {
                        "deviceId": deviceId,
                        "timestamp": Date.now(),
                        "activeModes": [
                            "mode" + mode
                        ],
                        "activeSchedules": []
                    }
                ]
            })
        })
        const response = JSON.parse(resultRaw.body)

        console.log(response)

    }

    async subscribe() {

        // make sure the client is authorized
        await this.#authorize();

        const resultRaw = await gotScraping(ARLO_BASEURL + '/hmsweb/client/subscribe', {
            isStream: true,
            method: 'GET',
            headers: this.#defaultHeaders,
            headerGeneratorOptions: GENERATEDHEADEROPTIONS
        });

        resultRaw.on('data', data => {
            this.eventHandler(data)
        })
    }

}