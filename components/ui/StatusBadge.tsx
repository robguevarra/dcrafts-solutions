import { cn } from "@/lib/utils";
import type { Database } from "@/types/database";

type OrderStatus   = Database["public"]["Enums"]["order_status"];
type PrintJobStatus = Database["public"]["Enums"]["print_job_status"];

/** Union of every status value used across the platform */
type AnyStatus = OrderStatus | PrintJobStatus;

const STATUS_CONFIG: Record<AnyStatus, { label: string; className: string }> = {
  // Order statuses
  pending_spec:   { label: "Pending Spec",   className: "badge-pending" },
  spec_collected: { label: "Spec Collected", className: "badge-active" },
  in_production:  { label: "In Production",  className: "badge-active" },
  qc_upload:      { label: "QC Upload",      className: "badge-pending" },
  shipped:        { label: "Shipped",         className: "badge-complete" },
  cancelled:      { label: "Cancelled",       className: "badge-flagged" },
  // Print job statuses
  queued:         { label: "Queued",          className: "badge-pending" },
  in_progress:    { label: "In Progress",     className: "badge-active" },
  done:           { label: "Done",            className: "badge-complete" },
};

interface StatusBadgeProps {
  status: AnyStatus;
  className?: string;
}

/**
 * Status badge for both orders (`order_status`) and print jobs (`print_job_status`).
 */
export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    className: "badge-shadow",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 text-xs font-mono-data uppercase tracking-wide",
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}
