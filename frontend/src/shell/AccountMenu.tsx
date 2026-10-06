import { Avatar } from "@astryxdesign/core/Avatar";
import { Button } from "@astryxdesign/core/Button";
import { useMediaQuery } from "@astryxdesign/core/hooks";
import { HStack } from "@astryxdesign/core/HStack";
import { Item } from "@astryxdesign/core/Item";
import { Popover } from "@astryxdesign/core/Popover";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useLogout } from "../api/queries";
import type { UserView } from "../api/types";
import { errorMessage } from "../components/states";
import { AppearanceControl } from "./AppearanceControl";

/** Who the user is acting as: the company's name, or inköp. */
export function accountContext(user: UserView): string {
  return user.company?.name ?? "Inköp";
}

interface MenuLink {
  label: string;
  href: string;
}

/** The account menu's destinations per role (direction.md, section 3). */
export function accountLinks(user: UserView): MenuLink[] {
  if (user.role === "foretagare") {
    return [
      { label: "Företagsprofil", href: "/profil" },
      { label: "Påminnelser", href: "/paminnelser" },
    ];
  }
  return [{ label: "Drift", href: "/inkop/drift" }];
}

function MenuContent({ user, onClose }: { user: UserView; onClose: () => void }) {
  const logout = useLogout();
  const navigate = useNavigate();
  return (
    <VStack gap={2} padding={2}>
      <VStack gap={0} paddingInline={2} paddingBlock={1}>
        <Text weight="semibold">{user.name}</Text>
        <Text type="supporting">{accountContext(user)}</Text>
      </VStack>
      <VStack paddingInline={2} paddingBlock={1}>
        <AppearanceControl layout="stacked" />
      </VStack>
      <VStack as="ul" role="list" gap={0}>
        {accountLinks(user).map((link) => (
          <Item key={link.href} as="li" label={link.label} href={link.href} density="balanced" />
        ))}
        <Item
          as="li"
          label={logout.isPending ? "Loggar ut …" : "Logga ut"}
          density="balanced"
          onClick={() =>
            logout.mutate(undefined, {
              onSuccess: () => {
                onClose();
                navigate("/upphandlingar");
              },
            })
          }
        />
      </VStack>
      {logout.isError && (
        <Text type="supporting" role="alert">
          {errorMessage(logout.error)}
        </Text>
      )}
    </VStack>
  );
}

/**
 * The avatar button at the end of the top bar ("AB"), with the name and company beside it on a wide screen. It opens a
 * popover with Utseende, the account's places (Företagsprofil and Påminnelser, or Drift for inköp) and "Logga ut", and closes
 * when the user goes somewhere. The avatar is 48 px with a finger (the design system has no 44).
 */
export function AccountMenu({ user, isWide }: { user: UserView; isWide: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const { pathname } = useLocation();
  const isCoarse = useMediaQuery("(pointer: coarse)");

  useEffect(() => setIsOpen(false), [pathname]);

  return (
    <HStack gap={2} vAlign="center">
      {isWide && (
        <VStack gap={0} hAlign="end">
          <Text type="supporting" color="primary" weight="semibold">
            {user.name}
          </Text>
          <Text type="supporting">{accountContext(user)}</Text>
        </VStack>
      )}
      <Popover
        label="Konto"
        placement="below"
        alignment="end"
        width={280}
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        content={<MenuContent user={user} onClose={() => setIsOpen(false)} />}
      >
        <Avatar
          name={user.name}
          alt={`Konto: ${user.name}, ${accountContext(user)}`}
          size={isCoarse ? 48 : 36}
          tooltip={false}
          onClick={() => undefined}
        />
      </Popover>
    </HStack>
  );
}

/** "Logga in" for a visitor, back to the page they were on; hidden on the login page itself. */
export function LoginButton() {
  const { pathname, search } = useLocation();
  if (pathname === "/logga-in") return null;
  return <Button label="Logga in" variant="primary" href={`/logga-in?till=${encodeURIComponent(pathname + search)}`} />;
}
