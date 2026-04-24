function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeWhatsAppId(id) {
    if (!id || typeof id !== 'string') return '';
    return id.trim().toLowerCase().replace(/:\d+(?=@)/, '');
}

class MessageHandler {
    constructor(options) {
        this.client = options.client;
        this.logger = options.logger;
        this.sourceGroupId = normalizeWhatsAppId(options.sourceGroupId);
        this.targetChat = options.targetChat;
        this.forwardKeywords = options.forwardKeywords || [];
        this.allowedSenders = new Set((options.allowedSenders || []).map((id) => normalizeWhatsAppId(id)));
        this.maxRetryAttempts = options.maxRetryAttempts || 3;
        this.retryDelayMs = options.retryDelayMs || 1500;
        this.rateLimitMs = options.rateLimitMs || 400;
        this.dedupeTtlMs = options.dedupeTtlMs || 5 * 60 * 1000;

        this.seenMessages = new Map();
        this.nextAllowedSendAt = 0;

        this.cleanupInterval = setInterval(() => this.cleanupSeen(), Math.max(this.dedupeTtlMs, 30000));
        this.cleanupInterval.unref();
    }

    stop() {
        clearInterval(this.cleanupInterval);
    }

    cleanupSeen() {
        const now = Date.now();
        for (const [id, timestamp] of this.seenMessages.entries()) {
            if (now - timestamp > this.dedupeTtlMs) {
                this.seenMessages.delete(id);
            }
        }
    }

    isAllowedSender(authorId) {
        if (this.allowedSenders.size === 0) return true;
        return this.allowedSenders.has(normalizeWhatsAppId(authorId));
    }

    passesKeywordFilter(body) {
        if (this.forwardKeywords.length === 0) return true;
        const messageText = (body || '').toLowerCase();
        return this.forwardKeywords.some((keyword) => messageText.includes(keyword));
    }

    async waitForRateLimit() {
        const now = Date.now();
        const waitMs = this.nextAllowedSendAt - now;
        if (waitMs > 0) {
            await delay(waitMs);
        }
        this.nextAllowedSendAt = Date.now() + this.rateLimitMs;
    }

    async sendWithRetry(payload, options) {
        let lastError;

        for (let attempt = 1; attempt <= this.maxRetryAttempts; attempt += 1) {
            try {
                await this.waitForRateLimit();
                await this.targetChat.sendMessage(payload, options);
                return;
            } catch (error) {
                lastError = error;
                this.logger.warn('Send attempt failed, retrying...', {
                    attempt,
                    maxRetryAttempts: this.maxRetryAttempts,
                    error: error?.message,
                });

                if (attempt < this.maxRetryAttempts) {
                    await delay(this.retryDelayMs * attempt);
                }
            }
        }

        throw lastError;
    }

    async forwardMessage(message) {
        try {
            const messageId = message?.id?.id || message?.id?._serialized || '';
            if (!messageId) return;
            if (message.fromMe) return;
            if (normalizeWhatsAppId(message.from) !== this.sourceGroupId) return;

            const uniqueId = `${normalizeWhatsAppId(message.from)}:${messageId}`;
            if (this.seenMessages.has(uniqueId)) {
                this.logger.debug('Duplicate message skipped', { uniqueId });
                return;
            }

            const senderId = message.author || message._data?.participant || '';
            if (!this.isAllowedSender(senderId)) {
                this.logger.debug('Sender filtered out', { senderId });
                return;
            }

            const body = message.body || '';
            if (!this.passesKeywordFilter(body)) {
                this.logger.debug('Keyword filter skipped message', { bodyPreview: body.slice(0, 80) });
                return;
            }

            this.seenMessages.set(uniqueId, Date.now());

            if (message.hasMedia) {
                const media = await message.downloadMedia();
                if (!media) {
                    throw new Error('Media message detected but downloadMedia() returned empty data.');
                }

                const options = {};
                if (body) options.caption = body;

                await this.sendWithRetry(media, options);
            } else {
                await this.sendWithRetry(body || ' ', {});
            }

            this.logger.info('Message forwarded', {
                id: messageId,
                hasMedia: !!message.hasMedia,
                senderId,
            });
        } catch (error) {
            this.logger.error('Failed to forward message', {
                error: error?.message,
                stack: error?.stack,
            });
        }
    }
}

module.exports = {
    MessageHandler,
};