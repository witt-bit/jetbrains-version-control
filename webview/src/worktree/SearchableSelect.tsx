import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

export interface SearchableSelectOption {
  value: string;
  label: string;
  group?: string;
  /** Marker drawn before the label in the dropdown (branch, tag …). */
  icon?: ReactNode;
  /** Shown dimmed after the label, in the list and in the display box. */
  suffix?: string;
}

interface Props {
  options: SearchableSelectOption[];
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  /** Extra content after the selected label, dimmed (e.g. a worktree name). */
  selectedSuffix?: string;
}

export function SearchableSelect({
  options,
  value,
  placeholder = "Select...",
  onChange,
  selectedSuffix,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  const selected = options.find((o) => o.value === value);
  const selectedLabel = selected?.label || "";
  const displaySuffix = selectedSuffix ?? selected?.suffix;

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
        {selected?.icon && (
          <span className="ss-select-display-icon">{selected.icon}</span>
        )}
        <span className={selectedLabel ? "" : "ss-placeholder"}>
          {selectedLabel || placeholder}
        </span>
        {selectedLabel && displaySuffix && (
          <span className="ss-select-display-suffix">{displaySuffix}</span>
        )}
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
              <div className="ss-select-empty">No matches</div>
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
                {opt.icon && (
                  <span className="ss-select-item-icon">{opt.icon}</span>
                )}
                <span className="ss-select-item-label">{opt.label}</span>
                {opt.suffix && (
                  <span className="ss-select-item-suffix">{opt.suffix}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
