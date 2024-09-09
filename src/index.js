const https = require('https');
const express = require('express');
const app = express();
const fs = require('fs');
const MediasoupManager = require('./room');
const SignalingHandler = require('./signaling');

// HTTPS 서버 설정
const options = {
    key: fs.readFileSync('../config/_wildcard.exampel.dev+3-key.pem'),
    cert: fs.readFileSync('../config/_wildcard.exampel.dev+3.pem')
};
const server = https.createServer(options, app);
const io = require('socket.io')(server);

const mediasoupManager = new MediasoupManager();
const signalingHandler = new SignalingHandler(io, mediasoupManager);

async function run() {
    await mediasoupManager.init(1);

    io.on('connection', (socket) => {
        signalingHandler.handleConnection(socket);
    });

    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
        console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
    });
}

run().catch(console.error);
// 클라이언트 측 구현:

// 기본 HTML, CSS, JavaScript 파일 생성
// getUserMedia()를 사용한 화면 공유 기능 구현
// WebRTC 연결 설정


// 서버-클라이언트 통신:

// 시그널링 구현 (Offer/Answer 교환)
// ICE 후보 교환 구현


// 미디어 스트림 처리:

// Producer 생성 (화면 공유 스트림)
// Consumer 생성 및 관리