// import WebSocket from 'isomorphic-ws';

import { cbor as cborHelpers, NetworkAdapter, type PeerMetadata, type PeerId } from '@automerge/automerge-repo/slim';
import debug from 'debug';
import { PartySocketOptions, PartySocket } from 'partysocket';
import WebSocket from 'ws';
const log = debug('WebsocketServer');

import {
  FromClientMessage,
  FromServerMessage,
  assert,
  toArrayBuffer,
  ProtocolV1,
  JoinMessage,
  isPeerMessage,
  isErrorMessage,
} from './automerge-repo-network-websocket/index.js';

const { encode, decode } = cborHelpers;

type TimeoutId = ReturnType<typeof setTimeout>;

function joinMessage(senderId: PeerId, peerMetadata: PeerMetadata): JoinMessage {
  return {
    type: 'join',
    senderId,
    peerMetadata,
    supportedProtocolVersions: [ProtocolV1],
  };
}
export class PartykitNodeWsAdapter extends NetworkAdapter {
  isReady() {
    return this.#ready;
  }

  whenReady() {
    return this.#readyPromise;
  }

  #forceReady() {
    // console.log("[party]::forceReady", this.isReady(), this.resolver);
    if (!this.#ready) {
      this.emit('ready', { network: this });
      this.#ready = true;
      this.resolver?.();
    }
  }

  #ready = false;
  #readyResolver?: () => void;
  resolver?: () => void;
  #readyPromise: Promise<void>;

  #retryIntervalId?: TimeoutId;
  #log = debug('automerge-repo:websocket:browser');

  remotePeerId?: PeerId; // this adapter only connects to one remote client at a time

  socket?: PartySocket | undefined;

  constructor(
    private opts: PartySocketOptions, //   public readonly retryInterval = 5000
  ) {
    super();

    this.#ready = false;
    this.#readyPromise = new Promise<void>((resolve) => {
      this.#readyResolver = resolve;
      this.resolver = resolve;
    });
  }

  connect(peerId: PeerId, peerMetadata?: PeerMetadata) {
    if (!this.socket || !this.peerId) {
      // first time connecting
      this.#log('connecting');
      this.peerId = peerId;
      this.peerMetadata = peerMetadata ?? {};
    } else {
      this.#log('reconnecting');
      assert(peerId === this.peerId);
      // Remove the old event listeners before creating a new connection.
      this.socket.removeEventListener('open', this.onOpen);
      this.socket.removeEventListener('close', this.onClose);
      this.socket.removeEventListener('message', this.onMessage);
      this.socket.removeEventListener('error', this.onError);
    }

    this.socket = new PartySocket(this.opts);

    this.socket.binaryType = 'arraybuffer';

    this.socket.addEventListener('open', this.onOpen);
    this.socket.addEventListener('close', this.onClose);
    this.socket.addEventListener('message', this.onMessage);
    this.socket.addEventListener('error', this.onError);

    // Mark this adapter as ready if we haven't received an ack in 1 second.
    // We might hear back from the other end at some point but we shouldn't
    // hold up marking things as unavailable for any longer
    setTimeout(() => this.#forceReady(), 1000);
    this.join();
  }

  onOpen = () => {
    this.#log('open');
    clearInterval(this.#retryIntervalId);
    // this.#retryIntervalId = undefined;
    this.join();
  };

  // When a socket closes, or disconnects, remove it from the array.
  onClose = () => {
    this.#log('close');
    if (this.remotePeerId) this.emit('peer-disconnected', { peerId: this.remotePeerId });
  };

  onMessage = (event: MessageEvent) => {
    this.receiveMessage(event.data as Uint8Array);
  };

  /** The websocket error handler signature is different on node and the browser.  */
  onError = (
    event:
      | Event // browser
      | ErrorEvent, // node
  ) => {
    console.log('[Socket Error]', event);
    if ('error' in event) {
      // (node)
      if (event.error.code !== 'ECONNREFUSED') {
        /* c8 ignore next */
        // throw event.error;
      }
    } else {
      // (browser) We get no information about errors. https://stackoverflow.com/a/31003057/239663
      // There will be an error logged in the console (`WebSocket connection to 'wss://foo.com/'
      // failed`), but by design the error is unavailable to scripts. We'll just assume this is a
      // failed connection.
    }
    this.#log('Connection failed, retrying...');
  };

  join() {
    assert(this.peerId);
    assert(this.socket);
    if (this.socket.readyState === WebSocket.OPEN) {
      this.send(joinMessage(this.peerId!, this.peerMetadata!));
    } else {
      // We'll try again in the `onOpen` handler
    }
  }

  disconnect() {
    assert(this.peerId);
    assert(this.socket);
    const socket = this.socket;
    if (socket) {
      socket.removeEventListener('open', this.onOpen);
      socket.removeEventListener('close', this.onClose);
      socket.removeEventListener('message', this.onMessage);
      socket.removeEventListener('error', this.onError);
      socket.close();
    }
    clearInterval(this.#retryIntervalId);
    if (this.remotePeerId) this.emit('peer-disconnected', { peerId: this.remotePeerId });
    this.socket = undefined;
  }

  send(message: FromClientMessage) {
    if ('data' in message && message.data?.byteLength === 0) throw new Error('Tried to send a zero-length message');
    assert(this.peerId);
    assert(this.socket);
    if (!this.socket) {
      this.#log('Tried to send on a disconnected socket.');
      return;
    }
    if (this.socket.readyState !== WebSocket.OPEN) throw new Error(`Websocket not ready (${this.socket.readyState})`);

    const encoded = encode(message);
    this.socket.send(toArrayBuffer(encoded));
  }

  peerCandidate(remotePeerId: PeerId, peerMetadata: PeerMetadata) {
    assert(this.socket);
    this.#forceReady();
    this.remotePeerId = remotePeerId;
    this.emit('peer-candidate', {
      peerId: remotePeerId,
      peerMetadata,
    });
  }

  receiveMessage(messageBytes: Uint8Array) {
    const message: FromServerMessage = decode(new Uint8Array(messageBytes));
    assert(this.socket);
    if (messageBytes.byteLength === 0) throw new Error('received a zero-length message');

    if (isPeerMessage(message)) {
      const { peerMetadata } = message;
      this.#log(`peer: ${message.senderId}`);
      this.peerCandidate(message.senderId, peerMetadata);
    } else if (isErrorMessage(message)) {
      this.#log(`error: ${message.message}`);
    } else {
      this.emit('message', message);
    }
  }
}

// export class _PartykitNodeWsAdapter extends NetworkAdapter {
//   #isReady = false;
//   #readyPromise;
//   #readyResolver

//   sockets: Set<PeerId> = new Set();

//   remotePeerId: PeerId;

//   isReady() {
//     return this.#isReady;
//   }

//   whenReady() {
//     return this.#readyPromise;
//   }

//   constructor(private socket: WebSocket) {
//     super();

//     this.#readyPromise = new Promise((resolve) => {
//       this.#readyResolver = resolve;
//     });
//   }

//   connect(peerId: PeerId, peerMetadata: PeerMetadata) {
//     console.log('Connect', { peerId, peerMetadata, remotePeer: this.remotePeerId });
//     this.peerId = peerId;
//     this.peerMetadata = peerMetadata;

//     this.sockets.add(peerId);

//     const socket = this.socket;

//     socket.addEventListener('close', () => {
//       // clearInterval(keepAliveId);
//       this.disconnect();
//     });

//     socket.addEventListener('message', (message) => {
//       // console.log('[PARTY]::MESSAGE', message);
//       // handleChunked((message) => this.receiveMessage(message as Uint8Array, socket));
//       const data = new Uint8Array(message.data as ArrayBufferLike);
//       this.receiveMessage(data as Uint8Array, socket);
//     });

//     // setTimeout(() => this.#ready(), 1000);
//     this.emit('ready', { network: this });
//   }

//   disconnect() {
//     this.#terminate(this.socket);
//   }

//   send(message: FromServerMessage) {
//     assert('targetId' in message && message.targetId !== undefined);
//     if ('data' in message && message.data?.byteLength === 0) throw new Error('Tried to send a zero-length message');

//     const senderId = this.peerId;
//     assert(senderId, 'No peerId set for the websocket server network adapter.');

//     // const socket = this.sockets[message.targetId];

//     if (!this.socket) {
//       log(`Tried to send to disconnected peer: ${message.targetId}`);
//       return;
//     }

//     const encoded = encode(message);
//     const arrayBuf = toArrayBuffer(encoded);

//     // sendChunked(arrayBuf, this.socket);
//     this.socket.send(arrayBuf);
//   }

//   receiveMessage(messageBytes: Uint8Array, socket: WebSocket) {
//     const message: FromClientMessage = decode(messageBytes);

//     const { type, senderId } = message;
//     // console.log('[party]::ReceivedMessage', { type, senderId });

//     const myPeerId = this.peerId;
//     assert(myPeerId);

//     const documentId = 'documentId' in message ? '@' + message.documentId : '';
//     const { byteLength } = messageBytes;
//     log(`[${senderId}->${myPeerId}${documentId}] ${type} | ${byteLength} bytes`);

//     if (isJoinMessage(message)) {
//       const { peerMetadata, supportedProtocolVersions } = message;

//       // Let the repo know that we have a new connection.
//       this.emit('peer-candidate', { peerId: senderId, peerMetadata });
//       // this.sockets[senderId] = socket;
//       this.remotePeerId = senderId;
//       this.sockets.add(senderId);

//       const selectedProtocolVersion = selectProtocol(supportedProtocolVersions);
//       if (selectedProtocolVersion === null) {
//         this.send({
//           type: 'error',
//           senderId: this.peerId!,
//           message: 'unsupported protocol version',
//           targetId: senderId,
//         });
//         this.sockets[senderId].close();
//         delete this.sockets[senderId];
//       } else {
//         this.send({
//           type: 'peer',
//           senderId: this.peerId!,
//           peerMetadata: this.peerMetadata!,
//           selectedProtocolVersion: ProtocolV1,
//           targetId: senderId,
//         });
//       }
//     } else if (isLeaveMessage(message)) {
//       const { senderId } = message;
//       const socket = this.sockets[senderId];
//       /* c8 ignore next */
//       if (!socket) return;
//       this.#terminate(socket as WebSocket);
//     } else {
//       this.emit('message', message);
//     }
//   }

//   #terminate(socket: WebSocket) {
//     this.sockets.delete(this.remotePeerId);
//     this.emit('peer-disconnected', { peerId: this.remotePeerId });
//   }
// }

// const selectProtocol = (versions?: ProtocolVersion[]) => {
//   if (versions === undefined) return ProtocolV1;
//   if (versions.includes(ProtocolV1)) return ProtocolV1;
//   return null;
// };
