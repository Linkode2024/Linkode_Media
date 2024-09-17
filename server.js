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

// Room management
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

    // API routes
    expressApp.post('/api/joinRoom', (req, res) => {
        const { studyroomId, memberId, isHarmfulAppDetected } = req.body;
        try {
            roomManager.joinRoom(studyroomId, memberId, isHarmfulAppDetected);
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

    expressApp.post('/api/updateMemberStatus', (req, res) => {
        const { studyroomId, memberId, isHarmfulAppDetected } = req.body;
        try {
        roomManager.updateMemberStatus(studyroomId, memberId, isHarmfulAppDetected);
        res.json({ success: true, message: 'Member status updated successfully' });
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
        const screenSharing = members.filter(memberId => 
          room.getMemberStatus(memberId).isHarmfulAppDetected
        );
    
        res.json({
          studyroomId,
          members,
          screenSharing
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
        path: '/server',
        log: false,
    });

    socketServer.on('connection', (socket) => {
        console.log('client connected');

        socket.on('disconnect', () => {
            console.log('client disconnected');
            leaveRoom(socket);
        });

        socket.on('joinRoom', async ({ studyroomId, memberId, isHarmfulAppDetected }, callback) => {
            console.log('Client attempting to join room:', studyroomId);
            try {
                const room = await joinRoom(socket, studyroomId, memberId, isHarmfulAppDetected);
                
                // Send room information to the client
                socket.emit('roomJoined', {
                  studyroomId,
                  members: roomManager.getRoomMembers(studyroomId),
                  rtpCapabilities: room.router.rtpCapabilities
                });
                
                // Notify other members about the new user
                socket.to(studyroomId).emit('newUser', { memberId, isHarmfulAppDetected });
              } catch (error) {
                console.error('Error joining study room:', error);
                socket.emit('error', { message: 'Failed to join study room' });
              }
            });

            socket.on('updateAppUsage', ({ app }) => {
                if (!socket.studyroomId || !socket.memberId) {
                  return;
                }
                
                // Update app usage for the member
                roomManager.updateMemberAppUsage(socket.studyroomId, socket.memberId, app);
                
                // Broadcast the updated app usage to all members in the room
                socket.to(socket.studyroomId).emit('appUsageUpdated', { memberId: socket.memberId, app });
              });
          
              socket.on('updateStatus', async ({ isHarmfulAppDetected }) => {
                if (!socket.studyroomId || !socket.memberId) {
                  return;
                }
                
                roomManager.updateMemberStatus(socket.studyroomId, socket.memberId, isHarmfulAppDetected);
                
                // Notify all users in the room about the status change
                socketServer.to(socket.studyroomId).emit('memberStatusUpdated', { memberId: socket.memberId, isHarmfulAppDetected });
                
                // Handle screen sharing based on status change
                if (isHarmfulAppDetected) {
                  // Start screen sharing
                  socket.to(socket.studyroomId).emit('startScreenShare', { memberId: socket.memberId });
                } else {
                  // Stop screen sharing
                  socket.to(socket.studyroomId).emit('stopScreenShare', { memberId: socket.memberId });
                }
              });

        socket.on('leaveRoom', async (callback) => {
        await leaveRoom(socket);
        callback();
        });

        socket.on('getRouterRtpCapabilities', (data, callback) => {
        if (!socket.room) {
            callback({ error: 'Not in a room' });
            return;
        }
        const room = roomManager.getRoom(socket.room);
        callback(room.router.rtpCapabilities);
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
            console.error(err);
            callback({ error: err.message });
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
            console.error(err);
            callback({ error: err.message });
        }
        });

        socket.on('connectProducerTransport', async (data, callback) => {
        await socket.producerTransport.connect({ dtlsParameters: data.dtlsParameters });
        callback();
        });

        socket.on('connectConsumerTransport', async (data, callback) => {
        await socket.consumerTransport.connect({ dtlsParameters: data.dtlsParameters });
        callback();
        });

        socket.on('produce', async (data, callback) => {
        if (!roomManager.getRoom(socket.room).getMemberStatus(socket.memberId).isHarmfulAppDetected) {
            callback({ error: 'Not allowed to produce' });
            return;
        }

        const {kind, rtpParameters} = data;
        const producer = await socket.producerTransport.produce({ kind, rtpParameters });
        const room = roomManager.getRoom(socket.room);
        room.producers.set(producer.id, producer);

        callback({ id: producer.id });

        // inform other members in the room about new producer
        socket.to(socket.room).emit('newProducer', { memberId: socket.memberId, producerId: producer.id });
        });

        socket.on('consume', async (data, callback) => {
        if (!socket.room) {
            callback({ error: 'Not in a room' });
            return;
        }
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

        try {
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
            console.error('consume failed', error);
            callback({ error: error.message });
        }
        });

        socket.on('resume', async (data, callback) => {
        await socket.consumerTransport.resume();
        callback();
        });
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

async function joinRoom(socket, studyroomId, memberId, isHarmfulAppDetected) {
    // Leave current room if any
    if (socket.studyroomId) {
        await leaveRoom(socket);
    }

    console.log('User joined study room', studyroomId);
    
    let room = roomManager.getRoom(studyroomId);
    if (!room) {
        // Create a new room
        room = roomManager.createRoom(studyroomId);
        room.router = await worker.createRouter({ mediaCodecs: config.mediasoup.router.mediaCodecs });
        room.producers = new Map();
        room.consumers = new Map();
    }

    roomManager.joinRoom(studyroomId, memberId, isHarmfulAppDetected);
    socket.room = studyroomId;
    socket.memberId = memberId;
    socket.join(studyroomId);

    // // Notify other users in the room
    // socket.to(studyroomId).emit('userJoined', { memberId, isHarmfulAppDetected });

    // // Send list of existing producers to the new participant
    // const producerList = Array.from(room.producers.entries()).map(([producerId, producer]) => ({
    //     producerId,
    //     memberId: producer.appData.memberId
    // }));
    // socket.emit('producerList', producerList);

    return room;
}

async function leaveRoom(socket) {
    if (!socket.room) return;
  
    console.log('User left study room', socket.studyroomId);
  
    // Close transports
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
  
    // Notify other users in the room
    socket.to(socket.studyroomId).emit('userLeft', socket.memberId);

    // Leave the room
    roomManager.leaveRoom(socket.studyroomId, socket.memberId);
    socket.leave(socket.studyroomId);

    // Remove the room if it's empty
    if (roomManager.getRoomMembers(socket.studyroomId).length === 0) {
        roomManager.removeRoom(socket.studyroomId);
    }
}
  
    socket.room = null;
    socket.memberId = null;
}
  
module.exports = {
    runExpressApp,
    runWebServer,
    runSocketServer,
    runMediasoupWorker
};