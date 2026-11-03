/**
 * IntelliJ-style menu icons shared by several context menus, preserved
 * byte-for-byte from the pre-refactor inline components (v1.1.3).
 *
 * Do NOT swap these for codicon look-alikes — a codicon-only attempt
 * shipped wrong glyphs (Cherry-Pick showed a pull-request, Shelve showed
 * the Rollback arrow, …) and icons.test.tsx guards these shapes.
 *
 * Panel-only variants (the Git Log Commit menu's Copy / Revert, the File
 * menu's Copy) intentionally stay inline in their own menu files because
 * their original shapes differ from these.
 */

export function IconCherryPick() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="5" cy="11.5" r="2.5" stroke="currentColor" />
      <circle cx="10.5" cy="10.5" r="2.5" stroke="currentColor" />
      <path
        d="M5 9C5 6 4 4 7 2"
        stroke="currentColor"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M10.5 8C10.5 5.5 11 4 8 2"
        stroke="currentColor"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function IconDiff() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M5.85355 8.14645C5.65829 7.95118 5.34171 7.95118 5.14645 8.14645C4.95118 8.34171 4.95118 8.65829 5.14645 8.85355L7.29289 11H0.5C0.223858 11 0 11.2239 0 11.5C0 11.7761 0.223858 12 0.5 12H7.29289L5.14645 14.1464C4.95118 14.3417 4.95118 14.6583 5.14645 14.8536C5.34171 15.0488 5.65829 15.0488 5.85355 14.8536L8.85355 11.8536L9.20711 11.5L8.85355 11.1464L5.85355 8.14645Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M10.1464 1.14645C10.3417 0.951185 10.6583 0.951185 10.8536 1.14645C11.0488 1.34171 11.0488 1.65829 10.8536 1.85355L8.70711 4H15.5C15.7761 4 16 4.22386 16 4.5C16 4.77614 15.7761 5 15.5 5H8.70711L10.8536 7.14645C11.0488 7.34171 11.0488 7.65829 10.8536 7.85355C10.6583 8.04882 10.3417 8.04882 10.1464 7.85355L7.14645 4.85355L6.79289 4.5L7.14645 4.14645L10.1464 1.14645Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function IconEdit() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M11.5973 7.65471L13.6882 5.56049C14.1053 5.15406 14.1003 4.49602 13.6948 4.08627L12.0267 2.3136L12.0224 2.30932C11.6123 1.90004 10.942 1.89327 10.5331 2.31079L8.3867 4.44406M11.5973 7.65471L8.3867 4.44406M11.5973 7.65471L5.74041 13.5H2.50036L2.5 10.32L8.3867 4.44406"
        stroke="currentColor"
        strokeMiterlimit="10"
      />
    </svg>
  );
}

export function IconJump() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M8.5 1.5V11M8.5 1.5L5 5M8.5 1.5L12 5M2 14.5h13"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconUnshelve() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M11.3536 4.85355C11.5488 4.65829 11.5488 4.34171 11.3536 4.14645L8.35355 1.14645C8.15829 0.951184 7.84171 0.951184 7.64645 1.14645L4.64645 4.14645C4.45118 4.34171 4.45118 4.65829 4.64645 4.85355C4.84171 5.04882 5.15829 5.04882 5.35355 4.85355L7.5 2.70711L7.5 8.5C7.5 8.77614 7.72386 9 8 9C8.27614 9 8.5 8.77614 8.5 8.5V2.70711L10.6464 4.85355C10.8417 5.04882 11.1583 5.04882 11.3536 4.85355Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M4.77639 8.55279L5.5 10H10.5L11.2236 8.55279C11.393 8.214 11.7393 8 12.118 8H14C14.5523 8 15 8.44772 15 9V13C15 13.5523 14.5523 14 14 14H2C1.44772 14 1 13.5523 1 13V9C1 8.44772 1.44772 8 2 8H3.88197C4.26074 8 4.607 8.214 4.77639 8.55279ZM4.60557 10.4472C4.77496 10.786 5.12123 11 5.5 11H10.5C10.8788 11 11.225 10.786 11.3944 10.4472L12.118 9H14V13H2V9H3.88197L4.60557 10.4472Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function IconApply() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M14.431 3.323l-8.47 10-.79-.036-3.35-4.77.818-.574 2.978 4.24 8.051-9.506.763.646z"
        fill="currentColor"
      />
    </svg>
  );
}

export function IconDelete() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M7 2H9C9.55228 2 10 2.44772 10 3H6C6 2.44772 6.44772 2 7 2ZM5 3C5 1.89543 5.89543 1 7 1H9C10.1046 1 11 1.89543 11 3H13C13.5523 3 14 3.44772 14 4V5V6H13V13C13 14.1046 12.1046 15 11 15H5C3.89543 15 3 14.1046 3 13V6H2V5V4C2 3.44772 2.44772 3 3 3H5ZM11 4H10H6H5H3V5H4H12H13V4H11ZM4 6H12V13C12 13.5523 11.5523 14 11 14H5C4.44772 14 4 13.5523 4 13V6ZM6.5 7C6.22386 7 6 7.22386 6 7.5V11.5C6 11.7761 6.22386 12 6.5 12C6.77614 12 7 11.7761 7 11.5V7.5C7 7.22386 6.77614 7 6.5 7ZM9 7.5C9 7.22386 9.22386 7 9.5 7C9.77614 7 10 7.22386 10 7.5V11.5C10 11.7761 9.77614 12 9.5 12C9.22386 12 9 11.7761 9 11.5V7.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function IconCopyPath() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M4 4H1V15H11V12H4V4Z"
        fill="currentColor"
        fillOpacity="0.2"
      />
      <path d="M5 1H15V11H5V1Z" stroke="currentColor" strokeLinejoin="round" />
      <path
        d="M1 4.5V15H11.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconTag() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3 2.5h4.5l6 6-4.5 4.5-6-6V2.5z" stroke="currentColor" />
      <circle cx="5.5" cy="5" r="1" fill="currentColor" />
    </svg>
  );
}

export function IconBranch() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="4.5" cy="4" r="2" stroke="currentColor" />
      <path
        d="M4.5 11.5H8.5C9.6 11.5 10.5 10.6 10.5 9.5V8"
        stroke="currentColor"
      />
      <path d="M4.5 6.5V14.5" stroke="currentColor" strokeLinecap="round" />
      <circle cx="10.5" cy="6" r="2" stroke="currentColor" />
    </svg>
  );
}

export function IconPatch() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M7.99998 1C7.72383 1 7.49998 1.22386 7.49998 1.5V5.5H3.5C3.22386 5.5 3 5.72386 3 6C3 6.27614 3.22386 6.5 3.5 6.5H7.49998V10.5C7.49998 10.7761 7.72383 11 7.99998 11C8.27612 11 8.49998 10.7761 8.49998 10.5V6.5H12.5C12.7761 6.5 13 6.27614 13 6C13 5.72386 12.7761 5.5 12.5 5.5H8.49998V1.5C8.49998 1.22386 8.27612 1 7.99998 1Z"
        fill="currentColor"
      />
      <rect
        x="13"
        y="13"
        width="1"
        height="10"
        rx="0.5"
        transform="rotate(90 13 13)"
        fill="currentColor"
      />
    </svg>
  );
}

export function IconImport() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 2V10M8 10L5 7M8 10L11 7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2 12V13.5C2 14.0523 2.44772 14.5 3 14.5H13C13.5523 14.5 14 14.0523 14 13.5V12"
        stroke="currentColor"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconClipboardImport() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M5 2H4C3.44772 2 3 2.44772 3 3V13C3 13.5523 3.44772 14 5 14H11C11.5523 14 12 13.5523 12 13V12"
        stroke="currentColor"
        strokeLinecap="round"
      />
      <path
        d="M6 2.5C6 1.67157 6.67157 1 7.5 1H8.5C9.32843 1 10 1.67157 10 2.5V3H6V2.5Z"
        stroke="currentColor"
      />
      <path
        d="M10 7V11M10 11L8 9M10 11L12 9"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconShelve() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M4.64645 5.14645C4.45118 5.34171 4.45118 5.65829 4.64645 5.85355L7.64645 8.85355C7.84171 9.04882 8.15829 9.04882 8.35355 8.85355L11.3536 5.85355C11.5488 5.65829 11.5488 5.34171 11.3536 5.14645C11.1583 4.95118 10.8417 4.95118 10.6464 5.14645L8.5 7.29289V1.5C8.5 1.22386 8.27614 1 8 1C7.72386 1 7.5 1.22386 7.5 1.5V7.29289L5.35355 5.14645C5.15829 4.95118 4.84171 4.95118 4.64645 5.14645Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M4.77639 8.55279L5.5 10H10.5L11.2236 8.55279C11.393 8.214 11.7393 8 12.118 8H14C14.5523 8 15 8.44772 15 9V13C15 13.5523 14.5523 14 14 14H2C1.44772 14 1 13.5523 1 13V9C1 8.44772 1.44772 8 2 8H3.88197C4.26074 8 4.607 8.214 4.77639 8.55279ZM3.88197 9L4.88197 11H11.118L12.118 9H14V13H2V9H3.88197Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function IconRollback() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M5.85363 1.85355C6.04889 1.65829 6.04889 1.34171 5.85363 1.14645C5.65837 0.951184 5.34178 0.951184 5.14652 1.14645L1.64652 4.64645L1.29297 5L1.64652 5.35355L5.14652 8.85355C5.34178 9.04882 5.65837 9.04882 5.85363 8.85355C6.04889 8.65829 6.04889 8.34171 5.85363 8.14645L3.20718 5.5H10.5001C12.4331 5.5 14.0001 7.067 14.0001 9C14.0001 10.933 12.4331 12.5 10.5001 12.5H5.50008C5.22393 12.5 5.00008 12.7239 5.00008 13C5.00008 13.2761 5.22393 13.5 5.50008 13.5H10.5001C12.9854 13.5 15.0001 11.4853 15.0001 9C15.0001 6.51472 12.9854 4.5 10.5001 4.5H3.20718L5.85363 1.85355Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function IconFolderOpen() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M1.5 3.5C1.5 2.95 1.95 2.5 2.5 2.5H5.5L7 4H13.5C14.05 4 14.5 4.45 14.5 5V12.5C14.5 13.05 14.05 13.5 13.5 13.5H2.5C1.95 13.5 1.5 13.05 1.5 12.5V3.5Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconAdd() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M7.5 1C7.77614 1 8 1.22386 8 1.5V7H13.5C13.7761 7 14 7.22386 14 7.5C14 7.77614 13.7761 8 13.5 8H8V13.5C8 13.7761 7.77614 14 7.5 14C7.22386 14 7 13.7761 7 13.5V8H1.5C1.22386 8 1 7.77614 1 7.5C1 7.22386 1.22386 7 1.5 7H7V1.5C7 1.22386 7.22386 1 7.5 1Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function IconRemove() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M1 7.5C1 7.77614 1.22386 8 1.5 8L13.5 8C13.7761 8 14 7.77614 14 7.5C14 7.22386 13.7761 7 13.5 7L1.5 7C1.22386 7 1 7.22386 1 7.5Z"
        fill="currentColor"
      />
    </svg>
  );
}
export function IconLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M6.3464 3.64645C6.54166 3.45118 6.85824 3.45118 7.0535 3.64645C7.24877 3.84171 7.24877 4.15829 7.0535 4.35355L3.90352 7.50354L13.5035 7.50354C13.7797 7.50354 14.0035 7.7274 14.0035 8.00354C14.0035 8.27968 13.7797 8.50354 13.5035 8.50354L3.91059 8.50354L7.05351 11.6464C7.24877 11.8417 7.24877 12.1583 7.05351 12.3536C6.85824 12.5488 6.54166 12.5488 6.3464 12.3536L2.3464 8.35355L1.99284 8L2.3464 7.64645L6.3464 3.64645Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function IconRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M9.65355 12.3536C9.45829 12.5488 9.14171 12.5488 8.94645 12.3536C8.75118 12.1583 8.75118 11.8417 8.94645 11.6464L12.0894 8.50354L2.49646 8.50354C2.22032 8.50354 1.99646 8.27968 1.99646 8.00354C1.99646 7.7274 2.22032 7.50354 2.49646 7.50354L12.0964 7.50354L8.94645 4.35355C8.75118 4.15829 8.75118 3.84171 8.94645 3.64645C9.14171 3.45118 9.45829 3.45118 9.65355 3.64645L13.6536 7.64645L14.0071 8L13.6536 8.35355L9.65355 12.3536Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** JetBrains help.svg — question mark used by confirm dialogs. */
export function IconHelp() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="7.79995" cy="14.15" r="0.85" fill="currentColor" />
      <path
        d="M7.97962 8.25128C8.20415 8.01392 8.49793 7.73622 8.8602 7.41844C9.23243 7.09036 9.52729 6.80791 9.74572 6.57075L9.74668 6.56973C9.96622 6.33799 10.1503 6.0594 10.2982 5.73275L10.2988 5.73133C10.45 5.4108 10.5268 5.0457 10.5268 4.634C10.5268 4.13537 10.4222 3.69607 10.2158 3.31349C10.0093 2.93099 9.71876 2.63442 9.34261 2.42208L9.34155 2.42149C8.96585 2.20334 8.53389 2.093 8.04277 2.093C7.53263 2.093 7.08144 2.20651 6.68653 2.43124C6.29797 2.65595 5.9944 2.97134 5.77499 3.3796C5.67273 3.57247 5.59473 3.77918 5.54126 4C5.51644 4.10252 5.49691 4.20808 5.48269 4.31671C5.44318 4.61868 5.20739 4.867 4.90285 4.867H4.77896C4.47828 4.867 4.23781 4.61717 4.24929 4.31671C4.25956 4.2093 4.27359 4.10373 4.2914 4C4.36501 3.57119 4.50313 3.17391 4.7064 2.80885C5.03226 2.23534 5.4864 1.7906 6.06642 1.47769C6.64663 1.15834 7.30949 1 8.05227 1C8.77568 1 9.4194 1.15185 9.98062 1.45842C10.5475 1.75827 10.9888 2.17975 11.3023 2.72194C11.6162 3.26467 11.7718 3.88719 11.7718 4.5865C11.7718 5.13576 11.6813 5.62465 11.4976 6.05106C11.3166 6.47121 11.0924 6.82638 10.8239 7.11469C10.567 7.39722 10.2283 7.71973 9.80882 8.08202C9.47419 8.37245 9.2138 8.61414 9.02667 8.8075C8.85057 8.98968 8.70116 9.20284 8.57871 9.44772L8.57826 9.44864C8.4595 9.6802 8.39927 9.93983 8.39927 10.2295C8.39927 10.4946 8.18437 10.7095 7.91927 10.7095H7.71977C7.42844 10.7095 7.19227 10.4733 7.19227 10.182C7.19227 9.77678 7.26749 9.41044 7.42025 9.08501C7.57001 8.76595 7.75635 8.48769 7.97962 8.25128Z"
        fill="currentColor"
      />
    </svg>
  );
}
