const { EventEmitter } = require('events');

class Room {
    constructor(studyroomId) {
        this.studyroomId = studyroomId;
        this.members = new Map();
    }

    addMember(memberId, isHarmfulAppDetected) {
        this.members.set(memberId, { isHarmfulAppDetected });
    }

    removeMember(memberId) {
        this.members.delete(memberId);
    }

    updateMemberStatus(memberId, isHarmfulAppDetected) {
        if (this.members.has(memberId)) {
        this.members.get(memberId).isHarmfulAppDetected = isHarmfulAppDetected;
        }
    }

    getMemberStatus(memberId) {
        return this.members.get(memberId);
    }

    getMembers() {
        return Array.from(this.members.keys());
    }

    isEmpty() {
        return this.members.size === 0;
    }
    }

    class RoomManager extends EventEmitter {
    constructor() {
        super();
        this.rooms = new Map();
    }

    createRoom(studyroomId) {
        if (!this.rooms.has(studyroomId)) {
        const room = new Room(studyroomId);
        this.rooms.set(studyroomId, room);
        this.emit('roomCreated', studyroomId);
        }
        return this.rooms.get(studyroomId);
    }

    getRoom(studyroomId) {
        return this.rooms.get(studyroomId);
    }

    removeRoom(studyroomId) {
        const room = this.rooms.get(studyroomId);
        if (room && room.isEmpty()) {
        this.rooms.delete(studyroomId);
        this.emit('roomRemoved', studyroomId);
        return true;
        }
        return false;
    }

    joinRoom(studyroomId, memberId, isHarmfulAppDetected) {
        let room = this.getRoom(studyroomId);
        if (!room) {
        room = this.createRoom(studyroomId);
        }
        room.addMember(memberId, isHarmfulAppDetected);
        this.emit('memberJoined', studyroomId, memberId, isHarmfulAppDetected);
    }

    leaveRoom(studyroomId, memberId) {
        const room = this.getRoom(studyroomId);
        if (room) {
        room.removeMember(memberId);
        this.emit('memberLeft', studyroomId, memberId);
        if (room.isEmpty()) {
            this.removeRoom(studyroomId);
        }
        }
    }

    updateMemberStatus(studyroomId, memberId, isHarmfulAppDetected) {
        const room = this.getRoom(studyroomId);
        if (room) {
        room.updateMemberStatus(memberId, isHarmfulAppDetected);
        this.emit('memberStatusUpdated', studyroomId, memberId, isHarmfulAppDetected);
        }
    }

    getRoomMembers(studyroomId) {
        const room = this.getRoom(studyroomId);
        return room ? room.getMembers() : [];
    }

    getAllRooms() {
        return Array.from(this.rooms.keys());
    }
}

module.exports = RoomManager;