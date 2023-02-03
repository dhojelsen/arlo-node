import mfa from "./mfa.mjs";
import fetch from "node-fetch";
import {readFile, writeFile} from 'fs/promises'

const TOKEN_FILE = './sessions/tokens.json';
const ARLO_BASEURL = 'https://myapi.arlo.com';

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

        const resultRaw = await fetch(ARLO_BASEURL + '/hmsweb/users/devices', {
            method: 'GET',
            headers: this.#defaultHeaders
        })

        const response = await resultRaw.json()

        console.log(response)
    
    }

    async armDevice(deviceId, mode=1) {

        // make sure the client is authorized
        await this.#authorize();

        let headers = this.#defaultHeaders;
        
        const resultRaw = await fetch(ARLO_BASEURL + '/hmsweb/users/devices/automation/active', {
            method: 'POST',
            headers: headers,
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
        const response = await resultRaw.json()

        console.log(response)

    }

    async subscribe() {

        // make sure the client is authorized
        await this.#authorize();

        const resultRaw = await fetch(ARLO_BASEURL + '/hmsweb/client/subscribe', {
            method: 'GET',
            headers: this.#defaultHeaders
        });

        resultRaw.body.on('readable', () => {
            let chunk;
            while (null !== (chunk = resultRaw.body.read())) {
                this.eventHandler(chunk)
            }
        })
    }

}