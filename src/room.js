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

    async produce(roomId, producerId, kind, rtpParameters) {
        const room = this.rooms.get(roomId);
        if (!room) {
          throw new Error('Room not found');
        }
    
        const producer = await room.producerTransport.produce({
          kind,
          rtpParameters
        });
    
        room.producers.set(producerId, producer);
    
        producer.on('transportclose', () => {
          console.log('Producer transport closed');
          room.producers.delete(producerId);
        });
    
        return { id: producer.id };
    }
    
    async consume(roomId, consumerId, producerId, rtpCapabilities) {
        const room = this.rooms.get(roomId);
        if (!room) {
            throw new Error('Room not found');
        }
    
        const producer = room.producers.get(producerId);
        if (!producer) {
            throw new Error('Producer not found');
        }
    
        if (!this.router.canConsume({
            producerId: producer.id,
            rtpCapabilities,
        })) {
            throw new Error('Can\'t consume');
        }
    
        const consumer = await room.consumerTransport.consume({
            producerId: producer.id,
            rtpCapabilities,
            paused: true, // 소비자는 처음에 일시 중지된 상태로 시작
        });
    
        room.consumers.set(consumerId, consumer);
    
        consumer.on('transportclose', () => {
            console.log('Consumer transport closed');
            room.consumers.delete(consumerId);
        });
    
        consumer.on('producerclose', () => {
            console.log('Producer of consumer closed');
            room.consumers.delete(consumerId);
        });
    
        return {
            id: consumer.id,
            producerId: producer.id,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
        };
    }
    
    async startScreenSharing(roomId, producerId) {
        const room = this.rooms.get(roomId);
        if (!room) {
            throw new Error('Room not found');
        }
    
        const producer = room.producers.get(producerId);
        if (!producer) {
            throw new Error('Producer not found');
        }
    
        await producer.resume();
    
        // 룸의 모든 소비자에게 새 스트림을 알림
        room.consumers.forEach(async (consumer) => {
            if (consumer.producerId === producerId) {
                await consumer.resume();
            }
        });
    }
    
    async stopScreenSharing(roomId, producerId) {
        const room = this.rooms.get(roomId);
        if (!room) {
            throw new Error('Room not found');
        }
    
        const producer = room.producers.get(producerId);
        if (!producer) {
            throw new Error('Producer not found');
        }
    
        await producer.pause();
    
        // 룸의 모든 소비자에게 스트림 중지를 알림
        room.consumers.forEach(async (consumer) => {
            if (consumer.producerId === producerId) {
                await consumer.pause();
            }
        });
    }
}

module.exports = MediasoupManager;