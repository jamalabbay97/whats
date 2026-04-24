const LEVELS = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
};

function createLogger(level = 'info') {
    const currentLevel = LEVELS[level] ?? LEVELS.info;

    function shouldLog(target) {
        return LEVELS[target] <= currentLevel;
    }

    function format(levelName, message, meta) {
        const ts = new Date().toISOString();
        const base = `[${ts}] [${levelName.toUpperCase()}] ${message}`;

        if (!meta) return base;
        return `${base} ${JSON.stringify(meta)}`;
    }

    return {
        error(message, meta) {
            if (shouldLog('error')) console.error(format('error', message, meta));
        },
        warn(message, meta) {
            if (shouldLog('warn')) console.warn(format('warn', message, meta));
        },
        info(message, meta) {
            if (shouldLog('info')) console.log(format('info', message, meta));
        },
        debug(message, meta) {
            if (shouldLog('debug')) console.debug(format('debug', message, meta));
        },
    };
}

module.exports = {
    createLogger,
};