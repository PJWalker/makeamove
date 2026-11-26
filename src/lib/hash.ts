/** The SHA-256 of some bytes, as lowercase hex: how blobs are named and checked. */
async function sha256(data: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default sha256;
