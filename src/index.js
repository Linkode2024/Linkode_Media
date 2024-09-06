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
const producers = {}; // 각 유저의 화면을 공유할 때의 producer를 저장
const consumers = {}; // 각 유저의 consumer를 저장
let transports = {};  // 각 유저의 transport를 저장

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
    const transport = await router.createWebRtcTransport({
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
    transports[socket.id] = await createWebRtcTransport(router);

    socket.write(JSON.stringify({ type: 'transportCreated', transportOptions: transports[socket.id] }));

    socket.on('data', async (message) => {
        const data = JSON.parse(message);

        switch (data.type) {
            case 'connectTransport':
                await transports[socket.id].connect({ dtlsParameters: data.dtlsParameters });
                break;
            case 'produce':
                producers[socket.id] = await transports[socket.id].produce({ kind: data.kind, rtpParameters: data.rtpParameters });
                socket.write(JSON.stringify({ type: 'produced', id: producers[socket.id].id }));
                break;
            case 'consume':
                if (producers[data.producerId]) {
                    const consumer = await transports[socket.id].consume({
                        producerId: producers[data.producerId].id,
                        rtpCapabilities: data.rtpCapabilities,
                    });
                    consumers[socket.id] = consumer;
                    socket.write(JSON.stringify({
                        type: 'consumed',
                        id: consumer.id,
                        producerId: producers[data.producerId].id,
                        kind: consumer.kind,
                        rtpParameters: consumer.rtpParameters,
                    }));
                }
                break;
            case 'stopScreenShare':
                // 유해 앱을 중단한 유저의 화면 공유를 종료
                if (producers[socket.id]) {
                    await producers[socket.id].close();
                    delete producers[socket.id];
                    socket.write(JSON.stringify({ type: 'screenShareStopped', id: socket.id }));
                }
                break;
        }
    });

    socket.on('close', () => {
        console.log('클라이언트 연결 종료:', socket.id);
        // 유저가 나갈 경우, 미디어 서버와의 연결 해제
        if (producers[socket.id]) {
            producers[socket.id].close();
            delete producers[socket.id];
        }
        if (transports[socket.id]) {
            transports[socket.id].close();
            delete transports[socket.id];
        }
    });
});

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/test.html');
});

server.listen(9000, () => {
    console.log("⭐️ 서버가 localhost:9000에서 실행 중입니다! ");
});
