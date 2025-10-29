# Finnigram Logout Architecture Documentation

## Overview

The Finnigram logout system is built with enterprise-grade security practices, comprehensive error handling, and maintainable architecture. This document explains how the logout process works, its components, and the security measures in place.

## Architecture Components

### 1. Frontend Components

#### AuthContext (`/src/context/AuthContext.js`)

- **Role**: Main authentication state management
- **Responsibility**: Manages user login state, calls logout service
- **Key Feature**: Simplified interface - delegates complex logout logic to dedicated service

#### LogoutService (`/src/services/LogoutService.js`)

- **Role**: Dedicated logout orchestration service  
- **Responsibility**: Handles the complete logout process with error recovery
- **Key Features**:
  - Atomic logout operations
  - Comprehensive error handling
  - Performance metrics
  - Network-aware timing

#### ProfileScreen (`/src/screens/ProfileScreen.js`)

- **Role**: User interface trigger point
- **Responsibility**: Logout button interaction and user feedback

### 2. Backend Components

#### TokenBlacklistService (`/services/user-service/src/services/TokenBlacklistService.ts`)

- **Role**: JWT token invalidation and session management
- **Key Features**:
  - Redis-based token blacklisting
  - Session tracking per user
  - Automatic token expiration cleanup
  - Multi-device logout support

#### AuditLogger (`/services/user-service/src/services/AuditLogger.ts`)

- **Role**: Security event logging and compliance
- **Key Features**:
  - Comprehensive audit trails
  - Security event correlation
  - Real-time alerting for high-risk events
  - User activity tracking

#### RateLimiter (`/services/user-service/src/middleware/rateLimiter.ts`)

- **Role**: Abuse prevention and security
- **Key Features**:
  - Sliding window rate limiting
  - Redis-based distributed limiting
  - Different limits for different endpoints

## Logout Process Flow

### Step-by-Step Process

```mermaid
flowchart TD
    A[User Clicks Logout] --> B[AuthContext.logout()]
    B --> C[LogoutService.executeLogout()]
    C --> D[Socket Disconnection]
    D --> E[Server Logout API]
    E --> F[Local Storage Cleanup]
    F --> G[State Update]
    G --> H[Logout Complete]
    
    D --> D1[Emit user_offline]
    D --> D2[Disconnect socket]
    D --> D3[Verify disconnection]
    
    E --> E1[JWT Blacklisting]
    E --> E2[Session Invalidation]
    E --> E3[Audit Logging]
    
    F --> F1[Clear AsyncStorage]
    F --> F2[Verify cleanup]
    F --> F3[Force cleanup if needed]
```

### Detailed Process

#### Phase 1: Socket Disconnection

```js
// 1. Graceful socket notification
if (socketService.isConnected()) {
  socketService.emit('user_offline');
  await networkAwareDelay(); // Wait for server processing
}

// 2. Disconnect socket
socketService.disconnect();

// 3. Verify disconnection
const status = socketService.getConnectionStatus();
metrics.socketDisconnected = !status.isConnected;
```

#### Phase 2: Server-Side Logout

```js
// 1. API call with retry logic
const result = await retryService.executeWithRetry(
  () => authApi.logout(),
  {
    maxRetries: 2,
    baseDelay: 1000,
    retryOn: [408, 429, 500, 502, 503, 504]
  }
);

// 2. Server processes logout:
//    - Blacklists JWT token in Redis
//    - Updates user online status
//    - Logs security audit event
//    - Invalidates all user sessions
```

#### Phase 3: Local Cleanup

```js
// 1. Clear stored authentication data
await AsyncStorage.multiRemove([
  'accessToken', 
  'refreshToken', 
  'user'
]);

// 2. Verify cleanup completed
const remaining = await AsyncStorage.multiGet([...]);
const hasRemaining = remaining.some(([k, v]) => v !== null);

// 3. Force individual cleanup if needed
if (hasRemaining) {
  await forceIndividualCleanup();
}
```

#### Phase 4: State Management

```js
// Update React state to logged out
dispatch({ type: 'LOGOUT' });

// Return comprehensive metrics
return {
  success: true,
  serverLogoutSuccess: true,
  socketDisconnected: true,
  cleanupSuccess: true,
  duration: 854
};
```

## Security Features

### 1. JWT Token Blacklisting

- **Purpose**: Prevent reuse of logout tokens
- **Implementation**: Redis-based storage with TTL
- **Coverage**: Individual tokens and bulk user logout

```typescript
// Token gets blacklisted on server
await tokenBlacklistService.blacklistToken(token, 'logout');

// All future requests with this token are rejected
const isBlacklisted = await tokenBlacklistService.isTokenBlacklisted(token);
```

### 2. Session Tracking

- **Purpose**: Monitor active user sessions across devices
- **Implementation**: Redis hash storage per user
- **Features**: Device fingerprinting, session metadata

```typescript
// Track active sessions
await tokenBlacklistService.addToUserSessions(userId, tokenId, metadata);

// Logout from all devices
await tokenBlacklistService.blacklistAllUserTokens(userId);
```

### 3. Comprehensive Audit Logging

- **Purpose**: Security compliance and monitoring
- **Implementation**: Structured logging with correlation IDs
- **Features**: Real-time alerting, user activity tracking

```typescript
await auditLogger.logLogout(
  userId, username, success,
  {
    tokenBlacklisted: true,
    socketDisconnected: true,
    duration: 854,
    reason: 'user_initiated'
  },
  { ip, userAgent, correlationId }
);
```

### 4. Rate Limiting

- **Purpose**: Prevent logout abuse and DoS attacks
- **Implementation**: Sliding window with Redis
- **Configuration**: 10 logout attempts per minute

```typescript
// Applied to logout endpoint
router.post('/logout', 
  logoutRateLimiter.middleware(), // 10/minute limit
  verifyToken,
  logoutHandler
);
```

## Error Handling & Recovery

### 1. Network Failures

```js
// Smart retry with exponential backoff
try {
  await retryService.executeWithRetry(apiCall, {
    maxRetries: 2,
    baseDelay: 1000,
    retryOn: [408, 429, 500, 502, 503, 504]
  });
} catch (error) {
  // Continue with local logout - user should never be "stuck" logged in
  logger.warn('Server logout failed, proceeding with local logout');
}
```

### 2. Partial Failures

```js
// Each step is independent and verified
const metrics = {
  serverLogoutSuccess: await tryServerLogout(),
  socketDisconnected: await trySocketDisconnect(), 
  cleanupSuccess: await tryLocalCleanup()
};

// Always update UI state regardless of individual failures
dispatch({ type: 'LOGOUT' });
```

### 3. Emergency Recovery

```js
// If main process fails, emergency cleanup ensures user is logged out
try {
  return await performLogout();
} catch (error) {
  return await performEmergencyCleanup(error);
}
```

## Performance & Monitoring

### 1. Network-Aware Timing

```js
// Adjust delays based on network quality
const networkConfig = await retryService.getNetworkAwareConfig();
const delay = Math.min(networkConfig.baseDelay / 2, 1000);
```

### 2. Performance Metrics

```js
const metrics = {
  startTime: Date.now(),
  duration: 0,
  serverLogoutSuccess: false,
  socketDisconnected: false,
  cleanupSuccess: false
};
```

### 3. Comprehensive Logging

```js
logger.group('🚪 Logout Process');
logger.auth('Starting logout process...');
logger.network('API call successful');
logger.socket('Socket disconnected');
logger.performance(`Logout completed in ${duration}ms`);
logger.groupEnd();
```

## Configuration

### Environment-Based Settings

#### Development

```js
// Show detailed logs for debugging
LOGGING: {
  level: 'DEBUG',
  categories: ['AUTH', 'NETWORK', 'SOCKET'],
  timestamp: true
}
```

#### Production  

```js
// Only log errors
LOGGING: {
  level: 'ERROR',
  categories: [],
  timestamp: false
}
```

### Server Configuration

```typescript
// Rate limiting
export const logoutRateLimiter = new RateLimiter({
  windowMs: 60 * 1000,    // 1 minute
  maxRequests: 10,        // 10 attempts
  keyGenerator: (req) => `logout:${req.ip}`
});

// Token blacklist TTL
const BLACKLIST_TTL = 60 * 60 * 24; // 24 hours
```

## Testing & Debugging

### 1. Logout Metrics

```js
// Check last logout performance
const metrics = logoutService.getLastLogoutMetrics();
console.log('Logout took:', metrics.duration, 'ms');
console.log('Server success:', metrics.serverLogoutSuccess);
```

### 2. Logger Configuration

```js
// Runtime debugging
logger.setLogLevel('VERBOSE');
logger.enableCategory('AUTH');

// Check current config
console.log(logger.getConfig());
```

### 3. Development Tools

```js
// Global access in development
__FINNIGRAM_LOGGER__.setLogLevel('DEBUG');
__FINNIGRAM_LOGGER__.enableCategory('NETWORK');
```

## Troubleshooting

### Common Issues

#### 1. "Logout button does nothing"

- **Check**: Network connectivity
- **Check**: Server availability
- **Solution**: Emergency cleanup still logs user out locally

#### 2. "User appears online after logout"

- **Check**: Socket disconnection in logs
- **Check**: Server-side session invalidation
- **Solution**: Manual session cleanup

#### 3. "Logout taking too long"

- **Check**: Network quality detection
- **Check**: Retry configuration
- **Solution**: Adjust timeout settings

### Debug Commands

```js
// Check socket status
socketService.getConnectionStatus();

// Check logout service status  
logoutService.isLogoutInProgress();

// View recent audit events
await auditLogger.getRecentEvents(10);
```

## Future Enhancements

### Planned Features

1. **Biometric logout confirmation**
2. **Progressive Web App support**
3. **Background logout handling**
4. **Enhanced session management**
5. **Real-time security monitoring**

### Scalability Considerations

1. **Redis clustering** for high availability
2. **Distributed rate limiting** across regions
3. **Log aggregation** and analytics
4. **Automated security response**

---

## Quick Reference

### Key Files

- `AuthContext.js` - Main auth state
- `LogoutService.js` - Logout orchestration  
- `TokenBlacklistService.ts` - Server token management
- `AuditLogger.ts` - Security logging
- `logger.js` - Frontend logging system

### Key Endpoints

- `POST /api/logout` - Server logout
- Rate limited to 10/minute per IP

### Key Redis Keys

- `blacklist:token:{tokenId}` - Blacklisted tokens
- `user_sessions:{userId}` - Active user sessions
- `rate_limit:logout:{ip}` - Rate limiting

This architecture ensures secure, reliable, and maintainable logout functionality with comprehensive monitoring and error recovery.
