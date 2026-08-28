import { describe, it, expect } from 'vitest';
import { createEmailProvider, MockEmailProvider } from '../utils/email/providerFactory';
import { GmailProvider } from '../utils/email/gmailProvider';
import { SesProvider } from '../utils/email/sesProvider';

describe('EmailProviderFactory: Provider Selection & Isolation', () => {
  it('instantiates GmailProvider when providerType is gmail', () => {
    const provider = createEmailProvider({
      providerType: 'gmail',
      gmail: {
        clientId: 'id',
        clientSecret: 'secret',
        refreshToken: 'token',
        senderEmail: 'travel@navgurukul.org'
      }
    });

    expect(provider).toBeInstanceOf(GmailProvider);
    expect(provider.name).toBe('gmail');
  });

  it('instantiates SesProvider when providerType is ses', () => {
    const provider = createEmailProvider({
      providerType: 'ses',
      ses: {
        region: 'ap-south-1',
        accessKeyId: 'key',
        secretAccessKey: 'secret',
        senderEmail: 'travel@navgurukul.org'
      }
    });

    expect(provider).toBeInstanceOf(SesProvider);
    expect(provider.name).toBe('ses');
  });

  it('instantiates MockEmailProvider when providerType is mock', () => {
    const provider = createEmailProvider({
      providerType: 'mock'
    });

    expect(provider).toBeInstanceOf(MockEmailProvider);
    expect(provider.name).toBe('mock');
  });

  it('throws helpful error if required provider configuration is missing', () => {
    expect(() => createEmailProvider({ providerType: 'gmail' })).toThrow(/Gmail configuration missing/);
    expect(() => createEmailProvider({ providerType: 'ses' })).toThrow(/SES configuration missing/);
  });
});
