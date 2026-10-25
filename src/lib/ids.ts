const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'

/** Time-sortable random id (ULID-style, lowercase Crockford base32). */
export function newId(): string {
  let time = Date.now()
  let head = ''
  for (let i = 0; i < 10; i++) {
    head = ALPHABET[time % 32] + head
    time = Math.floor(time / 32)
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  let tail = ''
  for (const b of bytes) tail += ALPHABET[b % 32]
  return head + tail
}

/** Random secret encoded as base64url, used for room keys. */
export function newSecret(byteLength = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength))
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}
