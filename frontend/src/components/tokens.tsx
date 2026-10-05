import { Icon } from "@astryxdesign/core/Icon";
import { Token } from "@astryxdesign/core/Token";
import type { CheckStatus, ChecklistStatus, Fit, NoticeStatus } from "../api/types";
import { CHECK_STATUS, CHECKLIST_STATUS, FIT, NOTICE_STATUS } from "../lib/labels";

type TokenColor = "green" | "yellow" | "gray" | "blue" | "purple" | "teal" | "orange" | "red" | "cyan";
type SemanticIcon = "success" | "warning" | "close" | "error" | "info";

// Each status has its own icon as well as its own colour, so it never depends on colour alone (WCAG 1.4.1).
const FIT_LOOK: Record<Fit, { color: TokenColor; icon: SemanticIcon }> = {
  passar: { color: "green", icon: "success" },
  passar_delvis: { color: "yellow", icon: "warning" },
  passar_inte: { color: "gray", icon: "close" },
};

/** How well a notice fits the company: Passar / Passar delvis / Passar inte. */
export function FitToken({ fit }: { fit: Fit }) {
  const look = FIT_LOOK[fit];
  return <Token label={FIT[fit]} color={look.color} icon={<Icon icon={look.icon} size="sm" />} />;
}

const NOTICE_COLOR: Record<NoticeStatus, TokenColor> = {
  open: "blue",
  planned: "purple",
  awarded: "teal",
  closed: "gray",
};

export function NoticeStatusToken({ status }: { status: NoticeStatus }) {
  return <Token label={NOTICE_STATUS[status]} color={NOTICE_COLOR[status]} />;
}

/** Marks demo data that is made up, wherever it is shown. */
export function FictitiousToken() {
  return <Token label="Fiktiv" color="orange" description="Påhittade uppgifter för demonstration" />;
}

const CHECKLIST_COLOR: Record<ChecklistStatus, TokenColor> = {
  none: "gray",
  draft: "yellow",
  approved: "blue",
  published: "green",
  rejected: "red",
};

export function ChecklistStatusToken({ status }: { status: ChecklistStatus }) {
  return <Token label={CHECKLIST_STATUS[status]} color={CHECKLIST_COLOR[status]} />;
}

const CHECK_LOOK: Record<CheckStatus, { color: TokenColor; icon: SemanticIcon }> = {
  uppfyllt: { color: "green", icon: "success" },
  obevisat: { color: "yellow", icon: "warning" },
  saknas: { color: "red", icon: "error" },
  oklart: { color: "gray", icon: "info" },
};

/** A draft review's verdict for one requirement, or with `count` how many requirements got it. */
export function CheckStatusToken({ status, count }: { status: CheckStatus; count?: number }) {
  const look = CHECK_LOOK[status];
  const label = count === undefined ? CHECK_STATUS[status] : `${CHECK_STATUS[status]}: ${count}`;
  return <Token label={label} color={look.color} icon={<Icon icon={look.icon} size="sm" />} />;
}
