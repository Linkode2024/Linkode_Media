const os = require('os');

module.exports = {
  listenIp: '0.0.0.0',
  listenPort: 3000,
  mediasoup: {
    // Worker settings
    numWorkers: Object.keys(os.cpus()).length,
    worker: {
      rtcMinPort: 10000,
      rtcMaxPort: 10100,  // 포트 범위를 좁혀서 관리 용이성 향상
      logLevel: 'debug',
      logTags: [
        'info',
        'ice',
        'dtls',
        'rtp',
        'srtp',
        'rtcp',
        'rtx',
        'bwe',
        'score',
        'simulcast',
        'svc',
        'sctp'
      ],
    },
    // Router settings
    router: {
      mediaCodecs: [
        {
          kind: 'audio',
          mimeType: 'audio/opus',
          clockRate: 48000,
          channels: 2
        },
        {
          kind: 'video',
          mimeType: 'video/VP8',
          clockRate: 90000,
          parameters: {
            'x-google-start-bitrate': 1000
          }
        },
        {
          kind: 'video',
          mimeType: 'video/h264',
          clockRate: 90000,
          parameters: {
            'packetization-mode': 1,
            'profile-level-id': '42e01f',
            'level-asymmetry-allowed': 1,
            'x-google-start-bitrate': 1000
          }
        }
      ]
    },
    webRtcTransport: {
      listenIps: [
        {
          ip: '0.0.0.0',
          announcedIp: '3.34.193.132'  // 실제 공인 IP
        }
      ],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      initialAvailableOutgoingBitrate: 600000,
      minimumAvailableOutgoingBitrate: 300000,
      maxIncomingBitrate: 1500000,
      
      // DTLS 설정
      dtlsOptions: {
        maxRetransmissions: 10,
        retransmissionTimeout: 2000
      },
      
      // SCTP 설정
      enableSctp: true,
      numSctpStreams: { OS: 1024, MIS: 1024 },
      
      // ICE 설정
      iceServers: [
        { urls: ['stun:stun.l.google.com:19302'] },
        {
          urls: [
            'turn:3.34.193.132:3478?transport=udp',
            'turn:3.34.193.132:3478?transport=tcp'
          ],
          username: process.env.TURN_SERVER_USERNAME,
          credential: process.env.TURN_SERVER_CREDENTIAL
        }
      ],
      
      // ICE/DTLS 타임아웃 설정
      iceTransportPolicy: 'all',
      iceServersTimeout: 5000,
      
      // 연결 재시도 설정
      retry: {
        maxRetries: 3,
        factor: 2,
        minTimeout: 1000,
        maxTimeout: 5000
      }
    }
  }
};