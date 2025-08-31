/**
 * Configuration and Constants for Privately Extension
 */

// Application Configuration
const CONFIG = {
  DEBOUNCE_MS: 250,
  BACKEND_URL: 'https://privately-backend.onrender.com/',
  MIN_ENTROPY_THRESHOLD: 3.5,
  JWT_ENTROPY_THRESHOLD: 3.8,
  SECRET_ENTROPY_THRESHOLD: 3.6,
  TOOLTIP_POSITION: 'auto', // Options: 'right', 'left', 'top', 'bottom', 'auto'
  ONNX_MODEL_PATH: '/assets/model.onnx',
  ONNX_MODEL_LABELS: ['O', 'B-NAME', 'I-NAME', 'B-ADDR', 'I-ADDR'], // Proper labels from server config
  ONNX_CONFIDENCE_THRESHOLD: 0.2 // Only accept predictions >80% confidence
};

// Detection patterns for various sensitive data types
const DETECTORS = {
  // Contact & Network
  EMAIL: { 
    rx: /[^\s]+@[^\s]+\.[^\s]+/g 
  },
  SG_PHONE: { 
    rx: /(?:\+?65[\s-]?)?[689]\d{7}/g 
  },
  URL: { 
    rx: /\b(https:\/\/\S+|http:\/\/\S+|www\.\S+)\b/gi
  },
  IP: {
    rx: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    validate: (value) => ValidationHelpers.isValidIP(value),
  },

  // Singapore Identifiers
  NRIC: {
    rx: /(?:^|\s)([STFGM]\d{7}[A-Z])(?:\s|$)/g,
    validate: (value) => ValidationHelpers.isValidNRIC(value.trim()),
  },
  POSTAL_SG: { rx: /\b\d{6}\b/g },

  // Financial & Authentication
  CARD: { 
    rx: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, 
    validate: (value) => ValidationHelpers.luhnCheck(value) 
  },
  JWT: {
    rx: /\beyJ[A-Za-z0-9_\-]*\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\b/g,
    validate: (value) => ValidationHelpers.isValidJWT(value),
  },
  AWS_KEY: { rx: /\bAKIA[0-9A-Z]{16}\b/g },

  // Secrets & Keys
  SECRET_KV: {
    rx: /(i)\b(secret|token|api[_-]?key|password|passwd|pwd)\s*[:=]\s*['"]?([A-Za-z0-9._\-=/+]{8,})['"]?/g,
    validate: (_, capturedSecret) => ValidationHelpers.shannonEntropy(capturedSecret) >= CONFIG.SECRET_ENTROPY_THRESHOLD,
    label: "SECRET",
  },
  PRIVATE_KEY: { 
    rx: /-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----/g 
  },

  // Headers & System
  AUTH_HEADER: { rx: /\bAuthorization:\s*(Bearer|Basic)\s+[A-Za-z0-9+/_=-]+/g },
  SET_COOKIE: { rx: /\bSet-Cookie:\s*[^;\n]+/gi },
  FILEPATH_UNIX: { rx: /\/(?:Users|home|var|opt|srv)\/[^\s'"]+/g, label: "FILEPATH" },
  FILEPATH_WIN: { rx: /[A-Za-z]:\\(?:Users|ProgramData|Program Files)[^\s'"]+/g, label: "FILEPATH" },
  UUID: { rx: /\b[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}\b/g },

  // High-entropy data
  BASE64_LONG: { 
    rx: /\b[A-Za-z0-9+/]{32,}={0,2}\b/g, 
    validate: (value) => ValidationHelpers.shannonEntropy(value) >= CONFIG.JWT_ENTROPY_THRESHOLD 
  },
  HEX_LONG: { 
    rx: /\b[0-9a-fA-F]{40,}\b/g, 
    validate: (value) => ValidationHelpers.shannonEntropy(value) >= CONFIG.MIN_ENTROPY_THRESHOLD 
  },
};

// Fake data for replacement 
const FAKE_DATA_MAP = {
  EMAIL: "lim.wei.ming@example.com.sg",
  SG_PHONE: "+65 8765 4321",
  URL: "https://example.gov.sg/safe-link",
  IP: "192.0.2.1",
  IP_PRIVATE: "10.0.0.1",
  CARD: "4242 4242 4242 4242",
  NRIC: "T0123456Z",
  POSTAL_SG: "068897",
  JWT: "eyJhbGciOiJIUzI1NiJ9.fake.signature",
  AWS_KEY: "AKIAIOSFODNN7EXAMPLE",
  SECRET: "fake_secret_key_123",
  PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nFAKE_KEY_DATA\n-----END PRIVATE KEY-----",
  AUTH_HEADER: "Authorization: Bearer fake_token_123",
  SET_COOKIE: "Set-Cookie: session=fake_session_id",
  FILEPATH: "/Users/weiming/Documents/report.pdf",
  UUID: "550e8400-e29b-41d4-a716-446655440000",
  BASE64_LONG: "ZmFrZV9iYXNlNjRfZGF0YV9leGFtcGxl",
  HEX_LONG: "deadbeefcafebabe1234567890abcdef",
  NAME: "Tan Wei Ling",
  ADDRESS: "Block 123 Toa Payoh Lorong 4, #05-67, Singapore 310123"
};

// Default user preferences
const DEFAULT_PREFERENCES = {
  enabled: true,
  categories: {
    EMAIL: true, SG_PHONE: true, URL: true, IP: true, IP_PRIVATE: true,
    NRIC: true, POSTAL_SG: true, CARD: true,
    JWT: true, AWS_KEY: true, SECRET: true, PRIVATE_KEY: true,
    AUTH_HEADER: true, SET_COOKIE: true, FILEPATH: true, UUID: true,
    BASE64_LONG: true, HEX_LONG: true, NAME: true, ADDRESS: true
  },
  fakeData: { ...FAKE_DATA_MAP }
};

// Input field selector for supported element types
const INPUT_FIELD_SELECTOR = [
  'input[type="text"]',
  'input[type="email"]', 
  'input[type="search"]',
  'input[type="tel"]',
  'input[type="url"]',
  'input[type="password"]',
  'input:not([type])', // Default input type is text
  'textarea',
  '[contenteditable="true"]',
  '[contenteditable=""]',
  '[contenteditable]:not([contenteditable="false"])'
].join(', ');
