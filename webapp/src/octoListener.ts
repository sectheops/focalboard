// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
import {Utils} from './utils'

// These are outgoing commands to the server
type WSCommand = {
    action: string
    blockIds: string[]
}

// These are messages from the server
type WSMessage = {
    action: string
    blockId: string
}

//
// OctoListener calls a handler when a block or any of its children changes
//
class OctoListener {
    get isOpen(): boolean {
        return this.ws !== undefined
    }

    readonly serverUrl: string
    private ws?: WebSocket
    private blockIds: string[] = []
    private isInitialized = false

    notificationDelay = 200
    reopenDelay = 3000

    constructor(serverUrl?: string) {
        this.serverUrl = serverUrl || window.location.origin
        Utils.log(`OctoListener serverUrl: ${this.serverUrl}`)
    }

    open(blockIds: string[], onChange: (blockId: string) => void) {
        let timeoutId: NodeJS.Timeout

        if (this.ws) {
            this.close()
        }

        const url = new URL(this.serverUrl)
        const wsServerUrl = `ws://${url.host}${url.pathname}ws/onchange`
        Utils.log(`OctoListener open: ${wsServerUrl}`)
        const ws = new WebSocket(wsServerUrl)
        this.ws = ws

        ws.onopen = () => {
            Utils.log('OctoListener webSocket opened.')
            this.addBlocks(blockIds)
            this.isInitialized = true
        }

        ws.onerror = (e) => {
            Utils.logError(`OctoListener websocket onerror. data: ${e}`)
        }

        ws.onclose = (e) => {
            Utils.log(`OctoListener websocket onclose, code: ${e.code}, reason: ${e.reason}`)
            if (ws === this.ws) {
                // Unexpected close, re-open
                const reopenBlockIds = this.isInitialized ? this.blockIds.slice() : blockIds.slice()
                Utils.logError(`Unexpected close, re-opening with ${reopenBlockIds.length} blocks...`)
                setTimeout(() => {
                    this.open(reopenBlockIds, onChange)
                }, this.reopenDelay)
            }
        }

        ws.onmessage = (e) => {
            Utils.log(`OctoListener websocket onmessage. data: ${e.data}`)
            if (ws !== this.ws) {
                Utils.log('Ignoring closed ws')
                return
            }

            try {
                const message = JSON.parse(e.data) as WSMessage
                switch (message.action) {
                case 'UPDATE_BLOCK':
                    if (timeoutId) {
                        clearTimeout(timeoutId)
                    }
                    timeoutId = setTimeout(() => {
                        timeoutId = undefined
                        onChange(message.blockId)
                    }, this.notificationDelay)
                    break
                default:
                    Utils.logError(`Unexpected action: ${message.action}`)
                }
            } catch (e) {
                Utils.log('message is not an object')
            }
        }
    }

    close() {
        if (!this.ws) {
            return
        }

        Utils.log(`OctoListener close: ${this.ws.url}`)

        // Use this sequence so the onclose method doesn't try to re-open
        const ws = this.ws
        this.ws = undefined
        this.blockIds = []
        this.isInitialized = false
        ws.close()
    }

    addBlocks(blockIds: string[]): void {
        if (!this.isOpen) {
            Utils.assertFailure('OctoListener.addBlocks: ws is not open')
            return
        }

        const command: WSCommand = {
            action: 'ADD',
            blockIds,
        }

        this.ws.send(JSON.stringify(command))
        this.blockIds.push(...blockIds)
    }

    removeBlocks(blockIds: string[]): void {
        if (!this.isOpen) {
            Utils.assertFailure('OctoListener.removeBlocks: ws is not open')
            return
        }

        const command: WSCommand = {
            action: 'REMOVE',
            blockIds,
        }

        this.ws.send(JSON.stringify(command))

        // Remove registered blockIds, maintinging multiple copies (simple ref-counting)
        for (let i = 0; i < this.blockIds.length; i++) {
            for (let j = 0; j < blockIds.length; j++) {
                if (this.blockIds[i] === blockIds[j]) {
                    this.blockIds.splice(i, 1)
                    blockIds.splice(j, 1)
                }
            }
        }
    }
}

export {OctoListener}
