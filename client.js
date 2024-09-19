const mediasoup = require('mediasoup-client');
const socketClient = require('socket.io-client');
const socketPromise = require('./lib/socket.io-promise').promise;
const config = require('./config');

const hostname = window.location.hostname;

let device;
let socket;
let producer;
let consumersMap = new Map();

const $ = document.querySelector.bind(document);
const $fsPublish = $('#fs_publish');
const $fsSubscribe = $('#fs_subscribe');
const $btnConnect = $('#btn_connect');
const $btnWebcam = $('#btn_webcam');
const $btnScreen = $('#btn_screen');
const $btnSubscribe = $('#btn_subscribe');
const $chkSimulcast = $('#chk_simulcast');
const $txtConnection = $('#connection_status');
const $txtWebcam = $('#webcam_status');
const $txtScreen = $('#screen_status');
const $txtSubscription = $('#sub_status');
const $inputRoomName = $('#room_name');
const $btnJoinRoom = $('#btn_join_room');
let $txtPublish;

$btnConnect.addEventListener('click', connect);
$btnWebcam.addEventListener('click', publish);
$btnScreen.addEventListener('click', publish);
$btnSubscribe.addEventListener('click', subscribe);
$btnJoinRoom.addEventListener('click', joinRoom);

if (typeof navigator.mediaDevices.getDisplayMedia === 'undefined') {
  $txtScreen.innerHTML = 'Not supported';
  $btnScreen.disabled = true;
}

async function connect() {
    console.log('Connecting to server...');
    $btnConnect.disabled = true;
    $txtConnection.innerHTML = 'Connecting...';

    const opts = {
        path: '/server',
        transports: ['websocket'],
    };

    const serverUrl = `https://${hostname}:${config.listenPort}`;
    socket = socketClient(serverUrl, opts);
    socket.request = socketPromise(socket);

    socket.on('connect', async () => {
        $txtConnection.innerHTML = 'Connected';
        $btnJoinRoom.disabled = false;
    });

    socket.on('disconnect', () => {
        $txtConnection.innerHTML = 'Disconnected';
        $btnConnect.disabled = false;
        $btnJoinRoom.disabled = true;
        $fsPublish.disabled = true;
        $fsSubscribe.disabled = true;
    });

    socket.on('connect_error', (error) => {
        console.error('could not connect to %s%s (%s)', serverUrl, opts.path, error.message);
        $txtConnection.innerHTML = 'Connection failed';
        $btnConnect.disabled = false;
    });

    socket.on('newProducer', ({ producerId }) => {
        console.log('New producer', producerId);
        $fsSubscribe.disabled = false;
    });
}

async function joinRoom() {
    const roomName = $inputRoomName.value;
    if (!roomName) {
      alert('Please enter a room name');
      return;
    }
  
    try {
      const response = await socket.request('joinRoom', roomName);
      if (response.success) {
        socket.room = roomName;
        console.log('Joined room:', roomName);
        
        // Device 초기화
        await loadDevice(response.rtpCapabilities);
        
        $fsPublish.disabled = false;
        $fsSubscribe.disabled = false;
        $btnJoinRoom.disabled = true;
        $inputRoomName.disabled = true;
      } else {
        console.error('Failed to join room:', response.message);
        alert('Failed to join room: ' + response.message);
      }
    } catch (err) {
      console.error('join room error', err);
      alert('Error joining room: ' + err.message);
    }
}

async function loadDevice(routerRtpCapabilities) {
    try {
        device = new mediasoup.Device();
        await device.load({ routerRtpCapabilities });
        console.log('Device loaded successfully');
    } catch (error) {
        if (error.name === 'UnsupportedError') {
            console.error('Browser not supported');
            alert('Your browser is not supported');
        } else {
            console.error('Failed to load device:', error);
            alert('Failed to load device: ' + error.message);
        }
    }
}

async function publish(e) {
    if (!socket.room) {
        console.error('Not in a room');
        alert('Please join a room before publishing.');
        return;
    }
    if (!device) {
        console.error('Device not initialized');
        alert('Device not initialized. Please try reconnecting.');
        return;
    }
    
    const isWebcam = (e.target.id === 'btn_webcam');
    $txtPublish = isWebcam ? $txtWebcam : $txtScreen;

    const data = await socket.request('createProducerTransport', {
        forceTcp: false,
        rtpCapabilities: device.rtpCapabilities,
    });
    if (data.error) {
        console.error(data.error);
        return;
    }

    const transport = device.createSendTransport(data);
    transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        socket.request('connectProducerTransport', { dtlsParameters })
        .then(callback)
        .catch(errback);
    });

    transport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
        try {
        const { id } = await socket.request('produce', {
            transportId: transport.id,
            kind,
            rtpParameters,
        });
        callback({ id });
        } catch (err) {
        errback(err);
        }
    });

    transport.on('connectionstatechange', (state) => {
        switch (state) {
        case 'connecting':
            $txtPublish.innerHTML = 'publishing...';
            $fsPublish.disabled = true;
            $fsSubscribe.disabled = true;
        break;

        case 'connected':
            document.querySelector('#local_video').srcObject = stream;
            $txtPublish.innerHTML = 'published';
            $fsPublish.disabled = true;
            $fsSubscribe.disabled = false;
        break;

        case 'failed':
            transport.close();
            $txtPublish.innerHTML = 'failed';
            $fsPublish.disabled = false;
            $fsSubscribe.disabled = true;
        break;

        default: break;
        }
    });

    let stream;
    try {
        stream = await getUserMedia(transport, isWebcam);
        const track = stream.getVideoTracks()[0];
        const params = { track };
        if ($chkSimulcast.checked) {
        params.encodings = [
            { maxBitrate: 100000 },
            { maxBitrate: 300000 },
            { maxBitrate: 900000 },
        ];
        params.codecOptions = {
            videoGoogleStartBitrate : 1000
        };
        }
        producer = await transport.produce(params);
    } catch (err) {
        $txtPublish.innerHTML = 'failed';
    }
}

async function getUserMedia(transport, isWebcam) {
  if (!device.canProduce('video')) {
    console.error('cannot produce video');
    return;
  }

  let stream;
  try {
    stream = isWebcam ?
      await navigator.mediaDevices.getUserMedia({ video: true }) :
      await navigator.mediaDevices.getDisplayMedia({ video: true });
  } catch (err) {
    console.error('getUserMedia() failed:', err.message);
    throw err;
  }
  return stream;
}

async function subscribe() {
  const data = await socket.request('createConsumerTransport', {
    forceTcp: false,
  });
  if (data.error) {
    console.error(data.error);
    return;
  }

  const transport = device.createRecvTransport(data);
  transport.on('connect', ({ dtlsParameters }, callback, errback) => {
    socket.request('connectConsumerTransport', {
      transportId: transport.id,
      dtlsParameters
    })
      .then(callback)
      .catch(errback);
  });

  transport.on('connectionstatechange', async (state) => {
    switch (state) {
      case 'connecting':
        $txtSubscription.innerHTML = 'subscribing...';
        $fsSubscribe.disabled = true;
        break;

      case 'connected':
        document.querySelector('#remote_video').srcObject = await consumeAll(transport);
        $txtSubscription.innerHTML = 'subscribed';
        $fsSubscribe.disabled = true;
        break;

      case 'failed':
        transport.close();
        $txtSubscription.innerHTML = 'failed';
        $fsSubscribe.disabled = false;
        break;

      default: break;
    }
  });

  await consumeAll(transport);
}

async function consumeAll(transport) {
  const stream = new MediaStream();

  const consumers = await socket.request('getProducers');
  for (const producerId of consumers) {
    const { rtpCapabilities } = device;
    const data = await socket.request('consume', { rtpCapabilities, producerId });
    const {
      producerId: remoteProducerId,
      id,
      kind,
      rtpParameters,
    } = data;

    const consumer = await transport.consume({
      id,
      producerId: remoteProducerId,
      kind,
      rtpParameters,
    });

    consumersMap.set(consumerId, consumer);

    stream.addTrack(consumer.track);

    consumer.on('trackended', () => {
      removeConsumer(consumer.id);
    });

    consumer.on('transportclose', () => {
      removeConsumer(consumer.id);
    });

    socket.request('resume', { consumerId: id }).catch(err => {
      console.error(err);
    });
  }

  return stream;
}

function removeConsumer(consumerId) {
  const consumer = consumersMap.get(consumerId);
  if (consumer) {
    consumer.close();
    consumersMap.delete(consumerId);
  }
}

// 새로운 producer가 생겼을 때 자동으로 구독
socket.on('newProducer', async ({ producerId }) => {
  const transport = device.getTransport('recv');
  if (!transport) {
    console.warn('No receive transport, cannot consume');
    return;
  }
  
  try {
    const { rtpCapabilities } = device;
    const data = await socket.request('consume', { rtpCapabilities, producerId });
    const {
      producerId: remoteProducerId,
      id,
      kind,
      rtpParameters,
    } = data;

    const consumer = await transport.consume({
      id,
      producerId: remoteProducerId,
      kind,
      rtpParameters,
    });

    consumersMap.set(id, consumer);

    const stream = new MediaStream();
    stream.addTrack(consumer.track);

    const videoElement = document.createElement('video');
    videoElement.srcObject = stream;
    videoElement.autoplay = true;
    videoElement.controls = true;
    videoElement.playsinline = true;
    document.querySelector('#remote_videos').appendChild(videoElement);

    consumer.on('trackended', () => {
      removeConsumer(id);
      videoElement.remove();
    });

    consumer.on('transportclose', () => {
      removeConsumer(id);
      videoElement.remove();
    });

    socket.request('resume', { consumerId: id }).catch(err => {
      console.error(err);
    });
  } catch (error) {
    console.error('Error consuming new producer', error);
  }
});