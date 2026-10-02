// Seed Data Stores
const initialChannels = [
  {
    id: 'channel_general',
    name: 'General',
    type: 'channel',
    description: 'Company-wide general discussions',
    isPrivate: false,
    membersCount: 24
  }
];

const initialTeams = [
  {
    id: 'team_eng',
    name: 'Engineering & DevOps',
    description: 'Core backend, frontend, systems, and CI/CD infrastructure',
    membersCount: 14,
    members: ['Sarah Connor', 'Alex Rivera', 'Elena Rostova'],
    channels: ['# general', '# deployments', '# pull-requests']
  },
  {
    id: 'team_design',
    name: 'Product Design Guild',
    description: 'UI/UX research, Figma design systems, dark/light themes',
    membersCount: 8,
    members: ['Sarah Connor', 'Elena Rostova'],
    channels: ['# mockups', '# design-tokens']
  }
];

const initialCallLogs = [
  {
    id: 'call_log_1',
    callerName: 'Sarah Connor',
    callerAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
    type: 'video',
    status: 'missed',
    duration: '00:00',
    timestamp: 'Today 10:15 AM'
  },
  {
    id: 'call_log_2',
    callerName: 'Alex Rivera',
    callerAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    type: 'audio',
    status: 'outgoing',
    duration: '14:20',
    timestamp: 'Yesterday 4:30 PM'
  }
];

const initialEvents = [
  {
    id: 'evt_1',
    title: 'Daily Standup & Sprint Sync',
    date: 'Today',
    time: '10:00 AM - 10:30 AM',
    duration: '30 mins',
    location: 'Teams Meeting Room 1',
    hostName: 'Elena Rostova',
    attendeesCount: 8
  },
  {
    id: 'evt_2',
    title: 'Architecture Review & Release Demo',
    date: 'Today',
    time: '3:00 PM - 4:00 PM',
    duration: '1 hour',
    location: 'Teams Video Room',
    hostName: 'Alex Rivera',
    attendeesCount: 12
  }
];

const seedUsers = [
  {
    id: 'user_sarah',
    name: 'Sarah Connor',
    role: 'Lead UI/UX Designer',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
    status: 'online',
    statusText: 'Designing Teams App 🎨',
    email: 'sarah.c@company.com'
  },
  {
    id: 'user_alex',
    name: 'Alex Rivera',
    role: 'Senior Fullstack Dev',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    status: 'online',
    statusText: 'Refactoring WebSocket Gateway ⚡',
    email: 'alex.r@company.com'
  },
  {
    id: 'user_elena',
    name: 'Elena Rostova',
    role: 'Product Manager',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    status: 'away',
    statusText: 'In meeting 📅',
    email: 'elena.r@company.com'
  }
];

// Persisted profiles override the seed data so a saved display name /
// avatar survives both a re-register and a full server restart.
import { hydrateUser, updateProfile as persistProfile } from '../models/profileStore.js';

// In-memory data structures
const usersMap = new Map();
seedUsers.forEach((u) => {
  const hydrated = hydrateUser(u);
  usersMap.set(hydrated.id, { ...hydrated, status: hydrated.status || 'online' });
});

const channelsList = [...initialChannels];
const teamsList = [...initialTeams];
const callLogsList = [...initialCallLogs];
const eventsList = [...initialEvents];
const messagesMap = new Map();

/** roomId -> Set(userId) for people explicitly added to a conversation. */
const roomMembersMap = new Map();
/** userId -> Set(roomId) so a disconnect can clean up membership. */
const userRoomsMap = new Map();

const getAllUsers = () => Array.from(usersMap.values());

const getRoomMembers = (roomId) => Array.from(roomMembersMap.get(roomId) || []);

const addRoomMember = (roomId, userId) => {
  if (!roomId || !userId) return;
  if (!roomMembersMap.has(roomId)) roomMembersMap.set(roomId, new Set());
  roomMembersMap.get(roomId).add(userId);

  if (!userRoomsMap.has(userId)) userRoomsMap.set(userId, new Set());
  userRoomsMap.get(userId).add(roomId);
};

const removeRoomMember = (roomId, userId) => {
  roomMembersMap.get(roomId)?.delete(userId);
  userRoomsMap.get(userId)?.delete(roomId);
};

export default function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`⚡ Client connected: ${socket.id}`);

    // Initial snapshot sent to newly connected client
    socket.emit('init:data', {
      channels: channelsList,
      users: getAllUsers(),
      teams: teamsList,
      callLogs: callLogsList,
      events: eventsList
    });

    // 1. User Register / Login
    socket.on('user:register', (userData) => {
      if (!userData || !userData.id) return;

      // Re-apply any persisted profile (custom name / avatar) on top of what
      // the client sent, without letting it clobber a real custom avatar.
      const incoming = hydrateUser(userData);

      // Preserve server-side presence fields on re-registration.
      const existing = usersMap.get(incoming.id) || {};
      const updatedUser = {
        ...incoming,
        socketId: socket.id,
        status: incoming.status || existing.status || 'online',
        lastSeen: new Date().toISOString()
      };

      usersMap.set(updatedUser.id, updatedUser);
      socket.userId = updatedUser.id;

      socket.join('channel_general');
      socket.join(updatedUser.id);

      io.emit('users:list', getAllUsers());
    });

    // 1b. Profile Update (socket variant, used by the Profile Settings modal)
    socket.on('user:profile_update', (payload, ack) => {
      const respond = typeof ack === 'function' ? ack : () => {};
      const { userId, ...patch } = payload || {};

      // Ignore any userId in the payload: a socket may only edit the profile
      // it authenticated as, so one client cannot rewrite another's.
      const targetId = socket.userId;
      if (!targetId) {
        respond({ ok: false, error: 'Not authenticated' });
        return;
      }

      try {
        const result = persistProfile(targetId, patch);
        const profile = result.profile;

        const existing = usersMap.get(targetId) || {};
        usersMap.set(targetId, {
          ...existing,
          ...profile,
          id: targetId,
          socketId: socket.id,
          lastSeen: new Date().toISOString()
        });

        const payloadOut = { id: targetId, ...profile };

        // Fan out to everyone so their sidebar, DM list and message bubbles
        // re-render with the new name and picture.
        io.emit('user:updated', payloadOut);
        io.emit('users:list', getAllUsers());

        respond({ ok: true, user: payloadOut, changed: result.changed });
      } catch (error) {
        console.error('[socket] user:profile_update failed:', error);
        respond({ ok: false, error: error.message || 'Failed to update profile' });
      }
    });

    // 2. Room Switch & History
    socket.on('room:join', ({ roomId }) => {
      if (!roomId) return;
      socket.join(roomId);

      if (socket.userId) addRoomMember(roomId, socket.userId);

      const roomHistory = messagesMap.get(roomId) || [];
      socket.emit('message:history', { roomId, messages: roomHistory });
      socket.emit('room:members', { roomId, members: getRoomMembers(roomId) });
    });

    // Leave the previous conversation so a DM user's socket is not still
    // subscribed to the room they just navigated away from.
    socket.on('room:leave', ({ roomId }) => {
      if (!roomId) return;
      socket.leave(roomId);
      if (socket.userId) removeRoomMember(roomId, socket.userId);
    });

    // 3. Send Message
    socket.on('message:send', (payload, ack) => {
      const { roomId, messageData } = payload || {};

      const respond = typeof ack === 'function' ? ack : () => {};

      // Bail out cleanly *and* acknowledge, so a rejected send can never be
      // mistaken client-side for a silent/timeout failure.
      if (!roomId || !messageData) {
        respond({ ok: false, error: 'Missing roomId or messageData' });
        return;
      }

      const newMessage = {
        ...messageData,
        id: messageData.id || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        roomId,
        createdAt: new Date().toISOString()
      };

      try {
        if (!messagesMap.has(roomId)) {
          messagesMap.set(roomId, []);
        }
        messagesMap.get(roomId).push(newMessage);

        io.to(roomId).emit('message:received', newMessage);
        io.emit('message:preview_update', { roomId, message: newMessage });

        // Immediate success acknowledgment (synchronous, before any await).
        respond({ ok: true, messageId: newMessage.id, roomId });

        // Redundant explicit signal for clients that do not use acks.
        socket.emit('message:sent_success', {
          ok: true,
          messageId: newMessage.id,
          roomId
        });
      } catch (error) {
        console.error('[socket] message:send failed:', error);
        respond({ ok: false, error: error.message || 'Failed to send message' });
      }
    });

    // 4. Toggle Emoji Reaction on a Message
    socket.on('message:reaction', ({ roomId, messageId, emoji, userId }) => {
      if (!roomId || !messageId || !emoji) return;

      const roomHistory = messagesMap.get(roomId);
      if (!roomHistory) return;

      const message = roomHistory.find((m) => m.id === messageId);
      if (!message) return;

      const reactorId = userId || socket.userId;
      if (!reactorId) return;

      if (!Array.isArray(message.reactions)) message.reactions = [];

      const existing = message.reactions.find((r) => r.emoji === emoji);

      if (!existing) {
        message.reactions.push({ emoji, count: 1, users: [reactorId] });
      } else {
        const index = existing.users.indexOf(reactorId);

        if (index === -1) {
          existing.users.push(reactorId);
          existing.count = existing.users.length;
        } else {
          existing.users.splice(index, 1);
          existing.count = existing.users.length;

          // Drop the pill entirely once nobody has reacted with it.
          if (existing.count === 0) {
            message.reactions = message.reactions.filter((r) => r.emoji !== emoji);
          }
        }
      }

      io.to(roomId).emit('message:reaction_updated', {
        roomId,
        messageId,
        reactions: message.reactions
      });
    });

    // 5. Conversation Member Management ("Add People" action)
    socket.on('room:members_add', ({ roomId, userIds }) => {
      if (!roomId || !Array.isArray(userIds) || userIds.length === 0) return;

      userIds.forEach((userId) => {
        addRoomMember(roomId, userId);
        const target = usersMap.get(userId);
        // Put the invitee's own socket in the room so history/updates reach them.
        if (target?.socketId) io.sockets.sockets.get(target.socketId)?.join(roomId);
      });

      const members = getRoomMembers(roomId);
      io.to(roomId).emit('room:members', { roomId, members });
    });

    socket.on('room:members_remove', ({ roomId, userId }) => {
      if (!roomId || !userId) return;
      removeRoomMember(roomId, userId);

      const target = usersMap.get(userId);
      if (target?.socketId) io.sockets.sockets.get(target.socketId)?.leave(roomId);

      const members = getRoomMembers(roomId);
      io.to(roomId).emit('room:members', { roomId, members });
    });

    // 5. Teams Handlers
    socket.on('team:create', (teamData) => {
      if (!teamData || !teamData.name) return;

      const newTeam = {
        id: `team_${Date.now()}`,
        name: teamData.name,
        description: teamData.description || 'New team group',
        membersCount: 1,
        members: teamData.members || ['Admin'],
        channels: ['# general']
      };

      teamsList.push(newTeam);
      console.log(`🛡️ Team Created: ${newTeam.name}`);
      io.emit('teams:list', teamsList);
    });

    // 6. Calls & Call Logs Handlers
    socket.on('call:initiate', ({ caller, recipientId, type, roomId }) => {
      if (!caller || !roomId) return;
      console.log(`📞 Call Initiated: ${caller.name} -> ${recipientId || roomId} (${type})`);

      const recipientUser = recipientId ? usersMap.get(recipientId) : null;

      // Create call log entry
      const logEntry = {
        id: `call_log_${Date.now()}`,
        callerName: recipientUser ? recipientUser.name : roomId.startsWith('dm_') ? 'Direct Message' : 'Channel Meeting',
        callerAvatar: recipientUser?.avatar || caller.avatar,
        type: type || 'video',
        status: 'outgoing',
        duration: 'Connecting...',
        timestamp: 'Just now'
      };
      callLogsList.unshift(logEntry);
      io.emit('call_logs:list', callLogsList);

      if (recipientUser?.socketId) {
        // 1:1 call – target only the recipient.
        io.to(recipientUser.socketId).emit('call:incoming', { caller, type, roomId });
      } else if (!recipientId) {
        // Channel call – ring everyone currently in the room.
        socket.to(roomId).emit('call:incoming', { caller, type, roomId });
      }
    });

    socket.on('call:accept', ({ roomId, recipient }) => {
      if (!roomId) return;
      io.to(roomId).emit('call:accepted', { recipient });
    });

    socket.on('call:decline', ({ roomId, reason }) => {
      if (!roomId) return;
      io.to(roomId).emit('call:ended', { reason: reason || 'Call declined' });
    });

    socket.on('call:end', ({ roomId }) => {
      if (!roomId) return;
      io.to(roomId).emit('call:ended', { reason: 'Call ended' });
    });

    // 7. Contacts Directory Handlers
    socket.on('contact:add', (contactData) => {
      if (!contactData || !contactData.name) return;

      const newContact = {
        id: `user_${Date.now()}`,
        name: contactData.name,
        role: contactData.role || 'Software Engineer',
        avatar: contactData.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
        status: 'online',
        statusText: contactData.statusText || 'Available',
        email: contactData.email || 'contact@company.com'
      };

      usersMap.set(newContact.id, newContact);
      io.emit('users:list', getAllUsers());
    });

    socket.on('contact:delete', ({ userId }) => {
      if (!userId) return;
      usersMap.delete(userId);
      io.emit('users:list', getAllUsers());
    });

    // 8. Calendar Events Handlers
    socket.on('event:create', (eventData) => {
      if (!eventData || !eventData.title) return;

      const newEvent = {
        id: `evt_${Date.now()}`,
        title: eventData.title,
        date: eventData.date || 'Today',
        time: eventData.time || '2:00 PM - 3:00 PM',
        duration: eventData.duration || '1 hour',
        location: eventData.location || 'Teams Meeting Room',
        hostName: eventData.hostName || 'You',
        attendeesCount: eventData.attendeesCount || 4
      };

      eventsList.unshift(newEvent);
      console.log(`📅 Calendar Event Created: ${newEvent.title}`);
      io.emit('events:list', eventsList);
    });

    socket.on('event:delete', ({ eventId }) => {
      const idx = eventsList.findIndex((e) => e.id === eventId);
      if (idx !== -1) {
        eventsList.splice(idx, 1);
        io.emit('events:list', eventsList);
      }
    });

    // 9. Channel Handlers
    socket.on('channel:create', (newChannel) => {
      if (!newChannel || !newChannel.name) return;

      const chanObj = {
        id: `channel_${Date.now()}`,
        name: newChannel.name.toLowerCase().replace(/\s+/g, '-'),
        type: 'channel',
        description: newChannel.description || 'New dynamic channel',
        isPrivate: !!newChannel.isPrivate,
        membersCount: 1
      };

      channelsList.push(chanObj);
      io.emit('channels:list', channelsList);
    });

    socket.on('channel:delete', ({ channelId }) => {
      if (!channelId || channelId === 'channel_general') return;
      const idx = channelsList.findIndex((c) => c.id === channelId);
      if (idx !== -1) {
        channelsList.splice(idx, 1);
        io.emit('channels:list', channelsList);
      }
    });

    // 10. Status Change
    socket.on('user:status_change', ({ userId, status }) => {
      if (!userId) return;
      const user = usersMap.get(userId);
      if (user) {
        user.status = status;
        usersMap.set(userId, user);
        io.emit('users:list', getAllUsers());
      }
    });

    // 11. Typing indicator relay
    socket.on('user:typing', ({ roomId, userId, isTyping }) => {
      if (!roomId) return;
      socket.to(roomId).emit('user:typing', { roomId, userId, isTyping: !!isTyping });
    });

    // 12. Disconnect
    socket.on('disconnect', () => {
      if (socket.userId) {
        const user = usersMap.get(socket.userId);
        if (user) {
          // Only mark offline when no other socket for this user remains.
          const stillOnline = Array.from(io.sockets.sockets.values())
            .some((s) => s.id !== socket.id && s.userId === socket.userId);

          if (!stillOnline) {
            user.status = 'offline';
            user.socketId = null;
            usersMap.set(socket.userId, user);
            io.emit('users:list', getAllUsers());
          }
        }

        (userRoomsMap.get(socket.userId) || new Set()).forEach((roomId) => {
          removeRoomMember(roomId, socket.userId);
          io.to(roomId).emit('room:members', { roomId, members: getRoomMembers(roomId) });
        });
      }
    });
  });
}
