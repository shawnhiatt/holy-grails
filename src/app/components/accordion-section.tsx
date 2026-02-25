import type React from "react";
import { ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

/**
 * AccordionSection — shared expand/collapse panel used in album detail.
 * Matches the visual pattern: rounded-[10px] container with border,
 * surface-alt background, label + optional icon + chevron header,
 * animated expand/collapse with divider.
 */
export function AccordionSection({
  label,
  icon,
  isExpanded,
  onToggle,
  children,
  trailingContent,
}: {
  label: string;
  icon?: React.ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  /** Optional element rendered between the label and the chevron (e.g. preview price) */
  trailingContent?: React.ReactNode;
}) {
  return (
    <div className="px-4 pb-4">
      <div
        className="rounded-[10px] overflow-hidden"
        style={{ border: "1px solid var(--c-border-strong)" }}
      >
        {/* Header row */}
        <button
          onClick={onToggle}
          className="w-full flex items-center gap-2.5 px-3 py-3 transition-colors cursor-pointer"
          style={{ backgroundColor: "var(--c-surface-alt)" }}
        >
          {icon && (
            <div className="flex-shrink-0 flex items-center justify-center">
              {icon}
            </div>
          )}
          <span
            className="flex-1 text-left"
            style={{
              fontSize: "14px",
              fontWeight: 500,
              color: "var(--c-text-secondary)",
            }}
          >
            {label}
          </span>
          {trailingContent}
          <ChevronDown
            size={16}
            style={{ color: "var(--c-text-muted)", flexShrink: 0 }}
            className={`transition-transform ${isExpanded ? "rotate-180" : ""}`}
          />
        </button>

        {/* Expanded content */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div
                className="px-3 pb-3"
                style={{ backgroundColor: "var(--c-surface-alt)" }}
              >
                {/* Divider */}
                <div
                  className="mb-3"
                  style={{
                    height: "1px",
                    backgroundColor: "var(--c-border-strong)",
                  }}
                />
                {children}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
