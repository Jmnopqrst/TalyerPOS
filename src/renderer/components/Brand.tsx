import type { ReceiptSettings } from "../types/global";

function appInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("") || "TP";
}

export function Brand({ settings, subtitle, large = false }: { settings?: ReceiptSettings; subtitle: string; large?: boolean }) {
  const systemName = settings?.system_name || "TalyerPOS";
  return (
    <div className={large ? "brand large" : "brand"}>
      <div className={settings?.logo_data_url ? "brand-mark logo-mark" : "brand-mark"}>
        {settings?.logo_data_url ? <img src={settings.logo_data_url} alt="" /> : appInitials(systemName)}
      </div>
      <div>
        <strong>{systemName}</strong>
        <span>{subtitle}</span>
      </div>
    </div>
  );
}
