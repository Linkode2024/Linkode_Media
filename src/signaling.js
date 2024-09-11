const MediasoupManager = require('./room');

class SignalingHandler {
  constructor(io, mediasoupManager) {
    this.io = io;
    this.mediasoupManager = mediasoupManager;

    // Bind all methods in the constructor
    this.handleConnection = this.handleConnection.bind(this);
    this.handleJoinRoom = this.handleJoinRoom.bind(this);
    this.handleCreateProducerTransport = this.handleCreateProducerTransport.bind(this);
    this.handleCreateConsumerTransport = this.handleCreateConsumerTransport.bind(this);
    this.handleConnectProducerTransport = this.handleConnectProducerTransport.bind(this);
    this.handleConnectConsumerTransport = this.handleConnectConsumerTransport.bind(this);
    this.handleProduce = this.handleProduce.bind(this);
    this.handleConsume = this.handleConsume.bind(this);
    this.handleIceCandidate = this.handleIceCandidate.bind(this);
    this.handleStartScreenShare = this.handleStartScreenShare.bind(this);
    this.handleStopScreenShare = this.handleStopScreenShare.bind(this);
    this.handleDisconnect = this.handleDisconnect.bind(this);
  }

  handleConnection(socket) {
    console.log('새로운 클라이언트가 연결되었습니다.');
    this.socket = socket; 

    socket.on('join-room', this.handleJoinRoom);
    socket.on('create-producer-transport', this.handleCreateProducerTransport);
    socket.on('create-consumer-transport', this.handleCreateConsumerTransport);
    socket.on('connect-producer-transport', this.handleConnectProducerTransport);
    socket.on('connect-consumer-transport', this.handleConnectConsumerTransport);
    socket.on('produce', this.handleProduce);
    socket.on('consume', this.handleConsume);
    socket.on('ice-candidate', this.handleIceCandidate);
    socket.on('start-screen-share', this.handleStartScreenShare);
    socket.on('stop-screen-share', this.handleStopScreenShare);
    socket.on('disconnect', this.handleDisconnect);
  }

  async handleJoinRoom(roomId, userId) {
    await this.socket.join(roomId);
    const room = await this.mediasoupManager.createRoom(roomId);
    console.log(`User ${userId} joined room ${roomId}`);
    this.socket.emit('get-rtp-capabilities', room.router.rtpCapabilities);
  }

  async handleCreateProducerTransport(roomId, callback) {
    try {
      const { transport, params } = await this.mediasoupManager.createWebRtcTransport(roomId);
      callback({ params });
    } catch (err) {
      console.error('Error in handleCreateProducerTransport:', err);
      callback({ error: err.message });
    }
  }

  async handleProduce(roomId, producerId, kind, rtpParameters, callback) {
    try {
      const { id } = await this.mediasoupManager.produce(roomId, producerId, kind, rtpParameters);
      callback({ id });
      
      // 룸의 다른 참가자들에게 새 producer가 생겼음을 알림
      this.socket.to(roomId).emit('new-producer', { producerId, id });
    } catch (error) {
      console.error('Produce error:', error);
      callback({ error: error.message });
    }
  }

  async handleConsume(roomId, consumerId, producerId, rtpCapabilities, callback) {
    try {
      const consumeParams = await this.mediasoupManager.consume(roomId, consumerId, producerId, rtpCapabilities);
      callback(consumeParams);
    } catch (error) {
      console.error('Consume error:', error);
      callback({ error: error.message });
    }
  }

  async handleStartScreenShare(roomId, producerId) {
    try {
      await this.mediasoupManager.startScreenSharing(roomId, producerId);
      this.socket.to(roomId).emit('screen-share-started', { producerId });
    } catch (error) {
      console.error('Start screen share error:', error);
      this.socket.emit('screen-share-error', { error: error.message });
    }
  }

  async handleStopScreenShare(roomId, producerId) {
    try {
      await this.mediasoupManager.stopScreenSharing(roomId, producerId);
      this.socket.to(roomId).emit('screen-share-stopped', { producerId });
    } catch (error) {
      console.error('Stop screen share error:', error);
      this.socket.emit('screen-share-error', { error: error.message });
    }
  }

  async handleDisconnect() {
    console.log('클라이언트가 연결을 종료했습니다.');
    // 여기에 사용자 정리 로직 추가 (예: 룸에서 제거, 전송 닫기 등)
  }

  async handleCreateConsumerTransport(roomId, callback) {
    try {
      const { transport, params } = await this.mediasoupManager.createWebRtcTransport(roomId);
      callback({ params });
    } catch (err) {
      console.error(err);
      callback({ error: err.message });
    }
  }

  async handleConnectConsumerTransport(dtlsParameters, callback) {
    try {
      await this.mediasoupManager.connectConsumerTransport(dtlsParameters);
      callback({ success: true });
    } catch (err) {
      console.error(err);
      callback({ error: err.message });
    }
  }

  // handleIceCandidate 메서드가 누락되어 있어서 추가했습니다.
  async handleIceCandidate(candidate) {
    // 이 메서드의 구현은 귀하의 요구사항에 따라 달라질 수 있습니다.
    console.log('ICE candidate received:', candidate);
    // 여기에 ICE 후보 처리 로직을 추가하세요.
  }

  // handleConnectProducerTransport 메서드가 누락되어 있어서 추가했습니다.
  async handleConnectProducerTransport(dtlsParameters, callback) {
    try {
      await this.mediasoupManager.connectProducerTransport(dtlsParameters);
      callback({ success: true });
    } catch (err) {
      console.error(err);
      callback({ error: err.message });
    }
  }
}

module.exports = SignalingHandler;