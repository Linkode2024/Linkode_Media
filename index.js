const express = require('express');
const app = express();
const http = require('http');
const socketIo = require('socket.io');
const mediasoup = require('mediasoup');

const server = http.createServer(app);
const io = socketIo(server);
const port = 9000;

app.get('/', (req, res) => {
  res.send('WebRTC Server is running!');
});

server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

let workers = [];
let nextMediasoupWorkerIdx = 0;

async function createWorkers() {
  const { numWorkers } = require('./config').mediasoup;

  for (let i = 0; i < numWorkers; i++) {
    const worker = await mediasoup.createWorker({
      logLevel: 'debug',
      rtcMinPort: 40000,
      rtcMaxPort: 49999,
    });

    worker.on('died', () => {
      console.error('mediasoup Worker died, exiting in 2 seconds... [pid:%d]', worker.pid);
      setTimeout(() => process.exit(1), 2000);
    });

    workers.push(worker);
  }
}

function getMediasoupWorker() {
  const worker = workers[nextMediasoupWorkerIdx];
  if (++nextMediasoupWorkerIdx === workers.length) nextMediasoupWorkerIdx = 0;
  return worker;
}

(async () => {
  await createWorkers();
})();
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on('createRoom', async (data, callback) => {
    const worker = getMediasoupWorker();
    const router = await worker.createRouter({
      mediaCodecs: [
        {
          kind: 'video',
          mimeType: 'video/VP8',
          clockRate: 90000,
          parameters: {},
        },
      ],
    });

    const room = new Room(router, socket.id); // Room 클래스는 별도로 구현되어야 합니다.
    roomList[socket.id] = room; // roomList는 현재 방의 목록을 관리하는 객체입니다.

    callback({ routerRtpCapabilities: router.rtpCapabilities });
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    delete roomList[socket.id];
  });
});