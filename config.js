const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

function parseNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

const config = {
    sourceGroupName: process.env.SOURCE_GROUP_NAME?.trim() || '',
    targetGroupName: process.env.TARGET_GROUP_NAME?.trim() || '',
    maxRetryAttempts: parseNumber(process.env.MAX_RETRY_ATTEMPTS, 3),
    retryDelayMs: parseNumber(process.env.RETRY_DELAY_MS, 1500),
    rateLimitMs: parseNumber(process.env.RATE_LIMIT_MS, 400),
    dedupeTtlMs: parseNumber(process.env.DEDUPE_TTL_MS, 5 * 60 * 1000),
    authPath: path.resolve(process.cwd(), '.wwebjs_auth'),
    cachePath: path.resolve(process.cwd(), '.wwebjs_cache'),
    logLevel: (process.env.LOG_LEVEL || 'info').toLowerCase(),
};

function validateConfig() {
    const missing = [];
    if (!config.sourceGroupName) missing.push('SOURCE_GROUP_NAME');
    if (!config.targetGroupName) missing.push('TARGET_GROUP_NAME');

    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    if (config.sourceGroupName === config.targetGroupName) {
        throw new Error('SOURCE_GROUP_NAME and TARGET_GROUP_NAME must be different.');
    }
}

module.exports = {
    config,
    validateConfig,
};