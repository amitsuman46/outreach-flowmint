import { CardSkeleton } from "@/components/skeletons";
import { Card, Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div>
      <Skeleton className="h-3.5 w-40" />
      <div className="mt-4 mb-6 flex items-center gap-4">
        <Skeleton className="size-12 rounded-2xl" />
        <div className="space-y-2.5">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <Skeleton className="aspect-[16/10] rounded-none" />
          </Card>
          <CardSkeleton lines={5} />
        </div>
        <div className="space-y-4">
          <CardSkeleton lines={3} />
          <CardSkeleton lines={8} />
        </div>
      </div>
    </div>
  );
}
