import { Banner } from "@astryxdesign/core/Banner";
import type { LabInfo } from "../../api/types";
import { formatLongDate } from "../../lib/format";
import { LAB_WARNING } from "../login/LabCard";

/**
 * What a participant needs to know about their lab company (decision 0010): how to find it again, when it is
 * deleted, and that nothing personal or secret belongs here.
 */
export function LabBanner({ lab }: { lab: LabInfo }) {
  return (
    <Banner
      status="info"
      title="Det här är ditt testföretag"
      description={`${LAB_WARNING} Du hittar företaget igen under Logga in. Raderas ${formatLongDate(lab.expires_at)}.`}
      collapsible={false}
    />
  );
}
