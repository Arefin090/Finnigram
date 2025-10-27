# Finnigram

A private messaging app for me and my close friends - because sometimes you want to chat without the noise of mainstream platforms.

This started as a personal project but ended up being way more production-ready than I initially planned. It's currently running live on Railway and actually works pretty well!

## What is this?

Right now, Finnigram is a solid messaging app with real-time chat, but the bigger vision is way more ambitious - think of it as a private social ecosystem for the people who actually matter in your life.

**Current MVP:**
- **Private messaging** - real-time chat with delivery/read receipts
- **Clean UI** - iOS-style design that doesn't hurt your eyes  
- **Self-hosted** - runs on my own infrastructure, no big tech involved
- **Cross-platform** - works on iOS, Android, and web

## The Vision

This is just the beginning. The end goal is to build something that combines the best parts of every social app, but private and focused on meaningful relationships:

**Social Features:**
- **Interactive events** - create hangouts, meetups, social gatherings
- **Location-based features** - find friends nearby, suggest meetup spots
- **Chat streaks** - gamify staying in touch with people you care about
- **Secret messaging** - encrypted messages that disappear
- **Media sharing** - photos, files, stories, but only with your inner circle

**Relationship Building:**
- **AI-powered suggestions** - reminders about birthdays, anniversaries, important dates
- **Emotional bonding tools** - features that help you be a better friend/partner/family member
- **Personalized experiences** - the app learns what matters to your relationships
- **Dating elements** - but only within your trusted network

**Privacy & Control:**
- **Fully customizable** - every aspect of your experience is under your control
- **No algorithms** - you decide what you see and when
- **Your data stays yours** - self-hosted, no surveillance capitalism
- **Invite-only** - exclusive network of people you actually want to connect with

Basically, what if you took the best features from Telegram, Snapchat, Instagram, Facebook Events, and relationship apps, but made it completely private and focused on meaningful connections instead of engagement farming?

## Tech Stack

Built this with a proper microservices setup because why not go overboard on a personal project:

- **Backend**: TypeScript, Node.js, Express, Socket.io
- **Database**: PostgreSQL (separate DBs per service) + Redis for real-time stuff  
- **Mobile**: React Native with Expo
- **Deployment**: Railway (might move to AWS later)
- **Quality**: ESLint, Prettier, Husky - yeah, I went full enterprise on this

## Architecture

```
Mobile App (React Native)
    ↓
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│User Service │  │Message Svc  │  │Realtime Svc │
│(Auth stuff) │  │(Chat data)  │  │(WebSockets)│
└─────────────┘  └─────────────┘  └─────────────┘
    ↓                 ↓                 ↓
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│PostgreSQL   │  │PostgreSQL   │  │   Redis     │
│(Users)      │  │(Messages)   │  │(Pub/Sub)    │
└─────────────┘  └─────────────┘  └─────────────┘
```

Messages flow through Redis pub/sub so everything stays in sync real-time.

## Getting Started

```bash
# Install everything
npm run install:all

# Start the backend services
npm run dev:services

# Start the mobile app
npm run dev:mobile
# Then scan the QR code with Expo Go app
```

**Environment Setup:**
Each service needs its own `.env` file. Check the individual service directories for what they need.

**Database:**
```bash
# Start local PostgreSQL and Redis
docker-compose up -d postgres redis
```

The app is currently configured to hit the production servers by default (because I'm actively testing), but you can change the URLs in `mobile/src/config/environment.js`.

## Development

**Code Quality:**
This project has all the proper linting and formatting setup. Pre-commit hooks will yell at you if your code is messy.

```bash
npm run lint      # Check everything
npm run format    # Fix formatting
npm run build     # Make sure it compiles
```

**Testing:**
Working on it... the infrastructure is there but tests are still TODO.

## Deployment

Currently running on Railway:
- User Service: Live and handling auth
- Message Service: Storing all the conversations  
- Realtime Service: WebSocket magic happening here

Database and Redis are also on Railway. It's not the cheapest option but it just works.

## Why Build This?

I got tired of mainstream social platforms optimizing for engagement instead of meaningful connections. Every app wants to show you more content, more ads, more noise - but what if there was a platform that actually helped you be a better friend?

The vision is simple: **technology should strengthen real relationships, not replace them.**

What I wanted to build:
1. **Complete control** - my data, my rules, my network
2. **Meaningful connections** - features that help you stay close to people who matter
3. **Privacy by design** - no tracking, no algorithms deciding what you see
4. **Quality over quantity** - small, trusted network instead of thousands of "friends"
5. **Relationship-focused** - tools that make you a better friend, partner, family member

Plus, I wanted an excuse to build something with proper engineering practices. If you're going to over-engineer a personal project, might as well make it count!

## Contributing

This is a personal project, but if you want to mess around with it, go ahead! Just know that I might be opinionated about changes since this is my baby.

The codebase is pretty clean and well-documented. If you're learning about microservices or React Native, it might be a decent reference.
