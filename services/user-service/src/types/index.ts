import { Request } from 'express';

// User-related types
export interface User {
  id: number;
  email: string;
  username: string;
  passwordHash: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  isOnline: boolean;
  lastSeen?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserPublic {
  id: number;
  email?: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  isOnline?: boolean;
  lastSeen?: Date | null;
  createdAt?: Date;
}

export interface UserSearchResult {
  id: number;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  isOnline: boolean;
}

// Authentication types
export interface JWTPayload {
  userId: number;
  jti?: string; // JWT ID for tracking
  iat?: number;
  exp?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthenticatedRequest extends Request {
  user?: User;
  token?: string; // Current token for blacklisting
}

// API Request/Response types
export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
  displayName?: string;
}

export interface RegisterResponse {
  message: string;
  user: UserPublic;
  tokens: TokenPair;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  message: string;
  user: UserPublic;
  tokens: TokenPair;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface RefreshTokenResponse {
  message: string;
  tokens: TokenPair;
}

export interface LogoutResponse {
  message: string;
}

export interface GetUserResponse {
  user: UserPublic;
}

export interface SearchUsersResponse {
  users: UserSearchResult[];
}

export interface UpdateProfileRequest {
  displayName?: string;
  avatarUrl?: string;
}

export interface UpdateProfileResponse {
  message: string;
  user: UserPublic;
}

export interface BulkUsersRequest {
  userIds: number[];
}

export interface BulkUsersResponse {
  users: UserPublic[];
}

// Health and metrics types
export interface HealthStatus {
  status: string;
  service: string;
  timestamp: string;
  uptime: number;
  version: string;
}

export interface MetricsResponse {
  uptime: number;
  memory: NodeJS.MemoryUsage;
  cpu: NodeJS.CpuUsage;
  timestamp: string;
}

// Error types
export interface ApiError {
  error: string;
  details?: string[];
  path?: string;
  method?: string;
}

export interface ValidationError {
  error: string;
  details: string[];
}

// Database operation types
export interface CreateUserData {
  email: string;
  username: string;
  password: string;
  displayName?: string;
}

export interface UpdateUserData {
  displayName?: string;
  avatarUrl?: string;
}

// Service layer types
export interface UserServiceInterface {
  create(data: CreateUserData): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  findById(id: number): Promise<User | null>;
  validatePassword(user: User, password: string): Promise<boolean>;
  updateOnlineStatus(userId: number, isOnline: boolean): Promise<void>;
  searchUsers(query: string, limit?: number): Promise<UserSearchResult[]>;
  updateProfile(userId: number, data: UpdateUserData): Promise<User>;
}

// Event types for user data synchronization
export interface BaseUserEvent {
  eventId: string;
  eventType: 'USER_CREATED' | 'USER_UPDATED' | 'USER_DELETED';
  userId: number;
  timestamp: string; // ISO string
  version: number; // For event versioning
}

export interface UserCreatedEvent extends BaseUserEvent {
  eventType: 'USER_CREATED';
  data: {
    id: number;
    username: string;
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
    createdAt: string;
  };
}

export interface UserUpdatedEvent extends BaseUserEvent {
  eventType: 'USER_UPDATED';
  data: {
    id: number;
    username: string;
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
    isOnline: boolean;
    lastSeen: string | null;
    updatedAt: string;
  };
  changes: string[]; // List of fields that changed
}

export interface UserDeletedEvent extends BaseUserEvent {
  eventType: 'USER_DELETED';
  data: {
    id: number;
    username: string;
  };
}

export type UserEvent = UserCreatedEvent | UserUpdatedEvent | UserDeletedEvent;

// Outbox event storage type
export interface UserEventOutbox {
  id: number;
  userId: number;
  eventType: string;
  eventData: UserEvent;
  processed: boolean;
  createdAt: Date;
  processedAt: Date | null;
}
