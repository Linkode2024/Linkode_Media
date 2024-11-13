module.exports = {
  listenIp: '0.0.0.0',
  listenPort: 3000,
  // sslKey: '/Users/munhyeonjun/Linkode_Media/config/_wildcard.exampel.dev+3-key.pem',
  // sslCrt: '/Users/munhyeonjun/Linkode_Media/config/_wildcard.exampel.dev+3.pem',
  mediasoup: {
    // Worker settings
    worker: {
      rtcMinPort: 49152,
      rtcMaxPort: 65535,
      logLevel: 'debug',
      logTags: [
        'info',
        'ice',
        'dtls',
        'rtp',
        'srtp',
        'rtcp',
        // 'rtx',
        // 'bwe',
        // 'score',
        // 'simulcast',
        // 'svc'
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
          mimeType: 'video/VP9',
          clockRate: 90000,
          parameters: {
            'profile-id': 2,
            'x-google-start-bitrate': 1000
          }
        },
        {
          kind: 'video',
          mimeType: 'video/h264',
          clockRate: 90000,
          parameters: {
            'packetization-mode': 1,
            'profile-level-id': '4d0032',
            'level-asymmetry-allowed': 1,
            'x-google-start-bitrate': 1000
          }
        }
      ]
    },
    // WebRtcTransport settings
    webRtcTransport: {
      listenIps: [
        {
          ip: '0.0.0.0',
          announcedIp: '3.34.193.132',  // 현재 설정된 공인 IP
        }
      ],
      maxIncomingBitrate: 1500000,
      initialAvailableOutgoingBitrate: 1000000,
      minimumAvailableOutgoingBitrate: 600000,
      maxSctpMessageSize: 262144,
      // Additional security settings
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      enableSctp: true,
      // STUN/ICE 서버 설정 확장
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        // TURN 서버 추가
        {
            urls: [
                'turn:3.34.193.132:3478?transport=udp',
                'turn:3.34.193.132:3478?transport=tcp'
            ],
            username: process.env.TURN_SERVER_USERNAME,
            credential: process.env.TURN_SERVER_CREDENTIAL
        }
      ],
      // ICE 관련 추가 설정
      enableSctp: true,
      numSctpStreams: { OS: 1024, MIS: 1024 },
      isDataChannel: true,
      // 타임아웃 설정
      iceTransportPolicy: 'all',
      iceServersTimeout: 5000,
      // NAT 통과 설정 추가
      additionalSettings: {
      iceServersTransportPolicy: 'all',
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      iceCandidatePoolSize: 10
      },
      // 재연결 설정
      retry: {
        maxRetries: 5,
        factor: 2,
        minTimeout: 1000,
        maxTimeout: 8000
      }
    },
    // Screen sharing specific settings
    screenSharing: {
      maxFps: 30,
      minBitrate: 1000000,
      maxBitrate: 5000000
    },
    // Room settings
    room: {
      maxParticipants: 6
    },
    // Harmful app detection settings
    harmfulApps: ['유해앱1', '유해앱2', '유해앱3'],
    // Timeout settings
    timeouts: {
      disconnectTimeout: 10000, // 10 seconds
      inactivityTimeout: 300000 // 5 minutes
    }
  }
};