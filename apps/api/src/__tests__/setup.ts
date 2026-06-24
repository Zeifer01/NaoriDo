// Environment variables required by modules loaded during tests
process.env.JWT_SECRET = "test-jwt-secret-key-minimum-32-characters-long!!";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-key-minimum-32-characters-long!!";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test_db";
process.env.REDIS_URL = "redis://localhost:6379";
