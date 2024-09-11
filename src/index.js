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
    origin: 'https://localhost:3000',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Socket.IO 설정
const io = require('socket.io')(server, {
    cors: {
        origin: "https://localhost:3000",
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
        console.log('New client connected');
        signalingHandler.handleConnection(socket);
    });

    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

run().catch(console.error);