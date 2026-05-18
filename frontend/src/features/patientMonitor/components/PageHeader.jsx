// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/features/patientMonitor/components/PageHeader.jsx
// PURPOSE: Page header with device ID, room/site subtitle, alert badge, nav.
// ═══════════════════════════════════════════════════════════════════════════

import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getAlertBadgeColor, getAlertBadgeLabel } from "../utils/docHelpers";

const PageHeader = React.memo(function PageHeader({
  deviceId,
  roomId,
  siteId,
  deviceType,
  alertLevel,
}) {
  const navigate = useNavigate();
  const badgeColor = getAlertBadgeColor(alertLevel);
  const badgeLabel = getAlertBadgeLabel(alertLevel);

  return (
    <div className="flex items-center justify-between flex-wrap gap-3">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {deviceId ?? "—"}
          </h1>
          <p className="text-sm text-slate-500">
            {roomId ?? "—"} · {siteId ?? "—"} · {deviceType ?? "—"}
          </p>
        </div>
      </div>
      <Badge className={badgeColor}>{badgeLabel}</Badge>
    </div>
  );
});

PageHeader.displayName = "PageHeader";
export default PageHeader;
