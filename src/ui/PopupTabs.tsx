import { useLayoutEffect, useRef } from 'preact/hooks'

/**
 * Folder tabs across the top of a pop-up. The chosen tab opens into the
 * content below, so the bar's band and gold rule leave a gap where it sits;
 * the bar learns where that is from --tab-l and --tab-r.
 */
export function PopupTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: readonly { id: T; label: string }[]
  value: T
  onChange: (id: T) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const bar = ref.current
    if (!bar) return
    const place = () => {
      const tab = bar.querySelector<HTMLElement>('[aria-selected="true"]')
      if (!tab) return
      // Sub-pixel positions, so the gold rule meets the tab's outline exactly,
      // with the scale of the pop-up's opening animation taken back out.
      const b = bar.getBoundingClientRect()
      const t = tab.getBoundingClientRect()
      const scale = b.width / bar.offsetWidth || 1
      bar.style.setProperty('--tab-l', `${(t.left - b.left) / scale}px`)
      bar.style.setProperty('--tab-r', `${(t.right - b.left) / scale}px`)
    }
    place()
    // Tab widths change when the web font arrives.
    const observer = new ResizeObserver(place)
    for (const tab of bar.children) observer.observe(tab)
    return () => observer.disconnect()
  }, [value])

  return (
    <div class="popup-tabs" role="tablist" ref={ref}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          class="popup-tab bevel"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
