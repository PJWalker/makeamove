import { signal } from '@preact/signals'
import { newId } from '../lib/ids'

/**
 * This browser's identity. M0 uses a random id; M2 replaces it with a
 * WebCrypto keypair whose public key becomes the id.
 */
export interface Device {
  id: string
  name: string
  /** Chosen colour for cursors, pings and new tokens; derived from the id if unset. */
  colour?: string
}

const KEY = 'mam:device'

function load(): Device {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved) return JSON.parse(saved) as Device
  } catch {
    // Storage blocked or corrupt: fall through to a fresh identity.
  }
  const fresh: Device = { id: newId(), name: '' }
  save(fresh)
  return fresh
}

function save(d: Device) {
  try {
    localStorage.setItem(KEY, JSON.stringify(d))
  } catch {
    // Non-persistent identity is acceptable; the session still works.
  }
}

export const device = signal<Device>(load())

export function setDeviceName(name: string) {
  device.value = { ...device.value, name }
  save(device.value)
}

export function setDeviceColour(colour: string) {
  device.value = { ...device.value, colour }
  save(device.value)
}
