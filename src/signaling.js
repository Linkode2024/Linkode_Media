const MediasoupManager = require('./room');

class SignalingHandler {
  constructor(io, mediasoupManager) {
    this.io = io;
    this.mediasoupManager = mediasoupManager;
  }

  handleConnection(socket) {
    console.log('새로운 클라이언트가 연결되었습니다.');

    socket.on('join-room', this.handleJoinRoom.bind(this, socket));
    socket.on('create-producer-transport', this.handleCreateProducerTransport.bind(this, socket));
    socket.on('create-consumer-transport', this.handleCreateConsumerTransport.bind(this, socket));
    socket.on('connect-producer-transport', this.handleConnectProducerTransport.bind(this, socket));
    socket.on('connect-consumer-transport', this.handleConnectConsumerTransport.bind(this, socket));
    socket.on('produce', this.handleProduce.bind(this, socket));
    socket.on('consume', this.handleConsume.bind(this, socket));
    socket.on('ice-candidate', this.handleIceCandidate.bind(this, socket));
    socket.on('start-screen-share', this.handleStartScreenShare.bind(this, socket));
    socket.on('stop-screen-share', this.handleStopScreenShare.bind(this, socket));
    socket.on('disconnect', this.handleDisconnect.bind(this, socket));
  }

  async handleJoinRoom(socket, roomId, userId) {
    await socket.join(roomId);
    await this.mediasoupManager.createRoom(roomId);
    console.log(`User ${userId} joined room ${roomId}`);
    socket.emit('get-rtp-capabilities', this.mediasoupManager.router.rtpCapabilities);
  }

  async handleCreateProducerTransport(socket, roomId, callback) {
    try {
      const { transport, params } = await this.mediasoupManager.createWebRtcTransport(roomId);
      callback({ params });
    } catch (err) {
      console.error(err);
      callback({ error: err.message });
    }
  }

  async handleProduce(socket, roomId, producerId, kind, rtpParameters, callback) {
    try {
      const { id } = await this.mediasoupManager.produce(roomId, producerId, kind, rtpParameters);
      callback({ id });
      
      // 룸의 다른 참가자들에게 새 producer가 생겼음을 알림
      socket.to(roomId).emit('new-producer', { producerId, id });
    } catch (error) {
      console.error('Produce error:', error);
      callback({ error: error.message });
    }
  }

  async handleConsume(socket, roomId, consumerId, producerId, rtpCapabilities, callback) {
    try {
      const consumeParams = await this.mediasoupManager.consume(roomId, consumerId, producerId, rtpCapabilities);
      callback(consumeParams);
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