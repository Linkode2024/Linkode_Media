const https = require('https');
const express = require('express');
const app = express();
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const MediasoupManager = require('./room');
const SignalingHandler = require('./signaling');

// HTTPS 서버 설정
const options = {
    key: fs.readFileSync('../config/_wildcard.exampel.dev+3-key.pem'),
    cert: fs.readFileSync('../config/_wildcard.exampel.dev+3.pem')
};
const server = https.createServer(options, app);

// CORS 설정
app.use(cors({
    origin: 'https://localhost:3000',  // 모든 출처 허용 (보안상 위험할 수 있으므로 실제 운영 환경에서는 특정 도메인만 허용하는 것이 좋습니다)
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));
  
// Socket.IO 설정
const io = require('socket.io')(server, {
    cors: {
      origin: "https://localhost:3000",  // 클라이언트의 주소로 변경
      methods: ["GET", "POST"],
      credentials: true
    },
    transports: ['websocket']
  });

const mediasoupManager = new MediasoupManager();
const signalingHandler = new SignalingHandler(io, mediasoupManager);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'test.html'));
  });

async function run() {
    await mediasoupManager.init(1);

    io.on('connection', (socket) => {
        signalingHandler.handleConnection(socket);

        // 기존 이벤트 핸들러
        socket.on('join-room', (roomId, userId) => signalingHandler.handleJoinRoom(socket, roomId, userId));

        // 새로운 미디어 스트림 관련 이벤트 핸들러들
        socket.on('create-producer-transport', (roomId, callback) => signalingHandler.handleCreateProducerTransport(socket, roomId, callback));
        socket.on('create-consumer-transport', (roomId, callback) => signalingHandler.handleCreateConsumerTransport(socket, roomId, callback));
        socket.on('connect-producer-transport', (roomId, transportId, dtlsParameters, callback) => 
            signalingHandler.handleConnectProducerTransport(socket, roomId, transportId, dtlsParameters, callback)
        );      
        socket.on('connect-consumer-transport', (dtlsParameters, callback) => signalingHandler.handleConnectConsumerTransport(socket, dtlsParameters, callback));
        socket.on('produce', (roomId, producerId, kind, rtpParameters, callback) => 
            signalingHandler.handleProduce(socket, roomId, producerId, kind, rtpParameters, callback));
        socket.on('consume', (roomId, consumerId, producerId, rtpCapabilities, callback) => 
            signalingHandler.handleConsume(socket, roomId, consumerId, producerId, rtpCapabilities, callback));
        socket.on('start-screen-share', (roomId, producerId) => 
            signalingHandler.handleStartScreenShare(socket, roomId, producerId));
        socket.on('stop-screen-share', (roomId, producerId) => 
            signalingHandler.handleStopScreenShare(socket, roomId, producerId));

        socket.on('disconnect', () => signalingHandler.handleDisconnect(socket));
    });

    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
        console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
    });
}

run().catch(console.error);