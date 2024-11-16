// import WebSocket from 'isomorphic-ws';
// import { type WebSocketServer } from 'isomorphic-ws';

import debug from 'debug';
const log = debug('WebsocketServer');

import { cbor as cborHelpers, NetworkAdapter, type PeerMetadata, type PeerId } from '@automerge/automerge-repo/slim';
import { FromClientMessage, FromServerMessage, isJoinMessage, isLeaveMessage } from './messages.js';
import { ProtocolV1, ProtocolVersion } from './protocolVersion.js';
import { assert } from './assert.js';
import { toArrayBuffer } from './toArrayBuffer.js';
import { Connection as WebSocket } from 'partyserver';
// import { handleChunked, sendChunked } from './chunking.js';

const { encode, decode } = cborHelpers;

export class PartyKitWSServerAdapter extends NetworkAdapter {
  #isReady = false;
  #readyPromise;
  #readyResolver;

  sockets: Set<PeerId> = new Set();

  remotePeerId: PeerId;

  isReady() {
    return this.#isReady;
  }

  whenReady() {
    return this.#readyPromise;
  }

  #ready() {
    if (this.#isReady) return;
    this.#isReady = true;
    this.#readyResolver?.();
  }

  constructor(private socket: WebSocket) {
    super();

    this.#readyPromise = new Promise((resolve) => {
      this.#readyResolver = resolve;
    });
  }

  connect(peerId: PeerId, peerMetadata: PeerMetadata) {
    // console.log('Connect', { peerId, peerMetadata, remotePeer: this.remotePeerId });
    this.peerId = peerId;
    this.peerMetadata = peerMetadata;

    this.sockets.add(peerId);

    const socket = this.socket;

    socket.addEventListener('close', () => {
      // clearInterval(keepAliveId);
      this.disconnect();
    });

    socket.addEventListener('message', (message) => {
      // console.log('[PARTY]::MESSAGE', message);
      // handleChunked((message) => this.receiveMessage(message as Uint8Array, socket));
      const data = new Uint8Array(message.data as ArrayBufferLike);
      this.receiveMessage(data as Uint8Array, socket);
    });

    // setTimeout(() => this.#ready(), 1000);
    // this.emit('ready', { network: this });
  }

  disconnect() {
    this.#terminate(this.socket);
  }

  send(message: FromServerMessage) {
    assert('targetId' in message && message.targetId !== undefined);
    if ('data' in message && message.data?.byteLength === 0) throw new Error('Tried to send a zero-length message');

    const senderId = this.peerId;
    assert(senderId, 'No peerId set for the websocket server network adapter.');

    // const socket = this.sockets[message.targetId];

    if (!this.socket) {
      log(`Tried to send to disconnected peer: ${message.targetId}`);
      return;
    }

    const encoded = encode(message);
    const arrayBuf = toArrayBuffer(encoded);

    // sendChunked(arrayBuf, this.socket);
    this.socket.send(arrayBuf);
  }

  receiveMessage(messageBytes: Uint8Array, socket: WebSocket) {
    const message: FromClientMessage = decode(messageBytes);

    const { type, senderId } = message;
    // console.log('[party]::ReceivedMessage', { type, senderId });

    const myPeerId = this.peerId;
    assert(myPeerId);

    const documentId = 'documentId' in message ? '@' + message.documentId : '';
    const { byteLength } = messageBytes;
    log(`[${senderId}->${myPeerId}${documentId}] ${type} | ${byteLength} bytes`);

    if (isJoinMessage(message)) {
      const { peerMetadata, supportedProtocolVersions } = message;

      // Let the repo know that we have a new connection.
      this.emit('peer-candidate', { peerId: senderId, peerMetadata });
      // this.sockets[senderId] = socket;
      this.remotePeerId = senderId;
      this.sockets.add(senderId);

      const selectedProtocolVersion = selectProtocol(supportedProtocolVersions);
      if (selectedProtocolVersion === null) {
        this.send({
          type: 'error',
          senderId: this.peerId!,
          message: 'unsupported protocol version',
          targetId: senderId,
        });
        this.sockets[senderId].close();
        delete this.sockets[senderId];
      } else {
        this.send({
          type: 'peer',
          senderId: this.peerId!,
          peerMetadata: this.peerMetadata!,
          selectedProtocolVersion: ProtocolV1,
          targetId: senderId,
        });
      }
    } else if (isLeaveMessage(message)) {
      const { senderId } = message;
      const socket = this.sockets[senderId];
      /* c8 ignore next */
      if (!socket) return;
      this.#terminate(socket as WebSocket);
    } else {
      this.emit('message', message);
    }
  }

  #terminate(socket: WebSocket) {
    this.sockets.delete(this.remotePeerId);
    this.emit('peer-disconnected', { peerId: this.remotePeerId });
  }
}

const selectProtocol = (versions?: ProtocolVersion[]) => {
  if (versions === undefined) return ProtocolV1;
  if (versions.includes(ProtocolV1)) return ProtocolV1;
  return null;
};
