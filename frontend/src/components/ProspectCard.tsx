import { Prospect } from "@/api/prospects";
import { STATUS_LABELS, STATUS_COLORS, SOURCE_LABELS, icpColor, NAF_LABELS } from "@/lib/utils";
import { MapPin, Phone, Mail, Star, Globe, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  prospect: Prospect;
  onClick?: () => void;
  isDragging?: boolean;
}

const SOURCE_ICONS: Record<string, string> = {
  google_maps: "🗺️",
  pages_jaunes: "📒",
  sirene: "🏛️",
  linkedin: "💼",
  manual: "✏️",
};

export default function ProspectCard({ prospect, onClick, isDragging }: Props) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-white border border-slate-200 rounded-lg p-3 cursor-pointer transition-all select-none",
        "hover:border-blue-300 hover:shadow-sm",
        isDragging && "shadow-lg rotate-1 opacity-90"
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate leading-tight">
            {prospect.raison_sociale}
          </p>
          {prospect.nom_commercial && prospect.nom_commercial !== prospect.raison_sociale && (
            <p className="text-xs text-slate-500 truncate">{prospect.nom_commercial}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-xs" title={SOURCE_LABELS[prospect.source]}>
            {SOURCE_ICONS[prospect.source] ?? "•"}
          </span>
          <span className={cn("text-xs font-bold tabular-nums", icpColor(prospect.icp_score))}>
            {prospect.icp_score}
          </span>
        </div>
      </div>

      {/* Location */}
      {prospect.ville && (
        <div className="flex items-center gap-1 text-xs text-slate-500 mb-1.5">
          <MapPin size={11} />
          <span>{prospect.code_postal && `${prospect.code_postal} `}{prospect.ville}</span>
        </div>
      )}

      {/* NAF */}
      {prospect.code_naf && (
        <div className="flex items-center gap-1 text-xs text-slate-500 mb-1.5">
          <Building2 size={11} />
          <span>{NAF_LABELS[prospect.code_naf] ?? prospect.code_naf}</span>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100">
        <div className="flex gap-1.5">
          {prospect.tel && (
            <span title={prospect.tel} className="w-5 h-5 rounded bg-slate-100 flex items-center justify-center">
              <Phone size={10} className="text-slate-500" />
            </span>
          )}
          {prospect.email && (
            <span title={prospect.email} className={cn(
              "w-5 h-5 rounded flex items-center justify-center",
              prospect.email_verified ? "bg-green-100" : "bg-slate-100"
            )}>
              <Mail size={10} className={prospect.email_verified ? "text-green-600" : "text-slate-500"} />
            </span>
          )}
          {prospect.site_web && (
            <span title={prospect.site_web} className="w-5 h-5 rounded bg-slate-100 flex items-center justify-center">
              <Globe size={10} className="text-slate-500" />
            </span>
          )}
          {prospect.google_rating && (
            <span className="flex items-center gap-0.5 text-xs text-amber-500">
              <Star size={10} fill="currentColor" />
              {prospect.google_rating}
            </span>
          )}
        </div>
        {prospect.tags && prospect.tags.length > 0 && (
          <div className="flex gap-1 ml-auto">
            {prospect.tags.slice(0, 2).map((tag) => (
              <span key={tag} className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
