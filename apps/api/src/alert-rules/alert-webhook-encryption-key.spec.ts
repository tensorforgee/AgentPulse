import { assertAlertWebhookEncryptionKey } from './alert-webhook.service';

describe('assertAlertWebhookEncryptionKey', () => {
  const validKey = Buffer.alloc(32, 7).toString('base64');

  it('accepts a base64-encoded 32-byte key', () => {
    expect(() => assertAlertWebhookEncryptionKey(validKey)).not.toThrow();
  });

  it('accepts an unset key so webhook-free deployments still boot', () => {
    expect(() => assertAlertWebhookEncryptionKey(undefined)).not.toThrow();
    expect(() => assertAlertWebhookEncryptionKey('')).not.toThrow();
    expect(() => assertAlertWebhookEncryptionKey('   ')).not.toThrow();
  });

  it('rejects the placeholder shipped in deploy/.env.example', () => {
    expect(() =>
      assertAlertWebhookEncryptionKey(
        'replace-with-a-base64-encoded-32-byte-key',
      ),
    ).toThrow(/base64-encoded 32-byte key/);
  });

  it('rejects a key of the wrong decoded length', () => {
    expect(() =>
      assertAlertWebhookEncryptionKey(Buffer.alloc(16, 1).toString('base64')),
    ).toThrow(/base64-encoded 32-byte key/);
    expect(() =>
      assertAlertWebhookEncryptionKey(Buffer.alloc(64, 1).toString('base64')),
    ).toThrow(/base64-encoded 32-byte key/);
  });

  it('reads the environment when no argument is supplied', () => {
    const original = process.env.ALERT_WEBHOOK_ENCRYPTION_KEY;
    try {
      process.env.ALERT_WEBHOOK_ENCRYPTION_KEY = 'not-a-valid-key';
      expect(() => assertAlertWebhookEncryptionKey()).toThrow();
      process.env.ALERT_WEBHOOK_ENCRYPTION_KEY = validKey;
      expect(() => assertAlertWebhookEncryptionKey()).not.toThrow();
    } finally {
      if (original === undefined) {
        delete process.env.ALERT_WEBHOOK_ENCRYPTION_KEY;
      } else {
        process.env.ALERT_WEBHOOK_ENCRYPTION_KEY = original;
      }
    }
  });
});
