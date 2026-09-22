import { PlayScreen } from "@/components/play/play-screen";
import { DEFAULT_ROOM_CODE } from "@/lib/bingo";

export default async function PlayPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  return <PlayScreen code={code || DEFAULT_ROOM_CODE} />;
}
