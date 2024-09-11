class SignalingHandler {
  constructor(io, mediasoupManager) {
      this.io = io;
      this.mediasoupManager = mediasoupManager;
  }

  handleConnection(socket) {
      console.log('새로운 클라이언트가 연결되었습니다.');

      socket.on('join-room', (roomId, userId) => this.handleJoinRoom(socket, roomId, userId));
      socket.on('create-producer-transport', (roomId, callback) => this.handleCreateProducerTransport(socket, roomId, callback));
      socket.on('connect-producer-transport', (roomId, transportId, dtlsParameters, callback) => 
          this.handleConnectProducerTransport(socket, roomId, transportId, dtlsParameters, callback));
      socket.on('produce', (roomId, producerId, transportId, kind, rtpParameters, callback) => 
          this.handleProduce(socket, roomId, producerId, transportId, kind, rtpParameters, callback));
      socket.on('consume', (roomId, consumerId, producerId, rtpCapabilities, callback) => 
          this.handleConsume(socket, roomId, consumerId, producerId, rtpCapabilities, callback));
      socket.on('start-screen-share', (roomId, producerId) => 
          this.handleStartScreenShare(socket, roomId, producerId));
      socket.on('stop-screen-share', (roomId, producerId) => 
          this.handleStopScreenShare(socket, roomId, producerId));
      socket.on('disconnect', () => this.handleDisconnect(socket));
  }

  async handleJoinRoom(socket, roomId, userId) {
      await socket.join(roomId);
      const room = await this.mediasoupManager.createRoom(roomId);
      console.log(`User ${userId} joined room ${roomId}`);
      if (room && room.router) {
          socket.emit('get-rtp-capabilities', room.router.rtpCapabilities);
      } else {
          console.error('Room or router not found');
          socket.emit('error', 'Failed to join room');
      }
  }

  async handleCreateProducerTransport(socket, roomId, callback) {
    try {
        const { transport, params } = await this.mediasoupManager.createWebRtcTransport(roomId);
        callback({ params: { ...params, id: transport.id } });
    } catch (err) {
        console.error('Error in handleCreateProducerTransport:', err);
        callback({ error: err.message });
    }
}

async handleConnectProducerTransport(socket, roomId, transportId, { dtlsParameters }, callback) {
  try {
      await this.mediasoupManager.connectTransport(roomId, transportId, dtlsParameters);
      const transport = this.mediasoupManager.getTransport(roomId, transportId);
      callback({ success: true });
  } catch (err) {
      console.error('Error in handleConnectProducerTransport:', err);
      if (typeof callback === 'function') {
          callback({ error: err.message });
      } else {
          socket.emit('connect-producer-transport-error', { error: err.message });
      }
  }
}
  async handleProduce(socket, roomId, producerId, transportId, kind, rtpParameters, callback) {
    try {
        const { id } = await this.mediasoupManager.produce(roomId, producerId, transportId, kind, rtpParameters);
        if (typeof callback === 'function') {
            callback({ id });
        }
        socket.to(roomId).emit('new-producer', { producerId, id });
    } catch (error) {
        console.error('Produce error:', error);
        if (typeof callback === 'function') {
            callback({ error: error.message });
        } else {
            socket.emit('produce-error', { error: error.message });
        }
    }
}

  async handleConsume(socket, roomId, consumerId, producerId, rtpCapabilities, callback) {
      try {
          const { transportParams, consumerParams } = await this.mediasoupManager.consume(roomId, consumerId, producerId, rtpCapabilities);
          callback({ transportParams, consumerParams });
      } catch (error) {
          console.error('Consume error:', error);
          callback({ error: error.message });
      }
  }

  async handleStartScreenShare(socket, roomId, producerId) {
      try {
          await this.mediasoupManager.startScreenSharing(roomId, producerId);
          socket.to(roomId).emit('screen-share-started', { producerId });
      } catch (error) {
          console.error('Start screen share error:', error);
          socket.emit('screen-share-error', { error: error.message });
      }
  }

  async handleStopScreenShare(socket, roomId, producerId) {
      try {
          await this.mediasoupManager.stopScreenSharing(roomId, producerId);
          socket.to(roomId).emit('screen-share-stopped', { producerId });
      } catch (error) {
          console.error('Stop screen share error:', error);
          socket.emit('screen-share-error', { error: error.message });
      }
  }

  handleDisconnect(socket) {
      console.log('클라이언트가 연결을 종료했습니다.');
      // 여기에 사용자 정리 로직 추가 (예: 룸에서 제거, 전송 닫기 등)
  }
}

module.exports = SignalingHandler;