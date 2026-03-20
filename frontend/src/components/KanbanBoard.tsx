import { useState, useCallback } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Prospect, ProspectStatus } from "@/api/prospects";
import ProspectCard from "./ProspectCard";
import { STATUS_LABELS } from "@/lib/utils";
import { cn } from "@/lib/utils";

const COLUMNS: ProspectStatus[] = ["new", "contacted", "interested", "demo", "won", "lost"];

const COLUMN_COLORS: Record<string, string> = {
  new: "border-slate-300",
  contacted: "border-blue-300",
  interested: "border-amber-300",
  demo: "border-purple-300",
  won: "border-green-400",
  lost: "border-red-300",
};

const COLUMN_HEADER_COLORS: Record<string, string> = {
  new: "bg-slate-100 text-slate-700",
  contacted: "bg-blue-50 text-blue-700",
  interested: "bg-amber-50 text-amber-700",
  demo: "bg-purple-50 text-purple-700",
  won: "bg-green-50 text-green-700",
  lost: "bg-red-50 text-red-700",
};

interface SortableCardProps {
  prospect: Prospect;
  onClick: () => void;
}

function SortableCard({ prospect, onClick }: SortableCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: prospect.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
    >
      <ProspectCard prospect={prospect} onClick={onClick} isDragging={isDragging} />
    </div>
  );
}

function DroppableColumn({
  status,
  prospects,
  onCardClick,
}: {
  status: ProspectStatus;
  prospects: Prospect[];
  onCardClick: (p: Prospect) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col min-h-0 w-64 shrink-0 rounded-xl border-t-2",
        COLUMN_COLORS[status],
        isOver && "ring-2 ring-blue-400 ring-offset-1"
      )}
    >
      {/* Column header */}
      <div className={cn("flex items-center justify-between px-3 py-2 rounded-t-xl", COLUMN_HEADER_COLORS[status])}>
        <span className="text-xs font-semibold">{STATUS_LABELS[status]}</span>
        <span className="text-xs bg-white/70 rounded-full px-2 py-0.5 font-medium">
          {prospects.length}
        </span>
      </div>

      {/* Cards */}
      <div className="kanban-column flex-1 overflow-y-auto p-2 space-y-2 bg-slate-50/50 rounded-b-xl min-h-16">
        <SortableContext items={prospects.map((p) => p.id)} strategy={verticalListSortingStrategy}>
          {prospects.map((p) => (
            <SortableCard key={p.id} prospect={p} onClick={() => onCardClick(p)} />
          ))}
        </SortableContext>
        {prospects.length === 0 && (
          <div className="flex items-center justify-center h-16 text-xs text-slate-400">
            Glisser ici
          </div>
        )}
      </div>
    </div>
  );
}

interface Props {
  prospects: Prospect[];
  onStatusChange: (id: number, status: ProspectStatus) => Promise<void>;
  onCardClick: (p: Prospect) => void;
}

export default function KanbanBoard({ prospects, onStatusChange, onCardClick }: Props) {
  const [activeId, setActiveId] = useState<number | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const byStatus = useCallback(
    (status: ProspectStatus) => prospects.filter((p) => p.status === status),
    [prospects]
  );

  const activeProspect = activeId ? prospects.find((p) => p.id === activeId) : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as number);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const prospectId = active.id as number;
    const targetStatus = over.id as ProspectStatus;

    if (COLUMNS.includes(targetStatus)) {
      const prospect = prospects.find((p) => p.id === prospectId);
      if (prospect && prospect.status !== targetStatus) {
        await onStatusChange(prospectId, targetStatus);
      }
    }
  };

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 h-full overflow-x-auto pb-4 px-1">
        {COLUMNS.map((status) => (
          <DroppableColumn
            key={status}
            status={status}
            prospects={byStatus(status)}
            onCardClick={onCardClick}
          />
        ))}
      </div>
      <DragOverlay>
        {activeProspect && <ProspectCard prospect={activeProspect} isDragging />}
      </DragOverlay>
    </DndContext>
  );
}
