import type { TelegramUser } from "@/lib/telegram";

function initials(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "K";
}

export function UserChip({
  user,
  compact = false,
}: {
  user: Pick<TelegramUser, "first_name" | "photo_url"> & { firstName?: string };
  compact?: boolean;
}) {
  const name = user.first_name || user.firstName || "Player";

  return (
    <div
      className={`flex items-center gap-2 rounded-full bg-surface ${compact ? "py-0.5 pr-2 pl-0.5" : "py-1 pr-3 pl-1"}`}
    >
      {user.photo_url ? (
        // Telegram CDN avatars; next/image is not configured for that host.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.photo_url}
          alt=""
          width={compact ? 24 : 28}
          height={compact ? 24 : 28}
          className={`${compact ? "size-6" : "size-7"} rounded-full object-cover`}
        />
      ) : (
        <span
          className={`grid place-items-center rounded-full bg-theme font-bold text-on-theme ${compact ? "size-6 text-[10px]" : "size-7 text-xs"}`}
        >
          {initials(name)}
        </span>
      )}
      <span
        className={`truncate font-medium text-foreground ${compact ? "max-w-20 text-xs" : "max-w-28 text-sm"}`}
      >
        {name}
      </span>
    </div>
  );
}
