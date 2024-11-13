const { EventEmitter } = require('events');

class Room {
    constructor(studyroomId) {
        this.studyroomId = studyroomId;
        this.members = new Map();
        this.activeScreenShare = null;
        this.producers = new Map();
        this.consuemrs = new Map();
        this.events = new EventEmitter();
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        this.events.on('memberAdded', (memberId) => {
            console.log(`Member ${memberId} added to room ${this.studyroomId}`);
        });

        this.events.on('memberRemoved', (memberId) => {
            console.log(`Member ${memberId} removed from room ${this.studyroomId}`);
            if (this.activeScreenShare?.memberId === memberId) {
                this.clearActiveScreenShare();
            }
        });
    }

    addMember(memberId, appInfo) {
        this.members.set(memberId, { appInfo });
        this.events.emit('memberAdded', memberId);
    }

    removeMember(memberId) {
        this.members.delete(memberId);
        this.events.emit('memberRemoved', memberId);
    }

    updateMemberAppUsage(memberId, appInfo) {
        if (this.members.has(memberId)) {
            this.members.get(memberId).appInfo = appInfo;
        }
    }

    getMemberAppUsage(memberId) {
        return this.members.get(memberId)?.appInfo;
    }

    getMembers() {
        return Array.from(this.members.keys());
    }

    getMembersWithAppUsage() {
        return Array.from(this.members.entries()).map(([memberId, data]) => ({
            memberId,
            appInfo: data.appInfo
        }));
    }

    isEmpty() {
        return this.members.size === 0;
    }

    setActiveScreenShare(memberId, producerId) {
        this.activeScreenShare = { memberId, producerId };
    }

    clearActiveScreenShare() {
        this.activeScreenShare = null;
    }

    getActiveScreenShare() {
        return this.activeScreenShare;
    }

    getMemberStatus(memberId) {
        if (this.members.has(memberId)) {
            return { 
                memberId, 
                appInfo: this.getMemberAppUsage(memberId),
                isHarmfulAppDetected: this.members.get(memberId).isHarmfulAppDetected || false
            };
        }
        return null;
    }
    async cleanup() {
        // 모든 producer 정리
        for (const [_, producer] of this.producers) {
            await producer.close();
        }
        this.producers.clear();

        // 모든 consumer 정리
        for (const [_, consumer] of this.consumers) {
            await consumer.close();
        }
        this.consumers.clear();

        // Router 정리
        if (this.router) {
            await this.router.close();
        }

        // 이벤트 리스너 정리
        this.events.removeAllListeners();
    }
}

class RoomManager extends EventEmitter {
    constructor() {
        super();
        this.rooms = new Map();
        this.locks = new Map(); // 락을 저장할 Map
        this.lockTimeout = 10000; // 10초 타임아웃
    }
    
    // In-memory 락 구현
    async acquireLock(resourceId) {
        const start = Date.now();
        
        while (Date.now() - start < this.lockTimeout) {
            if (!this.locks.has(resourceId)) {
                this.locks.set(resourceId, true);
                
                return {
                    release: async () => {
                        this.locks.delete(resourceId);
                    }
                };
            }
            // 다른 프로세스가 락을 얻을 기회를 주기 위해 잠시 대기
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        throw new Error('Failed to acquire lock: timeout');
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

    async joinRoom(studyroomId, memberId, appInfo) {
        const lock = await this.acquireLock(studyroomId);
        try {
            let room = this.getRoom(studyroomId);
            if (!room) {
                room = this.createRoom(studyroomId);
            }
            room.addMember(memberId, appInfo);
            this.emit('memberJoined', studyroomId, memberId, appInfo);
        } finally {
            await lock.release();
        }
    }

    leaveRoom(studyroomId, memberId) {
        console.log(`Attempting to remove member ${memberId} from room ${studyroomId}`);
        const room = this.getRoom(studyroomId);
        if (room) {
            room.removeMember(memberId);
            console.log(`Member ${memberId} removed from room ${studyroomId}`);
            this.emit('memberLeft', studyroomId, memberId);
            if (room.isEmpty()) {
                this.removeRoom(studyroomId);
                console.log(`Room ${studyroomId} removed as it became empty`);
            }
        } else {
            console.log(`Room ${studyroomId} not found when trying to remove member ${memberId}`);
        }
    }

    updateMemberAppUsage(studyroomId, memberId, appInfo) {
        const room = this.getRoom(studyroomId);
        if (room) {
            room.updateMemberAppUsage(memberId, appInfo);
            this.emit('memberAppUsageUpdated', studyroomId, memberId, appInfo);
        }
    }

    getRoomMembers(studyroomId) {
        const room = this.getRoom(studyroomId);
        return room ? room.getMembers() : [];
    }

    getRoomMembersWithAppUsage(studyroomId) {
        const room = this.getRoom(studyroomId);
        return room ? room.getMembersWithAppUsage() : [];
    }

    getAllRooms() {
        return Array.from(this.rooms.keys());
    }

    getMemberStatus(studyroomId, memberId) {
        const room = this.getRoom(studyroomId);
        if (!room) {
            console.error(`Room ${studyroomId} does not exist`);
            return null;
        }
        return room.getMemberStatus(memberId);
    }

    startScreenShare(studyroomId, memberId, producerId) {
        const room = this.getRoom(studyroomId);
        if (room) {
            room.setActiveScreenShare(memberId, producerId);
            this.emit('screenShareStarted', studyroomId, memberId, producerId);
        }
    }

    stopScreenShare(studyroomId) {
        const room = this.getRoom(studyroomId);
        if (room) {
            const activeShare = room.getActiveScreenShare();
            if (activeShare) {
                room.clearActiveScreenShare();
                this.emit('screenShareStopped', studyroomId, activeShare.memberId, activeShare.producerId);
            }
        }
    }

    getActiveScreenShare(studyroomId) {
        const room = this.getRoom(studyroomId);
        return room ? room.getActiveScreenShare() : null;
    }

    async removeAllRoom(studyroomId) {
        const room = this.rooms.get(studyroomId);
        if (room) {
            await room.cleanup();
            this.rooms.delete(studyroomId);
            this.emit('roomRemoved', studyroomId);
            return true;
        }
        return false;
    }
}

module.exports = RoomManager;