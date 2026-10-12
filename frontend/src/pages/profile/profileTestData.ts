/**
 * Test data for the profile page: the demo company as GET /api/profile returns it. Fictitious, like every fixture
 * (src/test/fixtures.ts); only the profile tests import it.
 */
import type { CompanyView } from "../../api/types";
import { companyUser } from "../../test/fixtures";

export const profileView: CompanyView = {
  id: companyUser.company?.id ?? "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
  org_number: "559900-0013",
  name: "Målerifirman i Matfors AB",
  description:
    "Vi är en målerifirma i Matfors med fem anställda. Vi målar invändigt och utvändigt och renoverar fasader.",
  cpv_codes: ["45442100"],
  cpv_labels: { "45442100": "Målning" },
  cpv_divisions: { "45000000": "Anläggningsarbete", "90000000": "Avlopps- och avfallshantering, sanering och miljötjänster" },
  municipalities: ["Sundsvall", "Timrå"],
  employees: 5,
  annual_turnover_sek: 4_800_000,
  certifications: [],
  insurance: "Ansvarsförsäkring 5 000 000 kronor per skadetillfälle",
  public_references: "Underentreprenör vid ommålning av korridorer i en skola i Timrå 2025.",
  is_fictitious: true,
};
