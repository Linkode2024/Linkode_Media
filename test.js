const axios = require('axios');
const http = require('http');

const agent = new http.Agent({  
  rejectUnauthorized: false
});

const BASE_URL = 'https://localhost:3000/api';

async function test() {
  console.log('Starting tests...');
  try {
    // Test 1: Create rooms with different users and check room separation
    console.log('Test 1: Creating rooms and checking room separation');
    await axios.post(`${BASE_URL}/joinRoom`, { studyroomId: 'room1', memberId: 'user1', isHarmfulAppDetected: true }, { httpsAgent: agent });
    await axios.post(`${BASE_URL}/joinRoom`, { studyroomId: 'room1', memberId: 'user2', isHarmfulAppDetected: false }, { httpsAgent: agent });
    await axios.post(`${BASE_URL}/joinRoom`, { studyroomId: 'room2', memberId: 'user3', isHarmfulAppDetected: true }, { httpsAgent: agent });
    
    let room1Members = await axios.get(`${BASE_URL}/roomMembers/room1`, { httpsAgent: agent });
    let room2Members = await axios.get(`${BASE_URL}/roomMembers/room2`, { httpsAgent: agent });
    console.log('Room 1 members:', room1Members.data.members);
    console.log('Room 2 members:', room2Members.data.members);

    if (room1Members.data.members.length !== 2 || room2Members.data.members.length !== 1) {
      throw new Error('Room separation test failed');
    }

    // Test 2: Update member status
    console.log('\nTest 2: Updating member status');
    await axios.post(`${BASE_URL}/updateMemberStatus`, { studyroomId: 'room1', memberId: 'user2', isHarmfulAppDetected: true }, { httpsAgent: agent });
    
    // We don't have a direct way to check screen sharing status, so we'll just verify the update request succeeded
    console.log('Member status updated successfully');

    // Test 3: Leave room and check for removal
    console.log('\nTest 3: Leaving room and checking for removal');
    await axios.post(`${BASE_URL}/leaveRoom`, { studyroomId: 'room1', memberId: 'user1' }, { httpsAgent: agent });
    
    room1Members = await axios.get(`${BASE_URL}/roomMembers/room1`, { httpsAgent: agent });
    console.log('Room 1 members after user1 left:', room1Members.data.members);

    if (room1Members.data.members.includes('user1')) {
      throw new Error('Leave room test failed');
    }

    // Test 4: Check all rooms
    console.log('\nTest 4: Checking all rooms');
    const allRooms = await axios.get(`${BASE_URL}/rooms`, { httpsAgent: agent });
    console.log('All rooms:', allRooms.data.rooms);

    if (!allRooms.data.rooms.includes('room1') || !allRooms.data.rooms.includes('room2')) {
      throw new Error('All rooms test failed');
    }

    console.log('\nAll tests completed successfully!');
  } catch (error) {
    console.error('Test failed:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    } else if (error.request) {
      console.error('No response received:', error.request);
    }
  }
}

test();