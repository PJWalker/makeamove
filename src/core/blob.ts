/** An image in the blob store; the CRDT holds only this reference. */
export interface BlobRef {
  hash: string;
  mime: string;
  width: number;
  height: number;
}
