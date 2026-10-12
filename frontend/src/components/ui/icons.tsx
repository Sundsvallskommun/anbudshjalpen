import type { SVGProps } from "react";

/**
 * The app's own glyphs, for what the design system's semantic icons do not cover. Draw them through Icon so they
 * size, colour and hide from assistive technology like every other icon: `<Icon icon={DocumentIcon} />`. They are
 * stroke icons on a 24 grid in the current colour, matching the semantic set.
 */
type IconSvgProps = SVGProps<SVGSVGElement>;

function StrokeIcon({ children, ...props }: IconSvgProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

/** A document: the procurement documents ("Underlaget · 17 sidor"), an attachment. */
export function DocumentIcon(props: IconSvgProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
    </StrokeIcon>
  );
}

/** A conversation with the AI support ("Fråga AI"). */
export function ChatIcon(props: IconSvgProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M21 11.5a8 8 0 0 1-8.5 8H9l-5 3.5v-6.3A8 8 0 0 1 12.5 3.5h.5a8 8 0 0 1 8 8z" />
      <path d="M9 11.5h6" />
    </StrokeIcon>
  );
}

/** Remove something the user owns ("Ta bort" a reminder). */
export function TrashIcon(props: IconSvgProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M4 7h16" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
      <path d="M9 7V4h6v3" />
    </StrokeIcon>
  );
}

/** Save a file to the device ("Ladda ned" the procurement documents). */
export function DownloadIcon(props: IconSvgProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M12 4v11" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 20h14" />
    </StrokeIcon>
  );
}

/** Send a file from the device ("Granska en ny version" of a draft, the upload area). */
export function UploadIcon(props: IconSvgProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M12 15V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M5 20h14" />
    </StrokeIcon>
  );
}

/** Forward to the next place ("Öppna checklistan", "Visa alla upphandlingar"). */
export function ArrowRightIcon(props: IconSvgProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </StrokeIcon>
  );
}

/** Make a panel larger ("Förstora panelen" in Fråga AI). */
export function ExpandIcon(props: IconSvgProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M14 4h6v6" />
      <path d="M20 4l-7 7" />
      <path d="M10 20H4v-6" />
      <path d="M4 20l7-7" />
    </StrokeIcon>
  );
}

/** Make a panel smaller again ("Förminska panelen" in Fråga AI). */
export function CollapseIcon(props: IconSvgProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M19 11h-6V5" />
      <path d="M13 11l7-7" />
      <path d="M5 13h6v6" />
      <path d="M11 13l-7 7" />
    </StrokeIcon>
  );
}
