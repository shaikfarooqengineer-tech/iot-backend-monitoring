// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/components/RoleBadge.js
// PURPOSE: Colored pill that displays a human-readable role label.
// ═══════════════════════════════════════════════════════════════════════════

import { ROLE_META } from "@/constants/roles";

export function RoleBadge({ role }) {
  const meta = ROLE_META[role] ?? { label: role, badgeColor: "bg-gray-100 text-gray-700 border-gray-200" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${meta.badgeColor}`}>
      {meta.label}
    </span>
  );
}
