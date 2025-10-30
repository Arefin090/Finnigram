# How Messaging Works in Finnigram

This is a simple guide to understand how messages flow through our system

## The Big Picture

```
[Mobile App] ←→ [Message Service] ←→ [Database]
     ↕              ↕
[Local Cache]   [Redis/WebSockets]
     ↕              ↕  
[User Service] ←→ [User Profiles]
```

## What Happens When You Send a Message

Let's say Finn wants to send "Hey Dung!" to Dung. Here's what actually happens:

### Step 1: Finn hits Send

```
Finn types "Hey Dung!" → Taps Send
Mobile app immediately shows the message (even before it's sent)
Status: "Sending..." 
```

### Step 2: Message gets saved

```
Mobile app → POST /api/messages → Message Service
Message Service → Saves to PostgreSQL database
Response: "Message saved with ID 123"
```

### Step 3: Everyone gets notified

```
Message Service → Publishes to Redis
Redis → Broadcasts to all connected WebSocket clients
Dung's phone → Receives WebSocket event "new_message"
Dung sees: "Hey Dung!" pop up instantly
```

### Step 4: Finn sees confirmation

```
Finn's app → Removes "Sending..." status
Finn's app → Shows real message from WebSocket
Status: "Sent" ✓
```

## How the Cache Works

We built this smart caching system because loading messages was slow. Here's how it works:

### First Time Opening a Chat

```
1. Finn opens chat with Dung
2. App checks local cache → Empty (first time)
3. Shows skeleton loading animation
4. API call loads messages from database
5. Messages appear, get saved to local cache
```

### Next Time Opening Same Chat

```
1. Finn opens chat with Dung again
2. App checks local cache → Found messages!
3. Shows cached messages instantly (no loading)
4. Background: API call checks for new messages
5. If new messages exist, they appear and cache updates
```

### Cache Problems We Solved

- **Version conflicts**: Old cache format vs new app updates
- **Data corruption**: Broken cache data that crashes the app  
- **Sync issues**: Cache out of sync with server

## Database Structure

Here's how we store everything:

### Messages Table

```
┌─────┬─────────────────┬───────────┬─────────────────┬─────────────┐
│ id  │ conversation_id │ sender_id │ content         │ created_at  │
├─────┼─────────────────┼───────────┼─────────────────┼─────────────┤
│ 123 │ 5               │ 3         │ Hey Dung!        │ 2024-10-30  │
│ 124 │ 5               │ 4         │ Hi Finn!       │ 2024-10-30  │
└─────┴─────────────────┴───────────┴─────────────────┴─────────────┘
```

### User Profiles (Local Copy)

We keep a copy of user data in the message service so we don't have to ask the user service every time:

```
┌─────────┬──────────┬──────────────┬─────────────────────────┐
│ user_id │ username │ display_name │ email                   │
├─────────┼──────────┼──────────────┼─────────────────────────┤
│ 3       │ finn     │ Finn N       │ finn@example.com        │
│ 4       │ dung     │ Dung T       │ dtran@example.com       │
└─────────┴──────────┴──────────────┴─────────────────────────┘
```

## Services Talking to Each Other

We have separate services that need to stay in sync:

```
User Service Updates Dung's Profile
         ↓
    Publishes Event to Redis  
         ↓
Message Service Receives Event
         ↓
Updates Local Copy of Dung's Profile
         ↓
Next time Finn opens chat, she sees Dung's new profile
```

## Real-Time Features

### WebSocket Events We Use

```javascript
// When you join a chat
socket.emit('join_conversation', conversationId)

// When someone sends a message  
socket.on('new_message', (message) => {
  // Add message to chat
})

// When someone starts typing
socket.on('user_typing', (userId) => {
  // Show "Dung is typing..."
})
```

## Performance Tricks

### Why Messages Load Fast Now

1. **Cache First**: Show cached messages instantly
2. **Background Sync**: Load new messages behind the scenes
3. **Database Indexes**: Super fast message queries
4. **Optimistic UI**: Show your sent messages immediately

### Why We Don't Call APIs Unnecessarily  

- User profiles cached locally (no cross-service calls)
- Messages cached in phone storage  
- WebSockets for real-time (no polling)
- Smart conflict resolution (only refresh when needed)

## Common Problems & Solutions

### "Messages not showing up"

Usually the WebSocket isn't connected properly. Check:

```javascript
// In browser console
socketService.isConnected // Should be true
```

### "Old messages missing"

Probably cache got cleared. The app will reload from API automatically.

### "Duplicate messages"

We have duplicate detection, but sometimes WebSocket + API both add the same message. Gets cleaned up automatically.

## Things That Could Break

### If Redis Goes Down

- Real-time messaging stops working
- Messages still save to database
- Users need to refresh to see new messages

### If Database Goes Down  

- Can't send or load messages
- Cached messages still visible
- Real-time events still work

### If Cache Gets Corrupted

- App automatically detects and clears bad cache
- Loads fresh data from API
- User sees a brief loading state

## What's Next

Some stuff we want to build:

- Edit/delete messages
- File attachments  
- Push notifications
- Message search
- Better group chats

---

*Last updated: October 2025. Update this when you change how messaging works.*
