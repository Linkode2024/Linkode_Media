//프로젝트 설정:
// Node.js 프로젝트 초기화
// 필요한 패키지 설치 (mediasoup, express 등)
const https = require('https');
const express = require('express');
const app = express();
const fs = require('fs');

// 서버 구성:
// Express를 사용한 기본 HTTP 서버 설정
// WebSocket 서버 설정 (socket.io 등 사용)
const options = {
    key: fs.readFileSync('../config/_wildcard.exampel.dev+3-key.pem'),
    cert: fs.readFileSync('../config/_wildcard.exampel.dev+3.pem')
  };
const server = https.createServer(options, app);

const io = require('socket.io')(server);
io.on('connection', (socket) => {
    console.log('새로운 클라이언트가 연결되었습니다.');
  
    // 여기에 WebSocket 이벤트 핸들러를 추가합니다.
    socket.on('join-room', (roomId) => {
      // 방 참여 로직
    });
  
    socket.on('disconnect', () => {
      console.log('클라이언트가 연결을 종료했습니다.');
    });
  });

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
});

// mediasoup 설정:

// Worker, Router, Transport 설정
// 미디어 코덱 및 RTP 파라미터 설정


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