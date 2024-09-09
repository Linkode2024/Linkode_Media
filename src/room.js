const mediasoup = require('mediasoup');

// mediasoup Worker, Router, Transport 관리를 위한 클래스
class MediasoupManager {
    constructor() {
      this.workers = [];
      this.router = null;
      this.rooms = new Map();  // 룸 관리를 위한 Map
    }
  
    async init(numWorkers = 1) {
        // Worker 생성
        for (let i = 0; i < numWorkers; i++) {
        const worker = await mediasoup.createWorker({
            logLevel: 'warn',
            logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp'],
        });
        this.workers.push(worker);
        }
        console.log(`${numWorkers} mediasoup Worker(s) created`);

        // Router 생성 (첫 번째 Worker 사용)
        const routerOptions = {
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
            }
        ]
        };
        this.router = await this.workers[0].createRouter(routerOptions);
        console.log('Router created');
    }

    async createTransport(type) {
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

        if (type === 'producer') {
            this.producerTransport = await this.router.createWebRtcTransport(transportOptions);
            console.log('Producer transport created');
            return this.producerTransport;
        } else if (type === 'consumer') {
            this.consumerTransport = await this.router.createWebRtcTransport(transportOptions);
            console.log('Consumer transport created');
            return this.consumerTransport;
        }
    }

    async createRoom(roomId) {
        if (!this.rooms.has(roomId)) {
          this.rooms.set(roomId, {
            producers: new Map(),
            consumers: new Map()
          });
        }
        return this.rooms.get(roomId);
      }
    
    async addProducer(roomId, userId, producer) {
        const room = await this.createRoom(roomId);
        room.producers.set(userId, producer);
    }

    async removeProducer(roomId, userId) {
        const room = this.rooms.get(roomId);
        if (room) {
            room.producers.delete(userId);
        }
    }

    async createConsumer(roomId, producerId, rtpCapabilities) {
        const room = this.rooms.get(roomId);
        if (!room) throw new Error('Room not found');

        const producer = room.producers.get(producerId);
        if (!producer) throw new Error('Producer not found');

        if (!this.router.canConsume({ producerId: producer.id, rtpCapabilities })) {
            throw new Error('Can\'t consume');
        }

        const transport = await this.createTransport('consumer');
        const consumer = await transport.consume({
            producerId: producer.id,
            rtpCapabilities,
            paused: true,
        });

        room.consumers.set(consumer.id, consumer);
        return { consumer, transport };
    }

    async startScreenSharing(roomId, userId, producer) {
        await this.addProducer(roomId, userId, producer);
        // Notify all users in the room to start consuming
    }

    async stopScreenSharing(roomId, userId) {
        await this.removeProducer(roomId, userId);
        // Notify all users in the room to stop consuming
    }
}

module.exports = MediasoupManager;