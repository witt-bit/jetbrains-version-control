import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "../shared/i18n";

export interface SearchableSelectOption {
  value: string;
  label: string;
  group?: string;
}

interface Props {
  options: SearchableSelectOption[];
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}

export function SearchableSelect({
  options,
  value,
  placeholder = "Select...",
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  const selectedLabel = options.find((o) => o.value === value)?.label || "";

  const handleOpen = useCallback(() => {
    setOpen(true);
    setQuery("");
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const handleSelect = useCallback(
    (v: string) => {
      onChange(v);
      setOpen(false);
      setQuery("");
    },
    [onChange],
  );

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  };

  return (
    <div ref={rootRef} className="ss-select-root">
      <div className="ss-select-display" onClick={handleOpen}>
        <span className={selectedLabel ? "" : "ss-placeholder"}>
          {selectedLabel || placeholder}
        </span>
      </div>

      {open && (
        <div className="ss-select-dropdown">
          <div className="ss-select-search">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="ss-select-search-input"
            />
          </div>
          <div ref={listRef} className="ss-select-list">
            {filtered.length === 0 && (
              <div className="ss-select-empty">{t("worktree.noMatches")}</div>
            )}
            {filtered.map((opt) => (
              <div
                key={opt.value}
                className={`ss-select-item ${opt.value === value ? "selected" : ""}`}
                onClick={() => handleSelect(opt.value)}
              >
                {opt.group && (
                  <span className="ss-select-item-group">{opt.group}</span>
                )}
                {opt.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
