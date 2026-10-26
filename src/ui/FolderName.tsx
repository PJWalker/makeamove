/** A field for naming a folder in place: Enter keeps the name, Escape or leaving it empty cancels. */
export function FolderName({ initial = '', onDone }: { initial?: string; onDone: (name: string | null) => void }) {
  return (
    <input
      class="input bevel chars-folder-input"
      aria-label="Folder name"
      placeholder="Folder name"
      value={initial}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onBlur={(e) => onDone(e.currentTarget.value.trim() || null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          e.currentTarget.value = ''
          e.currentTarget.blur()
        }
      }}
    />
  )
}
