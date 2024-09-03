const express = require('express');
const http = require('http');
const cors = require('cors');
const mediasoup = require('mediasoup');
const SockJS = require('sockjs');

const app = express();
const server = http.createServer(app);
const sockjsServer = SockJS.createServer();
sockjsServer.installHandlers(server, { prefix: '/sockjs' });

app.use(cors());

const workers = [];
const mediaCodecs = [
    {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2,
    },
    {
        kind: 'video',
        mimeType: 'video/VP8',
        clockRate: 90000,
        parameters: {},
    },
];

let router;
let producer;
let transport;

async function createWorkers() {
    const numWorkers = 1; // 간단히 하나의 worker만 사용합니다.
    for (let i = 0; i < numWorkers; i++) {
        const worker = await mediasoup.createWorker();
        workers.push(worker);
    }
    return workers[0];
}

async function createRouter(worker) {
    router = await worker.createRouter({ mediaCodecs });
}

async function createWebRtcTransport(router) {
    transport = await router.createWebRtcTransport({
        listenIps: [{ ip: '0.0.0.0', announcedIp: '127.0.0.1' }],
        enableUdp: true,
        enableTcp: true,
    });
    return transport;
}

sockjsServer.on('connection', async (socket) => {
    console.log('클라이언트 연결 성공:', socket.id);

    const worker = await createWorkers();
    await createRouter(worker);
    const transport = await createWebRtcTransport(router);

    socket.write(JSON.stringify({ type: 'transportCreated', transportOptions: transport }));

    socket.on('data', async (message) => {
        const data = JSON.parse(message);

        switch (data.type) {
            case 'connectTransport':
                await transport.connect({ dtlsParameters: data.dtlsParameters });
                break;
            case 'produce':
                producer = await transport.produce({ kind: data.kind, rtpParameters: data.rtpParameters });
                socket.write(JSON.stringify({ type: 'produced', id: producer.id }));
                break;
            case 'consume':
                const consumer = await transport.consume({
                    producerId: producer.id,
                    rtpCapabilities: data.rtpCapabilities,
                });
                socket.write(JSON.stringify({
                    type: 'consumed',
                    id: consumer.id,
                    producerId: producer.id,
                    kind: consumer.kind,
                    rtpParameters: consumer.rtpParameters,
                }));
                break;
        }
    });

    socket.on('close', () => {
        console.log('클라이언트 연결 종료:', socket.id);
    });
});

server.listen(9999, () => {
    console.log("⭐️ 서버가 localhost:9999에서 실행 중입니다! ⭐️");
});
