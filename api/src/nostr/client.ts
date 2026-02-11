// TODO: Nostr relay client
// - Connect to relay via WebSocket
// - Subscribe to NIP-29 group events
// - Publish events (messages, reactions, etc.)
// - Handle NIP-42 AUTH

export class NostrClient {
  private relayUrl: string;

  constructor(relayUrl: string) {
    this.relayUrl = relayUrl;
  }

  async connect(): Promise<void> {
    console.log(`TODO: Connect to relay at ${this.relayUrl}`);
  }
}
