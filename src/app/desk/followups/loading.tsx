import { HeaderSkeleton, ThreadSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div>
      <HeaderSkeleton />
      <ThreadSkeleton count={6} />
    </div>
  );
}
