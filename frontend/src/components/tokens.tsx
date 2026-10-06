import { Icon } from "@astryxdesign/core/Icon";
import { Token } from "@astryxdesign/core/Token";
import type { CheckStatus, ChecklistStatus, Fit, NoticeStatus } from "../api/types";
import { CHECK_STATUS, CHECKLIST_STATUS, FIT, NOTICE_STATUS, PUBLISHED_CHECKLIST } from "../lib/labels";

/**
 * The status tokens. Colour carries meaning (direction.md, section 5): green is good, yellow asks for attention, red
 * is missing or wrong, grey is descriptive metadata. Every status also has its own icon and its words, so it never
 * depends on colour alone (WCAG 1.4.1). Lila, cyan, teal and orange are not used for status.
 */
type TokenColor = "green" | "yellow" | "gray" | "red" | "blue";
type SemanticIcon = "success" | "warning" | "close" | "error" | "info" | "clock";
type TokenSize = "sm" | "md";

interface Look {
  color: TokenColor;
  icon: SemanticIcon;
}

function StatusLook({ label, look, size }: { label: string; look: Look; size?: TokenSize }) {
  return <Token label={label} color={look.color} size={size} icon={<Icon icon={look.icon} size="sm" />} />;
}

const FIT_LOOK: Record<Fit, Look> = {
  passar: { color: "green", icon: "success" },
  passar_delvis: { color: "yellow", icon: "warning" },
  passar_inte: { color: "gray", icon: "close" },
};

/** How well a notice seems to fit the company: Verkar passa · Passar delvis · Verkar inte passa. */
export function FitToken({ fit, size }: { fit: Fit; size?: TokenSize }) {
  return <StatusLook label={FIT[fit]} look={FIT_LOOK[fit]} size={size} />;
}

const CHECK_LOOK: Record<CheckStatus, Look> = {
  saknas: { color: "red", icon: "error" },
  obevisat: { color: "yellow", icon: "warning" },
  oklart: { color: "gray", icon: "info" },
  uppfyllt: { color: "green", icon: "success" },
};

/**
 * A draft review's verdict for one requirement (Hittades inte · Bevis saknas · Kontrollera själv · Ser bra ut), or
 * with `count` how many requirements got it ("Hittades inte: 3").
 */
export function StatusToken({ status, count, size }: { status: CheckStatus; count?: number; size?: TokenSize }) {
  const label = count === undefined ? CHECK_STATUS[status] : `${CHECK_STATUS[status]}: ${count}`;
  return <StatusLook label={label} look={CHECK_LOOK[status]} size={size} />;
}

/** Marks demo data that is made up, wherever it is shown: grey metadata with an info icon. */
export function FictitiousToken({ size }: { size?: TokenSize }) {
  return (
    <Token
      label="Fiktiv"
      color="gray"
      size={size}
      icon={<Icon icon="info" size="sm" />}
      description="Påhittade uppgifter för demonstrationen"
    />
  );
}

/** A notice whose checklist inköp has reviewed and published: the full help (krav, frågor, granskning). */
export function PublishedChecklistToken({ size }: { size?: TokenSize }) {
  return <StatusLook label={PUBLISHED_CHECKLIST} look={{ color: "green", icon: "success" }} size={size} />;
}

/** A deadline seven days away or closer that is still open. */
export function ClosingSoonToken({ label = "Stänger snart", size }: { label?: string; size?: TokenSize }) {
  return <StatusLook label={label} look={{ color: "yellow", icon: "clock" }} size={size} />;
}

const NOTICE_LOOK: Record<NoticeStatus, Look | null> = {
  // Open for tenders is the normal state of a notice and gets no token (direction.md, section 4).
  open: null,
  planned: { color: "gray", icon: "clock" },
  awarded: { color: "gray", icon: "info" },
  closed: { color: "gray", icon: "close" },
};

/**
 * A notice's status as descriptive metadata. Open notices get no token unless `showOpen` asks for one, since being
 * open for tenders is the normal state.
 */
export function NoticeStatusToken({ status, showOpen = false, size }: { status: NoticeStatus; showOpen?: boolean; size?: TokenSize }) {
  const look = NOTICE_LOOK[status] ?? (showOpen ? { color: "gray" as const, icon: "info" as const } : null);
  if (!look) return null;
  return <StatusLook label={NOTICE_STATUS[status]} look={look} size={size} />;
}

const CHECKLIST_LOOK: Record<ChecklistStatus, Look> = {
  none: { color: "gray", icon: "info" },
  draft: { color: "yellow", icon: "warning" },
  approved: { color: "blue", icon: "info" },
  published: { color: "green", icon: "success" },
  rejected: { color: "red", icon: "error" },
};

/** Where a checklist is in inköp's review (Utkast → Godkänd → Publicerad, or Avvisad). */
export function ChecklistStatusToken({ status, size }: { status: ChecklistStatus; size?: TokenSize }) {
  return <StatusLook label={CHECKLIST_STATUS[status]} look={CHECKLIST_LOOK[status]} size={size} />;
}
