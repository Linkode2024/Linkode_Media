const mediasoup = require('mediasoup');
const fs = require('fs');
const http = require('http');
// const https = require('https');
const express = require('express');
const socketIO = require('socket.io');
const config = require('./config');
const path = require('path');
const cors = require('cors');
const RoomManager = require('./roomManager');

let worker;
let webServer;
let socketServer;
let expressApp;
let mediasoupRouter;
let io;
const roomManager = new RoomManager();

(async () => {
  try {
    await runExpressApp();
    await runWebServer();
    await runSocketServer();
    await runMediasoupWorker();
  } catch (err) {
    console.error(err);
  }
})();

async function runExpressApp() {
    expressApp = express();
    const corsOptions = {
        origin: ['https://localhost:3000', 'https://www.yourfrontendomain.com'], // Add your frontend domain
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true
    };
    expressApp.use(cors(corsOptions));
    expressApp.use(express.json());
    expressApp.use(express.static(__dirname));

    expressApp.get('/test', (res,req)=>{
        res.send('test success!');
    })
    
    /// API routes
    expressApp.post('/api/joinRoom', (req, res) => {
        const { studyroomId, memberId } = req.body;
        try {
            roomManager.joinRoom(studyroomId, memberId);
            res.json({ success: true, message: 'Joined room successfully' });
        } catch (error) {
            res.status(400).json({ success: false, message: error.message });
        }
    });

    expressApp.post('/api/leaveRoom', (req, res) => {
        const { studyroomId, memberId } = req.body;
        try {
        roomManager.leaveRoom(studyroomId, memberId);
        res.json({ success: true, message: 'Left room successfully' });
        } catch (error) {
        res.status(400).json({ success: false, message: error.message });
        }
    });

    expressApp.get('/api/roomMembers/:studyroomId', (req, res) => {
        const { studyroomId } = req.params;
        const members = roomManager.getRoomMembers(studyroomId);
        res.json({ success: true, members });
    });

    expressApp.post('/api/updateMemberAppUsage', (req, res) => {
        const { studyroomId, memberId, appName } = req.body;
        try {
        roomManager.updateMemberAppUsage(studyroomId, memberId, appName);
        res.json({ success: true, message: 'Member app usage updated successfully' });
        } catch (error) {
        res.status(400).json({ success: false, message: error.message });
        }
    });

    expressApp.get('/api/roomDetails/:studyroomId', (req, res) => {
        const { studyroomId } = req.params;
        const room = roomManager.getRoom(studyroomId);
        if (!room) {
          return res.status(404).json({ error: 'Room not found' });
        }
        
        const members = room.getMembers();
        const memberAppUsage = members.map(memberId => ({
          memberId,
          appUsage: room.getMemberAppUsage(memberId)
        }));
    
        res.json({
          studyroomId,
          members,
          memberAppUsage
        });
    });

    expressApp.get('/api/rooms', (req, res) => {
        const rooms = roomManager.getAllRooms();
        res.json({ success: true, rooms });
    });

    expressApp.use((error, req, res, next) => {
        if (error) {
        console.warn('Express app error,', error.message);
        error.status = error.status || (error.name === 'TypeError' ? 400 : 500);
        res.statusMessage = error.message;
        res.status(error.status).send(String(error));
        } else {
        next();
        }
    });

    expressApp.post('/api/broadcast', (req, res) => {
        const { studyroomId, memberId, event, data } = req.body;
        console.log(`Broadcasting event: ${event} for studyroom: ${studyroomId}, member: ${memberId}`);
        
        if (!io) {
            console.error('Socket.IO not initialized');
            return res.status(500).send('Internal server error: Socket.IO not initialized');
        }
        
        try {
            io.to(studyroomId.toString()).emit(event, { memberId, response: data });
            res.status(200).send('Broadcast successful');
        } catch (error) {
            console.error('Error broadcasting:', error);
            res.status(500).send('Internal server error: ' + error.message);
        }
    });
}

async function runWebServer() {
      // https 로 테스트하고 싶은 경우 아래 주석처리 후 여기 주석 비활성화해서 사용하기
    //   const { listenIp, listenPort, sslKey, sslCrt } = config;
    //   if (!fs.existsSync(sslKey) || !fs.existsSync(sslCrt)) {
    //       console.error('SSL files are not found. Check your config.js file');
    //       process.exit(0);
    //   }
    //   const tls = {
    //       cert: fs.readFileSync(sslCrt),
    //       key: fs.readFileSync(sslKey),
    //   };
    //   webServer = https.createServer(tls, expressApp);

    const { listenIp, listenPort } = config;
    webServer = http.createServer(expressApp);
    webServer.on('error', (err) => {
        console.error('starting web server failed:', err.message);
    }); 
      await new Promise((resolve) => {
          webServer.listen(listenPort, listenIp, () => {
              const listenIps = config.mediasoup.webRtcTransport.listenIps[0];
              const ip = listenIps.announcedIp || listenIps.ip;
              console.log('server is running');
              console.log(`open https://${ip}:${listenPort} in your web browser`);
              resolve();
          });
      });

    // await new Promise((resolve) => {
    //     webServer.listen(listenPort, listenIp, () => {
    //     const listenIps = config.mediasoup.webRtcTransport.listenIps[0];
    //     const ip = listenIps.announcedIp || listenIps.ip;
    //     console.log('server is running');
    //     console.log(`open https://${ip}:${listenPort} in your web browser`);
    //     resolve();
    //     });
    // });
}

async function runSocketServer() {
    socketServer = socketIO(webServer, {
        serveClient: false,
        path: '/socket.io',
        log: false,
        cors: {
            origin: ['https://localhost:3000'],
            methods: ['GET', 'POST'],
            allowedHeaders: ['Content-Type', 'Authorization'],
            credentials: true
        }
    });
    io = socketServer; 
    socketServer.on('connection', async (socket) => {
        console.log('client connected');

        const { studyroomId, memberId, appInfo } = socket.handshake.query;

        if (!studyroomId || !memberId || !appInfo) {
            console.error('Missing studyroomId, memberId, or appInfo');
            socket.disconnect(true);
            return;
        }

        try {
            let parsedAppInfo;
            try {
                parsedAppInfo = JSON.parse(appInfo);
            } catch (e) {
                parsedAppInfo = appInfo;
            }

            socket.studyroomId = studyroomId;
            socket.memberId = memberId;
            socket.appInfo = parsedAppInfo;

            // 커넥션하면 자동으로 스터디룸에 입장
            const room = await joinRoom(socket, studyroomId, memberId, parsedAppInfo);

            // studyroom이 업데이트되면 브로드캐스트
            const broadcastRoomUpdate = () => {
                const updatedMembers = roomManager.getRoomMembersWithAppUsage(studyroomId);
                console.log(`Broadcasting room update for room ${studyroomId}:`, updatedMembers);
                socketServer.to(studyroomId).emit('roomUpdate', {
                    studyroomId,
                    members: updatedMembers
                });
            };

            // 스터디룸에 입장하면 해당 스터디룸의 정보 전송
            socket.emit('roomJoined', {
                studyroomId,
                members: roomManager.getRoomMembersWithAppUsage(studyroomId),
                rtpCapabilities: room.router.rtpCapabilities
            });

            // 브로드캐스트
            broadcastRoomUpdate();

            // 소켓 연결 끊기
            socket.on('disconnect', () => {
                console.log(`Client disconnected: ${socket.memberId} from room ${socket.studyroomId}`);
                if (socket.studyroomId && socket.memberId) {
                    leaveRoom(socket);
                    broadcastRoomUpdate();
                }
            });

            socket.on('updateAppUsage', ({ appInfo }) => {
                if (!socket.studyroomId || !socket.memberId) {
                    return;
                }
                
                try {
                    console.log(`Updating app usage for ${socket.memberId} in room ${socket.studyroomId}: ${JSON.stringify(appInfo)}`);
                    roomManager.updateMemberAppUsage(socket.studyroomId, socket.memberId, appInfo);
                    
                    // 유해앱 체크
                    const isHarmfulApp = checkIfHarmfulApp(appInfo); 

                    // 룸의 모든 멤버에게 업데이트된 정보를 브로드캐스트
                    const updatedMembers = roomManager.getRoomMembersWithAppUsage(socket.studyroomId);
                    socketServer.to(socket.studyroomId).emit('roomUpdate', {
                        studyroomId: socket.studyroomId,
                        members: updatedMembers
                    });
                    
                    // 업데이트 성공 메시지를 요청한 클라이언트에게 전송
                    socket.emit('appUsageUpdated', { success: true });

                    if (isHarmfulApp) {
                        // 유해앱 감지 시 사용자에게 경고 메시지 전송
                        socket.emit('harmfulAppDetected', {
                            message: '유해 앱이 감지되었습니다. 10초 후 화면 공유가 시작됩니다.',
                            appName: appInfo.name
                        });
                    }
                } catch (error) {
                    console.error('Error updating app usage:', error);
                    socket.emit('error', { message: 'Failed to update app usage' });
                }
            });
    
            socket.on('leaveRoom', async (callback) => {
                try {
                    await leaveRoom(socket);
                    broadcastRoomUpdate();
                    callback();
                } catch (error) {
                    console.error('Error leaving room:', error);
                    callback({ error: 'Failed to leave room' });
                }
            });
    
            socket.on('getRouterRtpCapabilities', (data, callback) => {
                if (!socket.room) {
                    callback({ error: 'Not in a room' });
                    return;
                }
                try {
                    const room = roomManager.getRoom(socket.room);
                    callback(room.router.rtpCapabilities);
                } catch (error) {
                    console.error('Error getting RTP capabilities:', error);
                    callback({ error: 'Failed to get RTP capabilities' });
                }
            });
    
            socket.on('createProducerTransport', async (data, callback) => {
                console.log('createProducerTransport called. Socket studyroomId:', socket.studyroomId);
                console.log('Socket details:', {
                    id: socket.id,
                    studyroomId: socket.studyroomId,
                    memberId: socket.memberId
                });
                // 콜백이 함수인지 확인
                try {
                    if (typeof callback !== 'function') {
                        console.error('createProducerTransport called without a valid callback');
                        return;
                    }
                
                    if (!socket.studyroomId) {
                        callback({ error: 'Not in a room' });
                        return;
                    }
                
                    const room = roomManager.getRoom(socket.studyroomId);
                    const { transport, params } = await createWebRtcTransport(room.router);
                    socket.producerTransport = transport;
                    console.log('params!!!! -> ',params);

                    callback(params);
                } catch (err) {
                    console.error('Error creating producer transport:', err);
                    callback({ error: 'Failed to create producer transport' });
                }
            });
    
            socket.on('createConsumerTransport', async (data, callback) => {
                if (!socket.room) {
                    callback({ error: 'Not in a room' });
                    return;
                }
                try {
                    const room = roomManager.getRoom(socket.room);
                    const { transport, params } = await createWebRtcTransport(room.router);
                    socket.consumerTransport = transport;
                    callback(params);
                    console.log('callback 완료!!!!');
                } catch (err) {
                    console.error('Error creating consumer transport:', err);
                    callback({ error: 'Failed to create consumer transport' });
                }
            });
    
            socket.on('connectProducerTransport', async (data, callback) => {
                try {
                    console.log('connectProducerTransport 입장!!!!')
                    await socket.producerTransport.connect({ dtlsParameters: data.dtlsParameters });
                    console.log('connectProducerTransport socket.produceTransport.connect 완료 !!!!')
                    callback();
                } catch (error) {
                    console.error('Error connecting producer transport:', error);
                    callback({ error: 'Failed to connect producer transport' });
                }
            });
    
            socket.on('connectConsumerTransport', async (data, callback) => {
                try {
                    await socket.consumerTransport.connect({ dtlsParameters: data.dtlsParameters });
                    callback();
                } catch (error) {
                    console.error('Error connecting consumer transport:', error);
                    callback({ error: 'Failed to connect consumer transport' });
                }
            });
    
            socket.on('produce', async (data, callback) => {
                if (!roomManager.getRoom(socket.room).getMemberStatus(socket.memberId).isHarmfulAppDetected) {
                    callback({ error: 'Not allowed to produce' });
                    return;
                }
    
                try {
                    const {kind, rtpParameters} = data;
                    const producer = await socket.producerTransport.produce({ kind, rtpParameters });
                    const room = roomManager.getRoom(socket.room);
                    room.producers.set(producer.id, producer);
    
                    callback({ id: producer.id });
    
                    socket.to(socket.room).emit('newProducer', { memberId: socket.memberId, producerId: producer.id });
                } catch (error) {
                    console.error('Error producing:', error);
                    callback({ error: 'Failed to produce' });
                }
            });
    
            socket.on('consume', async (data, callback) => {
                if (!socket.room) {
                    callback({ error: 'Not in a room' });
                    return;
                }
                try {
                    const room = roomManager.getRoom(socket.room);
                    const producer = room.producers.get(data.producerId);
                    if (!producer) {
                        callback({ error: 'Producer not found' });
                        return;
                    }
    
                    const rtpCapabilities = data.rtpCapabilities;
                    if (!room.router.canConsume({
                        producerId: data.producerId,
                        rtpCapabilities,
                    })) {
                        callback({ error: 'Cannot consume' });
                        return;
                    }
    
                    const consumer = await socket.consumerTransport.consume({
                        producerId: data.producerId,
                        rtpCapabilities,
                        paused: producer.kind === 'video',
                    });

                    consumer.on('transportclose', () => {
                        console.log('Transport closed for consumer');
                    });

                    consumer.on('producerclose', () => {
                        console.log('Producer closed for consumer');
                        socket.emit('consumerClosed', { consumerId: consumer.id });
                    });
    
                    callback({
                        producerId: data.producerId,
                        id: consumer.id,
                        kind: consumer.kind,
                        rtpParameters: consumer.rtpParameters,
                        type: consumer.type,
                        producerPaused: consumer.producerPaused,
                        appData: producer.appData
                    });
                } catch (error) {
                    console.error('Error consuming:', error);
                    callback({ error: 'Failed to consume' });
                }
            });
    
            socket.on('resume', async (data, callback) => {
                try {
                    await socket.consumerTransport.resume();
                    callback();
                } catch (error) {
                    console.error('Error resuming consumer:', error);
                    callback({ error: 'Failed to resume consumer' });
                }
            });

            // 유해앱 화면 공유
            socket.on('startScreenShare', async (data, callback) => {
                if (!socket.studyroomId) {
                    if (typeof callback === 'function') {
                        callback({ error: 'Not in a room' });
                    }
                    return;
                }
                try {
                    const { rtpParameters, resolution, frameRate } = data;
                    const room = roomManager.getRoom(socket.studyroomId);
                    
                    if (!room) {
                        throw new Error('Room not found');
                    }
                    
                    // 유저가 이미 화면 공유 중인지 확인
                    const activeShare = roomManager.getActiveScreenShare(socket.studyroomId);
                    if (activeShare) {
                        if (activeShare.memberId === socket.memberId) {
                            throw new Error('Already sharing screen');
                        } else {
                            throw new Error('Another user is already sharing screen');
                        }
                    }
            
                    if (!socket.producerTransport) {
                        throw new Error('Producer transport not set up');
                    }
            
                    // 새로운 producer 생성 
                    const producer = await socket.producerTransport.produce({
                        kind: 'video',
                        rtpParameters,
                        appData: { 
                            screen: true, 
                            socketId: socket.id,
                            resolution,
                            frameRate
                        }
                    });
                    room.producers.set(producer.id, producer);
                    roomManager.startScreenShare(socket.studyroomId, socket.memberId, producer.id);
            
                    if (typeof callback === 'function') {
                        callback({ id: producer.id });
                    }
            
                    // 스터디룸의 다른 사용자에게 화면 공유 알림
                    socket.to(socket.studyroomId).emit('newScreenShare', {
                        memberId: socket.memberId,
                        producerId: producer.id,
                        resolution,
                        frameRate
                    });
                } catch (error) {
                    console.error('Error starting screen share:', error);
                    if (typeof callback === 'function') {
                        callback({ error: 'Failed to start screen share: ' + error.message });
                    }
                }
            });

            socket.on('stopScreenShare', async (callback) => {
                if (!socket.studyroomId) {
                    callback({ error: 'Not in a room' });
                    return;
                }
                try {
                    const activeShare = roomManager.getActiveScreenShare(socket.studyroomId);
                    if (!activeShare || activeShare.memberId !== socket.memberId) {
                        callback({ error: 'No active screen share from this user' });
                        return;
                    }
            
                    const room = roomManager.getRoom(socket.studyroomId);
                    const producer = room.producers.get(activeShare.producerId);
                    if (producer) {
                        await producer.close();
                        room.producers.delete(activeShare.producerId);
                    }
                    
                    roomManager.stopScreenShare(socket.studyroomId);
                    
                    callback({ stopped: true });
            
                    // 스터디룸의 다른 사용자에게 화면 공유 중지 알림
                    socket.to(socket.studyroomId).emit('screenShareStopped', {
                        memberId: socket.memberId,
                        producerId: activeShare.producerId
                    });
                } catch (error) {
                    console.error('Error stopping screen share:', error);
                    callback({ error: 'Failed to stop screen share' });
                }
            });

            socket.on('fileUploaded', (data) => {
                const { memberId, response } = data;
                console.log(`Member ${memberId} uploaded a file:`, response);
                // UI 업데이트 또는 알림 표시 로직 추가
                alert(`Member ${memberId} uploaded a new file: ${response.dataName}`);
            });
            
            socket.on('issueUploaded', (data) => {
                const { memberId, response } = data;
                console.log(`Member ${memberId} uploaded a issue:`, response);
                // UI 업데이트 또는 알림 표시 로직 추가
                alert(`Member ${memberId} uploaded a new issue: ${response.dataName}`);
            }); 

            socket.on('sendAlarmToMember', (targetMemberId) => {
                console.log(`Sending alarm from ${socket.memberId} to ${targetMemberId} in room ${studyroomId}`);

                // 룸의 모든 소켓을 순회하여 targetMemberId를 가진 소켓을 찾습니다.
                const roomSockets = socketServer.sockets.adapter.rooms.get(studyroomId);
                if (roomSockets) {
                    for (const socketId of roomSockets) {
                        const targetSocket = socketServer.sockets.sockets.get(socketId);
                        if (targetSocket && targetSocket.memberId === targetMemberId) {
                            targetSocket.emit('receivedAlarm', {
                                from: socket.memberId
                            });
                            console.log(`Alarm sent to member ${targetMemberId} with socketId ${socketId}`);
                            return;
                        }
                    }
                }
                console.log(`No socket found for memberId: ${targetMemberId}`);
            });

            socket.on('sendAlarmToAllMembers', () => {
                console.log(`Sending group alarm from ${socket.memberId} in room ${studyroomId}`);

                // 자신을 제외한 룸의 다른 모든 멤버에게 알람 전송
                socket.to(studyroomId).emit('receivedAlarm', {
                    from: socket.memberId
                });

                console.log(`Group alarm sent to all members in room ${studyroomId} except sender ${socket.memberId}`);
            });
        } catch (error) {
            console.error('Error in socket connection:', error);
            socket.emit('error', { message: 'Failed to setup socket connection' });
            socket.disconnect(true);
        }
    });
}
async function runMediasoupWorker() {
    worker = await mediasoup.createWorker({
        logLevel: config.mediasoup.worker.logLevel,
        logTags: config.mediasoup.worker.logTags,
        rtcMinPort: config.mediasoup.worker.rtcMinPort,
        rtcMaxPort: config.mediasoup.worker.rtcMaxPort,
    });

    worker.on('died', () => {
        console.error('mediasoup worker died, exiting in 2 seconds... [pid:%d]', worker.pid);
        setTimeout(() => process.exit(1), 2000);
    });
}

async function createWebRtcTransport(router) {
    console.log('Creating WebRTC Transport');
    
    const {
        maxIncomingBitrate,
        initialAvailableOutgoingBitrate
    } = config.mediasoup.webRtcTransport;

    console.log('Transport configuration:', {
        maxIncomingBitrate,
        initialAvailableOutgoingBitrate,
        listenIps: config.mediasoup.webRtcTransport.listenIps
    });

    try {
        const transport = await router.createWebRtcTransport({
            listenIps: config.mediasoup.webRtcTransport.listenIps,
            enableUdp: true,
            enableTcp: true,
            preferUdp: true,
            initialAvailableOutgoingBitrate,
        });

        console.log('WebRTC Transport created successfully:', {
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters
        });

        if (maxIncomingBitrate) {
            try {
                await transport.setMaxIncomingBitrate(maxIncomingBitrate);
                console.log(`Max incoming bitrate set to ${maxIncomingBitrate}`);
            } catch (error) {
                console.error('Error setting max incoming bitrate:', error);
            }
        }

        const returnParams = {
            transport,
            params: {
                id: transport.id,
                iceParameters: transport.iceParameters,
                iceCandidates: transport.iceCandidates,
                dtlsParameters: transport.dtlsParameters
            },
        };

        console.log('Returning transport parameters:', returnParams.params);

        return returnParams;
    } catch (error) {
        console.error('Error creating WebRTC Transport:', error);
        throw error;
    }
}

async function joinRoom(socket, studyroomId, memberId, appInfo) {
    console.log(`User ${memberId} joined study room ${studyroomId} with app info:`, appInfo);
    
    let room = roomManager.getRoom(studyroomId);
    if (!room) {
        // Create a new room
        room = roomManager.createRoom(studyroomId);
        room.router = await worker.createRouter({ mediaCodecs: config.mediasoup.router.mediaCodecs });
        room.producers = new Map();
        room.consumers = new Map();
    }

    roomManager.joinRoom(studyroomId, memberId, appInfo);
    socket.studyroomId = studyroomId;
    socket.memberId = memberId;
    socket.join(studyroomId);

    return room;
}

async function leaveRoom(socket) {
    if (!socket.studyroomId || !socket.memberId) return;
  
    console.log(`User ${socket.memberId} left study room ${socket.studyroomId}`);
    // try-catch로 예외 처리
    try {
        if (socket.producerTransport) {
            socket.producerTransport.close();
        }
        if (socket.consumerTransport) {
            socket.consumerTransport.close();
        }
    
        const room = roomManager.getRoom(socket.studyroomId);
        
        if (room) {
            // Remove all producers and consumers
            if (room.producers && typeof room.producers.forEach === 'function') {
                room.producers.forEach(producer => {
                    if (producer.appData.socketId === socket.id) {
                        producer.close();
                        room.producers.delete(producer.id);
                    }
                });
            }
    
            if (room.consumers && typeof room.consumers.forEach === 'function') {
                room.consumers.forEach(consumer => {
                    if (consumer.appData.socketId === socket.id) {
                        consumer.close();
                        room.consumers.delete(consumer.id);
                    }
                });
            }
    
            roomManager.leaveRoom(socket.studyroomId, socket.memberId);
            socket.leave(socket.studyroomId);

            if (roomManager.getRoomMembers(socket.studyroomId).length === 0) {
                roomManager.removeRoom(socket.studyroomId);
            }
        }
    } catch (error) {
        console.error(`Error in leaveRoom for user ${socket.memberId} in room ${socket.studyroomId}:`, error);
    } finally {
        socket.studyroomId = null;
        socket.memberId = null;
    }
}

function checkIfHarmfulApp(appInfo) {
    const harmfulApps = ['League of Legends',
                            'Fortnite',
                            'Counter-Strike: Global Offensive',
                            'Dota 2',
                            'Minecraft',
                            'World of Warcraft',
                            'PUBG',
                            'Call of Duty',
                            'Apex Legends',
                            'Valorant',
                            'Facebook',
                            'Twitter',
                            'Instagram',
                            'Snapchat',
                            'YouTube',
                            'Netflix',
                            'Twitch',
                            'TikTok',
                            'Steam',
                            'Epic Games',
                            '유해앱1']; // 유해 앱 목록
    return harmfulApps.includes(appInfo);
}
  
module.exports = {
    runExpressApp,
    runWebServer,
    runSocketServer,
    runMediasoupWorker,
    io
};