import { hueFromString } from '../lib/colour'

export function Avatar({ id, name, online }: { id: string; name: string; online?: boolean }) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || '?'
  return (
    <span
      class="avatar"
      style={{ '--avatar-hue': hueFromString(id) }}
      data-online={online === undefined ? undefined : String(online)}
      title={online === false ? `${name} (away)` : name}
      aria-hidden="true"
    >
      {initials}
    </span>
  )
}
