const mediasoup = require('mediasoup');

class MediasoupManager {
    constructor() {
        this.workers = [];
        this.rooms = new Map();
        this.routerOptions = {
            mediaCodecs: [
                {
                    kind: 'audio',
                    mimeType: 'audio/opus',
                    clockRate: 48000,
                    channels: 2
                },
                {
                    kind: 'video',
                    mimeType: 'video/VP8',
                    clockRate: 90000,
                    parameters: {
                        'x-google-start-bitrate': 1000
                    }
                },
                {
                    kind: 'video',
                    mimeType: 'video/H264',
                    clockRate: 90000,
                    parameters: {
                        'packetization-mode': 1,
                        'profile-level-id': '42e01f',
                        'level-asymmetry-allowed': 1
                    }
                }
            ]
        };
    }

    async init(numWorkers = 1) {
        for (let i = 0; i < numWorkers; i++) {
            const worker = await mediasoup.createWorker({
                logLevel: 'debug',
                logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp'],
            });
            this.workers.push(worker);
        }
        console.log(`${numWorkers} mediasoup Worker(s) created`);
    }

    async createRoom(roomId) {
        console.log(`Creating room: ${roomId}`);
        if (!this.rooms.has(roomId)) {
            const worker = this.workers[0];  // 단순화를 위해 첫 번째 worker 사용
            const router = await worker.createRouter(this.routerOptions);
            this.rooms.set(roomId, {
                router: router,
                producers: new Map(),
                consumers: new Map(),
                transports: new Map()
            });
        }
        return this.rooms.get(roomId);
    }

    async createWebRtcTransport(roomId) {
        console.log(`Creating WebRTC transport for room: ${roomId}`);
        const room = this.rooms.get(roomId);
        if (!room) {
            throw new Error('Room not found');
        }
    
        const transportOptions = {
            listenIps: [
                {
                    ip: '0.0.0.0',
                    announcedIp: '127.0.0.1', // 실제 서버의 공개 IP를 여기에 입력하세요
                }
            ],
            enableUdp: true,
            enableTcp: true,
            preferUdp: true,
        };
    
        const transport = await room.router.createWebRtcTransport(transportOptions);
        room.transports.set(transport.id, transport);
    
        console.log(`WebRTC transport created with ID: ${transport.id}`);
        return {
            transport,
            params: {
                id: transport.id,
                iceParameters: transport.iceParameters,
                iceCandidates: transport.iceCandidates,
                dtlsParameters: transport.dtlsParameters,
            },
        };
    }

    async connectTransport(roomId, transportId, { dtlsParameters }) {
        console.log(`Connecting transport: ${transportId} in room: ${roomId}`);
        console.log('DTLS parameters:', dtlsParameters);
        const room = this.rooms.get(roomId);
        if (!room) {
            throw new Error('Room not found');
        }
        const transport = room.transports.get(transportId);
        if (!transport) {
            throw new Error('Transport not found');
        }
        await transport.connect({ dtlsParameters });
        console.log(`Transport ${transportId} connected`);
    }

    async produce(roomId, transportId, kind, rtpParameters) {
        console.log(`Producing ${kind} in room: ${roomId} with transport: ${transportId}`);
        console.log('RTP parameters:', rtpParameters);
        const room = this.rooms.get(roomId);
        if (!room) {
            throw new Error('Room not found');
        }
        const transport = room.transports.get(transportId);
        if (!transport) {
            throw new Error('Transport not found');
        }
        
        // Validate and prepare RTP parameters
        const validRtpParameters = {
            codecs: rtpParameters.codecs.map(codec => ({
                mimeType: codec.mimeType,
                payloadType: codec.payloadType,
                clockRate: codec.clockRate,
                channels: codec.channels,
                parameters: codec.sdpFmtpLine ? { sdpFmtpLine: codec.sdpFmtpLine } : {}
            })),
            encodings: rtpParameters.encodings
        };
        
        const producer = await transport.produce({ kind, rtpParameters: validRtpParameters });
        room.producers.set(producer.id, producer);
        console.log(`Producer created with ID: ${producer.id}`);
        return { id: producer.id };
    }

    async consume(roomId, consumerId, producerId, rtpCapabilities) {
        console.log(`Consuming in room: ${roomId}, consumer: ${consumerId}, producer: ${producerId}`);
        const room = this.rooms.get(roomId);
        if (!room) {
            throw new Error('Room not found');
        }
        const producer = room.producers.get(producerId);
        if (!producer) {
            throw new Error('Producer not found');
        }
        if (!room.router.canConsume({
            producerId: producer.id,
            rtpCapabilities,
        })) {
            throw new Error('Can\'t consume');
        }
        const transport = await this.createWebRtcTransport(roomId);
        const consumer = await transport.transport.consume({
            producerId: producer.id,
            rtpCapabilities,
            paused: true,
        });
        room.consumers.set(consumerId, consumer);
        console.log(`Consumer created with ID: ${consumer.id}`);
        return {
            transportParams: transport.params,
            consumerParams: {
                id: consumer.id,
                producerId: producer.id,
                kind: consumer.kind,
                rtpParameters: consumer.rtpParameters,
            },
        };
    }

    async startScreenSharing(roomId, producerId) {
        console.log(`Starting screen sharing in room: ${roomId}, producer: ${producerId}`);
        const room = this.rooms.get(roomId);
        if (!room) {
            throw new Error('Room not found');
        }
        const producer = room.producers.get(producerId);
        if (!producer) {
            throw new Error('Producer not found');
        }
        await producer.resume();
        console.log(`Screen sharing started for producer: ${producerId}`);
    }

    async stopScreenSharing(roomId, producerId) {
        console.log(`Stopping screen sharing in room: ${roomId}, producer: ${producerId}`);
        const room = this.rooms.get(roomId);
        if (!room) {
            throw new Error('Room not found');
        }
        const producer = room.producers.get(producerId);
        if (!producer) {
            throw new Error('Producer not found');
        }
        await producer.pause();
        console.log(`Screen sharing stopped for producer: ${producerId}`);
    }

    getTransport(roomId, transportId) {
        console.log(`Getting transport: ${transportId} in room: ${roomId}`);
        const room = this.rooms.get(roomId);
        if (!room || !room.transports) {
            throw new Error('Room or transports not found');
        }
        const transport = room.transports.get(transportId);
        if (!transport) {
            throw new Error('Transport not found');
        }
        return transport;
    }
}

module.exports = MediasoupManager;