import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { EmailData } from './types';

export class GmailClient {
  private gmail: any;
  private auth: OAuth2Client;

  constructor(auth: OAuth2Client) {
    this.auth = auth;
    this.gmail = google.gmail({ version: 'v1', auth });
  }

  async listMessages(query: string, maxResults: number = 500): Promise<any[]> {
    const messages: any[] = [];
    let pageToken: string | undefined;

    do {
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults,
        pageToken,
      });

      if (response.data.messages) {
        messages.push(...response.data.messages);
      }

      pageToken = response.data.nextPageToken;
    } while (pageToken);

    return messages;
  }

  async getMessage(messageId: string): Promise<any> {
    const response = await this.gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });

    return response.data;
  }

  extractEmailData(message: any): EmailData {
    const headers = message.payload.headers;
    const getHeader = (name: string): string => {
      const header = headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase());
      return header ? header.value : '';
    };

    const subject = getHeader('Subject');
    const from = getHeader('From');
    const date = getHeader('Date');
    const messageId = getHeader('Message-ID');

    let htmlContent = '';
    let plainText = '';

    const extractParts = (parts: any[]): void => {
      if (!parts) return;

      for (const part of parts) {
        if (part.mimeType === 'text/html' && part.body?.data) {
          htmlContent += Buffer.from(part.body.data, 'base64').toString('utf-8');
        } else if (part.mimeType === 'text/plain' && part.body?.data) {
          plainText += Buffer.from(part.body.data, 'base64').toString('utf-8');
        } else if (part.parts) {
          extractParts(part.parts);
        }
      }
    };

    if (message.payload.body?.data) {
      // Single part message
      const content = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
      if (message.payload.mimeType === 'text/html') {
        htmlContent = content;
      } else {
        plainText = content;
      }
    } else if (message.payload.parts) {
      // Multi-part message
      extractParts(message.payload.parts);
    }

    // Generate preview text from plain text or HTML
    let previewText = plainText.slice(0, 200);
    if (!previewText && htmlContent) {
      // For preview text, we just need a simple text representation
      // The actual HTML is safely rendered in a sandboxed iframe on the frontend
      // This is NOT for sanitizing HTML for rendering
      previewText = htmlContent
        .split('<').join(' ') // Replace all < with space to break any tags
        .split('>').join(' ') // Replace all > with space
        .replace(/\s+/g, ' ') // Collapse multiple spaces
        .trim()
        .slice(0, 200);
    }

    return {
      message_id: messageId,
      subject,
      from_email: from,
      date,
      html: htmlContent,
      plain_text: plainText,
    };
  }

  async forwardEmail(messageId: string, forwardTo: string): Promise<void> {
    await this.gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        addLabelIds: [],
        removeLabelIds: [],
      },
    });

    // Create a forward message
    const message = await this.getMessage(messageId);
    const subject = `Fwd: ${message.payload.headers.find((h: any) => h.name === 'Subject')?.value || ''}`;

    const rawMessage = [
      `To: ${forwardTo}`,
      `Subject: ${subject}`,
      '',
      `Forwarded message from Gmail`,
    ].join('\n');

    const encodedMessage = Buffer.from(rawMessage).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    await this.gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });
  }
}

export function createGmailClient(credentials: any, tokens: any): GmailClient {
  const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  oAuth2Client.setCredentials(tokens);

  return new GmailClient(oAuth2Client);
}
