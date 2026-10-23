import { HeaderSkeleton, ThreadSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div>
      <HeaderSkeleton action />
      <ThreadSkeleton count={5} />
    </div>
  );
}
