import type { ReactNode } from "react";
import { Tab, TabList, TabPanel, Tabs } from "react-aria-components";

/**
 * Square folder tabs across the top of a pop-up.
 */
export function PopupTabs<T extends string>({
  tabs,
  value,
  onChange,
  children,
  hideTabs = false,
}: {
  tabs: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  children?: ReactNode;
  hideTabs?: boolean;
}) {
  return (
    <Tabs
      className="popup-tabbed"
      selectedKey={value}
      onSelectionChange={(key) => onChange(key as T)}
    >
      <TabList
        className="popup-tabs"
        aria-label="Token options"
        {...(hideTabs ? { style: { display: "none" as const } } : {})}
      >
        {tabs.map((t) => (
          <Tab key={t.id} id={t.id} className="popup-tab">
            {t.label}
          </Tab>
        ))}
      </TabList>
      <TabPanel id={value} className="popup-tab-panel">
        {children}
      </TabPanel>
    </Tabs>
  );
}
