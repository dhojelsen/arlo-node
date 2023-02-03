import fetch from "node-fetch";
import Imap from 'imap';

const ARLO_BASEURL = 'https://ocapi-app.arlo.com/api';

/**
 * This module initiates a arlo login, using mail as MFA
 */
export default class mfa {

    // private variables
    #arloUser;
    #arloPassword;
    #emailUser;
    #emailPassword;
    #emailServer;
    #arloUserId;
    #arloFactorToken;
    #arloFactorId;
    #arloFactorAuthCode;
    #arloPin;
    #arloToken;
    #arloTokenExpiry;
    #defaultHeaders = {
        "content-type": "application/json; charset=UTF-8",
        "origin": "https://my.arlo.com",
        "referer": "https://my.arlo.com/"
    }

    constructor(arloUser, arloPassword, emailUser, emailPassword, emailServer) {
        this.#arloUser = arloUser;
        this.#arloPassword = arloPassword;
        this.#emailUser = emailUser;
        this.#emailPassword = emailPassword;
        this.#emailServer = emailServer;
    }

    #getTime() {
        return Math.round(Date.now() / 1000)
    }

    async #auth() {

        const resultRaw = await fetch(ARLO_BASEURL + '/auth', {
            method: 'POST', 
            headers: this.#defaultHeaders,
            body: JSON.stringify({
                email: this.#arloUser,
                password: btoa(this.#arloPassword),
                language: 'en',
                EnvSource: 'prod',
            })
        })

        const response = await resultRaw.json()

        this.#arloUserId = response.data.userId;
        this.#arloFactorToken = response.data.token;

    }

    async #getFactors() {

        const headers = this.#defaultHeaders;
        headers['authorization'] = btoa(this.#arloFactorToken)

        const resultRaw = await fetch(ARLO_BASEURL + '/getFactors?data=' + this.#getTime(), {
            method: 'GET', 
            headers: headers
        })

        const response = await resultRaw.json()

        // get factorId for factorType email
        this.#arloFactorId = response.data.items.find(item => item.factorType == 'EMAIL').factorId;
        
    }

    async #startAuth() {

        const headers = this.#defaultHeaders;
        headers['authorization'] = btoa(this.#arloFactorToken)

        const resultRaw = await fetch(ARLO_BASEURL + '/startAuth', {
            method: 'POST', 
            headers: headers,
            body: JSON.stringify({
                factorId: this.#arloFactorId,
                factorType: "EMAIL",
                userId: this.#arloUserId
            })
        })

        const response = await resultRaw.json()

        this.#arloFactorAuthCode = response.data.factorAuthCode;
        
    }

    async #getPin() {

        const emailServerConfig = {
            // IMAP connection config
            user: this.#emailUser,
            password: this.#emailPassword,
            host: this.#emailServer,
            port: 993,
            tls: true,
            tlsOptions: {
                rejectUnauthorized: false,
            },
        };

        const imap = new Imap(emailServerConfig);

        let pin = await new Promise((resolve) => {

            imap.once('ready', () => {

                imap.openBox('INBOX', false, (err, box) => {

                    if (err) {
                        console.error(err.message);
                        resolve(false);
                    }

                    imap.once('mail', function () {
                        let fetch = imap.seq.fetch(`${box.messages.total}:${box.messages.total}`, {
                            bodies: 'TEXT'
                        });

                        fetch.on('message', (message) => {

                            message.on('body', (stream) => {
                                let buffer = '';
                                stream.on('data', function (chunk) {
                                    buffer += chunk.toString('utf8');
                                });
                                stream.once('end', function () {
                                    resolve(buffer.match(/\t+([0-9]{6})/)[1]);
                                });
                            });
                            
                        });
                    })
                });
            })

            imap.once('error', (err) => {
                console.error(err);
                resolve(false);
            });
            
            imap.connect();
        });



        // disconnect
        imap.end()

        // storing arlo pin
        this.#arloPin = pin;
    }


    async #waitForPin() {

        return new Promise(resolve => {
            
            const interval = setInterval(() => {
                if(this.#arloPin) {
                    clearInterval(interval);
                    resolve(true)
                }
            }, 500)
        })
        
    }

    async #finishAuth() {


        const headers = this.#defaultHeaders;
        headers['authorization'] = btoa(this.#arloFactorToken)

        const resultRaw = await fetch(ARLO_BASEURL + '/finishAuth', {
            method: 'POST', 
            headers: headers,
            body: JSON.stringify({
                factorAuthCode: this.#arloFactorAuthCode, 
                isBrowserTrusted: true, 
                otp: this.#arloPin 
            })
        })

        const response = await resultRaw.json()
        this.#arloToken = response.data.token;
        this.#arloTokenExpiry = response.data.expiresIn;
        
    }

    async getAuthToken() {

        // check if there is an unexpired token
        await this.#auth()
        await this.#getFactors()
        this.#getPin();
        await this.#startAuth()
        await this.#waitForPin()
        await this.#finishAuth()

        return {
            arloUserId: this.#arloUserId,
            arloToken: this.#arloToken,
            arloTokenExpiry: this.#arloTokenExpiry 
        };
    }


}