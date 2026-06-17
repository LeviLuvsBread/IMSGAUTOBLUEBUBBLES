// Shared Tailwind class strings for the auth screens (login, forgot, reset,
// 2FA verify) so they look identical. Safe to import from both server and
// client components — these are plain strings.
export const authInputCls =
  "w-full rounded-control bg-fill px-3 py-2.5 text-body outline-none transition-colors duration-fast ease-ios placeholder:text-label-secondary focus:bg-fill-secondary";

export const authButtonCls =
  "press w-full rounded-control bg-accent px-4 py-2.5 text-subhead font-semibold text-white transition-opacity disabled:opacity-50";
