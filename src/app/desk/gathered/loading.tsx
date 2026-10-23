import { HeaderSkeleton, TableSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div>
      <HeaderSkeleton />
      <div className="mb-4 flex flex-wrap gap-2">
        <Skeleton className="h-10 w-72 rounded-xl" />
        <Skeleton className="h-10 w-80 rounded-xl" />
      </div>
      <TableSkeleton rows={9} />
    </div>
  );
}
