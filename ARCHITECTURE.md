# Finnigram Architecture

## System Overview

Finnigram is a real-time chat application built with a microservices architecture. Each service owns its domain and can be developed, deployed, and scaled independently.

## Architecture Principles

- **Domain-Driven Design**: Services are organized around business capabilities (users, messaging, real-time communication)
- **Database Per Service**: Each service manages its own data store
- **Event-Driven Communication**: Services communicate through events rather than direct API calls where possible
- **Stateless Services**: Services don't store session state, enabling horizontal scaling
- **Fault Tolerance**: Services degrade gracefully when dependencies are unavailable

## Service Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   User Service  │    │ Message Service │    │Realtime Service │
│                 │    │                 │    │                 │
│ • Authentication│    │ • Conversations │    │ • WebSockets    │
│ • User Profiles │    │ • Messages      │    │ • Notifications │
│ • Online Status │    │ • Participants  │    │ • Presence      │
│                 │    │                 │    │                 │
│   PostgreSQL    │    │   PostgreSQL    │    │   Stateless     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │      Redis      │
                    │                 │
                    │ • Events        │
                    │ • Cache         │
                    │ • Sessions      │
                    └─────────────────┘
                                 │
                    ┌─────────────────┐
                    │  Mobile App     │
                    │ (React Native)  │
                    └─────────────────┘
```

## Services

### User Service

**Responsibility**: User identity and authentication

- User registration and login
- Profile management (names, avatars, preferences)
- JWT token generation and validation
- Password management and security
- User search and discovery

**Technology**: Node.js + Express + PostgreSQL + Prisma

### Message Service  

**Responsibility**: Conversation and message management

- Creating and managing conversations (direct and group)
- Message storage and retrieval
- Message history and pagination
- File attachments
- Message search

**Technology**: Node.js + Express + PostgreSQL + Prisma

### Realtime Service

**Responsibility**: Live communication features

- WebSocket connection management
- Real-time message delivery
- Typing indicators
- Online presence broadcasting
- Push notification triggers

**Technology**: Node.js + Socket.io + Redis

### Mobile Application

**Responsibility**: User interface and experience

- Chat interface with real-time updates
- User authentication flows
- Media handling (photos, files)
- Offline message queueing
- Push notification handling

**Technology**: React Native + Expo

## Data Flow Patterns

### Synchronous Communication

Used for immediate responses and critical operations:

- Mobile app → Services (REST APIs)
- Authentication and authorization
- Real-time WebSocket connections

### Asynchronous Communication  

Used for data consistency and performance:

- User profile changes → Message service (via Redis events)
- Message notifications → Realtime service (via Redis pub/sub)
- Background processing and cleanup tasks

## Technology Stack

### Backend Services

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL with Prisma ORM
- **Caching/Events**: Redis
- **Authentication**: JWT tokens
- **Real-time**: Socket.io WebSockets

### Mobile Client

- **Framework**: React Native with Expo
- **State Management**: React Context + Custom hooks
- **Navigation**: React Navigation
- **HTTP Client**: Axios with interceptors
- **Real-time**: Socket.io client

### Infrastructure

- **Deployment**: Railway (auto-deploy from git)
- **Database**: Railway PostgreSQL instances
- **Cache/Events**: Railway Redis instance
- **Logging**: Winston with structured logging
- **Monitoring**: Built-in Railway metrics

## Key Design Decisions

### Microservices vs Monolith

**Chose microservices because**:

- Different scaling needs (messaging vs user management)
- Team can work on features independently
- Technology flexibility for future enhancements
- Better fault isolation

**Trade-offs**:

- More complex deployment and monitoring
- Network latency between services
- Data consistency challenges

### Event-Driven Data Sync

**Problem**: Cross-service API calls caused slow performance
**Solution**: Replicate essential data locally with event-driven updates

**Benefits**:

- Faster response times (no network calls)
- Better fault tolerance (local data always available)
- Reduced coupling between services

**Trade-offs**:

- Eventual consistency (brief delays in updates)
- More complex data management
- Storage overhead from data replication

### Database Per Service

**Benefits**:

- Services own their data models
- Independent schema evolution
- Better security boundaries
- Easier to optimize for specific use cases

**Trade-offs**:

- No cross-service transactions
- Data duplication where needed
- More complex backup/recovery

## Deployment Strategy

### Railway Auto-Deployment

- Services deploy automatically on git push
- Database migrations run automatically on startup
- Environment variables managed per service
- Built-in monitoring and logging

### Service Independence

- Services can start in any order
- Graceful handling of missing dependencies
- Automatic retry logic for failed operations
- Health checks for monitoring service status

## Scalability Considerations

### Horizontal Scaling

- Stateless services can run multiple instances
- Redis handles session sharing for WebSockets
- Database connection pooling manages load
- Load balancing handled by Railway

### Performance Optimizations

- Local data replication reduces API calls
- Redis caching for frequently accessed data
- Optimized database queries with proper indexing
- Lazy loading and pagination for large datasets

### Bottleneck Management

- Redis as primary scaling bottleneck (can be clustered)
- Database scaling through read replicas if needed
- CDN for file attachments (future enhancement)
- Message queuing for high-volume events

This architecture supports rapid development while maintaining performance and reliability as the application scales.
