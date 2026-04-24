const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const path = require('path');
const { Client, LocalAuth } = require('whatsapp-web.js');
const { config, validateConfig } = require('./config');
const { createLogger } = require('./logger');
const { MessageHandler } = require('./messageHandler');

const logger = createLogger(config.logLevel);
let messageHandler;
let isShuttingDown = false;

function getSafeError(error) {
    return {
        message: error?.message,
        stack: error?.stack,
    };
}

async function findGroupByName(client, groupName) {
    const chats = await client.getChats();
    return chats.find((chat) => chat.isGroup && chat.name === groupName);
}

async function setupBot(client) {
    const sourceChat = await findGroupByName(client, config.sourceGroupName);
    const targetChat = await findGroupByName(client, config.targetGroupName);

    if (!sourceChat) {
        throw new Error(`SOURCE group not found by name: "${config.sourceGroupName}"`);
    }

    if (!targetChat) {
        throw new Error(`TARGET group not found by name: "${config.targetGroupName}"`);
    }

    logger.info('Source and target groups bound', {
        source: { id: sourceChat.id._serialized, name: sourceChat.name },
        target: { id: targetChat.id._serialized, name: targetChat.name },
    });

    messageHandler = new MessageHandler({
        client,
        logger,
        sourceGroupId: sourceChat.id._serialized,
        targetChat,
        forwardKeywords: config.forwardKeywords,
        allowedSenders: config.allowedSenders,
        maxRetryAttempts: config.maxRetryAttempts,
        retryDelayMs: config.retryDelayMs,
        rateLimitMs: config.rateLimitMs,
        dedupeTtlMs: config.dedupeTtlMs,
    });

    // 'message' catches incoming messages from other users.
    // 'message_create' catches outgoing messages sent by the bot account itself.
    // Both are needed; the dedup map in MessageHandler prevents double-forwarding.
    client.on('message', (msg) => {
        void messageHandler.forwardMessage(msg);
    });

    client.on('message_create', (msg) => {
        void messageHandler.forwardMessage(msg);
    });
}

function createClient() {
    return new Client({
        authStrategy: new LocalAuth({ dataPath: config.authPath }),
        webVersionCache: {
            type: 'local',
            path: config.cachePath,
        },
        puppeteer: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        },
    });
}

async function gracefulShutdown(client, signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info(`Received ${signal}. Shutting down gracefully...`);

    try {
        if (messageHandler) {
            messageHandler.stop();
        }

        await client.destroy();
        logger.info('WhatsApp client closed');
    } catch (error) {
        logger.error('Error during shutdown', getSafeError(error));
    } finally {
        process.exit(0);
    }
}

async function start() {
    try {
        validateConfig();
    } catch (error) {
        logger.error('Invalid configuration', getSafeError(error));
        process.exit(1);
    }

    const client = createClient();

    client.on('qr', (qr) => {
        logger.info('QR generated. Scan with WhatsApp to authenticate.');
        qrcode.generate(qr, { small: true });
        const qrImagePath = path.join(process.cwd(), 'qr.png');
        QRCode.toFile(qrImagePath, qr, { scale: 8 }, (err) => {
            if (err) {
                logger.error('Failed to save QR image', { message: err.message });
            } else {
                logger.info(`QR image saved to: ${qrImagePath}  — open this file and scan it with WhatsApp.`);
            }
        });
    });

    client.on('ready', async () => {
        logger.info('Connected to WhatsApp');
        try {
            await setupBot(client);
            logger.info('Bot is fully operational');
        } catch (error) {
            logger.error('Failed to initialize bot bindings', getSafeError(error));
        }
    });

    client.on('auth_failure', (message) => {
        logger.error('Authentication failed', { message });
    });

    client.on('disconnected', async (reason) => {
        logger.warn('Client disconnected', { reason });
        if (isShuttingDown) return;

        try {
            await client.initialize();
            logger.info('Reconnection attempt started');
        } catch (error) {
            logger.error('Reconnection failed', getSafeError(error));
        }
    });

    client.on('change_state', (state) => {
        logger.info('Client state changed', { state });
    });

    process.on('SIGINT', () => {
        void gracefulShutdown(client, 'SIGINT');
    });

    process.on('SIGTERM', () => {
        void gracefulShutdown(client, 'SIGTERM');
    });

    process.on('unhandledRejection', (reason) => {
        logger.error('Unhandled promise rejection', {
            reason: reason instanceof Error ? getSafeError(reason) : String(reason),
        });
    });

    process.on('uncaughtException', (error) => {
        logger.error('Uncaught exception', getSafeError(error));
    });

    logger.info('Bot start requested');
    await client.initialize();
}

void start();