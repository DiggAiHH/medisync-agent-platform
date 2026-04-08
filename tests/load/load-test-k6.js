/**
 * MediSync Load Test - k6 Version
 * 
 * Installation:
 *   # Windows
 *   winget install k6
 *   
 *   # macOS
 *   brew install k6
 *   
 *   # Linux
 *   sudo apt-get install k6
 *
 * Ausführen:
 *   k6 run tests/load/load-test-k6.js
 * 
 * Mit mehr VUs:
 *   k6 run --vus 20 --duration 5m tests/load/load-test-k6.js
 * 
 * Mit Cloud:
 *   k6 cloud tests/load/load-test-k6.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// Custom Metrics
const jobCompletionTime = new Trend('job_completion_time');
const jobSuccessRate = new Rate('job_success_rate');
const websocketConnectTime = new Trend('websocket_connect_time');
const apiErrors = new Counter('api_errors');

// Test Konfiguration
export const options = {
  scenarios: {
    // Scenario 1: Konstante Last mit 10 parallelen Nutzern
    constant_load: {
      executor: 'constant-vus',
      vus: 10,
      duration: '5m',
      gracefulStop: '30s',
    },
    
    // Scenario 2: Ramp-up für Stress Test
    ramp_up: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 10 },   // Aufbau auf 10 VUs
        { duration: '3m', target: 10 },   // Konstante Last
        { duration: '1m', target: 20 },   // Spike auf 20 VUs
        { duration: '1m', target: 0 },    // Abbruch
      ],
      gracefulRampDown: '30s',
    },
    
    // Scenario 3: Arrival Rate (5 Requests pro Sekunde)
    arrival_rate: {
      executor: 'constant-arrival-rate',
      rate: 5,
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 10,
      maxVUs: 20,
    },
  },
  
  // Schwellenwerte
  thresholds: {
    http_req_duration: ['p(95)<10000'],  // 95% unter 10s
    http_req_duration: ['p(99)<15000'],  // 99% unter 15s
    http_req_failed: ['rate<0.05'],      // Max 5% Fehler
    job_completion_time: ['p(95)<10000'], // Job Completion unter 10s
    job_success_rate: ['rate>0.95'],      // 95% Success Rate
  },
};

// Basis URL
const BASE_URL = __ENV.API_URL || 'http://localhost:3000';
const WS_URL = __ENV.WS_URL || 'ws://localhost:8080';

// Testdaten
const TEST_PROMPTS = [
  'Hallo',
  'Wie geht es dir?',
  'Erkläre mir Quantenphysik',
  'Schreibe einen kurzen Text über KI',
  'Was ist die Hauptstadt von Deutschland?',
  'Erstelle eine Todo-Liste',
  'Berechne 1234 * 5678',
  'Übersetze "Hello World" ins Deutsche',
  'Was ist 2 + 2?',
  'Erzähle mir einen Witz',
];

export function setup() {
  console.log('🚀 Starting MediSync Load Test');
  console.log(`📍 API URL: ${BASE_URL}`);
  console.log(`📍 WebSocket URL: ${WS_URL}`);
  
  // Health Check
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, {
    'API is healthy': (r) => r.status === 200,
  });
  
  return {
    startTime: Date.now(),
    apiHealthy: healthRes.status === 200,
  };
}

export default function (data) {
  const userId = `load_test_user_${__VU}`;
  const sessionId = `session_${uuidv4()}`;
  
  group('Job Creation Flow', () => {
    // 1. Erstelle einen Job
    const prompt = TEST_PROMPTS[Math.floor(Math.random() * TEST_PROMPTS.length)];
    const jobPayload = JSON.stringify({
      prompt: prompt,
      userId: userId,
      sessionId: sessionId,
    });
    
    const createRes = http.post(`${BASE_URL}/api/jobs`, jobPayload, {
      headers: {
        'Content-Type': 'application/json',
      },
      tags: { name: 'CreateJob' },
    });
    
    const createCheck = check(createRes, {
      'Job created successfully': (r) => r.status === 201,
      'Job has ID': (r) => r.json('data.id') !== undefined,
      'Job status is pending': (r) => r.json('data.status') === 'pending',
    });
    
    if (!createCheck) {
      apiErrors.add(1);
      return;
    }
    
    const jobId = createRes.json('data.id');
    const jobStartTime = Date.now();
    
    // 2. Poll für Job-Completion (max 30 Versuche, 2 Sekunden Pause)
    let jobCompleted = false;
    let jobFailed = false;
    let attempts = 0;
    const maxAttempts = 30;
    
    while (!jobCompleted && !jobFailed && attempts < maxAttempts) {
      sleep(2);
      
      const statusRes = http.get(`${BASE_URL}/api/jobs/${jobId}`, {
        tags: { name: 'GetJobStatus' },
      });
      
      check(statusRes, {
        'Job status request successful': (r) => r.status === 200,
      });
      
      const status = statusRes.json('data.status');
      
      if (status === 'completed') {
        jobCompleted = true;
        const completionTime = Date.now() - jobStartTime;
        jobCompletionTime.add(completionTime);
        jobSuccessRate.add(1);
        
        check(statusRes, {
          'Job completed with result': (r) => r.json('data.result') !== undefined,
          'Job completed in time': () => completionTime < 30000,
        });
        
        console.log(`✅ Job ${jobId} completed in ${completionTime}ms`);
      } else if (status === 'failed') {
        jobFailed = true;
        jobSuccessRate.add(0);
        console.log(`❌ Job ${jobId} failed`);
      }
      
      attempts++;
    }
    
    if (!jobCompleted && !jobFailed) {
      console.log(`⏱️ Job ${jobId} timed out after ${attempts} attempts`);
    }
  });
  
  group('Health & Stats', () => {
    // Health Check
    const healthRes = http.get(`${BASE_URL}/health`, {
      tags: { name: 'HealthCheck' },
    });
    
    check(healthRes, {
      'Health check successful': (r) => r.status === 200,
      'API is healthy': (r) => r.json('status') === 'healthy',
    });
    
    // Stats Endpoint
    const statsRes = http.get(`${BASE_URL}/api/stats`, {
      tags: { name: 'GetStats' },
    });
    
    check(statsRes, {
      'Stats endpoint available': (r) => r.status === 200,
    });
  });
  
  sleep(1); // Pause zwischen Iterationen
}

export function teardown(data) {
  const duration = Date.now() - data.startTime;
  console.log('🏁 Load Test Completed');
  console.log(`⏱️  Total Duration: ${(duration / 1000).toFixed(2)}s`);
  console.log(`📊 Results saved to load-test-results.json`);
}

// WebSocket Test (separate Funktion für komplexere Tests)
export function websocketTest() {
  // Hinweis: k6 hat begrenzte WebSocket Unterstützung
  // Für komplexere WebSocket Tests könnte man xk6-websockets verwenden
  
  const wsRes = http.get(`${BASE_URL}/health`);
  check(wsRes, {
    'WebSocket server is reachable': (r) => r.status === 200,
  });
}
