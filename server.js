const mediasoup = require('mediasoup');
const fs = require('fs');
const https = require('https');
const express = require('express');
const socketIO = require('socket.io');
const config = require('./config');
const path = require('path');
const cors = require('cors');
const RoomManager = require('./roomManager');

// Global variables
let worker;
let webServer;
let socketServer;
let expressApp;
let mediasoupRouter;

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
    expressApp.use(cors());
    expressApp.use(express.json());
    expressApp.use(express.static(__dirname));

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
}

async function runWebServer() {
  const { sslKey, sslCrt } = config;
  if (!fs.existsSync(sslKey) || !fs.existsSync(sslCrt)) {
    console.error('SSL files are not found. check your config.js file');
    process.exit(0);
  }
  const tls = {
    cert: fs.readFileSync(sslCrt),
    key: fs.readFileSync(sslKey),
  };
  webServer = https.createServer(tls, expressApp);
  webServer.on('error', (err) => {
    console.error('starting web server failed:', err.message);
  });

  await new Promise((resolve) => {
    const { listenIp, listenPort } = config;
    webServer.listen(listenPort, listenIp, () => {
      const listenIps = config.mediasoup.webRtcTransport.listenIps[0];
      const ip = listenIps.announcedIp || listenIps.ip;
      console.log('server is running');
      console.log(`open https://${ip}:${listenPort} in your web browser`);
      resolve();
    });
  });
}

async function runSocketServer() {
    socketServer = socketIO(webServer, {
        serveClient: false,
        path: '/socket.io',
        log: false,
    });

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

            // 새로운 유저가 들어오면 브로드캐스트
            // socket.to(studyroomId).emit('newUser', { memberId, appappInfo: parsedAppInfo });

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
                    
                    // 룸의 모든 멤버에게 업데이트된 정보를 브로드캐스트
                    const updatedMembers = roomManager.getRoomMembersWithAppUsage(socket.studyroomId);
                    socketServer.to(socket.studyroomId).emit('roomUpdate', {
                        studyroomId: socket.studyroomId,
                        members: updatedMembers
                    });
                    
                    // 업데이트 성공 메시지를 요청한 클라이언트에게 전송
                    socket.emit('appUsageUpdated', { success: true });
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
                if (!socket.room) {
                    callback({ error: 'Not in a room' });
                    return;
                }
                try {
                    const room = roomManager.getRoom(socket.room);
                    const { transport, params } = await createWebRtcTransport(room.router);
                    socket.producerTransport = transport;
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
                } catch (err) {
                    console.error('Error creating consumer transport:', err);
                    callback({ error: 'Failed to create consumer transport' });
                }
            });
    
            socket.on('connectProducerTransport', async (data, callback) => {
                try {
                    await socket.producerTransport.connect({ dtlsParameters: data.dtlsParameters });
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
    
                    // inform other members in the room about new producer
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
                        paused: false,
                    });
    
                    callback({
                        producerId: data.producerId,
                        id: consumer.id,
                        kind: consumer.kind,
                        rtpParameters: consumer.rtpParameters,
                        type: consumer.type,
                        producerPaused: consumer.producerPaused
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
    const {
        maxIncomingBitrate,
        initialAvailableOutgoingBitrate
    } = config.mediasoup.webRtcTransport;

    const transport = await router.createWebRtcTransport({
        listenIps: config.mediasoup.webRtcTransport.listenIps,
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
        initialAvailableOutgoingBitrate,
    });
    if (maxIncomingBitrate) {
        try {
        await transport.setMaxIncomingBitrate(maxIncomingBitrate);
        } catch (error) {
        console.error('Error setting max incoming bitrate:', error);
        }
    }
    return {
        transport,
        params: {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters
        },
    };
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
      
    if (socket.producerTransport) {
        socket.producerTransport.close();
    }
    if (socket.consumerTransport) {
        socket.consumerTransport.close();
    }
  
    const room = roomManager.getRoom(socket.studyroomId);
    
    if (room) {
        // Remove all producers and consumers
        room.producers.forEach(producer => {
            if (producer.appData.socketId === socket.id) {
                producer.close();
                room.producers.delete(producer.id);
            }
        });
  
        room.consumers.forEach(consumer => {
            if (consumer.appData.socketId === socket.id) {
                consumer.close();
                room.consumers.delete(consumer.id);
            }
        });
  
        roomManager.leaveRoom(socket.studyroomId, socket.memberId);
        socket.leave(socket.studyroomId);

        if (roomManager.getRoomMembers(socket.studyroomId).length === 0) {
            roomManager.removeRoom(socket.studyroomId);
        }
    }
  
    socket.studyroomId = null;
    socket.memberId = null;
}
  
module.exports = {
    runExpressApp,
    runWebServer,
    runSocketServer,
    runMediasoupWorker
};