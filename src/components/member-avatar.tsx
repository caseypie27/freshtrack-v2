export function MemberAvatar({
  name,
  url,
  size = "md",
}: {
  name: string;
  url?: string | null;
  size?: "xs" | "md";
}) {
  const cls = size === "xs" ? "size-5 text-[9px]" : "size-10 text-sm";
  return url ? (
    <img src={url} alt={name} className={`${cls} rounded-full object-cover ring-2 ring-surface`} />
  ) : (
    <span
      className={`${cls} rounded-full bg-primary-soft text-primary font-semibold grid place-items-center ring-2 ring-surface shrink-0`}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
