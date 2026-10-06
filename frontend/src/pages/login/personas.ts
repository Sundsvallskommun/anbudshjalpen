/**
 * The demo login's two roles (direction.md, section 4 "Logga in (demo)"): who each persona is, what they can do, and
 * where they land. The backend names a persona "Anna Berg, Målerifirman i Matfors AB" or "Lars Holm, inköpare";
 * the cards show the name and the organisation on lines of their own.
 */
import type { Persona, Role } from "../../api/types";

export interface RoleCopy {
  /** The role as a word on the card ("Företagare"). */
  title: string;
  /** Three things the role can do in the demo. */
  abilities: readonly string[];
  /** The page the role lands on after logging in. */
  destination: string;
}

export const ROLE_COPY: Record<Role, RoleCopy> = {
  foretagare: {
    title: "Företagare",
    abilities: [
      "Se upphandlingar som verkar passa ert företag",
      "Förstå kraven och fråga underlaget",
      "Granska ditt anbudsutkast innan du lämnar in",
    ],
    destination: "Start",
  },
  inkopare: {
    title: "Inköpare",
    abilities: [
      "Granska checklistor som har tagits fram automatiskt",
      "Godkänn och publicera dem för företagen",
      "Se vilka frågor företagen ställer",
    ],
    destination: "Att granska",
  },
};

export interface PersonaIdentity {
  /** "Anna Berg". */
  name: string;
  /** "Anna": the button says "Fortsätt som Anna". */
  firstName: string;
  /** "Målerifirman i Matfors AB", or "Inköp, Sundsvalls kommun" for the buyer; null when unknown. */
  organization: string | null;
}

/**
 * The persona's name and organisation from its label. The buyer's label ends with the role word ("inköpare"), which
 * the card already shows, so the buyer's organisation is inköp at the municipality that runs the service.
 */
export function personaIdentity(persona: Persona, organizationName: string | undefined): PersonaIdentity {
  const [rawName = "", ...rest] = persona.label.split(",");
  const name = rawName.trim() || persona.label.trim();
  const after = rest.join(",").trim();
  const firstName = name.split(/\s+/u)[0] ?? name;
  if (persona.key === "inkopare") {
    return { name, firstName, organization: organizationName ? `Inköp, ${organizationName}` : "Inköp" };
  }
  const isRoleWord = after.toLocaleLowerCase("sv") === ROLE_COPY[persona.key].title.toLocaleLowerCase("sv");
  return { name, firstName, organization: after && !isRoleWord ? after : null };
}
