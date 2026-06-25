import {
  Home,
  Inbox,
  PenSquare,
  Users,
  FileText,
  Megaphone,
  Clock,
  ListOrdered,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Single key used in the `g <key>` shortcut chord and shown in the palette. */
  key: string;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: Home, key: "h" },
  { href: "/inbox", label: "Inbox", icon: Inbox, key: "i" },
  { href: "/compose", label: "Compose", icon: PenSquare, key: "c" },
  { href: "/contacts", label: "Contacts", icon: Users, key: "k" },
  { href: "/templates", label: "Templates", icon: FileText, key: "t" },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone, key: "a" },
  { href: "/scheduler", label: "Scheduler", icon: Clock, key: "s" },
  { href: "/queue", label: "Queue", icon: ListOrdered, key: "q" },
  { href: "/settings", label: "Settings", icon: Settings, key: "," },
];
