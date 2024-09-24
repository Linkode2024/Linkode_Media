module.exports = {
  listenIp: '0.0.0.0',
  listenPort: 3000,
  sslKey: '/Users/jungrlo/Linkode_Media/config/_wildcard.exampel.dev+3-key.pem',
  sslCrt: '/Users/jungrlo/Linkode_Media/config/_wildcard.exampel.dev+3.pem',
  mediasoup: {
    // Worker settings
    worker: {
      rtcMinPort: 10000,
      rtcMaxPort: 10100,
      logLevel: 'warn',
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
          ip: '3.34.193.132',
          announcedIp: 'www.linkodemedia.shop',
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
};