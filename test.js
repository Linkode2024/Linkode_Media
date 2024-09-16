const axios = require('axios');
const https = require('https');

const agent = new https.Agent({  
  rejectUnauthorized: false
});

const BASE_URL = 'https://localhost:3000/api';

async function test() {
  console.log('Starting tests...');
  try {
    // Test 1: Create two rooms with different users
    console.log('Test 1: Creating two rooms with different users');
    console.log('Joining room1 with user1...');
    await axios.post(`${BASE_URL}/joinRoom`, { studyroomId: 'room1', memberId: 'user1', isHarmfulAppDetected: true }, { httpsAgent: agent });
    console.log('Joining room1 with user2...');
    await axios.post(`${BASE_URL}/joinRoom`, { studyroomId: 'room1', memberId: 'user2', isHarmfulAppDetected: false }, { httpsAgent: agent });
    console.log('Joining room2 with user3...');
    await axios.post(`${BASE_URL}/joinRoom`, { studyroomId: 'room2', memberId: 'user3', isHarmfulAppDetected: true }, { httpsAgent: agent });
    
    // Check room members
    console.log('Checking room members...');
    let room1Members = await axios.get(`${BASE_URL}/roomMembers/room1`, { httpsAgent: agent });
    let room2Members = await axios.get(`${BASE_URL}/roomMembers/room2`, { httpsAgent: agent });
    console.log('Room 1 members:', room1Members.data.members);
    console.log('Room 2 members:', room2Members.data.members);

    // Test 2: Update member status
    console.log('\nTest 2: Updating member status');
    await axios.post(`${BASE_URL}/updateMemberStatus`, { studyroomId: 'room1', memberId: 'user2', isHarmfulAppDetected: true }, { httpsAgent: agent });
    
    // Check updated status
    room1Members = await axios.get(`${BASE_URL}/roomMembers/room1`, { httpsAgent: agent });
    console.log('Updated Room 1 members:', room1Members.data.members);

    // Test 3: Leave room
    console.log('\nTest 3: Leaving room');
    await axios.post(`${BASE_URL}/leaveRoom`, { studyroomId: 'room1', memberId: 'user1' }, { httpsAgent: agent });
    
    // Check room members after leaving
    room1Members = await axios.get(`${BASE_URL}/roomMembers/room1`, { httpsAgent: agent });
    console.log('Room 1 members after user1 left:', room1Members.data.members);

    // Test 4: Check all rooms
    console.log('\nTest 4: Checking all rooms');
    const allRooms = await axios.get(`${BASE_URL}/rooms`, { httpsAgent: agent });
    console.log('All rooms:', allRooms.data.rooms);

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