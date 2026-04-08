/**
 * Integration Test Setup
 * Wird vor jedem Test-Lauf ausgeführt
 */

import { redisConnection, agentQueue, closeQueue } from '../../backend/src/queue/agentQueue';

// Test-Timeout erhöhen
jest.setTimeout(30000);

// Environment Variablen für Tests
process.env.NODE_ENV = 'test';
process.env.API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
process.env.WEBSOCKET_URL = process.env.WEBSOCKET_URL || 'ws://localhost:8080';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Global Setup
beforeAll(async () => {
  console.log('🧪 Integration Test Setup');
  
  // Prüfe Redis-Verbindung
  try {
    await redisConnection.ping();
    console.log('✅ Redis connected');
  } catch (error) {
    console.error('❌ Redis connection failed:', error);
    throw new Error('Redis must be running for integration tests');
  }
  
  // Clean up test data
  await redisConnection.flushdb();
  console.log('🧹 Test database cleaned');
});

// Global Teardown
afterAll(async () => {
  console.log('🧹 Integration Test Teardown');
  
  // Clean up
  await redisConnection.flushdb();
  await closeQueue();
  
  console.log('✅ Test cleanup complete');
});

// Between Tests
afterEach(async () => {
  // Clean up queues
  const jobs = await agentQueue.getWaiting();
  for (const job of jobs) {
    await job.remove();
  }
});

// Handle unhandled errors
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});
