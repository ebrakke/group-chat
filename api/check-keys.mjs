import { getPublicKey } from 'nostr-tools';

// Convert hex string to Uint8Array
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

const serverPrivkey = '27b272d8c82f77eafa45289ce75ca33be7d90d01eb5462f333d977b1ea8a2503';
const allowedPubkey = 'eb791dd5f7d08ff2831e20ef074d04daea835b68e59803c8b5fffaef816d16e6';

const derivedPubkey = getPublicKey(hexToBytes(serverPrivkey));

console.log('SERVER_PRIVKEY:', serverPrivkey);
console.log('Derived pubkey:', derivedPubkey);
console.log('ALLOWED_PUBKEYS:', allowedPubkey);
console.log('Match:', derivedPubkey === allowedPubkey ? 'YES' : 'NO');
