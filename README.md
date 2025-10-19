# Finnigram

A possible alternative to Insta/Telegram for me and my friends - private and exclusive under my own network!

A modern messaging platform built with production-grade engineering practices.

## Architecture

This project follows a microservices architecture:

- **services/user-service** - Authentication and user management
- **services/message-service** - Message storage and retrieval
- **services/realtime-service** - WebSocket connections and live updates
- **services/api-gateway** - Request routing and rate limiting
- **mobile** - React Native app for iOS/Android/Web

## Tech Stack

- **Backend**: Node.js, Express, Socket.io
- **Database**: PostgreSQL, Redis
- **Frontend**: React Native with Expo
- **Deployment**: Railway/Vercel → AWS EKS
- **Monitoring**: Structured logging, health checks

## Getting Started

```bash
# Install dependencies for all services
npm run install:all

# Start all services in development
npm run dev

# Run tests
npm test
```

## Project Structure

```
finnigram/
├── services/
│   ├── user-service/
│   ├── message-service/
│   ├── realtime-service/
│   └── api-gateway/
├── mobile/
├── shared/
├── docker-compose.yml
└── package.json
```
